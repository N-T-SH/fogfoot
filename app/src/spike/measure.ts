// Pure helpers for Spike A: distance, on-device quality gate, environment report.

export function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) -
    Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

export interface GateResult { sharpness: number; luma: number; ok: boolean; reason?: "blurry" | "dark"; drawMs: number; readMs: number; computeMs: number }
export interface GateCfg { minSharpness: number; minLuma: number }

/** Laplacian variance + mean luma on a grayscale copy, from raw RGBA pixels. No ML. Usable on or off the main thread. */
export function gateFromPixels(px: Uint8ClampedArray, W: number, H: number, cfg: GateCfg): Pick<GateResult, "sharpness" | "luma" | "ok" | "reason"> {
  const g = new Float32Array(W * H);
  let sum = 0;
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    g[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    sum += g[j];
  }
  const luma = sum / g.length;
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - W] - g[i + W];
    s += l; s2 += l * l; n++;
  }
  const sharpness = s2 / n - (s / n) ** 2;
  if (luma < cfg.minLuma) return { sharpness, luma, ok: false, reason: "dark" };
  if (sharpness < cfg.minSharpness) return { sharpness, luma, ok: false, reason: "blurry" };
  return { sharpness, luma, ok: true };
}

/** Main-thread gate (legacy path, kept for A/B comparison with the worker via ?worker=0). */
export function qualityGate(src: CanvasImageSource, cfg: GateCfg, scratch: HTMLCanvasElement): GateResult {
  const W = 160, H = 90;
  const t0 = performance.now();
  scratch.width = W; scratch.height = H;
  const ctx = scratch.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, W, H);
  const t1 = performance.now();
  const px = ctx.getImageData(0, 0, W, H).data;
  const t2 = performance.now();
  const r = gateFromPixels(px, W, H, cfg);
  const t3 = performance.now();
  return { ...r, drawMs: t1 - t0, readMs: t2 - t1, computeMs: t3 - t2 };
}

export async function envReport(): Promise<Record<string, string>> {
  const nav = navigator as Navigator & { deviceMemory?: number; getBattery?: () => Promise<{ level: number; charging: boolean }> };
  const out: Record<string, string> = {};
  out["User agent"] = nav.userAgent;
  out["Installed (standalone)"] = String(matchMedia("(display-mode: standalone)").matches || (nav as unknown as { standalone?: boolean }).standalone === true);
  out["Device memory (GB)"] = String(nav.deviceMemory ?? "n/a");
  out["CPU cores"] = String(nav.hardwareConcurrency ?? "n/a");
  out["Screen"] = `${screen.width}x${screen.height} @${devicePixelRatio}x`;
  out["Wake Lock API"] = String("wakeLock" in nav);
  out["DeviceOrientation"] = String("DeviceOrientationEvent" in window);
  out["Orientation needs permission (iOS)"] = String(typeof (window as unknown as { DeviceOrientationEvent?: { requestPermission?: unknown } }).DeviceOrientationEvent?.requestPermission === "function");
  out["OffscreenCanvas"] = String("OffscreenCanvas" in window);
  out["Background Sync"] = String("serviceWorker" in nav && "SyncManager" in window);
  if (nav.storage?.estimate) {
    const e = await nav.storage.estimate();
    out["Storage quota / used (MB)"] = `${Math.round((e.quota ?? 0) / 1e6)} / ${Math.round((e.usage ?? 0) / 1e6)}`;
  }
  if (nav.storage?.persisted) out["Storage persisted"] = String(await nav.storage.persisted());
  if (nav.getBattery) { const b = await nav.getBattery(); out["Battery at load"] = `${Math.round(b.level * 100)}%${b.charging ? " (charging)" : ""}`; }
  return out;
}

/**
 * Compass heading (deg clockwise from north) of the direction the BACK camera faces,
 * from absolute DeviceOrientation angles (W3C Z-X'-Y'' convention). Unlike `360 - alpha`,
 * this stays correct when the phone is held upright, which is how it is held while walking.
 */
export function cameraHeadingDeg(alphaDeg: number, betaDeg: number, gammaDeg: number): number | null {
  const r = Math.PI / 180, a = alphaDeg * r, b = betaDeg * r, g = gammaDeg * r;
  const zx = Math.cos(a) * Math.sin(g) + Math.sin(a) * Math.sin(b) * Math.cos(g);
  const zy = Math.sin(a) * Math.sin(g) - Math.cos(a) * Math.sin(b) * Math.cos(g);
  if (Math.hypot(zx, zy) < 0.2) return null; // camera pointing at sky/ground: heading undefined
  return (Math.atan2(-zx, -zy) / r + 360) % 360;
}

/** Smallest absolute angle between two compass bearings, 0-180. */
export function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Config overrides from the URL, e.g. ?q=0.5&w=800&every=10&sharp=40, so settings can be tuned without redeploying. */
export function cfgFromUrl<T extends Record<string, number>>(base: T, map: Record<string, keyof T>): T {
  const out = { ...base };
  const sp = new URLSearchParams(location.search);
  for (const [k, field] of Object.entries(map)) {
    const v = Number(sp.get(k));
    if (sp.has(k) && Number.isFinite(v) && v > 0) (out as Record<string, number>)[field as string] = v;
  }
  return out;
}
