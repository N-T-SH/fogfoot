import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./dots.css";
import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { buildField, dotsNear, randomRoute, toLocal, type DemoFile, type DotField, DOT_SPACING_M } from "./data";
import { DECAY_DAYS, Progress } from "./progress";

const SIM_EAT_RADIUS_M = 7;
const GPS_EAT_RADIUS_M = 12; // wider than the sim: phone GPS wobbles; side (L/R) is not resolved in this prototype
const MAX_GPS_ACC_M = 35;
const WALK_SPEED_MS = 1.4;
const ZOOM_DOTS = 16;        // below this zoom, show per-unit progress lines instead of individual dots

interface Avatar { lat: number; lon: number; pulse: number }

class DotLayer extends L.Layer {
  canvas!: HTMLCanvasElement;
  constructor(private f: DotField, private prog: Progress, private avatar: () => Avatar | null) { super(); }

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

    // The maze: every unit as a faint line (shared streets dashed), coloured by progress when zoomed out.
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const u of f.units) {
      if (!b.intersects(L.latLngBounds(u.ll.map(([lo, la]) => [la, lo] as [number, number])))) continue;
      let eaten = 0;
      for (let i = u.first; i < u.first + u.count; i++) if (this.prog.isEaten(f.key[i])) eaten++;
      const frac = u.count ? eaten / u.count : 0;
      ctx.beginPath();
      u.ll.forEach(([lo, la], i) => { const p = pt(la, lo); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      if (zoom >= ZOOM_DOTS) { ctx.strokeStyle = "#16226b"; ctx.lineWidth = u.shared ? 1.5 : 2.5; }
      else { ctx.strokeStyle = frac === 0 ? "#16226b" : `hsl(${40 + 10 * frac} 100% ${30 + 40 * frac}%)`; ctx.lineWidth = 3; }
      ctx.setLineDash(u.shared ? [4, 5] : []);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (zoom >= ZOOM_DOTS) {
      const r = zoom >= 18 ? 4 : zoom >= 17 ? 3.2 : 2.4;
      ctx.fillStyle = "#ffb300"; ctx.beginPath();
      const pellets: [number, number][] = [];
      for (let i = 0; i < f.n; i++) {
        if (!b.contains([f.lat[i], f.lon[i]]) || this.prog.isEaten(f.key[i])) continue;
        const p = pt(f.lat[i], f.lon[i]);
        if (f.power[i]) { pellets.push([p.x, p.y]); continue; }
        ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, 6.2832);
      }
      ctx.fill();
      const beat = 1 + 0.18 * Math.sin(performance.now() / 260);
      ctx.fillStyle = "#ff7a1a";
      for (const [x, y] of pellets) { ctx.beginPath(); ctx.arc(x, y, r * 2.4 * beat, 0, 6.2832); ctx.fill(); }
    }

    const a = this.avatar();
    if (a) {
      const p = pt(a.lat, a.lon), s = 1 + a.pulse * 0.35, R = (zoom >= 17 ? 13 : 10) * s;
      ctx.fillStyle = "#ffffff"; ctx.globalAlpha = 0.95;           // a little fog puff, not a pie chart
      for (const [dx, dy, k] of [[0, 0, 1], [-0.7, 0.25, 0.7], [0.7, 0.25, 0.7], [0, -0.55, 0.65]] as const) {
        ctx.beginPath(); ctx.arc(p.x + dx * R, p.y + dy * R, R * k, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.fillStyle = "#1a1200";
      for (const dx of [-0.32, 0.32]) { ctx.beginPath(); ctx.arc(p.x + dx * R, p.y - 0.05 * R, R * 0.13, 0, 6.2832); ctx.fill(); }
    }
  };
}

function DotsApp({ data }: { data: DemoFile }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const live = useRef({
    f: null as DotField | null, prog: new Progress(), layer: null as DotLayer | null, map: null as L.Map | null,
    avatar: null as Avatar | null, mode: "idle" as "idle" | "sim" | "gps", route: [] as [number, number][], cum: [] as number[], s: 0,
    speed: 12, lastHud: 0, lastBuzz: 0, lastFrame: 0, lastPan: 0, watch: 0, raf: 0, tiles: null as L.TileLayer | null,
  });
  const [hud, setHud] = useState({ eaten: 0, total: 0, session: 0, mode: "idle" as string, speed: 12, tiles: false, days: 0, msg: "" });
  const hudRef = useRef(hud); hudRef.current = hud;
  const patch = (p: Partial<typeof hud>) => setHud((h) => ({ ...h, ...p }));

  const countEaten = () => {
    const { f, prog } = live.current; if (!f) return 0;
    let n = 0; for (let i = 0; i < f.n; i++) if (prog.isEaten(f.key[i])) n++; return n;
  };
  const refreshHud = (extra: Partial<typeof hud> = {}) => patch({ eaten: countEaten(), days: live.current.prog.offsetDays, ...extra });

  const eatAt = (lat: number, lon: number, radius: number) => {
    const L_ = live.current, f = L_.f!; const [x, y] = toLocal(f, lon, lat);
    let got = 0;
    for (const i of dotsNear(f, x, y, radius)) if (!L_.prog.isEaten(f.key[i])) { L_.prog.eat(f.key[i]); got++; }
    if (got) {
      if (L_.avatar) L_.avatar.pulse = 1;
      const now = performance.now();
      if (now - L_.lastBuzz > 120) { L_.lastBuzz = now; try { navigator.vibrate?.(8); } catch { /* unsupported (iOS) */ } }
      hudRef.current.session += got; // cheap mutable counter, flushed with the next HUD update
    }
    return got;
  };

  const posAt = (s: number): [number, number] => {
    const { route, cum } = live.current;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; cum[mid] <= s ? (lo = mid) : (hi = mid); }
    const seg = cum[hi] - cum[lo] || 1, t = Math.min(1, Math.max(0, (s - cum[lo]) / seg));
    return [route[lo][0] + t * (route[hi][0] - route[lo][0]), route[lo][1] + t * (route[hi][1] - route[lo][1])];
  };

  const stop = () => {
    const L_ = live.current;
    cancelAnimationFrame(L_.raf); if (L_.watch) navigator.geolocation.clearWatch(L_.watch);
    L_.watch = 0; L_.mode = "idle"; L_.avatar = null; L_.prog.save(); L_.layer?.redraw();
    refreshHud({ mode: "idle" });
  };

  const startSim = () => {
    const L_ = live.current, f = L_.f!, map = L_.map!;
    stop();
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
      L_.avatar = { lat, lon, pulse: Math.max(0, (L_.avatar?.pulse ?? 0) - dt * 4) };
      eatAt(lat, lon, SIM_EAT_RADIUS_M);
      if (t - L_.lastPan > 300) { L_.lastPan = t; const p = map.latLngToContainerPoint([lat, lon]), sz = map.getSize();
        if (p.x < sz.x * 0.25 || p.x > sz.x * 0.75 || p.y < sz.y * 0.3 || p.y > sz.y * 0.65) map.panTo([lat, lon], { animate: false }); }
      L_.layer!.redraw();
      if (t - L_.lastHud > 250) { L_.lastHud = t; refreshHud({ session: hudRef.current.session, mode: "sim" }); }
      L_.raf = requestAnimationFrame(tick);
    };
    refreshHud({ mode: "sim", msg: "" });
    L_.raf = requestAnimationFrame(tick);
  };

  const startGps = () => {
    const L_ = live.current, f = L_.f!, map = L_.map!;
    stop();
    if (!navigator.geolocation) { patch({ msg: "This device has no GPS." }); return; }
    L_.mode = "gps";
    L_.watch = navigator.geolocation.watchPosition((p) => {
      const lat = p.coords.latitude, lon = p.coords.longitude;
      L_.avatar = { lat, lon, pulse: L_.avatar?.pulse ?? 0 };
      const [x, y] = toLocal(f, lon, lat);
      const near = dotsNear(f, x, y, 40).length;
      if (p.coords.accuracy > MAX_GPS_ACC_M) { patch({ msg: `GPS is vague (${Math.round(p.coords.accuracy)} m), not counting yet.` }); }
      else if (!near && hudRef.current.session === 0) patch({ msg: "You're outside the demo area (Koramangala). Try Simulate walk." });
      else { patch({ msg: "" }); eatAt(lat, lon, GPS_EAT_RADIUS_M); }
      map.panTo([lat, lon], { animate: false });
      L_.layer!.redraw(); refreshHud({ session: hudRef.current.session, mode: "gps" });
    }, (e) => patch({ msg: `GPS error: ${e.message}`, mode: "idle" }), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    refreshHud({ mode: "gps" });
  };

  useEffect(() => {
    const L_ = live.current;
    L_.f = buildField(data);
    const map = L.map(mapEl.current!, {
      zoomControl: false, attributionControl: true, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false,
      minZoom: 14, maxZoom: 19, center: [data.center[1], data.center[0]], zoom: 17,
    });
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: "topright" }).addTo(map);
    L_.map = map;
    L_.layer = new DotLayer(L_.f, L_.prog, () => L_.avatar).addTo(map) as DotLayer;
    const beat = setInterval(() => { if (L_.mode === "idle") L_.layer?.redraw(); }, 400); // pellets pulse
    patch({ total: L_.f.n, eaten: countEaten(), days: L_.prog.offsetDays });
    return () => { clearInterval(beat); stop(); map.remove(); };
  }, []);

  const toggleTiles = () => {
    const L_ = live.current, map = L_.map!;
    if (L_.tiles) { map.removeLayer(L_.tiles); L_.tiles = null; patch({ tiles: false }); return; }
    L_.tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, className: "dim-tiles", attribution: "© OpenStreetMap contributors" }).addTo(map);
    L_.tiles.bringToBack(); patch({ tiles: true });
  };

  const pct = hud.total ? Math.round((100 * hud.eaten) / hud.total) : 0;
  return (
    <div class="dots-root">
      <div ref={mapEl} style="position:absolute;inset:0" />
      <div class="dots-hud">
        <h1>dots · concept</h1>
        <div class="big">{hud.eaten.toLocaleString()} <span class="sub">of {hud.total.toLocaleString()} dots · {pct}%</span></div>
        <div class="sub">+{hud.session} this walk · a dot every {DOT_SPACING_M} m · regrows after {DECAY_DAYS} days{hud.days ? ` · clock +${hud.days}d` : ""}</div>
      </div>
      {hud.msg && <div class="dots-msg">{hud.msg}</div>}
      <div class="dots-bar">
        <button class={hud.mode === "sim" ? "on" : ""} onClick={() => (hud.mode === "sim" ? stop() : startSim())}>{hud.mode === "sim" ? "Stop walk" : "Simulate walk"}</button>
        <button class={hud.mode === "gps" ? "on" : ""} onClick={() => (hud.mode === "gps" ? stop() : startGps())}>{hud.mode === "gps" ? "Stop GPS" : "Use my GPS"}</button>
        <button onClick={() => { const s = hud.speed >= 24 ? 6 : hud.speed * 2; live.current.speed = s; patch({ speed: s }); }}>Speed ×{hud.speed}</button>
        <button onClick={() => { live.current.prog.advance(30); live.current.layer?.redraw(); refreshHud(); }}>+30 days</button>
        <button onClick={toggleTiles} class={hud.tiles ? "on" : ""}>Street map</button>
        <button onClick={() => { stop(); live.current.prog.reset(); hudRef.current.session = 0; live.current.layer?.redraw(); refreshHud({ session: 0 }); }}>Reset</button>
      </div>
    </div>
  );
}

export async function mountDots(el: HTMLElement) {
  const data = (await (await fetch(import.meta.env.BASE_URL + "demo-units.json")).json()) as DemoFile;
  render(<DotsApp data={data} />, el);
}
