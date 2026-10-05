import assert from "node:assert/strict";
import { test } from "node:test";
import { addBatch, dayStart, isArea, MAX_BATCH, readCoverage, validateBatch, WINDOW_DAYS, type Store } from "./coverage.ts";

const NOW = 1_791_100_000;
const DAY = 86400;

function memStore(): Store & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    async put(p, b) { files.set(p, b); },
    async list(prefix) { return [...files.keys()].filter((k) => k.startsWith(prefix)).sort(); },
    async read(p) { return files.get(p) ?? null; },
    async del(ps) { for (const p of ps) files.delete(p); },
  };
}

test("accepts a valid batch, keeps only unexpired entries, and stores the day not the time", () => {
  const r = validateBatch({ area: "domlur", e: [["123_0_L:3", NOW - 10], ["123_0_L:4", NOW - 40 * DAY]] }, NOW);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.entries, [["123_0_L:3", dayStart(NOW - 10)]]);
});

test("dayStart rounds down to midnight India time (UTC+5:30)", () => {
  const t = Date.UTC(2026, 9, 5, 9, 31, 28) / 1000;              // 05 Oct 2026 15:01:28 IST
  assert.equal(dayStart(t), Date.UTC(2026, 9, 4, 18, 30, 0) / 1000); // 05 Oct 2026 00:00 IST
  assert.equal(dayStart(dayStart(t)), dayStart(t));                  // idempotent
  assert.equal(dayStart(dayStart(t) + 86399), dayStart(t));          // last second of the same day
  assert.equal(dayStart(dayStart(t) + 86400), dayStart(t) + 86400);  // next day starts on the boundary
});

test("isArea only accepts known areas", () => {
  assert.equal(isArea("domlur"), true);
  assert.equal(isArea("domlur-test"), true);
  assert.equal(isArea("../etc"), false);
  assert.equal(isArea(undefined), false);
});

for (const [name, body, msg] of [
  ["unknown area", { area: "mumbai", e: [["1_0_L:0", NOW]] }, /unknown area/],
  ["empty", { area: "domlur", e: [] }, /non-empty/],
  ["bad key", { area: "domlur", e: [["../../etc:1", NOW]] }, /bad dot key/],
  ["future timestamp", { area: "domlur", e: [["1_0_L:0", NOW + 3600]] }, /future/],
  ["not an object", "hi", /object/],
  ["entry shape", { area: "domlur", e: [["1_0_L:0"]] }, /\[key, seconds\]/],
] as const) {
  test(`rejects ${name}`, () => {
    const r = validateBatch(body as unknown, NOW);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, msg);
  });
}

test("rejects an oversized batch", () => {
  const e = Array.from({ length: MAX_BATCH + 1 }, (_, i) => [`1_0_L:${i % 9999}`, NOW]);
  assert.equal(validateBatch({ area: "domlur", e }, NOW).ok, false);
});

test("test rooms are separate areas", () => {
  assert.equal(validateBatch({ area: "domlur-test", e: [["1_0_L:0", NOW]] }, NOW).ok, true);
  assert.equal(validateBatch({ area: "domlur-evil", e: [["1_0_L:0", NOW]] }, NOW).ok, false);
});

test("two walkers' batches merge, newest timestamp wins", async () => {
  const s = memStore();
  await addBatch(s, "domlur", [["1_0_L:0", NOW - 5 * DAY], ["1_0_L:1", NOW - 5 * DAY]], NOW - 5 * DAY);
  await addBatch(s, "domlur", [["1_0_L:1", NOW - 1 * DAY], ["1_0_R:0", NOW - 1 * DAY]], NOW - 1 * DAY);
  const c = await readCoverage(s, "domlur", NOW);
  assert.deepEqual(Object.fromEntries(c.entries), { "1_0_L:0": dayStart(NOW - 5 * DAY), "1_0_L:1": dayStart(NOW - 1 * DAY), "1_0_R:0": dayStart(NOW - 1 * DAY) });
  assert.equal(c.batches, 2);
  assert.equal(c.compacted, false);
  assert.equal(c.scrubbed, false);
});

test("no timestamp in storage or in a read carries a time of day", async () => {
  const s = memStore();
  await addBatch(s, "domlur", [["1_0_L:0", NOW - 123], ["1_0_L:1", NOW - 4567]], NOW);
  const stored = [...s.files.values()].flatMap((v) => (JSON.parse(v) as { e: [string, number][] }).e.map(([, t]) => t));
  assert.ok(stored.every((t) => dayStart(t) === t));
  const c = await readCoverage(s, "domlur", NOW);
  assert.ok(c.entries.every(([, t]) => dayStart(t) === t));
});

