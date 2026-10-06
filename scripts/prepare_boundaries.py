"""Convert a raw admin-0 boundaries file into ``data/where-we-work/boundaries.geojson``.

The maps only need country outlines at world scale, so the raw file (e.g. the World Bank
Group official boundaries, ``adm0-wbg.geojson``) is simplified to keep the site light and
reduced to two properties per country: ``iso3`` and ``name``.

This is a one-off step, run when the boundaries change; the output is committed and the
regular build (``build_where_we_work.py``) reads it. Requires ``shapely``::

    pip install shapely
    python scripts/prepare_boundaries.py data/where-we-work/adm0-wbg.geojson \
        --source "World Bank Group official boundaries"
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "where-we-work" / "boundaries.geojson"

# Property names tried in order, covering the WBG and Natural Earth schemas
ISO_FIELDS = ["ISO_A3", "WB_A3", "ISO_A3_EH", "ADM0_A3", "iso3"]
NAME_FIELDS = ["NAM_0", "NAME", "name"]


def first_valid(props: dict, fields: list[str]) -> str | None:
    for f in fields:
        v = props.get(f)
        if v not in (None, "", "-99", -99):
            return str(v)
    return None


def drop_specks(geom, min_area: float):
    """Drop polygon parts and holes smaller than ``min_area``, always keeping the largest part."""
    polys = sorted(getattr(geom, "geoms", [geom]), key=lambda p: p.area, reverse=True)
    polys = [Polygon(p.exterior, [h for h in p.interiors if Polygon(h).area >= min_area]) for p in polys]
    keep = [polys[0]] + [p for p in polys[1:] if p.area >= min_area]
    return keep[0] if len(keep) == 1 else MultiPolygon(keep)


def round_coords(coords, ndigits: int):
    if coords and isinstance(coords[0], (int, float)):
        return [round(coords[0], ndigits), round(coords[1], ndigits)]
    return [round_coords(c, ndigits) for c in coords]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("src", type=Path, help="raw admin-0 GeoJSON (WGS84)")
    parser.add_argument("--source", required=True, help="attribution shown on the maps")
    parser.add_argument("--tolerance", type=float, default=0.08, help="simplification tolerance in degrees")
    parser.add_argument(
        "--min-area", type=float, default=0.05, help="drop islands smaller than this (sq. degrees, ~600 km2)"
    )
    parser.add_argument(
        "--close", type=float, default=0.015, help="fill inlets narrower than about twice this (degrees)"
    )
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()

    raw = json.loads(args.src.read_text())
    # Group parts by ISO3. Areas without a code (e.g. disputed areas) are kept under a
    # placeholder key so they are still drawn on the base map.
    parts: dict[str, list] = {}
    names: dict[str, str] = {}
    unnamed = 0
    for f in raw["features"]:
        if not f.get("geometry"):
            continue
        props = f.get("properties") or {}
        iso3 = first_valid(props, ISO_FIELDS)
        if iso3 is None:
            unnamed += 1
            iso3 = f"_AREA{unnamed:03d}"
        name = first_valid(props, NAME_FIELDS) or iso3
        # a country split over several features keeps the name of its main (member state) part
        if iso3 not in names or props.get("WB_STATUS") == "Member State":
            names[iso3] = name
        parts.setdefault(iso3, []).append(shape(f["geometry"]))

    features, dropped = [], []
    for iso3, geoms in parts.items():
        geom = drop_specks(unary_union(geoms), args.min_area)
        # Close narrow inlets and estuaries, which otherwise turn into slivers once simplified
        geom = geom.simplify(args.tolerance / 5).buffer(args.close).buffer(-args.close)
        geom = drop_specks(geom, args.min_area).simplify(args.tolerance, preserve_topology=True)
        if geom.is_empty:
            dropped.append(names[iso3])
            continue
        m = mapping(geom)
        features.append(
            {
                "type": "Feature",
                "properties": {"iso3": iso3, "name": names[iso3]},
                "geometry": {"type": m["type"], "coordinates": round_coords(m["coordinates"], 2)},
            }
        )

    out = {"type": "FeatureCollection", "source": args.source, "features": features}
    args.out.write_text(json.dumps(out, separators=(",", ":")))
    print(f"Wrote {len(features)} features ({args.out.stat().st_size / 1e3:.0f} KB) to {args.out}")
    if unnamed:
        print(f"{unnamed} areas without an ISO3 code kept for the base map (e.g. disputed areas)")
    if dropped:
        print(f"Dropped {len(dropped)} areas too small to survive simplification: {', '.join(dropped)}")


if __name__ == "__main__":
    main()
