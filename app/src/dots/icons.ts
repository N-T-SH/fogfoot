// Low-fidelity litter icons, drawn in code (no image files, no brand logos, no emoji fonts that differ per phone).
// Each icon is drawn once into a small canvas "sprite" and then stamped onto the map, which is cheap on slow phones.
// These are game tokens, not detections: where an icon sits says nothing about whether litter is really there.

export interface ItemKind { id: string; label: string; draw: (c: CanvasRenderingContext2D) => void }

const INK = "#3b2f2f";
const ol = (c: CanvasRenderingContext2D, w = 1.6) => { c.lineWidth = w; c.strokeStyle = INK; c.lineJoin = "round"; c.lineCap = "round"; c.stroke(); };
const fill = (c: CanvasRenderingContext2D, color: string) => { c.fillStyle = color; c.fill(); };
const poly = (c: CanvasRenderingContext2D, pts: [number, number][]) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };

// All icons are drawn in a 40 x 40 box.
export const ITEMS: ItemKind[] = [
  { id: "toffee", label: "Toffee wrapper", draw: (c) => {
    poly(c, [[3, 10], [13, 20], [3, 30]]); fill(c, "#f7b6d2"); ol(c);
    poly(c, [[37, 10], [27, 20], [37, 30]]); fill(c, "#f7b6d2"); ol(c);
    c.beginPath(); c.ellipse(20, 20, 10, 7, 0, 0, 6.2832); fill(c, "#e8458b"); ol(c);
    c.beginPath(); c.moveTo(14, 16); c.lineTo(26, 16); c.moveTo(13, 20); c.lineTo(27, 20); c.moveTo(14, 24); c.lineTo(26, 24); c.strokeStyle = "#fff"; c.lineWidth = 1.4; c.stroke();
  } },
  { id: "bottle", label: "Water bottle", draw: (c) => {
    poly(c, [[16, 2], [24, 2], [24, 7], [16, 7]]); fill(c, "#1e88e5"); ol(c);
    poly(c, [[17, 7], [23, 7], [28, 13], [28, 36], [12, 36], [12, 13]]); fill(c, "#cdeeff"); ol(c);
    poly(c, [[12, 20], [28, 20], [28, 27], [12, 27]]); fill(c, "#ffffff"); ol(c, 1.2);
    c.beginPath(); c.moveTo(12, 15); c.lineTo(28, 15); c.strokeStyle = INK; c.lineWidth = 1; c.stroke();
  } },
  { id: "kulhad", label: "Chai kulhad", draw: (c) => {
    c.beginPath(); c.moveTo(14, 4); c.quadraticCurveTo(10, 8, 14, 11); c.moveTo(21, 3); c.quadraticCurveTo(17, 8, 21, 11); c.moveTo(27, 4); c.quadraticCurveTo(23, 8, 27, 11);
    c.strokeStyle = "#9aa3ad"; c.lineWidth = 1.6; c.stroke();
    poly(c, [[8, 14], [32, 14], [27, 36], [13, 36]]); fill(c, "#c4714a"); ol(c);
    c.beginPath(); c.ellipse(20, 14, 12, 3, 0, 0, 6.2832); fill(c, "#7a3f26"); ol(c);
    c.beginPath(); c.moveTo(12, 24); c.lineTo(28, 24); c.strokeStyle = "#a3583a"; c.lineWidth = 1.4; c.stroke();
  } },
  { id: "namkeen", label: "Snack packet", draw: (c) => {
    c.beginPath(); c.moveTo(7, 7);
    for (let i = 0; i < 6; i++) c.lineTo(7 + (i + 0.5) * (26 / 6), i % 2 ? 7 : 4);
    c.lineTo(33, 7); c.lineTo(33, 33);
    for (let i = 6; i > 0; i--) c.lineTo(7 + (i - 0.5) * (26 / 6), i % 2 ? 36 : 33);
    c.lineTo(7, 33); c.closePath(); fill(c, "#f4c20d"); ol(c);
    poly(c, [[7, 15], [33, 15], [33, 26], [7, 26]]); fill(c, "#e53935"); ol(c, 1.2);
    c.beginPath(); c.arc(20, 20.5, 3.2, 0, 6.2832); fill(c, "#fff3c4");
  } },
  { id: "coconut", label: "Tender coconut", draw: (c) => {
    c.beginPath(); c.arc(20, 23, 13, 0, 6.2832); fill(c, "#8bc34a"); ol(c);
    c.beginPath(); c.ellipse(20, 13, 7, 3.5, 0, 0, 6.2832); fill(c, "#f3efc4"); ol(c, 1.2);
    c.beginPath(); c.moveTo(24, 14); c.lineTo(31, 3); c.strokeStyle = "#e53935"; c.lineWidth = 2.2; c.stroke();
  } },
  { id: "banana", label: "Banana peel", draw: (c) => {
    c.beginPath(); c.moveTo(5, 12); c.quadraticCurveTo(10, 36, 34, 28); c.quadraticCurveTo(22, 28, 5, 12); c.closePath(); fill(c, "#ffd93b"); ol(c);
    c.beginPath(); c.moveTo(5, 12); c.lineTo(3, 7); c.strokeStyle = "#7a5a1a"; c.lineWidth = 2.6; c.stroke();
    c.beginPath(); c.moveTo(11, 17); c.quadraticCurveTo(18, 27, 28, 28); c.strokeStyle = "#d9b52a"; c.lineWidth = 1.2; c.stroke();
  } },
  { id: "bag", label: "Plastic bag", draw: (c) => {
    c.beginPath(); c.moveTo(13, 14); c.quadraticCurveTo(13, 3, 17, 3); c.moveTo(27, 14); c.quadraticCurveTo(27, 3, 23, 3); c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke();
    poly(c, [[9, 13], [31, 13], [34, 36], [6, 36]]); fill(c, "#f3f3f3"); ol(c);
    c.beginPath(); c.moveTo(15, 20); c.lineTo(14, 32); c.moveTo(22, 19); c.lineTo(23, 33); c.moveTo(28, 21); c.lineTo(29, 31); c.strokeStyle = "#c9c9c9"; c.lineWidth = 1.2; c.stroke();
  } },
  { id: "sachet", label: "Masala sachet", draw: (c) => {
    c.beginPath(); c.moveTo(10, 6);
    for (let i = 0; i < 5; i++) c.lineTo(10 + (i + 0.5) * 4, i % 2 ? 6 : 3);
    c.lineTo(30, 6); c.lineTo(30, 36); c.lineTo(10, 36); c.closePath(); fill(c, "#7b1fa2"); ol(c);
    poly(c, [[10, 17], [30, 17], [30, 25], [10, 25]]); fill(c, "#fbc02d"); ol(c, 1.2);
    c.beginPath(); c.arc(20, 21, 2.2, 0, 6.2832); fill(c, "#7b1fa2");
  } },
  { id: "bidi", label: "Cigarette butt", draw: (c) => {
    poly(c, [[5, 17], [31, 17], [31, 24], [5, 24]]); fill(c, "#f5ecd7"); ol(c);
    poly(c, [[31, 17], [36, 18], [36, 23], [31, 24]]); fill(c, "#ef6c00"); ol(c, 1.2);
    c.beginPath(); c.moveTo(8, 12); c.quadraticCurveTo(12, 8, 10, 4); c.strokeStyle = "#b0b7bf"; c.lineWidth = 1.4; c.stroke();
  } },
  { id: "can", label: "Drink can", draw: (c) => {
    poly(c, [[11, 6], [29, 6], [29, 35], [11, 35]]); fill(c, "#26a69a"); ol(c);
    c.beginPath(); c.ellipse(20, 6, 9, 2.6, 0, 0, 6.2832); fill(c, "#cfd8dc"); ol(c, 1.2);
    poly(c, [[11, 16], [29, 16], [29, 25], [11, 25]]); fill(c, "#fff59d"); ol(c, 1.2);
  } },
  { id: "donne", label: "Leaf plate", draw: (c) => {
    c.beginPath(); c.ellipse(20, 22, 15, 10, -0.2, 0, 6.2832); fill(c, "#7cb342"); ol(c);
    c.beginPath(); c.ellipse(20, 22, 9, 5.5, -0.2, 0, 6.2832); fill(c, "#aed581"); ol(c, 1.1);
    c.beginPath(); c.moveTo(8, 27); c.lineTo(14, 24); c.moveTo(28, 17); c.lineTo(33, 14); c.strokeStyle = "#558b2f"; c.lineWidth = 1.2; c.stroke();
  } },
];

