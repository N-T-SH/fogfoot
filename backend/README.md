# fogfoot backend (batch pipeline)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
fogfoot build-units --pilot      # downloads wards + OSM roads, writes data/units.geojson
```

Reads `config/*.yaml` at the repo root. Downloads are cached under `data/` (gitignored).
Overpass (OpenStreetMap) must be reachable; if it is not, run the `build-units` GitHub Actions workflow instead.
