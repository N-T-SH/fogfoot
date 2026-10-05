import { blobStore } from "./_lib/blobStore.js";
import { addBatch, isArea, readCoverage } from "./_lib/coverage.js";

/** GET /api/health: writes a dot to the private "healthcheck" area, reads it back, cleans up. Exercises the real storage path. */
export async function GET(req: Request) {
  // GET /api/health?area=domlur -> object counts only (no coverage data), to check storage housekeeping.
  const area = new URL(req.url).searchParams.get("area");
  if (area) {
    if (!isArea(area)) return new Response(JSON.stringify({ error: "unknown area" }), { status: 400, headers: { "content-type": "application/json" } });
    try {
      const paths = await blobStore.list(`cov/${area}/`);
      const out = { area, objects: paths.length, batches: paths.filter((p) => /\/b-/.test(p)).length, snapshots: paths.filter((p) => /\/s-/.test(p)).length };
      return new Response(JSON.stringify(out), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
    } catch (err) {
      return new Response(JSON.stringify({ error: String((err as Error).message).slice(0, 200) }), { status: 503, headers: { "content-type": "application/json" } });
    }
  }
  const steps: Record<string, unknown> = {};
  const t0 = Date.now();
  try {
    const nowS = Math.floor(t0 / 1000);
    await addBatch(blobStore, "healthcheck", [["1_0_L:0", nowS]], nowS);
    steps.write = "ok";
    const c = await readCoverage(blobStore, "healthcheck", nowS, 1); // compactAfter=1 also tests snapshot write + delete
    steps.read = c.entries.length >= 1 ? "ok" : "missing";
    steps.compacted = c.compacted;
    const left = await blobStore.list("cov/healthcheck/");
    await blobStore.del(left);
    steps.cleanup = "ok";
    const ok = steps.read === "ok";
    return new Response(JSON.stringify({ ok, ms: Date.now() - t0, region: process.env.VERCEL_REGION ?? null, steps }), {
      status: ok ? 200 : 500, headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, ms: Date.now() - t0, steps, error: String((err as Error).message).slice(0, 300) }), {
      status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
}
