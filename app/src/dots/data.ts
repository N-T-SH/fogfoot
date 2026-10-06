// Dots concept: turns kerb units into a field of dots (one dot ~ one captured frame, every DOT_SPACING_M).
export const DOT_SPACING_M = 10;
const CELL_M = 40;

export interface DemoFile { name: string; area: string; center: [number, number]; units: { id: string; k: "k" | "s"; c: [number, number][] }[] }

export interface DotField {
  lon0: number; lat0: number; kx: number; ky: number;
  units: { id: string; shared: boolean; ll: [number, number][]; m: [number, number][]; first: number; count: number }[];
  n: number;
  lon: Float64Array; lat: Float64Array; x: Float64Array; y: Float64Array;
  unit: Int32Array; key: string[]; power: Uint8Array;
  grid: Map<number, number[]>;
  endpoints: { unit: number; atEnd: boolean; x: number; y: number }[];
  endGrid: Map<number, number[]>;
}

// Dot ids come from where a dot sits (a fixed ~5 m grid over Bengaluru), never from unit ids, so a rebuilt
// unit file or a changed threshold keeps every dot's coverage. Two dots in one cell share a key on purpose.
export const KEY_CELL_M = 5;
const KEY_LAT0 = 12.5, KEY_LON0 = 77.0;
const KEY_DLAT = KEY_CELL_M / 110700, KEY_DLON = KEY_CELL_M / (111320 * Math.cos((13 * Math.PI) / 180));
export function geoKey(lon: number, lat: number): string {
  return `g${Math.max(0, Math.floor((lon - KEY_LON0) / KEY_DLON))}_${Math.max(0, Math.floor((lat - KEY_LAT0) / KEY_DLAT))}`;
}

const cellKey = (cx: number, cy: number) => (cx + 20000) * 40000 + (cy + 20000);

export function buildField(d: DemoFile, powerEvery = 36): DotField {
  const [lon0, lat0] = d.center;
  const ky = 110700, kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const units: DotField["units"] = [];
  const lon: number[] = [], lat: number[] = [], x: number[] = [], y: number[] = [], unit: number[] = [], key: string[] = [], power: number[] = [];
  const grid = new Map<number, number[]>();
  const endpoints: DotField["endpoints"] = [];
  const endGrid = new Map<number, number[]>();
  const put = (g: Map<number, number[]>, px: number, py: number, v: number) => {
    const k = cellKey(Math.floor(px / CELL_M), Math.floor(py / CELL_M));
    (g.get(k) ?? g.set(k, []).get(k)!).push(v);
  };
  d.units.forEach((u, ui) => {
    const m = u.c.map(([lo, la]) => [(lo - lon0) * kx, (la - lat0) * ky] as [number, number]);
    const first = lon.length;
    let L = 0;
    const cum = [0];
    for (let i = 1; i < m.length; i++) { L += Math.hypot(m[i][0] - m[i - 1][0], m[i][1] - m[i - 1][1]); cum.push(L); }
    let seg = 1;
    for (let s = DOT_SPACING_M / 2; s < L; s += DOT_SPACING_M) {
      while (seg < cum.length - 1 && cum[seg] < s) seg++;
      const t = (s - cum[seg - 1]) / Math.max(cum[seg] - cum[seg - 1], 1e-9);
      const px = m[seg - 1][0] + t * (m[seg][0] - m[seg - 1][0]), py = m[seg - 1][1] + t * (m[seg][1] - m[seg - 1][1]);
      const idx = lon.length;
      x.push(px); y.push(py); lon.push(lon0 + px / kx); lat.push(lat0 + py / ky);
      unit.push(ui); key.push(geoKey(lon0 + px / kx, lat0 + py / ky));
      power.push(0);
      put(grid, px, py, idx);
    }
    units.push({ id: u.id, shared: u.k === "s", ll: u.c, m, first, count: lon.length - first });
    endpoints.push({ unit: ui, atEnd: false, x: m[0][0], y: m[0][1] });
    endpoints.push({ unit: ui, atEnd: true, x: m[m.length - 1][0], y: m[m.length - 1][1] });
  });
  endpoints.forEach((e, i) => put(endGrid, e.x, e.y, i));
  // Power pellets stand in for hotspots: a few well-spread dots.
  for (let ui = 0; ui < units.length; ui += powerEvery) {
    const u = units[ui];
    if (u.count) power[u.first + (u.count >> 1)] = 1;
  }
  return {
    lon0, lat0, kx, ky, units, n: lon.length,
    lon: Float64Array.from(lon), lat: Float64Array.from(lat), x: Float64Array.from(x), y: Float64Array.from(y),
    unit: Int32Array.from(unit), key, power: Uint8Array.from(power), grid, endpoints, endGrid,
  };
}

