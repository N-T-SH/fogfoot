// Shared dot coverage, client side. A dot is "covered" if anyone walked it in the last WINDOW_DAYS.
// Your own walks are saved on the device immediately; shared ones sync with /api/coverage when online.
export const WINDOW_DAYS = 30;
const DAY = 86400000;
const IST_MS = 19800000; // India time, UTC+5:30

/** Start of the India-time day containing `ms`. Only the day, never the time of day, is shared with the server. */
export const dayStartMs = (ms: number): number => Math.floor((ms + IST_MS) / DAY) * DAY - IST_MS;
const sameDay = (a: number, b: number) => dayStartMs(a) === dayStartMs(b);

export type DotState = "none" | "mine" | "others";
export type SyncState = "off" | "pending" | "ok" | "error" | "signin";

interface Saved { mine: Record<string, number>; shared: Record<string, number>; outbox: Record<string, number>; offsetDays: number }

export class Coverage {
  mine = new Map<string, number>();     // dot key -> ms, walked on this device
  shared = new Map<string, number>();   // dot key -> ms, as last reported by the server (includes other people)
  outbox = new Map<string, number>();   // not yet uploaded
  offsetDays = 0;                       // demo only: shifts the clock so regrowth can be shown
  sync: { state: SyncState; detail: string; at: number } = { state: "off", detail: "", at: 0 };
  private dirty = false;
  private timers: number[] = [];

  readonly serverArea: string;

  /** `serverArea` is what the API calls the shared map (e.g. "domlur" or "domlur-test"). */
  constructor(serverArea: string) {
    this.serverArea = serverArea;
    try {
      const s = JSON.parse(localStorage.getItem(this.storeKey) || "null") as Saved | null;
      if (s) {
        this.mine = new Map(Object.entries(s.mine)); this.shared = new Map(Object.entries(s.shared));
        this.outbox = new Map(Object.entries(s.outbox).map(([k, ms]) => [k, dayStartMs(ms)] as [string, number])); this.offsetDays = s.offsetDays || 0;
      }
    } catch { /* storage unavailable: run in memory */ }
  }

  private get storeKey() { return `fogfoot-cov-v3:${this.serverArea}`; }
  now() { return Date.now() + this.offsetDays * DAY; }
  ts(key: string): number | undefined {
    const t = Math.max(this.mine.get(key) ?? 0, this.shared.get(key) ?? 0);
    return t || undefined;
  }
  ageDays(key: string): number | undefined {
    const t = this.ts(key);
    return t === undefined ? undefined : (this.now() - t) / DAY;
  }
  state(key: string): DotState {
    const a = this.ageDays(key);
    if (a === undefined || a >= WINDOW_DAYS) return "none";
    return (this.mine.get(key) ?? 0) >= (this.shared.get(key) ?? 0) ? "mine" : "others";
  }

  /** Did this device pick this one up within the window? (Counts even if someone else has walked it since.) */
  mineFresh(key: string): boolean {
    const t = this.mine.get(key);
    return t !== undefined && this.now() - t < WINDOW_DAYS * DAY;
  }

  /** Walk over a dot. Returns what happened so the HUD can count it. */
  eat(key: string, share: boolean): "new" | "refresh" | "skip" {
    const t = this.ts(key), covered = t !== undefined && this.now() - t < WINDOW_DAYS * DAY;
    if (covered && sameDay(t!, this.now())) return "skip";   // already covered today (by anyone): walking it again does nothing
    const now = this.now();
    this.mine.set(key, now);
    if (share) this.outbox.set(key, dayStartMs(Math.min(now, Date.now()))); // the day only; never a demo-clock time or a time of day
    this.dirty = true;
    return covered ? "refresh" : "new";
  }

  advance(days: number) { this.offsetDays += days; this.dirty = true; this.save(); }
  /** Forget what this device walked. Other people's coverage (and anything already uploaded) stays. */
  forgetMine() { this.mine.clear(); this.outbox.clear(); this.dirty = true; this.save(); }

  save() {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      localStorage.setItem(this.storeKey, JSON.stringify({
        mine: Object.fromEntries(this.mine), shared: Object.fromEntries(this.shared), outbox: Object.fromEntries(this.outbox), offsetDays: this.offsetDays,
      } satisfies Saved));
    } catch { /* ignore */ }
  }

  async pull(): Promise<boolean> {
    try {
      if (this.sync.state !== "signin") this.sync = { ...this.sync, state: this.sync.state === "ok" ? "ok" : "pending" };
      const r = await fetch(`/api/coverage?area=${encodeURIComponent(this.serverArea)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`server said ${r.status}`);
      const j = (await r.json()) as { e: [string, number][] };
      for (const [k, s] of j.e) { const ms = s * 1000; if (ms > (this.shared.get(k) ?? 0)) this.shared.set(k, ms); }
      this.dirty = true; this.save();
      this.sync = this.sync.state === "signin" && this.outbox.size ? this.sync : { state: "ok", detail: "", at: Date.now() };   // keep asking for sign-in while walks are waiting
      return true;
    } catch (e) {
      this.sync = { state: "error", detail: (e as Error).message, at: Date.now() };
      return false;
    }
  }

  async push(): Promise<void> {
    if (!this.outbox.size) return;
    const batch = [...this.outbox.entries()].slice(0, 300);
    try {
      const r = await fetch("/api/coverage", {
        method: "POST", headers: { "content-type": "application/json" }, keepalive: true,
        body: JSON.stringify({ area: this.serverArea, e: batch.map(([k, ms]) => [k, Math.floor(dayStartMs(ms) / 1000)]) }),
      });
      if (r.status === 401 || r.status === 403) { this.sync = { state: "signin", detail: String(r.status), at: Date.now() }; return; }   // kept in the outbox until you sign in
      if (!r.ok) throw new Error(`server said ${r.status}`);
      for (const [k, ms] of batch) { if (this.outbox.get(k) === ms) this.outbox.delete(k); if (ms > (this.shared.get(k) ?? 0)) this.shared.set(k, ms); }  // already day-rounded
      this.dirty = true; this.save();
      this.sync = { state: "ok", detail: "", at: Date.now() };
    } catch (e) {
      this.sync = { state: "error", detail: (e as Error).message, at: Date.now() };
    }
  }

  /** Background sync while the page is open. `onChange` runs after each pull so the map can redraw. */
  start(onChange: () => void) {
    const pull = () => { void this.pull().then(onChange); };
    pull();
    this.timers.push(window.setInterval(() => { void this.push(); this.save(); }, 5000));
    this.timers.push(window.setInterval(() => { if (document.visibilityState === "visible") pull(); }, 45000));
    const vis = () => { if (document.visibilityState === "visible") pull(); else { void this.push(); this.save(); } };
    document.addEventListener("visibilitychange", vis);
    this.timers.push(-1); this.onStop = () => document.removeEventListener("visibilitychange", vis);
  }
  private onStop: (() => void) | null = null;
  stop() { this.timers.forEach((t) => t > 0 && clearInterval(t)); this.timers = []; this.onStop?.(); void this.push(); this.save(); }
}
