# fogfoot — Implementation Plan

> Name: **fogfoot**. A citizen-powered, monthly-refreshed, open record of which footpaths in Bengaluru meet the Supreme Court's right-to-walk standard, built from everyday walks and gamified with location-based hotspots.

This plan is written for Claude Code. Work phase by phase. Each phase has acceptance criteria; do not start the next phase until the current one passes. Where this plan says **SPIKE**, build a throwaway proof first and report findings before committing to the approach.

---

## 0. MVP release scope and target devices

**Goal.** A public release (Google Play + web) for the Bengaluru pilot cluster, usable by real people on the phones they already own. It is an MVP: fewer features, each one solid on a cheap phone, rather than the full game.

### 0.1 Target device profile ("reference low-end phone")

Design, test and budget against this, not against a developer flagship. Bengaluru's mass-market Android base is dominated by budget phones. **iOS is supported from day one** (see §0.1b); Android low-end sets the performance floor, iOS sets the API-compatibility floor.

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
| Reference test handsets | Buy/borrow 3 Android: a 2 GB Android Go phone (e.g. Redmi A-series / Galaxy A0x), a 3–4 GB Realme C / Redmi 12C class, and one mid-range. Plus 2 iPhones (§0.1b). |

### 0.1b iOS support (from day one)

Minimum **iOS 16.4** (first version with Web Push for installed PWAs, Screen Wake Lock in standalone, OffscreenCanvas); older iOS gets map/Verify/Ward but Capture shows an "update iOS" message. Reference devices: one older iPhone (SE 2 / 8 / 11 class, 2–3 GB RAM) and one current iPhone. iOS constraints designed in from the start:

- **Install.** No `beforeinstallprompt`; show a short in-app "Add to Home Screen" guide (en/kn/hi) with Share-sheet screenshots. Capture works in-browser, but storage is more fragile there (see below), so nudge install.
- **Storage eviction.** Safari can evict script-writable storage (IndexedDB) after ~7 days of non-use for non-installed sites. Treat the local frame queue as short-lived: warn when queue is older than 3 days, upload on first online app open, never promise offline retention beyond a week.
- **No Background Sync.** Upload on app open, on `visibilitychange`, and on `online` events; resumable so partial uploads are not wasted.
- **Sensors.** `DeviceOrientationEvent.requestPermission()` must be called from a user gesture (put it behind the "Start walk" button). GPS and camera stop when the screen locks or the app backgrounds, so capture is foreground-only with wake lock; handle lock/unlock gracefully and resume.
- **Camera.** Permission may be re-requested per launch in some versions; keep one `MediaStream` alive per walk and handle `track.onended`. Use `playsinline muted` on the preview video.
- **Layout.** Safe-area insets, no reliance on `100vh`, tap targets ≥ 48 px.
- **Google Sign-In** popups are unreliable in standalone PWAs: use the redirect flow and verify it works installed on iOS (part of Spike A).
- **Testing.** WebKit in Playwright CI, plus the two physical iPhones for every release.

### 0.2 In scope for MVP

- PWA with Map (compliance + fog toggle), Capture, Ward, Verify, Fixed, basic Hotspots. Installable on Android and iOS. **Web only for launch**; a Play Store listing (TWA) is post-MVP.
- Nightly batch pipeline: match, Mapillary push, scoring (small open model under a hard budget, no fine-tuning yet), compliance assessment, tile and snapshot build. Light compute by design, see §3.2.
- Exports: GeoJSON and per-segment evidence pack.
- Languages: English, Kannada, Hindi (UI strings externalised from day one).
- **Google Sign-In only** (no passwords, no SMS). Browsing the map, wards and fixed list needs no account; Capture, Verify, hotspots and points need sign-in. We store a hashed Google subject ID and a chosen handle, not the email address.
- Public-release basics: DPDP consent flow, privacy policy, report/takedown for any frame, rate limits, abuse controls, a cost ceiling on scoring.

