// Pure rules for saving camera frames while walking. No browser APIs here, so they can be unit tested.
import { haversineM } from "../spike/measure.ts";

export interface SampleCfg { sampleEveryM: number; maxGpsAccM: number }
export interface Fix { lat: number; lon: number; acc: number }

export type SampleDecision = "ok" | "poor_gps" | "too_close";

/** Save a frame only with a trustworthy GPS fix and after moving far enough from the last saved frame. */
export function shouldSample(last: { lat: number; lon: number } | null, cur: Fix, cfg: SampleCfg): SampleDecision {
  if (cur.acc > cfg.maxGpsAccM) return "poor_gps";
  if (last && haversineM(last, cur) < cfg.sampleEveryM) return "too_close";
  return "ok";
}

/** Storage budget: our own cap, and never more than a share of what the browser says is free. */
export function storageBudget(capBytes: number, quota: number | undefined, usage: number | undefined, share = 0.4): number {
  if (!quota) return capBytes;
  const free = Math.max(0, quota - (usage ?? 0));
  return Math.min(capBytes, Math.floor(free * share));
}

export function isFull(savedBytes: number, nextBytes: number, budgetBytes: number): boolean {
  return savedBytes + nextBytes > budgetBytes;
}

/** Heading of travel (degrees clockwise from north) between two fixes, or null if they are too close to say. */
export function courseDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }, minM = 3): number | null {
  if (haversineM(a, b) < minM) return null;
  const rad = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}
