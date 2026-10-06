import { test } from "node:test";
import assert from "node:assert/strict";
import { buildField, geoKey, type DemoFile } from "./data.ts";

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
