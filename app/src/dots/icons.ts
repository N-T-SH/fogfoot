// Low-fidelity litter icons, drawn in code (no image files, no brand logos, no emoji fonts that differ per phone).
// Flat shapes in a calm palette; a thin white "sticker" edge (added in makeSprites) keeps them readable on any map.
// Each icon is drawn once into a small canvas sprite and then stamped onto the map, which is cheap on slow phones.
// These are game tokens, not detections: where an icon sits says nothing about whether litter is really there.

export interface ItemKind { id: string; label: string; draw: (c: CanvasRenderingContext2D) => void }

const poly = (c: CanvasRenderingContext2D, pts: [number, number][], color: string) => {
  c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fillStyle = color; c.fill();
};
const disc = (c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string) => {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 6.2832); c.fillStyle = color; c.fill();
};

// All icons are drawn in a 40 x 40 box.
export const ITEMS: ItemKind[] = [
  { id: "toffee", label: "Toffee wrapper", draw: (c) => {
    poly(c, [[3, 11], [15, 20], [3, 29]], "#f0a3c0"); poly(c, [[37, 11], [25, 20], [37, 29]], "#f0a3c0");
    disc(c, 20, 20, 10, 7.5, "#d9568a");
  } },
  { id: "bottle", label: "Water bottle", draw: (c) => {
    poly(c, [[16, 2], [24, 2], [24, 7], [16, 7]], "#3d8bd8");
    poly(c, [[17, 7], [23, 7], [28, 13], [28, 37], [12, 37], [12, 13]], "#8fc4ef");
    poly(c, [[12, 20], [28, 20], [28, 27], [12, 27]], "#e6f2fc");
  } },
  { id: "cup", label: "Chai cup", draw: (c) => {
    poly(c, [[8, 12], [32, 12], [27, 37], [13, 37]], "#c9805a");
    disc(c, 20, 12, 12, 3.2, "#8a4d2e");
  } },
  { id: "packet", label: "Snack packet", draw: (c) => {
    c.beginPath(); c.moveTo(7, 7);
    for (let i = 0; i < 6; i++) c.lineTo(7 + (i + 0.5) * (26 / 6), i % 2 ? 7 : 3.5);
    c.lineTo(33, 7); c.lineTo(33, 33);
    for (let i = 6; i > 0; i--) c.lineTo(7 + (i - 0.5) * (26 / 6), i % 2 ? 36.5 : 33);
    c.lineTo(7, 33); c.closePath(); c.fillStyle = "#e8a820"; c.fill();
    poly(c, [[7, 16], [33, 16], [33, 25], [7, 25]], "#d8453b");
  } },
  { id: "coconut", label: "Tender coconut", draw: (c) => {
    disc(c, 20, 23, 13, 13, "#7fb36a");
    disc(c, 20, 13, 7.5, 3.6, "#e9efc0");
  } },
  { id: "peel", label: "Banana peel", draw: (c) => {
    c.beginPath(); c.moveTo(5, 12); c.quadraticCurveTo(10, 37, 35, 28); c.quadraticCurveTo(22, 28, 5, 12); c.closePath(); c.fillStyle = "#e8c547"; c.fill();
    c.beginPath(); c.moveTo(5, 12); c.lineTo(3, 6); c.strokeStyle = "#8a6d1f"; c.lineWidth = 3; c.lineCap = "round"; c.stroke();
  } },
  { id: "bag", label: "Plastic bag", draw: (c) => {
    c.beginPath(); c.moveTo(13, 14); c.quadraticCurveTo(13, 3, 17, 3); c.moveTo(27, 14); c.quadraticCurveTo(27, 3, 23, 3);
    c.strokeStyle = "#aab2bb"; c.lineWidth = 2.4; c.lineCap = "round"; c.stroke();
    poly(c, [[9, 13], [31, 13], [35, 37], [5, 37]], "#c3cad2");
  } },
];

/** A heap of rubbish bags with a few things spilled in front: stands in for a garbage black spot (hotspot). */
export const PILE: ItemKind = { id: "pile", label: "Garbage heap", draw: (c) => {
  disc(c, 20, 35, 18, 4, "rgba(0,0,0,.18)");                                   // ground shadow
  const bag = (x: number, y: number, r: number, body: string, shine: string) => {
    disc(c, x, y, r, r * 0.9, body);
    poly(c, [[x - 3, y - r * 0.75], [x + 3, y - r * 0.75], [x + 1.2, y - r * 0.75 - 4.2], [x - 1.2, y - r * 0.75 - 4.2]], body);   // tied-off neck
    disc(c, x, y - r * 0.75 - 4.6, 1.9, 1.7, body);                                                                                 // knot
    disc(c, x - r * 0.4, y - r * 0.25, r * 0.28, r * 0.18, shine);
  };
  bag(11, 28, 8.5, "#4d5963", "rgba(255,255,255,.28)");
  bag(29, 28, 8.5, "#434e58", "rgba(255,255,255,.25)");
  bag(20, 19, 9, "#59656f", "rgba(255,255,255,.30)");
  poly(c, [[2, 33], [8, 31], [9, 36], [3, 37]], "#d9568a");                    // spilled wrapper
  poly(c, [[30, 33], [34, 31.5], [38, 36], [33, 37]], "#e8c547");              // peel
  disc(c, 24, 36, 2.6, 2.6, "#3d8bd8");                                         // bottle cap
} };

export interface Sprites { items: HTMLCanvasElement[]; pile: HTMLCanvasElement; scale: number }

/** Draw every icon once at `px` pixels square (use CSS size * devicePixelRatio), with a thin white sticker edge. */
export function makeSprites(px: number): Sprites {
  const pad = Math.max(1, Math.round(px * 0.05)), size = px + pad * 2;
  const one = (k: ItemKind) => {
    const art = document.createElement("canvas"); art.width = art.height = px;
    const a = art.getContext("2d")!; a.scale(px / 40, px / 40); k.draw(a);
    const white = document.createElement("canvas"); white.width = white.height = px;
    const w = white.getContext("2d")!; w.drawImage(art, 0, 0); w.globalCompositeOperation = "source-in"; w.fillStyle = "rgba(255,255,255,.95)"; w.fillRect(0, 0, px, px);
    const out = document.createElement("canvas"); out.width = out.height = size;
    const o = out.getContext("2d")!;
    for (let i = 0; i < 8; i++) o.drawImage(white, pad + Math.cos((i * Math.PI) / 4) * pad, pad + Math.sin((i * Math.PI) / 4) * pad);
    o.drawImage(art, pad, pad);
    return out;
  };
  return { items: ITEMS.map(one), pile: one(PILE), scale: size / px };
}

/** Which litter item sits at a dot: stable per dot, so it never changes between visits or between phones. */
export function itemIndex(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % ITEMS.length;
}
