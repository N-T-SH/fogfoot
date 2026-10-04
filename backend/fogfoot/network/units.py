"""OSM roads -> 100 m kerb units, one per side of the road."""
from __future__ import annotations

import math

import geopandas as gpd
import numpy as np
from shapely import line_merge
from shapely.geometry import LineString, MultiLineString
from shapely.ops import substring

from ..config import Settings
from .shared import shared_street_gaps


def _lines(geom) -> list[LineString]:
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, LineString):
        return [geom]
    if isinstance(geom, MultiLineString):
        return list(geom.geoms)
    if hasattr(geom, "geoms"):
        return [g for sub in geom.geoms for g in _lines(sub)]
    return []


def _bearing(line: LineString) -> float:
    (x0, y0), (x1, y1) = line.coords[0], line.coords[-1]
    return math.degrees(math.atan2(x1 - x0, y1 - y0)) % 360


def _angle_diff(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d


def offset_kerbs(roads: gpd.GeoDataFrame, cfg: Settings, shared: dict[int, float] | None = None) -> gpd.GeoDataFrame:
    """Offset each way to a left (L) and right (R) kerb line, in the projected CRS.

    Sides are relative to the way's digitised direction. On one-way carriageways that sit across a median
    from an opposing carriageway (typical dual carriageways mapped as two ways), the median-facing kerb is
    dropped when `drop_median_side` is set: nobody walks on a median, and keeping it duplicates kerb length.

    Ways listed in `shared` (osm_way_id -> measured gap) are narrow lanes with no room for footpaths: they get a
    single unit on the centreline (side "C") instead of a left and a right kerb.
    """
    shared = shared or {}
    u = cfg.units
    r = roads.to_crs(u.projected_crs).reset_index(drop=True)
    oneways = r[r["oneway"]]
    osidx = oneways.sindex if len(oneways) else None
    out = []
    for i, row in r.iterrows():
        d = u.offset_for(row["highway"])
        if int(row["osm_way_id"]) in shared:
            for ln in _lines(row.geometry):
                out.append({**row.drop("geometry").to_dict(), "side": "C", "offset_m": 0.0, "kind": "shared",
                            "gap_m": shared[int(row["osm_way_id"])], "geometry": ln})
            continue
        for side, sign in (("L", 1), ("R", -1)):
            kerb = row.geometry.offset_curve(sign * d, join_style="round", quad_segs=4)
            if kerb is None or kerb.is_empty:
                continue
            median = False
            if u.drop_median_side and row["oneway"] and osidx is not None and side == "R" and row["name"]:
                # Driving is on the left in India, so a oneway way's right kerb faces the median. It is a
                # median kerb only if an opposing carriageway of the *same road* runs alongside it.
                near = oneways.iloc[list(osidx.query(kerb.buffer(u.median_search_m), predicate="intersects"))]
                for j, o in near.iterrows():
                    if j == i or o["osm_way_id"] == row["osm_way_id"]:
                        continue
                    if o["name"] != row["name"] or o["highway"] != row["highway"]:
                        continue
                    if _angle_diff(_bearing(row.geometry), _bearing(o.geometry)) < u.median_min_antiparallel_deg:
                        continue
                    alongside = kerb.intersection(o.geometry.buffer(u.median_search_m)).length / max(kerb.length, 1e-6)
                    if alongside >= u.median_min_overlap:
                        median = True
                        break
            if median:
                continue
            for ln in _lines(line_merge(kerb) if kerb.geom_type == "MultiLineString" else kerb):
                out.append({**row.drop("geometry").to_dict(), "side": side, "offset_m": d, "kind": "kerb", "gap_m": None, "geometry": ln})
    return gpd.GeoDataFrame(out, geometry="geometry", crs=u.projected_crs)


def split_units(kerbs: gpd.GeoDataFrame, cfg: Settings) -> gpd.GeoDataFrame:
    """Cut each kerb line into ~length_m pieces (equal parts); drop lines shorter than min_length_m."""
    u = cfg.units
    rows = []
    seq: dict[tuple[int, str], int] = {}
    for _, k in kerbs.iterrows():
        L = k.geometry.length
        if L < u.min_length_m:
            continue
        n = max(1, round(L / u.length_m))
        edges = np.linspace(0, L, n + 1)
        key = (k["osm_way_id"], k["side"])
        for a, b in zip(edges[:-1], edges[1:]):
            piece = substring(k.geometry, a, b)
            if piece.is_empty or piece.length < 1:
                continue
            s = seq.get(key, 0)
            seq[key] = s + 1
            rows.append({
                "unit_id": f"{k['osm_way_id']}_{s}_{k['side']}",
                "osm_way_id": k["osm_way_id"], "side": k["side"], "highway": k["highway"], "name": k["name"],
                "oneway": k["oneway"], "sidewalk_tag": k["sidewalk_tag"], "kind": k["kind"], "gap_m": k["gap_m"],
                "length_m": round(piece.length, 1), "geometry": piece,
            })
    return gpd.GeoDataFrame(rows, geometry="geometry", crs=kerbs.crs)


def assign_wards(units: gpd.GeoDataFrame, wards: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Ward of each unit's midpoint; units outside every given ward get ward_key=None."""
    mid = units.copy()
    mid["geometry"] = units.geometry.interpolate(0.5, normalized=True)
    w = wards.to_crs(units.crs)[["ward_key", "ward_name", "corporation", "geometry"]]
    j = gpd.sjoin(mid, w, how="left", predicate="within").drop_duplicates("unit_id")
    out = units.merge(j[["unit_id", "ward_key", "ward_name", "corporation"]], on="unit_id", how="left")
    return gpd.GeoDataFrame(out, geometry="geometry", crs=units.crs)


def build_units(roads: gpd.GeoDataFrame, wards: gpd.GeoDataFrame, cfg: Settings, clip_to_wards: bool = True,
                buildings: gpd.GeoDataFrame | None = None) -> gpd.GeoDataFrame:
    """Kerb units for every road; narrow lanes (measured from `buildings`, if given) become one shared unit."""
    shared: dict[int, float] = {}
    if buildings is not None and cfg.units.shared_streets.enabled:
        shared = shared_street_gaps(roads.to_crs(cfg.units.projected_crs), buildings.to_crs(cfg.units.projected_crs),
                                    cfg.units.shared_streets)
    kerbs = offset_kerbs(roads, cfg, shared)
    units = assign_wards(split_units(kerbs, cfg), wards)
    if clip_to_wards:
        units = units[units["ward_key"].notna()].reset_index(drop=True)
    return units
