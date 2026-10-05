import "../style.css";
import { useEffect, useRef, useState } from "preact/hooks";
import { angleDiffDeg, bearingDeg, cameraHeadingDeg, cfgFromUrl, envReport, haversineM, qualityGate } from "./measure";
import { clearFrames, frameCount, putFrame, totalBytes } from "./store";
import type { EncodeReq, EncodeRes } from "./encode.worker";
import { runBench, type BenchResult } from "./bench";

// Spike A: measure whether eyes-up PWA capture is viable on low-end Android and iOS.
// Defaults mirror config/settings.yaml `capture:`; tune from the exported report.
const CFG = cfgFromUrl(
  { sampleEveryM: 10, jpegQuality: 0.6, maxWidth: 960, minSharpness: 40, minLuma: 45, maxGpsAccM: 35 },
  { every: "sampleEveryM", q: "jpegQuality", w: "maxWidth", sharp: "minSharpness", luma: "minLuma", acc: "maxGpsAccM" }
);

interface Stats {
  kept: number; blurry: number; dark: number; badGps: number;
  gateMs: number[]; encodeMs: number[]; bytes: number;
  longTasks: number; gpsAcc: number | null; headingSource: string; distanceM: number;
  startedAt: number | null; startBattery: number | null; battery: number | null; heapMB: number | null;
  gateDrawMs: number[]; gateReadMs: number[]; gateComputeMs: number[];
  gpsFixes: number; lastFixAt: number | null; fixGapsMs: number[]; busySkips: number;
  hiddenCount: number; wakeLock: string; persist: string;
  headingDiffFormula: number[]; headingDiffAlphaOnly: number[];
  mode: string; bitmapMs: number[]; roundtripMs: number[];
}
const fresh = (): Stats => ({
  kept: 0, blurry: 0, dark: 0, badGps: 0, gateMs: [], encodeMs: [], bytes: 0, longTasks: 0,
  gpsAcc: null, headingSource: "none", distanceM: 0, startedAt: null, startBattery: null, battery: null, heapMB: null,
  gateDrawMs: [], gateReadMs: [], gateComputeMs: [], gpsFixes: 0, lastFixAt: null, fixGapsMs: [], busySkips: 0,
  hiddenCount: 0, wakeLock: "not requested", persist: "not requested", headingDiffFormula: [], headingDiffAlphaOnly: [], mode: "main_thread", bitmapMs: [], roundtripMs: []
});
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (a: number[], p: number) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

