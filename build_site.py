# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Assemble the checked-in interactive page into the ignored ``site/`` folder.

Run with ``uv run build_site.py`` before previewing or publishing with Pages.
The build only copies local files and does not require a network connection.
"""

import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "site"
PAGE_FILES = ("index.html", "app.js", "styles.css", "field-study.css", "field-theory.css")
DATA_FILES = (
    "observations.js", "observations.json", "clouds.js", "clouds.json",
)


def copy_file(relative_path):
    """Copy one repository file into the same relative path under site/."""
    source = ROOT / relative_path
    target = SITE / relative_path
    if not source.is_file():
        raise FileNotFoundError(f"Required site input is missing: {relative_path}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def main():
    observations = json.loads((ROOT / "data" / "observations.json").read_text(encoding="utf-8"))
    required = list(PAGE_FILES)
    required.extend(f"data/{name}" for name in DATA_FILES)
    required.extend(day["image"] for day in observations["days"])
    required.append(observations["map"]["terrain"])

    for relative_path in required:
        copy_file(relative_path)
    print(f"Built {SITE.relative_to(ROOT).as_posix()}/ with {len(required)} local files.")


if __name__ == "__main__":
    main()
