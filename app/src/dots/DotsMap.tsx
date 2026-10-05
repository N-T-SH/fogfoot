import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./dots.css";
import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { buildField, dotsNear, randomRoute, toLocal, type DemoFile, type DotField, DOT_SPACING_M } from "./data";
import { Coverage, WINDOW_DAYS } from "./coverage";
import { itemIndex, makeSprites, type Sprites } from "./icons";
import { CAPTURE, FrameSaver, type SaverState } from "../capture/saver";
import { recentFrames } from "../capture/queue";

const SIM_EAT_RADIUS_M = 7;
const GPS_EAT_RADIUS_M = 12; // wider than the sim: phone GPS wobbles; side (L/R) is not resolved in this prototype
const MAX_GPS_ACC_M = 35;
const WALK_SPEED_MS = 1.4;
const ZOOM_DOTS = 16;        // below this zoom, show per-unit progress lines instead of individual dots

interface Avatar { lat: number; lon: number; pulse: number; phase: number; face: 1 | -1; moving: boolean }

/** A walking person in silhouette (feet at the GPS point). Original artwork: strokes with a white outline so it reads on any map. */
function drawWalker(ctx: CanvasRenderingContext2D, x: number, y: number, H: number, a: Avatar) {
  const k = (H / 36) * (1 + a.pulse * 0.12), sw = a.moving ? Math.sin(a.phase) : 0;
  ctx.save(); ctx.translate(x, y); ctx.scale(a.face * k, k); ctx.lineCap = "round"; ctx.lineJoin = "round";
  const hip: [number, number] = [0, -17], sh: [number, number] = [1.6, -27];
  const limb = (from: [number, number], l1: number, ang1: number, l2: number, ang2: number): [number, number][] => {
    const m: [number, number] = [from[0] + l1 * Math.sin(ang1), from[1] + l1 * Math.cos(ang1)];
    return [from, m, [m[0] + l2 * Math.sin(ang2), m[1] + l2 * Math.cos(ang2)]];
  };
  const leg = (ph: number) => { const t = a.moving ? 0.55 * Math.sin(ph) : 0; return limb(hip, 8.6, t, 8.6, t - (a.moving ? 0.75 * Math.max(0, Math.cos(ph)) : 0)); };
  const arm = (ph: number) => { const t = a.moving ? -0.5 * Math.sin(ph) : 0.05; return limb(sh, 6.6, t, 6, t + (a.moving ? 0.55 : 0.1)); };
  const parts: { pts: [number, number][]; w: number; c: string }[] = [
    { pts: arm(a.phase + Math.PI), w: 3, c: "#4a5877" }, { pts: leg(a.phase + Math.PI), w: 3.6, c: "#4a5877" },
    { pts: [hip, sh], w: 5, c: "#14213d" }, { pts: leg(a.phase), w: 3.6, c: "#14213d" }, { pts: arm(a.phase), w: 3, c: "#14213d" },
  ];
  for (const pass of [0, 1]) {
    for (const p of parts) {
      ctx.beginPath(); ctx.moveTo(...p.pts[0]); for (const q of p.pts.slice(1)) ctx.lineTo(...q);
      ctx.strokeStyle = pass === 0 ? "#ffffff" : p.c; ctx.lineWidth = pass === 0 ? p.w + 2.6 : p.w; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(2.4, -32.2, 4.3, 0, 6.2832);
    if (pass === 0) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.6; ctx.stroke(); } else { ctx.fillStyle = "#14213d"; ctx.fill(); }
  }
  ctx.restore();
}

class DotLayer extends L.Layer {
  canvas!: HTMLCanvasElement;
  sprites: Sprites;
  itemIdx: Uint8Array;
  constructor(private f: DotField, private cov: Coverage, private avatar: () => Avatar | null) {
    super();
    this.sprites = makeSprites(Math.round(24 * Math.min(window.devicePixelRatio || 1, 2)));
    this.itemIdx = Uint8Array.from(f.key, (k) => itemIndex(k));   // which litter item sits at each dot (stable)
  }

  onAdd(map: L.Map) {
    this.canvas = L.DomUtil.create("canvas", "dots-canvas") as HTMLCanvasElement;
    map.getPane("overlayPane")!.appendChild(this.canvas);
    map.on("moveend zoomend resize", this.redraw, this);
    this.redraw();
    return this;
  }

  onRemove(map: L.Map) {
    map.off("moveend zoomend resize", this.redraw, this);
    this.canvas.remove();
    return this;
  }

