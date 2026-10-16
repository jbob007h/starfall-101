// Final bosses: one per pilot (index = pilot id). When the final duel starts, your field spawns the boss of your
// OPPONENT's pilot. Shared framework: procedural neon sprite, movement, rotating attack phases (+25% rate below
// half HP), delayed events (mortars, crates, sniper lines) and telegraph lines. Balanced by tools in boss-test.mjs.
import { drawSprite } from "./sprites";

export interface FBBullet { x: number; y: number; vx: number; vy: number; r: number; col: string; }
export interface FBHost { px: number; py: number; ramp: number; eb: FBBullet[]; }
export interface FBState {
  t: number; cd: number; ph: number; q: { at: number; fn: () => void }[]; tele: { x1: number; y1: number; x2: number; y2: number; life: number; max: number; col: string; ring?: number }[];
  clones: { x: number; y: number; life: number }[]; open: boolean; vis: number; lpx: number; lpy: number; pvx: number; pvy: number; ax: number; ay: number; bx: number; by: number; moveT: number; side: number;
}
export interface FBDef {
  name: string; pal: [string, string, string, string]; w: number; h: number; hp: number;
  shape: (u: number, v: number) => number; hit: { rx: number; ry: number; dy?: number };
  /** Takes damage right now? (default always) */
  weak?: (S: FBState) => boolean;
  move: (S: FBState, h: FBHost, t: number) => { x: number; y: number };
  attacks: ((h: FBHost, x: number, y: number, S: FBState, k: number) => number)[]; // returns cooldown (s)
  phaseLen?: number;
  /** Fire-rate and bullet-speed multipliers (balance: equal time-to-kill, hits dealt and bullet density). */
  rate?: number; spd?: number;
}
export const FINAL_HP = 640;
const PW = 272, TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
let SPD = 1;
const bsp = (h: FBHost) => (60 + h.ramp * 15) * SPD;
const shot = (h: FBHost, x: number, y: number, a: number, sp: number, col: string, r = 2) => { const b = { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r, col }; h.eb.push(b); return b; };
const ring = (h: FBHost, x: number, y: number, n: number, sp: number, col: string, off = 0, r = 2) => { for (let i = 0; i < n; i++) shot(h, x, y, off + i / n * TAU, sp, col, r); };
const aim = (h: FBHost, x: number, y: number) => Math.atan2(h.py - y, h.px - x);
const fan = (h: FBHost, x: number, y: number, a: number, n: number, sp: number, spread: number, col: string, r = 2) => { for (let i = 0; i < n; i++) shot(h, x, y, a + (i - (n - 1) / 2) * spread, sp, col, r); };
const later = (S: FBState, d: number, fn: () => void) => S.q.push({ at: S.t + d, fn });
const tele = (S: FBState, x1: number, y1: number, x2: number, y2: number, life: number, col: string, ring?: number) => S.tele.push({ x1, y1, x2, y2, life, max: life, col, ring });
const hover = (cx: number, ax: number, y: number, fx = 0.6) => (S: FBState, _h: FBHost, t: number) => ({ x: cx + Math.sin(t * fx) * ax, y: Math.min(y, -24 + t * 45) });

