// Account actions as a pure function over (store, config, request), so they are tested without HTTP.
import { randomBytes } from "node:crypto";
import {
  CONSENT_VERSION, cookieFrom, clearCookie, deleteUser, getUser, hashedId, newUser, putUser, publicUser, readSession, setCookie, signSession,
  spend, hasConsented, validHandle, verifyGoogleIdToken, type AuthConfig, type KeyFetcher, type User,
} from "./auth.js";
import { dayStart, type Store } from "./coverage.js";

export interface Req { method: string; cookie: string | null; body: Record<string, unknown> }
export interface Res { status: number; body: unknown; cookie?: string }
const err = (status: number, error: string): Res => ({ status, body: { error } });

const handlePath = (h: string) => `handles/${h.toLowerCase()}.json`;
const REPORT_KINDS = new Set(["photo", "item", "street", "privacy", "other"]);

export async function account(store: Store, cfg: AuthConfig | null, req: Req, nowS: number, keys?: KeyFetcher): Promise<Res> {
  if (!cfg) return { status: 200, body: { configured: false, user: null } };

  const uid = readSession(cookieFrom(req.cookie), nowS, cfg.secret);
  const user = uid ? await getUser(store, uid) : null;

  if (req.method === "GET") return { status: 200, body: { configured: true, clientId: cfg.clientId, user: user ? publicUser(user) : null, consentVersion: CONSENT_VERSION } };

  const action = String(req.body.action ?? "");

  if (action === "login") {
    const credential = req.body.credential;
    if (typeof credential !== "string") return err(400, "credential required");
    const v = await verifyGoogleIdToken(credential, cfg.clientId, nowS, keys);
    if (!v.ok) return err(401, v.error);
    const id = hashedId(cfg.secret, v.sub);
    let u = await getUser(store, id);
    if (!u) { u = newUser(nowS); await putUser(store, id, u); }
    return { status: 200, body: { user: publicUser(u) }, cookie: setCookie(signSession(id, nowS, cfg.secret)) };
  }

  if (action === "logout") return { status: 200, body: { ok: true }, cookie: clearCookie() };

  if (!uid || !user) return err(401, "sign in first");

  if (action === "handle") {
    const h = req.body.handle;
    if (!validHandle(h)) return err(400, "handle must be 3 to 20 letters, digits or _ (and not a reserved word)");
    const owner = await store.read(handlePath(h));
    if (owner && owner !== uid) return err(409, "that handle is taken");
    await store.put(handlePath(h), uid);
    if (user.handle && user.handle.toLowerCase() !== h.toLowerCase()) await store.del([handlePath(user.handle)]);
    user.handle = h;
    await putUser(store, uid, user);
    return { status: 200, body: { user: publicUser(user) } };
  }

  if (action === "consent") {
    if (req.body.accept !== true || req.body.version !== CONSENT_VERSION) return err(400, "consent must name the current version");
    user.consent = { version: CONSENT_VERSION, day: dayStart(nowS) };
    await putUser(store, uid, user);
    return { status: 200, body: { user: publicUser(user) } };
  }

  if (action === "withdraw") {                      // withdrawing is as easy as giving: one call, no reason asked
    user.consent = null;
    await putUser(store, uid, user);
    return { status: 200, body: { user: publicUser(user) } };
  }

  if (action === "export") {                        // everything we hold about this person
    return { status: 200, body: { note: "Coverage you shared is stored without any link to you, so it is not listed here.", user: exportUser(user) } };
  }

  if (action === "delete") {
    if (user.handle) await store.del([handlePath(user.handle)]);
    await deleteUser(store, uid);
    return { status: 200, body: { ok: true, note: "Your account and handle are deleted. Coverage you shared was never linked to you and stays as anonymous map data." }, cookie: clearCookie() };
  }

  if (action === "report") {                        // takedown or problem report; stored privately for the maintainer
    const kind = String(req.body.kind ?? "other"), target = String(req.body.target ?? "").slice(0, 200), note = String(req.body.note ?? "").slice(0, 1000);
    if (!REPORT_KINDS.has(kind)) return err(400, "unknown report kind");
    if (!target && !note) return err(400, "say what this is about");
    await store.put(`reports/${nowS}-${randomBytes(4).toString("hex")}.json`, JSON.stringify({ kind, target, note, by: uid, day: dayStart(nowS) }));
    return { status: 200, body: { ok: true } };
  }

  return err(400, "unknown action");
}

const exportUser = (u: User) => ({ handle: u.handle, accountCreatedDay: u.created, consent: u.consent, sharedToday: u.usage });

/** Checks a signed-in, consented person may share `n` more dots today. Used by POST /api/coverage when sign-in is on. */
export async function allowShare(store: Store, cfg: AuthConfig | null, cookie: string | null, n: number, nowS: number): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!cfg) return { ok: true };
  const uid = readSession(cookieFrom(cookie), nowS, cfg.secret);
  const user = uid ? await getUser(store, uid) : null;
  if (!uid || !user) return { ok: false, status: 401, error: "sign in to share coverage" };
  if (!hasConsented(user)) return { ok: false, status: 403, error: "accept the notice to share coverage" };
  if (!spend(user, n, nowS)) return { ok: false, status: 429, error: "daily sharing limit reached, try again tomorrow" };
  await putUser(store, uid, user);
  return { ok: true };
}