### 0.3 Deferred to post-MVP

Raids, collections/badges beyond a simple streak, partner rewards, KML and OSM exports, LoRA fine-tuning loop (Phase 4 — still **collect and store** Verify labels now), Play Store / TWA listing, Capacitor wrapper (only enters scope if iOS capture fails Spike A), voice notes, PostGIS migration, Mapillary pull (unless Spike shows it is needed to cold-start coverage).

### 0.4 Low-end performance budgets (hard release gates)

Enforced in CI with Lighthouse CI and Playwright (Chromium with 4× CPU throttle and Slow-4G; WebKit for functional parity) on every PR.

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
| Data per 2 km walk upload | ≤ 15 MB, uploaded on Wi-Fi by default |
| Installed PWA storage (shell + cached tiles for home ward) | ≤ 25 MB |

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
| Maps | **Leaflet** with Canvas renderer, raster basemap tiles (OSM-compatible provider / self-hosted PMTiles on a CDN), our units served as simplified **vector tiles** (PMTiles, static, pre-built nightly) | Replaces Google Maps JS + WebGL: far lighter, no WebGL dependency, no per-load Maps billing at public scale. Google is used only to link out to Street View for human verification. *Confirmed.* |
| Capture | `getUserMedia` (rear camera, 720p), Geolocation `watchPosition`, `DeviceOrientationEvent` (optional; falls back to GPS course), Screen Wake Lock API, `OffscreenCanvas`/`createImageBitmap` in a Web Worker for JPEG encode | Foreground only; see Spike A |
| Offline queue | IndexedDB (`idb`), `navigator.storage.persist()`, quota-aware | Resumable chunked upload straight to object storage; Wi-Fi-only by default; Background Sync on Android Chrome, upload-on-open on iOS |
| Auth | Google Identity Services, redirect flow, ID token verified at the edge | No password or SMS infrastructure |
| Native fallback | Capacitor wrapper around the same PWA | Only if iOS fails Spike A; Play Store TWA post-MVP |
| Edge API | Cloudflare Workers (TypeScript) + D1 + R2, free tier | Upload presigning, auth, votes, check-ins, provisional points. No always-on server. See §3.2. |
| Batch pipeline | Python 3.11, Pydantic v2, Typer CLI, run nightly on GitHub Actions (public repo) or one free-tier VM | CPU only except the scoring step |
| Storage | Batch DB: SQLite + SpatiaLite (source of truth). Interactive state in D1. Frames in R2 with short TTL. Tiles and snapshots as static files on the CDN | |
| Geo | osmnx, shapely 2, pyproj, geopandas, rtree | |
| Public imagery | Mapillary (upload via `mapillary_tools`; read via API v4) | Open licence; verify current terms |
| Privacy | **We blur faces and number plates ourselves (CPU ONNX detector, nightly batch) before anything is pushed to Mapillary**; Mapillary's own automatic blur is a second layer. We host no public imagery. Raw private copies are deleted right after blurring (hard TTL 7 days). | See §3.3 (DPDP) and Spike C |
| Scoring model | Small open-weights vision-language model under a hard budget | See §3.1. No on-device ML in MVP (low-end phones); cheap non-ML checks run on device. |
| Fine-tuning | Hugging Face TRL + PEFT (LoRA / QLoRA) | Post-MVP; collect labels now |
| Config | YAML in `config/`, loaded via Pydantic settings | |

### 3.1 Scoring model

