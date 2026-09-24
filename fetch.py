# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Fetch the Zugspitze source files once and keep each raw response unchanged.

Run with ``uv run fetch.py``. Existing files are left untouched, so the project can
be analysed offline after the data have been committed.
"""

from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw"
ASSETS = ROOT / "assets"
DWD_TEMPERATURE = (
    "https://opendata.dwd.de/climate_environment/CDC/observations_germany/"
    "climate/hourly/air_temperature/recent/"
)
DWD_CTH = "https://opendata.dwd.de/weather/satellite/clouds/CTH/"
NASA_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi"
ESRI_EXPORT = (
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/"
    "MapServer/export?bbox=1063401.2038180765%2C5910900.252768108%2C"
    "1383401.2038180765%2C6110900.252768108&bboxSR=3857&imageSR=3857&"
    "size=1440%2C900&format=jpg&f=image"
)
BBOX = "1063401.2038180765,5910900.252768108,1383401.2038180765,6110900.252768108"


def sources():
    """List the exact files needed by the chart and the local explorer."""
    items = []
    for station in ("01550", "05792"):
        name = f"stundenwerte_TU_{station}_akt.zip"
        items.append({"title": "DWD hourly air temperature", "url": DWD_TEMPERATURE + name,
                      "path": RAW / name})

    for hour in range(6, 19):
        name = f"CTHin20260922{hour:02d}00nEU.nc.bz2"
        items.append({"title": "DWD cloud-top-height reference", "url": DWD_CTH + name,
                      "path": RAW / name})

    query = {
        "SERVICE": "WMS", "REQUEST": "GetMap", "VERSION": "1.1.1",
        "LAYERS": "VIIRS_SNPP_CorrectedReflectance_TrueColor", "STYLES": "",
        "SRS": "EPSG:3857", "BBOX": BBOX, "WIDTH": "1440", "HEIGHT": "900",
        "FORMAT": "image/jpeg",
    }
    for day in range(14, 21):
        date = f"2026-09-{day:02d}"
        query["TIME"] = date
        name = f"viirs-202609{day:02d}.jpg"
        items.append({"title": "NASA GIBS / Suomi NPP VIIRS true-colour daily composite",
                      "url": f"{NASA_WMS}?{urlencode(query)}", "path": RAW / name})

    items.append({"title": "Esri World Imagery terrain reference", "url": ESRI_EXPORT,
                  "path": ASSETS / "terrain-mercator.jpg"})
    return items


def fetch_one(item):
    """Save the publisher's response bytes once; do not rewrite cached files."""
    path = item["path"]
    if path.exists():
        print(f"kept {path.relative_to(ROOT).as_posix()} ({path.stat().st_size:,} bytes)")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    request = Request(item["url"], headers={"User-Agent": "SD5913 student data visualisation"})
    with urlopen(request, timeout=90) as response:
        if response.status != 200:
            raise RuntimeError(f"Download failed with HTTP {response.status}: {item['url']}")
        path.write_bytes(response.read())
    print(f"saved raw response: {path.relative_to(ROOT).as_posix()}")


def write_source_manifest(items):
    """Record provenance and checksums separately from the raw downloads."""
    manifest = {
        "projection": "EPSG:3857",
        "bbox": [1063401.2038180765, 5910900.252768108,
                 1383401.2038180765, 6110900.252768108],
        "width": 1440,
        "height": 900,
        "sources": [],
    }
    for item in items:
        path = item["path"]
        manifest["sources"].append({
            "title": item["title"], "url": item["url"],
            "file": path.relative_to(ROOT).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha256(path.read_bytes()).hexdigest(),
        })
    (ROOT / "data" / "download-sources.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    imagery_path = ROOT / "data" / "imagery-sources.json"
    imagery_sources = json.loads(imagery_path.read_text(encoding="utf-8"))
    for source in imagery_sources:
        image = RAW / Path(source["file"]).name
        if image.exists():
            source["file"] = image.relative_to(ROOT).as_posix()
            source["bytes"] = image.stat().st_size
            source["sha256"] = sha256(image.read_bytes()).hexdigest()
    imagery_path.write_text(
        json.dumps(imagery_sources, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def main():
    items = sources()
    for item in items:
        fetch_one(item)
    write_source_manifest(items)
    print(f"Source manifest updated for {len(items)} files.")


if __name__ == "__main__":
    main()
