// Which dots are eaten, and when. Dots regrow after DECAY_DAYS (the old "fog" freshness rule).
const KEY = "fogfoot-dots-v1";
export const DECAY_DAYS = 60;
const DAY = 86400000;

interface Saved { eaten: Record<string, number>; offsetDays: number }

export class Progress {
  eaten = new Map<string, number>();
  offsetDays = 0; // demo only: lets us fast-forward time to show regrowth
  constructor() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null") as Saved | null;
      if (s) { this.eaten = new Map(Object.entries(s.eaten)); this.offsetDays = s.offsetDays || 0; }
    } catch { /* storage unavailable: run in memory */ }
  }
  now() { return Date.now() + this.offsetDays * DAY; }
  isEaten(key: string) {
    const t = this.eaten.get(key);
    return t !== undefined && this.now() - t < DECAY_DAYS * DAY;
  }
  /** 0 (just eaten) .. 1 (about to regrow); -1 if not eaten. */
  staleness(key: string) {
    const t = this.eaten.get(key);
    if (t === undefined) return -1;
    return Math.min(1, (this.now() - t) / (DECAY_DAYS * DAY));
  }
  eat(key: string) { this.eaten.set(key, this.now()); }
  advance(days: number) { this.offsetDays += days; this.save(); }
  reset() { this.eaten.clear(); this.offsetDays = 0; this.save(); }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ eaten: Object.fromEntries(this.eaten), offsetDays: this.offsetDays })); } catch { /* ignore */ }
  }
}