/** Dots within r metres (r <= CELL_M) of (px,py), in the field's local metres. */
export function dotsNear(f: DotField, px: number, py: number, r: number): number[] {
  const cx = Math.floor(px / CELL_M), cy = Math.floor(py / CELL_M), out: number[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const cell = f.grid.get(cellKey(cx + dx, cy + dy));
    if (!cell) continue;
    for (const i of cell) if (Math.hypot(f.x[i] - px, f.y[i] - py) <= r) out.push(i);
  }
  return out;
}

/** The dots a walker at (px,py) is on: only the nearest kerb unit, so both sides of a road are not credited at once.
 *  `prev` is the unit credited last time; it keeps the walk unless another unit is clearly closer (GPS wobble is bigger than a kerb gap). */
export const SIDE_STICKY_M = 4;
export function dotsOnSide(f: DotField, px: number, py: number, r: number, prev = -1): { dots: number[]; unit: number } {
  const near = dotsNear(f, px, py, r);
  if (!near.length) return { dots: near, unit: prev };
  const best = new Map<number, number>();
  for (const i of near) {
    const d = Math.hypot(f.x[i] - px, f.y[i] - py), u = f.unit[i];
    if (d < (best.get(u) ?? Infinity)) best.set(u, d);
  }
  let unit = -1, dMin = Infinity;
  for (const [u, d] of best) if (d < dMin) { dMin = d; unit = u; }
  const keep = best.get(prev);
  if (keep !== undefined && keep <= dMin + SIDE_STICKY_M) unit = prev;
  return { dots: near.filter((i) => f.unit[i] === unit), unit };
}

export function toLocal(f: DotField, lon: number, lat: number): [number, number] {
  return [(lon - f.lon0) * f.kx, (lat - f.lat0) * f.ky];
}

/** A wandering route (local metres) that follows kerb units and hops across junctions to the nearest other unit. */
export function randomRoute(f: DotField, startUnit: number, maxUnits = 120): [number, number][] {
  const route: [number, number][] = [];
  const visited = new Set<number>();
  let u = startUnit, forward = Math.random() < 0.5;
  for (let n = 0; n < maxUnits; n++) {
    visited.add(u);
    const pts = forward ? f.units[u].m : [...f.units[u].m].reverse();
    route.push(...pts);
    const [ex, ey] = pts[pts.length - 1];
    const cx = Math.floor(ex / CELL_M), cy = Math.floor(ey / CELL_M);
    const cand: { i: number; d: number }[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      for (const i of f.endGrid.get(cellKey(cx + dx, cy + dy)) ?? []) {
        const e = f.endpoints[i];
        const d = Math.hypot(e.x - ex, e.y - ey);
        if (e.unit !== u && d <= 30) cand.push({ i, d: d + (visited.has(e.unit) ? 40 : 0) });
      }
    if (!cand.length) break;
    cand.sort((a, b) => a.d - b.d);
    const pick = f.endpoints[cand[Math.floor(Math.random() * Math.min(3, cand.length))].i];
    u = pick.unit; forward = !pick.atEnd;
  }
  return route;
}
