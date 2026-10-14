// Visual FX: CRT post-process, bloom, stage parallax backgrounds, palette cycling, raster distortion.
export const fxCfg = { crt: true, low: false };
try { const v = localStorage.getItem("sf101crt"); if (v === "0") fxCfg.crt = false; if (localStorage.getItem("sf101lowfx") === "1") fxCfg.low = true; } catch { /* */ }
export function saveFx() { try { localStorage.setItem("sf101crt", fxCfg.crt ? "1" : "0"); localStorage.setItem("sf101lowfx", fxCfg.low ? "1" : "0"); } catch { /* */ } }

/** Genesis-style cycling palettes per visual stage (cool cyan -> magenta -> angry red/magenta). */
export const STAGE_PAL = [
  ["#00e0ff", "#40a0ff", "#a0f0ff", "#ffffff", "#00b0c0", "#2060ff", "#60d0ff", "#0080ff"],
  ["#00e0ff", "#6080ff", "#c040ff", "#ff40e0", "#a0f0ff", "#4040c0", "#8060ff", "#40c0ff"],
  ["#ff30d0", "#c040ff", "#ff80f0", "#ffffff", "#8020c0", "#ff40a0", "#e060ff", "#a030e0"],
  ["#ff2a6a", "#ff30d0", "#ff8040", "#ffd0e0", "#c01060", "#ff60a0", "#ff40ff", "#e02040"],
  ["#ff2020", "#ff8000", "#ffd040", "#ffffff", "#ff3060", "#c00000", "#ff30d0", "#ff6020"],
];
export const STAGE_TINT = ["#00b8ff", "#5060ff", "#c030ff", "#ff2090", "#ff2000"];

const mk = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")!]; };
let seed = 7; const sr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
/** Draw fn at y, y-h, y+h so the tile wraps vertically. */
const wrap = (h: number, y: number, fn: (yy: number) => void) => { fn(y); fn(y - h); fn(y + h); };

