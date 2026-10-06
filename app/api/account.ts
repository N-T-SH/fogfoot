import { account } from "./_lib/account.js";
import { authConfig } from "./_lib/auth.js";
import { blobStore } from "./_lib/blobStore.js";

const run = async (req: Request) => {
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try {
      const t = await req.text();
      if (t.length > 8000) return new Response(JSON.stringify({ error: "body too large" }), { status: 413 });
      body = JSON.parse(t);
    } catch { return new Response(JSON.stringify({ error: "invalid JSON" }), { status: 400 }); }
  }
  try {
    const r = await account(blobStore, authConfig(process.env), { method: req.method, cookie: req.headers.get("cookie"), body }, Math.floor(Date.now() / 1000));
    const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
    if (r.cookie) headers.append("set-cookie", r.cookie);
    return new Response(JSON.stringify(r.body), { status: r.status, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: "account service unavailable", detail: String((e as Error).message).slice(0, 160) }), { status: 503, headers: { "content-type": "application/json" } });
  }
};

/** GET /api/account -> who am I.  POST /api/account {action: login|logout|handle|consent|withdraw|export|delete|report, ...} */
export const GET = run;
export const POST = run;
