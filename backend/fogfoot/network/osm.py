"""Fetch roads (and existing sidewalk mapping) from Overpass, with an on-disk cache."""
from __future__ import annotations

import hashlib
import json
import time

import geopandas as gpd
import requests
from shapely.geometry import LineString

from ..config import Settings

BBox = tuple[float, float, float, float]  # (min_lon, min_lat, max_lon, max_lat)


def _query(bbox: BBox, highways: list[str], timeout: int) -> str:
    s, w, n, e = bbox[1], bbox[0], bbox[3], bbox[2]
    hw = "|".join(highways)
    return (
        f"[out:json][timeout:{timeout}];"
        f'(way["highway"~"^({hw})$"]({s},{w},{n},{e});'
        f'way["highway"="footway"]["footway"="sidewalk"]({s},{w},{n},{e}););'
        "out tags geom;"
    )


def _post_overpass(cfg: Settings, q: str) -> dict:
    last: Exception | None = None
    for attempt in range(4):
        try:
            r = requests.post(
                cfg.osm.overpass_url, data={"data": q}, timeout=cfg.osm.timeout_s + 30,
                headers={"User-Agent": cfg.osm.user_agent, "Accept": "application/json"},
            )
            if r.status_code in (429, 504):
                time.sleep(5 * (attempt + 1)); continue
            r.raise_for_status()
            return r.json()
        except requests.RequestException as ex:  # noqa: PERF203
            last = ex; time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"Overpass failed: {last}")


def fetch_osm(cfg: Settings, bbox: BBox, force: bool = False) -> dict:
    q = _query(bbox, cfg.units.include_highway, cfg.osm.timeout_s)
    key = hashlib.sha1(q.encode()).hexdigest()[:12]
    cache = cfg.data_path(f"{cfg.osm.cache_dir}/overpass_{key}.json")
    if cache.exists() and not force:
        return json.loads(cache.read_text())
    data = _post_overpass(cfg, q)
    cache.write_text(json.dumps(data))
    return data


def load_roads(cfg: Settings, bbox: BBox, force: bool = False) -> gpd.GeoDataFrame:
    """Drivable/street ways as LineStrings (EPSG:4326) with OSM tags relevant to footpaths."""
    data = fetch_osm(cfg, bbox, force)
    rows, geoms = [], []
    sidewalk_ways = 0
    for el in data.get("elements", []):
        if el.get("type") != "way" or "geometry" not in el:
            continue
        tags = el.get("tags", {})
        if tags.get("highway") == "footway":
            sidewalk_ways += 1
            continue
        coords = [(p["lon"], p["lat"]) for p in el["geometry"]]
        if len(coords) < 2:
            continue
        geoms.append(LineString(coords))
        rows.append({
            "osm_way_id": el["id"], "highway": tags.get("highway"), "name": tags.get("name"),
            "oneway": tags.get("oneway") in ("yes", "true", "1"),
            "sidewalk_tag": tags.get("sidewalk"),
        })
    gdf = gpd.GeoDataFrame(rows, geometry=geoms, crs=4326)
    gdf.attrs["separate_sidewalk_ways"] = sidewalk_ways
    return gdf


def _buildings_query(bbox: BBox, timeout: int) -> str:
    s, w, n, e = bbox[1], bbox[0], bbox[3], bbox[2]
    return f'[out:json][timeout:{timeout}];way["building"]({s},{w},{n},{e});out geom qt;'


def load_buildings(cfg: Settings, bbox: BBox, force: bool = False) -> gpd.GeoDataFrame:
    """Building footprints (closed ways only; multipolygon relations are ignored) as Polygons, EPSG:4326."""
    from shapely.geometry import Polygon

    q = _buildings_query(bbox, cfg.osm.timeout_s)
    key = hashlib.sha1(q.encode()).hexdigest()[:12]
    cache = cfg.data_path(f"{cfg.osm.cache_dir}/buildings_{key}.json")
    if cache.exists() and not force:
        data = json.loads(cache.read_text())
    else:
        data = _post_overpass(cfg, q)
        cache.write_text(json.dumps(data))
    polys = []
    for el in data.get("elements", []):
        pts = [(p["lon"], p["lat"]) for p in el.get("geometry", [])]
        if len(pts) >= 4 and pts[0] == pts[-1]:
            poly = Polygon(pts)
            if poly.is_valid and not poly.is_empty:
                polys.append(poly)
    return gpd.GeoDataFrame(geometry=polys, crs=4326)
