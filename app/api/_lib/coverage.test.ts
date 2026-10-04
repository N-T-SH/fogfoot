import assert from "node:assert/strict";
import { test } from "node:test";
import { addBatch, MAX_BATCH, readCoverage, validateBatch, WINDOW_DAYS, type Store } from "./coverage.ts";

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

test("accepts a valid batch and keeps only unexpired entries", () => {
  const r = validateBatch({ area: "domlur", e: [["123_0_L:3", NOW - 10], ["123_0_L:4", NOW - 40 * DAY]] }, NOW);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.entries, [["123_0_L:3", NOW - 10]]);
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
  assert.deepEqual(Object.fromEntries(c.entries), { "1_0_L:0": NOW - 5 * DAY, "1_0_L:1": NOW - 1 * DAY, "1_0_R:0": NOW - 1 * DAY });
  assert.equal(c.batches, 2);
  assert.equal(c.compacted, false);
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
