// Frames saved on this phone. Nothing here is uploaded (Step 1): it exists so battery, heat, storage and photo
// quality can be judged on real walks before any upload, consent or sign-in work.
import { openDB } from "idb";

export interface SavedFrame {
  id?: number;
  at: number;                 // exact time, kept on the device only
  lat: number; lon: number; acc: number;
  course: number | null;      // direction of travel between fixes
  keys: string[];             // street-stretch ids within 8 m of the fix, so a frame can later be tied to its street units
  blob: Blob;
}

const db = openDB("fogfoot-frames", 1, {
  upgrade(d) { d.createObjectStore("frames", { keyPath: "id", autoIncrement: true }); },
});

export async function addFrame(f: SavedFrame): Promise<number> { return (await (await db).add("frames", f)) as number; }

export async function frameStats(): Promise<{ count: number; bytes: number }> {
  const d = await db;
  let bytes = 0, count = 0;
  let c = await d.transaction("frames").store.openCursor();
  while (c) { bytes += (c.value as SavedFrame).blob.size; count++; c = await c.continue(); }
  return { count, bytes };
}

/** Newest first. */
export async function recentFrames(n: number): Promise<SavedFrame[]> {
  const d = await db;
  const out: SavedFrame[] = [];
  let c = await d.transaction("frames").store.openCursor(null, "prev");
  while (c && out.length < n) { out.push(c.value as SavedFrame); c = await c.continue(); }
  return out;
}

export async function clearFrames(): Promise<void> { await (await db).clear("frames"); }
