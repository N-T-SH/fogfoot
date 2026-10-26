// What colour a 10 m stretch of footpath is drawn in.
//   green   assessed, few or no obstructions: clean and walkable
//   orange  assessed, several obstructions
//   red     assessed, severely deteriorated
//   grey    in an open area but not mapped yet (nobody has walked it, or nothing is known about it)
//   black   locked: not open yet / outside the covered areas
//   pending walked by someone but not assessed yet; drawn grey with a white edge so progress is still visible
// "Obstructions" is the number of problems the camera detected on the stretch. Detection is not switched on yet,
// so real walks produce "pending" until assessments arrive from the nightly batch (conditions-<area>.json).
export type Cond = "green" | "orange" | "red" | "grey" | "black" | "pending";

/** Obstruction counts at which a stretch turns orange and red. One tweak point for the whole app. */
export const COND_AT = { orange: 2, red: 4 };

export const COND_COLOR: Record<Cond, string> = {
  green: "#1f9d4d", orange: "#f08a24", red: "#d32f2f", grey: "#9aa3ad", black: "#15171b", pending: "#9aa3ad",
};

export function fromIssues(issues: number): "green" | "orange" | "red" {
  return issues >= COND_AT.red ? "red" : issues >= COND_AT.orange ? "orange" : "green";
}

export function stretchCond(s: { locked: boolean; walked: boolean; issues?: number }): Cond {
  if (s.locked) return "black";
  if (s.issues !== undefined) return fromIssues(s.issues);
  return s.walked ? "pending" : "grey";
}

/** Made-up obstruction counts for the visual demo (`?demo=conditions`). Stable per stretch, NOT real detections. */
export function demoIssues(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  const r = (h >>> 0) % 100;
  return r < 55 ? 0 : r < 70 ? 1 : r < 82 ? 2 : r < 90 ? 3 : r < 97 ? 4 : 6;
}
