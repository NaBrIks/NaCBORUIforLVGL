# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Oleg Kozhevnikov
import os
import re
import subprocess
from pathlib import Path

Import("env")
project = Path(env.subst("$PROJECT_DIR"))
build = Path(env.subst("$BUILD_DIR"))
option = env.GetProjectOption("board_build.cmake_extra_args")
default = re.search(r"-DBENCH_PROFILE=(\d+)", option)[1]
profile = int(os.environ.get("NACBOR_BENCH_PROFILE_OVERRIDE", default))
if not 0 <= profile <= 14:
    raise ValueError("Unknown benchmark profile")

formatter = os.environ.get("NACBOR_BENCH_FORMAT")
app_streams = os.environ.get("NACBOR_BENCH_APP_STREAMS", "0")
if formatter not in (None, "streams", "to_chars", "snprintf") or app_streams not in ("0", "1"):
    raise ValueError("Invalid formatter benchmark options")
arguments = f"-DBENCH_PROFILE={profile}"
if formatter is not None:
    arguments += f" -DLVGL_CBOR_NUMBER_FORMAT={formatter}"
if profile == 14:
    arguments += f" -DBENCH_APP_STREAMS={app_streams}"
environment = env.subst("$PIOENV")
if environment in ("phases-og", "phases-os"):
    if profile not in (2, 4):
        raise ValueError("Phase timing needs a minimal CBOR scene")
    optimization = "SIZE" if environment == "phases-os" else "DEBUG"
    sdkconfig = project / f"sdkconfig.{environment}"
    setting = f"CONFIG_COMPILER_OPTIMIZATION_{optimization}=y"
    if not sdkconfig.exists():
        sdkconfig.write_text(setting + "\n")
    elif setting not in sdkconfig.read_text().splitlines():
        raise ValueError(f"{sdkconfig.name} must select {setting}")
    arguments += " -DBENCH_SCREEN_PHASES=ON"
if os.environ.get("NACBOR_BENCH_TRUSTED_CBOR") == "1":
    arguments += " -DBENCH_TRUSTED_CBOR=ON"
env.BoardConfig().update("build.cmake_extra_args", arguments)
build.mkdir(parents=True, exist_ok=True)
mode = f"{arguments}:{os.environ.get('NACBOR_BENCH_CACHED_COMPONENTS', '')}"
profile_file = build / "bench-profile.txt"
if not profile_file.exists() or profile_file.read_text() != mode:
    (build / "CMakeCache.txt").unlink(missing_ok=True)
    profile_file.write_text(mode)

named_styles = os.environ.get("NACBOR_BENCH_NAMED_STYLES") == "1"
if named_styles and (profile not in (2, 4) or environment not in ("phases-og", "phases-os")):
    raise ValueError("Named style comparison needs a minimal phase-timed CBOR scene")

if 0 < profile < 14:
    output = build / "esp-idf" / "main" / "fixtures.hpp"
    output.parent.mkdir(parents=True, exist_ok=True)
    generator = ["node", str(project / "generate.mjs"), str(profile), str(output)]
    if named_styles:
        generator.append("--named-styles")
    subprocess.run(generator, check=True)
