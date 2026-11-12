# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Oleg Kozhevnikov
"""Private-transport adapter: stdin JSON records carry already encoded CBOR frames.

Requires pyserial. It never toggles reset/boot signals or writes flash.
"""
import argparse
import json
import sys
import time
import serial

parser = argparse.ArgumentParser()
parser.add_argument("port")
args = parser.parse_args()
device = serial.Serial(port=None, baudrate=115200, timeout=0.05, write_timeout=5)
device.dtr = False
device.rts = False
device.port = args.port

def emit(value):
    # Pipe output must not depend on the Windows process code page.
    print(json.dumps(value, ensure_ascii=True), flush=True)

try:
    device.open()
    buffered = bytearray()
    for line in sys.stdin:
        record = json.loads(line)
        if len(record["frame"]) > 8200:
            raise ValueError("Encoded frame exceeds MCU command limit")
        frame = bytes.fromhex(record["frame"])
        if len(frame) > 4100:
            raise ValueError("Frame exceeds MCU command limit")
        device.write(frame)
        deadline = time.monotonic() + 10
        received = False
        while time.monotonic() < deadline and not received:
            buffered.extend(device.read(4096))
            if len(buffered) > 32768:
                buffered.clear()
                emit({"serial": "Oversized diagnostic line discarded"})
            while b"\n" in buffered:
                raw, _, rest = buffered.partition(b"\n")
                buffered = bytearray(rest)
                marker = raw.find(b"@ui ")
                if marker < 0:
                    if raw:
                        emit({"serial": raw.decode("utf8", "replace")})
                    continue
                value = json.loads(raw[marker + 4:])
                if value.get("id") == record["id"] and value.get("frameBytes"):
                    count = value["frameBytes"]
                    if not isinstance(count, int) or not 32 <= count <= 4128:
                        raise ValueError("Invalid LVF1 reply length")
                    while len(buffered) < count and time.monotonic() < deadline:
                        buffered.extend(device.read(count - len(buffered)))
                    if len(buffered) < count or buffered[:4] != b"LVF1":
                        raise ValueError("Missing LVF1 packet")
                    value["frameHex"] = buffered[:count].hex()
                    del buffered[:count]
                emit(value)
                if value.get("id") == record["id"]:
                    received = True
        if not received:
            emit({"id": record["id"], "ok": False, "error": "Serial reply timeout"})
finally:
    device.close()
