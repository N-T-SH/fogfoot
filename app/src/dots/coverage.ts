// Shared dot coverage, client side. A dot is "covered" if anyone walked it in the last WINDOW_DAYS.
// Your own walks are saved on the device immediately; shared ones sync with /api/coverage when online.
export const WINDOW_DAYS = 30;
export const REFRESH_AFTER_H = 12; // re-walking a dot covered less than this long ago does nothing (stops pacing to farm)
const DAY = 86400000;

export type DotState = "none" | "mine" | "others";
export type SyncState = "off" | "pending" | "ok" | "error";

interface Saved { mine: Record<string, number>; shared: Record<string, number>; outbox: Record<string, number>; offsetDays: number }

export class Coverage {
  mine = new Map<string, number>();     // dot key -> ms, walked on this device
  shared = new Map<string, number>();   // dot key -> ms, as last reported by the server (includes other people)
  outbox = new Map<string, number>();   // not yet uploaded
  offsetDays = 0;                       // demo only: shifts the clock so regrowth can be shown
  sync: { state: SyncState; detail: string; at: number } = { state: "off", detail: "", at: 0 };
  private dirty = false;
  private timers: number[] = [];

  /** `serverArea` is what the API calls the shared map (e.g. "domlur" or "domlur-test"). */
  constructor(readonly serverArea: string) {
    try {
      const s = JSON.parse(localStorage.getItem(this.storeKey) || "null") as Saved | null;
      if (s) {
        this.mine = new Map(Object.entries(s.mine)); this.shared = new Map(Object.entries(s.shared));
        this.outbox = new Map(Object.entries(s.outbox)); this.offsetDays = s.offsetDays || 0;
      }
    } catch { /* storage unavailable: run in memory */ }
  }

  private get storeKey() { return `fogfoot-cov-v2:${this.serverArea}`; }
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
    if (covered && this.now() - t! < REFRESH_AFTER_H * 3600000) return "skip";
    const now = this.now();
    this.mine.set(key, now);
    if (share) this.outbox.set(key, Math.min(now, Date.now())); // never send a demo-clock timestamp to the server
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
      this.sync = { ...this.sync, state: this.sync.state === "ok" ? "ok" : "pending" };
      const r = await fetch(`/api/coverage?area=${encodeURIComponent(this.serverArea)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`server said ${r.status}`);
      const j = (await r.json()) as { e: [string, number][] };
      for (const [k, s] of j.e) { const ms = s * 1000; if (ms > (this.shared.get(k) ?? 0)) this.shared.set(k, ms); }
      this.dirty = true; this.save();
      this.sync = { state: "ok", detail: "", at: Date.now() };
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
        body: JSON.stringify({ area: this.serverArea, e: batch.map(([k, ms]) => [k, Math.floor(ms / 1000)]) }),
      });
      if (!r.ok) throw new Error(`server said ${r.status}`);
      for (const [k, ms] of batch) { if (this.outbox.get(k) === ms) this.outbox.delete(k); if (ms > (this.shared.get(k) ?? 0)) this.shared.set(k, ms); }
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
