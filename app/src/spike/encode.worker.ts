// Runs the on-device quality gate and JPEG encode off the main thread.
import { gateFromPixels } from "./measure";

export interface EncodeReq { id: number; bitmap: ImageBitmap; maxWidth: number; quality: number; minSharpness: number; minLuma: number }
export interface EncodeRes {
  id: number; error?: string;
  gate?: { sharpness: number; luma: number; ok: boolean; reason?: "blurry" | "dark" };
  gateMs?: number; encodeMs?: number; blob?: Blob;
}

const ctx = self as unknown as { onmessage: ((e: MessageEvent<EncodeReq>) => void) | null; postMessage(m: EncodeRes): void };

ctx.onmessage = async (e) => {
  const { id, bitmap, maxWidth, quality, minSharpness, minLuma } = e.data;
  try {
    const t0 = performance.now();
    const W = 160, H = 90;
    const small = new OffscreenCanvas(W, H);
    const sctx = small.getContext("2d", { willReadFrequently: true })!;
    sctx.drawImage(bitmap, 0, 0, W, H);
    const gate = gateFromPixels(sctx.getImageData(0, 0, W, H).data, W, H, { minSharpness, minLuma });
    const gateMs = performance.now() - t0;
    if (!gate.ok) { ctx.postMessage({ id, gate, gateMs }); return; }
    const t1 = performance.now();
    const w = Math.min(maxWidth, bitmap.width), h = Math.round((w * bitmap.height) / bitmap.width);
    const out = new OffscreenCanvas(w, h);
    out.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    const blob = await out.convertToBlob({ type: "image/jpeg", quality });
    ctx.postMessage({ id, gate, gateMs, encodeMs: performance.now() - t1, blob });
  } catch (err) {
    ctx.postMessage({ id, error: String((err as Error)?.message ?? err) });
  } finally {
    bitmap.close();
  }
};
