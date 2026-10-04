// Quick device check: no walking, no GPS. Runs the capture pipeline N times in both modes and times it,
// so anyone with a cheap phone (or a cloud device) can contribute a useful number in ~30 s.
import { openDB } from "idb";
import type { EncodeReq, EncodeRes } from "./encode.worker";
import { qualityGate } from "./measure";

export interface BenchCfg { maxWidth: number; jpegQuality: number; minSharpness: number; minLuma: number }
export interface PathResult { iterations: number; avgMs: number; p95Ms: number; avgFrameKB: number; longTasks: number; error?: string; extra?: Record<string, number> }
export interface BenchResult {
  source: string; sourceSize: string; main: PathResult; worker: PathResult | null; workerFullGrab: PathResult | null; idb: { writes: number; totalMs: number; msPerWrite: number; error?: string };
}

const N = 20;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const p95 = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(0.95 * s.length))]; };

function syntheticFrame(): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = 1280; c.height = 720;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 1280, 720); g.addColorStop(0, "#8aa"); g.addColorStop(1, "#654");
  x.fillStyle = g; x.fillRect(0, 0, 1280, 720);
  for (let i = 0; i < 400; i++) { x.fillStyle = `hsl(${(i * 47) % 360} 40% ${30 + (i % 40)}%)`; x.fillRect((i * 97) % 1250, (i * 53) % 690, 20 + (i % 60), 10 + (i % 40)); }
  x.fillStyle = "#fff"; x.font = "64px sans-serif"; x.fillText("fogfoot synthetic frame", 60, 360);
  return c;
}

function longTaskCounter() {
  let n = 0; let po: PerformanceObserver | null = null;
  try { po = new PerformanceObserver((l) => { n += l.getEntries().length; }); po.observe({ entryTypes: ["longtask"] }); } catch { /* unsupported */ }
  return { stop: () => { po?.disconnect(); return n; } };
}

