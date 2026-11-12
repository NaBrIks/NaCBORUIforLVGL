# SPDX-License-Identifier: MIT
"""Plot scene and numeric-format measurements collected by the S3 benchmark."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from statistics import median

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
BACKENDS = ("streams", "to_chars", "snprintf")
WORKLOADS = ("binding", "fixed", "json")
COLORS = ("#345c7d", "#008171", "#be6829")


def chart(rows, cols, title, size):
    fig, axes = plt.subplots(rows, cols, figsize=size, layout="constrained", squeeze=False)
    fig.suptitle(title, fontsize=15, fontweight="bold")
    for ax in axes.flat:
        ax.spines[["top", "right"]].set_visible(False)
        ax.grid(axis="y", alpha=0.25)
        ax.set_axisbelow(True)
    return fig, axes


def scenes():
    data = json.loads((OUT / "summary.json").read_text())
    fig, ((images, growth, timing),) = chart(1, 3, "ESP32-S3 · две сцены по 100 узлов", (14, 4.4))
    series = ("direct", "cbor")
    labels = ("Прямой LVGL", "CBOR во Flash")
    for i, key in enumerate(series):
        values = [data[f"{key}-{scene}"]["app_flash_bytes"] for scene in ("repeat", "mixed")]
        bars = images.bar([i - 0.18, i + 0.18], [v / 1024 for v in values], 0.33,
                          color=[COLORS[0], COLORS[1]])
        images.bar_label(bars, fmt="%.1f", padding=4)
        bars = growth.bar(i, values[1] - values[0], 0.54, color=COLORS[0])
        growth.bar_label(bars, labels=[f"+{values[1] - values[0]:,}".replace(",", " ")], padding=4)
    images.legend(handles=images.containers[0], labels=("Повторяющаяся", "Разнородная"),
                  loc="upper left", ncol=2, frameon=False, fontsize=9)
    for ax in (images, growth, timing):
        ax.set_xticks(range(2), labels)
    images.set(title="Размер образа", ylabel="Flash, КиБ", ylim=(0, 860))
    growth.set(title="Прирост при той же численности узлов", ylabel="Flash, байт", ylim=(0, 10400))
    for i, key in enumerate(series):
        values = [data[f"{key}-{scene}"]["assets_to_screen_us"] / 1000 for scene in ("repeat", "mixed")]
        bars = timing.bar([i - 0.18, i + 0.18], values, 0.33, color=[COLORS[0], COLORS[1]])
        timing.bar_label(bars, fmt="%.1f", padding=4)
    timing.set(title="Построение экрана", ylabel="мс", ylim=(0, 245))
    fig.savefig(HERE / "scene-comparison.png", dpi=160, facecolor="white")
    plt.close(fig)


def numeric_data():
    root = OUT / "number-format"
    profiles = {}
    configs = set()
    for app in range(2):
        for backend in BACKENDS:
            directory = root / f"{backend}-{app}"
            run = json.loads((directory / "hardware.json").read_text())
            binary = (directory / "firmware.bin").read_bytes()
            if hashlib.sha256(binary).hexdigest() != run["app_sha256"]:
                raise ValueError(f"Measurement does not match image: {directory.name}")
            configs.add(hashlib.sha256((directory / "sdkconfig").read_bytes()).hexdigest())
            build = (directory / "build.log").read_text(errors="replace")
            ram = int(re.search(r"(?m)^RAM:.*?used (\d+) bytes", build)[1])
            row = {"flash": len(binary), "static_ram": ram, "workloads": {}}
            for name, samples in run["workloads"].items():
                warm = [samples[str(i)] for i in range(1, 5)]
                row["workloads"][name] = {
                    "us": median(s["us"] for s in warm) / run["count"],
                    "first_us": samples["0"]["us"] / run["count"],
                    "ram_before": warm[0]["ram_before"],
                    "psram_before": warm[0]["psram_before"],
                    "ram_peak": max(s["ram_before"] - s["ram_min"] for s in samples.values()),
                    "psram_peak": max(s["psram_before"] - s["psram_min"] for s in samples.values()),
                    "stack_free": min(s["stack"] for s in samples.values()),
                    "hashes": sorted({s["hash"] for s in samples.values()}),
                }
            profiles[f"{backend}-{app}"] = row
    if len(configs) != 1:
        raise ValueError("The six builds must share an identical sdkconfig")
    print(json.dumps({"sdkconfig_sha256": configs.pop(), "profiles": profiles}, indent=2))
    return profiles


def numeric():
    profiles = numeric_data()
    fig, axes = chart(3, 2, "ESP32-S3 · форматирование чисел", (10, 8.4))
    for app in range(2):
        axes[0, app].set_title(("Без потоков в приложении", "Приложение использует потоки")[app])
        for row, name, label in ((0, "flash", "Образ Flash, КиБ"), (1, "static_ram", "Статическая RAM, КиБ")):
            ax = axes[row, app]
            values = [profiles[f"{backend}-{app}"][name] / 1024 for backend in BACKENDS]
            bars = ax.bar(BACKENDS, values, 0.62, color=COLORS)
            ax.bar_label(bars, fmt="%.1f", padding=3, fontsize=9)
            ax.set(ylabel=label, ylim=(0, 1.2 * max(p[name] for p in profiles.values()) / 1024))
        ax = axes[2, app]
        for i, backend in enumerate(BACKENDS):
            values = [profiles[f"{backend}-{app}"]["workloads"][w]["us"] for w in WORKLOADS]
            ax.bar([j + (i - 1) * 0.23 for j in range(3)], values, 0.22, label=backend, color=COLORS[i])
        ax.set_xticks(range(3), ("15 знач. цифр", "0–6 знаков", "JSON"))
        ax.set(ylabel="мкс / число", ylim=(0, 1.28 * max(w["us"] for p in profiles.values() for w in p["workloads"].values())))
        ax.legend(loc="upper left", frameon=False, ncol=3, fontsize=8)
    fig.savefig(HERE / "number-format-comparison.png", dpi=160, facecolor="white")
    plt.close(fig)


def matrix():
    data = json.loads((OUT / "final-matrix" / "summary.json").read_text())
    profiles = ("direct-repeat", "cbor-repeat", "pages", "data", "filesystem", "http", "full")
    labels = ("Direct LVGL", "CBOR in Flash", "+ Nested pages", "+ Bindings", "+ File storage",
              "+ Wi-Fi / HTTP", "Full with editor")
    fig, ((flash, ram),) = chart(1, 2, "ESP32-S3 · feature stages", (11, 4.7))
    for ax, key, label, color in ((flash, "app_flash_bytes", "App image, KiB", COLORS[0]),
                                   (ram, "static_ram_bytes", "Static RAM, KiB", COLORS[1])):
        values = [data[name][key] / 1024 for name in profiles]
        bars = ax.barh(labels, values, color=color)
        ax.invert_yaxis()
        ax.set(xlabel=label, xlim=(0, max(values) * 1.20))
        ax.grid(False, axis="y")
        ax.grid(axis="x", alpha=0.25)
        ax.bar_label(bars, fmt="%.1f", padding=4)
    fig.savefig(HERE / "final-matrix.png", dpi=160, facecolor="white")
    plt.close(fig)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("chart", choices=("scenes", "numbers", "matrix"))
    args = parser.parse_args()
    {"scenes": scenes, "numbers": numeric, "matrix": matrix}[args.chart]()
