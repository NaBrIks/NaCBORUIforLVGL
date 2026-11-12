# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Oleg Kozhevnikov
"""Build and measure the six numeric-formatting profiles on the identified S3."""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

import serial

from measure import active_app_slot, flash, identify

BACKENDS = ("streams", "to_chars", "snprintf")
BENCH = Path(__file__).resolve().parent
OUTPUT = BENCH / "out" / "number-format"


def build(pio, jobs):
    env = os.environ.copy()
    cache = BENCH / "managed_components"
    if all((cache / name / "CMakeLists.txt").exists() for name in ("lvgl__lvgl", "espressif__cbor")):
        env["NACBOR_BENCH_CACHED_COMPONENTS"] = cache.as_posix()
    workspace = Path(env.get("PLATFORMIO_BUILD_DIR", BENCH / ".pio" / "build"))
    for backend in BACKENDS:
        for streams in range(2):
            target = OUTPUT / f"{backend}-{streams}"
            target.mkdir(parents=True, exist_ok=True)
            env.update(NACBOR_BENCH_FORMAT=backend, NACBOR_BENCH_APP_STREAMS=str(streams))
            log = target / "build.log"
            print(f"Building {target.name}", flush=True)
            with log.open("wb") as stream:
                process = subprocess.run([pio, "run", "-d", str(BENCH), "-e", "format", "-j", str(jobs)],
                                         env=env, stdout=stream, stderr=subprocess.STDOUT)
            if process.returncode:
                raise RuntimeError("\n".join(log.read_text(errors="replace").splitlines()[-45:]))
            for file in ("firmware.bin", "firmware.elf", "nacbor_memory_bench.map"):
                shutil.copyfile(workspace / "format" / file, target / file)
            shutil.copyfile(BENCH / "sdkconfig.format", target / "sdkconfig")


def capture(args, backend, streams, directory):
    port = serial.Serial(baudrate=115200, timeout=0.25)
    port.dtr = False
    port.rts = False
    port.port = args.port
    data = bytearray()
    report = re.compile(
        rb"(?ms)^FORMAT_BENCH backend=%d app_streams=%d samples=(\d+) app_signature=(\d+)\r?$"
        rb"((?:\r?\nFORMAT_SAMPLE [^\r\n]+){15})\r?\nFORMAT_DONE\r?$" % (backend, streams)
    )
    complete = None
    deadline = time.monotonic() + 100
    try:
        while time.monotonic() < deadline:
            try:
                if not port.is_open:
                    port.open()
                data.extend(port.read(4096))
                complete = report.search(data)
                if complete:
                    break
            except serial.SerialException:
                port.close()
                time.sleep(0.2)
    finally:
        port.close()
        (directory / "uart.log").write_bytes(data)

    if not complete:
        raise RuntimeError(f"Incorrect boot or incomplete UART capture in {directory}")
    rows = {}
    for line in complete[3].decode().strip().splitlines():
        fields = dict(re.findall(r"(\w+)=(\w+)", line))
        workload = fields.pop("workload")
        rows.setdefault(workload, {})[fields.pop("round")] = {key: int(val) for key, val in fields.items()}
    if set(rows) != {"binding", "fixed", "json"} or any(len(v) != 5 for v in rows.values()):
        raise RuntimeError(f"Missing workload results in {directory}")
    return {"count": int(complete[1]), "app_signature": int(complete[2]), "workloads": rows}


def measure(args):
    if not all((OUTPUT / f"{backend}-{streams}" / "firmware.bin").is_file()
               for backend in BACKENDS for streams in range(2)):
        raise RuntimeError("Build all six profiles first")
    identify(args.port, args.usb_serial)
    restore = Path(args.restore_image).resolve()
    if not restore.is_file():
        raise RuntimeError("A known-good app image is required for restoration")
    address = hex(active_app_slot(args, OUTPUT)[0])
    flash(args, "verify-flash", OUTPUT / "before.log", address, restore)

    try:
        for index, backend in enumerate(BACKENDS):
            for streams in range(2):
                target = OUTPUT / f"{backend}-{streams}"
                image = target / "firmware.bin"
                print(f"Measuring {target.name}", flush=True)
                flash(args, "write-flash", target / "flash.log", address, image)
                result = capture(args, index, streams, target)
                result["app_sha256"] = hashlib.sha256(image.read_bytes()).hexdigest()
                (target / "hardware.json").write_text(json.dumps(result, indent=2) + "\n")
    finally:
        flash(args, "write-flash", OUTPUT / "restore.log", address, restore)
        flash(args, "verify-flash", OUTPUT / "restore-verify.log", address, restore)
        print("Previous application restored", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest="command", required=True)
    builder = actions.add_parser("build")
    builder.add_argument("--pio", default="pio")
    builder.add_argument("--jobs", type=int, default=12)
    tester = actions.add_parser("measure")
    tester.add_argument("--esptool", default="esptool")
    tester.add_argument("--port", required=True)
    tester.add_argument("--usb-serial", required=True)
    tester.add_argument("--restore-image", required=True)
    args = parser.parse_args()
    if args.command == "build":
        build(args.pio, args.jobs)
    else:
        measure(args)
