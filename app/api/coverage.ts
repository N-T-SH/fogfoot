import { blobStore } from "./_lib/blobStore";
import { addBatch, readCoverage, validateBatch } from "./_lib/coverage";

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extra } });

/** GET /api/coverage?area=domlur -> { now, e: [[dotKey, unixSeconds], ...] } for the last 30 days. */
export async function GET(req: Request) {
  const area = new URL(req.url).searchParams.get("area") ?? "";
  const check = validateBatch({ area, e: [["1_0_L:0", 0]] }, Math.floor(Date.now() / 1000)); // reuse the area check
  if (!check.ok && check.error === "unknown area") return json({ error: "unknown area" }, 400);
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
    await addBatch(blobStore, v.area, v.entries, nowS);
    return json({ ok: true, accepted: v.entries.length }, 200, { "cache-control": "no-store" });
  } catch (err) {
    return json({ error: "storage unavailable", detail: String((err as Error).message).slice(0, 200) }, 503, { "cache-control": "no-store" });
  }
}