const M = "#ff3cc8", C = "#3cf0ff", Y = "#ffe040", W = "#ffffff", R = "#ff5050", G = "#60ff80", O = "#ff9030";
const inE = (u: number, v: number, cu: number, cv: number, ru: number, rv: number) => ((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2 < 1;

export const FINAL_BOSSES: FBDef[] = [
  { // 0 KAGE: shadow-ninja battleship, dashes leaving firing afterimages
    name: "SHADOW SHOGUN", pal: ["#1a0828", "#3a1458", M, W], w: 52, h: 26, hp: 0.90, rate: 0.89, spd: 1.00, hit: { rx: 20, ry: 9 },
    shape: (u, v) => (u < 0.18 && v < 0.4 && v > 0.04) ? (v < 0.2 ? 3 : 2) : (v > 0.3 && v < 0.78 && u < 1 - (v - 0.3) * 0.9) ? (u > 0.55 && v > 0.45 && v < 0.55 ? 2 : 1) : (u > 0.45 && v > 0.7 && v < 0.95 && u < 0.45 + (0.95 - v) * 2) ? 1 : 0,
    move: (S, h, t) => { if (t - S.moveT > 3.2 && t > 2) { S.moveT = t; S.clones.push({ x: S.bx, y: S.by, life: 1.6 }); S.ax = S.bx; S.ay = S.by; S.bx = rnd(40, PW - 40); S.by = rnd(40, 80); }
      const k = Math.min(1, (t - S.moveT) / 0.25); return t < 2 ? { x: PW / 2, y: Math.min(60, -24 + t * 45) } : { x: S.ax + (S.bx - S.ax) * k, y: S.ay + (S.by - S.ay) * k }; },
    attacks: [
      (h, x, y, S) => { ring(h, x, y, 8, bsp(h) * 0.95, M, S.t * 1.7); return 0.5; },
      (h, x, y) => { fan(h, x, y, aim(h, x, y), 5, bsp(h) * 1.15, 0.2, W); return 0.36; },
      (h, x, y, S) => { for (const c of S.clones) if (c.life > 0.4) fan(h, c.x, c.y, aim(h, c.x, c.y), 3, bsp(h), 0.22, M); shot(h, x, y, aim(h, x, y), bsp(h) * 1.3, W); return 0.32; },
    ] },
  { // 1 VOSS: merc gunship, gatling sweeps and re-aiming missiles
    name: "WARHOUND GUNSHIP", pal: ["#2a2410", "#4a4018", O, Y], w: 54, h: 22, hp: 1.25, rate: 1.40, spd: 1.00, hit: { rx: 21, ry: 8 },
    shape: (u, v) => (v > 0.25 && v < 0.75 && u < 0.85) ? (u > 0.7 && v > 0.55 ? 2 : 1) : (u < 0.25 && v < 0.3) ? 3 : (u > 0.85 && u < 1 && v > 0.35 && v < 0.65) ? 2 : (u > 0.35 && u < 0.6 && v > 0.75) ? 1 : 0,
    move: hover(PW / 2, 70, 52, 0.5),
    attacks: [
      (h, x, y, S) => { const a = aim(h, x, y) + Math.sin(S.t * 3) * 0.35; shot(h, x - 14, y + 6, a, bsp(h) * 1.2, Y); shot(h, x + 14, y + 6, a, bsp(h) * 1.2, Y); return 0.13; },
      (h, x, y, S) => { const ms = [] as FBBullet[]; for (let i = 0; i < 6; i++) ms.push(shot(h, x, y + 6, Math.PI / 2 + (i - 2.5) * 0.4, bsp(h) * 0.45, O, 3));
        later(S, 0.7, () => { for (const b of ms) { const a = Math.atan2(h.py - b.y, h.px - b.x); b.vx = Math.cos(a) * bsp(h) * 1.25; b.vy = Math.sin(a) * bsp(h) * 1.25; } }); return 0.62; },
      (h, x, y, S) => { ring(h, x, y, 12, bsp(h) * 0.9, O, S.t); fan(h, x, y, aim(h, x, y), 3, bsp(h) * 1.2, 0.12, Y); return 0.8; },
    ] },
  { // 2 SABLE: thorn throne, rose spirals and royal crowns
    name: "THORN THRONE", pal: ["#2a0830", "#501860", "#c070ff", Y], w: 44, h: 28, hp: 1.21, rate: 0.92, spd: 1.09, hit: { rx: 17, ry: 11 },
    shape: (u, v) => (v < 0.3 && (Math.abs(u - 0.15) < 0.09 || Math.abs(u - 0.55) < 0.09 || Math.abs(u - 0.9) < 0.08) && v > 0.3 - (0.3 * (1 - (u % 0.4)))) ? 2 : (v >= 0.25 && v < 0.85 && u < 0.95 - v * 0.3) ? (inE(u, v, 0, 0.55, 0.25, 0.14) ? 3 : 1) : (v >= 0.85 && u < 0.5) ? 2 : 0,
    move: hover(PW / 2, 55, 58, 0.45),
    attacks: [
      (h, x, y, S) => { const a = S.t * 2.6; for (let k = 0; k < 2; k++) shot(h, x, y, a + k * Math.PI + Math.sin(S.t * 5) * 0.4, bsp(h) * 0.85, "#c070ff"); return 0.12; },
      (h, x, y, S) => { ring(h, x, y, 12, bsp(h) * 0.8, Y, (Math.floor(S.t / 0.75) % 2) * 0.26); fan(h, x, y, aim(h, x, y), 3, bsp(h) * 1.2, 0.15, M); return 0.75; },
      (h, x, y, S) => { for (const s of [-1, 1]) { const ox = x + s * 24, a = aim(h, ox, y); fan(h, ox, y, a, 3, bsp(h) * 1.05, 0.25, "#c070ff"); } ring(h, x, y, 6, bsp(h) * 0.7, Y, S.t); return 0.55; },
    ] },
  { // 3 IRONCLAD: dreadnought; armored hull, broadside batteries, laser walls with a gap
    name: "IRON DREADNOUGHT", pal: ["#141c28", "#2a3a50", C, W], w: 64, h: 22, hp: 1.35, rate: 0.91, spd: 0.60, hit: { rx: 26, ry: 8 },
    shape: (u, v) => (v > 0.2 && v < 0.8 && u < 1 - Math.abs(v - 0.5) * 0.6) ? ((Math.round(u * 8) % 2 === 0 && v > 0.62 && v < 0.75) ? 2 : u < 0.12 && v > 0.3 && v < 0.6 ? 3 : 1) : (u < 0.3 && v <= 0.2 && v > 0.02) ? 1 : (v >= 0.8 && v < 0.95 && Math.round(u * 6) % 2 === 1) ? 2 : 0,
    move: hover(PW / 2, 30, 46, 0.35),
    attacks: [
      (h, x, y, S) => { const k = Math.floor(S.t / 0.42) % 3; for (let i = -2; i <= 2; i++) if ((i + 2 + k) % 3 === 0) { const cx = x + i * 11; fan(h, cx, y + 8, aim(h, cx, y + 8), 2, bsp(h), 0.1, C); } shot(h, x, y, Math.PI / 2, bsp(h) * 1.3, W); return 0.42; },
      (h, x, y, S) => { const gap = Math.floor(rnd(2, PW / 12 - 8)); for (let i = 0; i < PW / 12; i++) if (i < gap || i > gap + 5) shot(h, i * 12 + 6, y + 10, Math.PI / 2, 45 + h.ramp * 10, G); fan(h, x, y, aim(h, x, y), 3, bsp(h) * 1.1, 0.14, C); return 1.5; },
      (h, x, y, S) => { const a = S.t * 3; for (const s of [-1, 1]) shot(h, x + s * 24, y + 4, a * s + Math.PI / 2, bsp(h) * 0.9, C); shot(h, x, y, aim(h, x, y), bsp(h) * 1.25, W); return 0.16; },
    ] },
  { // 4 HEX: glitch cube; teleports, binary rain, scanline grids
    name: "GLITCH CORE", pal: ["#062a14", "#0c4a24", G, M], w: 34, h: 30, hp: 0.79, rate: 1.31, spd: 1.22, hit: { rx: 14, ry: 12 },
    shape: (u, v) => (u < 0.82 && v > 0.08 && v < 0.92) ? ((u < 0.3 && v > 0.35 && v < 0.65) ? 3 : (Math.floor(v * 7) % 2 === 0 && u > 0.55) ? 2 : 1) : (u >= 0.82 && Math.floor(v * 5) % 2 === 1) ? 2 : 0,
    move: (S, h, t) => { if (t - S.moveT > 3 && t > 2) { S.moveT = t; S.bx = rnd(40, PW - 40); S.by = rnd(36, 90); } const ph = t - S.moveT; S.vis = t < 2 ? 1 : ph < 0.25 ? ph / 0.25 : 1; return t < 2 ? { x: PW / 2, y: Math.min(60, -24 + t * 45) } : { x: S.bx, y: S.by }; },
    attacks: [
      (h, x, y) => { shot(h, rnd(4, PW - 4), -4, Math.PI / 2, bsp(h) * rnd(0.8, 1.15), G); shot(h, x, y, aim(h, x, y) + rnd(-0.2, 0.2), bsp(h), M); return 0.11; },
      (h, x, y) => { const left = Math.random() < 0.5, gy = rnd(0, 6) | 0; for (let i = 0; i < 12; i++) if (i < gy || i > gy + 2) shot(h, left ? -4 : PW + 4, 110 + i * 14, left ? 0 : Math.PI, bsp(h) * 0.75, G); fan(h, x, y, aim(h, x, y), 3, bsp(h) * 1.1, 0.18, M); return 1.1; },
      (h, x, y, S) => { ring(h, x, y, 10, bsp(h) * 0.85, G, S.t * 2); return 0.6; },
    ] },
  { // 5 ZORUK: reptile warlord maw; fang fans, acid spit that bursts, tail sweeps
    name: "WARLORD MAW", pal: ["#102a08", "#24500c", G, Y], w: 48, h: 30, hp: 1.06, rate: 1.42, spd: 1.46, hit: { rx: 18, ry: 11 },
    shape: (u, v) => (inE(u, v, 0, 0.45, 0.8, 0.42)) ? ((v > 0.62 && v < 0.75 && u < 0.6) ? 0 : (v > 0.75 && Math.floor(u * 9) % 2 === 0 && u < 0.6) ? 3 : inE(u, v, 0.4, 0.3, 0.12, 0.1) ? 2 : 1) : (u > 0.7 && v < 0.35 && v > 0.05 && u < 0.7 + (0.35 - v)) ? 2 : 0,
    move: hover(PW / 2, 65, 56, 0.55),
    attacks: [
      (h, x, y) => { fan(h, x, y + 8, aim(h, x, y), 9, bsp(h) * 1.05, 0.16, Y); return 0.62; },
      (h, x, y, S) => { const b = shot(h, x, y + 8, aim(h, x, y), bsp(h) * 0.75, G, 4); later(S, 0.85, () => { if (b.y < 400) { ring(h, b.x, b.y, 10, bsp(h) * 0.8, G); b.y = 9999; } }); return 0.85; },
      (h, x, y, S) => { const a = Math.PI / 2 + Math.sin(S.t * 2.4) * 1.1; shot(h, x, y + 6, a, bsp(h) * 1.1, Y); shot(h, x, y + 6, a + 0.12, bsp(h) * 0.9, G); return 0.08; },
    ] },
  { // 6 WRAITH: psychic eye; only vulnerable while open, predictive shots
    name: "ALL-SEEING EYE", pal: ["#200838", "#401060", "#c090ff", W], w: 40, h: 32, hp: 0.66, rate: 0.97, spd: 0.95, hit: { rx: 15, ry: 11 },
    weak: S => S.open,
    shape: (u, v) => inE(u, v, 0, 0.5, 0.95, 0.42) ? (inE(u, v, 0, 0.5, 0.45, 0.25) ? 3 : 1) : (v > 0.85 && Math.floor(u * 6) % 2 === 0) ? 2 : (v < 0.12 && Math.floor(u * 5) % 2 === 1) ? 2 : 0,
    move: (S, h, t) => { const c = t % 4; S.open = t > 2 && c > 0.8 && c < 3.6; return { x: PW / 2 + Math.sin(t * 0.5) * 60, y: Math.min(64, -24 + t * 45) + Math.sin(t * 1.3) * 8 }; },
    attacks: [
      (h, x, y, S) => { if (S.open) { const tx = h.px + S.pvx * 0.5, ty = h.py + S.pvy * 0.5; shot(h, x, y, Math.atan2(ty - y, tx - x), bsp(h) * 1.25, W); if (Math.floor(S.t / 0.22) % 4 === 0) ring(h, x, y, 16, bsp(h) * 0.85, "#c090ff", S.t); return 0.2; }
        for (let k = 0; k < 3; k++) shot(h, x, y, S.t * 1.6 + k * TAU / 3, bsp(h) * 0.7, "#c090ff"); return 0.15; },
    ], phaseLen: 99 },
  { // 7 FANG: frost wolf; lunges, icicle rain, howl shards that speed up
    name: "FROSTFANG", pal: ["#0a2038", "#18406a", "#a0e0ff", W], w: 46, h: 30, hp: 0.93, rate: 1.38, spd: 1.03, hit: { rx: 17, ry: 11 },
    shape: (u, v) => (u > 0.45 && u < 0.85 && v < 0.35 && v > 0.35 - (0.85 - u) * 1.2) ? 2 : inE(u, v, 0, 0.5, 0.7, 0.4) ? ((u > 0.25 && u < 0.45 && v > 0.38 && v < 0.5) ? 3 : (v > 0.78 && Math.floor(u * 8) % 2 === 0 && u < 0.4) ? 3 : 1) : (v > 0.6 && u < 0.95 && u > 0.6 && v < 0.6 + (0.95 - u)) ? 1 : 0,
    move: (S, h, t) => { const c = t % 6, base = { x: PW / 2 + Math.sin(t * 0.6) * 70, y: Math.min(54, -24 + t * 45) }; if (t > 3 && c > 4.4) { const k = Math.sin((c - 4.4) / 1.6 * Math.PI); return { x: base.x, y: base.y + k * 80 }; } return base; },
    attacks: [
      (h, x, y) => { shot(h, rnd(0, PW), -4, Math.PI / 2 + rnd(-0.15, 0.15), bsp(h) * 1.25, "#a0e0ff"); return 0.075; },
      (h, x, y, S) => { const bs: FBBullet[] = []; for (let i = 0; i < 18; i++) bs.push(shot(h, x, y, i / 18 * TAU + S.t, bsp(h) * 0.35, W)); later(S, 0.6, () => { for (const b of bs) { b.vx *= 2.6; b.vy *= 2.6; } }); return 1.0; },
      (h, x, y) => { fan(h, x, y + 6, aim(h, x, y), 4, bsp(h) * 1.2, 0.1, "#a0e0ff"); return 0.3; },
    ] },
  { // 8 MARISOL: smuggler freighter; cargo crates that burst, coin sprays, cargo laser
    name: "BLACK MARKET", pal: ["#082826", "#105048", "#40ffd0", O], w: 56, h: 24, hp: 1.19, rate: 1.66, spd: 1.23, hit: { rx: 22, ry: 9 },
    shape: (u, v) => (v > 0.15 && v < 0.75 && u < 0.92 - (v < 0.3 ? (0.3 - v) * 2 : 0)) ? ((u > 0.2 && u < 0.7 && v > 0.35 && v < 0.6 && Math.floor(u * 10) % 3 !== 0) ? 2 : u < 0.15 && v < 0.4 ? 3 : 1) : (v >= 0.75 && v < 0.95 && u > 0.5 && u < 0.85) ? 2 : 0,
    move: hover(PW / 2, 75, 50, 0.4),
    attacks: [
      (h, x, y, S) => { const b = shot(h, x + rnd(-18, 18), y + 8, Math.PI / 2, bsp(h) * 0.5, O, 4); later(S, 1.1, () => { if (b.y < 400) { ring(h, b.x, b.y, 9, bsp(h) * 0.85, O, rnd(0, 1)); b.y = 9999; } }); return 0.55; },
      (h, x, y, S) => { for (let i = 0; i < 7; i++) shot(h, x, y, Math.PI / 2 + rnd(-0.9, 0.9), bsp(h) * rnd(0.7, 1.25), Y); return 0.42; },
      (h, x, y, S) => { const tx = h.px; tele(S, tx, y, tx, 330, 0.6, "#40ffd0"); later(S, 0.6, () => { for (let i = 0; i < 7; i++) h.eb.push({ x: tx + (i % 2 ? 3 : -3), y: y + 6, vx: 0, vy: bsp(h) * (1.6 + i * 0.12), r: 2, col: "#40ffd0" }); }); fan(h, x, y, aim(h, x, y), 3, bsp(h), 0.2, O); return 0.9; },
    ] },
  { // 9 BRICK: siege tank; mortars on your position, flak, shotgun blasts
    name: "SIEGE TANK", pal: ["#2a1808", "#503010", O, W], w: 50, h: 26, hp: 1.14, rate: 1.45, spd: 1.13, hit: { rx: 19, ry: 10 },
    shape: (u, v) => (u < 0.1 && v < 0.35) ? 2 : (v > 0.25 && v < 0.65 && u < 0.6) ? (u < 0.25 && v > 0.35 && v < 0.55 ? 3 : 1) : (v >= 0.6 && v < 0.95 && u < 0.98) ? ((Math.floor(u * 10) % 2 === 0 && v > 0.75) ? 2 : 1) : 0,
    move: hover(PW / 2, 50, 50, 0.3),
    attacks: [
      (h, x, y, S) => { const tx = h.px, ty = h.py; tele(S, tx, ty, tx, ty, 1.0, R, 14); later(S, 1.0, () => ring(h, tx, ty - 6, 12, bsp(h) * 0.7, O)); shot(h, x, y, aim(h, x, y), bsp(h) * 1.2, W); return 0.7; },
      (h, x, y) => { fan(h, x, y + 6, aim(h, x, y), 3, bsp(h) * 0.75, 0.32, O, 3.5); return 0.42; },
      (h, x, y) => { const a = aim(h, x, y); for (let i = 0; i < 10; i++) shot(h, x, y + 6, a + rnd(-0.5, 0.5), bsp(h) * rnd(0.8, 1.35), Y); return 0.7; },
    ] },
  { // 10 TALON: sky ace jet; strafing runs, missile pods, barrel-roll spirals
    name: "SKY TALON", pal: ["#300810", "#601020", R, W], w: 50, h: 28, hp: 0.71, rate: 0.72, spd: 1.07, hit: { rx: 18, ry: 10 },
    shape: (u, v) => (u < 0.14 && v < 0.9) ? (v < 0.3 && v > 0.12 ? 3 : 1) : (v > 0.35 && v < 0.75 && u < 1 - (v - 0.35) * 0.6 && u < 0.2 + (v - 0.3) * 2.2) ? (u > 0.8 ? 2 : 1) : (v >= 0.78 && u < 0.4) ? 2 : 0,
    move: (S, h, t) => { const ph = Math.floor(t / 4) % 3; if (ph === 0 && t > 2) { const k = (t % 4) / 4; return { x: 60 + (Math.floor(t / 12) % 2 ? 1 - k : k) * (PW - 120), y: 40 }; } return { x: PW / 2 + Math.sin(t * 0.7) * 60, y: Math.min(60, -24 + t * 45) }; },
    attacks: [
      (h, x, y) => { shot(h, x - 10, y + 8, Math.PI / 2, bsp(h) * 1.4, W); shot(h, x + 10, y + 8, Math.PI / 2, bsp(h) * 1.4, W); shot(h, x, y, aim(h, x, y), bsp(h), R); return 0.11; },
      (h, x, y, S) => { for (const s of [-1, 1]) fan(h, x + s * 16, y + 4, aim(h, x + s * 16, y), 3, bsp(h) * 1.25, 0.12, R); return 0.34; },
      (h, x, y, S) => { const a = S.t * 5; for (let k = 0; k < 6; k++) shot(h, x, y, a + k * TAU / 6, bsp(h) * 0.85, k % 2 ? R : W); if (Math.floor(S.t / 0.2) % 3 === 0) fan(h, x, y, aim(h, x, y), 3, bsp(h) * 1.2, 0.14, R); return 0.2; },
    ] },
  { // 11 VESPER: one-eyed sniper platform; telegraphed rail lines, scatter, crossfire
    name: "CYCLOPS SNIPER", pal: ["#28060a", "#4a0c14", R, Y], w: 44, h: 30, hp: 0.91, rate: 1.12, spd: 0.75, hit: { rx: 16, ry: 11 },
    shape: (u, v) => inE(u, v, 0, 0.42, 0.62, 0.38) ? (inE(u, v, 0, 0.42, 0.28, 0.2) ? (inE(u, v, 0, 0.42, 0.1, 0.07) ? 2 : 3) : 1) : (u < 0.08 && v >= 0.75) ? 1 : (v > 0.3 && v < 0.5 && u > 0.6 && u < 1) ? 2 : 0,
    move: hover(PW / 2, 60, 52, 0.5),
    attacks: [
      (h, x, y, S) => { const a = aim(h, x, y); tele(S, x, y, x + Math.cos(a) * 400, y + Math.sin(a) * 400, 0.65, R); later(S, 0.65, () => { for (let i = 0; i < 8; i++) shot(h, x, y, a, bsp(h) * (1.7 + i * 0.18), Y); }); fan(h, x, y, a + Math.PI * 0.0, 5, bsp(h) * 0.8, 0.35, R); return 0.85; },
      (h, x, y) => { fan(h, x, y, aim(h, x, y), 7, bsp(h) * 1.05, 0.18, R); return 0.5; },
      (h, x, y, S) => { const tx = h.px, ty = h.py; for (const [sx, sy] of [[0, ty], [PW, ty], [tx, 0], [rnd(0, PW), 0]]) shot(h, sx, sy, Math.atan2(ty - sy, tx - sx), bsp(h) * 0.9, Y); shot(h, x, y, aim(h, x, y), bsp(h) * 1.3, R); return 0.45; },
    ] },
  { // 12 JINX: nitro racer; zig-zag boosts leaving exhaust trails, burst rings
    name: "NITRO DEMON", pal: ["#282006", "#504010", Y, C], w: 46, h: 24, hp: 0.57, rate: 1.17, spd: 1.60, hit: { rx: 17, ry: 9 },
    shape: (u, v) => (v > 0.2 && v < 0.8 && u < 0.85 - Math.abs(v - 0.5) * 0.5) ? ((u < 0.3 && v > 0.3 && v < 0.5) ? 3 : (Math.floor(u * 6) === 3 ? 2 : 1)) : (v >= 0.8 && u > 0.35 && u < 0.75) ? 2 : (u >= 0.85 && v > 0.4 && v < 0.6) ? 2 : 0,
    move: (S, h, t) => ({ x: PW / 2 + Math.sin(t * 1.0) * 62, y: Math.min(52, -24 + t * 45) + Math.sin(t * 3.4) * 10 }),
    attacks: [
      (h, x, y) => { h.eb.push({ x: x - 8, y: y + 10, vx: rnd(-6, 6), vy: 32 + h.ramp * 8, r: 2, col: C }, { x: x + 8, y: y + 10, vx: rnd(-6, 6), vy: 32 + h.ramp * 8, r: 2, col: C }); return 0.16; },
      (h, x, y, S) => { ring(h, x, y, 14, bsp(h) * 0.9, Y, S.t); return 0.75; },
      (h, x, y) => { fan(h, x, y, aim(h, x, y), 2, bsp(h) * 1.35, 0.1, Y); h.eb.push({ x, y: y + 10, vx: 0, vy: 30 + h.ramp * 8, r: 2, col: C }); return 0.17; },
    ] },
  { // 13 CINDER: inferno core; fire spirals, heat rings, ember rain
    name: "INFERNO CORE", pal: ["#300a04", "#601808", O, Y], w: 40, h: 34, hp: 1.04, rate: 0.92, spd: 1.35, hit: { rx: 15, ry: 13 },
    shape: (u, v) => inE(u, v, 0, 0.5, 0.75, 0.42) ? (inE(u, v, 0, 0.5, 0.35, 0.2) ? 3 : (Math.floor((u + v) * 7) % 2 ? 2 : 1)) : (Math.abs(Math.atan2(v - 0.5, u) * 3) % 1 < 0.35 && inE(u, v, 0, 0.5, 1, 0.5)) ? 2 : 0,
    move: hover(PW / 2, 50, 58, 0.5),
    attacks: [
      (h, x, y, S) => { const a = S.t * 2.2; shot(h, x, y, a, bsp(h) * 0.9, O); shot(h, x, y, a + Math.PI, bsp(h) * 0.9, Y); if (Math.floor(S.t / 0.1) % 5 === 0) fan(h, x, y, aim(h, x, y), 3, bsp(h) * 1.15, 0.16, Y); return 0.1; },
      (h, x, y, S) => { ring(h, x, y, 18, bsp(h) * 0.75, O, S.t); shot(h, x, y, aim(h, x, y), bsp(h) * 1.2, Y); return 1.0; },
      (h, x, y) => { h.eb.push({ x: rnd(0, PW), y: -4, vx: rnd(-15, 15), vy: bsp(h) * rnd(0.6, 0.9), r: 2, col: O }); if (Math.random() < 0.25) fan(h, x, y, aim(h, x, y), 3, bsp(h) * 1.1, 0.2, Y); return 0.07; },
    ] },
  { // 14 VULCAN: magma colossus; crater eruptions, warned meteor rocks, sweeping lava flows
    name: "MAGMA COLOSSUS", pal: ["#2a0c06", "#4a1c10", "#ff6020", Y], w: 50, h: 34, hp: 1.11, rate: 1.32, spd: 1.3, hit: { rx: 19, ry: 13 },
    shape: (u, v) => inE(u, v, 0, 0.16, 0.26, 0.16) ? ((u > 0.08 && u < 0.18 && v > 0.12 && v < 0.2) ? 3 : 1)
      : inE(u, v, 0, 0.62, 0.22, 0.14) ? 3
      : (v > 0.28 && v < 0.98 && u < 0.5 + (v - 0.28) * 0.55) ? ((Math.abs(Math.sin(u * 13 + v * 9)) < 0.22 || Math.abs(Math.sin(u * 7 - v * 15)) < 0.12) ? 2 : 1)
      : (v > 0.3 && v < 0.82 && u > 0.8 && u < 0.98) ? (v > 0.7 ? 2 : 1) : 0,
    move: hover(PW / 2, 46, 56, 0.35),
    attacks: [
      (h, x, y, S) => { ring(h, x, y - 6, 14, bsp(h) * 0.8, "#ff6020", S.t * 0.9); later(S, 0.25, () => ring(h, x, y - 6, 14, bsp(h) * 0.65, Y, S.t * 0.9 + 0.22)); return 1.1; },
      (h, x, y, S) => { const tx = Math.max(8, Math.min(PW - 8, h.px + rnd(-30, 30))); tele(S, tx, 0, tx, 340, 0.8, "#ff6020");
        later(S, 0.8, () => { const r = shot(h, tx, -6, Math.PI / 2, bsp(h) * 2.4, "#ff6020", 4.5); later(S, 0.55, () => { if (r.y < 330) { ring(h, r.x, r.y, 7, bsp(h) * 0.7, Y, rnd(0, 1)); r.y = 999; } }); });
        fan(h, x, y, aim(h, x, y), 3, bsp(h) * 1.1, 0.18, Y); return 0.75; },
      (h, x, y, S) => { const a = Math.PI / 2 + Math.sin(S.t * 1.6) * 1.0; shot(h, x - 12, y + 10, a, bsp(h) * 0.85, "#ff6020", 3); shot(h, x + 12, y + 10, Math.PI - a, bsp(h) * 0.85, O, 3); return 0.11; },
    ] },
];

export function newFBState(): FBState {
  return { t: 0, cd: 1.5, ph: 0, q: [], tele: [], clones: [], open: false, vis: 1, lpx: 0, lpy: 0, pvx: 0, pvy: 0, ax: PW / 2, ay: 60, bx: PW / 2, by: 60, moveT: 0, side: 1 };
}
/** Tunable global rate (tests / balancing). */
export const FB_TUNE = { rate: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] };
/** Advance one boss: returns its position. hpFrac drives the enrage (+25% fire rate under half HP). */
export function stepFinal(def: FBDef, idx: number, S: FBState, h: FBHost, dt: number, hpFrac: number) {
  S.t += dt; const t = S.t; SPD = def.spd ?? 1;
  S.pvx = S.pvx * 0.8 + ((h.px - S.lpx) / Math.max(dt, 1e-3)) * 0.2; S.pvy = S.pvy * 0.8 + ((h.py - S.lpy) / Math.max(dt, 1e-3)) * 0.2; S.lpx = h.px; S.lpy = h.py;
  const p = def.move(S, h, t);
  for (const c of S.clones) c.life -= dt; S.clones = S.clones.filter(c => c.life > 0);
  for (const l of S.tele) l.life -= dt; S.tele = S.tele.filter(l => l.life > 0);
  const due = S.q.filter(q => q.at <= t); S.q = S.q.filter(q => q.at > t); for (const q of due) q.fn();
  S.cd -= dt * (hpFrac < 0.5 ? 1.25 : 1) * (def.rate ?? 1) * FB_TUNE.rate[idx];
  if (S.cd <= 0 && t > 1.6) { const n = def.attacks.length, k = Math.floor(t / (def.phaseLen ?? 4)) % n; S.cd += def.attacks[k](h, p.x, p.y, S, k); if (S.cd < -0.5) S.cd = 0; }
  return p;
}

/** Neon sprite from a mirrored shape function: outline bright, body dark with dithering, accents, white core. */
const sprCache: HTMLCanvasElement[] = [];
export function finalSprite(i: number) {
  if (sprCache[i]) return sprCache[i];
  const d = FINAL_BOSSES[i], { w, h } = d, [dk, md, br, ac] = d.pal;
  const grid: number[][] = [];
  for (let y = 0; y < h; y++) { grid.push([]); for (let x = 0; x < w; x++) { const u = Math.abs(x - (w - 1) / 2) / (w / 2), v = y / (h - 1); grid[y].push(d.shape(u, v) | 0); } }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : grid[y][x]);
  return (sprCache[i] = drawSprite(w, h, g => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = grid[y][x]; if (!c) continue;
      const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      g.fillStyle = edge ? br : c === 3 ? (y % 2 ? ac : W) : c === 2 ? ac : ((x + y) % 2 && y % 3 === 0 ? md : (y < h * 0.35 ? md : dk));
      g.fillRect(x, y, 1, 1);
    }
  }));
}