- **Baseline candidates** (choose the latest open-weights releases at build time, small sizes first): Qwen-VL family, Gemma 3 multimodal, InternVL, Llama 3.2 Vision, Molmo. Run a bake-off in Phase 3 on cost per 1,000 frames and accuracy on the calibration set.
- **Serving.** Nightly batch, so latency is irrelevant. Prefer the cheapest option that meets calibration accuracy, in this order: (1) quantised ≤4B model on CPU (llama.cpp or similar) in the batch job; (2) free or donated GPU credits (cloud non-profit programmes, university or research grants) with vLLM; (3) a hosted open-weights endpoint at pay-per-token, only under the budget cap below. The bake-off must include small quantised models, not just 7B-class.
- **Hard budget.** `scoring:` in `models.yaml` caps frames per unit, rescoring frequency and monthly frame total. Over budget, units stay "awaiting assessment" rather than getting a poor or no score; never silently skip evidence.
- **Fine-tuning.** LoRA on India-specific data:
  - Verify-tab consensus labels (grows with usage).
  - Hand-labelled calibration set (Phase 3).
  - Sensing Local audit points and photos, **only with written permission**.
  - India Driving Dataset (IDD) for sidewalk/curb pretraining signal; verify licence.
- **Provider interface stays model-agnostic**, so a larger model can be swapped in for audits or label bootstrapping.

### 3.2 Free, non-commercial operating model: minimise server compute

fogfoot is a free public-interest service, so the design pushes work to the places where it is free: the user's device (only for cheap, non-ML work), the CDN (static files), the crowd (Verify) and a nightly CPU batch. Principles:

1. **Static first.** Kerb units, compliance status, fog, ward standings, hotspots and leaderboards are pre-built nightly (hourly for hotspots/leaderboards if cheap) as PMTiles and small JSON snapshots on the CDN. Reading the map costs no compute.
2. **Thin edge, no always-on server.** Workers + D1 + R2 on free tiers handle only writes: sign-in token check, presigned uploads, Verify votes, hotspot check-ins, provisional points. Python never serves requests.
3. **Nightly CPU batch.** Match, assess, decay, hotspots, tiles, points finalisation, Mapillary push. Idempotent and resumable; one run fits GitHub Actions limits or a single free VM.
4. **Cheap on-device gating (no ML).** Before upload the phone drops frames that are blurry (Laplacian variance), too dark (mean luma), duplicate (pHash), or fail GPS sanity (speed, jump, accuracy). Sampling is every 10 m, giving ~200 frames per 2 km walk. This cuts upload data and downstream compute together.
5. **Spend model compute only where it matters.** Score at most 3 best frames per unit (chosen by sharpness and GPS accuracy), only units with new frames, and only re-score when ≥ 2 new frames arrive. Everything else reuses the previous assessment until fog regrows.
6. **Crowd before compute.** Verify consensus settles clear-cut frames and feeds calibration, so the VLM is a triage tool, not the only judge.
7. **Bounded storage.** Raw frames in R2 are deleted once blurred copies exist and scoring is done, with a hard TTL (`frame_retention_days`, default 7); only blurred copies feed scoring and Mapillary. Public imagery lives on Mapillary; evidence packs link to Mapillary image IDs and keep only scores, crops metadata and IDs on our side.
8. **Anti-cheat in two tiers.** Light checks on device and at the edge; the authoritative checks run in the nightly batch before points go from provisional to final. No cash is involved, so there is no need for real-time fraud screening.
9. **Cost watch.** Track monthly cost and compute minutes; the budget cap in §3.1 and Cloudflare/GitHub free-tier limits are release-gate alarms.

### 3.3 India data protection (DPDP Act 2023 and DPDP Rules 2025)

*This is an engineering reading, not legal advice. Decision: no external legal review for the MVP. Several dates below come from secondary summaries, so re-check them against the Rules text before launch.*

**Timeline (to verify).** The Act was passed in 2023. The Rules were notified on 13 Nov 2025 with phased commencement: institutional provisions immediately, Consent Manager rules on 13 Nov 2026, and the main duties (notice, consent, safeguards, breach, erasure, children, rights, penalties) on about 13 May 2027. fogfoot launches before that date, but we build to the 2027 standard from day one: there is no reason to rework later, and a free service handling location trails and photos still carries reputational risk.

**What personal data we touch**
- Walkers: Google subject (hashed), handle, precise GPS trails and timestamps, device class, votes and points.
- Bystanders: faces and number plates in street frames. They cannot consent, so minimisation is the control, not consent.