export function nebulaTile(w: number, h: number) {
  const [c, g] = mk(w, h);
  for (let i = 0; i < 26; i++) {
    const x = sr() * w, y = sr() * h, r = 30 + sr() * 70, col = ["120,40,200", "40,80,220", "200,40,180", "60,20,140"][i % 4], a = 0.10 + sr() * 0.12;
    wrap(h, y, yy => { const gr = g.createRadialGradient(x, yy, 0, x, yy, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x - r, yy - r, r * 2, r * 2); });
  }
  // dither speckle so it stays pixel-art
  for (let i = 0; i < 900; i++) { g.fillStyle = sr() < 0.5 ? "rgba(220,150,255,0.18)" : "rgba(120,180,255,0.15)"; g.fillRect(Math.floor(sr() * w), Math.floor(sr() * h), 1, 1); }
  return c;
}
export function fortressTile(w: number, h: number, near: boolean) {
  const [c, g] = mk(w, h);
  const metal = near ? "#1c0c34" : "#120824", edge = near ? "#3e2270" : "#26144a", lite = near ? "#ff30d0" : "#8040c0";
  if (near) { // side walls only, so the middle stays readable
    for (const side of [0, 1]) for (let y = 0; y < h; y += 24) {
      const ww = 14 + Math.floor(sr() * 22), x = side ? w - ww : 0;
      g.fillStyle = metal; g.fillRect(x, y, ww, 24); g.fillStyle = edge; g.fillRect(side ? x : x + ww - 2, y, 2, 24); g.fillRect(x, y, ww, 1);
      if (sr() < 0.5) { g.fillStyle = lite; g.fillRect(side ? x + 4 : x + ww - 6, y + 8, 2, 2); }
      if (sr() < 0.35) { g.fillStyle = metal; const bw = 10 + Math.floor(sr() * 18); g.fillRect(side ? x - bw : x + ww, y + 10, bw, 4); g.fillStyle = edge; g.fillRect(side ? x - bw : x + ww, y + 10, bw, 1); }
    }
  } else { // far ruins: broken girders, struts, dead lights
    for (let i = 0; i < 14; i++) {
      const x = sr() * w, y = sr() * h, bw = 4 + sr() * 8, bh = 30 + sr() * 90;
      wrap(h, y, yy => { g.fillStyle = metal; g.fillRect(x, yy, bw, bh); g.fillStyle = edge; g.fillRect(x, yy, 1, bh);
        for (let k = 0; k < bh; k += 10) { g.fillStyle = edge; g.fillRect(x - 6, yy + k, bw + 12, 1); } if (sr() < 0.6) { g.fillStyle = lite; g.fillRect(x + 1, yy + 4, 1, 1); } });
    }
    for (let i = 0; i < 10; i++) { const y = sr() * h, x = sr() * w, len = 40 + sr() * 90; wrap(h, y, yy => { g.fillStyle = metal; g.fillRect(x, yy, len, 5); g.fillStyle = edge; g.fillRect(x, yy, len, 1);
      for (let k = 0; k < len; k += 8) { g.fillRect(x + k, yy + 1, 1, 4); } }); }
  }
  return c;
}
export function coreTile(w: number, h: number) {
  const [c, g] = mk(w, h);
  for (let i = 0; i < 9; i++) { // molten veins (random walks), dark-red body + hot core
    let x = sr() * w, y = sr() * h; const pts: [number, number][] = [];
    for (let k = 0; k < 60; k++) { pts.push([x, y]); x += (sr() - 0.5) * 10; y += 4 + sr() * 3; }
    for (const [cw, col] of [[5, "rgba(120,10,10,0.5)"], [3, "rgba(255,60,20,0.55)"], [1, "rgba(255,210,80,0.9)"]] as [number, string][]) {
      g.fillStyle = col; for (const [px, py] of pts) wrap(h, py % h, yy => g.fillRect(Math.round(px - cw / 2), Math.round(yy), cw, 4));
    }
  }
  for (let i = 0; i < 600; i++) { g.fillStyle = sr() < 0.5 ? "rgba(255,120,40,0.25)" : "rgba(160,20,40,0.3)"; g.fillRect(Math.floor(sr() * w), Math.floor(sr() * h), 1, 1); }
  return c;
}
/** Vertically scroll a wrapping tile. */
export function scrollTile(g: CanvasRenderingContext2D, tile: HTMLCanvasElement, off: number, alpha: number) {
  if (alpha < 0.01) return; const th = tile.height, o = ((off % th) + th) % th;
  g.globalAlpha = alpha; g.drawImage(tile, 0, o - th); g.drawImage(tile, 0, o); g.globalAlpha = 1;
}
/** Palette-cycled border: colour bands travel around the rectangle's perimeter. */
export function cycleRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pal: string[], t: number, seg = 3, band = 10) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const P = 2 * (w + h) - 4, n = pal.length, sh = t * 60;
  for (let p = 0; p < P; p += seg) {
    g.fillStyle = pal[(((Math.floor((p - sh) / band)) % n) + n) % n];
    const l = Math.min(seg, P - p);
    if (p < w) g.fillRect(x + p, y, Math.min(l, w - p), 1);
    else if (p < w + h - 2) g.fillRect(x + w - 1, y + p - w + 1, 1, l);
    else if (p < 2 * w + h - 2) g.fillRect(x + w - 1 - (p - w - h + 2) - l + 1, y + h - 1, l, 1);
    else g.fillRect(x, y + h - 2 - (p - 2 * w - h + 3) - l + 2, 1, l);
  }
}
/** Small travelling highlight around a mini-screen border (subtle; keeps health colours readable). */
export function cometRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string, ph: number) {
  const P = 2 * (w + h), p = Math.floor(((ph % 1) + 1) % 1 * P);
  g.fillStyle = col;
  for (let k = 0; k < 4; k++) { const q = (p + k) % P; if (q < w) g.fillRect(x + q, y, 1, 1); else if (q < w + h) g.fillRect(x + w - 1, y + q - w, 1, 1); else if (q < 2 * w + h) g.fillRect(x + w - 1 - (q - w - h), y + h - 1, 1, 1); else g.fillRect(x, y + h - 1 - (q - 2 * w - h), 1, 1); }
}

