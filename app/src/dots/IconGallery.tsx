import { render } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { ITEMS, PILE, makeSprites } from "./icons";

function Gallery() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 3), big = makeSprites(Math.round(96 * dpr)), small = makeSprites(Math.round(16 * dpr));
    const host = ref.current!;
    const all = [...ITEMS, PILE], sp = [...big.items, big.pile], ss = [...small.items, small.pile];
    all.forEach((k, i) => {
      const cell = document.createElement("div"); cell.className = "cell";
      for (const [cv, css] of [[sp[i], 96], [ss[i], 16]] as const) { cv.style.width = cv.style.height = `${css}px`; cell.appendChild(cv); }
      const l = document.createElement("div"); l.textContent = k.label; cell.appendChild(l);
      host.appendChild(cell);
    });
  }, []);
  return (
    <main style="padding:16px;max-width:640px;margin:0 auto;background:#f4f1ea;min-height:100vh;color:#1b2330;font:14px system-ui">
      <h1 style="font-size:18px">Litter icons</h1>
      <p>Low-fidelity, drawn in code, no brand logos. Shown large and at map size (16 px). Game tokens only: they do not mean litter was detected.</p>
      <style>{`.cell{display:inline-flex;flex-direction:column;align-items:center;gap:6px;width:130px;margin:6px 4px;padding:10px;background:#fff;border-radius:10px;border:1px solid #ddd}.cell div{font-size:12px;color:#56627a}`}</style>
      <div ref={ref} />
    </main>
  );
}
export function mountIcons(el: HTMLElement) { render(<Gallery />, el); }