async function mainPath(src: CanvasImageSource & { width?: number; videoWidth?: number }, cfg: BenchCfg): Promise<PathResult> {
  const scratch = document.createElement("canvas"), out = document.createElement("canvas");
  const ms: number[] = [], kb: number[] = []; const lt = longTaskCounter();
  try {
    for (let i = 0; i < N; i++) {
      const t = performance.now();
      qualityGate(src, { minSharpness: cfg.minSharpness, minLuma: cfg.minLuma }, scratch);
      const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLCanvasElement).width, sh = (src as HTMLVideoElement).videoHeight || (src as HTMLCanvasElement).height;
      const w = Math.min(cfg.maxWidth, sw), h = Math.round((w * sh) / sw);
      out.width = w; out.height = h; out.getContext("2d")!.drawImage(src, 0, 0, w, h);
      const blob: Blob = await new Promise((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/jpeg", cfg.jpegQuality));
      ms.push(performance.now() - t); kb.push(blob.size / 1024);
      await sleep(200);
    }
  } catch (e) { return { iterations: ms.length, avgMs: avg(ms), p95Ms: p95(ms), avgFrameKB: avg(kb), longTasks: lt.stop(), error: String((e as Error).message) }; }
  return { iterations: N, avgMs: +avg(ms).toFixed(1), p95Ms: +p95(ms).toFixed(1), avgFrameKB: +avg(kb).toFixed(0), longTasks: lt.stop() };
}

async function workerPath(src: CanvasImageSource & { videoWidth?: number; width?: number }, cfg: BenchCfg, resizeOnGrab: boolean): Promise<PathResult | null> {
  if (typeof Worker === "undefined" || !("OffscreenCanvas" in window) || typeof createImageBitmap !== "function") return null;
  const worker = new Worker(new URL("./encode.worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, (r: EncodeRes) => void>();
  worker.onmessage = (ev: MessageEvent<EncodeRes>) => { pending.get(ev.data.id)?.(ev.data); pending.delete(ev.data.id); };
  worker.onerror = () => { pending.forEach((f, id) => f({ id, error: "worker crashed" })); pending.clear(); };
  const bmpMs: number[] = [], total: number[] = [], kb: number[] = []; const lt = longTaskCounter();
  let id = 0;
  try {
    for (let i = 0; i < N; i++) {
      const t = performance.now();
      const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLCanvasElement).width, sh = (src as HTMLVideoElement).videoHeight || (src as HTMLCanvasElement).height;
      const w = Math.min(cfg.maxWidth, sw), h = Math.round((w * sh) / sw);
      let bitmap: ImageBitmap;
      if (resizeOnGrab) {
        try { bitmap = await createImageBitmap(src as ImageBitmapSource, { resizeWidth: w, resizeHeight: h, resizeQuality: "low" }); }
        catch { bitmap = await createImageBitmap(src as ImageBitmapSource); }
      } else bitmap = await createImageBitmap(src as ImageBitmapSource); // full size; the worker downscales
      bmpMs.push(performance.now() - t);
      const r = await new Promise<EncodeRes>((resolve) => {
        const rid = ++id; pending.set(rid, resolve);
        const req: EncodeReq = { id: rid, bitmap, maxWidth: cfg.maxWidth, quality: cfg.jpegQuality, minSharpness: cfg.minSharpness, minLuma: cfg.minLuma };
        worker.postMessage(req, [bitmap]);
      });
      if (r.error) throw new Error(r.error);
      total.push(performance.now() - t); if (r.blob) kb.push(r.blob.size / 1024);
      await sleep(200);
    }
  } catch (e) { worker.terminate(); return { iterations: total.length, avgMs: avg(total), p95Ms: p95(total), avgFrameKB: avg(kb), longTasks: lt.stop(), error: String((e as Error).message) }; }
  worker.terminate();
  return { iterations: N, avgMs: +avg(total).toFixed(1), p95Ms: +p95(total).toFixed(1), avgFrameKB: +avg(kb).toFixed(0), longTasks: lt.stop(), extra: { bitmapGrabMsAvg: +avg(bmpMs).toFixed(1) } };
}

async function idbSpeed(): Promise<BenchResult["idb"]> {
  const WRITES = 30;
  try {
    const db = await openDB("fogfoot-bench", 1, { upgrade(d) { d.createObjectStore("b", { autoIncrement: true }); } });
    const blob = new Blob([new Uint8Array(92 * 1024).map((_, i) => (i * 31) & 255)], { type: "image/jpeg" });
    const t = performance.now();
    for (let i = 0; i < WRITES; i++) await db.add("b", { blob, i });
    const totalMs = performance.now() - t;
    await db.clear("b"); db.close(); indexedDB.deleteDatabase("fogfoot-bench");
    return { writes: WRITES, totalMs: +totalMs.toFixed(0), msPerWrite: +(totalMs / WRITES).toFixed(1) };
  } catch (e) { return { writes: 0, totalMs: 0, msPerWrite: 0, error: String((e as Error).message) }; }
}

/** Uses the camera if it can (real video-decode cost), else a synthetic canvas. */
export async function runBench(cfg: BenchCfg, video: HTMLVideoElement, onStep: (s: string) => void): Promise<BenchResult> {
  let stream: MediaStream | null = null; let src: CanvasImageSource & { videoWidth?: number }; let source = "synthetic canvas";
  try {
    onStep("Opening camera (point it at anything, e.g. the road or a wall)…");
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream; video.muted = true; video.playsInline = true; await video.play();
    await sleep(800); // let auto-exposure settle
    src = video; source = "camera video";
  } catch { onStep("No camera access, using a synthetic frame…"); src = syntheticFrame(); }
  const size = source === "camera video" ? `${video.videoWidth}x${video.videoHeight}` : "1280x720";
  onStep("Testing main-thread pipeline (20 frames)…");
  const main = await mainPath(src as never, cfg);
  onStep("Testing worker pipeline (20 frames)…");
  const worker = await workerPath(src as never, cfg, true);
  onStep("Testing worker pipeline, full-size grab (20 frames)…");
  const workerFullGrab = await workerPath(src as never, cfg, false);
  onStep("Testing storage write speed…");
  const idb = await idbSpeed();
  stream?.getTracks().forEach((t) => t.stop());
  return { source, sourceSize: size, main, worker, workerFullGrab, idb };
}