// ---------- post-process ----------
const [glow, gctx] = mk(68, 81); // 1/4-res field copy, upscaled with smoothing = cheap bloom
const [rast, rctx] = mk(272, 324);
/** Additive glow of the play field (bullets, enemies, ship). */
export function bloom(g: CanvasRenderingContext2D, src: HTMLCanvasElement, fx: number, fy: number, fw: number, fh: number, amt: number) {
  gctx.imageSmoothingEnabled = true; gctx.globalCompositeOperation = "copy"; gctx.drawImage(src, fx, fy, fw, fh, 0, 0, glow.width, glow.height);
  g.save(); g.imageSmoothingEnabled = true; g.globalCompositeOperation = "lighter"; g.globalAlpha = amt;
  g.drawImage(glow, fx - 2, fy - 2, fw + 4, fh + 4); g.globalAlpha = amt * 0.6; g.drawImage(glow, fx - 6, fy - 6, fw + 12, fh + 12); g.restore(); g.imageSmoothingEnabled = false;
}
/** Raster line-scroll: each 2px line of the field shifted by a sine (Genesis H-scroll trick). */
export function rasterWave(g: CanvasRenderingContext2D, src: HTMLCanvasElement, fx: number, fy: number, fw: number, fh: number, amp: number, t: number) {
  if (amp < 0.3) return;
  rctx.globalCompositeOperation = "copy"; rctx.drawImage(src, fx, fy, fw, fh, 0, 0, fw, fh);
  g.save(); g.beginPath(); g.rect(fx, fy, fw, fh); g.clip();
  for (let y = 0; y < fh; y += 2) { const dx = Math.round(Math.sin(y * 0.09 + t * 18) * amp + Math.sin(y * 0.031 - t * 7) * amp * 0.5); g.drawImage(rast, 0, y, fw, 2, fx + dx, fy + y, fw, 2); }
  g.restore();
}
let overlay: HTMLCanvasElement | null = null; let ovKey = "";
/** Scanlines + vignette overlay at display resolution. */
function crtOverlay(w: number, h: number, rows: number) {
  const key = w + "x" + h; if (overlay && ovKey === key) return overlay; ovKey = key;
  const [c, g] = mk(w, h); const rh = h / rows;
  g.fillStyle = "rgba(0,0,0,0.30)"; for (let r = 0; r < rows; r++) { const y0 = r * rh + rh * 0.62; g.fillRect(0, Math.floor(y0), w, Math.max(1, Math.round(rh * 0.38))); }
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.55); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
  g.fillStyle = vg; g.fillRect(0, 0, w, h); overlay = c; return c;
}
/** Draw the upscaled frame to the display, with barrel curve (horizontal bands) + scanlines + vignette. */
export function presentCRT(d: CanvasRenderingContext2D, mid: HTMLCanvasElement, vx: number, vy: number, vw: number, vh: number, rows: number) {
  d.imageSmoothingEnabled = true; d.imageSmoothingQuality = "high";
  const N = fxCfg.low ? 1 : 48, c = 0.022, bh = mid.height / N, dh = vh / N;
  for (let i = 0; i < N; i++) {
    const v = (i + 0.5) / N * 2 - 1, inset = N > 1 ? c * v * v * vw : 0, yb = vy + vh / 2 + (v * (1 - c * 0.6 * (1 - v * v))) * vh / 2 - dh / 2;
    d.drawImage(mid, 0, i * bh, mid.width, bh, vx + inset, yb, vw - inset * 2, dh + 1);
  }
  d.drawImage(crtOverlay(Math.round(vw), Math.round(vh), rows), vx, vy);
}