  redraw = () => {
    const map = this._map as L.Map | undefined;
    if (!map || !this.canvas) return;
    const size = map.getSize(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    L.DomUtil.setPosition(this.canvas, map.containerPointToLayerPoint([0, 0]));
    if (this.canvas.width !== size.x * dpr || this.canvas.height !== size.y * dpr) {
      this.canvas.width = size.x * dpr; this.canvas.height = size.y * dpr;
      this.canvas.style.width = `${size.x}px`; this.canvas.style.height = `${size.y}px`;
    }
    const ctx = this.canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
    const f = this.f, zoom = map.getZoom(), b = map.getBounds().pad(0.1);
    const pt = (lat: number, lon: number) => map.latLngToContainerPoint([lat, lon]);

    // Every unit as a faint line (shared streets dashed); coloured by progress when zoomed out.
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const u of f.units) {
      if (!b.intersects(L.latLngBounds(u.ll.map(([lo, la]) => [la, lo] as [number, number])))) continue;
      let done = 0;
      for (let i = u.first; i < u.first + u.count; i++) if (this.cov.state(f.key[i]) !== "none") done++;
      const frac = u.count ? done / u.count : 0;
      ctx.beginPath();
      u.ll.forEach(([lo, la], i) => { const p = pt(la, lo); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      if (zoom >= ZOOM_DOTS) { ctx.strokeStyle = "rgba(40,70,160,.20)"; ctx.lineWidth = u.shared ? 1.5 : 2.5; }
      else { ctx.strokeStyle = frac === 0 ? "rgba(60,90,170,.5)" : `hsl(${40 + 80 * frac} 85% 42%)`; ctx.lineWidth = 3.5; }
      ctx.setLineDash(u.shared ? [4, 5] : []);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (zoom >= ZOOM_DOTS) {
      const S = zoom >= 18 ? 17 : zoom >= 17 ? 12 : 9;               // litter icon size, CSS px: small, so a street reads as a trail, not a pile
      const r = zoom >= 18 ? 2.4 : zoom >= 17 ? 1.9 : 1.5;           // "picked up" marker size
      const fresh: number[] = [], mid: number[] = [], old: number[] = [], items: number[] = [], heaps: number[] = [];
      for (let i = 0; i < f.n; i++) {
        if (!b.contains([f.lat[i], f.lon[i]])) continue;
        const p = pt(f.lat[i], f.lon[i]), key = f.key[i];
        if (this.cov.state(key) === "none") (f.power[i] ? heaps : items).push(p.x, p.y, this.itemIdx[i]);
        else { const age = this.cov.ageDays(key)!; (age < 3 ? fresh : age < 14 ? mid : old).push(p.x, p.y); }
      }
      const circles = (xy: number[], rad: number) => { for (let i = 0; i < xy.length; i += 2) { ctx.moveTo(xy[i] + rad, xy[i + 1]); ctx.arc(xy[i], xy[i + 1], rad, 0, 6.2832); } };
      const paint = (xy: number[], rad: number, color: string) => {
        ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.beginPath(); circles(xy, rad + 1.1); ctx.fill();
        ctx.fillStyle = color; ctx.beginPath(); circles(xy, rad); ctx.fill();
      };
      paint(old, r, "#a5d6a1"); paint(mid, r, "#5fb865"); paint(fresh, r, "#2e8b3d");   // picked up: darker green = more recently
      ctx.imageSmoothingEnabled = true;
      const D = S * this.sprites.scale;                                                     // sprite is slightly larger than the icon: it includes the white edge
      for (let i = 0; i < items.length; i += 3) ctx.drawImage(this.sprites.items[items[i + 2]], items[i] - D / 2, items[i + 1] - D / 2, D, D);
      const H = S * 1.9 * this.sprites.scale * (1 + 0.08 * Math.sin(performance.now() / 260));                 // garbage heaps (hotspots) pulse gently
      for (let i = 0; i < heaps.length; i += 3) ctx.drawImage(this.sprites.pile, heaps[i] - H / 2, heaps[i + 1] - H / 2, H, H);
    }

    const a = this.avatar();
    if (a) { const p = pt(a.lat, a.lon); drawWalker(ctx, p.x, p.y, zoom >= 17 ? 30 : 24, a); }
  };
}

function DotsApp({ data }: { data: DemoFile }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const live = useRef({
    f: null as DotField | null, cov: null as Coverage | null, layer: null as DotLayer | null, map: null as L.Map | null,
    avatar: null as Avatar | null, mode: "idle" as "idle" | "sim" | "gps", route: [] as [number, number][], cum: [] as number[], s: 0,
    lastDraw: 0, speed: 12, saver: null as FrameSaver | null, stream: null as MediaStream | null, wake: null as { release(): Promise<void> } | null, lastHud: 0, lastBuzz: 0, lastFrame: 0, lastPan: 0, watch: 0, raf: 0, tiles: null as L.TileLayer | null,
  });
  const [hud, setHud] = useState({ covered: 0, picked: 0, total: 0, added: 0, refreshed: 0, mode: "idle" as string, speed: 12, tiles: true, days: 0, msg: "", sync: "off" as string, syncDetail: "", cam: "off" as "off" | "on" | "denied", camMsg: "", expanded: false, gallery: false });
  const [frames, setFrames] = useState<SaverState>({ on: true, count: 0, bytes: 0, blurry: 0, dark: 0, full: false, capBytes: CAPTURE.capMB * 1e6, error: "" });
  const videoEl = useRef<HTMLVideoElement>(null);
  const hudRef = useRef(hud); hudRef.current = hud;
  const patch = (p: Partial<typeof hud>) => setHud((h) => ({ ...h, ...p }));

  const tally = () => {
    const { f, cov } = live.current; let picked = 0, covered = 0;
    if (f && cov) for (let i = 0; i < f.n; i++) { const k = f.key[i]; if (cov.state(k) !== "none") covered++; if (cov.mineFresh(k)) picked++; }
    return { picked, covered };
  };
  const refreshHud = (extra: Partial<typeof hud> = {}) => {
    const c = live.current.cov!;
    patch({ ...tally(), days: c.offsetDays, sync: c.sync.state, syncDetail: c.sync.detail, added: counters.current.added, refreshed: counters.current.refreshed, ...extra });
  };
  const counters = useRef({ added: 0, refreshed: 0 });
  const shareWalks = useRef(false); // simulated walks stay on the device unless the test room is open

  const eatAt = (lat: number, lon: number, radius: number, share: boolean) => {
    const L_ = live.current, f = L_.f!; const [x, y] = toLocal(f, lon, lat);
    let added = 0;
    const keys: string[] = [];
    for (const i of dotsNear(f, x, y, radius)) {
      const r = L_.cov!.eat(f.key[i], share);
      if (r === "new") { counters.current.added++; added++; keys.push(f.key[i]); } else if (r === "refresh") { counters.current.refreshed++; added++; keys.push(f.key[i]); }
    }
    if (added) {
      if (L_.avatar) L_.avatar.pulse = 1;
      const now = performance.now();
      if (now - L_.lastBuzz > 120) { L_.lastBuzz = now; try { navigator.vibrate?.(8); } catch { /* unsupported (iOS) */ } }
    }
    return keys;
  };

  const posAt = (s: number): [number, number] => {
    const { route, cum } = live.current;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; cum[mid] <= s ? (lo = mid) : (hi = mid); }
    const seg = cum[hi] - cum[lo] || 1, t = Math.min(1, Math.max(0, (s - cum[lo]) / seg));
    return [route[lo][0] + t * (route[hi][0] - route[lo][0]), route[lo][1] + t * (route[hi][1] - route[lo][1])];
  };

  /** Stop walking (sim or GPS) but leave the camera as it is. */
  const halt = () => {
    const L_ = live.current;
    cancelAnimationFrame(L_.raf); if (L_.watch) navigator.geolocation.clearWatch(L_.watch);
    L_.watch = 0; L_.mode = "idle"; L_.avatar = null; L_.cov?.save(); void L_.cov?.push(); L_.layer?.redraw();
    refreshHud({ mode: "idle" });
  };

  const startCamera = async () => {
    const L_ = live.current;
    if (L_.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) { patch({ cam: "denied", camMsg: "This browser can't show the camera. The map still works." }); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      L_.stream = s;
      const v = videoEl.current!; v.srcObject = s; v.muted = true; await v.play().catch(() => undefined);
      patch({ cam: "on", camMsg: "" });
    } catch (e) {
      const denied = (e as Error).name === "NotAllowedError";
      patch({ cam: "denied", camMsg: denied ? "Camera permission was declined. The map still works." : `Camera unavailable (${(e as Error).message}).` });
    }
  };
  const stopCamera = () => {
    const L_ = live.current;
    L_.stream?.getTracks().forEach((t) => t.stop()); L_.stream = null;
    if (videoEl.current) videoEl.current.srcObject = null;
    patch({ cam: "off" });
  };
  const lockScreen = async () => {
    try { live.current.wake = (await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen")) ?? null; } catch { /* refused */ }
  };
  const unlockScreen = () => { live.current.wake?.release().catch(() => undefined); live.current.wake = null; };
  /** Stop walking, turn the camera off and let the screen sleep again. */
  const stop = () => { halt(); stopCamera(); unlockScreen(); };

  const toggleExpanded = () => {
    patch({ expanded: !hudRef.current.expanded });
    setTimeout(() => { live.current.map?.invalidateSize(); live.current.layer?.redraw(); }, 80);   // the map's box changed size
  };

  const startSim = () => {
    const L_ = live.current, f = L_.f!, map = L_.map!;
    halt(); counters.current = { added: 0, refreshed: 0 }; void startCamera(); void lockScreen();
    const c = map.getCenter(), [cx, cy] = toLocal(f, c.lng, c.lat);
    let best = 0, bd = Infinity;
    f.units.forEach((u, i) => { const [x, y] = u.m[0]; const d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = i; } });
    L_.route = randomRoute(f, best);
    L_.cum = [0]; for (let i = 1; i < L_.route.length; i++) L_.cum.push(L_.cum[i - 1] + Math.hypot(L_.route[i][0] - L_.route[i - 1][0], L_.route[i][1] - L_.route[i - 1][1]));
    L_.s = 0; L_.mode = "sim"; L_.lastFrame = performance.now();
    map.setZoom(Math.max(map.getZoom(), 17), { animate: false });
    const tick = (t: number) => {
      if (L_.mode !== "sim") return;
      const dt = Math.min(0.1, (t - L_.lastFrame) / 1000); L_.lastFrame = t;
      L_.s += WALK_SPEED_MS * L_.speed * dt;
      if (L_.s >= L_.cum[L_.cum.length - 1]) { stop(); return; }
      const [x, y] = posAt(L_.s), lat = f.lat0 + y / f.ky, lon = f.lon0 + x / f.kx;
      const prev = L_.avatar;
      L_.avatar = {
        lat, lon, pulse: Math.max(0, (prev?.pulse ?? 0) - dt * 4), moving: true,
        phase: (prev?.phase ?? 0) + (2 * Math.PI * WALK_SPEED_MS * 2 * dt) / 1.4,        // cadence of a normal walk, not of the ×N speed-up
        face: prev && Math.abs(lon - prev.lon) > 2e-8 ? (lon > prev.lon ? 1 : -1) : prev?.face ?? 1,
      };
      eatAt(lat, lon, SIM_EAT_RADIUS_M, shareWalks.current);
      if (t - L_.lastPan > 300) { L_.lastPan = t; const p = map.latLngToContainerPoint([lat, lon]), sz = map.getSize();
        if (p.x < sz.x * 0.25 || p.x > sz.x * 0.75 || p.y < sz.y * 0.3 || p.y > sz.y * 0.65) map.panTo([lat, lon], { animate: false }); }
      if (t - L_.lastDraw > 66) { L_.lastDraw = t; L_.layer!.redraw(); }                 // ~15 fps is plenty and kind to cheap phones
      if (t - L_.lastHud > 250) { L_.lastHud = t; refreshHud({ mode: "sim" }); }
      L_.raf = requestAnimationFrame(tick);
    };
    refreshHud({ mode: "sim", msg: "" });
    L_.raf = requestAnimationFrame(tick);
  };

  const startGps = () => {
    const L_ = live.current, f = L_.f!, map = L_.map!;
    halt(); counters.current = { added: 0, refreshed: 0 }; void startCamera(); void lockScreen(); L_.saver?.reset();
    if (!navigator.geolocation) { patch({ msg: "This device has no GPS." }); return; }
    L_.mode = "gps";
    L_.watch = navigator.geolocation.watchPosition((p) => {
      const lat = p.coords.latitude, lon = p.coords.longitude;
      const pv = L_.avatar;
      const moved = pv ? Math.hypot((lon - pv.lon) * f.kx, (lat - pv.lat) * f.ky) : 0;
      L_.avatar = {
        lat, lon, pulse: Math.max(0, (pv?.pulse ?? 0) - 0.3), moving: moved > 0.5,
        phase: (pv?.phase ?? 0) + (2 * Math.PI * moved) / 1.4,
        face: pv && Math.abs(lon - pv.lon) > 2e-8 ? (lon > pv.lon ? 1 : -1) : pv?.face ?? 1,
      };
      const [x, y] = toLocal(f, lon, lat);
      const near = dotsNear(f, x, y, 40).length;
      if (p.coords.accuracy > MAX_GPS_ACC_M) { patch({ msg: `GPS is vague (${Math.round(p.coords.accuracy)} m), not counting yet.` }); }
      else if (!near && counters.current.added === 0) patch({ msg: `You're outside the demo area (${data.name}). Try Simulate walk.` });
      else {
        patch({ msg: "" });
        eatAt(lat, lon, GPS_EAT_RADIUS_M, true);
        // Step 1: a real GPS fix with a good reading also saves a camera frame on the phone (never for simulated walks).
        // The frame is tagged with the street stretches within 8 m of the fix, so it can later be tied to its units.
        const around = dotsNear(f, x, y, 8).slice(0, 8).map((i) => f.key[i]);
        void L_.saver?.consider({ lat, lon, acc: p.coords.accuracy }, around);
      }
      map.panTo([lat, lon], { animate: false });
      L_.layer!.redraw(); refreshHud({ mode: "gps" });
    }, (e) => patch({ msg: `GPS error: ${e.message}`, mode: "idle" }), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    refreshHud({ mode: "gps" });
  };

  useEffect(() => {
    const L_ = live.current;
    L_.f = buildField(data);
    const room = new URLSearchParams(location.hash.split("?")[1] ?? "").get("room");
    shareWalks.current = room === "test";
    L_.cov = new Coverage(`${data.area}${room === "test" ? "-test" : ""}`);
    const map = L.map(mapEl.current!, {
      zoomControl: false, attributionControl: true, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false,
      minZoom: 14, maxZoom: 19, center: [data.center[1], data.center[0]], zoom: 17,
    });
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: "topright" }).addTo(map);
    L_.map = map;
    L_.layer = new DotLayer(L_.f, L_.cov, () => L_.avatar).addTo(map) as DotLayer;
    setTiles(true);
    const beat = setInterval(() => { if (L_.mode === "idle") L_.layer?.redraw(); }, 400); // pellets pulse
    L_.saver = new FrameSaver(() => videoEl.current, () => setFrames({ ...L_.saver!.state }));
    void L_.saver.init();
    patch({ total: L_.f.n });
    setTimeout(() => map.invalidateSize(), 0);
    refreshHud();
    L_.cov.start(() => { L_.layer?.redraw(); refreshHud(); });
    return () => { clearInterval(beat); stop(); L_.saver?.dispose(); L_.cov?.stop(); map.remove(); };
  }, []);

  const setTiles = (on: boolean) => {
    const L_ = live.current, map = L_.map!;
    if (!on) { if (L_.tiles) map.removeLayer(L_.tiles); L_.tiles = null; patch({ tiles: false }); return; }
    // Prototype only: OSM's public tile servers are not for production traffic; the real app uses its own PMTiles.
    L_.tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, className: "soft-tiles", attribution: "© OpenStreetMap contributors" }).addTo(map);
    L_.tiles.bringToBack(); patch({ tiles: true });
  };
  const toggleTiles = () => setTiles(!live.current.tiles);