**Design decisions that follow**
1. **Blur before store and before publish** (§3, Spike C). Raw frames live at most 7 days, privately, and are never shown or exported.
2. **Notice and consent, itemised and plain-language** in English, Kannada and Hindi before first capture: what we collect, why (mapping footpath condition), that blurred frames are published openly on Mapillary, that data is processed by Cloudflare, Google and Mapillary (some outside India), and how to withdraw. Publication to Mapillary is a separate, clearly labelled consent that capture requires; browsing needs none. Withdrawal is as easy as giving consent (a settings button).
3. **Purpose limitation and minimisation.** Collect only what scoring and game integrity need. Raw GPS trails kept ≤ 90 days, then reduced to unit-level coverage records. No ads, no analytics SDKs, no data sales or sharing; telemetry is opt-in and contains no location.
4. **Children.** Under-18s need verifiable parental consent under the Act and tracking of children is restricted. Simplest route: the terms state the service is for **18+ only**. Decision: no age verification or self-declaration gate in the MVP (this is a known residual risk; revisit if usage shows minors). Revisit school-zone features only with proper parental consent design.
5. **Rights and grievance.** In-app "Download my data", "Delete my account and data", correction of handle, and a named grievance contact with a response SLA. Deleting an account removes trails and votes, and removes the user's attribution; already-blurred published frames cannot be recalled from Mapillary, so the notice says so, and a per-frame takedown request path is offered.
6. **Security safeguards.** Encryption in transit and at rest (R2/D1 defaults), least-privilege tokens, no keys in the repo (§11), access logging on the edge, and a short breach runbook (assess, contain, notify users and the Data Protection Board as the Rules require).
7. **Retention schedule** documented in `docs/data-retention.md` and enforced by the nightly batch (raw frames 7 days, trails 90 days, ledger records retained for the public record without personal identifiers).
8. **Records.** Keep a record of consent version and timestamp per user, and a processing register in `docs/`.
9. **Significant Data Fiduciary** status is unlikely at MVP scale but monitor user numbers and data sensitivity.

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
│   │   │   ├── captures.py    # list new uploads in R2, download for the batch
│   │   │   ├── blur.py        # CPU face + plate blur, runs before scoring and Mapillary push
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
│   │   └── snapshots/
│   │       └── publish.py     # nightly JSON snapshots (wards, hotspots, leaderboards) to CDN
│   └── tests/
├── edge/                      # Cloudflare Workers (TypeScript): the only write API
│   ├── src/auth.ts            # verify Google ID token
│   ├── src/upload.ts          # presigned R2 upload, size and rate limits
│   ├── src/verify.ts          # votes
│   ├── src/checkin.ts         # hotspot check-ins, provisional points
│   └── migrations/            # D1 schema
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
│       │   ├── gate.ts        # on-device quality gate: blur, luma, pHash dedupe, GPS sanity
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
├── ci/                        # Lighthouse CI + Playwright (Chromium throttled, WebKit parity)
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
  sample_every_m: 10              # ~200 frames per 2 km; governor may widen to 15 m on slow devices
  gate:
    min_sharpness: 40             # Laplacian variance on a downscaled copy; tune in Spike A
    min_mean_luma: 45
    drop_phash_dups: true
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
  frame_retention_days: 7         # private copies in R2; public imagery lives on Mapillary

mapillary:
  push: true
  token_env: MAPILLARY_TOKEN
  organization_env: MAPILLARY_ORG_ID
  push_after: blur            # never push unblurred frames; Mapillary's blur is a second layer
  credit_contributors: false  # push under the org account; per-user credit only with explicit opt-in

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
scoring:
  max_frames_per_unit: 3
  min_new_frames_to_rescore: 2
  monthly_frame_budget: 100000    # set from real cost in Phase 3; over budget -> 'awaiting assessment'
  prefer: [cpu_quantised, donated_gpu, hosted_payg]
