import { allowShare } from "./_lib/account.js";
import { authConfig } from "./_lib/auth.js";
import { blobStore } from "./_lib/blobStore.js";
import { addBatch, isArea, readCoverage, validateBatch } from "./_lib/coverage.js";

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extra } });

/** GET /api/coverage?area=domlur -> { now, e: [[dotKey, dayStartUnixSeconds], ...] } for the last 30 days (day precision only). */
export async function GET(req: Request) {
  const area = new URL(req.url).searchParams.get("area") ?? "";
  if (!isArea(area)) return json({ error: "unknown area" }, 400);
  try {
    const nowS = Math.floor(Date.now() / 1000);
    const c = await readCoverage(blobStore, area, nowS);
    // Short CDN cache: many phones share one origin read.
    return json({ now: nowS, e: c.entries }, 200, { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" });
  } catch (err) {
    return json({ error: "storage unavailable", detail: String((err as Error).message).slice(0, 200) }, 503, { "cache-control": "no-store" });
  }
}

/** POST /api/coverage  { area, e: [[dotKey, unixSeconds], ...] }  (at most 300 dots) */
export async function POST(req: Request) {
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 32_000) return json({ error: "body too large" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const nowS = Math.floor(Date.now() / 1000);
  const v = validateBatch(body, nowS);
  if (!v.ok) return json({ error: v.error }, 400);
  try {
    // When sign-in is switched on, only signed-in people who accepted the notice may share, with a daily cap.
    // The coverage itself stays anonymous: no user id is ever written next to a dot.
    const gate = await allowShare(blobStore, authConfig(process.env), req.headers.get("cookie"), v.entries.length, nowS);
    if (!gate.ok) return json({ error: gate.error }, gate.status, { "cache-control": "no-store" });
    await addBatch(blobStore, v.area, v.entries, nowS);
    return json({ ok: true, accepted: v.entries.length }, 200, { "cache-control": "no-store" });
  } catch (err) {
    return json({ error: "storage unavailable", detail: String((err as Error).message).slice(0, 200) }, 503, { "cache-control": "no-store" });
  }
}