  const room = new URLSearchParams(location.hash.split("?")[1] ?? "").get("room");
  return (
    <div class={`dots-root${hud.expanded ? " expanded" : ""}`}>
      <div class="cam">
        <video ref={videoEl} playsInline muted autoPlay />
        {hud.cam !== "on" && (
          <div class="cam-off">
            <div class="cam-title">Camera view</div>
            <p>{hud.camMsg || "The road ahead shows here while you walk, so you can keep your eyes up even when you check the phone."}</p>
            <button onClick={() => void startCamera()}>Start camera</button>
          </div>
        )}
        <div class="cam-badges">
          {hud.mode === "sim" && <span class="badge warn">Simulated walk: camera shows where you really are</span>}
          {hud.mode === "gps" && <span class="badge">Walking · GPS on</span>}
          {(hud.mode === "gps" || frames.count > 0) && <span class={`badge${frames.full || frames.error ? " warn" : ""}`}>{frames.error || (frames.full ? "Frame storage full" : frames.on ? `Photos saved on this phone: ${frames.count} · ${(frames.bytes / 1e6).toFixed(1)} MB` : "Photo saving off")}</span>}
          <span class="badge">{hud.sync === "ok" ? "Shared with other walkers" : hud.sync === "error" ? "Offline: saved on this phone" : "Connecting…"}</span>
          {room === "test" && <span class="badge">{data.name} · test room</span>}
        </div>
        {hud.msg && <div class="cam-msg">{hud.msg}</div>}
      </div>
      <div class="mapwrap">
        <div ref={mapEl} class="map" />
        <div class="counter">
          <div class="n">{hud.picked.toLocaleString()}<span> items picked up</span></div>
          <div class="s">{hud.added ? `+${hud.added} this walk · ` : ""}all walkers {hud.covered.toLocaleString()}/{hud.total.toLocaleString()}{hud.days ? ` · clock +${hud.days}d` : ""}</div>
          {hud.sync === "error" && <div class="s warn">Not shared right now; saved on this phone</div>}
        </div>
        <button class="expand" onClick={toggleExpanded}>{hud.expanded ? "Shrink map" : "Expand map"}</button>
        <div class="strip">
          <button class={hud.mode === "gps" ? "on" : ""} onClick={() => (hud.mode === "gps" ? stop() : startGps())}>{hud.mode === "gps" ? "Stop walk" : "Start walk (GPS)"}</button>
          <button class={hud.mode === "sim" ? "on" : ""} onClick={() => (hud.mode === "sim" ? stop() : startSim())}>{hud.mode === "sim" ? "Stop sim" : "Simulate"}</button>
          <button onClick={() => { const s = hud.speed >= 24 ? 6 : hud.speed * 2; live.current.speed = s; patch({ speed: s }); }}>Speed ×{hud.speed}</button>
          <button onClick={() => { live.current.cov!.advance(10); live.current.layer?.redraw(); refreshHud(); }}>+10 days</button>
          <button onClick={() => live.current.saver?.setOn(!frames.on)} class={frames.on ? "on" : ""}>Photos: {frames.on ? "on" : "off"}</button>
          <button onClick={() => patch({ gallery: true })}>Photos ({frames.count})</button>
          <button onClick={toggleTiles} class={hud.tiles ? "on" : ""}>Street map</button>
          <button onClick={() => { stop(); live.current.cov!.forgetMine(); counters.current = { added: 0, refreshed: 0 }; live.current.layer?.redraw(); refreshHud(); }}>Forget mine</button>
        </div>
      </div>
      {hud.gallery && <Gallery saver={live.current.saver!} state={frames} onClose={() => patch({ gallery: false })} />}
    </div>
  );
}

