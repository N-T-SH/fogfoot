# Pick-up concept (was "dots"; working title)

Status: **prototype, concept under evaluation.** Try it at `/#/dots` (default demo: every kerb unit in the Domluru and Kodihalli wards, 1,260 units, 112 km, 11,259 items; `/#/dots?area=koramangala` for Koramangala; `/#/dots?room=test` is a separate shared room where simulated walks are uploaded too; `/#/icons` shows the icon set).

## What you see
- **Top two thirds: the live camera**, so you can look at the road ahead while checking the phone. The map is the bottom third; **Expand map** gives it the whole screen and shrinks the camera to a corner window. The map is never expanded by default.
- **Litter items instead of dots.** Every 10 m along a footpath sits a small item: toffee wrapper, water bottle, chai cup, snack packet, tender coconut, banana peel or plastic bag. They are flat, muted shapes drawn in code (Indian context, no brand logos) with a thin white edge so they stay readable on any map. Garbage heaps, drawn as a pile of tied black bags with a few things spilled in front, stand in for hotspots. Walking a stretch **picks the items up**; they turn into small green markers (darker green = picked up more recently).
- **Counter (bottom): items picked up** by you in the last 30 days, plus this walk and everyone's total.
- **Shared between walkers.** What anyone picked up in the last 30 days shows green for everyone; after 30 days it becomes litter again. Your walks are saved on the phone straight away and uploaded when online.
- A walking-person silhouette marks you on the map. Only the dot-eating idea is borrowed from Pac-Man, not its look.

## Important: the items are game tokens, not detections
An icon at a spot does **not** mean litter was seen there. If the map is read literally it would say every footpath in Domlur is full of rubbish. Before this goes public the UI must say so plainly, and the "picked up" language should be reconsidered; later the tokens could be replaced by real detections (the rubric already has `litter` and `garbage_blackspot` issue codes). Keep the game layer (tokens, pick-ups) apart from the compliance layer (what the footpath is actually like).

## The idea
Every kerb unit is a trail of dots, one dot per `DOT_SPACING_M` (10 m). Walking the footpath eats the dots you pass. Dots regrow after `fog_decay_days` (60). Unit progress and ward coverage are just "share of dots eaten". Zoomed out, per-unit lines glow in proportion to progress (the fog overview survives as the city-scale view).

## How it maps onto the existing design (original dots framing)

| Existing | Dots |
|---|---|
| Capture every 10 m | One dot = one capture sample. Eating a dot is the app saying "that frame was accepted". |
| Fog / `last_seen` | Eaten dots regrow after 60 days. |
| Hotspots | Power pellets (bigger, pulsing, bonus). |
| `min_frames_per_unit` | A unit counts as covered when enough of its dots are eaten. |
| Collections / ward unlocks | Clear all dots in a set of units. |
| Anti-cheat | Unchanged: a dot only counts after the frame passes the speed, GPS-jump, duplicate and accuracy checks. |

## Why it could work
- **It fixes a real capture problem.** Eyes-up capture fails silently if the phone stops sampling. A dot disappearing (plus a short haptic tick on Android) is instant proof that capture works, without looking at the screen for long.
- Reads at a glance, no tutorial.
- Cheap to draw: one canvas over the map, about 7k dots for 71 km. Dots are generated on the device from unit geometry, so they are never downloaded. Demo data is 97 KB for Domlur (33 KB for Koramangala); the lazily loaded chunk is about 48 KB gzipped (Leaflet included).

## Open design questions
1. **Personal or shared?** In the prototype eaten dots are personal (saved on the phone). The compliance project needs a *shared* city freshness map. Suggested split: dots are "your trail"; the city-wide freshness layer (the old fog) stays for the shared overview at low zoom.
2. **Left/right side.** Dots sit on specific kerbs. GPS alone cannot say which kerb you are on (Spike B), so the prototype eats everything within 12 m, which over-credits the opposite kerb on narrow roads. The real app needs side from heading and the frame itself. A mistake would be visible to the player, which is both a risk and a useful nudge ("walk back the other side").
3. **Reward fairness.** Dots must look identical whether the footpath is good or broken. No colouring, ghosts or sound may reveal or reward compliance (the two layers stay separate).
4. **Shared streets** (narrow lanes) have one centreline trail instead of two kerb trails; shown dashed.

