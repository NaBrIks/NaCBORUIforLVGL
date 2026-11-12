# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Oleg Kozhevnikov
"""Run the saved benchmark images on a specifically identified S3 factory slot."""
import argparse
import hashlib
import json
import re
import struct
import subprocess
import time
import zlib
from pathlib import Path

import serial
from serial.tools.list_ports import comports

PROFILES = (
    "board", "direct-repeat", "cbor-repeat", "direct-mixed", "cbor-mixed", "pages", "data",
    "schemes", "history", "filesystem", "wifi", "http", "editor", "full",
)
APP_CAPACITY = 0x500000


def identify(port, expected_serial):
    for device in comports():
        if device.device.upper() == port.upper() and (device.vid, device.pid) == (0x303A, 0x1001):
            if (device.serial_number or "").casefold() == expected_serial.casefold():
                return
    raise RuntimeError("The expected ESP32-S3 USB device is absent")


def flash(args, operation, log, *values):
    for attempt in range(3):
        try:
            identify(args.port, args.usb_serial)
            with log.open("ab") as output:
                subprocess.run(
                    [args.esptool, "--chip", "esp32s3", "--port", args.port, "--baud", "1500000",
                     operation, *map(str, values)],
                    stdout=output, stderr=subprocess.STDOUT, check=True, timeout=180,
                )
            time.sleep(1.5)
            return
        except (RuntimeError, subprocess.CalledProcessError):
            if attempt == 2:
                raise
            time.sleep(2)


def capture(args, profile, run, output):
    log = output / f"uart-{run}.log"
    deadline = time.monotonic() + 42
    data = bytearray()
    options = serial.Serial(baudrate=115200, timeout=0.3)
    options.dtr = False
    options.rts = False
    options.port = args.port
    try:
        while time.monotonic() < deadline:
            try:
                if not options.is_open:
                    options.open()
                data.extend(options.read(4096))
                if f"BENCH_DONE profile={profile}\r\n".encode() in data or f"BENCH_DONE profile={profile}\n".encode() in data:
                    break
            except serial.SerialException:
                options.close()
                time.sleep(0.2)
    finally:
        options.close()
        log.write_bytes(data)

    lines = data.decode(errors="replace").splitlines()
    samples = {}
    tree = {}
    fingerprint = None
    build_cycles = None
    phases = {}
    media = {}
    for line in lines:
        if "BENCH_ERROR" in line:
            raise RuntimeError(f"Benchmark error, see {log}")
        pairs = dict(re.findall(r"(\w+)=([a-zA-Z0-9_]+)", line))
        if pairs.get("profile") != str(profile):
            continue
        if line.startswith("BENCH "):
            phase = pairs.pop("phase")
            samples[phase] = {key: int(value) for key, value in pairs.items() if key != "profile"}
        if line.startswith("BENCH_TREE "):
            tree = {key: int(value) for key, value in pairs.items() if key != "profile"}
        if line.startswith("BENCH_FRAME "):
            fingerprint = pairs["fingerprint"]
        if line.startswith("BENCH_CYCLES "):
            build_cycles = int(pairs["build"])
        if line.startswith("BENCH_PHASES "):
            phases = {name: int(value) for name, value in pairs.items() if name != "profile"}
        if line.startswith("BENCH_MEDIA "):
            media = {key: int(value) for key, value in pairs.items() if key != "profile"}
    if "steady" not in samples or not tree or fingerprint is None:
        raise RuntimeError(f"Incomplete UART measurement, see {log}")
    if profile and (media.get("photo_colors", 0) < 10 or media.get("gif_colors", 0) < 2):
        raise RuntimeError(f"Expected rendered media was not confirmed, see {log}")
    if 1 <= profile <= 4 and tree.get("actual_nodes") != 100:
        raise RuntimeError(f"Expected a 100-node scene, see {log}")
    return {"tree": tree, "media": media, "fingerprint": fingerprint, "samples": samples,
            "build_cycles": build_cycles, "phase_cycles": phases}


