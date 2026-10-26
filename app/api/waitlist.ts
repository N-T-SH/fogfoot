import { timingSafeEqual } from "node:crypto";
import { blobStore } from "./_lib/blobStore.js";
import { allowedOrigin, exportCsv, join, remove } from "./_lib/waitlist.js";

const cors = (origin: string | null): Record<string, string> => {
  const o = allowedOrigin(origin);
  return o ? { "access-control-allow-origin": o, "access-control-allow-methods": "POST, GET, OPTIONS", "access-control-allow-headers": "content-type, authorization", vary: "origin" } : { vary: "origin" };
};
const reply = (body: unknown, status: number, origin: string | null, extra: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": typeof body === "string" ? "text/csv; charset=utf-8" : "application/json", "cache-control": "no-store", ...cors(origin), ...extra } });

export const OPTIONS = (req: Request) => new Response(null, { status: 204, headers: cors(req.headers.get("origin")) });

/** POST /api/waitlist {email, agree:true, area?, lang?, website:"" (honeypot), t: ms on page}  or  {action:"remove", email} */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!allowedOrigin(origin)) return reply({ error: "not allowed from this site" }, 403, origin);
  let body: Record<string, unknown>;
  try {
    const t = await req.text();
    if (t.length > 2000) return reply({ error: "body too large" }, 413, origin);
    body = JSON.parse(t);
  } catch { return reply({ error: "invalid JSON" }, 400, origin); }
  try {
    const r = body.action === "remove" ? await remove(blobStore, body) : await join(blobStore, body, Math.floor(Date.now() / 1000));
    return reply(r.body, r.status, origin);
  } catch { return reply({ error: "Could not save right now. Please try again in a bit." }, 503, origin); }
}

/** GET /api/waitlist with  Authorization: Bearer <WAITLIST_ADMIN_TOKEN>  returns the list as CSV. Off unless that variable is set. */
export async function GET(req: Request) {
  const token = process.env.WAITLIST_ADMIN_TOKEN?.trim();
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const ok = !!token && token.length >= 24 && given.length === token.length && timingSafeEqual(Buffer.from(given), Buffer.from(token));
  if (!ok) return reply({ error: "not found" }, 404, null);
  try { return reply(await exportCsv(blobStore), 200, null, { "content-disposition": 'attachment; filename="waitlist.csv"' }); }
  catch { return reply({ error: "storage unavailable" }, 503, null); }
}
