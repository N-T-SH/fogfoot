import { cfgFromUrl, qualityGate } from "../spike/measure";
import type { EncodeReq, EncodeRes } from "./encode.worker";
import { addFrame, clearFrames, frameStats } from "./queue";
import { courseDeg, isFull, shouldSample, storageBudget, type Fix } from "./rules";

/** Same defaults as Spike A / config/settings.yaml `capture:`; override from the URL, e.g. #/?q=0.5&w=800 */
export const CAPTURE = cfgFromUrl(
  { sampleEveryM: 10, jpegQuality: 0.6, maxWidth: 1280, minSharpness: 40, minLuma: 45, maxGpsAccM: 35, capMB: 150 },
  { every: "sampleEveryM", q: "jpegQuality", w: "maxWidth", sharp: "minSharpness", luma: "minLuma", acc: "maxGpsAccM", cap: "capMB" },
);

export interface SaverState { on: boolean; count: number; bytes: number; blurry: number; dark: number; full: boolean; capBytes: number; error: string }

/** Takes a photo from the live camera every ~10 m of real walking, drops blurry/dark ones, and keeps the rest on the phone. */
export class FrameSaver {
  state: SaverState = { on: true, count: 0, bytes: 0, blurry: 0, dark: 0, full: false, capBytes: CAPTURE.capMB * 1e6, error: "" };
  private last: Fix | null = null;
  private busy = false;
  private worker: Worker | null = null;
  private pending = new Map<number, (r: EncodeRes) => void>();
  private nextId = 0;
  private useWorker: boolean;
  private scratch = document.createElement("canvas");
  private out = document.createElement("canvas");

  constructor(private getVideo: () => HTMLVideoElement | null, private onChange: () => void) {
    this.useWorker = new URLSearchParams(location.hash.split("?")[1] ?? "").get("worker") !== "0" &&
      typeof Worker !== "undefined" && "OffscreenCanvas" in window && typeof createImageBitmap === "function";
  }

  async init() {
    const s = await frameStats();
    this.state.count = s.count; this.state.bytes = s.bytes;
    await this.refreshBudget();
    this.onChange();
  }

  private async refreshBudget() {
    const est = await navigator.storage?.estimate?.();
    this.state.capBytes = storageBudget(CAPTURE.capMB * 1e6, est?.quota, est?.usage);
    this.state.full = isFull(this.state.bytes, 0, this.state.capBytes);
  }

  setOn(on: boolean) { this.state.on = on; this.onChange(); }
  /** Forget the last saved position (call when a walk starts, so the first frame is not skipped for being "too close"). */
  reset() { this.last = null; }

  async clear() { await clearFrames(); this.state = { ...this.state, count: 0, bytes: 0, blurry: 0, dark: 0, full: false, error: "" }; this.last = null; await this.refreshBudget(); this.onChange(); }

  private encodeInWorker(video: HTMLVideoElement): Promise<EncodeRes> {
    if (!this.worker) {
      this.worker = new Worker(new URL("./encode.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (ev: MessageEvent<EncodeRes>) => { this.pending.get(ev.data.id)?.(ev.data); this.pending.delete(ev.data.id); };
      this.worker.onerror = () => { this.pending.forEach((f, id) => f({ id, error: "worker crashed" })); this.pending.clear(); };
    }
    return (async () => {
      const w = Math.min(CAPTURE.maxWidth, video.videoWidth), h = Math.round((w * video.videoHeight) / video.videoWidth);
      let bitmap: ImageBitmap;
      try { bitmap = await createImageBitmap(video, { resizeWidth: w, resizeHeight: h, resizeQuality: "low" }); }
      catch { bitmap = await createImageBitmap(video); }
      return new Promise<EncodeRes>((resolve) => {
        const id = ++this.nextId; this.pending.set(id, resolve);
        const req: EncodeReq = { id, bitmap, maxWidth: CAPTURE.maxWidth, quality: CAPTURE.jpegQuality, minSharpness: CAPTURE.minSharpness, minLuma: CAPTURE.minLuma };
        this.worker!.postMessage(req, [bitmap]);
      });
    })();
  }

  /** Fallback for browsers without OffscreenCanvas workers (iOS before 16.4). Runs on the main thread. */
  private async encodeOnMainThread(video: HTMLVideoElement): Promise<EncodeRes> {
    const gate = qualityGate(video, { minSharpness: CAPTURE.minSharpness, minLuma: CAPTURE.minLuma }, this.scratch);
    if (!gate.ok) return { id: 0, gate };
    const w = Math.min(CAPTURE.maxWidth, video.videoWidth), h = Math.round((w * video.videoHeight) / video.videoWidth);
    this.out.width = w; this.out.height = h; this.out.getContext("2d")!.drawImage(video, 0, 0, w, h);
    const blob = await new Promise<Blob>((res, rej) => this.out.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", CAPTURE.jpegQuality));
    return { id: 0, gate, blob };
  }

  /** Call with every GPS fix while walking for real. `keys` are the street stretches (dot ids) within a few metres of the fix. */
  async consider(fix: Fix, keys: string[]) {
    const video = this.getVideo();
    if (!this.state.on || this.busy || !video || video.videoWidth === 0 || video.paused) return;
    if (shouldSample(this.last, fix, CAPTURE) !== "ok") return;
    if (this.state.full) return;
    this.busy = true;
    try {
      let res = this.useWorker ? await this.encodeInWorker(video) : await this.encodeOnMainThread(video);
      if (res.error) { this.useWorker = false; res = await this.encodeOnMainThread(video); }   // worker unusable here: carry on without it
      if (!res.gate) return;
      if (!res.gate.ok) { if (res.gate.reason === "dark") this.state.dark++; else this.state.blurry++; this.onChange(); return; }
      const blob = res.blob!;
      if (isFull(this.state.bytes, blob.size, this.state.capBytes)) { this.state.full = true; this.onChange(); return; }
      await addFrame({ at: Date.now(), lat: fix.lat, lon: fix.lon, acc: fix.acc, course: this.last ? courseDeg(this.last, fix) : null, keys, blob });
      this.state.count++; this.state.bytes += blob.size; this.state.error = "";
      this.last = { lat: fix.lat, lon: fix.lon, acc: fix.acc };
      this.onChange();
    } catch (e) {
      this.state.error = (e as Error).name === "QuotaExceededError" ? "Phone storage is full" : `Could not save a frame (${(e as Error).message})`;
      this.state.full = (e as Error).name === "QuotaExceededError";
      this.onChange();
    } finally { this.busy = false; }
  }

  dispose() { this.worker?.terminate(); this.worker = null; }
}
