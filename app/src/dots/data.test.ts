import { test } from "node:test";
import assert from "node:assert/strict";
import { buildField, dotsOnSide, geoKey, type DemoFile } from "./data.ts";

const line: [number, number][] = [[77.6400, 12.9600], [77.6400, 12.9620]];
const demo = (id: string, c = line): DemoFile => ({ name: "t", area: "domlur", center: [77.64, 12.961], units: [{ id, k: "k", c }] });

test("dot keys do not depend on unit ids", () => {
  const a = buildField(demo("111_0_L")), b = buildField(demo("999_7_R"));
  assert.deepEqual(a.key, b.key);
  assert.ok(a.key.length > 5);
});

test("keys match the server's geo-cell format and are not unit based", () => {
  for (const k of buildField(demo("1_0_L")).key) assert.match(k, /^g\d{1,6}_\d{1,6}$/);
});

test("a few metres of drift keeps most dots in the same cell, 40 m of drift keeps none", () => {
  const same = (shiftLat: number) => {
    const a = buildField(demo("x")).key, b = buildField(demo("x", line.map(([lo, la]) => [lo, la + shiftLat] as [number, number]))).key;
    return a.filter((k, i) => k === b[i]).length / a.length;
  };
  assert.ok(same(0) === 1);
  assert.ok(same(0.0004) < 0.2);
});

test("neighbouring kerbs 8 m apart get different keys", () => {
  assert.notEqual(geoKey(77.64, 12.96), geoKey(77.64 + 8 / (111320 * Math.cos(0.2262)), 12.96));
});

// Two parallel kerbs 8 m apart (east-west road), walker near the middle but a bit closer to the north kerb.
const road = (): DemoFile => ({
  name: "t", area: "domlur", center: [77.64, 12.961],
  units: [
    { id: "1_0_L", k: "k", c: [[77.6400, 12.96104], [77.6410, 12.96104]] },   // north kerb (+~4 m)
    { id: "1_0_R", k: "k", c: [[77.6400, 12.96096], [77.6410, 12.96096]] },   // south kerb (-~4 m)
  ],
});

test("a walker credits only the nearer kerb, not both", () => {
  const f = buildField(road());
  const [x, y] = [50, 1.5];                                   // 1.5 m north of the centre line
  const r = dotsOnSide(f, x, y, 12);
  assert.ok(r.dots.length > 0 && r.dots.every((i) => f.unit[i] === r.unit));
  assert.equal(f.units[r.unit].id, "1_0_L");
});

test("hysteresis: GPS wobble across the centre line does not flip kerbs, a clear move does", () => {
  const f = buildField(road());
  const north = f.units.findIndex((u) => u.id === "1_0_L"), south = 1 - north;
  assert.equal(dotsOnSide(f, 50, -1.5, 12, north).unit, north);   // slightly nearer the south kerb, but still sticky
  assert.equal(dotsOnSide(f, 50, -3.9, 12, north).unit, south);   // clearly on the south side now
});
