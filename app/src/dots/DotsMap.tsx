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

    // Every unit as a faint line (shared streets dashed); coloured by progress when zoomed out.
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const u of f.units) {
      if (!b.intersects(L.latLngBounds(u.ll.map(([lo, la]) => [la, lo] as [number, number])))) continue;
      let eaten = 0;
      for (let i = u.first; i < u.first + u.count; i++) if (this.prog.isEaten(f.key[i])) eaten++;
      const frac = u.count ? eaten / u.count : 0;
      ctx.beginPath();
      u.ll.forEach(([lo, la], i) => { const p = pt(la, lo); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      if (zoom >= ZOOM_DOTS) { ctx.strokeStyle = "rgba(40,70,160,.20)"; ctx.lineWidth = u.shared ? 1.5 : 2.5; }
      else { ctx.strokeStyle = frac === 0 ? "rgba(60,90,170,.5)" : `hsl(${40 + 80 * frac} 85% 42%)`; ctx.lineWidth = 3.5; }
      ctx.setLineDash(u.shared ? [4, 5] : []);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (zoom >= ZOOM_DOTS) {
      const r = zoom >= 18 ? 4.5 : zoom >= 17 ? 3.6 : 2.8;
      const dots: number[] = [], pellets: number[] = [], trail: number[] = [];
      for (let i = 0; i < f.n; i++) {
        if (!b.contains([f.lat[i], f.lon[i]])) continue;
        const p = pt(f.lat[i], f.lon[i]);
        if (this.prog.isEaten(f.key[i])) trail.push(p.x, p.y);
        else (f.power[i] ? pellets : dots).push(p.x, p.y);
      }
      const circles = (xy: number[], rad: number) => { for (let i = 0; i < xy.length; i += 2) { ctx.moveTo(xy[i] + rad, xy[i + 1]); ctx.arc(xy[i], xy[i + 1], rad, 0, 6.2832); } };
      ctx.fillStyle = "rgba(46,125,50,.55)"; ctx.beginPath(); circles(trail, r * 0.4); ctx.fill();     // where you have been
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); circles(dots, r + 1.8); ctx.fill();                 // halo so dots read on any map
      ctx.fillStyle = "#ff9800"; ctx.beginPath(); circles(dots, r); ctx.fill();
      const beat = 1 + 0.16 * Math.sin(performance.now() / 260), pr = r * 2.3 * beat;
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); circles(pellets, pr + 2); ctx.fill();
      ctx.fillStyle = "#e53935"; ctx.beginPath(); circles(pellets, pr); ctx.fill();
    }

    const a = this.avatar();
    if (a) { const p = pt(a.lat, a.lon); drawWalker(ctx, p.x, p.y, zoom >= 17 ? 40 : 32, a); }
  };
}

function DotsApp({ data }: { data: DemoFile }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const live = useRef({
    f: null as DotField | null, prog: new Progress(), layer: null as DotLayer | null, map: null as L.Map | null,
    avatar: null as Avatar | null, mode: "idle" as "idle" | "sim" | "gps", route: [] as [number, number][], cum: [] as number[], s: 0,
    speed: 12, lastHud: 0, lastBuzz: 0, lastFrame: 0, lastPan: 0, watch: 0, raf: 0, tiles: null as L.TileLayer | null,
  });
  const [hud, setHud] = useState({ eaten: 0, total: 0, session: 0, mode: "idle" as string, speed: 12, tiles: true, days: 0, msg: "" });
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
      const prev = L_.avatar;
      L_.avatar = {
        lat, lon, pulse: Math.max(0, (prev?.pulse ?? 0) - dt * 4), moving: true,
        phase: (prev?.phase ?? 0) + (2 * Math.PI * WALK_SPEED_MS * 2 * dt) / 1.4,        // cadence of a normal walk, not of the ×N speed-up
        face: prev && Math.abs(lon - prev.lon) > 2e-8 ? (lon > prev.lon ? 1 : -1) : prev?.face ?? 1,
      };
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
      else if (!near && hudRef.current.session === 0) patch({ msg: `You're outside the demo area (${data.name}). Try Simulate walk.` });
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
    setTiles(true);
    const beat = setInterval(() => { if (L_.mode === "idle") L_.layer?.redraw(); }, 400); // pellets pulse
    patch({ total: L_.f.n, eaten: countEaten(), days: L_.prog.offsetDays });
    return () => { clearInterval(beat); stop(); map.remove(); };
  }, []);

  const setTiles = (on: boolean) => {
    const L_ = live.current, map = L_.map!;
    if (!on) { if (L_.tiles) map.removeLayer(L_.tiles); L_.tiles = null; patch({ tiles: false }); return; }
    // Prototype only: OSM's public tile servers are not for production traffic; the real app uses its own PMTiles.
    L_.tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, className: "soft-tiles", attribution: "© OpenStreetMap contributors" }).addTo(map);
    L_.tiles.bringToBack(); patch({ tiles: true });
  };
  const toggleTiles = () => setTiles(!live.current.tiles);

  const pct = hud.total ? Math.round((100 * hud.eaten) / hud.total) : 0;
  return (
    <div class="dots-root">
      <div ref={mapEl} style="position:absolute;inset:0" />
      <div class="dots-hud">
        <h1>dots · concept · {data.name}</h1>
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
  const area = new URLSearchParams(location.hash.split("?")[1] ?? "").get("area") ?? "domlur"; // #/dots?area=koramangala
  const file = area === "koramangala" ? "demo-units-koramangala.json" : "demo-units-domlur.json";
  const data = (await (await fetch(import.meta.env.BASE_URL + file)).json()) as DemoFile;
  render(<DotsApp data={data} />, el);
}
