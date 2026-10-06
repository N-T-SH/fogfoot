import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { account, allowShare } from "./account.ts";
import { authConfig, cookieFrom, DAILY_DOT_CAP, CONSENT_VERSION, readSession, signSession, validHandle, verifyGoogleIdToken, type Jwk } from "./auth.ts";
import type { Store } from "./coverage.ts";

const NOW = Date.UTC(2026, 9, 6, 6, 0, 0) / 1000;
const CFG = authConfig({ GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com", SESSION_SECRET: "x".repeat(40) })!;

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

// A fake Google: our own RSA key, published as a JWK.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: "jwk" }) as { n: string; e: string; kty: string }), kid: "k1" } as Jwk;
const keys = async () => [jwk];
const idToken = (over: Record<string, unknown> = {}, alg = "RS256") => {
  const h = Buffer.from(JSON.stringify({ alg, kid: "k1" })).toString("base64url");
  const c = Buffer.from(JSON.stringify({ iss: "https://accounts.google.com", aud: CFG.clientId, exp: NOW + 600, sub: "1234567890", email: "someone@example.com", ...over })).toString("base64url");
  const sig = createSign("RSA-SHA256").update(`${h}.${c}`).sign(privateKey).toString("base64url");
  return `${h}.${c}.${sig}`;
};
const cookieOf = (r: { cookie?: string }) => r.cookie!.split(";")[0];

test("auth is off until both settings exist, and the secret must be long", () => {
  assert.equal(authConfig({}), null);
  assert.equal(authConfig({ GOOGLE_CLIENT_ID: "a", SESSION_SECRET: "short" }), null);
  assert.ok(CFG);
});

test("Google token: valid passes; wrong audience, expired, bad signature, wrong algorithm and unknown key fail", async () => {
  assert.deepEqual(await verifyGoogleIdToken(idToken(), CFG.clientId, NOW, keys), { ok: true, sub: "1234567890" });
  assert.equal((await verifyGoogleIdToken(idToken({ aud: "other" }), CFG.clientId, NOW, keys)).ok, false);
  assert.equal((await verifyGoogleIdToken(idToken({ exp: NOW - 1 }), CFG.clientId, NOW, keys)).ok, false);
  assert.equal((await verifyGoogleIdToken(idToken({ iss: "https://evil.example" }), CFG.clientId, NOW, keys)).ok, false);
  const t = idToken().split("."); t[1] = Buffer.from(JSON.stringify({ iss: "accounts.google.com", aud: CFG.clientId, exp: NOW + 600, sub: "someone-else" })).toString("base64url");
  assert.equal((await verifyGoogleIdToken(t.join("."), CFG.clientId, NOW, keys)).ok, false);
  assert.equal((await verifyGoogleIdToken(idToken({}, "none"), CFG.clientId, NOW, keys)).ok, false);
  assert.equal((await verifyGoogleIdToken(idToken(), CFG.clientId, NOW, async () => [])).ok, false);
  assert.equal((await verifyGoogleIdToken("garbage", CFG.clientId, NOW, keys)).ok, false);
});

test("session cookie: round trip, tampering, expiry", () => {
  const uid = "a".repeat(32), v = signSession(uid, NOW, CFG.secret);
  assert.equal(readSession(v, NOW + 10, CFG.secret), uid);
  assert.equal(readSession(v + "x", NOW, CFG.secret), null);
  assert.equal(readSession(v, NOW + 31 * 86400, CFG.secret), null);
  assert.equal(readSession(v, NOW, "y".repeat(40)), null);
  assert.equal(cookieFrom("a=1; ff_session=abc; b=2"), "abc");
});

test("handles: shape and reserved words", () => {
  assert.ok(validHandle("walker_42"));
  for (const h of ["ab", "has space", "x".repeat(21), "admin", "Fogfoot", "रवि", "a@b"]) assert.equal(validHandle(h), false, h);
});

test("login creates a user without storing the Google id, email or name; logout clears the cookie", async () => {
  const s = mem();
  const r = await account(s, CFG, { method: "POST", cookie: null, body: { action: "login", credential: idToken() } }, NOW, keys);
  assert.equal(r.status, 200);
  const stored = [...s.files.values()].join("\n");
  for (const secret of ["1234567890", "someone@example.com"]) assert.ok(!stored.includes(secret), `${secret} must not be stored`);
  assert.equal([...s.files.keys()].filter((k) => k.startsWith("users/")).length, 1);
  const out = await account(s, CFG, { method: "POST", cookie: cookieOf(r), body: { action: "logout" } }, NOW);
  assert.match(out.cookie!, /Max-Age=0/);
  assert.equal((await account(s, CFG, { method: "POST", cookie: null, body: { action: "login", credential: "bad" } }, NOW, keys)).status, 401);
});

test("same Google account gets the same hashed id; a different account gets another", async () => {
  const s = mem();
  await account(s, CFG, { method: "POST", cookie: null, body: { action: "login", credential: idToken() } }, NOW, keys);
  await account(s, CFG, { method: "POST", cookie: null, body: { action: "login", credential: idToken() } }, NOW, keys);
  assert.equal(s.files.size, 1);
  await account(s, CFG, { method: "POST", cookie: null, body: { action: "login", credential: idToken({ sub: "999" }) } }, NOW, keys);
  assert.equal(s.files.size, 2);
});

test("handle, consent, export, withdraw, delete and report, end to end", async () => {
  const s = mem();
  const login = await account(s, CFG, { method: "POST", cookie: null, body: { action: "login", credential: idToken() } }, NOW, keys);
  const call = (body: Record<string, unknown>, method = "POST") => account(s, CFG, { method, cookie: cookieOf(login), body }, NOW, keys);

  assert.equal((await call({ action: "handle", handle: "no" })).status, 400);
  assert.equal((await call({ action: "handle", handle: "Walker_1" })).status, 200);
  const other = await account(s, CFG, { method: "POST", cookie: null, body: { action: "login", credential: idToken({ sub: "2" }) } }, NOW, keys);
  assert.equal((await account(s, CFG, { method: "POST", cookie: cookieOf(other), body: { action: "handle", handle: "walker_1" } }, NOW)).status, 409);

  assert.equal((await call({ action: "consent", accept: true, version: "old" })).status, 400);
  assert.equal(((await call({ action: "consent", accept: true, version: CONSENT_VERSION })).body as { user: { consented: boolean } }).user.consented, true);

  const ex = (await call({ action: "export" })).body as { user: { handle: string } };
  assert.equal(ex.user.handle, "Walker_1");

  assert.equal(((await call({ action: "withdraw" })).body as { user: { consented: boolean } }).user.consented, false);
  assert.equal((await call({ action: "report", kind: "photo", target: "frame 12", note: "my face" })).status, 200);
  assert.ok([...s.files.keys()].some((k) => k.startsWith("reports/")));
  assert.equal((await call({ action: "report", kind: "nonsense", target: "x" })).status, 400);

  const del = await call({ action: "delete" });
  assert.equal(del.status, 200);
  assert.ok(![...s.files.keys()].some((k) => k.startsWith("users/Walker") || k === "handles/walker_1.json"));
  assert.equal((await call({ action: "export" })).status, 401);                  // the old cookie no longer maps to a user
  assert.equal((await account(s, CFG, { method: "POST", cookie: cookieOf(other), body: { action: "handle", handle: "walker_1" } }, NOW)).status, 200); // handle is free again
});

test("sharing is gated by sign-in, consent and a daily cap; off entirely when auth is not configured", async () => {
  const s = mem();
  assert.deepEqual(await allowShare(s, null, null, 10, NOW), { ok: true });
  const no = await allowShare(s, CFG, null, 10, NOW);
  assert.ok(!no.ok && no.status === 401);
  const login = await account(s, CFG, { method: "POST", cookie: null, body: { action: "login", credential: idToken() } }, NOW, keys);
  const ck = cookieOf(login);
  const noConsent = await allowShare(s, CFG, ck, 10, NOW);
  assert.ok(!noConsent.ok && noConsent.status === 403);
  await account(s, CFG, { method: "POST", cookie: ck, body: { action: "consent", accept: true, version: CONSENT_VERSION } }, NOW);
  assert.deepEqual(await allowShare(s, CFG, ck, 300, NOW), { ok: true });
  const big = await allowShare(s, CFG, ck, DAILY_DOT_CAP, NOW);
  assert.ok(!big.ok && big.status === 429);
  assert.deepEqual(await allowShare(s, CFG, ck, 300, NOW + 86400), { ok: true });   // next day resets
});

test("without configuration the account endpoint reports it and does nothing", async () => {
  const r = await account(mem(), null, { method: "GET", cookie: null, body: {} }, NOW);
  assert.deepEqual(r.body, { configured: false, user: null });
});
