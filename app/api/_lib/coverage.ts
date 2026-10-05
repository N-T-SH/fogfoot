// Shared dot coverage. Pure logic over a tiny storage adapter so it can be tested without Vercel.
//
// Layout in the store (all JSON):
//   cov/<area>/b-<ts>-<rand>.json   one POSTed batch:  {"e": [[dotKey, unixSeconds], ...]}   (append-only, never rewritten)
//   cov/<area>/s-<ts>.json          a compacted snapshot: {"e": {dotKey: unixSeconds}}
// Readers merge every snapshot and batch (latest timestamp per dot wins) and drop entries older than WINDOW_DAYS.
// When there are many batches, a read compacts them into a new snapshot and deletes what it merged.
//
// Privacy: only the DAY (India time) a dot was covered is ever stored or returned, never the time of day.
// Timestamps are rounded down to the start of the day on the way in, again on the way out, and any older
// object that still holds exact times is rewritten (scrubbed) the first time it is read.

export const WINDOW_DAYS = 30;
export const MAX_BATCH = 300;
export const COMPACT_AFTER_BATCHES = 30;
const DAY_S = 86400;
const IST_OFFSET_S = 19800; // UTC+5:30

/** Start of the India-time day containing `ts` (unix seconds). */
export const dayStart = (ts: number): number => Math.floor((ts + IST_OFFSET_S) / DAY_S) * DAY_S - IST_OFFSET_S;

export interface Store {
  put(path: string, body: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  read(path: string): Promise<string | null>;
  del(paths: string[]): Promise<void>;
}

/** Areas the demo accepts; "-test" rooms are for experiments (e.g. sharing simulated walks). */
const AREA_RE = /^(domlur|koramangala|healthcheck)(-test)?$/;
export const isArea = (area: unknown): area is string => typeof area === "string" && AREA_RE.test(area);
const KEY_RE = /^\d{1,12}_\d{1,4}_[LRC]:\d{1,4}$/;

export type Parsed = { ok: true; area: string; entries: [string, number][] } | { ok: false; error: string };

export function validateBatch(body: unknown, nowS: number): Parsed {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be a JSON object" };
  const { area, e } = body as { area?: unknown; e?: unknown };
  if (typeof area !== "string" || !AREA_RE.test(area)) return { ok: false, error: "unknown area" };
  if (!Array.isArray(e) || e.length === 0) return { ok: false, error: "e must be a non-empty array" };
  if (e.length > MAX_BATCH) return { ok: false, error: `at most ${MAX_BATCH} dots per batch` };
  const entries: [string, number][] = [];
  for (const item of e) {
    if (!Array.isArray(item) || item.length !== 2) return { ok: false, error: "each entry must be [key, seconds]" };
    const [key, ts] = item as [unknown, unknown];
    if (typeof key !== "string" || !KEY_RE.test(key)) return { ok: false, error: `bad dot key ${String(key).slice(0, 24)}` };
    if (typeof ts !== "number" || !Number.isFinite(ts)) return { ok: false, error: "bad timestamp" };
    // A phone may sync late (offline walk) but not claim the future or ancient history.
    if (ts > nowS + 300) return { ok: false, error: "timestamp is in the future" };
    if (ts < nowS - WINDOW_DAYS * DAY_S) continue; // already expired: ignore silently
    entries.push([key, dayStart(Math.floor(ts))]); // day only: the time of day is dropped here and never stored
  }
  return { ok: true, area, entries };
}

const rand = () => Math.random().toString(36).slice(2, 8);

export async function addBatch(store: Store, area: string, entries: [string, number][], nowS: number): Promise<void> {
  if (!entries.length) return;
  const days = entries.map(([k, t]) => [k, dayStart(t)] as [string, number]); // defence in depth: round again even if the caller already did
  await store.put(`cov/${area}/b-${String(nowS).padStart(11, "0")}-${rand()}.json`, JSON.stringify({ e: days }));
}

export interface Coverage { entries: [string, number][]; batches: number; snapshots: number; compacted: boolean; scrubbed: boolean }

export async function readCoverage(store: Store, area: string, nowS: number, compactAfter = COMPACT_AFTER_BATCHES): Promise<Coverage> {
  const paths = await store.list(`cov/${area}/`);
  const snaps = paths.filter((p) => /\/s-\d+\.json$/.test(p));
  const batches = paths.filter((p) => /\/b-\d+-\w+\.json$/.test(p));
  const merged = new Map<string, number>();
  const cutoff = dayStart(nowS - WINDOW_DAYS * DAY_S);
  let exact = false; // saw a timestamp that still carries a time of day (written before day-only tracking)
  const take = (k: string, t: number) => {
    const d = dayStart(t);
    if (d !== t) exact = true;
    if (d >= cutoff && d > (merged.get(k) ?? 0)) merged.set(k, d);
  };

  const bodies = await Promise.all([...snaps, ...batches].map(async (p) => [p, await store.read(p)] as const));
  for (const [p, text] of bodies) {
    if (!text) continue;
    try {
      const j = JSON.parse(text) as { e?: unknown };
      if (Array.isArray(j.e)) for (const [k, t] of j.e as [string, number][]) take(k, t);
      else if (j.e && typeof j.e === "object") for (const [k, t] of Object.entries(j.e as Record<string, number>)) take(k, t);
    } catch { /* skip a corrupt object rather than failing every reader */ }
    void p;
  }

  let compacted = false;
  if (batches.length >= compactAfter || snaps.length > 1 || exact) {
    const snapPath = `cov/${area}/s-${String(nowS).padStart(11, "0")}.json`;
    await store.put(snapPath, JSON.stringify({ e: Object.fromEntries(merged) }));
    await store.del([...snaps, ...batches].filter((p) => p !== snapPath));
    compacted = true;
  }
  return { entries: [...merged.entries()], batches: batches.length, snapshots: snaps.length, compacted, scrubbed: exact };
}
