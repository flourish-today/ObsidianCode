#!/usr/bin/env python3
"""Collect notices for ObsidianCode's additions, without extra build dependencies.

Usage: collect-licenses.py <upstream checkout> <go list -deps -json output> <output>
Run go list with exactly the Android environment and tags used for the library.
"""

import json
from pathlib import Path
import re
import subprocess
import sys


NOTICE = re.compile(r"^(licen[cs]e|copying|notice|copyright|patents|authors)(?:$|[._-])", re.I)
LICENSE = re.compile(r"^(licen[cs]e|copying)(?:$|[._-])", re.I)


def documents(root):
    # Include nested notices too: modules such as Tailscale bundle other projects.
    return sorted(
        path for path in root.rglob("*")
        if path.is_file() and NOTICE.match(path.name)
        and path.suffix.lower() not in {".go", ".py", ".sh", ".html"}
    )


def packages(text):
    decoder = json.JSONDecoder()
    while text.strip():
        package, end = decoder.raw_decode(text.lstrip())
        yield package
        text = text.lstrip()[end:]


def collect(upstream, package_json, output):
    here = Path(__file__).resolve().parent
    sections = [
        "ObsidianCode: licenses and notices for fork additions\n\n"
        "Go modules are selected using the Android library's build environment and tags.\n"
        "Nested notices are included conservatively, even for unused parts of a module.\n"
        "This supplements the licenses shipped by upstream dependencies.\n"
    ]

    def append(label, path):
        text = path.read_text(encoding="utf-8")
        if not text.strip():
            raise ValueError(f"Empty license/notice: {path}")
        sections.append(f"\n{'=' * 72}\n{label}\n{'=' * 72}\n\n{text.rstrip()}\n")

    append("T3 Code — MIT", upstream / "LICENSE")
    append("ObsidianCode additions — CC0-1.0", here / "LICENSE-CC0-1.0-Universal")

    modules = {}
    for package in packages(package_json.read_text()):
        if package.get("Error") or package.get("DepsErrors"):
            raise ValueError(f"Incomplete dependency data: {package.get('ImportPath')}")
        module = package.get("Module")
        if module and not module.get("Main"):
            modules[module["Path"]] = module
    if "tailscale.com" not in modules:
        raise ValueError("Tailscale missing from dependency data")
    for name, module in sorted(modules.items()):
        if module.get("Replace"):
            raise ValueError(f"Review license collection for replaced module: {name}")
        root = Path(module["Dir"])
        files = documents(root)
        if not any(LICENSE.match(path.name) for path in files):
            raise ValueError(f"No license found for {name} {module['Version']}")
        for path in files:
            append(f"{name} {module['Version']} / {path.relative_to(root)}", path)

    goroot = Path(subprocess.check_output(["go", "env", "GOROOT"], text=True).strip())
    version = subprocess.check_output(["go", "env", "GOVERSION"], text=True).strip()
    append(f"Go standard library and runtime {version} / LICENSE", goroot / "LICENSE")
    for path in documents(goroot / "src"):
        append(f"Go {version} / {path.relative_to(goroot)}", path)
    if (goroot / "PATENTS").is_file():
        append(f"Go {version} / PATENTS", goroot / "PATENTS")

    # Fail if the direct Android addition changes without a license review.
    gradle = (here / "overlay/apps/mobile/modules/obsidian-network/android/build.gradle").read_text()
    if re.findall(r"implementation\s+'([^']+)'", gradle) != ["androidx.webkit:webkit:1.14.0"]:
        raise ValueError("Review notices for changed Android dependencies")
    append(
        "AndroidX WebKit 1.14.0 — The Android Open Source Project — Apache-2.0\n"
        "https://developer.android.com/jetpack/androidx/releases/webkit#1.14.0",
        here / "licenses/AndroidX-WebKit-1.14.0.txt",
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("".join(sections), encoding="utf-8")
    print(f"Collected notices for {len(modules)} Go modules, Go runtime, and AndroidX WebKit: {output}")


if __name__ == "__main__":
    collect(*(Path(arg).resolve() for arg in sys.argv[1:]))
