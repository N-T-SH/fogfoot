import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedOrigin, DAILY_JOIN_CAP, emailId, exportCsv, join, remove, validEmail } from "./waitlist.ts";
import type { Store } from "./coverage.ts";

const NOW = Date.UTC(2026, 9, 26, 6, 0, 0) / 1000;
const mem = () => {
  const files = new Map<string, string>();
  const s: Store & { files: Map<string, string> } = {
    files,
    async put(p, b) { files.set(p, b); },
    async list(prefix) { return [...files.keys()].filter((k) => k.startsWith(prefix)); },
    async read(p) { return files.get(p) ?? null; },
    async del(ps) { ps.forEach((p) => files.delete(p)); },
  };
  return s;
};
const ok = { email: "Asha@Example.com ", agree: true, area: "domlur", lang: "kn", website: "", t: 6000 };

test("e-mail validation", () => {
  for (const e of ["a@b.co", "first.last+tag@sub.example.in"]) assert.ok(validEmail(e), e);
  for (const e of ["", "a@b", "a b@c.com", "<x>@y.com", "a@b.c", "x".repeat(250) + "@y.com", 5, null]) assert.equal(validEmail(e), false, String(e));
});

test("join stores the address lower-cased once, with the day only, and nothing about the visitor", async () => {
  const s = mem();
  assert.deepEqual((await join(s, ok, NOW)).body, { ok: true });
  assert.deepEqual((await join(s, { ...ok, email: "asha@example.com" }, NOW)).body, { ok: true });   // duplicate: same answer
  const recs = [...s.files.keys()].filter((k) => k.startsWith("waitlist/"));
  assert.equal(recs.length, 1);
  const r = JSON.parse(s.files.get(recs[0])!);
  assert.deepEqual(Object.keys(r).sort(), ["area", "day", "email", "lang", "notice"]);
  assert.equal(r.email, "asha@example.com");
  assert.equal(r.day, Date.UTC(2026, 9, 25, 18, 30) / 1000);   // 26 Oct 00:00 IST, not an exact time
  assert.equal(JSON.parse(s.files.get([...s.files.keys()].find((k) => k.startsWith("waitlist-meta/"))!)!).n, 1);
});

test("join needs the box ticked and a valid address; bots and instant submits are ignored without being stored", async () => {
  const s = mem();
  assert.equal((await join(s, { ...ok, agree: false }, NOW)).status, 400);
  assert.equal((await join(s, { ...ok, email: "nope" }, NOW)).status, 400);
  assert.equal((await join(s, { ...ok, website: "http://spam" }, NOW)).status, 200);
  assert.equal((await join(s, { ...ok, t: 200 }, NOW)).status, 200);
  assert.equal(s.files.size, 0);
});

test("unknown area and language fall back instead of being stored", async () => {
  const s = mem();
  await join(s, { ...ok, area: "<script>", lang: "xx" }, NOW);
  const r = JSON.parse([...s.files.entries()].find(([k]) => k.startsWith("waitlist/"))![1]);
  assert.equal(r.area, null);
  assert.equal(r.lang, "en");
});

test("daily cap stops a flood and resets the next day", async () => {
  const s = mem();
  s.files.set(`waitlist-meta/${Date.UTC(2026, 9, 25, 18, 30) / 1000}.json`, JSON.stringify({ n: DAILY_JOIN_CAP }));
  assert.equal((await join(s, ok, NOW)).status, 429);
  assert.equal((await join(s, ok, NOW + 86400)).status, 200);
});

test("remove deletes the record and never says whether it existed", async () => {
  const s = mem();
  await join(s, ok, NOW);
  assert.equal((await remove(s, { email: "ASHA@example.com" })).status, 200);
  assert.ok(![...s.files.keys()].some((k) => k === `waitlist/${emailId("asha@example.com")}.json`));
  assert.equal((await remove(s, { email: "ghost@example.com" })).status, 200);
  assert.equal((await remove(s, { email: "bad" })).status, 400);
});

test("CSV export lists rows and neutralises spreadsheet formulas", async () => {
  const s = mem();
  await join(s, ok, NOW);
  s.files.set("waitlist/zz.json", JSON.stringify({ email: "=HYPERLINK(\"x\")@e.com", area: null, lang: "en", day: NOW }));
  const csv = await exportCsv(s);
  assert.match(csv, /^email,area,language,day_joined_ist\n/);
  assert.match(csv, /asha@example.com,domlur,kn,2026-10-26/);
  assert.match(csv, /'=HYPERLINK/);
});

test("only our own sites may post from a browser", () => {
  assert.equal(allowedOrigin("https://n-t-sh.github.io"), "https://n-t-sh.github.io");
  assert.equal(allowedOrigin("https://evil.example"), null);
  assert.equal(allowedOrigin(null), null);
});