serving:
  engine: llamacpp_or_vllm
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

CREATE TABLE users (user_id TEXT PRIMARY KEY, google_sub_hash TEXT UNIQUE, handle TEXT, team_id TEXT, home_ward TEXT, mapillary_user TEXT);
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
- Seed hotspots from public black-spot sources (see §8a): fetch and verify each source page, geocode the named locations by hand into `data/seeds/blackspots.csv` with source URL, publication date and licence, and keep only locations in the pilot wards.
- Write to Sensing Local about HSR Layout audit data (they audited HSR; overlap makes it the best calibration set).
- Confirm Mapillary upload terms, licence and organisation account setup.

**SPIKE A — PWA capture on low-end Android and iOS, in parallel.** Build a minimal capture page and test on the **reference low-end Android phones (§0.1)** and the **two reference iPhones (§0.1b)**, installed to home screen and in-browser. Both platforms are release gates:
- rear camera via `getUserMedia` in standalone mode,
- `watchPosition` accuracy while walking,
- `DeviceOrientationEvent` heading (iOS permission prompt),
- Screen Wake Lock keeping the screen on with a black UI,
- battery drain per 30 min,
- IndexedDB storage of ~500 frames, and behaviour near the storage quota,
- Google Sign-In (redirect flow) in installed standalone mode on iOS and Android,
- upload-on-open behaviour without Background Sync (iOS) and with it (Android),
- on-device quality gate: tune `gate:` thresholds so ≥ 90% of dropped frames are genuinely unusable and cost ≤ 15 ms per frame at 4× throttle,
- main-thread jank, thermal throttling and memory growth over a 30 min walk with the encode worker on vs off,
- whether DeviceOrientation exists at all, and how good GPS-course heading is when walking,
- OEM background-kill behaviour (Xiaomi/Realme/Vivo battery savers) when the screen is on and the app is foreground,
- data used per 2 km walk at 720p / q0.6 / 5 m vs 8 m sampling.
Output: a go/no-go and the tuned defaults for `capture:` in `settings.yaml`.

Capture is foreground only on both platforms. If iOS fails any of these, report before Phase 1: the options are a Capacitor wrapper for iOS capture only (added to MVP scope) or iOS launching as view/Verify only. Don't silently drop iOS capture.

**SPIKE B — side resolution.** On 50 Mapillary frames from the pilot, compare GPS-only nearest kerb vs GPS + `side_hint`. Also repeat with real GPS traces from the low-end handsets (10–30 m error) and with `gps_course` heading instead of compass. Report accuracy for each.

**SPIKE E — low-end map rendering.** Prototype the Leaflet + PMTiles map with ~3,000 units on the reference low-end phones. Confirm the performance budgets in §0.4 and decide whether Canvas rendering needs further simplification (zoom-dependent geometry, ward-level aggregate at low zoom).

**SPIKE C — privacy blur.** Pick a small CPU face + number-plate detector (ONNX; check licence is compatible with a public repo, e.g. not research-only). On 50 pilot frames at 960 px / q0.6, report face and plate recall by eye and CPU seconds per frame. Target ≥ 95% face and plate recall on clearly visible subjects; residual misses are covered by Mapillary's own blur as a second layer. Also confirm Mapillary's current terms for uploads from an organisation account.

**SPIKE D — model bake-off (small).** Score 100 hand-labelled frames with 2–3 baseline open-weights models, **including at least one ≤4B quantised CPU-runnable model**; report accuracy per check, seconds per frame on CPU, and cost per 1,000 frames. This sets the real `monthly_frame_budget`.

### Phase 1 — Kerb units and PWA shell
- `fogfoot build-units --pilot`; PWA installable on Android and iOS; Map view shows grey units over the basemap, served as PMTiles from the CDN. i18n scaffolding (en/kn/hi). Google Sign-In and edge Worker skeleton. CI perf budgets and WebKit tests wired up.
- **Accept:** units sit on correct kerbs for 20 spot-checked roads; PWA installs on iOS and Android; **§0.4 budgets pass on the reference low-end phone**.

