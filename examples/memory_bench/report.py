# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Oleg Kozhevnikov
"""Summarize the application images and UART samples saved by the S3 bench."""
import argparse
import hashlib
import json
import re
import statistics
from pathlib import Path

ORDER = (
    "board", "direct-repeat", "cbor-repeat", "direct-mixed", "cbor-mixed", "pages", "data",
    "schemes", "history", "filesystem", "wifi", "http", "editor", "full",
)


def median(runs, phase, key):
    values = [run["samples"][phase][key] for run in runs if phase in run["samples"]]
    return round(statistics.median(values)) if values else None


def range_of(runs, phase, key):
    values = [run["samples"][phase][key] for run in runs if phase in run["samples"]]
    return [min(values), max(values)] if values else None


def profile_data(path):
    image, build, hardware = (path / name for name in ("firmware.bin", "build.log", "hardware.json"))
    if not image.is_file() or not build.is_file():
        return None
    log = build.read_text(encoding="utf-8", errors="replace")
    static = re.search(r"RAM:[^\n]*\(used (\d+) bytes", log)
    flash = re.search(r"Flash:[^\n]*\(used (\d+) bytes", log)
    if not static or not flash:
        raise ValueError(f"Size output missing in {build}")
    result = {
        "app_flash_bytes": image.stat().st_size,
        "reported_flash_bytes": int(flash[1]),
        "static_ram_bytes": int(static[1]),
    }
    link_map = path / "nacbor_memory_bench.map"
    if link_map.is_file():
        keys = {".flash.text", ".flash.rodata", ".iram0.text", ".iram0.vectors",
                ".dram0.data", ".dram0.bss", ".noinit"}
        sections = {}
        for line in link_map.open(encoding="utf-8", errors="replace"):
            entry = re.match(r"^(\.\S+)\s+0x[0-9a-f]+\s+(0x[0-9a-f]+)", line)
            if entry and entry[1] in keys:
                sections[entry[1]] = int(entry[2], 16)
        result["sections"] = sections
    if hardware.is_file():
        digest = hashlib.sha256(image.read_bytes()).hexdigest()
        runs = [run for run in json.loads(hardware.read_text()) if run.get("app_sha256") == digest]
    else:
        runs = []
    if runs:
        result["boots"] = len(runs)
        result["fingerprints"] = sorted({run["fingerprint"] for run in runs})
        result["tree"] = runs[0]["tree"]
        result["media"] = runs[0]["media"]
        result["phases"] = {}
        for phase in runs[0]["samples"]:
            result["phases"][phase] = {
                key: {"median": median(runs, phase, key), "range": range_of(runs, phase, key)}
                for key in runs[0]["samples"][phase]
            }
        cycle_counts = [run["build_cycles"] for run in runs if run.get("build_cycles") is not None]
        if cycle_counts:
            result["build_cycles"] = {"median": round(statistics.median(cycle_counts)),
                                      "range": [min(cycle_counts), max(cycle_counts)]}

        phase_cycles = {}
        for phase in ("parse", "objects", "layout", "named_styles"):
            counts = [run["phase_cycles"][phase] for run in runs if phase in run.get("phase_cycles", {})]
            if counts:
                phase_cycles[phase] = {"median": round(statistics.median(counts)), "range": [min(counts), max(counts)]}
        if phase_cycles:
            result["phase_cycles"] = phase_cycles

        build_us = [run["samples"]["screen_built"]["us"] - run["samples"]["assets_ready"]["us"]
                    for run in runs if {"screen_built", "assets_ready"} <= run["samples"].keys()]
        if build_us:
            result["assets_to_screen_us"] = round(statistics.median(build_us))
    return result


def show(value):
    return "—" if value is None else f"{value:,}".replace(",", " ")


def print_table(data):
    print("| Profile | App bytes | Static RAM | First frame from boot, µs | Steady internal free | Steady PSRAM free | Boots |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    for name, item in data.items():
        phases = item.get("phases", {})
        first = phases.get("first_frame", {}).get("us", {}).get("median")
        steady = phases.get("steady", {})
        ram = steady.get("ram", {}).get("median")
        psram = steady.get("psram", {}).get("median")
        print(f"| {name} | {show(item['app_flash_bytes'])} | {show(item['static_ram_bytes'])} | "
              f"{show(first)} | {show(ram)} | {show(psram)} | {show(item.get('boots'))} |")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parent / "out")
    parser.add_argument("profiles", nargs="*")
    args = parser.parse_args()
    out = args.output_dir
    result = {}
    for name in args.profiles or ORDER:
        data = profile_data(out / name)
        if data is not None:
            result[name] = data
    out.mkdir(exist_ok=True)
    (out / "summary.json").write_text(json.dumps(result, indent=2) + "\n")
    print_table(result)


if __name__ == "__main__":
    main()
