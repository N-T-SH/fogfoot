// Google sign-in and our own session, with no third-party packages.
//
// - The phone gets a Google ID token (Google Identity Services). We verify its RS256 signature against Google's
//   published keys, plus issuer, audience and expiry. Only then do we trust the Google subject id.
// - We never store the Google subject, the e-mail or the name. A user is identified by HMAC(secret, subject):
//   a hashed id that cannot be reversed without the secret. The user picks a handle; that is all we keep.
// - Our session is a signed cookie (HttpOnly, Secure, SameSite=Lax) with the hashed id and an expiry. It is stateless.
//
// Everything here is pure or takes its dependencies as arguments, so it is tested without Vercel or Google.
import { createHmac, createPublicKey, timingSafeEqual, verify as rsaVerify } from "node:crypto";
import type { Store } from "./coverage.js";
import { dayStart } from "./coverage.js";

export const SESSION_DAYS = 30;
export const CONSENT_VERSION = "2026-10-06";
export const DAILY_DOT_CAP = 3000;      // per person per India day; a long walk is a few hundred
export const COOKIE = "ff_session";
const GOOGLE_ISS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export interface AuthEnv { GOOGLE_CLIENT_ID?: string; SESSION_SECRET?: string }
export interface AuthConfig { clientId: string; secret: string }
/** Sign-in is only enforced when both settings exist; until then the prototype stays open. */
export function authConfig(env: AuthEnv): AuthConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim(), secret = env.SESSION_SECRET?.trim();
  return clientId && secret && secret.length >= 32 ? { clientId, secret } : null;
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const mac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest();

export const hashedId = (secret: string, googleSub: string) => createHmac("sha256", secret).update(`sub:${googleSub}`).digest("hex").slice(0, 32);

// ---- Google ID token ------------------------------------------------------------------------------------------
export interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
export type KeyFetcher = () => Promise<Jwk[]>;

let keyCache: { keys: Jwk[]; until: number } | null = null;
export const fetchGoogleKeys: KeyFetcher = async () => {
  if (keyCache && keyCache.until > Date.now()) return keyCache.keys;
  const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!r.ok) throw new Error(`google keys ${r.status}`);
  const keys = ((await r.json()) as { keys: Jwk[] }).keys;
  keyCache = { keys, until: Date.now() + 3600_000 };
  return keys;
};

export async function verifyGoogleIdToken(token: string, clientId: string, nowS: number, keys: KeyFetcher = fetchGoogleKeys): Promise<{ ok: true; sub: string } | { ok: false; error: string }> {
  const parts = token.split(".");
  if (parts.length !== 3 || token.length > 4000) return { ok: false, error: "malformed token" };
  let header: { alg?: string; kid?: string }, claims: { iss?: string; aud?: string; exp?: number; iat?: number; sub?: string };
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  } catch { return { ok: false, error: "malformed token" }; }
  if (header.alg !== "RS256" || !header.kid) return { ok: false, error: "unsupported algorithm" };
  const jwk = (await keys()).find((k) => k.kid === header.kid && k.kty === "RSA");
  if (!jwk) return { ok: false, error: "unknown signing key" };
  const good = rsaVerify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: { kty: "RSA", n: jwk.n, e: jwk.e }, format: "jwk" }), Buffer.from(parts[2], "base64url"));
  if (!good) return { ok: false, error: "bad signature" };
  if (!claims.iss || !GOOGLE_ISS.has(claims.iss)) return { ok: false, error: "wrong issuer" };
  if (claims.aud !== clientId) return { ok: false, error: "wrong audience" };
  if (typeof claims.exp !== "number" || claims.exp <= nowS) return { ok: false, error: "token expired" };
  if (typeof claims.sub !== "string" || !claims.sub) return { ok: false, error: "no subject" };
  return { ok: true, sub: claims.sub };
}

// ---- our session cookie ----------------------------------------------------------------------------------------
export function signSession(uid: string, nowS: number, secret: string): string {
  const body = b64u(JSON.stringify({ u: uid, x: nowS + SESSION_DAYS * 86400 }));
  return `${body}.${b64u(mac(secret, body))}`;
}
export function readSession(value: string | undefined, nowS: number, secret: string): string | null {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  const want = mac(secret, body), got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as { u?: string; x?: number };
    return typeof p.u === "string" && /^[0-9a-f]{32}$/.test(p.u) && typeof p.x === "number" && p.x > nowS ? p.u : null;
  } catch { return null; }
}
export const cookieFrom = (header: string | null, name = COOKIE): string | undefined =>
  header?.split(";").map((s) => s.trim()).find((s) => s.startsWith(`${name}=`))?.slice(name.length + 1);
export const setCookie = (value: string) => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// ---- handles ----------------------------------------------------------------------------------------------------
const RESERVED = new Set(["admin", "fogfoot", "moderator", "support", "official", "anonymous", "null", "undefined"]);
export function validHandle(h: unknown): h is string {
  return typeof h === "string" && /^[A-Za-z0-9_]{3,20}$/.test(h) && !RESERVED.has(h.toLowerCase());
}

// ---- user records -----------------------------------------------------------------------------------------------
export interface User {
  handle: string | null;
  created: number;                                     // start of the India day, not an exact time
  consent: { version: string; day: number } | null;    // what was agreed to and on which day
  usage: { day: number; dots: number };                // dots shared today, for the daily cap
}
const userPath = (uid: string) => `users/${uid}.json`;

export async function getUser(store: Store, uid: string): Promise<User | null> {
  const t = await store.read(userPath(uid));
  if (!t) return null;
  try { return JSON.parse(t) as User; } catch { return null; }
}
export const putUser = (store: Store, uid: string, u: User) => store.put(userPath(uid), JSON.stringify(u));
export const newUser = (nowS: number): User => ({ handle: null, created: dayStart(nowS), consent: null, usage: { day: dayStart(nowS), dots: 0 } });
export const deleteUser = (store: Store, uid: string) => store.del([userPath(uid)]);
export const hasConsented = (u: User) => u.consent?.version === CONSENT_VERSION;

/** Adds `n` dots to today's tally; returns false (and changes nothing) if it would pass the daily cap. */
export function spend(u: User, n: number, nowS: number): boolean {
  const day = dayStart(nowS);
  if (u.usage.day !== day) u.usage = { day, dots: 0 };
  if (u.usage.dots + n > DAILY_DOT_CAP) return false;
  u.usage.dots += n;
  return true;
}

/** The shape returned to the app. */
export const publicUser = (u: User) => ({ handle: u.handle, consented: hasConsented(u), consentVersion: CONSENT_VERSION });
