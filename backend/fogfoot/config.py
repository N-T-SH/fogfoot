"""Loads config/settings.yaml (repo root) into typed settings."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, Field

REPO_ROOT = Path(__file__).resolve().parents[2]


class PilotCfg(BaseModel):
    name: str
    ward_kml_url: str
    ward_name_patterns: list[str]
    bbox_buffer_m: float = 200


class OsmCfg(BaseModel):
    overpass_url: str = "https://overpass-api.de/api/interpreter"
    user_agent: str = "fogfoot/0.1"
    cache_dir: str = "data/osm"
    timeout_s: int = 180


class UnitsCfg(BaseModel):
    projected_crs: str = "EPSG:32643"
    drop_median_side: bool = True
    median_search_m: float = 30             # how far to look for the opposing carriageway
    median_min_overlap: float = 0.5         # fraction of the kerb that must run alongside it
    median_min_antiparallel_deg: float = 150
    length_m: float = 100
    min_length_m: float = 30
    kerb_offset_by_highway: dict[str, float]
    include_highway: list[str]

    def offset_for(self, highway: str) -> float:
        return self.kerb_offset_by_highway.get(highway, self.kerb_offset_by_highway.get("default", 4.5))


class Settings(BaseModel):
    pilot: PilotCfg
    osm: OsmCfg = Field(default_factory=OsmCfg)
    units: UnitsCfg

    def data_path(self, rel: str) -> Path:
        p = REPO_ROOT / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        return p


@lru_cache
def load_settings(path: str | None = None) -> Settings:
    p = Path(path) if path else REPO_ROOT / "config" / "settings.yaml"
    return Settings.model_validate(yaml.safe_load(p.read_text()))