def active_app_slot(args, out):
    partitions = out / "partition-table.bin"
    flash(args, "read-flash", out / "partition-read.log", "0x8000", "0x1000", partitions)
    raw = partitions.read_bytes()
    factory = None
    ota = {}
    metadata = None
    for offset in range(0, len(raw), 32):
        magic, kind, subtype, address, size, label, _ = struct.unpack_from("<HBBII16sI", raw, offset)
        if magic != 0x50AA:
            break
        if kind == 0 and subtype == 0 and label.rstrip(b"\0") == b"factory":
            factory = (address, size)
        elif kind == 0 and 0x10 <= subtype < 0x20:
            ota[subtype - 0x10] = (address, size)
        elif (kind, subtype) == (1, 0):
            metadata = (address, size)

    if not ota:
        active = factory
    else:
        if metadata is None or metadata[1] != 0x2000 or sorted(ota) != list(range(len(ota))):
            raise RuntimeError("Unsupported OTA partition table")
        selection = out / "ota-selection.bin"
        flash(args, "read-flash", out / "ota-selection.log", hex(metadata[0]), hex(metadata[1]), selection)
        blob = selection.read_bytes()
        valid = []
        for offset in (0, 4096):
            sequence, state, crc = struct.unpack_from("<I20xII", blob, offset)
            if sequence not in (0, 0xFFFFFFFF) and state not in (3, 4) and crc == zlib.crc32(blob[offset:offset+4], 0xFFFFFFFF):
                valid.append((sequence, state))
        if valid:
            sequence, state = max(valid)
            if state in (0, 1):
                raise RuntimeError("Booted OTA application is awaiting confirmation")
            active = ota[(sequence - 1) % len(ota)]
        else:
            active = factory or ota[0]

    if active is None or active[1] != APP_CAPACITY:
        raise RuntimeError("The active application slot does not match the benchmark")
    return active


def original_image(args, out, offset):
    address = hex(offset)
    backup = out / f"original-app-{offset:x}.bin"
    identity = backup.with_suffix(".sha256")
    if args.restore_only and (not backup.is_file() or not identity.is_file()):
        raise RuntimeError("No verified original image for this active slot")
    if not backup.exists():
        pending = backup.with_suffix(".pending")
        flash(args, "read-flash", out / "original-active-read.log", address, hex(APP_CAPACITY), pending)
        flash(args, "verify-flash", out / "original-active-verify.log", address, pending)
        pending.replace(backup)
    binary = backup.read_bytes()
    if len(binary) != APP_CAPACITY or binary[0] != 0xE9:
        raise RuntimeError("Original application backup failed validation")
    digest = hashlib.sha256(binary).hexdigest()
    expected_identity = args.usb_serial.casefold() + " " + digest
    if identity.exists() and identity.read_text().strip() != expected_identity:
        raise RuntimeError("Original app backup digest changed")
    identity.write_text(expected_identity + "\n")
    return backup


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True)
    parser.add_argument("--usb-serial", required=True)
    parser.add_argument("--esptool", required=True)
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parent / "out")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--leave-last", action="store_true", help="leave the last verified benchmark on the screen")
    mode.add_argument("--restore-only", action="store_true", help="restore the saved original application")
    mode.add_argument("--restore-image", type=Path, help="verify and restore the supplied current application image")
    parser.add_argument("profiles", nargs="*", metavar="PROFILE")
    args = parser.parse_args()
    if set(args.profiles) - set(PROFILES):
        parser.error("Unknown profile. Available: " + ", ".join(PROFILES))
    if args.runs < 1:
        parser.error("--runs must be positive")
    selected = () if args.restore_only else args.profiles or PROFILES
    out = args.output_dir.resolve()
    out.mkdir(parents=True, exist_ok=True)
    images = {profile: out / profile / "firmware.bin" for profile in selected}
    for image in images.values():
        if not image.is_file() or not 0 < image.stat().st_size <= APP_CAPACITY:
            parser.error(f"Missing or oversized application image: {image}")

    active = active_app_slot(args, out)
    address = hex(active[0])
    if args.restore_image:
        backup = args.restore_image.resolve()
        if not backup.is_file() or not 0 < backup.stat().st_size <= APP_CAPACITY:
            parser.error(f"Missing or oversized restore image: {backup}")
        flash(args, "verify-flash", out / "before.log", address, backup)
    else:
        backup = original_image(args, out, active[0])

    completed = False
    try:
        for profile, image in images.items():
            print(f"Measuring {profile}", flush=True)
            directory = image.parent
            results = []
            app_hash = hashlib.sha256(image.read_bytes()).hexdigest()
            for run in range(1, args.runs + 1):
                if run == 1:
                    flash(args, "write-flash", directory / "flash.log", address, image)
                else:
                    flash(args, "run", directory / f"reset-{run}.log")
                result = capture(args, PROFILES.index(profile), run, directory)
                result["app_sha256"] = app_hash
                results.append(result)
                (directory / "hardware.json").write_text(json.dumps(results, indent=2) + "\n")
        completed = True
    finally:
        if completed and args.leave_last:
            print("Last measured application remains active", flush=True)
        else:
            flash(args, "write-flash", out / "restore.log", address, backup)
            flash(args, "verify-flash", out / "restore-verify.log", address, backup)
            print("Original application restored", flush=True)


if __name__ == "__main__":
    main()
