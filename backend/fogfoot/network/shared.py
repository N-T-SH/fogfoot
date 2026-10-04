"""Detect narrow lanes (no room for footpaths) from building footprints.

OSM carries almost no width data for lanes, so the width is *measured*: from points along each way we cast
a probe to the left and to the right and record the distance to the nearest building face. A way whose
median face-to-face gap is small, with buildings on both sides for most of its length, is a shared street.
"""
from __future__ import annotations

import geopandas as gpd
import numpy as np
import shapely
from shapely import STRtree

from ..config import SharedStreetsCfg


def _samples(line, step: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Points along `line` and the unit left-normal at each."""
    L = line.length
    d = np.arange(step / 2, L, step) if L > step else np.array([L / 2])
    p = shapely.line_interpolate_point(line, d)
    a = shapely.line_interpolate_point(line, np.clip(d - 1.0, 0, L))
    b = shapely.line_interpolate_point(line, np.clip(d + 1.0, 0, L))
    tx, ty = shapely.get_x(b) - shapely.get_x(a), shapely.get_y(b) - shapely.get_y(a)
    n = np.hypot(tx, ty)
    n[n == 0] = 1.0
    return p, -ty / n, tx / n  # left normal of direction (tx, ty) is (-ty, tx)


def _nearest_building(points, nx, ny, sign: int, buildings: gpd.GeoSeries, tree: STRtree, probe: float) -> np.ndarray:
    """Distance from each point along (sign*normal) to the first building face, inf if none within `probe`."""
    px, py = shapely.get_x(points), shapely.get_y(points)
    ends = shapely.points(px + sign * nx * probe, py + sign * ny * probe)
    rays = shapely.linestrings(np.stack([np.stack([px, py], 1), np.stack([shapely.get_x(ends), shapely.get_y(ends)], 1)], 1))
    ri, bi = tree.query(rays, predicate="intersects")
    out = np.full(len(points), np.inf)
    if len(ri):
        inter = shapely.intersection(rays[ri], buildings.values[bi])
        dist = shapely.distance(inter, points[ri])
        np.minimum.at(out, ri, dist)
    return out


def way_gap_stats(road_geom, buildings: gpd.GeoSeries, tree: STRtree, cfg: SharedStreetsCfg) -> tuple[float, float]:
    """(median face-to-face gap in metres over samples with a building each side, fraction of samples with both)."""
    pts, nx, ny = _samples(road_geom, cfg.sample_every_m)
    dl = _nearest_building(pts, nx, ny, +1, buildings, tree, cfg.probe_m)
    dr = _nearest_building(pts, nx, ny, -1, buildings, tree, cfg.probe_m)
    both = np.isfinite(dl) & np.isfinite(dr)
    if not both.any():
        return float("inf"), 0.0
    return float(np.median(dl[both] + dr[both])), float(both.mean())


def shared_street_gaps(roads: gpd.GeoDataFrame, buildings: gpd.GeoDataFrame, cfg: SharedStreetsCfg) -> dict[int, float]:
    """osm_way_id -> median gap (m) for every way classified as a shared street. Both inputs in a metric CRS."""
    if not cfg.enabled or buildings is None or buildings.empty:
        return {}
    bgeom = buildings.geometry.reset_index(drop=True)
    tree = STRtree(bgeom.values)
    out: dict[int, float] = {}
    for _, r in roads[roads["highway"].isin(cfg.candidate_highway)].iterrows():
        gap, frac = way_gap_stats(r.geometry, bgeom, tree, cfg)
        if frac >= cfg.min_both_sides_fraction and gap <= cfg.max_gap_m:
            out[int(r["osm_way_id"])] = round(gap, 1)
    return out
