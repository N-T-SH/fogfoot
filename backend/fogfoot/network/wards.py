"""GBA ward boundaries (OpenCity KML) and pilot-ward selection."""
from __future__ import annotations

import re
from pathlib import Path

import geopandas as gpd
import requests

from ..config import Settings


def fetch_wards_kml(cfg: Settings, force: bool = False) -> Path:
    dest = cfg.data_path("data/gba_wards.kml")
    if dest.exists() and not force:
        return dest
    r = requests.get(cfg.pilot.ward_kml_url, timeout=120, headers={"User-Agent": cfg.osm.user_agent})
    r.raise_for_status()
    dest.write_bytes(r.content)
    return dest


def load_wards(cfg: Settings) -> gpd.GeoDataFrame:
    """All 369 wards. `ward_id` repeats across corporations, so the key is `id2` (e.g. ward_369_final.67)."""
    gdf = gpd.read_file(fetch_wards_kml(cfg))
    out = gdf[["id2", "ward_id", "ward_name", "Corporation", "ac", "geometry"]].rename(
        columns={"id2": "ward_key", "ward_id": "ward_no", "Corporation": "corporation", "ac": "assembly"}
    )
    if out["ward_key"].duplicated().any():
        raise ValueError("ward_key is not unique in the KML")
    return out.set_crs(4326, allow_override=True).reset_index(drop=True)


def pilot_wards(wards: gpd.GeoDataFrame, patterns: list[str]) -> gpd.GeoDataFrame:
    """Wards whose ward_name contains any pattern as a whole word/phrase (case-insensitive).

    Whole-word matching matters: "Agara" must not match "Hoysala Nagara Central".
    """
    pat = "|".join(rf"\b{re.escape(p.strip())}\b" for p in patterns)
    sel = wards[wards["ward_name"].str.contains(pat, case=False, regex=True, na=False)]
    if sel.empty:
        raise ValueError(f"no wards match {patterns}")
    return sel.reset_index(drop=True)
