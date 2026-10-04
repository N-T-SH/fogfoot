# fogfoot — Implementation Plan

> Name: **fogfoot**. A citizen-powered, monthly-refreshed, open record of which footpaths in Bengaluru meet the Supreme Court's right-to-walk standard, built from everyday walks and gamified with location-based hotspots.

This plan is written for Claude Code. Work phase by phase. Each phase has acceptance criteria; do not start the next phase until the current one passes. Where this plan says **SPIKE**, build a throwaway proof first and report findings before committing to the approach.

---

## 0. MVP release scope and target devices

**Goal.** A public release (Google Play + web) for the Bengaluru pilot cluster, usable by real people on the phones they already own. It is an MVP: fewer features, each one solid on a cheap phone, rather than the full game.

### 0.1 Target device profile ("reference low-end phone")

Design, test and budget against this, not against a developer flagship. Bengaluru's mass-market Android base is dominated by budget phones.

| Attribute | Assumption |
|---|---|
| OS / browser | Android 9–14 (incl. Android Go), Chrome / Samsung Internet / Mi Browser, WebView updated within ~1 year. Support Chrome ≥ 90. |
| RAM | 2–3 GB total, ~700 MB free once OEM skin and background apps load. Tab budget ≤ 150 MB. |
| CPU | Cortex-A53/A55-class (Snapdragon 4xx/6xx, Helio G/P, Unisoc). Test at 4–6× CPU throttle. |
| GPU | Weak; WebGL may be unavailable, slow or crash on context loss. Do not depend on it. |
| Storage | 32 GB, often <3 GB free. Frame queue must respect `navigator.storage.estimate()`. |
| Screen | 720×1600 (HD+), ~6.5", often low brightness, used outdoors in sun. |
| Sensors | Often **no gyroscope or magnetometer**, and a single-band GPS with 10–30 m error between buildings. |
| Network | Patchy 4G, prepaid daily data caps (1–1.5 GB/day), many users on Wi-Fi only at home/office. Plan for Slow-4G and offline. |
| Battery | 4,000–5,000 mAh, aged; OEMs (Xiaomi, Realme, Vivo, Oppo) kill background apps aggressively. |
| Reference test handsets | Buy/borrow 3: a 2 GB Android Go phone (e.g. Redmi A-series / Galaxy A0x), a 3–4 GB Realme C / Redmi 12C class, and one mid-range for comparison. |

### 0.2 In scope for MVP

- PWA with Map (compliance + fog toggle), Capture, Ward, Verify, Fixed, basic Hotspots. Installable; Play Store listing via a Trusted Web Activity (TWA) wrapper of the same PWA.
- Server-side blur, Mapillary push, matching, scoring (baseline open model, no fine-tuning yet), compliance assessment.
- Exports: GeoJSON and per-segment evidence pack.
- Languages: English, Kannada, Hindi (UI strings externalised from day one).
- Anonymous-first accounts: device-bound ID plus chosen handle; optional phone/Google sign-in to keep progress across devices.
- Public-release basics: DPDP consent flow, privacy policy, report/takedown for any frame, rate limits, abuse controls, a cost ceiling on scoring.

### 0.3 Deferred to post-MVP

Raids, collections/badges beyond a simple streak, partner rewards, KML and OSM exports, LoRA fine-tuning loop (Phase 4 — still **collect and store** Verify labels now), Capacitor/iOS native wrapper (iOS stays web-only unless Spike A shows it is viable), voice notes, PostGIS migration, Mapillary pull (unless Spike shows it is needed to cold-start coverage).

### 0.4 Low-end performance budgets (hard release gates)

Enforced in CI with Lighthouse CI and Playwright (CPU 4× throttle, Slow-4G profile) on every PR.

| Budget | Limit |
|---|---|
| Initial JS (first load, route-split, gzip) | ≤ 150 KB |
| Total first-load transfer incl. map shell | ≤ 400 KB |
| Time to interactive, reference low-end phone, Slow-4G | ≤ 5 s |
| Subsequent loads (service worker cache) | ≤ 2 s, works fully offline for shell |
| Map interaction frame time | no dropped-frame storms while panning at 4× throttle; ≤ 3,000 drawn features on screen |
| Capture loop main-thread cost per sampled frame | ≤ 30 ms; UI never janks |
| Memory, Capture screen, 30 min walk | ≤ 200 MB, no growth trend |
| Battery, 30 min capture | ≤ 12% on reference phone (measure in Spike A) |
| Data per 2 km walk upload | ≤ 25 MB, uploaded on Wi-Fi by default |
| Install size (TWA) | ≤ 3 MB |

---

## 1. Product summary

