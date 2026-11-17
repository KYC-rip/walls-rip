#!/usr/bin/env python3
"""Generate web hero derivatives for the walls.rip destination pages.

Source: ~/Projects/landmark-per-country (Wikimedia Commons photographs, one per
country, with artist/license/source in landmarks/manifest.json).

Output (committed into the walls-rip repo):
  public/landmarks/<ISO>.webp       1280x720 centre-cropped WebP, q58
  src/data/landmarks.json           { iso: { landmark, artist, license, license_url, source_url } }

Only countries present in the live destination index are emitted. Run with the
conda python (PIL + requests free):
  /opt/homebrew/Caskroom/miniconda/base/bin/python scripts/landmark-derivatives.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

from PIL import Image

SRC = Path(os.environ.get("LANDMARK_DIR", Path.home() / "Projects/landmark-per-country"))
WALLS = Path(__file__).resolve().parent.parent
OUT_IMG = WALLS / "public/landmarks"
OUT_JSON = WALLS / "src/data/landmarks.json"
SIZE = (1280, 720)
QUALITY = 58
INDEX_URL = os.environ.get("DEST_INDEX_URL", "https://api.kyc.rip/v1/tools/esim/destinations")


def destination_codes() -> set[str]:
    request = urllib.request.Request(INDEX_URL, headers={"User-Agent": "walls-rip-landmarks/1.0"})
    with urllib.request.urlopen(request, timeout=60) as res:
        data = json.load(res)
    return {row["code"].upper() for row in data["destinations"]}


def centre_crop(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    target_ratio = size[0] / size[1]
    w, h = im.size
    ratio = w / h
    if ratio > target_ratio:          # too wide: trim sides
        new_w = int(h * target_ratio)
        left = (w - new_w) // 2
        box = (left, 0, left + new_w, h)
    else:                             # too tall: trim top/bottom, bias upward
        new_h = int(w / target_ratio)
        top = max(0, int((h - new_h) * 0.45))
        box = (0, top, w, top + new_h)
    return im.crop(box).resize(size, Image.LANCZOS)


def main() -> int:
    manifest = json.load(open(SRC / "landmarks/manifest.json"))
    items = {item["iso"].upper(): item for item in manifest["items"] if item.get("filename")}
    codes = destination_codes()

    OUT_IMG.mkdir(parents=True, exist_ok=True)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)

    out: dict[str, dict] = {}
    total = 0
    skipped: list[str] = []
    for code in sorted(codes):
        item = items.get(code)
        if not item:
            skipped.append(code)
            continue
        source = SRC / "landmarks" / item["filename"]
        if not source.exists():
            skipped.append(code)
            continue
        with Image.open(source) as im:
            im = im.convert("RGB")
            cropped = centre_crop(im, SIZE)
        dest = OUT_IMG / f"{code}.webp"
        cropped.save(dest, "WEBP", quality=QUALITY, method=6)
        total += dest.stat().st_size
        out[code] = {
            "landmark": item.get("landmark"),
            "artist": item.get("artist") or "Wikimedia Commons",
            "license": item.get("license") or "Wikimedia Commons",
            "license_url": item.get("license_url"),
            "source_url": item.get("source_url"),
        }

    OUT_JSON.write_text(json.dumps(out, indent=1, ensure_ascii=False, sort_keys=True) + "\n")
    print(f"wrote {len(out)} landmarks, {total / 1e6:.1f} MB total "
          f"(avg {total / max(1, len(out)) / 1024:.0f} KB)")
    if skipped:
        print(f"skipped (no landmark file): {', '.join(skipped)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