## Risks
- **Look-alike risk.** Eating dots along a path is the borrowed mechanic. The look is deliberately different: light basemap, a walking person instead of a chomping character, no ghosts, no maze styling, no "waka" sound. Keep that distance. Worth a quick legal opinion before launch (not obtained).
- **Safety.** A game next to Bengaluru traffic. Rules to keep: never put dots on carriageways or crossings; no timers, chases or streaks; the app must work screen-off (haptics, optional audio); pause gameplay above walking speed (vehicle).
- **Farming.** Pacing back and forth to eat regrown dots. Counter with the 60-day regrowth, small per-dot points, and the existing anti-cheat.
- **Scale.** Whole-city dots would be about 600k at 10 m. Draw dots only at zoom 16 and closer, from tiles; use aggregated lines below that.

## Naming
"Fog of walk" no longer fits. Ideas if the concept holds: *kolam* (dot patterns completed by walking: culturally rooted and not a game trademark), *pulli* (Tamil/Kannada-adjacent word for the kolam dot), *footprint*, *trail*, *petals* (marigold-coloured dots). Pick after the concept is confirmed.

## Prototype controls
Simulate walk (random route over real kerb units, speed ×6/12/24), Use my GPS (only counts inside the demo area), +30 days (fast-forward the clock to see regrowth), Street map (on by default; OpenStreetMap tiles for the prototype only, the real app uses its own tiles), Reset.

## Shared coverage: how it works (prototype)
- **Rules.** Covered = anyone walked it in the last 30 days (`WINDOW_DAYS`; the plan's old `fog_decay_days: 60` should become 30). Walking something that is already covered **today** (by anyone) does nothing; on a later day it refreshes the date.
- **API.** `GET /api/coverage?area=domlur` returns `[dotKey, dayStartUnixSeconds]` pairs for the last 30 days; `POST /api/coverage` takes at most 300 dots per batch. `GET /api/health` writes and reads back a test record through the real store. Code in `app/api/`, logic in `app/api/_lib/coverage.ts` with unit tests (`npm test`).
- **Storage.** A private Vercel Blob store in Mumbai (`bom1`). Each upload is an immutable batch object; reads merge snapshot + batches (newest timestamp wins) and compact when there are more than 30 batches. Short CDN cache on reads.
- **Simulated walks are not uploaded** (they would pollute the real map). They are uploaded only in the test room (`?room=test`).
- **Known gaps (prototype):** no sign-in, so anyone can post coverage for any dot in the demo areas (limits: valid key format, at most 300 per batch, no future timestamps, known areas only); no per-user limits; coverage is anonymous (no user id is stored) and **day-only**: the time of day is rounded away on the phone, rounded again on the server before anything is stored, and objects written earlier with exact times are rewritten the first time they are read. It still shows which 10 m stretches were covered on which day, so on a quiet street one day's coverage is effectively one person's route; watch that as the user base is small. A real launch needs Google sign-in checked on the server, rate limits per account, and a consent line. Left/right kerb is not resolved by GPS (see above). Blob store operations have free-tier limits on the Hobby plan.

## Step 1 of camera capture: photos saved on the phone only
- **What it does.** During a real GPS walk with the camera on, the app saves a filtered photo about every 10 m (only with a GPS fix better than 35 m, never while standing still). Blurry and too-dark frames are dropped on the phone. Photos are JPEGs of up to 1280 px, roughly 100 to 200 KB, kept in the phone's own storage (IndexedDB) with the time, GPS accuracy, direction of travel and the street stretches within 8 m.
- **What it does not do.** Nothing is uploaded. Simulated walks never save photos. There is no blur of faces or number plates yet, which is why nothing may leave the phone until that exists (see the privacy plan).
- **Limits.** A cap of 150 MB, or 40% of the free space the browser reports if that is smaller. At the cap the badge says "Frame storage full". `?cap=300` in the address changes the cap; `?q=0.5&w=800` changes quality and size.
- **Controls.** "Photos: on/off" toggles saving; "Photos (N)" opens a gallery of the latest 24 with time, GPS accuracy and size, and a "Delete all photos" button.
- **Why this step.** To learn from real walks, on real phones, how much battery and heat it costs, how much storage a walk uses, and whether the photos are good enough to see a footpath. Later steps: consent and Google sign-in with a private upload, then blur and a review tool.

## Known design problem: item IDs are not stable
Item IDs are built from street-unit IDs (`<osm way>_<n>_<L|R|C>`). Those change whenever units are rebuilt: when OpenStreetMap edits a road, and also when the narrow-lane threshold moves (a street switching between two kerbs and one shared row renames its items). Shared coverage recorded against old IDs silently stops matching. Before real use, items need IDs anchored to geometry (for example the way, the distance along it and the side) that do not depend on any threshold, plus a migration when units are rebuilt. The 40 ft change made two streets from the first Domlur test walk stop matching.