**Problem.** In June 2026 the Supreme Court made walking on a demarcated, maintained footpath an enforceable right, with a duty to provide footpaths where roads exist. No Bengaluru agency can say which roads comply today. Existing data (Sensing Local's StepUP audits, ~350 km across 19 old BBMP wards, ~2023) is a problem log on priority networks, not a citywide census, and is not refreshed.

**Product.** One progressive web app (PWA) for everyone, with mobile capture, plus a ledger API:

1. **PWA (all devices).** Map, Verify, Ward, Fixed and Hotspots views work on desktop and mobile.
2. **Capture mode (mobile browsers).** Eyes-up walking capture using the phone camera and GPS. Frames are pushed to Mapillary as the public imagery home.
3. **Ledger API + exports.** GeoJSON, KML (for Google My Maps), OSM-ready tags, and per-segment evidence packs.

**First users.** Commuters and early tech adopters in the Indiranagar / Koramangala / HSR Layout cluster.

**Two layers, never merged.**
- **Game layer = freshness.** Fog clears when a unit is captured and regrows after `fog_decay_days`. Points follow freshness, hotspots and verification.
- **Compliance layer = condition.** Each 100 m kerb unit is marked against the Supreme Court standard (compliant / non-compliant / no footpath / unknown) with the specific issues listed. Players are never rewarded for a unit being compliant.

**Incentives (two tiers only).**
1. **Outcomes.** "Fixed it" points when a unit you documented becomes compliant; ward unlocks tied to coverage milestones.
2. **Status and perks.** Hotspot bonuses, ward leaderboards, collections and badges, named credit on ward reports, partner-business rewards (stub).

No cash payouts, paid verification, paid rider fleets, employer challenges or CSR funding.

---

## 2. Non-goals for MVP

- No AR. No required screen interaction while walking.
- No machine analysis of Google Street View imagery (Google Maps Platform terms prohibit building indices or training/validating models from it). Street View may only be shown via Google's official viewer for human verification.
- No automated filing into government grievance systems. MVP generates an evidence pack the user shares or files themselves.
- No legal determinations. The app reports *likely* compliance against stated criteria with published error rates.
- No citywide rollout.

---

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| App | Vite + **Preact** (via `preact/compat` if needed) + TypeScript PWA (`vite-plugin-pwa` / Workbox) | One codebase for desktop and mobile. Preact (~4 KB) rather than React (~45 KB) to meet the JS budget on low-end phones. Route-level code splitting. |
| Maps | **Leaflet** with Canvas renderer, raster basemap tiles (OSM-compatible provider / self-hosted PMTiles on a CDN), our units served as simplified **vector tiles** (PMTiles, static, pre-built nightly) | Replaces Google Maps JS + WebGL: far lighter, no WebGL dependency, no per-load Maps billing at public scale. Google is used only to link out to Street View for human verification. **Decision to confirm, see §10.** |
| Capture | `getUserMedia` (rear camera, 720p), Geolocation `watchPosition`, `DeviceOrientationEvent` (optional; falls back to GPS course), Screen Wake Lock API, `OffscreenCanvas`/`createImageBitmap` in a Web Worker for JPEG encode | Foreground only; see Spike A |
| Offline queue | IndexedDB (`idb`), `navigator.storage.persist()`, quota-aware | Resumable chunked upload; Wi-Fi-only by default; Background Sync (Android Chrome) where available, otherwise upload when app open |
| Android distribution | TWA (Bubblewrap) wrapping the PWA for the Play Store | Small install, auto-updates with the web app |
| Native fallback | Capacitor wrapper around the same PWA | Post-MVP, only if Spike A fails on iOS |
| Backend | Python 3.11, FastAPI, Pydantic v2, Typer CLI | |
| Storage (MVP) | SQLite (WAL) + SpatiaLite; frames in S3-compatible bucket; map tiles as static PMTiles on a CDN | PostGIS migration path post-MVP |
| Geo | osmnx, shapely 2, pyproj, geopandas, rtree | |
| Public imagery | Mapillary (upload via `mapillary_tools`; read via API v4) | Open licence; verify current terms |
| Privacy | Server-side face/plate blur before any storage or upload (candidate: EgoBlur; verify licence) | |
| Scoring model | Open-weights vision-language model, served with vLLM | See §3.1. **All heavy work (blur, scoring, tiles) is server-side; no on-device ML in MVP.** |
| Fine-tuning | Hugging Face TRL + PEFT (LoRA / QLoRA) | Post-MVP; collect labels now |
| Config | YAML in `config/`, loaded via Pydantic settings | |

### 3.1 Scoring model

- **Baseline candidates** (choose the latest open-weights releases at build time): Qwen-VL family (7B-class), Gemma 3 multimodal, InternVL, Llama 3.2 Vision, Molmo. Run a bake-off in Phase 3 on cost per 1,000 frames and accuracy on the calibration set.
- **Serving.** vLLM on a single GPU, or a hosted open-weights endpoint. Scoring is a nightly batch job, so latency is not a constraint.
- **Fine-tuning.** LoRA on India-specific data:
  - Verify-tab consensus labels (grows with usage).
  - Hand-labelled calibration set (Phase 3).
  - Sensing Local audit points and photos, **only with written permission**.
  - India Driving Dataset (IDD) for sidewalk/curb pretraining signal; verify licence.
- **Provider interface stays model-agnostic**, so a larger model can be swapped in for audits or label bootstrapping.

---

## 4. Repository structure

```
fogfoot/
├── README.md
├── IMPLEMENTATION_PLAN.md
├── .env.example
├── config/
│   ├── settings.yaml          # paths, pilot area, env-var names
│   ├── compliance.yaml        # SC-judgment criteria -> checks -> issue codes
│   ├── rubric.yaml            # VLM prompt checks + issue taxonomy
│   ├── game.yaml              # fog, points, hotspots, anti-cheat
│   └── models.yaml            # baseline candidates, fine-tune settings
├── scripts/
│   └── discovery.sh
├── backend/
│   ├── pyproject.toml
│   ├── fogfoot/
│   │   ├── cli.py             # Typer entrypoint: `fogfoot ...`
│   │   ├── config.py
│   │   ├── db.py
│   │   ├── schema.sql
│   │   ├── models.py
│   │   ├── network/
│   │   │   ├── wards.py
│   │   │   └── units.py       # OSM roads -> 100 m kerb units per side
│   │   ├── ingest/
│   │   │   ├── captures.py    # receive PWA uploads
│   │   │   ├── blur.py
│   │   │   ├── mapillary_push.py
│   │   │   └── mapillary_pull.py
│   │   ├── match/
│   │   │   └── frames.py      # frame -> unit, side resolution
│   │   ├── score/
│   │   │   ├── provider.py    # VLM interface + vLLM/OpenAI-compatible client
│   │   │   ├── rubric.py
│   │   │   └── aggregate.py
│   │   ├── compliance/
│   │   │   ├── criteria.py    # load compliance.yaml
│   │   │   └── assess.py      # unit -> compliance status + issues
│   │   ├── train/
│   │   │   ├── dataset.py     # build SFT set from labels
│   │   │   ├── finetune.py    # LoRA via TRL/PEFT
│   │   │   └── evaluate.py    # held-out eval, promote/reject
│   │   ├── status/
│   │   │   ├── ledger.py
│   │   │   └── decay.py
│   │   ├── game/
│   │   │   ├── fog.py
│   │   │   ├── points.py
│   │   │   ├── hotspots.py    # generate, rotate, check-in, raids
│   │   │   ├── collections.py
│   │   │   ├── anticheat.py
│   │   │   ├── verify.py
│   │   │   ├── fixed_it.py
│   │   │   └── wards.py
│   │   ├── export/
│   │   │   ├── geojson.py
│   │   │   ├── tiles.py       # nightly PMTiles build of units + status
│   │   │   ├── kml.py         # post-MVP
│   │   │   ├── osm.py         # post-MVP
│   │   │   └── evidence.py
│   │   ├── calibrate/
│   │   │   └── harness.py
│   │   └── api/
│   │       ├── main.py
│   │       ├── routes_units.py
│   │       ├── routes_captures.py
│   │       ├── routes_game.py
│   │       ├── routes_hotspots.py
│   │       └── routes_verify.py
│   └── tests/
├── app/                       # PWA
│   ├── vite.config.ts
│   └── src/
│       ├── i18n/              # en, kn, hi string files
│       ├── routes/            # each route lazy-loaded
│       │   ├── Map.tsx        # fog / compliance toggle, hotspots
│       │   ├── Capture.tsx    # mobile only
│       │   ├── Verify.tsx
│       │   ├── Ward.tsx
│       │   ├── Hotspots.tsx
│       │   └── Fixed.tsx
│       ├── capture/
│       │   ├── camera.ts      # getUserMedia, frame grab to canvas
│       │   ├── sampler.ts     # distance-based sampling
│       │   ├── heading.ts     # DeviceOrientation; falls back to GPS course when no magnetometer
│       │   ├── encode.worker.ts  # JPEG encode off the main thread
│       │   ├── governor.ts    # adaptive sampling: backs off on slow frames, low battery, low storage
│       │   ├── wakelock.ts
│       │   └── flag.ts        # tap-anywhere issue flag + optional voice note
│       ├── queue/
│       │   ├── idbQueue.ts
│       │   └── uploader.ts    # resumable chunked upload, Wi-Fi-only default, retry/backoff
│       ├── layers/
│       │   ├── ComplianceLayer.ts   # Leaflet canvas + PMTiles vector tiles
│       │   ├── FogLayer.ts
│       │   └── HotspotLayer.ts
│       └── api.ts
├── twa/                       # Bubblewrap config for Play Store
├── ci/                        # Lighthouse CI + Playwright throttled perf budgets
└── data/                      # gitignored
```

---

## 5. Config specs

### `config/settings.yaml`

```yaml
pilot:
  name: tech-hub-cluster
  ward_kml_url: https://data.opencity.in/dataset/863209cb-4ced-4f51-b5c5-156939c50922/resource/9013d656-8051-4e2d-9648-46efd0d86d3d/download/gba-369-wards-december-2025.kml
  ward_name_patterns: ["Indiranagar", "Koramangala", "HSR"]   # resolve to GBA ward IDs in Phase 0
  bbox_buffer_m: 200

units:
  length_m: 100
  min_length_m: 30
  kerb_offset_by_highway:
    primary: 9
    secondary: 7
    tertiary: 5.5
    residential: 4
    unclassified: 4
    default: 4.5
  include_highway: [primary, secondary, tertiary, residential, unclassified, living_street]

capture:
  sample_every_m: 5               # governor may widen to 8-10 m on slow devices
  jpeg_quality: 0.6
  max_width_px: 960               # 720p camera stream; keeps ~60-80 KB/frame
  daylight_only_default: true
  upload_wifi_only_default: true
  max_queue_mb: 300               # also capped to 40% of free quota
  low_battery_pct: 20             # warn and widen sampling
  critical_battery_pct: 10        # stop capture, save queue
  max_frame_encode_ms: 60         # governor widens sampling if exceeded
  min_gps_accuracy_m: 35          # frames above this are flagged low side_conf, not discarded
  heading_fallback: gps_course    # when DeviceOrientation unavailable or uncalibrated

app_budgets:
  initial_js_kb_gz: 150
  first_load_kb: 400
  max_features_on_screen: 3000

storage:
  sqlite_path: data/fogfoot.sqlite
  frames_dir: data/frames
  keep_raw_frames: false

mapillary:
  push: true
  token_env: MAPILLARY_TOKEN
  organization_env: MAPILLARY_ORG_ID
  push_after: blur            # never push unblurred frames

maps:
  google_maps_key_env: GOOGLE_MAPS_API_KEY
```

### `config/compliance.yaml`

The Supreme Court judgment is the basis for compliance. Phase 0 must obtain the judgment text and fill in citations and paragraph references; criteria below are placeholders derived from public reporting and must be checked against the text.

```yaml
source:
  judgment: "TODO: case name, citation, date (19 June 2026)"
  paragraphs: "TODO"
  supplementary_standards:
    - "IRC guidance on minimum clear width (~1.8 m) — verify edition"

statuses: [compliant, non_compliant, no_footpath, unknown]

criteria:                     # each maps to rubric checks
  duty_to_provide:
    description: "A road exists, so a footpath is owed"
    fails_when: "footpath_present == false"
    status_on_fail: no_footpath
  demarcated:
    description: "Footpath is demarcated from the carriageway"
    fails_when: "demarcated == false"
  maintained:
    description: "Surface is maintained and walkable"
    fails_when: "surface_ok == false or kerb_walkable == false"
  unobstructed_by_vehicles:
    description: "Pedestrian right outranks vehicle use of the footpath"
    fails_when: "'parking' in issues"
  continuous_and_wide:
    description: "Continuous, with adequate clear width (supplementary standard)"
    fails_when: "continuous == false or clear_width_ok == false"

output:
  every_non_compliant_unit_lists: [criteria_failed, issue_codes, evidence_frame_ids, last_seen]

vending_policy: >
  Vendors are recorded as context, not as a compliance failure on their own.
  Assess clear width remaining, not who occupies the rest.
```

### `config/rubric.yaml`

```yaml
checks:
  footpath_present: "Is there a footpath on this kerb?"
  demarcated: "Is it raised or clearly marked off from the carriageway?"
  clear_width_ok: "Is there at least ~1.8 m of clear walking width?"
  continuous: "Is it continuous across the visible stretch?"
  surface_ok: "Is the surface free of breaks, gaps or open drains?"
  kerb_walkable: "Can a person step on and off without a high step?"
  side_hint: "Is the camera on the left footpath, right footpath, or carriageway?"

issues:                        # aligned to Sensing Local StepUP taxonomy
  encroachment: [parking, planters, vendor_or_shop_spillover, construction_site]
  obstruction: [junction_box, low_wires, overgrown_weeds, transformer]
  waste: [construction_debris, garbage_blackspot, litter, silt]
  footpath_quality: [broken, level_difference, no_footpath, open_drain]
  safety: [dark_zone]

output_format: json            # strict schema, validated with Pydantic
```

### `config/game.yaml`

```yaml
fog_decay_days: 60

points:
  capture_unit_fresh: 10
  capture_unit_refresh: 3
  verify_vote_consensus: 2
  fixed_it_contributor: 50
  negative_finding_bonus: 0      # non-compliant earns the same as compliant

provisional_hold_hours: 24

hotspots:
  sources:                        # in priority order
    - known_blackspots            # pedestrian accident black spots where public data exists
    - issue_clusters              # dense non-compliant units from our own ledger
    - suspected_from_fog          # large unseen clusters
    - low_confidence_clusters     # model unsure
    - user_reported               # flagged by players
  radius_m: 150
  active_per_ward: 3
  rotation: weekly
  bonus_points: 40
  first_capture_bonus: 25
  raids:
    enabled: true
    distinct_walkers_required: 3
    window_hours: 72
    raid_bonus: 60                # each participant, after raid completes
  safety:
    exclude_highway: [motorway, trunk]
    daylight_only: true

collections:                      # Pokémon Go-style sets, no AR
  - id: metro_approaches
    name: "Every footpath to your metro station"
  - id: school_zones
    name: "Safe routes to school"
  - id: ward_complete
    name: "Clear your whole ward"

anticheat:
  walker_max_speed_kmh: 8
  max_gps_jump_m: 60
  min_frames_per_unit: 2
  phash_dup_threshold: 6
  hotspot_min_frames_inside_radius: 5

verify:
  votes_for_consensus: 3

ward_unlocks:
  - coverage_pct: 50
    action: publish_ward_report
  - coverage_pct: 80
    action: request_formal_audit

flags:
  partner_rewards: false
```

### `config/models.yaml`

```yaml
baseline_candidates:
  - "qwen-vl (7B class, latest)"
  - "gemma-3 multimodal (latest small)"
  - "internvl (latest small)"
serving:
  engine: vllm
  endpoint_env: FOGFOOT_VLM_ENDPOINT
  model_env: FOGFOOT_VLM_MODEL
finetune:
  method: lora
  base_model_env: FOGFOOT_FT_BASE
  rank: 16
  epochs: 3
  min_labels_to_train: 2000
  holdout_by: ward               # evaluate on wards not seen in training
  promote_if:
    macro_f1_gain: 0.03
    no_status_regression: true
```

---

## 6. Data model (`schema.sql`, SpatiaLite)

```sql
CREATE TABLE wards (ward_id TEXT PRIMARY KEY, name TEXT, corporation TEXT, geom MULTIPOLYGON);

CREATE TABLE units (
  unit_id TEXT PRIMARY KEY,            -- {osm_way}_{seq}_{L|R}
  osm_way_id INTEGER, side TEXT CHECK(side IN ('L','R')),
  highway TEXT, ward_id TEXT REFERENCES wards,
  owner_agency TEXT, length_m REAL, geom LINESTRING
);

CREATE TABLE frames (
  frame_id TEXT PRIMARY KEY, source TEXT,          -- app | mapillary
  user_id TEXT, captured_at TEXT, lat REAL, lon REAL,
  heading_deg REAL, heading_source TEXT,         -- compass | gps_course | none
  gps_accuracy_m REAL, device_class TEXT,        -- coarse bucket for diagnosing low-end issues
  speed_kmh REAL, phash TEXT,
  path TEXT, blurred INTEGER, mapillary_id TEXT,
  unit_id TEXT, side_conf REAL, anticheat_ok INTEGER
);

CREATE TABLE frame_scores (
  frame_id TEXT PRIMARY KEY REFERENCES frames,
  checks_json TEXT, issues_json TEXT, model TEXT, model_version TEXT, scored_at TEXT
);

CREATE TABLE unit_compliance (
  unit_id TEXT, status TEXT, criteria_failed_json TEXT, issues_json TEXT,
  evidence_frames_json TEXT, confidence REAL, last_seen TEXT, computed_at TEXT,
  PRIMARY KEY (unit_id, computed_at)
);

CREATE TABLE users (user_id TEXT PRIMARY KEY, handle TEXT, team_id TEXT, home_ward TEXT, mapillary_user TEXT);
CREATE TABLE teams (team_id TEXT PRIMARY KEY, name TEXT, kind TEXT, ward_id TEXT);

CREATE TABLE points_ledger (
  entry_id TEXT PRIMARY KEY, user_id TEXT, kind TEXT, amount INTEGER, multiplier REAL,
  unit_id TEXT, hotspot_id TEXT,
  state TEXT CHECK(state IN ('provisional','final','void')), created_at TEXT
);

CREATE TABLE hotspots (
  hotspot_id TEXT PRIMARY KEY, source TEXT, ward_id TEXT,
  center POINT, radius_m REAL, active_from TEXT, active_to TEXT,
  is_raid INTEGER, status TEXT
);
CREATE TABLE hotspot_checkins (hotspot_id TEXT, user_id TEXT, frames INTEGER, at TEXT, PRIMARY KEY(hotspot_id,user_id));

CREATE TABLE collections_progress (user_id TEXT, collection_id TEXT, unit_id TEXT, PRIMARY KEY(user_id,collection_id,unit_id));

CREATE TABLE verify_tasks (task_id TEXT PRIMARY KEY, frame_id TEXT, question TEXT, status TEXT);
CREATE TABLE verify_votes (task_id TEXT, user_id TEXT, answer TEXT, created_at TEXT, PRIMARY KEY(task_id,user_id));

CREATE TABLE compliance_transitions (unit_id TEXT, from_status TEXT, to_status TEXT, at TEXT);
CREATE TABLE model_registry (model_version TEXT PRIMARY KEY, base TEXT, adapter_path TEXT, eval_json TEXT, promoted INTEGER, created_at TEXT);
```

---

## 7. Key function signatures

```python
# network/units.py
def load_roads(bbox: BBox, include_highway: list[str]) -> gpd.GeoDataFrame: ...
def offset_kerbs(roads: gpd.GeoDataFrame, offsets: dict[str, float]) -> gpd.GeoDataFrame: ...
def split_units(kerbs: gpd.GeoDataFrame, length_m: float, min_length_m: float) -> gpd.GeoDataFrame: ...

# ingest
def blur_frame(src: Path, dst: Path) -> BlurResult: ...
def push_to_mapillary(frames: list[Frame], org_id: str) -> list[str]: ...    # returns mapillary ids
def pull_mapillary(bbox: BBox, since: date | None = None) -> Iterator[MapillaryImage]: ...

# match/frames.py
def candidate_units(frame: Frame, radius_m: float = 25) -> list[UnitCandidate]: ...
def resolve_side(frame: Frame, candidates: list[UnitCandidate], hint: SideHint | None) -> Match: ...

# score
class VLMProvider(Protocol):
    def score(self, image: bytes, prompt: str) -> FrameScore: ...
def unit_scores(frames: list[FrameScore]) -> AggregatedChecks: ...

# compliance/assess.py
def assess_unit(checks: AggregatedChecks, criteria: ComplianceCriteria) -> UnitCompliance: ...
    # returns status, criteria_failed, issue_codes, evidence_frame_ids, confidence

# train
def build_sft_dataset(min_consensus: int, holdout_wards: list[str]) -> DatasetPaths: ...
def finetune_lora(base: str, data: DatasetPaths, cfg: FinetuneCfg) -> AdapterPath: ...
def evaluate(model_version: str, split: str = "holdout") -> EvalReport: ...
def promote_if_better(candidate: str, current: str, rules: PromoteRules) -> bool: ...

# game/hotspots.py
def generate_hotspots(ward_id: str, now: datetime, cfg: HotspotCfg) -> list[Hotspot]: ...
def check_in(user_id: str, hotspot_id: str, frames: list[Frame]) -> CheckInResult: ...
def resolve_raid(hotspot_id: str) -> RaidResult: ...      # pays all participants once N distinct walkers

# game/fixed_it.py
def detect_transitions(since: datetime) -> list[ComplianceTransition]: ...
def pay_contributors(t: ComplianceTransition) -> list[PointsEntry]: ...

# export/evidence.py
def evidence_pack(unit_id: str, days: int = 90) -> Path: ...
    # dated frames, criteria failed, issue codes, owner agency, judgment reference
```

---

## 8. Phased build order

### Phase 0 — Discovery and spikes (report back before Phase 1)

```bash
# Ward boundaries (GBA, 369 wards) and pilot ward resolution
curl -L -o data/gba_wards.kml "$(yq '.pilot.ward_kml_url' config/settings.yaml)"
python -c "import geopandas as g; w=g.read_file('data/gba_wards.kml'); print(len(w), w.columns.tolist()); print(w[w.Name.str.contains('Indira|Koramangala|HSR', case=False)][['Name']])"

# Existing OSM sidewalk tags in pilot bbox
curl -s 'https://overpass-api.de/api/interpreter' --data-urlencode 'data=[out:json][timeout:60];(way["sidewalk"]({{bbox}});way["footway"="sidewalk"]({{bbox}}););out count;'

# Existing Mapillary coverage (tile bbox; API caps results per call)
curl -s "https://graph.mapillary.com/images?access_token=$MAPILLARY_TOKEN&fields=id,captured_at,compass_angle,computed_geometry&bbox={{minLon}},{{minLat}},{{maxLon}},{{maxLat}}&limit=2000" | python -c "import sys,json;print(len(json.load(sys.stdin)['data']))"
```

Also:
- Obtain the Supreme Court judgment text; fill `compliance.yaml` citations and confirm each criterion against the text.
- Look for public pedestrian black-spot data for the pilot wards (Bengaluru Traffic Police, OpenCity) to seed hotspots.
- Write to Sensing Local about HSR Layout audit data (they audited HSR; overlap makes it the best calibration set).
- Confirm Mapillary upload terms, licence and organisation account setup.

**SPIKE A — PWA capture on low-end Android first.** Build a minimal capture page and test on the **reference low-end Android phones (§0.1)** before anything else, then on iOS Safari (installed to home screen) and a mid-range Android. Android low-end is the primary target; iOS is secondary:
- rear camera via `getUserMedia` in standalone mode,
- `watchPosition` accuracy while walking,
- `DeviceOrientationEvent` heading (iOS permission prompt),
- Screen Wake Lock keeping the screen on with a black UI,
- battery drain per 30 min,
- IndexedDB storage of ~500 frames, and behaviour near the storage quota,
- main-thread jank, thermal throttling and memory growth over a 30 min walk with the encode worker on vs off,
- whether DeviceOrientation exists at all, and how good GPS-course heading is when walking,
- OEM background-kill behaviour (Xiaomi/Realme/Vivo battery savers) when the screen is on and the app is foreground,
- data used per 2 km walk at 720p / q0.6 / 5 m vs 8 m sampling.
Output: a go/no-go and the tuned defaults for `capture:` in `settings.yaml`.

Capture is foreground only on both platforms. If iOS fails any of these, wrap the same app in Capacitor for iOS capture only.

**SPIKE B — side resolution.** On 50 Mapillary frames from the pilot, compare GPS-only nearest kerb vs GPS + `side_hint`. Also repeat with real GPS traces from the low-end handsets (10–30 m error) and with `gps_course` heading instead of compass. Report accuracy for each.

**SPIKE E — low-end map rendering.** Prototype the Leaflet + PMTiles map with ~3,000 units on the reference low-end phones. Confirm the performance budgets in §0.4 and decide whether Canvas rendering needs further simplification (zoom-dependent geometry, ward-level aggregate at low zoom).

**SPIKE C — blur.** Run the candidate blur model on 50 frames; report face and plate recall by eye.

**SPIKE D — model bake-off (small).** Score 100 hand-labelled frames with 2–3 baseline open-weights models; report accuracy per check and cost per 1,000 frames.

### Phase 1 — Kerb units and PWA shell
- `fogfoot build-units --pilot`; PWA installable; Map view shows grey units over the basemap, served as PMTiles. i18n scaffolding (en/kn/hi). CI perf budgets wired up.
- **Accept:** units sit on correct kerbs for 20 spot-checked roads; PWA installs on iOS and Android; **§0.4 budgets pass on the reference low-end phone**.

### Phase 2 — Capture, ingest, Mapillary
- Capture view: distance sampling with the adaptive governor, heading with GPS-course fallback, wake lock, tap-anywhere flag, IndexedDB queue with quota awareness, encode worker, resumable Wi-Fi-first uploader, large high-contrast UI readable in sun, simple "hold the phone at chest height, camera forward" onboarding in 3 languages.
- Server: ingest → blur → store → push to Mapillary; also pull existing Mapillary frames for the pilot.
- `fogfoot match` assigns frames to units with `side_conf`.
- **Accept:** a 2 km walk captured on a reference low-end phone appears as blurred frames on Mapillary and matched units within 1 hour of upload; ≥ 85% correct unit and side on a 100-frame labelled sample **including low-end-phone GPS traces**; upload survives airplane-mode toggling mid-walk without losing frames.

### Phase 3 — Scoring and compliance
- `fogfoot score` (baseline model via vLLM); `fogfoot assess` produces `unit_compliance` with criteria failed and issue codes.
- Map toggles fog view and compliance view; unit panel lists issues, evidence frames, last seen, owner agency, judgment reference.
- `fogfoot calibrate --truth <file>` on 300 hand-labelled units (plus Sensing Local HSR data if permitted).
- **Accept:** published per-status precision/recall; every non-compliant unit lists at least one criterion failed and one issue code.

### Phase 4 — Fine-tuning loop (post-MVP; MVP only stores Verify labels)
- `fogfoot train build` from verify consensus + hand labels; `fogfoot train run` (LoRA); `fogfoot train eval` on held-out wards; `fogfoot train promote`.
- **Accept:** registry records each candidate; promotion only when `promote_if` passes.

### Phase 5 — Game core
- Fog from `last_seen`; provisional → final points after anti-cheat.
- Verify view: low-confidence frames as yes/no tasks; consensus feeds confidence and training data.
- Ward view: standings, coverage %, next unlock. Lightweight payloads (JSON ≤ 20 KB, cached).
- **Accept:** spoofed-GPS run earns zero final points; non-compliant findings score the same as compliant ones.

### Phase 6 — Hotspots (MVP) and collections (post-MVP)
MVP: weekly hotspots from `issue_clusters`, `suspected_from_fog` and `user_reported` (plus black-spot data where public). Raids and collections are post-MVP.
- Weekly generation per ward from `hotspots.sources`; map pins with radius and timer.
- Check-in requires ≥ `hotspot_min_frames_inside_radius` frames inside the radius.
- Raids: bonus pays once N distinct walkers capture within the window (doubles as multi-observer verification).
- Collections progress and badges.
- **Accept:** hotspots never placed on excluded highways or outside daylight hours by default; a raid completes only with distinct verified walkers.

### Phase 7 — Fixed it and exports
- Nightly `detect_transitions`; contributors to earlier non-compliant observations notified and awarded.
- `fogfoot export geojson|evidence --unit <id>` in MVP; `kml` and `osm` (human-review suggestions only, no bulk import) post-MVP.
- **Accept:** evidence pack shows dated frames, criteria failed, issue codes, owner agency and judgment reference.

### Phase 8 — Public release hardening
- DPDP Act review: consent (including Mapillary publication), retention, deletion on request; privacy policy and terms in en/kn/hi.
- Abuse and moderation: report/takedown on any frame, rate limits per device and IP, upload size caps, spam/NSFW check on frames before publication.
- Play Store: TWA build via Bubblewrap, Digital Asset Links, listing in en/kn/hi, Data Safety form, closed testing track then staged rollout.
- Real-world low-end validation: 10+ testers on budget phones across at least 3 brands complete a 2 km walk and a Verify session; collect device class, crash and battery feedback. Fix before public rollout.
- Lightweight, privacy-respecting error and perf telemetry (device class, encode ms, queue size, upload failures) with consent.
- Cost ceiling: scoring spend alarm and a daily cap; nightly batch degrades gracefully (oldest-first) if exceeded.
- Metrics: weekly active walkers, units refreshed, coverage by ward, hotspot completion, verify throughput, scoring cost per 1,000 frames, capture success rate by device class.
- PostGIS migration path (post-MVP).

---

## 9. Hard problems to keep visible

0. **Low-end Android is the primary platform.** Weak GPS, no compass, 2 GB RAM, thermal throttling and OEM battery killers will decide whether capture works at all. Spike A and the §0.4 budgets are release gates, not nice-to-haves. Keep all heavy compute server-side.
1. **iOS PWA capture** may be unreliable; Capacitor is the fallback (Spike A).
2. **Kerb side ambiguity** under urban GPS error (Spike B).
3. **Legal framing.** Outputs are model assessments against stated criteria, not findings of law. Criteria must track the judgment text, with published error rates.
4. **Coverage bias.** Tech-hub early adopters will over-cover pleasant streets; hotspots, collections and fog bonuses are the only levers now that paid fleets are out.
5. **Hotspot safety.** Black spots are dangerous by definition. Hotspots must sit on footpaths, never ask players onto carriageways, and stay daylight-only by default.
6. **Vendors** must never be marked non-compliant by default.
7. **Small open models** may struggle with Indian street scenes until fine-tuned; the Verify loop is what makes the model improve.
8. **Sensing Local** owns its audit data; request access in writing.

---

## 10. Open questions for Nitesh

- Confirm swapping Google Maps JS for Leaflet + PMTiles (lighter, no WebGL, no per-load billing; Google only for Street View link-out). Recommended.
- Sign-in: anonymous-first plus optional phone OTP or Google sign-in? Phone OTP has SMS cost but is the norm in India.
- Is Play Store distribution via TWA wanted for MVP launch (recommended), or web-only first?
- Languages at launch: English, Kannada, Hindi. Anything else?
- Should hotspots draw on police black-spot data only where it is public, or also accept community nominations from day one?
