"""Run after `tauri android init`: put AnyPage's MainActivity into the generated project.

The generated Android project (src-tauri/gen/android) is rebuilt on every CI run,
so our customisations live in android/ and are copied in here.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEN = ROOT / "src-tauri" / "gen" / "android"


def main():
    activities = list(GEN.glob("app/src/main/java/**/MainActivity.kt"))
    if len(activities) != 1:
        sys.exit(f"Expected one generated MainActivity.kt, found {len(activities)}. Did `tauri android init` run?")
    target = activities[0]
    package = re.search(r"^package\s+(\S+)", target.read_text(encoding="utf-8"), re.M).group(1)
    ours = (ROOT / "android" / "MainActivity.kt").read_text(encoding="utf-8")
    target.write_text(ours.replace("__PACKAGE__", package), encoding="utf-8")
    print(f"MainActivity -> {target.relative_to(ROOT)} (package {package})")

    manifest = GEN / "app" / "src" / "main" / "AndroidManifest.xml"
    text = manifest.read_text(encoding="utf-8")
    if 'android:launchMode="singleTask"' not in text:
        sys.exit("AndroidManifest.xml: expected launchMode singleTask on the main activity")
    print("AndroidManifest.xml looks right")


if __name__ == "__main__":
    main()
