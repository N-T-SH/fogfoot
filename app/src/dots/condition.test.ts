import { test } from "node:test";
import assert from "node:assert/strict";
import { COND_AT, demoIssues, fromIssues, stretchCond } from "./condition.ts";

test("few obstructions is green, several is orange, many is red", () => {
  assert.equal(fromIssues(0), "green");
  assert.equal(fromIssues(COND_AT.orange - 1), "green");
  assert.equal(fromIssues(COND_AT.orange), "orange");
  assert.equal(fromIssues(COND_AT.red - 1), "orange");
  assert.equal(fromIssues(COND_AT.red), "red");
  assert.equal(fromIssues(9), "red");
});

test("locked beats everything; assessed beats walked; walked is pending; nothing is grey", () => {
  assert.equal(stretchCond({ locked: true, walked: true, issues: 0 }), "black");
  assert.equal(stretchCond({ locked: false, walked: false, issues: 5 }), "red");     // known from another source even if not walked lately
  assert.equal(stretchCond({ locked: false, walked: true, issues: 0 }), "green");
  assert.equal(stretchCond({ locked: false, walked: true }), "pending");
  assert.equal(stretchCond({ locked: false, walked: false }), "grey");
});

test("demo conditions are stable and give a believable mix", () => {
  assert.equal(demoIssues("g10_20"), demoIssues("g10_20"));
  const n = 5000, c = { green: 0, orange: 0, red: 0 };
  for (let i = 0; i < n; i++) c[fromIssues(demoIssues(`g${i}_${i * 7}`))]++;
  assert.ok(c.green / n > 0.55 && c.green / n < 0.8, `green share ${c.green / n}`);
  assert.ok(c.orange > 0 && c.red > 0);
});
