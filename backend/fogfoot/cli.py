"""`fogfoot` command line."""
from __future__ import annotations

import json

import geopandas as gpd
import typer

from .config import load_settings
from .network.osm import load_roads
from .network.units import build_units
from .network.wards import load_wards, pilot_wards

app = typer.Typer(help="fogfoot batch pipeline", no_args_is_help=True)


@app.callback()
def main() -> None:
    """fogfoot batch pipeline."""


@app.command("build-units")
def build_units_cmd(
    pilot: bool = typer.Option(True, help="Limit to the pilot wards in config/settings.yaml"),
    force: bool = typer.Option(False, help="Ignore cached downloads"),
    out: str = typer.Option("data/units.geojson", help="Output GeoJSON (EPSG:4326)"),
) -> None:
    """Download wards + OSM roads, build 100 m kerb units, write GeoJSON."""
    cfg = load_settings()
    wards = load_wards(cfg)
    sel = pilot_wards(wards, cfg.pilot.ward_name_patterns) if pilot else wards
    typer.echo(f"{len(sel)} wards: " + ", ".join(sorted(sel['ward_name'])))
    proj = sel.to_crs(cfg.units.projected_crs)
    area = proj.geometry.union_all().buffer(cfg.pilot.bbox_buffer_m)
    bbox = tuple(gpd.GeoSeries([area], crs=proj.crs).to_crs(4326).total_bounds)
    roads = load_roads(cfg, bbox, force)  # type: ignore[arg-type]
    typer.echo(f"{len(roads)} OSM ways; {roads.attrs.get('separate_sidewalk_ways', 0)} separate sidewalk ways mapped")
    units = build_units(roads, sel, cfg)
    path = cfg.data_path(out)
    units.to_crs(4326).to_file(path, driver="GeoJSON")
    stats = {
        "units": len(units), "total_km": round(units["length_m"].sum() / 1000, 1),
        "by_highway": units.groupby("highway")["length_m"].sum().div(1000).round(1).to_dict(),
        "by_ward_km": units.groupby("ward_name")["length_m"].sum().div(1000).round(1).to_dict(),
    }
    typer.echo(json.dumps(stats, indent=2))
    typer.echo(f"wrote {path}")


if __name__ == "__main__":
    app()
