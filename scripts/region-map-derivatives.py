#!/usr/bin/env python3
"""Generate world-map thumbnails for the multi-area eSIM bundles.

Each bundle card shows a small outline map with the covered region highlighted,
mirroring the reference storefront. The member sets below are a visual cue
(the exact area count lives in the bundle name); they are grouped by bundle
family, so ASIA-7-AREAS and ASIA-20-AREAS share the "Asia" highlight.

Source: Natural Earth 110m countries (public domain), fetched through jsDelivr
and cached in scripts/.cache (not committed).

Output: public/region-maps/<bundle-slug>.svg, roughly 360x180 viewBox.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / ".cache" / "ne_110m_countries.geojson"
OUT = ROOT / "public/region-maps"
URL = "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson"

WIDTH, HEIGHT = 360, 180
PAD = 4

ASIA = ['CN', 'JP', 'KR', 'TH', 'VN', 'MY', 'SG', 'ID', 'PH', 'IN', 'TW', 'HK', 'MO',
        'KH', 'LA', 'MM', 'BN', 'BD', 'LK', 'NP', 'PK', 'MN', 'BT', 'MV']
SOUTH_ASIA = ['IN', 'BD', 'LK', 'NP', 'PK', 'BT', 'MV', 'AF']
SOUTH_EAST_ASIA = ['TH', 'VN', 'MY', 'SG', 'ID', 'PH', 'KH', 'LA', 'MM', 'BN']
CENTRAL_ASIA = ['KZ', 'UZ', 'TJ', 'KG', 'TM']
EUROPE = ['GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'CH', 'SE', 'NO', 'DK', 'FI',
          'PT', 'IE', 'PL', 'CZ', 'GR', 'RO', 'HU', 'HR', 'BG', 'SK', 'SI', 'LT', 'LV',
          'EE', 'LU', 'MT', 'IS', 'CY']
BALKANS = ['AL', 'BA', 'BG', 'HR', 'GR', 'ME', 'MK', 'RO', 'RS', 'SI', 'XK']
NORTH_AMERICA = ['US', 'CA', 'MX']
SOUTH_AMERICA = ['BR', 'AR', 'CL', 'CO', 'PE', 'EC', 'UY', 'PY', 'BO', 'VE', 'GY', 'SR']
LATIN_AMERICA = ['MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'EC', 'UY', 'PY', 'BO', 'VE',
                 'CR', 'PA', 'GT', 'HN', 'SV', 'NI', 'DO', 'CU', 'JM', 'PR']
CARIBBEAN = ['CU', 'JM', 'HT', 'DO', 'PR', 'TT', 'BB', 'BS', 'BZ', 'GD', 'LC', 'VC', 'AG', 'KN', 'DM']
AFRICA = ['ZA', 'NG', 'KE', 'EG', 'MA', 'GH', 'TZ', 'ET', 'DZ', 'TN', 'SN', 'CI', 'CM',
          'UG', 'AO', 'MZ', 'ZM', 'ZW', 'NA', 'BW', 'MU', 'SC', 'RW']
MIDDLE_EAST = ['AE', 'SA', 'QA', 'BH', 'KW', 'OM', 'JO', 'IL', 'TR', 'IR', 'IQ', 'LB', 'YE']
OCEANIA = ['AU', 'NZ', 'FJ', 'PG', 'WS', 'TO', 'VU', 'SB', 'NC', 'PF']


def family_for(slug: str) -> list[str]:
    if slug.startswith('south-east-asia'):
        return SOUTH_EAST_ASIA
    if slug.startswith('south-asia'):
        return SOUTH_ASIA
    if slug.startswith('central-asia'):
        return CENTRAL_ASIA
    if slug.startswith('asia-'):
        return ASIA
    if slug.startswith('balkans'):
        return BALKANS
    if slug.startswith('europe'):
        return EUROPE
    if slug.startswith('north-america'):
        return NORTH_AMERICA
    if slug.startswith('latin-america'):
        return LATIN_AMERICA
    if slug.startswith('south-america'):
        return SOUTH_AMERICA
    if slug.startswith('caribbean'):
        return CARIBBEAN
    if slug.startswith('africa'):
        return AFRICA
    if slug.startswith('middle-east'):
        return MIDDLE_EAST
    if slug.startswith('oceania'):
        return OCEANIA
    return []  # global-*: highlight everything


def project(lon: float, lat: float) -> tuple[float, float]:
    inner_w = WIDTH - PAD * 2
    inner_h = HEIGHT - PAD * 2
    x = PAD + (lon + 180.0) / 360.0 * inner_w
    y = PAD + (90.0 - lat) / 180.0 * inner_h
    return round(x), round(y)


def ring_path(ring) -> str:
    parts = []
    for i, (lon, lat) in enumerate(ring):
        x, y = project(lon, lat)
        parts.append(('M' if i == 0 else 'L') + f'{x},{y}')
    return ''.join(parts) + 'Z'


def geometry_paths(geometry, min_points: int = 6) -> list[str]:
    """Ring paths; tiny islands are dropped from the base map to keep the
    thumbnail light (highlighted countries keep every ring)."""
    kind = geometry.get('type')
    coords = geometry.get('coordinates') or []
    rings = []
    if kind == 'Polygon':
        rings = coords
    elif kind == 'MultiPolygon':
        rings = [ring for polygon in coords for ring in polygon]
    return [ring_path(ring) for ring in rings if len(ring) >= min_points]


def main() -> int:
    if not CACHE.exists():
        raise SystemExit(f'missing {CACHE} — download {URL} there first')
    data = json.loads(CACHE.read_text())
    country_paths: dict[str, list[str]] = {}
    country_paths_full: dict[str, list[str]] = {}
    for feature in data['features']:
        props = feature.get('properties') or {}
        code = props.get('ISO_A2') or props.get('ISO_A2_EH')
        if not code or code == '-99' or code == 'AQ':
            continue
        geometry = feature.get('geometry') or {}
        country_paths.setdefault(code, []).extend(geometry_paths(geometry))
        country_paths_full.setdefault(code, []).extend(geometry_paths(geometry, min_points=1))

    slugs = json.loads(os.environ.get('BUNDLE_SLUGS', '[]')) or None
    if not slugs:
        # Read the registry from the API repo when available; fall back to the
        # slugs of the files already generated (idempotent regeneration).
        registry = Path(os.environ.get(
            'REGION_BUNDLES_TS',
            Path.home() / 'Projects/kyc-rip/api/src/libs/esim/regionBundles.ts',
        ))
        if registry.exists():
            import re
            slugs = re.findall(r"code: '([A-Z0-9-]+)'", registry.read_text())
            slugs = [s.lower() for s in slugs]
    if not slugs:
        raise SystemExit('no bundle slugs: set BUNDLE_SLUGS or REGION_BUNDLES_TS')

    OUT.mkdir(parents=True, exist_ok=True)
    for slug in slugs:
        highlight = set(family_for(slug))
        base_parts: list[str] = []
        on_parts: list[str] = []
        for code, paths in sorted(country_paths.items()):
            highlighted = not highlight or code in highlight
            target = on_parts if highlighted else base_parts
            target.extend(country_paths_full.get(code, paths) if highlighted else paths)
        # One path element per layer keeps the file small and the DOM cheap.
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" '
            f'width="{WIDTH}" height="{HEIGHT}" role="presentation">'
            f'<path fill="#8b98a5" opacity=".5" d="{"".join(base_parts)}"/>'
            f'<path fill="#0ea5b7" opacity=".95" d="{"".join(on_parts)}"/>'
            '</svg>'
        )
        (OUT / f'{slug}.svg').write_text(svg)
        print(f'{slug}: {(OUT / f"{slug}.svg").stat().st_size // 1024} KB')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
