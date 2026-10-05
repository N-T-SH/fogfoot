import assert from "node:assert/strict";
import { test } from "node:test";
import { courseDeg, isFull, shouldSample, storageBudget } from "./rules.ts";

const CFG = { sampleEveryM: 10, maxGpsAccM: 35 };
const HERE = { lat: 12.9528, lon: 77.6389 };
const metresNorth = (m: number) => ({ lat: HERE.lat + m / 110574, lon: HERE.lon });

test("the first good fix saves a frame", () => {
  assert.equal(shouldSample(null, { ...HERE, acc: 5 }, CFG), "ok");
});

test("a vague GPS fix never saves a frame", () => {
  assert.equal(shouldSample(null, { ...HERE, acc: 60 }, CFG), "poor_gps");
  assert.equal(shouldSample(null, { ...HERE, acc: 35 }, CFG), "ok");        // exactly at the limit is fine
  assert.equal(shouldSample(null, { ...HERE, acc: 35.1 }, CFG), "poor_gps");
});

test("frames are spaced about 10 m apart", () => {
  assert.equal(shouldSample(HERE, { ...metresNorth(4), acc: 5 }, CFG), "too_close");
  assert.equal(shouldSample(HERE, { ...metresNorth(9.5), acc: 5 }, CFG), "too_close");
  assert.equal(shouldSample(HERE, { ...metresNorth(10.5), acc: 5 }, CFG), "ok");
});

test("standing still saves nothing, however long you stand", () => {
  for (let i = 0; i < 50; i++) assert.equal(shouldSample(HERE, { lat: HERE.lat + (i % 2) * 1e-6, lon: HERE.lon, acc: 5 }, CFG), "too_close");
});

test("the storage budget is the smaller of our cap and a share of the free space", () => {
  assert.equal(storageBudget(150e6, undefined, undefined), 150e6);                    // browser will not say: use our cap
  assert.equal(storageBudget(150e6, 10e9, 1e9), 150e6);                               // plenty of room: our cap wins
  assert.equal(storageBudget(150e6, 500e6, 300e6), 80e6);                             // 40% of 200 MB free
  assert.equal(storageBudget(150e6, 500e6, 600e6), 0);                                // already over quota: nothing
});

test("full means the next frame would not fit", () => {
  assert.equal(isFull(100e6, 90e3, 150e6), false);
  assert.equal(isFull(149.95e6, 90e3, 150e6), true);
  assert.equal(isFull(0, 1, 0), true);
});

test("course of travel: north, east, and 'too close to say'", () => {
  assert.ok(Math.abs(courseDeg(HERE, metresNorth(20))! - 0) < 0.5);
  const east = { lat: HERE.lat, lon: HERE.lon + 20 / (111320 * Math.cos((HERE.lat * Math.PI) / 180)) };
  assert.ok(Math.abs(courseDeg(HERE, east)! - 90) < 0.5);
  assert.equal(courseDeg(HERE, metresNorth(1)), null);
});