### Phase 2 — Capture, ingest, Mapillary
- Capture view: distance sampling with the adaptive governor, heading with GPS-course fallback, wake lock, tap-anywhere flag, IndexedDB queue with quota awareness, encode worker, resumable Wi-Fi-first uploader, large high-contrast UI readable in sun, simple "hold the phone at chest height, camera forward" onboarding in 3 languages.
- Phone: on-device gate, 10 m sampling, direct-to-R2 resumable upload via presigned URLs from the edge Worker.
- Nightly batch: ingest → blur (CPU) → match → score → push blurred frames to Mapillary → delete raw copies. Mapillary pull is post-MVP.
- `fogfoot match` assigns frames to units with `side_conf`.
- **Accept:** a 2 km walk captured on a reference low-end phone appears as blurred frames on Mapillary and matched units within 1 hour of upload; ≥ 85% correct unit and side on a 100-frame labelled sample **including low-end-phone GPS traces**; upload survives airplane-mode toggling mid-walk without losing frames.

### Phase 3 — Scoring and compliance
- `fogfoot score` (baseline model under the `scoring:` budget, §3.1); `fogfoot assess` produces `unit_compliance` with criteria failed and issue codes.
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
- DPDP checklist in §3.3 completed (self-reviewed, no external legal review by decision); privacy notice and terms in en/kn/hi stating 18+ only.
- Abuse and moderation: report/takedown on any frame, rate limits per device and IP, upload size caps, spam/NSFW check on frames before publication.
- Web launch: custom domain, HTTPS, install guides for Android and iOS (en/kn/hi), soft launch with a small cohort before announcing. Play Store TWA is a post-MVP follow-up.
- Real-world validation: 10+ testers on budget Android phones across at least 3 brands, plus at least 3 iPhone users, complete a 2 km walk and a Verify session; collect device class, crash and battery feedback. Fix before public rollout.
- Lightweight, privacy-respecting error and perf telemetry (device class, encode ms, queue size, upload failures) with consent.
- Cost ceiling: scoring budget cap (§3.1), alarms before Cloudflare/GitHub free-tier limits, and graceful degradation (oldest-first, units shown as "awaiting assessment") if exceeded. Add a donations or grants note only if the user wants it; no ads and no data sales.
- Metrics: weekly active walkers, units refreshed, coverage by ward, hotspot completion, verify throughput, scoring cost per 1,000 frames, capture success rate by device class.
- PostGIS migration path (post-MVP).

---

## 8a. Hotspot seed data: what exists publicly

Findings from a first web search (sources could not be opened directly from the build environment, so treat figures as unverified and re-check them in Phase 0):

- Bengaluru Traffic Police has identified **about 64 accident black spots** in the city per Deccan Herald reporting, with Citizen Matters citing about 60; roughly 19 lie on the Outer Ring Road. The definition used follows NHAI's: a 500 m stretch with five fatal or grievous accidents, or ten deaths, in three years.
- Fatality context: pedestrian deaths in Bengaluru were reported as 248 (2022), 287 (2023) and 233 (2024).
- A published list of locations exists in news form, **but no machine-readable, pedestrian-specific dataset was found**. Reporting says FIR-level accident location data is not in the public domain.
- OpenCity has an explainer on Bengaluru's accident hotspots; check whether it links an open dataset and under what licence.

**Plan:** hotspots draw on four sources in this order: (1) the public black-spot list, hand-geocoded and cited; (2) our own `issue_clusters` from the ledger; (3) `suspected_from_fog`; (4) community nominations (moderated, one per user per week, must be on a footpath). A black spot is a *reason to look*, never a place to stand: the hotspot is attached to the nearest footpath units, never the carriageway, and daylight-only (Hard problem 5). Do not scrape paywalled or restricted sources; cite and attribute each seed, and check licences before redistributing the list in the repo.

