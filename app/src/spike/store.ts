import { openDB } from "idb";

const db = openDB("fogfoot-spike", 1, {
  upgrade(d) { d.createObjectStore("frames", { keyPath: "id", autoIncrement: true }); }
});

export interface StoredFrame { id?: number; at: number; lat: number; lon: number; acc: number; heading: number | null; blob: Blob }

export async function putFrame(f: StoredFrame) { return (await db).add("frames", f); }
export async function frameCount() { return (await db).count("frames"); }
export async function clearFrames() { return (await db).clear("frames"); }
export async function totalBytes() {
  let n = 0;
  const d = await db;
  let c = await d.transaction("frames").store.openCursor();
  while (c) { n += (c.value as StoredFrame).blob.size; c = await c.continue(); }
  return n;
}