/** A heap of rubbish: stands in for a garbage black spot (hotspot). */
export const PILE: ItemKind = { id: "pile", label: "Garbage heap", draw: (c) => {
  c.beginPath(); c.ellipse(20, 30, 17, 7, 0, 0, 6.2832); fill(c, "#8d8076"); ol(c);
  c.beginPath(); c.moveTo(6, 30); c.quadraticCurveTo(8, 10, 20, 9); c.quadraticCurveTo(32, 10, 34, 30); c.closePath(); fill(c, "#6f6a64"); ol(c);
  c.beginPath(); c.arc(15, 20, 4.2, 0, 6.2832); fill(c, "#f3f3f3"); ol(c, 1.2);
  c.beginPath(); c.arc(25, 17, 3.6, 0, 6.2832); fill(c, "#e53935"); ol(c, 1.2);
  c.beginPath(); c.arc(21, 26, 3.4, 0, 6.2832); fill(c, "#1e88e5"); ol(c, 1.2);
  poly(c, [[26, 24], [32, 22], [31, 28]]); fill(c, "#ffd93b"); ol(c, 1.1);
} };

export interface Sprites { items: HTMLCanvasElement[]; pile: HTMLCanvasElement }

/** Draw every icon once at `px` pixels square (use CSS size * devicePixelRatio). */
export function makeSprites(px: number): Sprites {
  const one = (k: ItemKind) => {
    const cv = document.createElement("canvas"); cv.width = cv.height = px;
    const c = cv.getContext("2d")!; c.scale(px / 40, px / 40); k.draw(c);
    return cv;
  };
  return { items: ITEMS.map(one), pile: one(PILE) };
}

/** Which litter item sits at a dot: stable per dot, so it never changes between visits or between phones. */
export function itemIndex(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % ITEMS.length;
}
