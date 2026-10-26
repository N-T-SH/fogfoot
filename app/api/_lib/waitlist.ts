// Waitlist for the landing page. We keep the least we can: the e-mail the person typed, an optional area, the page
// language and the day they joined. No IP address, no user agent, no tracking. They are asked once, by an unticked
// checkbox, and can remove themselves at any time from the same page.
import { createHash } from "node:crypto";
import { dayStart, type Store } from "./coverage.js";

export const WAITLIST_NOTICE = "waitlist-2026-10-26";   // bump when the wording on the page changes
export const DAILY_JOIN_CAP = 300;                       // blunt guard against a script filling storage
const AREAS = new Set(["domlur", "koramangala", "indiranagar", "hsr", "other-bengaluru", "outside-bengaluru"]);
const LANGS = new Set(["en", "kn", "hi"]);

export const normaliseEmail = (e: string) => e.trim().toLowerCase();
export const validEmail = (e: unknown): e is string =>
  typeof e === "string" && e.length <= 254 && /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/.test(e.trim());
export const emailId = (email: string) => createHash("sha256").update(normaliseEmail(email)).digest("hex");
const rec = (email: string) => `waitlist/${emailId(email)}.json`;

/** Origins allowed to post from a browser. The landing page lives on github.io, the prototype on vercel.app. */
const ORIGINS = new Set(["https://n-t-sh.github.io", "https://fogfoot.vercel.app", "http://localhost:5173", "http://localhost:4173"]);
export const allowedOrigin = (o: string | null) => (o && ORIGINS.has(o) ? o : null);

export type JoinResult = { status: number; body: { ok?: true; error?: string } };

export async function join(store: Store, body: Record<string, unknown>, nowS: number): Promise<JoinResult> {
  if (typeof body.website === "string" && body.website !== "") return { status: 200, body: { ok: true } };       // honeypot: bots fill it, people never see it
  if (typeof body.t === "number" && body.t < 1500) return { status: 200, body: { ok: true } };                    // submitted faster than a person can type
  if (!validEmail(body.email)) return { status: 400, body: { error: "That e-mail does not look right." } };
  if (body.agree !== true) return { status: 400, body: { error: "Please tick the box so we know you agree." } };
  const area = typeof body.area === "string" && AREAS.has(body.area) ? body.area : null;
  const lang = typeof body.lang === "string" && LANGS.has(body.lang) ? body.lang : "en";
  const day = dayStart(nowS);

  const email = normaliseEmail(body.email);
  if (await store.read(rec(email))) return { status: 200, body: { ok: true } };                                   // already on the list; say nothing different

  const metaPath = `waitlist-meta/${day}.json`;
  const n = Number(JSON.parse((await store.read(metaPath)) ?? "{}").n ?? 0);
  if (n >= DAILY_JOIN_CAP) return { status: 429, body: { error: "Lots of people are joining today. Please try again tomorrow." } };
  await store.put(rec(email), JSON.stringify({ email, area, lang, day, notice: WAITLIST_NOTICE }));
  await store.put(metaPath, JSON.stringify({ n: n + 1 }));
  return { status: 200, body: { ok: true } };
}

/** Removal never reveals whether the address was on the list. */
export async function remove(store: Store, body: Record<string, unknown>): Promise<JoinResult> {
  if (!validEmail(body.email)) return { status: 400, body: { error: "That e-mail does not look right." } };
  await store.del([rec(body.email)]);
  return { status: 200, body: { ok: true } };
}

const csvCell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;                 // stop spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export async function exportCsv(store: Store): Promise<string> {
  const rows = ["email,area,language,day_joined_ist"];
  for (const p of (await store.list("waitlist/")).sort()) {
    const t = await store.read(p);
    if (!t) continue;
    try {
      const r = JSON.parse(t) as { email: string; area: string | null; lang: string; day: number };
      rows.push([r.email, r.area, r.lang, new Date((r.day + 19800) * 1000).toISOString().slice(0, 10)].map(csvCell).join(","));
    } catch { /* skip a damaged record */ }
  }
  return rows.join("\n") + "\n";
}
