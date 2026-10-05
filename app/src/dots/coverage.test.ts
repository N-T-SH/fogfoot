import assert from "node:assert/strict";
import { test } from "node:test";
import { Coverage, dayStartMs, WINDOW_DAYS } from "./coverage.ts";

const DAY = 86400000;
const KEY = "105322112_0_L:3";
const at = (iso: string) => Date.parse(iso);

function withClock<T>(iso: string, fn: () => T): T {
  const real = Date.now;
  Date.now = () => at(iso);
  try { return fn(); } finally { Date.now = real; }
}

test("first walk picks an item up and queues only the DAY for upload", () => {
  withClock("2026-10-05T09:31:28Z", () => {                       // 15:01:28 IST
    const c = new Coverage("domlur");
    assert.equal(c.eat(KEY, true), "new");
    assert.equal(c.state(KEY), "mine");
    const sent = [...c.outbox.values()];
    assert.equal(sent.length, 1);
    assert.equal(sent[0], at("2026-10-04T18:30:00Z"));            // 05 Oct 00:00 IST
    assert.ok(sent.every((ms) => dayStartMs(ms) === ms));
  });
});

test("walking it again the same day does nothing", () => {
  withClock("2026-10-05T09:31:28Z", () => {
    const c = new Coverage("domlur");
    c.eat(KEY, true);
    withClock("2026-10-05T17:00:00Z", () => assert.equal(c.eat(KEY, true), "skip"));   // 22:30 IST, still the same India day
  });
});

test("a different day refreshes it", () => {
  const c = new Coverage("domlur");
  withClock("2026-10-05T09:31:28Z", () => c.eat(KEY, true));
  withClock("2026-10-05T19:00:00Z", () => assert.equal(c.eat(KEY, true), "refresh"));  // 00:30 IST on 6 Oct
});

test("what another walker covered today also counts as done today", () => {
  withClock("2026-10-05T09:31:28Z", () => {
    const c = new Coverage("domlur");
    c.shared.set(KEY, at("2026-10-04T18:30:00Z"));                // server value: day start only
    assert.equal(c.state(KEY), "others");
    assert.equal(c.eat(KEY, true), "skip");
  });
});

test("coverage expires after the window and the item is there to pick up again", () => {
  const c = new Coverage("domlur");
  withClock("2026-10-05T09:31:28Z", () => c.eat(KEY, false));
  c.offsetDays = WINDOW_DAYS + 1;
  assert.equal(c.state(KEY), "none");
  assert.equal(c.eat(KEY, false), "new");
});

test("simulated walks (share = false) are never queued for upload", () => {
  const c = new Coverage("domlur");
  c.eat(KEY, false);
  assert.equal(c.outbox.size, 0);
  assert.equal(c.mine.size, 1);
});

test("day boundaries are India midnight", () => {
  assert.equal(dayStartMs(at("2026-10-04T18:29:59Z")), at("2026-10-03T18:30:00Z"));   // 23:59:59 IST on 4 Oct
  assert.equal(dayStartMs(at("2026-10-04T18:30:00Z")), at("2026-10-04T18:30:00Z"));   // 00:00:00 IST on 5 Oct
  assert.equal(dayStartMs(at("2026-10-04T18:30:00Z") + DAY - 1), at("2026-10-04T18:30:00Z"));
});
