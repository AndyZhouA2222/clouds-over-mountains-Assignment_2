# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Make a self-contained picture from the committed DWD and NASA files.

Run with ``uv run plot.py``. This script only reads local files and writes
``out/plot.svg``; it never uses the network.
"""

import base64
import csv
from datetime import datetime, timezone
import html
import io
import json
import math
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
RAW = DATA / "raw"
OUT = ROOT / "out"
DAYS = [f"2026-09-{day:02d}" for day in range(14, 21)]
STATIONS = {
    "01550": {"name": "Garmisch-Partenkirchen", "label": "Valley", "colour": "#bd6548"},
    "05792": {"name": "Zugspitze", "label": "Summit", "colour": "#3f8190"},
}


def read_station(station_id):
    """Read TT_TU hourly temperatures from one unchanged DWD ZIP archive."""
    archive_path = RAW / f"stundenwerte_TU_{station_id}_akt.zip"
    readings = {}
    with zipfile.ZipFile(archive_path) as archive:
        member = next(name for name in archive.namelist()
                      if name.startswith("produkt_tu_stunde_"))
        text = archive.read(member).decode("utf-8")
        for row in csv.DictReader(io.StringIO(text), delimiter=";"):
            instant = datetime.strptime(row["MESS_DATUM"].strip(), "%Y%m%d%H")
            if instant.strftime("%Y-%m-%d") not in DAYS:
                continue
            value = float(row["TT_TU"])
            readings[instant.replace(tzinfo=timezone.utc)] = None if value == -999 else value
    return readings


def read_paired_hours():
    """Pair both stations by their UTC timestamp and calculate valley minus summit."""
    station_readings = {station: read_station(station) for station in STATIONS}
    frames = []
    for day in DAYS:
        for hour in range(24):
            instant = datetime.strptime(f"{day} {hour:02d}", "%Y-%m-%d %H").replace(
                tzinfo=timezone.utc
            )
            valley = station_readings["01550"].get(instant)
            summit = station_readings["05792"].get(instant)
            delta = valley - summit if valley is not None and summit is not None else None
            frames.append({"time": instant, "valley": valley, "summit": summit, "delta": delta})
    return frames


def text(x, y, value, size=14, colour="#31413d", weight=400, anchor="start", extra=""):
    """Create one escaped SVG text element."""
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" fill="{colour}" '
            f'font-weight="{weight}" text-anchor="{anchor}" {extra}>'
            f'{html.escape(str(value))}</text>')


def image_data(path):
    """Inline a downloaded JPEG so the exported SVG works as one file."""
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def build_svg(frames):
    width, height = 1600, 1080
    left, right = 80, 1520
    plot_left, plot_right = 126, 1492
    plot_top, plot_bottom = 552, 900
    valid = [frame for frame in frames if frame["delta"] is not None]
    if not valid:
        raise ValueError("No paired hourly temperatures are available for the selected week.")
    values = [frame["delta"] for frame in valid]
    y_min = min(0, math.floor(min(values) / 2) * 2 - 2)
    y_max = math.ceil(max(values) / 2) * 2 + 2

    def x_position(index):
        return plot_left + index / (len(frames) - 1) * (plot_right - plot_left)

    def y_position(value):
        return plot_bottom - (value - y_min) / (y_max - y_min) * (plot_bottom - plot_top)

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
        'role="img" aria-labelledby="title description">',
        '<title id="title">Clouds over the Zugspitze, 14 to 20 September 2026</title>',
        '<desc id="description">Seven NASA VIIRS daily satellite composites above a chart of 168 hourly temperature differences between Garmisch-Partenkirchen and Zugspitze.</desc>',
        '<defs><linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f7f8f4"/><stop offset="1" stop-color="#eef2ed"/></linearGradient>',
        '<clipPath id="chartClip"><rect x="126" y="552" width="1366" height="348"/></clipPath>',
    ]
    for index in range(7):
        parts.append(f'<clipPath id="tile{index}"><rect x="0" y="0" width="198" height="124" rx="5"/></clipPath>')
    parts.extend([
        '</defs><rect width="1600" height="1080" fill="url(#paper)"/>',
        '<rect x="48" y="32" width="1504" height="1016" rx="10" fill="#ffffff" stroke="#dfe5df"/>',
        text(left, 76, "MOUNTAIN CLOUD FIELD  /  ZUGSPITZE · 47.42°N, 10.98°E", 12, "#687771", 700, extra='letter-spacing="1.5"'),
        text(left, 127, "Clouds over the Zugspitze", 39, "#203330", 650),
        text(left, 160, "A week of satellite cloud patterns and the hourly valley-to-summit temperature gap", 16, "#64736e"),
        text(right, 79, "14—20 SEP 2026", 13, "#bd6548", 700, "end"),
        text(right, 100, "168 MATCHED UTC HOURS", 11, "#71807b", 600, "end"),
        text(left, 207, "01  /  DAILY SATELLITE VIEW", 12, "#31413d", 700, extra='letter-spacing="1.1"'),
        text(right, 207, "NASA SUOMI NPP · VIIRS TRUE COLOUR COMPOSITE", 11, "#71807b", 600, "end"),
    ])

    tile_width, tile_height, tile_gap = 198, 124, 9
    first_x, tile_y = 80, 226
    for index, day in enumerate(DAYS):
        image_path = RAW / f"viirs-{day.replace('-', '')}.jpg"
        if not image_path.exists():
            raise FileNotFoundError(f"Missing NASA VIIRS source image: {image_path}")
        x = first_x + index * (tile_width + tile_gap)
        parts.append(f'<g transform="translate({x},{tile_y})"><g clip-path="url(#tile{index})">'
                     f'<image href="{image_data(image_path)}" x="0" y="0" '
                     f'width="{tile_width}" height="{tile_height}" preserveAspectRatio="none"/>'
                     '</g><rect width="198" height="124" rx="5" fill="none" stroke="#d7ded8"/>')
        parts.append(text(tile_width / 2, 149, f"SEP {day[-2:]}", 11, "#51615b", 650, "middle"))
        parts.append('</g>')

    parts.extend([
        '<line x1="80" y1="402" x2="1520" y2="402" stroke="#e3e8e2"/>',
        text(left, 448, "02  /  TEMPERATURE CONTRAST", 12, "#31413d", 700, extra='letter-spacing="1.1"'),
        text(left, 478, "Valley minus summit", 24, "#203330", 600),
        text(left, 504, "Hourly air temperature difference  ·  ΔT = Garmisch-Partenkirchen − Zugspitze", 13, "#71807b"),
        '<line x1="1190" y1="474" x2="1222" y2="474" stroke="#bd6548" stroke-width="3" stroke-linecap="round"/>',
        text(1232, 479, "hourly ΔT", 12, "#52615b", 550),
        '<circle cx="1373" cy="474" r="4.5" fill="#ffffff" stroke="#bd6548" stroke-width="2.5"/>',
        text(1386, 479, "daily maximum", 12, "#52615b", 550),
        '<rect x="126" y="552" width="1366" height="348" fill="#fbfcfa" stroke="#e7ece7"/>',
    ])

    tick_step = 2 if y_max - y_min <= 20 else 5
    first_tick = math.ceil(y_min / tick_step) * tick_step
    for tick in range(first_tick, y_max + 1, tick_step):
        y = y_position(tick)
        colour = "#b8c4bd" if tick == 0 else "#e3e9e4"
        dash = '' if tick == 0 else ' stroke-dasharray="3 5"'
        parts.append(f'<line x1="126" y1="{y:.1f}" x2="1492" y2="{y:.1f}" stroke="{colour}"{dash}/>')
        parts.append(text(110, y + 4, f"{tick}°", 11, "#7a8882", 450, "end"))

    for day_index in range(7):
        start = day_index * 24
        end = start + 23
        center_x = (x_position(start) + x_position(end)) / 2
        if day_index:
            x = x_position(start)
            parts.append(f'<line x1="{x:.1f}" y1="552" x2="{x:.1f}" y2="900" stroke="#d5ddd7" stroke-dasharray="2 6"/>')
        parts.append(text(center_x, 930, f"SEP {14 + day_index:02d}", 11, "#687771", 650, "middle"))

    path_parts = []
    active = False
    for index, frame in enumerate(frames):
        value = frame["delta"]
        if value is None:
            active = False
            continue
        command = "L" if active else "M"
        path_parts.append(f"{command}{x_position(index):.1f},{y_position(value):.1f}")
        active = True
    parts.append(f'<g clip-path="url(#chartClip)"><path d="{" ".join(path_parts)}" fill="none" '
                 'stroke="#bd6548" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>')

    peak_rows = []
    for day_index in range(7):
        day_frames = frames[day_index * 24:(day_index + 1) * 24]
        available = [(day_index * 24 + i, f) for i, f in enumerate(day_frames) if f["delta"] is not None]
        if available:
            peak_index, peak = max(available, key=lambda pair: pair[1]["delta"])
            peak_rows.append((peak_index, peak))
    for peak_index, peak in peak_rows:
        parts.append(f'<circle cx="{x_position(peak_index):.1f}" cy="{y_position(peak["delta"]):.1f}" '
                     'r="4.5" fill="#ffffff" stroke="#bd6548" stroke-width="2.5"/>')
    parts.append('</g>')
    parts.extend([
        text(80, 990, "DWD hourly observations · NASA GIBS daily composites", 12, "#51615b", 600),
        text(80, 1015, "Limits: stations are about 8 km apart; daily composites have no single hourly timestamp; neither dataset identifies cumulonimbus.", 11, "#7a8882"),
        text(1520, 990, f"{len(valid)} VALID PAIRS  ·  {min(values):.1f} TO {max(values):.1f} °C", 11, "#687771", 650, "end"),
        '</svg>',
    ])
    return "\n".join(parts)


def main():
    frames = read_paired_hours()
    valid_pairs = sum(frame["delta"] is not None for frame in frames)
    if len(frames) != 168:
        raise ValueError(f"Expected 168 hourly slots, found {len(frames)}")
    OUT.mkdir(exist_ok=True)
    output = OUT / "plot.svg"
    output.write_text(build_svg(frames), encoding="utf-8")
    print(f"Read 336 station records into {valid_pairs} valid hourly pairs.")
    print(f"Saved {output.relative_to(ROOT).as_posix()} ({output.stat().st_size:,} bytes).")


if __name__ == "__main__":
    main()
