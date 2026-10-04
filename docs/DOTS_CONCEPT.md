# Dots concept (replaces "fog" at walking scale)

Status: **prototype, concept under evaluation.** Try it at `/#/dots` (default demo: 790 real kerb units around Domlur, 70.7 km, 7,095 dots; `/#/dots?area=koramangala` for the Koramangala set).

Look: a light basemap with orange dots (white halo so they read on any map), red pulsing power pellets for hotspots, a faint green trail where dots were eaten, and a walking-person silhouette whose stride follows distance walked. Only the *dot-eating idea* is borrowed from Pac-Man, not its look.

## The idea
Every kerb unit is a trail of dots, one dot per `DOT_SPACING_M` (10 m). Walking the footpath eats the dots you pass. Dots regrow after `fog_decay_days` (60). Unit progress and ward coverage are just "share of dots eaten". Zoomed out, per-unit lines glow in proportion to progress (the fog overview survives as the city-scale view).

## How it maps onto the existing design

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