---

## 9. Hard problems to keep visible

0. **Low-end Android is the primary platform.** Weak GPS, no compass, 2 GB RAM, thermal throttling and OEM battery killers will decide whether capture works at all. Spike A and the §0.4 budgets are release gates, not nice-to-haves. Heavy compute must stay off the phone, but equally off our servers (§3.2).
1. **iOS PWA capture** is a day-one requirement but Safari's limits (no Background Sync, storage eviction, foreground-only GPS/camera, popup auth) make it the riskiest platform; Capacitor for iOS is the fallback (Spike A).
1a. **Free service, bounded budget.** Free tiers have hard limits and model scoring has real cost. The scoring budget cap and the static-first design are what keep the service alive; a spike in usage must degrade freshness, not take the site down.
2. **Kerb side ambiguity** under urban GPS error (Spike B).
3. **Legal framing.** Outputs are model assessments against stated criteria, not findings of law. Criteria must track the judgment text, with published error rates.
4. **Coverage bias.** Tech-hub early adopters will over-cover pleasant streets; hotspots, collections and fog bonuses are the only levers now that paid fleets are out.
5. **Hotspot safety.** Black spots are dangerous by definition. Hotspots must sit on footpaths, never ask players onto carriageways, and stay daylight-only by default.
6. **Vendors** must never be marked non-compliant by default.
7. **Small open models** may struggle with Indian street scenes until fine-tuned; the Verify loop is what makes the model improve.
8. **Sensing Local** owns its audit data; request access in writing.

---

## 10. Decisions and open questions

**Confirmed by Nitesh:** Leaflet + PMTiles with Google only for Street View links; Google Sign-In as the only login; web-only launch first (no Play Store yet); English, Kannada and Hindi at launch; iOS supported from day one; minimise server compute (free, non-commercial).

**Also confirmed:** public repo (nothing sensitive in git, see §11); no funding source for MVP, so the free-tier and scoring-budget design in §3.1–3.2 is mandatory; hotspots use whatever public sources we can find and verify (§8a).

**Decided:** licence is AGPL-3.0 for code and ODbL for published data (add `LICENSE` and `DATA_LICENSE.md`); no external legal review for MVP; no 18+ verification gate (terms state 18+ only).

**Open:**
- None blocking. Phase 0 spikes need real phones and a Mapillary account.

---

## 11. Public repository and secrets hygiene

The repo is public, so assume everything committed is permanent and world-readable.

- **No secrets in git, ever.** Mapillary token, Google OAuth client secret, Cloudflare tokens, R2 keys, scoring endpoint keys live only in Cloudflare Worker secrets, GitHub Actions encrypted secrets, and local `.env` files (gitignored). Only `.env.example` with placeholder names is committed.
- **Client-side values are public by design** (Google OAuth *client ID*, basemap tile URL). Restrict them: OAuth authorised origins to our domain, tile keys to our referrer.
- **Secret scanning.** `gitleaks` runs in CI on every push and PR, and as a local pre-commit hook; GitHub secret scanning and push protection are enabled in repo settings.
- **Least privilege.** Separate, scoped tokens for the nightly batch (R2 read/write on one bucket, Mapillary upload) and the edge Worker. Rotate on any suspicion; `SECURITY.md` documents how to report a vulnerability privately.
- **Fork-safe CI.** Nightly batch workflows run only on the main repo and on `schedule`/`workflow_dispatch`; they never run on `pull_request` from forks, and use no `pull_request_target` with checkout of PR code.
- **Data stays out of git.** `data/`, raw frames, GPS trails, user tables, DB snapshots and model weights are gitignored. Only curated, licensed seeds (e.g. black-spot CSV) and published, de-identified snapshots may be committed.
- **Abuse resistance of a public API.** Rate limits and size caps at the edge, Google ID token verification on every write, and per-user daily upload caps, since anyone can read the client code.