export function Spike() {
  const [env, setEnv] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");
  const [stats, setStats] = useState<Stats>(fresh());
  const [queued, setQueued] = useState({ n: 0, bytes: 0 });
  const [bench, setBench] = useState<BenchResult | null>(null);
  const [benchStep, setBenchStep] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const live = useRef({ stats: fresh(), stop: () => {} });

  const refreshQueue = async () => setQueued({ n: await frameCount(), bytes: await totalBytes() });
  useEffect(() => { envReport().then(setEnv); refreshQueue(); }, []);

  async function start() {
    setMsg("");
    const s = fresh(); s.startedAt = Date.now(); live.current.stats = s; setStats({ ...s });
    const cleanups: Array<() => void> = [];
    try {
      // 1. Sensors permission must come from a user gesture on iOS.
      const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
      if (DOE?.requestPermission) { try { await DOE.requestPermission(); } catch { /* denied */ } }

      // 2. Persistent storage (helps against eviction).
      if (navigator.storage?.persist) s.persist = String(await navigator.storage.persist());

      // 3. Rear camera, 720p.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false
      });
      cleanups.push(() => stream.getTracks().forEach((t) => t.stop()));
      const v = video.current!; v.srcObject = stream; v.muted = true; v.playsInline = true; await v.play();

      // 4. Wake lock (foreground only).
      try {
        const wl = await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen");
        if (wl) { s.wakeLock = "granted"; cleanups.push(() => { wl.release().catch(() => {}); }); } else s.wakeLock = "unsupported";
      } catch (e) { s.wakeLock = `refused: ${(e as Error).message}`; setMsg("Wake lock refused; screen may sleep."); }
      const onVis = () => { if (document.visibilityState === "hidden") live.current.stats.hiddenCount++; };
      document.addEventListener("visibilitychange", onVis);
      cleanups.push(() => document.removeEventListener("visibilitychange", onVis));

      // 5. Heading: compass if it actually reports, else GPS course.
      // `compass` = direction the back camera faces. Android: from absolute alpha/beta/gamma (correct when upright).
      // iOS: webkitCompassHeading. `alphaOnly` (the naive 360 - alpha) is kept only to quantify how wrong it is.
      let compass: number | null = null, alphaOnly: number | null = null;
      const onOri = (e: DeviceOrientationEvent) => {
        const w = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
        if (typeof w === "number") { compass = w; alphaOnly = w; }
        else if (e.absolute && e.alpha != null && e.beta != null && e.gamma != null) {
          compass = cameraHeadingDeg(e.alpha, e.beta, e.gamma);
          alphaOnly = (360 - e.alpha) % 360;
        }
      };
      window.addEventListener("deviceorientationabsolute" as "deviceorientation", onOri);
      window.addEventListener("deviceorientation", onOri);
      cleanups.push(() => { window.removeEventListener("deviceorientationabsolute" as "deviceorientation", onOri); window.removeEventListener("deviceorientation", onOri); });

      // 6. Long-task counter (main-thread jank proxy).
      try {
        const po = new PerformanceObserver((l) => { live.current.stats.longTasks += l.getEntries().length; });
        po.observe({ entryTypes: ["longtask"] }); cleanups.push(() => po.disconnect());
      } catch { /* unsupported (e.g. Safari) */ }

      // 7. Battery/memory sampling.
      const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> };
      const bat = nav.getBattery ? await nav.getBattery() : null;
      if (bat) s.startBattery = Math.round(bat.level * 100);
      const tick = setInterval(() => {
        const st = live.current.stats;
        if (bat) st.battery = Math.round(bat.level * 100);
        const pm = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
        if (pm) st.heapMB = Math.round(pm.usedJSHeapSize / 1e6);
        setStats({ ...st });
      }, 2000);
      cleanups.push(() => clearInterval(tick));

      // 8. GPS-driven sampler.
      const scratch = document.createElement("canvas");
      const out = document.createElement("canvas");

      // Worker pipeline (default): main thread only grabs a downscaled ImageBitmap; gate + JPEG encode run in a worker.
      // Falls back to the main-thread path if unsupported, errors, or ?worker=0.
      let workerOk = new URLSearchParams(location.search).get("worker") !== "0" &&
        typeof Worker !== "undefined" && "OffscreenCanvas" in window && typeof createImageBitmap === "function";
      const fullGrab = new URLSearchParams(location.search).get("bmp") === "full"; // ?bmp=full: grab full-size, worker downscales
      let worker: Worker | null = null;
      const pending = new Map<number, (r: EncodeRes) => void>();
      let reqId = 0;
      if (workerOk) {
        try {
          worker = new Worker(new URL("./encode.worker.ts", import.meta.url), { type: "module" });
          worker.onmessage = (ev: MessageEvent<EncodeRes>) => { pending.get(ev.data.id)?.(ev.data); pending.delete(ev.data.id); };
          worker.onerror = () => { pending.forEach((f, id) => f({ id, error: "worker crashed" })); pending.clear(); };
          cleanups.push(() => worker?.terminate());
          s.mode = "worker";
        } catch { workerOk = false; }
      }
      const callWorker = (req: Omit<EncodeReq, "id">, transfer: Transferable[]) =>
        new Promise<EncodeRes>((resolve) => { const id = ++reqId; pending.set(id, resolve); worker!.postMessage({ ...req, id }, transfer); });
      let last: { lat: number; lon: number } | null = null;
      let prev: { lat: number; lon: number } | null = null;
      let course: number | null = null;
      let busy = false;
      const wid = navigator.geolocation.watchPosition(async (p) => {
        const st = live.current.stats;
        const cur = { lat: p.coords.latitude, lon: p.coords.longitude };
        st.gpsAcc = Math.round(p.coords.accuracy);
        st.gpsFixes++;
        const now = Date.now();
        if (st.lastFixAt) st.fixGapsMs.push(now - st.lastFixAt);
        st.lastFixAt = now;
        if (prev && haversineM(prev, cur) > 3) {
          course = bearingDeg(prev, cur);
          // While walking forward with the camera forward, camera heading should match GPS course.
          if (compass != null) st.headingDiffFormula.push(angleDiffDeg(compass, course));
          if (alphaOnly != null) st.headingDiffAlphaOnly.push(angleDiffDeg(alphaOnly, course));
        }
        prev = cur;
        if (p.coords.accuracy > CFG.maxGpsAccM) { st.badGps++; return; }
        if (last && haversineM(last, cur) < CFG.sampleEveryM) return;
        if (busy || v.videoWidth === 0) { if (busy) st.busySkips++; return; }
        busy = true;
        try {
          let blob: Blob;
          const tStart = performance.now();
          if (workerOk) {
            const w = Math.min(CFG.maxWidth, v.videoWidth), h = Math.round((w * v.videoHeight) / v.videoWidth);
            let bitmap: ImageBitmap;
            if (fullGrab) bitmap = await createImageBitmap(v);
            else {
              try { bitmap = await createImageBitmap(v, { resizeWidth: w, resizeHeight: h, resizeQuality: "low" }); }
              catch { bitmap = await createImageBitmap(v); }
            }
            st.bitmapMs.push(performance.now() - tStart);
            const res = await callWorker({ bitmap, maxWidth: CFG.maxWidth, quality: CFG.jpegQuality, minSharpness: CFG.minSharpness, minLuma: CFG.minLuma }, [bitmap]);
            st.roundtripMs.push(performance.now() - tStart);
            if (res.error || !res.gate) {
              workerOk = false; st.mode = "main_thread (worker failed)"; setMsg(`Worker failed (${res.error}); using main thread.`);
              return;
            }
            st.gateMs.push(res.gateMs ?? 0);
            if (!res.gate.ok) { if (res.gate.reason === "dark") st.dark++; else st.blurry++; return; }
            st.encodeMs.push(res.encodeMs ?? 0);
            blob = res.blob!;
          } else {
            const gate = qualityGate(v, { minSharpness: CFG.minSharpness, minLuma: CFG.minLuma }, scratch);
            st.gateMs.push(performance.now() - tStart);
            st.gateDrawMs.push(gate.drawMs); st.gateReadMs.push(gate.readMs); st.gateComputeMs.push(gate.computeMs);
            if (!gate.ok) { if (gate.reason === "dark") st.dark++; else st.blurry++; return; }
            const t1 = performance.now();
            const w = Math.min(CFG.maxWidth, v.videoWidth), h = Math.round((w * v.videoHeight) / v.videoWidth);
            out.width = w; out.height = h; out.getContext("2d")!.drawImage(v, 0, 0, w, h);
            blob = await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", CFG.jpegQuality));
            st.encodeMs.push(performance.now() - t1);
            st.roundtripMs.push(performance.now() - tStart);
          }
          const heading = compass ?? course;
          st.headingSource = compass != null ? "compass" : course != null ? "gps_course" : "none";
          await putFrame({ at: Date.now(), lat: cur.lat, lon: cur.lon, acc: p.coords.accuracy, heading, blob });
          st.kept++; st.bytes += blob.size; if (last) st.distanceM += haversineM(last, cur);
          last = cur;
        } catch (e) { setMsg(`Capture error: ${(e as Error).message}. Storage full?`); }
        finally { busy = false; }
      }, (e) => setMsg(`GPS error: ${e.message}`), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
      cleanups.push(() => navigator.geolocation.clearWatch(wid));

      live.current.stop = () => { cleanups.forEach((c) => c()); };
      setRunning(true);
    } catch (e) {
      cleanups.forEach((c) => c());
      setMsg(`Could not start: ${(e as Error).message}`);
    }
  }

  async function stop() { live.current.stop(); setRunning(false); await refreshQueue(); setStats({ ...live.current.stats }); }

  function report() {
    const st = live.current.stats;
    const mins = st.startedAt ? (Date.now() - st.startedAt) / 60000 : 0;
    const r = {
      when: new Date().toISOString(), cfg: CFG, env, minutes: +mins.toFixed(1),
      kept: st.kept, dropped: { blurry: st.blurry, dark: st.dark, badGps: st.badGps },
      gateMs: { avg: +avg(st.gateMs).toFixed(1), p95: +pct(st.gateMs, 0.95).toFixed(1) },
      gateSplitMsAvg: { draw: +avg(st.gateDrawMs).toFixed(1), read: +avg(st.gateReadMs).toFixed(1), compute: +avg(st.gateComputeMs).toFixed(1) },
      gps: { fixes: st.gpsFixes, medianGapMs: Math.round(pct(st.fixGapsMs, 0.5)), p95GapMs: Math.round(pct(st.fixGapsMs, 0.95)), busySkips: st.busySkips },
      headingVsGpsCourseDeg: {
        samples: st.headingDiffFormula.length,
        cameraFormulaMedian: +pct(st.headingDiffFormula, 0.5).toFixed(0), alphaOnlyMedian: +pct(st.headingDiffAlphaOnly, 0.5).toFixed(0)
      },
      pipeline: {
        mode: st.mode, bitmapMsAvg: +avg(st.bitmapMs).toFixed(1),
        roundtripMsAvg: +avg(st.roundtripMs).toFixed(1), roundtripMsP95: +pct(st.roundtripMs, 0.95).toFixed(1),
        note: "in worker mode gateMs/encodeMs are worker-side; main-thread jank is shown by longTasks"
      },
      wakeLock: st.wakeLock, persist: st.persist, pageHiddenCount: st.hiddenCount,
      encodeMs: { avg: +avg(st.encodeMs).toFixed(1), p95: +pct(st.encodeMs, 0.95).toFixed(1) },
      avgFrameKB: st.kept ? Math.round(st.bytes / st.kept / 1024) : 0, totalMB: +(st.bytes / 1e6).toFixed(1),
      distanceM: Math.round(st.distanceM), longTasks: st.longTasks, headingSource: st.headingSource,
      gpsAccLastM: st.gpsAcc, batteryDropPct: st.startBattery != null && st.battery != null ? st.startBattery - st.battery : null,
      heapMB: st.heapMB
    };
    return JSON.stringify({ ...r, bench }, null, 2);
  }

  function copyReport() {
    const text = report();
    navigator.clipboard?.writeText(text).then(() => setMsg("Report copied to clipboard"), () => setMsg("Copy failed; see console"));
    console.log(text);
  }

  async function shareReport() {
    const text = report();
    try {
      if (navigator.share) await navigator.share({ title: "fogfoot Spike A report", text });
      else { await navigator.clipboard.writeText(text); setMsg("Sharing not supported here; report copied instead"); }
    } catch (e) { if ((e as Error).name !== "AbortError") setMsg(`Share failed: ${(e as Error).message}`); }
  }

  async function quickCheck() {
    setMsg(""); setBench(null);
    try { setBench(await runBench(CFG, video.current!, setBenchStep)); setBenchStep("Done. Tap Share report."); }
    catch (e) { setBenchStep(""); setMsg(`Quick check failed: ${(e as Error).message}`); }
  }

  const mb = (n: number) => (n / 1e6).toFixed(1);
  return (
    <main>
      <h1>fogfoot · Spike A</h1>
      <div style="color:var(--mut)">Capture viability test. Hold the phone at chest height, camera forward, and walk ~2 km.</div>
      <video ref={video} playsInline muted />
      <div class="row">
        {!running ? <button class="primary" onClick={start}>Start walk</button> : <button onClick={stop}>Stop</button>}
        <button onClick={quickCheck} disabled={running}>Quick device check (30 s)</button>
        <button onClick={shareReport}>Share report</button>
        <button onClick={copyReport}>Copy report</button>
        <button class="danger" onClick={async () => { await clearFrames(); await refreshQueue(); }}>Clear queue</button>
      </div>
      {msg && <div class="bad">{msg}</div>}
      {benchStep && <div style="color:var(--mut)">{benchStep}</div>}
      {bench && (
        <>
          <h2>Quick check result ({bench.source}, {bench.sourceSize})</h2>
          <table>
            <tr><td>Main thread: ms per frame (avg / p95)</td><td>{bench.main.avgMs} / {bench.main.p95Ms}{bench.main.error ? ` ⚠ ${bench.main.error}` : ""}</td></tr>
            <tr><td>Main thread: long stalls</td><td>{bench.main.longTasks}</td></tr>
            <tr><td>Worker: ms per frame (avg / p95)</td><td>{bench.worker ? `${bench.worker.avgMs} / ${bench.worker.p95Ms}${bench.worker.error ? ` ⚠ ${bench.worker.error}` : ""}` : "not supported"}</td></tr>
            <tr><td>Worker: long stalls</td><td>{bench.worker?.longTasks ?? "–"}</td></tr>
            <tr><td>Worker, full-size grab (avg / p95)</td><td>{bench.workerFullGrab ? `${bench.workerFullGrab.avgMs} / ${bench.workerFullGrab.p95Ms}${bench.workerFullGrab.error ? ` ⚠ ${bench.workerFullGrab.error}` : ""}` : "not supported"}</td></tr>
            <tr><td>Worker, full-size grab: long stalls</td><td>{bench.workerFullGrab?.longTasks ?? "–"}</td></tr>
            <tr><td>Avg frame size</td><td>{bench.main.avgFrameKB} KB</td></tr>
            <tr><td>Storage write</td><td>{bench.idb.error ? `⚠ ${bench.idb.error}` : `${bench.idb.msPerWrite} ms each`}</td></tr>
          </table>
        </>
      )}
      <h2>Live</h2>
      <table>
        <tr><td>Frames kept</td><td>{stats.kept}</td></tr>
        <tr><td>Dropped (blurry / dark / bad GPS)</td><td>{stats.blurry} / {stats.dark} / {stats.badGps}</td></tr>
        <tr><td>Distance</td><td>{Math.round(stats.distanceM)} m</td></tr>
        <tr><td>GPS accuracy</td><td>{stats.gpsAcc ?? "–"} m</td></tr>
        <tr><td>Heading source</td><td>{stats.headingSource}</td></tr>
        <tr><td>Gate ms avg / p95</td><td>{avg(stats.gateMs).toFixed(1)} / {pct(stats.gateMs, 0.95).toFixed(1)}</td></tr>
        <tr><td>Gate split draw / read / compute</td><td>{avg(stats.gateDrawMs).toFixed(0)} / {avg(stats.gateReadMs).toFixed(0)} / {avg(stats.gateComputeMs).toFixed(0)} ms</td></tr>
        <tr><td>Heading vs GPS course (median °)</td><td>{pct(stats.headingDiffFormula, 0.5).toFixed(0)} (naive {pct(stats.headingDiffAlphaOnly, 0.5).toFixed(0)})</td></tr>
        <tr><td>Wake lock</td><td>{stats.wakeLock}</td></tr>
        <tr><td>Pipeline</td><td>{stats.mode} · round trip {avg(stats.roundtripMs).toFixed(0)} ms</td></tr>
        <tr><td>Encode ms avg / p95</td><td>{avg(stats.encodeMs).toFixed(1)} / {pct(stats.encodeMs, 0.95).toFixed(1)}</td></tr>
        <tr><td>Avg frame size</td><td>{stats.kept ? Math.round(stats.bytes / stats.kept / 1024) : 0} KB</td></tr>
        <tr><td>Long tasks (jank)</td><td>{stats.longTasks}</td></tr>
        <tr><td>Battery start → now</td><td>{stats.startBattery ?? "n/a"} → {stats.battery ?? "n/a"} %</td></tr>
        <tr><td>JS heap</td><td>{stats.heapMB ?? "n/a"} MB</td></tr>
      </table>
      <h2>Queue (IndexedDB)</h2>
      <table><tr><td>Stored frames</td><td>{queued.n} ({mb(queued.bytes)} MB)</td></tr></table>
      <h2>Device</h2>
      <table>{Object.entries(env).map(([k, v]) => <tr><td>{k}</td><td>{v}</td></tr>)}</table>
    </main>
  );
}