test("old objects that hold exact times are rewritten to days on first read (scrub)", async () => {
  const s = memStore();
  // written before day-only tracking: second-level timestamps in a batch and in a snapshot
  s.files.set("cov/domlur/b-00001791099000-abc123.json", JSON.stringify({ e: [["1_0_L:0", NOW - 100], ["1_0_R:0", NOW - 90]] }));
  s.files.set("cov/domlur/s-00001791098000.json", JSON.stringify({ e: { "2_0_L:0": NOW - 3333 } }));
  const c = await readCoverage(s, "domlur", NOW);
  assert.equal(c.scrubbed, true);
  assert.equal(c.compacted, true);
  assert.ok(c.entries.every(([, t]) => dayStart(t) === t));
  const files = await s.list("cov/domlur/");
  assert.equal(files.length, 1);                                       // legacy batch + snapshot replaced by one snapshot
  const body = JSON.parse((await s.read(files[0]))!) as { e: Record<string, number> };
  assert.equal(Object.keys(body.e).length, 3);
  assert.ok(Object.values(body.e).every((t) => dayStart(t) === t));    // nothing exact survives in storage
  const again = await readCoverage(s, "domlur", NOW);
  assert.equal(again.scrubbed, false);                                 // and it is a one-time job
});

test("rounding does not drop an entry that is still inside the window", async () => {
  const s = memStore();
  const t = NOW - WINDOW_DAYS * DAY + 3600;                            // one hour inside the window, early in its day
  s.files.set("cov/domlur/b-00001791099000-abc123.json", JSON.stringify({ e: [["1_0_L:0", t]] }));
  assert.equal((await readCoverage(s, "domlur", NOW)).entries.length, 1);
});

test("areas do not leak into each other", async () => {
  const s = memStore();
  await addBatch(s, "domlur", [["1_0_L:0", NOW]], NOW);
  await addBatch(s, "domlur-test", [["2_0_L:0", NOW]], NOW);
  assert.deepEqual((await readCoverage(s, "domlur", NOW)).entries.map((e) => e[0]), ["1_0_L:0"]);
  assert.deepEqual((await readCoverage(s, "domlur-test", NOW)).entries.map((e) => e[0]), ["2_0_L:0"]);
});

test("coverage expires after the window", async () => {
  const s = memStore();
  await addBatch(s, "domlur", [["1_0_L:0", NOW - (WINDOW_DAYS - 1) * DAY], ["1_0_L:1", NOW - (WINDOW_DAYS + 1) * DAY]], NOW);
  assert.deepEqual((await readCoverage(s, "domlur", NOW)).entries.map((e) => e[0]), ["1_0_L:0"]);
});

test("many batches compact into one snapshot without losing or inventing dots", async () => {
  const s = memStore();
  for (let i = 0; i < 12; i++) await addBatch(s, "domlur", [[`1_0_L:${i}`, NOW - i]], NOW - i);
  const before = await readCoverage(s, "domlur", NOW, 1000);
  const c = await readCoverage(s, "domlur", NOW, 10);
  assert.equal(c.compacted, true);
  assert.deepEqual(new Map(c.entries), new Map(before.entries));
  const files = await s.list("cov/domlur/");
  assert.equal(files.length, 1);
  assert.match(files[0], /\/s-\d+\.json$/);
  assert.deepEqual(new Map((await readCoverage(s, "domlur", NOW)).entries), new Map(before.entries));   // reads the snapshot alone
  await addBatch(s, "domlur", [["9_0_R:0", NOW]], NOW);                                                  // new batch after compaction still merges
  assert.equal((await readCoverage(s, "domlur", NOW)).entries.length, 13);
});

test("two snapshots (concurrent compaction) are merged and collapsed", async () => {
  const s = memStore();
  s.files.set("cov/domlur/s-00001791099900.json", JSON.stringify({ e: { "1_0_L:0": NOW - 100 } }));
  s.files.set("cov/domlur/s-00001791099999.json", JSON.stringify({ e: { "1_0_L:1": NOW - 50 } }));
  const c = await readCoverage(s, "domlur", NOW);
  assert.equal(c.entries.length, 2);
  assert.equal(c.compacted, true);
  assert.equal((await s.list("cov/domlur/")).length, 1);
});

test("a corrupt object does not break readers", async () => {
  const s = memStore();
  await addBatch(s, "domlur", [["1_0_L:0", NOW]], NOW);
  s.files.set("cov/domlur/b-00001791099999-junk.json", "{not json");
  assert.deepEqual((await readCoverage(s, "domlur", NOW)).entries.map((e) => e[0]), ["1_0_L:0"]);
});