/** What has been saved on this phone, so photo quality can be judged by eye. Nothing is uploaded. */
function Gallery({ saver, state, onClose }: { saver: FrameSaver; state: SaverState; onClose: () => void }) {
  const [items, setItems] = useState<{ url: string; caption: string }[]>([]);
  useEffect(() => {
    let urls: string[] = [], dead = false;
    recentFrames(24).then((fs) => {
      if (dead) return;
      const next = fs.map((f) => {
        const url = URL.createObjectURL(f.blob); urls.push(url);
        const t = new Date(f.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        return { url, caption: `${t} · GPS ±${Math.round(f.acc)} m · ${Math.round(f.blob.size / 1024)} KB` };
      });
      setItems(next);
    });
    return () => { dead = true; urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [state.count]);
  return (
    <div class="gallery">
      <div class="gallery-head">
        <div>
          <b>{state.count}</b> photos · {(state.bytes / 1e6).toFixed(1)} MB of {(state.capBytes / 1e6).toFixed(0)} MB
          <div class="sub">Dropped: {state.blurry} blurry, {state.dark} too dark. Photos stay on this phone; nothing is uploaded.</div>
        </div>
        <button onClick={onClose}>Close</button>
      </div>
      <div class="gallery-grid">
        {items.map((it) => (<figure><img src={it.url} alt="" /><figcaption>{it.caption}</figcaption></figure>))}
        {!items.length && <p>No photos yet. Start a GPS walk with the camera on and walk 10 m or more.</p>}
      </div>
      <div class="gallery-foot">
        <button class="danger" onClick={() => { if (confirm("Delete all photos saved on this phone?")) void saver.clear(); }}>Delete all photos</button>
      </div>
    </div>
  );
}

export async function mountDots(el: HTMLElement) {
  const area = new URLSearchParams(location.hash.split("?")[1] ?? "").get("area") ?? "domlur"; // #/dots?area=koramangala
  const file = area === "koramangala" ? "demo-units-koramangala.json" : "demo-units-domlur.json";
  const data = (await (await fetch(import.meta.env.BASE_URL + file)).json()) as DemoFile;
  render(<DotsApp data={data} />, el);
}
