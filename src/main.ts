import { drawText, textWidth } from "./font";
import { Audio, renderMusicPreview, TRACKS } from "./audio";
import { DUEL_HP } from "./sim";
import { FINAL_BOSSES, FINAL_HP, FBState, FB_TUNE, newFBState, stepFinal, finalSprite } from "./finalboss";
import { fxCfg, saveFx, STAGE_PAL, STAGE_TINT, STAGE_HUE, nebulaTile, fortressTile, coreTile, scrollTile, cycleRect, cometRect, bloom, rasterWave, presentCRT } from "./fx";
import { LocalSimTransport, Transport, NetEvent, PlayerInfo, MAX_PLAYERS, chooseTransport, Snap } from "./net";
import { PILOT_NAMES, PILOT_BIOS, PILOT_COUNT, RANDOM_PILOT, loadPilotChoice, savePilotChoice, resolvePilot, pilotForName, validPilot, drawPilot } from "./pilots";
import { ACTIONS, Act, Dev, binds, bind, clearBind, resetBinds, codeName, actName, actDown, actHit, actVal, keys, pressed, typed, pad, pollPadState, RESERVED } from "./input";
import { makeSprite, drawSprite, SHIP, SAUCER, BUG, SAUCER_UP1, SAUCER_UP2, BUG_UP1, BUG_UP2, BOSS, BADGE, SERP_HEAD, SERP_SEG } from "./sprites";

// ---------- constants ----------
const W = 640, H = 360;
const LB_ROWS = 23;
const PX = 184, PY = 4, PW = 272, PH = 324; const BY = PY + PH + 3; // bottom HUD strip // playfield
const COLORS = ["#ff3cc8", "#3cf0ff", "#ffe040", "#60ff80"];
const COLOR_NAMES = ["MAGENTA", "CYAN", "GOLD", "LIME"];
const SENT = 4; const SENT_COL = "#ff5050";
const MENU_STATES: string[] = ["title", "name", "pilot", "controls", "lobby"];
const PILOT_COLS = 4; // pilot-select grid columns (15 pilots + RANDOM = 4x4)
const MAG = "#ff3cc8", CYA = "#3cf0ff", YEL = "#ffe040", WHT = "#ffffff", DIM = "#2a1440";
const CELL_W = 16, CELL_H = 32;
/** Attack tier thresholds (chain size): >= WAVE_AT sends a bullet wave, reaching BOSS_AT auto-sends a mini-boss. */
const WAVE_AT = 15, BOSS_AT = 40;
const MODES = ["RANDOM", "KOS", "ATTACKERS", "BADGES"];

// Game renders to a fixed 640x360 offscreen canvas; present() scales it to fill the window (any zoom / DPR).
const display = document.getElementById("game") as HTMLCanvasElement;
const dctx = display.getContext("2d")!;
const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
const ctx = canvas.getContext("2d")!; ctx.imageSmoothingEnabled = false;
const mid = document.createElement("canvas"); const mctx = mid.getContext("2d")!; // integer pre-upscale
const view = { scale: 1, x: 0, y: 0, w: W, h: H, k: 1, dpr: 1 };
function fit() {
  const dpr = window.devicePixelRatio || 1, cw = Math.max(1, Math.round(innerWidth * dpr)), ch = Math.max(1, Math.round(innerHeight * dpr));
  display.style.width = innerWidth + "px"; display.style.height = innerHeight + "px";
  if (display.width !== cw) display.width = cw; if (display.height !== ch) display.height = ch;
  const sc = Math.min(cw / W, ch / H), w = Math.round(W * sc), h = Math.round(H * sc);
  const k = Math.max(1, Math.ceil(sc)); if (mid.width !== W * k) { mid.width = W * k; mid.height = H * k; }
  Object.assign(view, { scale: sc, w, h, x: Math.floor((cw - w) / 2), y: Math.floor((ch - h) / 2), k, dpr });
  (window as any).__view = { ...view, cw, ch, fill: Math.max(w / cw, h / ch) };
}
function present() {
  mctx.imageSmoothingEnabled = false; mctx.drawImage(canvas, 0, 0, mid.width, mid.height); // crisp integer upscale
  dctx.fillStyle = "#000"; dctx.fillRect(0, 0, display.width, display.height); // letterbox
  if (fxCfg.crt) { presentCRT(dctx, mid, view.x, view.y, view.w, view.h, H); return; }
  dctx.imageSmoothingEnabled = view.k !== view.scale; dctx.imageSmoothingQuality = "high"; // slight final fit only
  dctx.drawImage(mid, view.x, view.y, view.w, view.h);
}
let dprMq: MediaQueryList | null = null;
function watchDpr() { dprMq?.removeEventListener("change", onDpr); dprMq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`); dprMq.addEventListener("change", onDpr); }
function onDpr() { fit(); watchDpr(); }
addEventListener("resize", fit); fit(); watchDpr();

const audio = new Audio();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const ri = (a: number, b: number) => Math.floor(rnd(a, b + 1));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Power-up type weights for the 6% per-kill drop (must sum to 100). */
const POWERUP_WEIGHTS: [string, number][] = [["W", 28], ["B", 18], ["G", 18], ["F", 18], ["S", 18]]; // G shield (guard), S special
/** Special power-up (S): the weapon depends on the pilot flown. 0 LIGHTNING, 1 INFERNO, 2 STORM BLADES. */
const SPECIALS = [{ name: "LIGHTNING", hud: "ZAP", col: "#3cf0ff" }, { name: "INFERNO", hud: "FIRE", col: "#ff9030" }, { name: "STORM BLADES", hud: "BLADE", col: "#ffffff" }];
//                    KAGE VOSS SABLE IRONCLAD HEX ZORUK WRAITH FANG MARISOL BRICK TALON VESPER JINX CINDER
export const PILOT_SPECIAL = [2, 0, 2, 0, 0, 1, 0, 2, 0, 1, 2, 2, 1, 1, 1];
const SPECIAL_SECS = 5;
function pickPowerup() { let r = Math.random() * 100; for (const [k, w] of POWERUP_WEIGHTS) { if ((r -= w) < 0) return k; } return "W"; }
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

// ---------- sprites ----------
const shipSpr = makeSprite(SHIP, { c: CYA, w: WHT, m: MAG, y: YEL });
const allCols = [...COLORS, SENT_COL];
function dark(c: string) { return c.replace(/^#(..)(..)(..)$/, (_, r, g, b) => "#" + [r, g, b].map(h => Math.floor(parseInt(h, 16) * 0.4).toString(16).padStart(2, "0")).join("")); }
const saucerSpr = allCols.map(c => makeSprite(SAUCER, { x: c, w: WHT, d: dark(c) }));
const bugSpr = allCols.map(c => makeSprite(BUG, { x: c, w: WHT, d: dark(c) }));
const PLATE = "#8c90b8", allW = (rows: string[]) => makeSprite(rows, { x: WHT, w: WHT, d: WHT, a: WHT });
/** [tier][saucer|bug][colour] sprites for normal / armored / spiked enemies, plus white hit-flash silhouettes. */
const enemySpr = [[SAUCER, BUG], [SAUCER_UP1, BUG_UP1], [SAUCER_UP2, BUG_UP2]].map(t => t.map(rows => allCols.map(c => makeSprite(rows, { x: c, w: WHT, d: dark(c), a: PLATE }))));
const enemyFlash = [[SAUCER, BUG], [SAUCER_UP1, BUG_UP1], [SAUCER_UP2, BUG_UP2]].map(t => t.map(allW));
/** Upgrade odds by match time: tier 1 from 1:00 (20%) to ~85% at 4:00; tier 2 (spiked) takes over from 4:00. */
export function upgradeTier(t: number) {
  if (t < 60) return 0; const up = Math.min(0.85, 0.2 + (t - 60) / 180 * 0.65), t2 = t < 240 ? 0 : Math.min(0.6, (t - 240) / 150 * 0.6);
  const r = Math.random(); return r < up * t2 ? 2 : r < up ? 1 : 0;
}
const UP_HP = [1, 3, 5];
const bossSpr = makeSprite(BOSS, { x: SENT_COL, w: "#ffd0d0", k: "#400010", y: YEL });
const badgeSpr = makeSprite(BADGE, { y: YEL, w: WHT });
// stage backgrounds (generated once)
const nebTile = nebulaTile(272, 400), fortFar = fortressTile(272, 420, false), fortNear = fortressTile(272, 384, true), coreT = coreTile(272, 420);
const BG_TARGET = [[1, 0, 0, 0, 0], [0.4, 1, 0, 0, 0], [0, 0.7, 1, 0, 0], [0, 0.25, 1, 1, 0], [0, 0, 0, 0.55, 1]]; // [band, nebula, fortress far, fortress near, core]
const PILOT = ["....mmmmmm....", "..mmmmmmmmmm..", ".mmwmmmmmmmmm.", ".mmccccccccmm.", "mmcwwcccccccmm", "mmccwccccccdmm", "mmccccccccddmm", ".mmccccccddmm.",
  ".mmmmmmmmmmmm.", "..mkkkyykkkm..", "..mkkkkkkkkm..", "...mmmmmmmm...", "..dmmmmmmmmd..", ".ddddmmmmdddd."];
const pilotSpr = makeSprite(PILOT, { m: MAG, w: WHT, c: CYA, d: "#601060", k: "#200828", y: YEL });
const BOSS_NAMES = ["SAUCER", "SERPENT", "FORTRESS", "PHANTOM"];
const serpHeadSpr = makeSprite(SERP_HEAD, { x: CYA, w: WHT, k: "#002030", y: YEL });
const serpSegSpr = makeSprite(SERP_SEG, { x: CYA, m: MAG, w: WHT });
const fortSpr = drawSprite(56, 16, g => {
  g.fillStyle = "#1c5a30"; g.fillRect(2, 4, 52, 9); g.fillStyle = "#60ff80"; g.fillRect(0, 6, 56, 3); g.fillRect(6, 2, 44, 2); g.fillRect(4, 12, 48, 2);
  g.fillStyle = "#0a2a14"; for (let i = 0; i < 6; i++) g.fillRect(9 + i * 7, 9, 3, 2);
  g.fillStyle = YEL; for (const x of [3, 52]) g.fillRect(x, 13, 1, 3); g.fillStyle = WHT; g.fillRect(14, 6, 2, 1); g.fillRect(40, 6, 2, 1);
});
const phantomSpr = drawSprite(21, 21, g => {
  for (let y = 0; y < 21; y++) { const hw = 10 - Math.abs(y - 10); g.fillStyle = MAG; g.fillRect(10 - hw, y, hw * 2 + 1, 1); if (hw > 2) { g.fillStyle = "#5a0a50"; g.fillRect(12 - hw, y, Math.max(0, hw * 2 - 3), 1); } }
  g.fillStyle = WHT; g.fillRect(10, 0, 1, 3); g.fillRect(10, 18, 1, 3); g.fillRect(0, 10, 3, 1); g.fillRect(18, 10, 3, 1);
});

// ---------- input (rebindable, see src/input.ts) ----------
addEventListener("keydown", e => { typed.push(e.code); if (typed.length > 32) typed.shift(); if (!keys.has(e.code)) pressed.add(e.code); keys.add(e.code);
  if (e.code.startsWith("Arrow") || e.code === "Space" || e.code === "Tab") e.preventDefault(); audio.init(); });
addEventListener("keyup", e => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
// ---------- gamepad (standard mapping, Xbox labels) ----------
let onPad: (c: boolean) => void = () => {};
addEventListener("gamepadconnected", () => audio.init());
/** Fixed menu aliases (not rebindable): A confirm, B back, Y controls, LB/RB tabs / spectate switch, Start, D-pad + left stick navigation. */
const MENU: [string, string][] = [["B0", "PadA"], ["B1", "PadB"], ["B2", "PadX"], ["B3", "PadY"], ["B4", "PadLB"], ["B5", "PadRB"], ["B9", "PadStart"], ["B8", "PadSelect"],
  ["B12", "PadUp"], ["B13", "PadDown"], ["B14", "PadLeft"], ["B15", "PadRight"], ["A1-", "PadUp"], ["A1+", "PadDown"], ["A0-", "PadLeft"], ["A0+", "PadRight"]];
function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp: Gamepad | null = null; for (const p of pads) if (p && p.connected) { gp = p; break; }
  pollPadState(gp);
  if (!gp) { if (pad.connected) { pad.connected = false; onPad(false); } return; }
  if (!pad.connected) { pad.connected = true; onPad(true); }
  for (const [c, m] of MENU) if (pressed.has(c)) pressed.add(m);
}
const down = (...c: string[]) => c.some(k => keys.has(k) || pad.held.has(k));
const hit = (...c: string[]) => c.some(k => pressed.has(k));
const kn = (a: Act) => actName("key", a), pn = (a: Act) => actName("pad", a);

// ---------- types ----------
interface Rival { id: number; name: string; isBot: boolean; avatar: number; alive: boolean; hp: number; badges: number; skill: number; target: number; retarget: number; sendCd: number;
  flash: number; place: number; regen: number; seed: number; col: number; koT: number; ai: number; koBy: number; }
interface Enemy { fb?: FBState; fp?: number; x: number; y: number; t: number; delay: number; path: number; x0: number; y0: number; idx: number; hp: number; col: number; form: number;
  fireCd: number; spr: number; up?: number; hf?: number; entered: boolean; dead: boolean; boss?: boolean; maxhp?: number; sender?: number; vx?: number;
  uid?: number; bv?: number; hist?: { x: number; y: number }[]; segs?: { x: number; y: number }[]; tur?: number[]; turMax?: number; cyc?: number; vis?: number; eye?: boolean; tx?: number; ty?: number; }
interface Formation { id: number; total: number; killed: number; lost: boolean; sent: boolean; sender: number; done: boolean; }
interface Bullet { x: number; y: number; vx: number; vy: number; r: number; grazed?: boolean; col: string; dmg?: number; }
interface Item { x: number; y: number; vx: number; vy: number; kind: string; t: number; }
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; s: number; g?: number; }
interface Proj { variant?: number; sx: number; sy: number; ex: number; ey: number; t: number; dur: number; out: boolean; tier: number; power: number; target: number; sender: number; col: string; }
interface Popup { text: string; x: number; y: number; t: number; col: string; scale: number; ui?: boolean; }
interface Warn { variant?: number; t: number; tier: number; power: number; sender: number; x: number; }
interface Wave { t: number; dur: number; power: number; acc: number; pat: number; }

type State = "title" | "name" | "pilot" | "lobby" | "play" | "over" | "win" | "controls";
const SNAP_COLS = [SENT_COL, MAG, YEL, CYA, WHT, "#60ff80"], SNAP_ITEMS = ["dot", "W", "B", "G", "F", "S", "badge", "star"];

class Game {
  state: State = "title"; time = 0; realT = 0;
  rivals: Rival[] = []; enemies: Enemy[] = []; forms: Formation[] = []; pb: Bullet[] = []; eb: Bullet[] = [];
  items: Item[] = []; parts: Part[] = []; uiParts: Part[] = []; projs: Proj[] = []; popups: Popup[] = []; warns: Warn[] = []; waves: Wave[] = [];
  bgStars: { x: number; y: number; z: number }[] = []; streaks: { x: number; y: number; vx: number; vy: number; life: number; col: string; big: boolean }[] = [];
  px = PW / 2; py = PH - 40; hp = 3; inv = 0; regen = 20; weapon = 0; shield = false; bombs = 3; dots = 0; fireCd = 0; focus = false;
  score = 0; badges = 0; starBoost = 0; kos = 0; place = 0; mode = 0; targets: number[] = []; randTarget = -1; randCd = 0;
  chain = 0; chainCol = -1; chainT = 0; chainMax = 2.6; eligible = false; freeze = 0; chainPulse = 0; grazes = 0; bestChain = 0;
  formCd = 2; formId = 0; shake = 0; hitstop = 0; slow = 0; flash = 0; flashCol = WHT; duel = false; dead = false; endT = 0; paused = false;
  lowWarn = 0; tripleQ: number[] = []; bombCol = MAG; bombAt: { x: number; y: number } | null = null; zapT = 0; zapCd = 0; bolts: { pts: { x: number; y: number }[]; life: number }[] = []; bombFx = 0; titleT = 0;
  specKind = 0; specKills = 0; inSpecial = false; ringA = 0; ringCd = 0;
  flames: { x: number; y: number; vx: number; vy: number; life: number }[] = []; blasts: { x: number; y: number; life: number }[] = [];
  blades: { x: number; y: number; vx: number; vy: number; life: number; pierce: number; hits: Enemy[]; a: number }[] = [];
  finalQ: { t: number; pilot: number; sender: number; again: boolean } | null = null;
  /** Test/benchmark hook: drives the ship instead of the input devices. */
  bot: ((g: Game) => { dx: number; dy: number; fire: boolean; focus: boolean }) | null = null;
  constructor() { for (let i = 0; i < 90; i++) this.bgStars.push({ x: Math.random() * PW, y: Math.random() * PH, z: rnd(0.2, 1) }); }

  reset(players: PlayerInfo[]) {
    Object.assign(this, { time: 0, enemies: [], forms: [], pb: [], eb: [], items: [], parts: [], uiParts: [], projs: [], popups: [], warns: [], waves: [], streaks: [],
      px: PW / 2, py: PH - 40, hp: 3, inv: 2, regen: 20, weapon: 0, shield: false, bombs: 3, dots: 0, score: 0, badges: 0, starBoost: 0, kos: 0, myKos: 0, myKoBy: -2, lbScroll: 0, lbRep: 0, place: 0,
      zapT: 0, zapCd: 0, bolts: [], flames: [], blasts: [], blades: [], finalQ: null, specKills: 0, tripleQ: [], bombAt: null, chain: 0, chainCol: -1, chainT: 0, eligible: false, freeze: 0, grazes: 0, bestChain: 0, formCd: 2, shake: 0, hitstop: 0, slow: 0, duel: false, dead: false, randTarget: -1, randCd: 0, endT: 0, bombFx: 0 });
    this.rivals = [];
    for (let i = 0; i < 100; i++) { const pl = players[i] || { id: i, name: "BOT", isBot: true };
      this.rivals.push({ id: i, name: pl.name, isBot: pl.isBot, avatar: validPilot(pl.avatar) ?? pilotForName(pl.name), alive: true, hp: 3, badges: 0, skill: 0, target: -2, retarget: 0, sendCd: 0, flash: 0, place: 0, regen: 0, seed: Math.random() * 100, col: Math.floor(Math.random() * 4), koT: 0, ai: 0, koBy: -2 }); }
    this.state = "play"; this.spec = -1; this.specSnaps = []; this.specLb = false; this.watched = false; this.ctlBind = null; audio.init(); audio.updateMusic({ remaining: 101, duel: false, lowHealth: false, hp: 3, bombs: 3, chain: 0, tripleReady: false }); audio.startMusic();
    this.popup("STAGE START!", PW / 2, PH / 2 - 20, YEL, 3);
  }
  // ---------- network / lobby ----------
  net: Transport = new LocalSimTransport(); netMsg = ""; padMsgT = 0; padMsg = "";
  name = (() => { const q = new URLSearchParams(location.search).get("name"); if (q) return q.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "PILOT";
    try { let n = localStorage.getItem("sf101name"); if (!n) { n = "PILOT" + Math.floor(Math.random() * 90 + 10); localStorage.setItem("sf101name", n); } return n; } catch { return "PILOT"; } })();
  attackLog: { from: string; tier: number; t: number }[] = [];
  setNet(t: Transport) { this.net = t; t.on(e => { if (this.net === t) this.onNet(e); }); } lobbyLog: string[] = []; lobbyCount = 0; lobbyCd = -1; lastAttacker = -2; lobbyHumans = 0; lobbyVoted = false;
  bindNet() { this.setNet(this.net); }
  // ---------- pilot name entry (keyboard typing + controller letter picker) ----------
  bgW = [1, 0, 0, 0, 0]; ripples: { x: number; y: number; t: number; gold: boolean }[] = []; cutIn: { t: number; name: string; title?: string; sub?: string; boss?: number; dur?: number } | null = null; warpT = 0;
  winStars: { x: number; y: number; sx: number; sy: number; at: number; col: string }[] = []; winT = 0; coreGrad: CanvasGradient | null = null;
  get vStage() { const r = this.remaining; return this.duel ? 4 : r > 75 ? 0 : r > 50 ? 1 : r > 25 ? 2 : r > 10 ? 3 : 4; }
  hue() { return STAGE_HUE[this.state === "play" || this.state === "over" || this.state === "win" ? this.vStage : 0]; }
  pal(col?: string) { const p = STAGE_PAL[this.state === "play" || this.state === "over" || this.state === "win" ? this.vStage : 1]; return col ? [col, p[0], p[1], col, p[2], p[3], col, p[4]] : p; }
  /** Saved pilot choice (RANDOM_PILOT = new pick each match) and the pilot flown this match. */
  pilotChoice = loadPilotChoice(); pilot = resolvePilot(this.pilotChoice); pilotSel = 0; pilotBack: "title" | "lobby" = "title";
  nameBuf: string[] = []; namePos = 0; myKos = 0; myKoBy = -2; lbScroll = 0; lbRep = 0;
  openName() { typed.length = 0; this.state = "name"; this.nameBuf = this.name.split("").slice(0, 10); this.namePos = this.nameBuf.length; audio.init(); }
  updateName() {
    const CH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", b = this.nameBuf, beep = (f: number) => audio.tone(f, 0.04, "square", 0.06);
    for (const c of typed.splice(0)) {
      const ch = /^Key[A-Z]$/.test(c) ? c[3] : /^(Digit|Numpad)[0-9]$/.test(c) ? c.slice(-1) : "";
      if (ch && this.namePos < 10) { b[this.namePos++] = ch; beep(880); }
      if (c === "Backspace" && this.namePos > 0) { b.splice(--this.namePos, 1); beep(330); }
    }
    if (hit("PadB") && this.namePos > 0) { b.splice(--this.namePos, 1); beep(330); }
    if (hit("ArrowLeft", "PadLeft")) this.namePos = Math.max(0, this.namePos - 1);
    if (hit("ArrowRight", "PadRight", "PadA") && this.namePos < b.length && this.namePos < 9) { this.namePos++; beep(660); }
    const cyc = (hit("ArrowUp", "PadUp") ? 1 : 0) - (hit("ArrowDown", "PadDown") ? 1 : 0);
    if (cyc && this.namePos < 10) { const cur = b[this.namePos]; b[this.namePos] = cur ? CH[(CH.indexOf(cur) + cyc + CH.length) % CH.length] : cyc > 0 ? "A" : "9"; beep(520); }
    if (hit("Escape")) { this.state = "title"; return; }
    if (hit("Enter", "PadStart") && b.length) { this.name = b.join(""); try { localStorage.setItem("sf101name", this.name); } catch { /* private mode */ } this.openPilot("lobby"); }
  }
  renderName() {
    const w = 330, h = 120, x = (W - w) / 2, y = 175; ctx.fillStyle = "rgba(6,2,14,0.94)"; ctx.fillRect(x, y, w, h); this.frame(x, y, w, h, MAG);
    drawText(ctx, "ENTER PILOT NAME", W / 2, y + 10, YEL, 2, "center");
    const sw = 26, x0 = W / 2 - sw * 5, blink = Math.floor(this.realT * 4) % 2;
    for (let i = 0; i < 10; i++) {
      const cx = x0 + i * sw, cur = i === this.namePos;
      ctx.fillStyle = cur ? "#3a1060" : "#140628"; ctx.fillRect(cx + 2, y + 34, sw - 4, 30);
      ctx.fillStyle = cur && blink ? YEL : i < this.nameBuf.length ? CYA : DIM; ctx.fillRect(cx + 2, y + 62, sw - 4, 2);
      if (this.nameBuf[i]) drawText(ctx, this.nameBuf[i], cx + sw / 2, y + 40, cur ? YEL : WHT, 3, "center");
      if (cur) { ctx.fillStyle = YEL; ctx.fillRect(cx + sw / 2 - 2, y + 29, 5, 2); ctx.fillRect(cx + sw / 2 - 1, y + 27, 3, 2); ctx.fillRect(cx + sw / 2 - 2, y + 67, 5, 2); ctx.fillRect(cx + sw / 2 - 1, y + 69, 3, 2); }
    }
    drawText(ctx, "KEYBOARD: TYPE A-Z 0-9   BACKSPACE DELETE   ENTER CONFIRM", W / 2, y + 80, CYA, 1, "center");
    drawText(ctx, "PAD: D-PAD UP/DOWN LETTER  LEFT/RIGHT MOVE  A NEXT  B DELETE  START OK", W / 2, y + 92, "#b080ff", 1, "center");
    drawText(ctx, "SAVED ON THIS DEVICE - USED ONLINE AND OFFLINE", W / 2, y + 106, "#8070b0", 1, "center");
  }
  openPilot(back: "title" | "lobby") { this.state = "pilot"; this.pilotBack = back; this.pilotSel = this.pilotChoice === RANDOM_PILOT ? PILOT_COUNT : this.pilotChoice; audio.init(); }
  updatePilot() {
    const n = PILOT_COUNT + 1, cols = PILOT_COLS, beep = (f: number) => audio.tone(f, 0.04, "square", 0.06);
    const dx = (hit("ArrowRight", "KeyD", "PadRight") ? 1 : 0) - (hit("ArrowLeft", "KeyA", "PadLeft") ? 1 : 0);
    const dy = (hit("ArrowDown", "KeyS", "PadDown") ? 1 : 0) - (hit("ArrowUp", "KeyW", "PadUp") ? 1 : 0);
    if (dx) { this.pilotSel = (this.pilotSel + dx + n) % n; beep(520); }
    if (dy) { const t = this.pilotSel + dy * cols; if (t >= 0 && t < n) { this.pilotSel = t; beep(520); } }
    if (hit("Escape", "PadB")) { this.state = this.pilotBack === "lobby" ? "name" : "title"; return; }
    if (hit("Enter", "Space", "KeyZ", "PadStart", "PadA")) {
      this.pilotChoice = this.pilotSel >= PILOT_COUNT ? RANDOM_PILOT : this.pilotSel; savePilotChoice(this.pilotChoice); beep(880);
      if (this.pilotBack === "lobby") this.startLobby(); else this.state = "title";
    }
  }
  renderPilot() {
    const n = PILOT_COUNT + 1, sel = this.pilotSel, rnd_ = sel >= PILOT_COUNT, blink = Math.floor(this.realT * 3) % 2 === 0, DIMT = "#8a7ab8";
    drawText(ctx, "CHOOSE YOUR PILOT", W / 2, 14, YEL, 3, "center", MAG);
    ctx.fillStyle = "rgba(13,10,34,0.92)"; ctx.fillRect(20, 40, 311, 262); this.frame(20, 40, 311, 262, CYA);
    for (let i = 0; i < n; i++) {
      // 15 pilots + RANDOM: 4 columns x 4 rows of 72x62 cards (76px column / 65px row pitch) inside the 311x262 panel
      const cx = 25 + (i % PILOT_COLS) * 76, cy = 45 + Math.floor(i / PILOT_COLS) * 65, on = i === sel, mx = cx + 33;
      ctx.fillStyle = on ? "#24104a" : "#120d2e"; ctx.fillRect(cx - 3, cy - 3, 72, 62); this.frame(cx - 3, cy - 3, 72, 62, on ? YEL : "#3a3070");
      if (i < PILOT_COUNT) { drawPilot(ctx, i, 48, mx - 24, cy, on ? CYA : "#3a3070"); drawText(ctx, PILOT_NAMES[i], mx, cy + 51, on ? WHT : DIMT, 1, "center"); }
      else { ctx.fillStyle = "#0c0824"; ctx.fillRect(mx - 24, cy, 48, 48); drawText(ctx, "?", mx, cy + 12, DIMT, 5, "center"); drawText(ctx, "RANDOM", mx, cy + 51, on ? WHT : DIMT, 1, "center"); }
      if (on && blink) { drawText(ctx, ">", cx - 1, cy + 21, YEL, 1); drawText(ctx, "<", cx + 61, cy + 21, YEL, 1); }
    }
    ctx.fillStyle = "rgba(13,10,34,0.92)"; ctx.fillRect(346, 40, 275, 262); this.frame(346, 40, 275, 262, MAG);
    const nm = rnd_ ? "RANDOM" : PILOT_NAMES[sel];
    if (rnd_) { ctx.fillStyle = "#05040c"; ctx.fillRect(358, 52, 140, 140); ctx.fillStyle = MAG; ctx.fillRect(359, 53, 138, 138); ctx.fillStyle = "#0c0824"; ctx.fillRect(360, 54, 136, 136); drawText(ctx, "?", 428, 92, DIMT, 12, "center"); }
    else drawPilot(ctx, sel, 136, 360, 54, MAG);
    drawText(ctx, nm, 508, 58, WHT, nm.length > 6 ? 2 : 3);
    (rnd_ ? ["A NEW PILOT", "EVERY MATCH."] : PILOT_BIOS[nm] ?? []).forEach((l, k) => drawText(ctx, l, 508, 84 + k * 10, DIMT, 1));
    // special weapon card: what the S pickup gives this pilot
    const sp = rnd_ ? null : SPECIALS[PILOT_SPECIAL[sel] ?? 0], col = sp ? sp.col : DIMT;
    drawText(ctx, "SPECIAL WEAPON", 360, 210, MAG, 1);
    ctx.fillStyle = "#0c0824"; ctx.fillRect(358, 222, 251, 66); this.frame(358, 222, 251, 66, col);
    ctx.fillStyle = "#05040c"; ctx.fillRect(366, 230, 50, 50); this.frame(366, 230, 50, 50, col);
    if (sp) { this.drawSpecialIcon(PILOT_SPECIAL[sel] ?? 0, 391, 255, col); drawText(ctx, sp.name, 426, 238, col, sp.name.length > 9 ? 2 : 3); drawText(ctx, "FROM THE S PICKUP", 426, 268, DIMT, 1); }
    else { drawText(ctx, "?", 391, 243, DIMT, 4, "center"); drawText(ctx, "?", 426, 238, DIMT, 3); drawText(ctx, "DEPENDS ON THE PILOT", 426, 268, DIMT, 1); }
    drawText(ctx, (pad.connected ? "D-PAD CHOOSE   A CONFIRM   B BACK" : "ARROWS CHOOSE   ENTER CONFIRM   ESC BACK"), W / 2, 312, CYA, 1, "center");
    drawText(ctx, "PLAYER NAME: " + this.name, W / 2, 330, YEL, 1, "center");
  }
  /** Small pixel icon for a special weapon, centred on (x, y): 0 lightning bolt, 1 fireball, 2 shuriken. */
  drawSpecialIcon(k: number, x: number, y: number, col: string) {
    ctx.save(); ctx.lineJoin = "miter"; ctx.lineCap = "square";
    if (k === 0) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x + 4, y - 16); ctx.lineTo(x - 9, y + 2); ctx.lineTo(x - 1, y + 2); ctx.lineTo(x - 5, y + 16); ctx.lineTo(x + 9, y - 3); ctx.lineTo(x + 1, y - 3); ctx.closePath(); ctx.fill(); ctx.strokeStyle = WHT; ctx.lineWidth = 1; ctx.stroke(); }
    else if (k === 1) { ctx.fillStyle = "#ff5020"; ctx.beginPath(); ctx.moveTo(x, y - 17); ctx.quadraticCurveTo(x + 13, y - 2, x + 10, y + 7); ctx.arc(x, y + 6, 10, 0.1, Math.PI - 0.1); ctx.quadraticCurveTo(x - 12, y - 4, x, y - 17); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y + 6, 7, 0, 6.283); ctx.fill(); ctx.fillStyle = YEL; ctx.beginPath(); ctx.arc(x, y + 7, 3.5, 0, 6.283); ctx.fill(); }
    else { ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.3, r = i % 2 ? 5 : 16; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.strokeStyle = MAG; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = "#05040c"; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 6.283); ctx.fill(); }
    ctx.restore();
  }
  koName(k: number) { return k === -1 ? this.name : k >= 0 ? this.rivals[k]?.name ?? "?" : "STARFALL"; }
  renderLeaderboard(win: boolean) {
    const x = PX, y = PY, w = PW, h = PH; ctx.fillStyle = "#06020e"; ctx.fillRect(x, y, w, h); this.frame(x, y, w, h, win ? YEL : MAG);
    drawText(ctx, win ? "VICTORY! #1 OF 101" : "GAME OVER  #" + this.place + " / 101", x + w / 2, y + 6, win ? YEL : MAG, 2, "center", "#000");
    drawText(ctx, "SCORE " + this.score + "  YOUR KOS " + this.myKos + "  BEST CHAIN " + this.bestChain, x + w / 2, y + 24, WHT, 1, "center");
    type Row = { place: number; name: string; tag: string; by: string; mine: boolean; me: boolean };
    const rows: Row[] = this.rivals.map(r => ({ place: r.alive ? 0 : r.place, name: r.name, tag: r.isBot ? "CPU" : "HUM", by: r.alive ? "STILL FLYING" : r.place === 1 ? "WINNER" : "KO BY " + this.koName(r.koBy), mine: !r.alive && r.koBy === -1, me: false }));
    rows.push({ place: win ? 1 : this.place, name: this.name, tag: "YOU", by: win ? "WINNER" : "KO BY " + this.koName(this.myKoBy), mine: false, me: true });
    rows.sort((a, b) => (a.place || 0) - (b.place || 0));
    const top = y + 36;
    drawText(ctx, "#    PILOT", x + 6, top, "#8070b0", 1); drawText(ctx, "KO'D BY", x + 150, top, "#8070b0", 1);
    rows.slice(this.lbScroll, this.lbScroll + LB_ROWS).forEach((r, i) => {
      const ry = top + 11 + i * 10;
      if (r.me) { ctx.fillStyle = Math.floor(this.realT * 3) % 2 ? "#5a1050" : "#401040"; ctx.fillRect(x + 3, ry - 2, w - 10, 10); }
      const c = r.me ? YEL : r.tag === "HUM" ? "#60ff80" : WHT;
      drawText(ctx, r.place ? String(r.place) : "--", x + 6, ry, c, 1);
      drawText(ctx, r.name, x + 30, ry, c, 1); drawText(ctx, r.tag, x + 96, ry, r.tag === "CPU" ? "#8070b0" : c, 1);
      drawText(ctx, r.by.slice(0, 18), x + 126, ry, r.mine ? YEL : r.place === 1 ? YEL : "#b080ff", 1);
      if (r.mine) ctx.drawImage(badgeSpr, x + w - 18, ry - 1);
    });
    const sbH = LB_ROWS * 10, th = Math.max(8, sbH * LB_ROWS / 101); ctx.fillStyle = DIM; ctx.fillRect(x + w - 5, top + 10, 2, sbH);
    ctx.fillStyle = CYA; ctx.fillRect(x + w - 5, top + 10 + Math.round((sbH - th) * this.lbScroll / (101 - LB_ROWS)), 2, th);
    this.renderEndMenu(x, y + h - 26, w);
    drawText(ctx, (pad.connected ? "STICK" : "UP/DOWN") + " SCROLL  " + (pad.connected ? "D-PAD" : "LEFT/RIGHT") + " PICK  " + this.endHint(), x + w / 2, y + h - 10, CYA, 1, "center");
    if (this.spec >= 0) drawText(ctx, (pad.connected ? "Y" : "L") + ": BACK TO SPECTATING " + (this.rivals[this.spec]?.name ?? ""), x + w / 2, y + h - 36, YEL, 1, "center");
    else if (this.state === "over" && this.net.online && !this.specIds().length && this.rivals.some(r => !r.isBot)) drawText(ctx, "NO HUMAN PILOTS LEFT TO SPECTATE", x + w / 2, y + h - 36, "#8070b0", 1, "center");
  }
  endSel = 0; pauseSel = 0;
  /** Leave the current lobby/match/spectating session and go back to the title screen (music reset, ready for a new match). */
  quitToTitle() {
    this.stopSpectate(); this.watched = false; this.net.leaveLobby();
    this.paused = false; this.dead = false; this.duel = false; this.endSel = 0; this.pauseSel = 0; this.titleSel = 0; this.lobbyVoted = false; this.lobbyCd = -1; this.cutIn = null;
    audio.stopMusic(); audio.setRemaining(101, false); keys.clear();
    this.state = "title"; this.titleT = 0; audio.tone(330, 0.04, "square", 0.06);
  }
  /** NEW MATCH / TITLE SCREEN selector drawn on all post-match screens. */
  renderEndMenu(x: number, y: number, w: number) {
    const items = ["NEW MATCH", "TITLE SCREEN"], bw = 84, gap = 8, x0 = x + (w - bw * 2 - gap) / 2;
    items.forEach((t, i) => { const bx = x0 + i * (bw + gap), sel = i === this.endSel, bl = sel && Math.floor(this.realT * 4) % 2;
      ctx.fillStyle = sel ? "#2a0838" : "#0c0418"; ctx.fillRect(bx, y, bw, 13); ctx.strokeStyle = sel ? (bl ? YEL : CYA) : DIM; ctx.strokeRect(bx + 0.5, y + 0.5, bw - 1, 12);
      drawText(ctx, (sel ? "> " : "") + t, bx + bw / 2, y + 4, sel ? YEL : "#8070b0", 1, "center"); });
  }
  endHint() { return pad.connected ? "A/START SELECT  B TITLE" : "ENTER SELECT  ESC TITLE"; }
  startLobby() { this.spec = -1; this.specSnaps = []; this.state = "lobby"; this.lobbyLog = []; this.lobbyCount = 0; this.lobbyCd = -1; this.lobbyHumans = 0; this.lobbyVoted = false; audio.init(); this.pilot = resolvePilot(this.pilotChoice); this.net.joinLobby(this.name, this.pilot); }
  onNet(e: NetEvent) {
    switch (e.type) {
      case "lobbyJoin": this.lobbyCount = e.count; if (!e.player.isBot) { this.lobbyHumans++; this.lobbyLog.push((e.player.id === this.net.localId ? e.player.name + " (YOU)" : e.player.name) + " JOINED"); } break;
      case "lobbyLeave": this.lobbyCount = e.count; this.lobbyHumans--; this.lobbyLog.push(e.name + " LEFT"); break;
      case "lobbyCountdown": this.lobbyCd = e.seconds; this.lobbyHumans = e.humans; break;
      case "matchStart": this.reset(e.players); break;
      case "state": if (this.state !== "play") break; for (const st of e.states) { const r = this.rivals[st.id]; if (r && r.alive) { r.hp = st.hp; r.badges = st.badges; r.target = st.target === this.net.localId ? -1 : -2; } } break;
      case "hit": { const r = this.rivals[e.id]; if (r) { r.flash = 0.4; } break; }
      case "ko": { const r = this.rivals[e.id]; if (!r || !r.alive) break; const by = e.by === this.net.localId ? -1 : e.by;
        if (this.state === "play" && !this.dead) this.koRival(r, by, e.place, e.badges);
        else { r.alive = false; r.hp = 0; r.place = e.place; r.koBy = by; r.koT = 1; r.badges = e.badges; }
        if (e.id === this.spec) { const n = this.specIds(); this.spec = -1; this.startSpectate(); this.specMsg = r.name + " IS OUT" + (this.spec >= 0 ? " - NOW WATCHING " + this.rivals[this.spec].name : ""); this.specMsgT = 2.5; void n; }
        break; } // keep the leaderboard filling after you are out
      case "attack": {
        if (e.to !== this.net.localId || this.dead || this.state !== "play") break;
        const cp = this.cellPos(e.from); this.lastAttacker = e.from; this.attackLog.push({ from: this.rivals[e.from]?.name || "?", tier: e.tier, t: this.time });
        this.projs.push({ sx: cp.x + CELL_W / 2, sy: cp.y + CELL_H / 2, ex: PX + PW / 2 + rnd(-60, 60), ey: PY + 10, t: 0, dur: 0.8, out: false, tier: e.tier, power: e.power, variant: e.variant, target: -1, sender: e.from, col: SENT_COL }); break;
      }
      case "snap": if (e.id === this.spec) this.addSnap(e.snap); break;
      case "watch": this.watched = e.on; this.snapT = 0; break;
      case "matchEnd": this.stopSpectate(); if (e.winner === this.net.localId && !this.dead && this.state === "play") { for (const r of this.rivals) r.alive = false; } break; // win resolves in updateRivals
      case "disconnected":
        this.spec = -1; this.specSnaps = []; this.watched = false; this.netMsg = "OFFLINE: " + e.reason; const was = this.state; this.setNet(new LocalSimTransport());
        if (was === "lobby") this.startLobby(); else if (was === "play" && !this.dead) { this.gameOver(); } break;
    }
  }
  get aliveAI() { let n = 0; for (const r of this.rivals) if (r.alive) n++; return n; }
  get remaining() { return this.aliveAI + (this.dead || this.viewing ? 0 : 1); }
  get calm() { return this.time < 90; }
  get ramp() { return (1 + (100 - this.aliveAI) / 100 * 1.3) * (this.calm ? 0.65 : 1) * (this.duel ? 1.15 : 1); }

  popup(text: string, x: number, y: number, col: string, scale = 2, ui = false) {
    if (this.popups.some(p => p.text === text && p.t < 0.4)) return;
    for (let k = 0; k < 6; k++) { const o = this.popups.find(p => p.t < 0.9 && Math.abs(p.y - p.t * 12 - y) < (p.scale + scale) * 3 + 2 && Math.abs(p.x - x) < 80); if (!o) break; y = o.y - o.t * 12 + (o.scale + scale) * 3 + 4; }
    this.popups.push({ text, x, y, t: 0, col, scale, ui }); }
  burst(x: number, y: number, col: string, n: number, sp = 80, ui = false) {
    const L = ui ? this.uiParts : this.parts;
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = rnd(0.2, 1) * sp; L.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.2, 0.6), max: 0.6, col, s: Math.random() < 0.3 ? 2 : 1 }); }
  }
  cellPos(i: number) { const left = i < 50, j = left ? i : i - 50, col = j % 10, row = (j / 10) | 0; return { x: (left ? 5 : 465) + col * 17, y: 5 + row * 33 }; }

  // ---------- targeting ----------
  attackers() { return this.rivals.filter(r => r.alive && r.target === -1); }
  computeTargets() {
    const alive = this.rivals.filter(r => r.alive); if (!alive.length) { this.targets = []; return; }
    if (this.mode === 0) {
      if (this.randTarget < 0 || !this.rivals[this.randTarget].alive || this.randCd <= 0) { this.randTarget = pick(alive).id; this.randCd = rnd(6, 10); }
      this.targets = [this.randTarget];
    } else if (this.mode === 1) { this.targets = [alive.reduce((a, b) => (b.hp < a.hp || (b.hp === a.hp && b.badges > a.badges) ? b : a)).id]; }
    else if (this.mode === 2) { const at = this.attackers(); this.targets = at.length ? at.slice(0, 6).map(r => r.id) : [this.randTarget >= 0 && this.rivals[this.randTarget].alive ? this.randTarget : pick(alive).id]; }
    else { this.targets = [alive.reduce((a, b) => (b.badges > a.badges ? b : a)).id]; }
  }

  // ---------- main update ----------
  update(dt: number) {
    this.realT += dt; this.titleT += dt; this.padMsgT -= dt;
    if (this.state !== "name" && this.state !== "controls" && this.state !== "pilot") {
      if (actHit("crt")) { fxCfg.crt = !fxCfg.crt; saveFx(); this.padMsg = "CRT FILTER " + (fxCfg.crt ? "ON" : "OFF"); this.padMsgT = 1.5; }
      if (actHit("lowfx")) { fxCfg.low = !fxCfg.low; saveFx(); this.padMsg = "LOW FX " + (fxCfg.low ? "ON" : "OFF"); this.padMsgT = 1.5; }
    }
    if (this.state !== "play") {
      this.updateFx(dt);
      if (MENU_STATES.includes(this.state)) audio.titleMusic(); // title theme on title / menus (starts once audio is unlocked by an input)
      if (this.state === "controls") { if (this.ctlBack === "lobby") this.tickLobby(dt); if (this.state === "controls") this.updateControls(dt); return; }
      if (this.state === "lobby") { this.tickLobby(dt); if (hit("Escape", "PadB")) { this.quitToTitle(); return; } if (hit("Enter", "PadStart")) { this.net.requestStart(); this.lobbyVoted = true; } else if (hit("KeyC", "PadY")) this.openControls(); }
      if (this.state === "title") {
        if (hit("ArrowUp", "KeyW", "PadUp")) { this.titleSel = (this.titleSel + 3) % 4; audio.tone(520, 0.04, "square", 0.05); }
        if (hit("ArrowDown", "KeyS", "PadDown")) { this.titleSel = (this.titleSel + 1) % 4; audio.tone(520, 0.04, "square", 0.05); }
        const lr = (hit("ArrowRight", "KeyD", "PadRight") ? 1 : 0) - (hit("ArrowLeft", "KeyA", "PadLeft") ? 1 : 0);
        if (this.titleSel === 1 && lr) { const n = PILOT_COUNT + 1, cur = this.pilotChoice === RANDOM_PILOT ? PILOT_COUNT : this.pilotChoice, nx = (cur + lr + n) % n;
          this.pilotChoice = nx === PILOT_COUNT ? RANDOM_PILOT : nx; savePilotChoice(this.pilotChoice); audio.init(); audio.tone(780, 0.05, "square", 0.06); }
        else if (actHit("song") || (this.titleSel === 3 && lr)) { audio.init(); audio.setSoundtrack(audio.soundtrack + 1); audio.tone(780, 0.05, "square", 0.06); }
        else if (hit("KeyC", "PadY")) this.openControls();
        else if (hit("Enter", "Space", "KeyZ", "PadStart", "PadA")) { if (this.titleSel === 3) { audio.init(); audio.setSoundtrack(audio.soundtrack + 1); audio.tone(780, 0.05, "square", 0.06); } else if (this.titleSel === 2) this.openControls(); else if (this.titleSel === 1) this.openPilot("title"); else this.openName(); }
      }
      else if (this.state === "name") this.updateName();
      else if (this.state === "pilot") this.updatePilot();
      else if (this.state === "over" || this.state === "win") {
        this.updateRivals(dt); this.updateSpecParts(dt);
        if (this.spec >= 0 && hit("KeyL", "Tab", "PadY")) { this.specLb = !this.specLb; }
        if (this.specOn()) { // spectating: switch between live humans
          const d = (hit("ArrowRight", "PadRB", "PadRight") || actHit("right") ? 1 : 0) - (hit("ArrowLeft", "PadLB", "PadLeft") || actHit("left") ? 1 : 0);
          if (d) this.cycleSpec(d);
          if (this.realT - this.endT > 0.6) { if (hit("Escape", "PadB")) this.quitToTitle(); else if (hit("Enter", "KeyR", "PadStart")) this.startLobby(); }
          return;
        }
        const d = (down("ArrowDown", "KeyS") || pad.ay > 0.5 ? 1 : 0) - (down("ArrowUp", "KeyW") || pad.ay < -0.5 ? 1 : 0);
        if (hit("PageDown")) this.lbScroll += 20; if (hit("PageUp")) this.lbScroll -= 20;
        if (d) { this.lbRep -= dt; if (this.lbRep <= 0) { this.lbScroll += d; this.lbRep = this.lbRep < -1 ? 0.06 : 0.12; } } else this.lbRep = 0;
        this.lbScroll = clamp(this.lbScroll, 0, 101 - LB_ROWS);
        if (hit("ArrowLeft", "ArrowRight", "KeyA", "KeyD", "PadLeft", "PadRight", "Tab") || actHit("left") || actHit("right")) { this.endSel ^= 1; audio.tone(520, 0.04, "square", 0.05); }
        if (this.realT - this.endT > 0.6) {
          if (hit("Escape", "PadB", "KeyT")) this.quitToTitle();
          else if (hit("KeyR")) this.startLobby();
          else if (hit("Enter", "Space", "PadStart", "PadA") || actHit("fire")) { if (this.endSel) this.quitToTitle(); else this.startLobby(); }
        }
      }
      return;
    }
    if (hit("Escape", "PadStart") || actHit("pause")) { this.paused = !this.paused; this.pauseSel = 0; }
    else if (this.paused) {
      if (hit("ArrowUp", "ArrowDown", "KeyW", "KeyS", "PadUp", "PadDown") || actHit("up") || actHit("down")) { this.pauseSel ^= 1; audio.tone(520, 0.04, "square", 0.05); }
      else if (hit("PadB")) this.paused = false;
      else if (hit("Enter", "PadA", "KeyQ")) { if (this.pauseSel || hit("KeyQ")) { this.quitToTitle(); return; } this.paused = false; }
    }
    if (actHit("mute")) audio.toggleMute();
    if (actHit("song")) { audio.setSoundtrack(audio.soundtrack + 1); this.popup("MUSIC: " + audio.soundtrackName, PW / 2, PH - 84, CYA, 1.5); }
    audio.pauseMusic(this.paused && !this.liveMatch());
    if (this.paused && !this.liveMatch()) return; // real pause only solo / vs bots; with 2+ humans the menu overlays a running match
    for (let k = 0; k < 4; k++) if (!this.paused && actHit(("tgt" + k) as Act)) { this.mode = k; this.popup("TARGET: " + MODES[k], PW / 2, PH - 70, CYA, 1); }
    if (this.hitstop > 0) { this.hitstop--; return; }
    if (this.slow > 0) { this.slow -= dt; dt *= 0.35; }
    this.time += dt;
    this.updatePlayer(dt); this.updateChain(dt); this.spawnFormations(dt); this.updateEnemies(dt); this.updateBullets(dt);
    this.updateItems(dt); this.updateWaves(dt); this.updateWarns(dt); this.net.tick(dt, this.hints()); this.updateRivals(dt); this.updateProjs(dt); this.updateFx(dt);
    this.randCd -= dt; this.computeTargets();
    audio.updateMusic({ remaining: this.remaining, duel: this.duel, lowHealth: this.hp === 1, hp: this.hp, bombs: this.bombs, chain: this.chain, armed: this.eligible, bossActive: this.enemies.some(e => e.boss && !e.dead), shield: this.shield, freeze: this.freeze > 0, lightning: this.zapT > 0, tripleReady: this.bombs >= 5 && this.items.some(it => it.kind === "B") });
  }

  updatePlayer(dt: number) {
    const bi = this.bot ? this.bot(this) : this.paused ? { dx: 0, dy: 0, fire: false, focus: false } : null; // match menu open (live online match): hands off the ship
    this.focus = bi ? bi.focus : actDown("focus");
    const sp = this.focus ? 70 : 160; let dx = bi ? bi.dx : actVal("right") - actVal("left"), dy = bi ? bi.dy : actVal("down") - actVal("up"); // keys = 1, sticks analog
    const mag = Math.hypot(dx, dy); if (mag > 1) { dx /= mag; dy /= mag; }
    this.px = clamp(this.px + dx * sp * dt, 6, PW - 6); this.py = clamp(this.py + dy * sp * dt, 10, PH - 8);
    this.inv -= dt; this.fireCd -= dt;
    if (this.fireCd <= 0 && (bi ? bi.fire : actDown("fire"))) { // hold to fire
      this.fireCd = 0.075; const w = this.weapon;
      if (this.focus) { const n = 2 + w; for (let i = 0; i < n; i++) this.pb.push({ x: this.px + (i - (n - 1) / 2) * 3, y: this.py - 8, vx: 0, vy: -480, r: 2, col: YEL, dmg: 1.3 }); }
      else {
        this.pb.push({ x: this.px - 3, y: this.py - 6, vx: 0, vy: -420, r: 2, col: MAG }, { x: this.px + 3, y: this.py - 6, vx: 0, vy: -420, r: 2, col: MAG });
        const sides = w; for (let i = 1; i <= sides; i++) { const a = 0.13 * i; this.pb.push({ x: this.px, y: this.py - 4, vx: -Math.sin(a) * 400, vy: -Math.cos(a) * 400, r: 2, col: CYA }, { x: this.px, y: this.py - 4, vx: Math.sin(a) * 400, vy: -Math.cos(a) * 400, r: 2, col: CYA }); }
      }
      audio.shoot();
    }
    if (!this.paused && actHit("bomb")) this.bomb();
    this.updateSpecial(dt); this.updateTriple(dt);
    if (this.hp < 3) { this.regen -= dt; if (this.regen <= 0) { this.hp++; this.regen = 20; this.popup("+1 HP", this.px, this.py - 16, CYA, 1); audio.power(); } } else this.regen = 20;
    // engine particles
    if (Math.random() < 0.7) this.parts.push({ x: this.px + rnd(-1, 1), y: this.py + 7, vx: rnd(-10, 10), vy: rnd(60, 120), life: 0.2, max: 0.2, col: Math.random() < 0.5 ? CYA : WHT, s: 1 });
  }

  /** Special power-up: one weapon per pilot (PILOT_SPECIAL), all run SPECIAL_SECS and kill at a similar rate (see special-test.mjs). */
  updateSpecial(dt: number) {
    for (const b of this.bolts) b.life -= dt; this.bolts = this.bolts.filter(b => b.life > 0);
    for (const b of this.blasts) b.life -= dt; this.blasts = this.blasts.filter(b => b.life > 0);
    this.inSpecial = true;
    this.updateFlames(dt); this.updateBlades(dt);
    if (this.zapT > 0 && !this.dead) { this.zapT -= dt; this.zapCd -= dt;
      if (this.specKind === 1) this.updateInferno(dt); else if (this.specKind === 2) this.updateStorm(); else this.updateLightning(); }
    this.inSpecial = false;
  }
  liveTarget(e: Enemy) { return !e.dead && (e.boss || (e.t >= e.delay && e.entered)) && e.x > 0 && e.x < PW && e.y > 0 && e.y < PH; }
  /** Special damage to any enemy (boss: its first weak part within reach, or none). */
  specialHit(e: Enemy, dmg: number, x?: number, y?: number, reach = 0) {
    if (e.dead) return;
    if (e.boss) { const wp = this.bossParts(e).find(p => p.weak && (x === undefined || (Math.abs(p.x - x) < p.rx + reach && Math.abs(p.y - y!) < p.ry + reach))); if (wp) this.damageBoss(e, dmg, wp.tur); return; }
    e.hp -= dmg; if (e.hp > 0 && e.up) this.chip(e); if (e.hp <= 0) this.killEnemy(e, true);
  }
  nearestLive(x: number, y: number, skip?: Enemy[]) { let best: Enemy | null = null, bd = 1e9; for (const e of this.enemies) { if (!this.liveTarget(e) || skip?.includes(e)) continue; const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } } return best; }
  /** INFERNO: a ring of three flames orbits the ship (burns what it touches) and napalm fireballs lob at the nearest enemy, bursting in an area. */
  updateInferno(dt: number) {
    this.ringA += dt * 6; this.ringCd -= dt;
    if (this.ringCd <= 0) { this.ringCd = 0.15;
      for (let k = 0; k < 3; k++) { const fx = this.px + Math.cos(this.ringA + k * 2.094) * 24, fy = this.py + Math.sin(this.ringA + k * 2.094) * 24;
        for (const e of this.enemies) if (this.liveTarget(e) && (e.boss || Math.hypot(e.x - fx, e.y - fy) < 11)) this.specialHit(e, 2, fx, fy, 4); } }
    if (Math.random() < 0.6) { const k = Math.floor(Math.random() * 3); this.parts.push({ x: this.px + Math.cos(this.ringA + k * 2.094) * 24, y: this.py + Math.sin(this.ringA + k * 2.094) * 24, vx: rnd(-15, 15), vy: rnd(-40, -10), life: 0.3, max: 0.3, col: Math.random() < 0.5 ? "#ff9030" : YEL, s: 1 }); }
    if (this.zapCd > 0) return; this.zapCd = 0.16;
    const tg = this.nearestLive(this.px, this.py); if (!tg) return;
    const a = Math.atan2(tg.y - this.py, tg.x - this.px); this.flames.push({ x: this.px, y: this.py - 6, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250, life: 1.1 }); audio.fireball();
  }
  updateFlames(dt: number) {
    for (const f of this.flames) {
      f.x += f.vx * dt; f.y += f.vy * dt; f.life -= dt;
      if (Math.random() < 0.8) this.parts.push({ x: f.x + rnd(-1, 1), y: f.y + rnd(-1, 1), vx: rnd(-20, 20), vy: rnd(-20, 20), life: 0.25, max: 0.25, col: Math.random() < 0.4 ? YEL : "#ff5020", s: Math.random() < 0.4 ? 2 : 1 });
      const hitE = this.enemies.some(e => this.liveTarget(e) && (e.boss ? this.bossParts(e).some(p => p.weak && Math.abs(p.x - f.x) < p.rx && Math.abs(p.y - f.y) < p.ry) : Math.hypot(e.x - f.x, e.y - f.y) < 8));
      if (hitE || f.life <= 0 || f.y < -10) { f.life = -1; if (f.y < -10) continue;
        this.inSpecial = true; for (const e of this.enemies) if (this.liveTarget(e) && (e.boss || Math.hypot(e.x - f.x, e.y - f.y) < 32)) this.specialHit(e, 2, f.x, f.y, 6);
        this.blasts.push({ x: f.x, y: f.y, life: 0.25 }); this.burst(f.x, f.y, "#ff9030", 12, 90); this.burst(f.x, f.y, YEL, 6, 50); audio.napalm(); }
    }
    this.flames = this.flames.filter(f => f.life > 0);
  }
  /** STORM BLADES: homing shuriken thrown in a fan; each pierces up to three enemies. */
  updateStorm() {
    if (this.zapCd > 0) return; this.zapCd = 0.23;
    const a = -Math.PI / 2 + rnd(-0.9, 0.9); this.blades.push({ x: this.px, y: this.py - 6, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, life: 1.4, pierce: 2, hits: [], a: 0 }); audio.blade();
  }
  updateBlades(dt: number) {
    for (const b of this.blades) {
      b.life -= dt; b.a += dt * 20;
      const tg = this.nearestLive(b.x, b.y, b.hits);
      if (tg) { const want = Math.atan2(tg.y - b.y, tg.x - b.x), cur = Math.atan2(b.vy, b.vx); let d = want - cur; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283;
        const na = cur + clamp(d, -9 * dt, 9 * dt); b.vx = Math.cos(na) * 320; b.vy = Math.sin(na) * 320; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (Math.random() < 0.5) this.parts.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.12, max: 0.12, col: Math.random() < 0.5 ? WHT : MAG, s: 1 });
      for (const e of this.enemies) {
        if (!this.liveTarget(e) || b.hits.includes(e)) continue;
        const near = e.boss ? this.bossParts(e).some(p => Math.abs(p.x - b.x) < p.rx && Math.abs(p.y - b.y) < p.ry) : Math.hypot(e.x - b.x, e.y - b.y) < 8;
        if (!near) continue;
        this.inSpecial = true; this.specialHit(e, 2, b.x, b.y, 2); b.hits.push(e); audio.bladeHit(); for (let k = 0; k < 3; k++) this.parts.push({ x: b.x, y: b.y, vx: rnd(-60, 60), vy: rnd(-60, 60), life: 0.18, max: 0.18, col: WHT, s: 1 });
        if (--b.pierce < 0) { b.life = 0; break; }
      }
    }
    this.blades = this.blades.filter(b => b.life > 0 && b.x > -20 && b.x < PW + 20 && b.y > -20 && b.y < PH + 20);
  }
  /** LIGHTNING: auto chain-lightning to the nearest enemy, jumping to 2 more. Kills count toward chains. */
  updateLightning() {
    if (this.zapCd > 0) return; this.zapCd = 0.25;
    const live = (e: Enemy) => this.liveTarget(e);
    const pool = this.enemies.filter(live); if (!pool.length) return;
    let from = { x: this.px, y: this.py - 6 }; const hitSet = new Set<Enemy>(); const jumps = 3; // first target + 2 jumps
    for (let j = 0; j < jumps; j++) {
      let best: Enemy | null = null, bd = j === 0 ? 1e9 : 70;
      for (const e of pool) { if (hitSet.has(e)) continue; const d = Math.hypot(e.x - from.x, e.y - from.y); if (d < bd) { bd = d; best = e; } }
      if (!best) break; hitSet.add(best);
      const pts = [from]; const n = Math.max(3, Math.floor(bd / 10));
      for (let k = 1; k < n; k++) { const f = k / n; pts.push({ x: from.x + (best.x - from.x) * f + rnd(-5, 5), y: from.y + (best.y - from.y) * f + rnd(-5, 5) }); }
      pts.push({ x: best.x, y: best.y }); this.bolts.push({ pts, life: 0.12 });
      for (let k = 0; k < 4; k++) this.parts.push({ x: best.x, y: best.y, vx: rnd(-70, 70), vy: rnd(-70, 70), life: 0.2, max: 0.2, col: Math.random() < 0.5 ? CYA : WHT, s: 1 });
      this.specialHit(best, 2);
      from = { x: best.x, y: best.y };
    }
    audio.zap();
  }
  /** Bomb pickup at max stock: three staggered full-screen blasts (~3x bomb). Free, and keeps your chain (reward). */
  tripleBomb() {
    this.tripleQ = [0, 0.18, 0.36]; audio.tripleBomb(); audio.musicEvent("tripleBomb"); this.popup("TRIPLE BOMB!", PW / 2, PH / 2 - 10, YEL, 4); this.inv = Math.max(this.inv, 1.5);
  }
  updateTriple(dt: number) {
    if (!this.tripleQ.length) return;
    this.tripleQ = this.tripleQ.map(t => t - dt);
    while (this.tripleQ.length && this.tripleQ[0] <= 0) {
      this.tripleQ.shift(); const k = 3 - this.tripleQ.length; const col = [YEL, MAG, CYA][k - 1];
      this.shake = 10 + k * 2; this.flash = 0.35; this.flashCol = col; this.bombFx = 0.6; this.bombCol = col; audio.musicEvent("bombBlast");
      this.bombAt = { x: k === 1 ? this.px : rnd(40, PW - 40), y: k === 1 ? this.py : rnd(60, PH - 80) };
      for (const b of this.eb) this.burst(b.x, b.y, b.col, 1, 40); this.eb = [];
      for (const w of this.waves) w.t = w.dur;
      for (const e of this.enemies) { if (e.boss) this.bombBoss(e); else { e.hp = 0; this.killEnemy(e, false); } }
      this.burst(this.bombAt.x, this.bombAt.y, col, 70, 220); this.burst(this.bombAt.x, this.bombAt.y, WHT, 30, 140);
      if (this.chain > 0) this.chainT = this.chainMax; // chain survives (and is kept alive) through the blasts
    }
  }
  bomb() {
    if (this.bombs <= 0) return; this.bombs--; audio.bomb(); audio.musicEvent("bomb"); this.shake = 8; this.flash = 0.4; this.flashCol = MAG; this.bombFx = 0.6; this.bombCol = MAG; this.bombAt = null;
    for (const b of this.eb) this.burst(b.x, b.y, b.col, 1, 30); this.eb = [];
    for (const w of this.waves) w.t = w.dur;
    for (const e of this.enemies) { if (e.boss) { this.bombBoss(e); } else { e.hp = 0; this.killEnemy(e, false); } }
    if (this.chain > 0) { this.popup("CHAIN RESET", PW / 2, 60, MAG, 1); }
    this.chain = 0; this.chainT = 0; this.chainCol = -1; this.eligible = false; this.inv = Math.max(this.inv, 1);
    this.popup("BOMB!", PW / 2, PH / 2, MAG, 4);
  }

  cashIn(force = false) { // attacks send automatically (timer expiry while armed, or max tier)
    if ((!this.eligible && !force) || this.chain <= 0) { return; }
    const c = this.chain, tier = c < WAVE_AT ? 0 : c < BOSS_AT ? 1 : 2;
    const power = Math.round(c * (1 + 0.1 * this.badges) + this.starBoost);
    const name = ["ENEMY RUSH SENT!", "BULLET WAVE SENT!", "MINI-BOSS SENT!"][tier];
    this.computeTargets();
    const tn = this.targets.length > 1 ? this.targets.length + " ATTACKERS" : (this.rivals[this.targets[0]]?.name || "?");
    this.popup(name, PW / 2, PH / 2 - 40, [CYA, MAG, YEL][tier], 2); this.popup("POWER " + power + " TO " + tn, PW / 2, PH / 2 - 26, WHT, 1);
    for (const id of this.targets) { this.net.sendAttack(id, tier as 0 | 1 | 2, power); const cp = this.cellPos(id); this.projs.push({ sx: PX + this.px, sy: PY + this.py, ex: cp.x + CELL_W / 2, ey: cp.y + CELL_H / 2, t: 0, dur: 0.7, out: true, tier, power, target: id, sender: -1, col: [CYA, MAG, YEL][tier] }); }
    if (tier === 2) this.cutIn = { t: 0, name: tn }; // portrait banner, no pause
    this.score += power * 500; audio.sent(tier); audio.musicEvent("sent", tier); this.flash = 0.15; this.flashCol = [CYA, MAG, YEL][tier];
    this.burst(this.px, this.py, YEL, 30, 140);
    this.chain = 0; this.chainCol = -1; this.chainT = 0; this.eligible = false; this.starBoost = 0;
  }

  updateChain(dt: number) {
    this.chainPulse = Math.max(0, this.chainPulse - dt * 4);
    if (this.chain <= 0) return;
    if (this.chain >= BOSS_AT) { this.cashIn(true); return; }
    if (this.freeze > 0) { this.freeze -= dt; return; }
    this.chainT -= dt;
    if (this.chainT <= 0 && this.eligible) { this.cashIn(); return; }
    if (this.chainT <= 0) { this.popup("CHAIN LOST", PW / 2, 60, "#888888", 2); audio.chainLost(); audio.musicEvent("chainLost"); this.chain = 0; this.chainCol = -1; this.eligible = false; }
  }

  // ---------- formations ----------
  spawnFormations(dt: number) {
    this.formCd -= dt;
    const active = this.forms.filter(f => !f.done && !f.sent).length;
    if (this.formCd <= 0 && active < (this.calm ? 2 : 3)) {
      this.formCd = (this.calm ? 3.4 : 2.6) / Math.sqrt(this.ramp);
      const n = this.calm ? ri(4, 5) : ri(5, 8), col = ri(0, 3), path = ri(0, 3);
      this.spawnFormation(n, col, path, false, -1);
    }
  }
  spawnFormation(n: number, col: number, path: number, sent: boolean, sender: number) {
    const f: Formation = { id: this.formId++, total: n, killed: 0, lost: false, sent, sender, done: false }; this.forms.push(f);
    const x0 = rnd(30, PW - 30), side = Math.random() < 0.5, spr = ri(0, 1);
    for (let i = 0; i < n; i++) {
      const up = sent ? 0 : upgradeTier(this.time), hp = sent ? 2 : UP_HP[up];
      this.enemies.push({ x: -50, y: -50, t: 0, delay: i * (path === 3 ? 0.08 : 0.22), path, x0: path === 1 ? (side ? -12 : PW + 12) : path === 3 ? PW / 2 + (i - (n - 1) / 2) * 20 : x0, y0: rnd(40, 140),
        idx: i, hp, col: sent ? SENT : col, form: f.id, fireCd: rnd(1, 3), spr, up, entered: false, dead: false, sender, vx: side ? 1 : -1 });
    }
  }
  pathPos(e: Enemy, t: number) {
    const s = (this.calm ? 0.85 : 1) * Math.min(1.6, Math.sqrt(this.ramp));
    switch (e.path) {
      case 0: return { x: e.x0 + Math.sin(t * 2.2) * 45 * (e.x0 < PW / 2 ? 1 : -1), y: -10 + t * 55 * s };
      case 1: return { x: e.x0 + (e.vx || 1) * t * 75 * s, y: e.y0 + Math.sin(t * 3) * 18 };
      case 2: { const cx = PW / 2 + Math.sin(t * 1.4) * 70; return { x: cx, y: -10 + t * 45 * s + Math.cos(t * 2.8) * 12 }; }
      default: { const yy = Math.min(e.y0 * 0.6 + 20, -10 + t * 90); return { x: e.x0 + Math.sin(t * 1.5) * 12, y: t > 5 ? yy + (t - 5) * (t - 5) * 30 : yy }; }
    }
  }
  updateEnemies(dt: number) {
    for (const e of this.enemies) if (e.hf) e.hf = Math.max(0, e.hf - dt);
    const bs = (55 + this.ramp * 22);
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.boss) { this.updateBoss(e, dt); continue; }
      e.t += dt; const t = e.t - e.delay; if (t < 0) continue;
      const p = this.pathPos(e, t); e.x = p.x; e.y = p.y;
      const on = e.x > -14 && e.x < PW + 14 && e.y > -14 && e.y < PH + 14;
      if (on) e.entered = true; else if (e.entered || t > 12) { e.dead = true; const f = this.forms.find(f => f.id === e.form); if (f) f.lost = true; continue; }
      e.fireCd -= dt;
      if (e.fireCd <= 0 && e.y > 10 && e.y < PH * 0.7) {
        e.fireCd = rnd(1.6, 3.2) / Math.sqrt(this.ramp);
        if (Math.random() < 0.5 + this.ramp * 0.1) {
          const a = Math.atan2(this.py - e.y, this.px - e.x);
          const n = this.time > 150 && Math.random() < 0.3 ? 3 : 1;
          for (let i = 0; i < n; i++) { const aa = a + (i - (n - 1) / 2) * 0.25; this.eb.push({ x: e.x, y: e.y, vx: Math.cos(aa) * bs, vy: Math.sin(aa) * bs, r: 2, col: e.col === SENT ? SENT_COL : MAG }); }
        }
      }
      if (this.collidePlayer(e.x, e.y, 6)) this.hurt();
    }
    this.enemies = this.enemies.filter(e => !e.dead);
    for (const f of this.forms) if (!f.done && !this.enemies.some(e => e.form === f.id)) f.done = true;
    this.forms = this.forms.filter(f => !f.done || this.time - 0 < 0);
  }
  // ---------- mini-bosses (variant ids shared with sim/server) ----------
  spawnBoss(v: number, power: number, sender: number) {
    v = ((v | 0) % 4 + 4) % 4; const hp = 60 + power * 2;
    const e: Enemy = { x: PW / 2, y: -20, t: 0, delay: 0, path: 0, x0: 0, y0: 0, idx: 0, hp, maxhp: hp, col: SENT, form: -1, fireCd: 1.2, spr: 0, entered: true, dead: false, boss: true, sender, bv: v,
      hist: [], segs: [], cyc: -1, vis: v === 3 ? 0 : 1, eye: false, tx: PW / 2, ty: 60 };
    if (v === 2) { e.tur = [hp * 0.35, hp * 0.35]; e.turMax = hp * 0.35; }
    this.enemies.push(e); this.popup(BOSS_NAMES[v] + "!", PW / 2, 30, SENT_COL, 2);
    this.popup(["HIT ANYWHERE", "ONLY THE HEAD IS WEAK", "DESTROY TURRETS, THEN CORE", "HIT IT WHEN THE EYE OPENS"][v], PW / 2, 46, "#ff9090", 1);
    return e;
  }
  /** Final duel boss: the OPPONENT's pilot boss (FINAL_BOSSES[pilot]); bv = 100 + pilot. Never escapes; returns after a pause when beaten. */
  spawnFinal(pilot: number, sender: number, again = false) {
    pilot = ((pilot | 0) % FINAL_BOSSES.length + FINAL_BOSSES.length) % FINAL_BOSSES.length;
    const d = FINAL_BOSSES[pilot], hp = Math.round(FINAL_HP * d.hp);
    const e: Enemy = { x: PW / 2, y: -24, t: 0, delay: 0, path: 0, x0: 0, y0: 0, idx: 0, hp, maxhp: hp, col: SENT, form: -1, fireCd: 1.2, spr: 0, entered: true, dead: false, boss: true, sender, bv: 100 + pilot,
      fb: newFBState(), fp: pilot, vis: 1, eye: true };
    this.enemies.push(e); audio.finalBoss(); this.shake = Math.max(this.shake, 6); this.flash = 0.25; this.flashCol = d.pal[2];
    this.popup(d.name + (again ? " RETURNS!" : "!"), PW / 2, 34, d.pal[2], 2);
    this.cutIn = { t: 0, name: d.name, title: again ? "FINAL BOSS RETURNS" : "FINAL BOSS", sub: "SUMMONED BY " + (this.rivals[sender]?.name || "?"), boss: pilot, dur: 1.8 };
    return e;
  }
  bossName(e: Enemy) { return (e.bv ?? 0) >= 100 ? FINAL_BOSSES[(e.bv ?? 100) - 100]?.name ?? "BOSS" : BOSS_NAMES[e.bv ?? 0]; }
  /** Hit regions: weak = takes damage, block = absorbs shots. */
  bossParts(e: Enemy) {
    const P: { x: number; y: number; rx: number; ry: number; weak: boolean; tur?: number }[] = [];
    if ((e.bv ?? 0) >= 100) { const d = FINAL_BOSSES[e.bv! - 100]; if (d && (e.vis ?? 1) > 0.5) P.push({ x: e.x, y: e.y + (d.hit.dy ?? 0), rx: d.hit.rx, ry: d.hit.ry, weak: e.fb ? (d.weak ? d.weak(e.fb) : true) : !!e.eye }); return P; }
    switch (e.bv) {
      case 1: P.push({ x: e.x, y: e.y, rx: 6, ry: 5, weak: true }); for (const g of e.segs!) P.push({ x: g.x, y: g.y, rx: 4, ry: 4, weak: false }); break;
      case 2: { const tur = e.tur!; [-20, 20].forEach((dx, i) => { if (tur[i] > 0) P.push({ x: e.x + dx, y: e.y + 6, rx: 5, ry: 5, weak: true, tur: i }); });
        P.push({ x: e.x, y: e.y, rx: 6, ry: 6, weak: !(tur[0] > 0 || tur[1] > 0) }); P.push({ x: e.x, y: e.y, rx: 28, ry: 8, weak: false }); break; }
      case 3: if ((e.vis ?? 0) > 0.6) P.push({ x: e.x, y: e.y, rx: 9, ry: 9, weak: !!e.eye }); break;
      default: P.push({ x: e.x, y: e.y, rx: 16, ry: 10, weak: true });
    }
    return P;
  }
  damageBoss(e: Enemy, dmg: number, tur?: number) {
    if (tur !== undefined && e.tur) {
      e.tur[tur] -= dmg;
      if (e.tur[tur] <= 0) { const x = e.x + (tur ? 20 : -20); this.burst(x, e.y + 6, YEL, 40, 120); this.shake = Math.max(this.shake, 5); audio.explodeBig(); this.popup(e.tur.every(h => h <= 0) ? "CORE EXPOSED!" : "TURRET DOWN!", x, e.y + 20, YEL, 1); }
      return;
    }
    e.hp -= dmg; if (e.hp <= 0) this.killEnemy(e, true);
  }
  bombBoss(e: Enemy) {
    if (e.bv === 2 && e.tur!.some(h => h > 0)) { e.tur!.forEach((h, i) => { if (h > 0) this.damageBoss(e, 10, i); }); return; }
    this.damageBoss(e, 15);
  }
  fireAt(x: number, y: number, a: number, sp: number, col: string, r = 2) { this.eb.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r, col }); }
  updateBoss(e: Enemy, dt: number) {
    e.t += dt; const t = e.t, bs = 60 + this.ramp * 15, aim = (x: number, y: number) => Math.atan2(this.py - y, this.px - x);
    e.fireCd -= dt;
    if (e.fb && e.fp !== undefined) { // final boss (see finalboss.ts)
      const d = FINAL_BOSSES[e.fp], pos = stepFinal(d, e.fp, e.fb, this, dt, e.hp / (e.maxhp || 1)); e.x = pos.x; e.y = pos.y; e.vis = e.fb.vis; e.eye = d.weak ? d.weak(e.fb) : true;
      for (const p of this.bossParts(e)) if (this.collidePlayer(p.x, p.y, Math.min(p.rx, p.ry) * 0.7)) { this.hurt(); break; }
      return;
    }
    if (e.bv === 1) { // SERPENT: weaving head, armored body trail
      e.x = PW / 2 + Math.sin(t * 1.1) * PW * 0.38; e.y = Math.min(55 + Math.sin(t * 0.8) * 40, -20 + t * 60);
      e.hist!.push({ x: e.x, y: e.y }); if (e.hist!.length > 80) e.hist!.shift();
      e.segs = []; for (let i = 1; i <= 8; i++) { const h = e.hist![e.hist!.length - 1 - i * 7]; if (h) e.segs.push(h); }
      if (e.fireCd <= 0 && t > 1.5) {
        e.fireCd = 0.45; const k = Math.floor(t / 0.45) % Math.max(1, e.segs.length); const g = e.segs[k];
        if (g) this.fireAt(g.x, g.y, aim(g.x, g.y), bs, CYA);
        if (Math.floor(t / 0.45) % 7 === 0) { const a = aim(e.x, e.y); for (let i = -3; i <= 3; i++) this.fireAt(e.x, e.y, a + i * 0.16, bs * 1.1, MAG); }
      }
    } else if (e.bv === 2) { // FORTRESS: two turrets shield the core; then the core goes berserk
      e.x = PW / 2 + Math.sin(t * 0.4) * 25; e.y = Math.min(42, -20 + t * 40);
      const shielded = e.tur!.some(h => h > 0);
      if (e.fireCd <= 0 && t > 1.5) {
        e.fireCd = shielded ? 1.1 : 0.09;
        if (shielded) { e.tur!.forEach((h, i) => { if (h > 0) { const x = e.x + (i ? 20 : -20), y = e.y + 8, a = aim(x, y); for (let k = 0; k < 3; k++) this.fireAt(x, y, a + (k - 1) * 0.08, bs * (1 + k * 0.12), YEL); } }); }
        else { const a = t * 4; for (let k = 0; k < 3; k++) this.fireAt(e.x, e.y, a + k * 2.094, bs * 0.9, SENT_COL); }
      }
      e.cyc! -= dt;
      if (e.cyc! <= 0 && t > 2.5) { // laser wall with a gap
        e.cyc = shielded ? 4.5 : 3; const gap = ri(2, Math.floor(PW / 10) - 5);
        for (let i = 0; i < PW / 10; i++) if (i < gap || i > gap + 3) this.eb.push({ x: i * 10 + 5, y: e.y + 10, vx: 0, vy: 45 + this.ramp * 10, r: 2, col: "#60ff80" });
      }
    } else if (e.bv === 3) { // PHANTOM: teleports; only vulnerable while the eye is open
      const P = 3.2, c = Math.floor(t / P), ct = t - c * P;
      if (c !== e.cyc) { e.cyc = c; let x = 0, y = 0; for (let k = 0; k < 8; k++) { x = rnd(30, PW - 30); y = rnd(30, 150); if (Math.hypot(x - this.px, y - this.py) > 90) break; } e.tx = x; e.ty = y; e.x = x; e.y = y; }
      e.vis = ct < 0.4 ? ct / 0.4 : ct < 2.4 ? 1 : Math.max(0, 1 - (ct - 2.4) / 0.4);
      const open = ct > 1.0 && ct < 2.4;
      if (open && !e.eye) { for (let i = 0; i < 16; i++) this.fireAt(e.x, e.y, i / 16 * 6.283, bs, MAG, 2.5); audio.bossHit(); }
      e.eye = open;
      if (open && e.fireCd <= 0) { e.fireCd = 0.12; const a = t * 2.2; for (let k = 0; k < 4; k++) this.fireAt(e.x, e.y, a + k * 1.5708, bs * 0.8, WHT); }
    } else { // SAUCER
      e.x = PW / 2 + Math.sin(t * 0.7) * 60; e.y = Math.min(60, -20 + t * 40);
      if (e.fireCd <= 0 && t > 1.5) {
        const ph = Math.floor(t / 4) % 3;
        if (ph === 0) { e.fireCd = 0.9; const n = 14; for (let i = 0; i < n; i++) this.fireAt(e.x, e.y, i / n * 6.283 + t, bs, SENT_COL, 2.5); }
        else if (ph === 1) { e.fireCd = 0.09; const a = t * 5; for (const k of [0, Math.PI]) this.eb.push({ x: e.x, y: e.y, vx: Math.cos(a + k) * bs, vy: Math.abs(Math.sin(a + k)) * bs + 20, r: 2, col: YEL }); }
        else { e.fireCd = 0.6; const a = aim(e.x, e.y); for (let i = -2; i <= 2; i++) this.fireAt(e.x, e.y, a + i * 0.18, bs * 1.3, MAG); }
      }
    }
    if (t > 40) { e.dead = true; this.popup(this.bossName(e) + " ESCAPED", PW / 2, 80, "#888888", 1); }
    for (const p of this.bossParts(e)) if (this.collidePlayer(p.x, p.y, Math.min(p.rx, p.ry))) { this.hurt(); break; }
  }
  collidePlayer(x: number, y: number, r: number) { const dx = x - this.px, dy = y - this.py; return dx * dx + dy * dy < (r + 1.5) * (r + 1.5); }

  /** Armored enemy took a non-lethal hit: white flash + plating chips. */
  chip(e: Enemy) { e.hf = 0.07; audio.bossHit(); for (let i = 0; i < 3; i++) this.parts.push({ x: e.x + rnd(-4, 4), y: e.y + rnd(-2, 3), vx: rnd(-50, 50), vy: rnd(-60, 10), life: 0.25, max: 0.25, col: i ? PLATE : allCols[e.col], s: 1 }); }
  killEnemy(e: Enemy, byShot: boolean) {
    if (e.dead) return; e.dead = true;
    const col = allCols[e.col];
    this.burst(e.x, e.y, col, e.boss ? 80 : 14, e.boss ? 160 : 90); this.burst(e.x, e.y, WHT, 4, 40);
    if (e.boss) {
      this.shake = 10; this.hitstop = 10; audio.explodeBig(); audio.musicEvent("bossDown"); this.flash = 0.3; this.flashCol = YEL; this.score += 20000;
      if (e.fb) { this.popup("FINAL BOSS DOWN!", PW / 2, PH / 2 - 30, YEL, 3); this.popup("COUNTER-STRIKE SENT", PW / 2, PH / 2 - 14, WHT, 1); this.reflect(e.sender ?? -1, 2, 30); this.score += 30000;
        if (this.duel) this.finalQ = { t: 18, pilot: e.fp ?? 0, sender: e.sender ?? -1, again: true }; }
      else { this.popup("BOSS DOWN!", PW / 2, PH / 2 - 30, YEL, 3); this.reflect(e.sender ?? -1, 1, 12); }
      for (let i = 0; i < 12; i++) this.items.push({ x: e.x + rnd(-15, 15), y: e.y + rnd(-10, 10), vx: rnd(-30, 30), vy: rnd(-60, 0), kind: "dot", t: 0 });
      this.items.push({ x: e.x, y: e.y, vx: 0, vy: 20, kind: pick(["W", "B", "G", "F", "S"]), t: 0 });
      this.chainAdd(e.col, 5);
      return;
    }
    this.shake = Math.max(this.shake, 1.5);
    const f = this.forms.find(f => f.id === e.form);
    if (byShot) {
      if (this.inSpecial) this.specKills++;
      this.chainAdd(e.col, 0);
      this.score += Math.round(100 * (1 + (e.up ?? 0)) * (1 + this.chain / 10));
      audio.kill(this.chain); audio.musicEvent("kill");
      if (f) { f.killed++; if (f.killed >= f.total && !f.lost) this.formClear(f, e); }
    } else if (f) f.lost = true;
    const nd = ri(1, 2) + (e.up ?? 0); for (let i = 0; i < nd; i++) this.items.push({ x: e.x, y: e.y, vx: rnd(-20, 20), vy: rnd(-50, -10), kind: "dot", t: 0 });
    if (Math.random() < 0.06) this.items.push({ x: e.x, y: e.y, vx: 0, vy: 20, kind: pickPowerup(), t: 0 });
  }
  chainAdd(col: number, extra: number) {
    if (this.chain === 0) this.chainCol = col === SENT ? -1 : col;
    if (this.chainCol < 0 && col !== SENT) this.chainCol = col;
    const add = col === this.chainCol ? 2 : 1;
    this.chain += add + extra; this.chainT = this.chainMax; this.chainPulse = 1; this.bestChain = Math.max(this.bestChain, this.chain);
  }
  formClear(f: Formation, e: Enemy) {
    this.chain += 3; this.chainT = this.chainMax; this.chainPulse = 1.5;
    if (!this.eligible) this.popup("ATTACK ARMED!", PW / 2, 40, YEL, 2); else this.popup("FORMATION CLEAR +3", e.x, e.y, YEL, 1);
    this.eligible = true; this.shake = 3; audio.power();
    if (f.sent) { this.popup("COUNTER!", e.x, e.y - 10, SENT_COL, 2); this.reflect(f.sender, 0, 4 + f.total); }
  }
  reflect(sender: number, tier: number, power: number) {
    if (sender < 0 || !this.rivals[sender]?.alive) return;
    this.net.sendAttack(sender, tier as 0 | 1 | 2, power); const cp = this.cellPos(sender);
    this.projs.push({ sx: PX + this.px, sy: PY + this.py, ex: cp.x + CELL_W / 2, ey: cp.y + CELL_H / 2, t: 0, dur: 0.6, out: true, tier, power, target: sender, sender: -1, col: SENT_COL });
  }

  hurt() {
    if (this.inv > 0 || this.dead) return;
    if (this.shield) { this.shield = false; this.inv = 1.5; this.popup("GUARD!", this.px, this.py - 14, CYA, 2); audio.power(); this.clearNear(50); return; }
    this.hp--; this.inv = 2.2; this.regen = 20; this.weapon = Math.max(0, this.weapon - 1);
    audio.hurt(); audio.musicEvent("hurt"); this.shake = 9; this.hitstop = 8; this.flash = 0.25; this.flashCol = "#ff2040"; this.burst(this.px, this.py, SENT_COL, 30, 120);
    this.clearNear(60);
    if (this.hp === 1) { this.slow = 0.6; this.popup("DANGER!", PW / 2, PH / 2, SENT_COL, 3); }
    if (this.hp <= 0) this.gameOver();
  }
  clearNear(r: number) { this.eb = this.eb.filter(b => { const d = Math.hypot(b.x - this.px, b.y - this.py) > r; if (!d) this.burst(b.x, b.y, b.col, 1, 30); return d; }); }
  gameOver() {
    this.dead = true; this.place = this.aliveAI + 1; this.myKoBy = this.lastAttacker; this.lbScroll = Math.max(0, this.place - 13); this.net.sendKO(this.lastAttacker); this.state = "over"; this.endT = this.realT; audio.musicEvent("defeat"); audio.explodeBig();
    this.spec = -1; this.specLb = false; this.watched = false; this.startSpectate(this.lastAttacker);
    this.burst(this.px, this.py, YEL, 80, 200); this.burst(this.px, this.py, CYA, 60, 150); this.shake = 14;
  }

  updateBullets(dt: number) {
    for (const b of this.pb) { b.x += b.vx * dt; b.y += b.vy * dt;
      for (const e of this.enemies) {
        if (e.dead || (!e.boss && e.t < e.delay)) continue;
        if (e.boss) {
          const part = this.bossParts(e).find(q => Math.abs(b.x - q.x) < q.rx && Math.abs(b.y - q.y) < q.ry); if (!part) continue;
          if (part.weak) { audio.bossHit(); this.parts.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.05, max: 0.05, col: WHT, s: 2 }); this.damageBoss(e, b.dmg ?? 1, part.tur); }
          else { this.parts.push({ x: b.x, y: b.y, vx: rnd(-40, 40), vy: rnd(20, 60), life: 0.15, max: 0.15, col: "#8090a0", s: 1 }); }
          b.y = -100; break;
        }
        if (Math.abs(b.x - e.x) < 7 && Math.abs(b.y - e.y) < 6) {
          e.hp -= b.dmg ?? 1; b.y = -100; this.parts.push({ x: b.x, y: b.y + 100 - 100, vx: 0, vy: 0, life: 0.05, max: 0.05, col: WHT, s: 2 });
          if (e.boss) audio.bossHit();
          if (e.hp > 0 && e.up) this.chip(e);
          if (e.hp <= 0) this.killEnemy(e, true); break;
        }
      }
    }
    this.pb = this.pb.filter(b => b.y > -10 && b.x > -10 && b.x < PW + 10);
    for (const b of this.eb) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      const dx = b.x - this.px, dy = b.y - this.py, d2 = dx * dx + dy * dy;
      if (d2 < (b.r + 1.5) ** 2) { if (this.inv <= 0) { this.hurt(); b.y = 9999; } }
      else if (!b.grazed && d2 < 100 && !this.dead) { // graze
        b.grazed = true; this.grazes++; this.score += 50;
        if (this.chain > 0) this.chainT = Math.min(this.chainMax, this.chainT + 0.35);
        for (let i = 0; i < 4; i++) this.parts.push({ x: this.px + dx * 0.5, y: this.py + dy * 0.5, vx: rnd(-60, 60), vy: rnd(-60, 60), life: 0.25, max: 0.25, col: YEL, s: 1 });
        audio.graze(this.grazes % 30);
      }
    }
    this.eb = this.eb.filter(b => b.y > -20 && b.y < PH + 20 && b.x > -20 && b.x < PW + 20);
  }

  updateItems(dt: number) {
    for (const it of this.items) {
      it.t += dt;
      if (it.kind === "star") { it.x += it.vx * dt; it.y += it.vy * dt; if (Math.random() < 0.8) this.parts.push({ x: it.x, y: it.y, vx: rnd(-8, 8), vy: rnd(-8, 8), life: 0.5, max: 0.5, col: Math.random() < 0.5 ? YEL : WHT, s: 1 }); }
      else {
        it.vy = Math.min(it.vy + 120 * dt, it.kind === "dot" ? 70 : 45); it.vx *= 0.96;
        const dx = this.px - it.x, dy = this.py - it.y, d = Math.hypot(dx, dy);
        const mag = it.kind === "badge" ? 400 : this.focus ? 60 : 32;
        if (d < mag) { const s = it.kind === "badge" ? 180 : 220; it.x += dx / d * s * dt; it.y += dy / d * s * dt; }
        else { it.x += it.vx * dt; it.y += it.vy * dt; }
      }
      if (Math.hypot(this.px - it.x, this.py - it.y) < (it.kind === "star" ? 11 : 7)) { this.collect(it); it.t = -999; }
    }
    this.items = this.items.filter(it => it.t > -1 && it.y < PH + 20 && it.x > -30 && it.x < PW + 30);
  }
  collect(it: Item) {
    switch (it.kind) {
      case "dot": this.dots++; this.score += 10; this.regen -= 0.4; audio.dot(); break;
      case "W": if (this.weapon < 3) { this.weapon++; this.popup("WEAPON UP!", this.px, this.py - 14, CYA, 1); } else { this.score += 5000; this.popup("MAX 5000", this.px, this.py - 14, CYA, 1); } audio.power(); break;
      case "B": if (this.bombs >= 5) { this.tripleBomb(); break; } this.bombs = Math.min(5, this.bombs + 1); this.popup("+BOMB", this.px, this.py - 14, MAG, 1); audio.power(); break;
      case "F": this.freeze = 5; this.popup("CHAIN FREEZE!", this.px, this.py - 14, CYA, 1); audio.power(); break;
      case "S": { const k = this.specKind = PILOT_SPECIAL[this.pilot] ?? 0, sp = SPECIALS[k]; this.zapT = SPECIAL_SECS; this.zapCd = 0; this.ringCd = 0;
        this.popup(sp.name + "!", this.px, this.py - 16, sp.col, 2); this.popup("SPECIAL WEAPON", this.px, this.py - 4, WHT, 1);
        if (k === 1) audio.inferno(); else if (k === 2) audio.blades(); else audio.lightning(); this.flash = 0.1; this.flashCol = sp.col; break; }
      case "G": this.shield = true; this.popup("GUARD!", this.px, this.py - 14, CYA, 1); audio.power(); break;
      case "badge": this.badges++; this.popup("BADGE +10% ATK", this.px, this.py - 14, YEL, 1); audio.power(); this.burst(it.x, it.y, YEL, 12); break;
      case "star": this.starBoost += 6; this.popup("STARFALL! +6 POWER", this.px, this.py - 18, YEL, 1); audio.star(); this.flash = 0.12; this.flashCol = YEL; this.burst(it.x, it.y, YEL, 25, 120); break;
    }
  }

  updateWaves(dt: number) {
    for (const w of this.waves) {
      w.t += dt; w.acc += dt;
      const rate = 0.07 / Math.min(2, 0.6 + w.power / 40);
      while (w.acc > rate && w.t < w.dur) {
        w.acc -= rate; const sp = 55 + this.ramp * 15;
        if (w.pat === 0) { const x = rnd(0, PW); this.eb.push({ x, y: -4, vx: rnd(-10, 10), vy: sp, r: 2, col: SENT_COL }); }
        else { const a = w.t * 4; for (const s of [-1, 1]) this.eb.push({ x: PW / 2 + s * Math.sin(a) * PW * 0.45, y: -4, vx: 0, vy: sp * 1.1, r: 2, col: YEL }); }
      }
    }
    this.waves = this.waves.filter(w => w.t < w.dur);
  }
  updateWarns(dt: number) {
    const MAX_BOSSES = 2;
    for (const w of this.warns) {
      w.t -= dt;
      // cap simultaneous incoming mini-bosses: extra ones wait (warning keeps flashing) until one is down
      const cap = this.enemies.some(e => e.fb && !e.dead) || this.finalQ ? 1 : MAX_BOSSES; // the final boss fights alone (mini-bosses wait for the gap)
      if (w.t <= 0 && w.tier === 2 && this.enemies.filter(e => e.boss && !e.dead).length >= cap) { w.t = 0.5; continue; }
      if (w.t <= 0) {
        this.flash = 0.12; this.flashCol = SENT_COL; this.shake = Math.max(this.shake, 3);
        if (w.tier === 0) { this.spawnFormation(clamp(3 + Math.floor(w.power / 5), 3, 10), SENT, ri(0, 3), true, w.sender); }
        else if (w.tier === 1) { this.waves.push({ t: 0, dur: 2 + Math.min(3, w.power / 16), power: w.power, acc: 0, pat: ri(0, 1) }); }
        else this.spawnBoss(w.variant ?? 0, w.power, w.sender);
        for (let i = 0; i < 20; i++) this.parts.push({ x: w.x + rnd(-20, 20), y: rnd(0, 30), vx: 0, vy: rnd(20, 80), life: 0.4, max: 0.4, col: SENT_COL, s: 2 });
      }
    }
    this.warns = this.warns.filter(w => w.t > 0);
    if (this.finalQ && !this.dead) { this.finalQ.t -= dt; if (this.finalQ.t <= 0) { const q = this.finalQ; this.finalQ = null; const op = this.rivals.find(r => r.alive); if (op && this.duel) this.spawnFinal(op.avatar, op.id, q.again); } }
  }

  // ---------- opponents (state arrives via this.net) ----------
  hints() { return { time: this.time, calm: this.calm, ramp: this.ramp, localBadges: this.badges, localArmed: this.eligible, localDead: this.dead, duel: this.duel }; }
  updateRivals(dt: number) {
    for (const r of this.rivals) { if (!r.alive) { r.koT += dt; continue; } r.flash -= dt; r.ai += dt; }
    if (this.state === "play" && !this.dead) {
      if (this.time % 0.25 < dt) this.net.sendState(this.hp, this.badges, this.targets, this.eligible);
      if (this.watched) { this.snapT -= dt; if (this.snapT <= 0) { this.snapT = Math.max(0, this.snapT + 1 / 15); this.net.sendSnap(this.buildSnap()); } } // someone spectates us
    }
    if (!this.duel && this.aliveAI === 1 && !this.dead) { const op = this.rivals.find(r => r.alive); if (op) this.finalQ = { t: 2.6, pilot: op.avatar, sender: op.id, again: false }; this.duel = true; this.slow = 1.2; this.popup("FINAL DUEL!", PW / 2, PH / 2 - 10, YEL, 4); this.warpT = 1.4; this.flash = 0.4; this.flashCol = YEL; }
    if (this.aliveAI === 0 && !this.dead && this.state === "play") { for (const r of this.rivals) if (!r.place) r.place = 2; this.lbScroll = 0; this.buildWinStars(); this.state = "win"; this.place = 1; this.endT = this.realT; this.popup("VICTORY!", PW / 2, PH / 2, YEL, 4); audio.musicEvent("victory"); }
  }
  koRival(v: Rival, killer: number, place: number, badges: number) {
    v.alive = false; v.hp = 0; v.place = place; v.koT = 0; v.badges = badges; v.koBy = killer; if (killer === -1) this.myKos++;
    const cp = this.cellPos(v.id); if (this.ripples.length < 12) this.ripples.push({ x: cp.x + CELL_W / 2, y: cp.y + CELL_H / 2, t: 0, gold: killer === -1 });
    for (let i = 0; i < 26; i++) { const a = Math.random() * 6.283, s = rnd(20, 90); this.uiParts.push({ x: cp.x + rnd(0, CELL_W), y: cp.y + rnd(0, CELL_H), vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: rnd(0.5, 1), max: 1, col: pick([COLORS[v.col], WHT, "#6040a0"]), s: ri(1, 3), g: 160 }); }
    this.kos++;
    // background starfall streak for every KO
    this.streaks.push({ x: rnd(0, PW), y: -10, vx: rnd(-40, 40), vy: rnd(160, 240), life: 2, col: COLORS[v.col], big: false });
    if (killer === -1) {
      this.popup("K.O.!", PW / 2, PH / 2 + 20, YEL, 3); audio.ko(); audio.musicEvent("ko"); this.shake = 4; this.score += 10000;
      const nb = 1 + Math.floor(v.badges / 2);
      for (let i = 0; i < nb; i++) { this.items.push({ x: rnd(30, PW - 30), y: -10 - i * 10, vx: 0, vy: 40, kind: "badge", t: 0 }); }
      const fromLeft = Math.random() < 0.5; // catchable shooting star
      this.items.push({ x: fromLeft ? -5 : PW + 5, y: rnd(20, 60), vx: (fromLeft ? 1 : -1) * rnd(45, 65), vy: rnd(50, 70), kind: "star", t: 0 });
    }
  }
  updateProjs(dt: number) {
    for (const p of this.projs) {
      p.t += dt / p.dur;
      if (Math.random() < 0.9) { const q = this.projPos(p); this.uiParts.push({ x: q.x, y: q.y, vx: rnd(-10, 10), vy: rnd(-10, 10), life: 0.3, max: 0.3, col: p.col, s: 1 }); }
      if (p.t >= 1) {
        if (p.out) {
          const r = this.rivals[p.target];
          this.burst(p.ex, p.ey, p.col, 16, 60, true);
          void r; // damage was sent at launch; the projectile is visual only
        } else {
          if (this.dead) continue;
          if (this.shield) { this.shield = false; this.popup("ATTACK BLOCKED!", PW / 2, 40, CYA, 2); audio.power(); continue; }
          this.warns.push({ t: 1.3, tier: p.tier, power: p.power, sender: p.sender, x: p.ex - PX, variant: p.variant }); audio.incoming(p.tier); audio.musicEvent("incoming", p.tier);
          this.popup("INCOMING " + ["ENEMY RUSH!", "BULLET WAVE!", "MINI-BOSS!"][p.tier], PW / 2, 26, SENT_COL, 2);
          this.popup("FROM " + (this.rivals[p.sender]?.name || "?"), PW / 2, 42, "#ff9090", 1);
        }
      }
    }
    this.projs = this.projs.filter(p => p.t < 1);
  }
  projPos(p: Proj) { const t = Math.min(1, p.t), e = t * t * (3 - 2 * t); const mx = (p.sx + p.ex) / 2, my = Math.min(p.sy, p.ey) - 40;
    const x = (1 - e) * (1 - e) * p.sx + 2 * (1 - e) * e * mx + e * e * p.ex, y = (1 - e) * (1 - e) * p.sy + 2 * (1 - e) * e * my + e * e * p.ey; return { x, y }; }

  updateFx(dt: number) {
    for (const L of [this.parts, this.uiParts]) for (const p of L) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) p.vy += p.g * dt; p.life -= dt; }
    this.parts = this.parts.filter(p => p.life > 0); this.uiParts = this.uiParts.filter(p => p.life > 0);
    if (this.parts.length > 1500) this.parts.splice(0, this.parts.length - 1500);
    for (const p of this.popups) p.t += dt; this.popups = this.popups.filter(p => p.t < 1.3);
    for (let i = 0; i < 5; i++) this.bgW[i] += (BG_TARGET[this.vStage][i] - this.bgW[i]) * Math.min(1, dt * 0.6);
    for (const q of this.ripples) q.t += dt; this.ripples = this.ripples.filter(q => q.t < 1.2);
    if (this.cutIn) { this.cutIn.t += dt / (this.cutIn.dur ?? 0.9) * 0.9; if (this.cutIn.t > 0.9) this.cutIn = null; }
    this.warpT = Math.max(0, this.warpT - dt); this.winT += dt;
    this.shake = Math.max(0, this.shake - dt * 30); this.flash = Math.max(0, this.flash - dt); this.bombFx = Math.max(0, this.bombFx - dt);
    for (const s of this.bgStars) { s.y += s.z * 30 * dt * (this.state === "play" ? Math.sqrt(this.ramp) : 1); if (s.y > PH) { s.y = 0; s.x = Math.random() * PW; } }
    // starfall sky density grows with KOs; meteor shower in the final duel
    const rate = this.duel || this.state === "win" ? 12 : this.kos * 0.03;
    if (Math.random() < rate * dt) this.streaks.push({ x: rnd(-40, PW + 40), y: -10, vx: rnd(-50, 30), vy: rnd(120, 260), life: 3, col: pick(COLORS), big: this.duel && Math.random() < 0.3 });
    for (const s of this.streaks) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
    this.streaks = this.streaks.filter(s => s.life > 0 && s.y < PH + 20);
  }

  // ---------- lobby tick (also runs behind the CONTROLS screen) ----------
  tickLobby(dt: number) { this.net.tick(dt, this.hints()); if (this.lobbyCd > 0) this.lobbyCd -= dt; }
  titleSel = 0;

  // ---------- spectator mode (online): watch live humans after you are out ----------
  spec = -1; specLb = false; specSnaps: { t: number; s: Snap }[] = []; specParts: Part[] = []; specCount = 0; specMsg = ""; specMsgT = 0;
  watched = false; snapT = 0; uidN = 0; viewing = false;
  specIds() { return this.rivals.filter(r => r.alive && !r.isBot).map(r => r.id); }
  specOn() { return this.state === "over" && this.spec >= 0 && !this.specLb; }
  startSpectate(prefer = -2) {
    if (!this.net.online || this.state !== "over") return;
    const ids = this.specIds(); if (!ids.length) { this.stopSpectate(); return; }
    this.setSpec(ids.includes(prefer) ? prefer : ids[0]);
  }
  setSpec(id: number) { if (id === this.spec) return; this.spec = id; this.specSnaps = []; this.specParts = []; this.net.spectate(id); }
  stopSpectate() { if (this.spec >= 0) this.net.spectate(-2); this.spec = -1; this.specSnaps = []; this.specLb = false; }
  cycleSpec(d: number) {
    const ids = this.specIds(); if (!ids.length) return;
    const i = ids.indexOf(this.spec); this.setSpec(ids[i < 0 ? 0 : (i + d + ids.length) % ids.length]); audio.tone(660, 0.04, "square", 0.05);
  }
  /** Compact snapshot of our live gameplay for spectators (ints only; see Snap in net.ts). */
  buildSnap(): Snap {
    const R = Math.round, ci = (c: string) => Math.max(0, SNAP_COLS.indexOf(c));
    const p = [R(this.px), R(this.py), this.hp, this.bombs, this.chain, this.chainCol, this.eligible ? 1 : 0, R(clamp(this.chainT / this.chainMax, 0, 1) * 100), this.score, this.weapon,
      this.shield ? 1 : 0, this.focus ? 1 : 0, this.inv > 0 ? 1 : 0, this.badges, this.mode, this.freeze > 0 ? 1 : 0, this.zapT > 0 ? 1 + this.specKind : 0, R(this.regen), this.starBoost, this.kos, R(this.bombFx * 100)];
    const e: number[][] = [];
    for (const q of this.enemies) {
      if (q.dead || (!q.boss && q.t < q.delay)) continue; if (!q.uid) q.uid = ++this.uidN;
      if (q.boss) { const v = [q.uid, R(q.x), R(q.y), -1 - (q.bv ?? 0), R(q.hp), R(q.maxhp ?? 1), q.sender ?? -2, R((q.vis ?? 1) * 100), q.eye ? 1 : 0, R(q.tur?.[0] ?? 0), R(q.tur?.[1] ?? 0), R(q.turMax ?? 1)];
        for (const g of q.segs ?? []) v.push(R(g.x), R(g.y)); e.push(v); }
      else e.push([q.uid, R(q.x), R(q.y), q.spr, q.col, q.up ?? 0, (q.hf ?? 0) > 0 ? 1 : 0]);
      if (e.length >= 80) break;
    }
    const b: number[] = []; for (const q of this.eb.slice(0, 260)) b.push(R(q.x), R(q.y), R(q.vx), R(q.vy), ci(q.col), R(q.r));
    const pb: number[] = []; for (const q of this.pb.slice(-90)) pb.push(R(q.x), R(q.y), R(q.vx), R(q.vy), ci(q.col));
    const it: number[] = []; for (const q of this.items.slice(0, 40)) it.push(R(q.x), R(q.y), Math.max(0, SNAP_ITEMS.indexOf(q.kind)));
    return { p, e, b, pb, it, tg: this.targets.slice(0, 8) };
  }
  addSnap(s: Snap) {
    const prev = this.specSnaps[this.specSnaps.length - 1]; this.specCount++;
    if (prev) { const now = new Set(s.e.map(q => q[0])); // enemies that vanished explode on the spectator's screen
      for (const q of prev.s.e) if (!now.has(q[0]) && q[1] > 0 && q[1] < PW && q[2] > 0 && q[2] < PH - 10) this.specBurst(q[1], q[2], q[3] < 0 ? SENT_COL : allCols[q[4]] ?? WHT, q[3] < 0 ? 60 : 12); }
    this.specSnaps.push({ t: performance.now(), s }); if (this.specSnaps.length > 6) this.specSnaps.shift();
  }
  specBurst(x: number, y: number, col: string, n: number) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = rnd(20, 90); this.specParts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.2, 0.6), max: 0.6, col: i % 4 ? col : WHT, s: Math.random() < 0.3 ? 2 : 1 }); } }
  updateSpecParts(dt: number) {
    this.specMsgT -= dt;
    for (const p of this.specParts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; } this.specParts = this.specParts.filter(p => p.life > 0);
    if (this.specOn() && Math.random() < 0.7) { const v = this.specView(); if (v) this.specParts.push({ x: v.px + rnd(-1, 1), y: v.py + 7, vx: rnd(-10, 10), vy: rnd(60, 120), life: 0.2, max: 0.2, col: Math.random() < 0.5 ? CYA : WHT, s: 1 }); }
  }
  /** Interpolated view of the watched player (~110 ms behind): ship/enemies lerp between snapshots, bullets extrapolate by velocity. */
  specView(): Record<string, any> | null {
    const S = this.specSnaps; if (!S.length) return null;
    const now = performance.now() - 110;
    let i = S.length - 1; while (i > 0 && S[i].t > now) i--;
    const A = S[i], B = S[Math.min(i + 1, S.length - 1)], k = B === A ? 0 : clamp((now - A.t) / (B.t - A.t), 0, 1), dA = clamp((now - A.t) / 1000, 0, 0.2);
    const L = (a: number, b: number) => a + (b - a) * k, P = A.s.p, Q = B.s.p;
    const nb = new Map(B.s.e.map(q => [q[0], q]));
    const enemies = A.s.e.map(q => { const r = nb.get(q[0]) ?? q, x = L(q[1], r[1]), y = L(q[2], r[2]);
      const base = { x, y, t: this.realT + q[0] * 0.37, delay: 0, path: 0, x0: 0, y0: 0, idx: 0, form: -1, fireCd: 0, entered: true, dead: false };
      if (q[3] >= 0) return { ...base, hp: 1, col: q[4], spr: q[3], up: q[5], hf: q[6] ? 0.05 : 0 } as Enemy;
      const segs: { x: number; y: number }[] = []; for (let j = 12; j + 1 < q.length; j += 2) segs.push({ x: q[j], y: q[j + 1] });
      return { ...base, boss: true, bv: -1 - q[3], hp: q[4], maxhp: q[5], sender: q[6], vis: q[7] / 100, eye: !!q[8], tur: [q[9], q[10]], turMax: q[11], segs, col: SENT, spr: 0 } as Enemy;
    });
    const eb: Bullet[] = []; for (let j = 0; j + 5 < A.s.b.length + 1; j += 6) { const b = A.s.b; eb.push({ x: b[j] + b[j + 2] * dA, y: b[j + 1] + b[j + 3] * dA, vx: 0, vy: 0, r: b[j + 5], col: SNAP_COLS[b[j + 4]] ?? MAG }); }
    const pb: Bullet[] = []; for (let j = 0; j + 4 < A.s.pb.length + 1; j += 5) { const b = A.s.pb; pb.push({ x: b[j] + b[j + 2] * dA, y: b[j + 1] + b[j + 3] * dA, vx: 0, vy: 0, r: 2, col: SNAP_COLS[b[j + 4]] ?? MAG }); }
    const items: Item[] = []; for (let j = 0; j + 2 < B.s.it.length; j += 3) items.push({ x: B.s.it[j], y: B.s.it[j + 1], vx: 0, vy: 0, kind: SNAP_ITEMS[B.s.it[j + 2]] ?? "dot", t: this.realT });
    return { viewing: true, dead: false, px: L(P[0], Q[0]), py: L(P[1], Q[1]), hp: Q[2], bombs: Q[3], chain: Q[4], chainCol: Q[5], eligible: !!Q[6], chainT: Q[7] / 100 * this.chainMax, score: Q[8],
      weapon: Q[9], shield: !!Q[10], focus: !!Q[11], inv: Q[12] ? 0.5 : 0, badges: Q[13], mode: Q[14], freeze: Q[15] ? 1 : 0, zapT: Q[16] ? 1 : 0, specKind: Math.max(0, (Q[16] || 1) - 1), flames: [], blasts: [], blades: [], regen: Q[17], starBoost: Q[18], kos: Q[19], bombFx: (Q[20] || 0) / 100,
      enemies, eb, pb, items, targets: B.s.tg.filter(t => t >= 0 && t < 100), parts: this.specParts, popups: [], bolts: [], warns: [], waves: [], tripleQ: [], bombAt: null, bombCol: MAG, chainPulse: 0, cutIn: null, flash: 0 };
  }
  renderSpecBanner() {
    const r = this.rivals[this.spec]; if (!r) return;
    const ids = this.specIds(), n = ids.length, i = ids.indexOf(this.spec) + 1, x = PX + 4, w = PW - 8, h = 40, y = PY + 18;
    // highlight the watched pilot's grid cell
    const cp = this.cellPos(r.id), bl = Math.floor(this.realT * 4) % 2; ctx.lineWidth = 2; ctx.strokeStyle = bl ? CYA : WHT; ctx.strokeRect(cp.x - 1, cp.y - 1, CELL_W + 2, CELL_H + 2); ctx.lineWidth = 1;
    ctx.fillStyle = "rgba(6,2,14,0.86)"; ctx.fillRect(x, y, w, h); this.frame(x, y, w, h, CYA);
    if (Math.floor(this.realT * 2) % 2) { ctx.fillStyle = SENT_COL; ctx.fillRect(x + 4, y + 4, 4, 4); }
    drawText(ctx, "LIVE", x + 11, y + 4, SENT_COL, 1);
    drawText(ctx, "SPECTATING " + r.name, x + w / 2, y + 3, YEL, 2, "center", "#000");
    if (n > 1) drawText(ctx, i + "/" + n, x + w - 5, y + 4, CYA, 1, "right");
    const hint = pad.connected ? "< LB / RB > SWITCH PILOT   Y LEADERBOARD" : "< LEFT / RIGHT > SWITCH PILOT   L LEADERBOARD";
    drawText(ctx, hint, x + w / 2, y + 20, "#b080ff", 1, "center");
    drawText(ctx, pad.connected ? "START: NEW MATCH    B: TITLE SCREEN" : "ENTER: NEW MATCH    ESC: TITLE SCREEN", x + w / 2, y + 30, YEL, 1, "center");
    if (!this.specSnaps.length) drawText(ctx, "CONNECTING TO " + r.name + "...", PX + PW / 2, PY + PH / 2, CYA, 1, "center");
    if (this.specMsgT > 0) drawText(ctx, this.specMsg, PX + PW / 2, PY + 40, YEL, 1, "center", "#000");
  }

  // ---------- CONTROLS screen: rebind keyboard / controller separately ----------
  ctlBack: State = "title"; ctlDev: Dev = "key"; ctlRow = 0; ctlCol = 0; ctlMsg = ""; ctlMsgT = 0;
  ctlBind: { act: Act; slot: number; dev: Dev; t: number; armed: boolean } | null = null;
  openControls() { this.ctlBack = this.state; this.state = "controls"; this.ctlRow = 0; this.ctlCol = 0; this.ctlBind = null; this.ctlDev = pad.connected ? "pad" : "key"; audio.init(); }
  ctlNote(m: string) { this.ctlMsg = m; this.ctlMsgT = 2.5; }
  updateControls(dt: number) {
    this.ctlMsgT -= dt; const NR = ACTIONS.length + 2, beep = (f: number) => audio.tone(f, 0.04, "square", 0.05);
    const B = this.ctlBind;
    if (B) { // waiting for the new key / button
      B.t += dt; const lab = ACTIONS.find(a => a.id === B.act)!.label;
      const apply = (code: string) => {
        if (RESERVED[B.dev].includes(code)) { this.ctlNote(codeName(B.dev, code) + " IS RESERVED"); return false; }
        const sw = bind(B.dev, B.act, B.slot, code); this.ctlBind = null; beep(880);
        this.ctlNote(sw ? codeName(B.dev, code) + " MOVED FROM " + ACTIONS.find(a => a.id === sw)!.label + " (NOW " + codeName(B.dev, binds[B.dev][sw][B.slot] || binds[B.dev][sw][1 - B.slot]) + ")" : lab + " = " + codeName(B.dev, code));
        return true;
      };
      if (hit("Escape") || (B.dev === "pad" && hit("B9")) || B.t > 8) { this.ctlBind = null; typed.length = 0; this.ctlNote("CANCELLED"); return; }
      if (B.dev === "key") { for (const c of typed.splice(0)) if (apply(c)) break; }
      else if (!B.armed) { if (!pad.held.size) B.armed = true; } // wait until the button that opened this is released
      else for (const c of pad.held) if (apply(c)) break;
      return;
    }
    if (hit("Escape", "PadB")) { this.state = this.ctlBack === "controls" ? "title" : this.ctlBack; beep(330); return; }
    if (hit("Tab", "KeyQ", "KeyE", "PadLB", "PadRB")) { this.ctlDev = this.ctlDev === "key" ? "pad" : "key"; beep(660); }
    if (hit("ArrowUp", "KeyW", "PadUp")) { this.ctlRow = (this.ctlRow + NR - 1) % NR; beep(520); }
    if (hit("ArrowDown", "KeyS", "PadDown")) { this.ctlRow = (this.ctlRow + 1) % NR; beep(520); }
    if (hit("ArrowLeft", "KeyA", "PadLeft")) { if (this.ctlCol === 0) this.ctlDev = this.ctlDev === "key" ? "pad" : "key"; else this.ctlCol = 0; beep(600); }
    if (hit("ArrowRight", "KeyD", "PadRight")) { if (this.ctlCol === 1) this.ctlDev = this.ctlDev === "key" ? "pad" : "key"; else this.ctlCol = 1; beep(600); }
    const act = ACTIONS[this.ctlRow];
    if (act && hit("Backspace", "Delete", "PadX")) { clearBind(this.ctlDev, act.id, this.ctlCol); this.ctlNote(act.label + " SLOT " + (this.ctlCol + 1) + " CLEARED"); beep(330); }
    if (hit("Enter", "Space", "PadA")) {
      if (act) { this.ctlBind = { act: act.id, slot: this.ctlCol, dev: this.ctlDev, t: 0, armed: false }; typed.length = 0; beep(760); }
      else if (this.ctlRow === ACTIONS.length) { resetBinds(this.ctlDev); this.ctlNote((this.ctlDev === "key" ? "KEYBOARD" : "CONTROLLER") + " DEFAULTS RESTORED"); beep(990); }
      else { this.state = this.ctlBack === "controls" ? "title" : this.ctlBack; beep(330); }
    }
  }
  renderControls() {
    const x = 56, w = 528, y = 6, h = 348, dev = this.ctlDev, B = this.ctlBind;
    ctx.fillStyle = "rgba(6,2,14,0.95)"; ctx.fillRect(x, y, w, h); this.frame(x, y, w, h, MAG);
    drawText(ctx, "CONTROLS", W / 2, y + 7, MAG, 3, "center", "#3a0040");
    ["KEYBOARD", "CONTROLLER"].forEach((t, i) => { const on = (i === 0) === (dev === "key"), tx = W / 2 - 128 + i * 132;
      ctx.fillStyle = on ? MAG : "#1a0a30"; ctx.fillRect(tx, y + 28, 124, 13); if (on) { ctx.fillStyle = YEL; ctx.fillRect(tx, y + 41, 124, 1); }
      drawText(ctx, t, tx + 62, y + 32, on ? WHT : "#8070b0", 1, "center"); });
    drawText(ctx, pad.connected ? "TAB / LB RB" : "TAB", W / 2 + 140, y + 32, "#5a4a8a", 1);
    if (dev === "pad" && !pad.connected) drawText(ctx, "NO CONTROLLER DETECTED - PRESS A BUTTON", W / 2, y + 46, SENT_COL, 1, "center");
    const top = y + 56, C1 = x + 190, C2 = x + 350, CW = 150;
    drawText(ctx, "ACTION", x + 18, top, "#8070b0", 1); drawText(ctx, "BIND 1", C1 + CW / 2, top, "#8070b0", 1, "center"); drawText(ctx, "BIND 2", C2 + CW / 2, top, "#8070b0", 1, "center");
    ACTIONS.forEach((a, i) => {
      const ry = top + 10 + i * 15, sel = i === this.ctlRow, bs = binds[dev][a.id], none = !bs[0] && !bs[1];
      if (sel) { ctx.fillStyle = "#24083c"; ctx.fillRect(x + 10, ry - 3, w - 20, 13); ctx.fillStyle = YEL; ctx.fillRect(x + 10, ry - 3, 2, 13); }
      drawText(ctx, a.label, x + 18, ry, sel ? YEL : none ? "#a05070" : WHT, 1);
      [C1, C2].forEach((cx, s) => {
        const cur = sel && this.ctlCol === s, wait = !!B && B.act === a.id && B.slot === s && B.dev === dev;
        ctx.fillStyle = wait ? (Math.floor(this.realT * 6) % 2 ? "#5a1050" : "#3a0838") : cur ? "#3a1060" : "#140628"; ctx.fillRect(cx, ry - 2, CW, 11);
        if (cur) { ctx.strokeStyle = wait ? MAG : YEL; ctx.strokeRect(cx + 0.5, ry - 1.5, CW - 1, 10); }
        const fixed = dev === "pad" && a.id === "pause" && s === 0 && !bs[0];
        drawText(ctx, wait ? "PRESS..." : fixed ? "START (FIXED)" : codeName(dev, bs[s]), cx + CW / 2, ry, wait ? YEL : bs[s] ? (cur ? WHT : CYA) : "#4a3a6a", 1, "center");
      });
    });
    const ry = top + 10 + ACTIONS.length * 15 + 4;
    ["RESET " + (dev === "key" ? "KEYBOARD" : "CONTROLLER") + " TO DEFAULTS", "BACK"].forEach((t, j) => { const sel = this.ctlRow === ACTIONS.length + j, bx = W / 2 - 110 + j * 150, bw = j ? 70 : 140;
      ctx.fillStyle = sel ? MAG : "#1a0a30"; ctx.fillRect(bx, ry, bw, 13); if (sel) { ctx.strokeStyle = YEL; ctx.strokeRect(bx + 0.5, ry + 0.5, bw - 1, 12); }
      drawText(ctx, t, bx + bw / 2, ry + 4, sel ? WHT : "#b080ff", 1, "center"); });
    const hy = y + h - 22;
    drawText(ctx, pad.connected ? "D-PAD MOVE   A BIND   X CLEAR   B BACK   LB/RB DEVICE" : "ARROWS MOVE   ENTER BIND   DEL CLEAR   ESC BACK   TAB DEVICE", W / 2, hy, CYA, 1, "center");
    drawText(ctx, this.ctlMsgT > 0 ? this.ctlMsg : "TAKEN KEYS SWAP   ENTER / ESC / START ARE RESERVED   SAVED ON THIS DEVICE", W / 2, hy + 11, this.ctlMsgT > 0 ? "#60ff80" : "#8070b0", 1, "center");
    if (B) { const lab = ACTIONS.find(a => a.id === B.act)!.label, bw = 300, bx = (W - bw) / 2, by = 150;
      ctx.fillStyle = "rgba(6,2,14,0.96)"; ctx.fillRect(bx, by, bw, 54); this.frame(bx, by, bw, 54, YEL);
      drawText(ctx, (B.dev === "key" ? "PRESS A KEY" : "PRESS A BUTTON / STICK") + " FOR", W / 2, by + 8, WHT, 1, "center");
      drawText(ctx, lab, W / 2, by + 19, YEL, 2, "center", "#000");
      drawText(ctx, (B.dev === "key" ? "ESC" : "START / ESC") + " CANCEL   " + Math.ceil(8 - B.t) + "S", W / 2, by + 40, "#8070b0", 1, "center"); }
  }

  // ---------- render ----------
  render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#06020e"; ctx.fillRect(0, 0, W, H);
    const sx = this.shake > 0 ? Math.round(rnd(-1, 1) * this.shake) : 0, sy = this.shake > 0 ? Math.round(rnd(-1, 1) * this.shake) : 0;
    if (this.state === "title") { this.renderTitle(); this.drawPadMsg(); return; }
    if (this.state === "lobby") { this.renderTitle(true); this.renderLobby(); this.drawPadMsg(); return; }
    if (this.state === "name") { this.renderTitle(true); this.renderName(); this.drawPadMsg(); return; }
    if (this.state === "pilot") { this.renderTitle(true, true); this.renderPilot(); this.drawPadMsg(); return; }
    if (this.state === "controls") { this.renderTitle(true, true); this.renderControls(); this.drawPadMsg(); return; }
    // spectating: temporarily swap in the watched player's interpolated state and draw it with the normal renderer
    const sv = this.specOn() && this.realT - this.endT > 1 ? this.specView() : null, saved: Record<string, any> = {};
    if (sv) { for (const k in sv) saved[k] = (this as any)[k]; Object.assign(this, sv); }
    try { this.renderMain(sx, sy); } finally { if (sv) Object.assign(this, saved); }
    if (this.specOn()) this.renderSpecBanner();
    this.drawPadMsg();
    if (this.paused) this.renderPause();
    if (this.duel && this.state === "play" && !this.dead) this.renderDuelBar();
    if (this.state === "over" && this.realT - this.endT > 0.5 && !this.specOn()) this.renderLeaderboard(false);
    if (this.state === "win" && this.realT - this.endT > 4.5) this.renderLeaderboard(true);
  }
  renderMain(sx: number, sy: number) {
    ctx.setTransform(1, 0, 0, 1, sx * 0.3, sy * 0.3);
    this.renderPanels();
    ctx.setTransform(1, 0, 0, 1, sx, sy);
    this.renderField();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const amp = Math.max(this.bombFx / 0.6 * 7, this.tripleQ.length ? 7 : 0, this.warpT * 5);
    if (amp > 0.3) rasterWave(ctx, canvas, PX, PY, PW, PH, amp, this.realT);
    if (!fxCfg.low) bloom(ctx, canvas, PX, PY, PW, PH, 0.42);
    if (this.cutIn) this.renderCutIn();
    ctx.setTransform(1, 0, 0, 1, sx * 0.3, sy * 0.3); this.renderBottom();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const p of this.uiParts) { ctx.globalAlpha = clamp(p.life / p.max * 1.5, 0, 1); ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); } ctx.globalAlpha = 1;
    for (const p of this.projs) { const q = this.projPos(p); ctx.fillStyle = p.col; ctx.fillRect(Math.round(q.x) - 2, Math.round(q.y) - 2, 5, 5); ctx.fillStyle = WHT; ctx.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, 3, 3); }
    if (this.flash > 0) { ctx.globalAlpha = Math.min(0.5, this.flash * 2); ctx.fillStyle = this.flashCol; ctx.fillRect(PX, PY, PW, PH); ctx.globalAlpha = 1; }
  }
  renderCutIn() { // thin strip sliding along the top edge of the play area
    const c = this.cutIn!, t = c.t, e = t < 0.14 ? t / 0.14 : t > 0.68 ? Math.max(0, 1 - (t - 0.68) / 0.22) : 1, out = t > 0.68;
    const bh = 24, ox = Math.round((1 - e) * (out ? PW : -PW));
    ctx.save(); ctx.beginPath(); ctx.rect(PX, PY, PW, PH); ctx.clip(); ctx.translate(PX + ox, PY + 1);
    ctx.fillStyle = "rgba(20,4,30,0.9)"; ctx.fillRect(0, 0, PW, bh);
    for (let i = 0; i < 6; i++) { const lx = ((i * 53 + t * 900) % (PW + 40)) - 20; ctx.fillStyle = i % 2 ? "rgba(255,48,208,0.35)" : "rgba(255,230,80,0.3)"; ctx.fillRect(Math.round(lx), 4 + (i * 7) % (bh - 8), 18, 1); }
    ctx.fillStyle = YEL; ctx.fillRect(0, bh - 1, PW, 1); ctx.fillStyle = MAG; ctx.fillRect(0, bh - 2, PW, 1);
    ctx.fillStyle = "#000"; ctx.fillRect(2, 1, 22, 22); ctx.drawImage(pilotSpr, 3, 2, 20, 20); ctx.strokeStyle = YEL; ctx.strokeRect(2.5, 1.5, 21, 21);
    if (c.boss !== undefined) { const sp = finalSprite(c.boss), col = FINAL_BOSSES[c.boss].pal[2], k = Math.min(1, 20 / sp.height);
      drawText(ctx, c.title + ": " + c.name, 30, 4, Math.floor(t * 20) % 2 ? WHT : col, 1); drawText(ctx, c.sub ?? "", 30, 14, WHT, 1);
      ctx.drawImage(sp, PW - 6 - Math.round(sp.width * k), 2, Math.round(sp.width * k), Math.round(sp.height * k)); }
    else { drawText(ctx, "MINI-BOSS SENT!", 30, 4, YEL, 1); drawText(ctx, "INCOMING FOR " + c.name, 30, 14, WHT, 1);
      ctx.drawImage(bossSpr, PW - 46, 2, 42, 20); }
    ctx.restore();
  }
  buildWinStars() {
    const [tc, tg] = (() => { const c = document.createElement("canvas"); c.width = PW; c.height = 120; return [c, c.getContext("2d")!] as const; })();
    drawText(tg, "1ST", PW / 2, 10, "#fff", 12, "center"); const d = tg.getImageData(0, 0, PW, 120).data; this.winStars = []; this.winT = 0;
    for (let y = 0; y < 120; y += 3) for (let x = 0; x < PW; x += 3) if (d[(y * PW + x) * 4 + 3] > 100) {
      const tx = x, ty = y + 70; this.winStars.push({ x: tx, y: ty, sx: tx + rnd(-140, 140), sy: -rnd(10, 260), at: rnd(0.4, 2.6), col: pick([YEL, WHT, CYA, MAG, YEL]) }); }
    void tc;
  }
  renderWinStars() {
    const t = this.winT;
    for (const s of this.winStars) {
      const k = clamp(t / s.at, 0, 1), e = 1 - Math.pow(1 - k, 3), x = s.sx + (s.x - s.sx) * e, y = s.sy + (s.y - s.sy) * e;
      if (k < 1) this.drawStreak(x, y, s.x - s.sx, s.y - s.sy, s.col, true);
      else { const tw = Math.floor(this.realT * 8 + s.x) % 4; ctx.fillStyle = tw ? s.col : WHT; ctx.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, 3, 3); if (!tw) { ctx.fillRect(Math.round(s.x) - 2, Math.round(s.y), 5, 1); } }
    }
  }
  renderDuelBar() {
    const r = this.rivals.find(q => q.alive); if (!r) return;
    const x = PX + 16, y = PY + 12, w = PW - 32, seg = w / DUEL_HP;
    ctx.fillStyle = "rgba(6,2,14,0.8)"; ctx.fillRect(x - 3, y - 2, w + 6, 22);
    drawText(ctx, "FINAL RIVAL  " + r.name, x, y, YEL, 1); drawText(ctx, "HP " + Math.max(0, r.hp) + "/" + DUEL_HP, x + w, y, MAG, 1, "right");
    const fl = r.flash > 0 && Math.floor(this.realT * 20) % 2;
    for (let i = 0; i < DUEL_HP; i++) { ctx.fillStyle = i < r.hp ? (fl ? WHT : i < 4 ? "#ff3040" : MAG) : DIM; ctx.fillRect(Math.round(x + i * seg), y + 10, Math.ceil(seg) - 2, 6); }
  }
  drawPadMsg() { if (this.padMsgT > 0) { const w = textWidth(this.padMsg, 1) + 16; ctx.fillStyle = "#000"; ctx.fillRect((W - w) / 2, 2, w, 13); this.frame((W - w) / 2, 2, w, 13, "#60ff80"); drawText(ctx, this.padMsg, W / 2, 6, "#60ff80", 1, "center"); } }
  /** Online match with another human in it: the pause menu must not freeze this player's field (it is a shared race). */
  liveMatch() { return this.net.online && this.rivals.some(r => !r.isBot); }
  renderPause() {
    const w = 196, h = 84, x = PX + (PW - w) / 2, y = PY + PH / 2 - h / 2;
    ctx.fillStyle = "rgba(6,2,14,0.88)"; ctx.fillRect(x, y, w, h); this.frame(x, y, w, h, CYA);
    const live = this.liveMatch();
    if (live) drawText(ctx, "MATCH IN PROGRESS", PX + PW / 2, y + 10, YEL, 2, "center", "#000"); else drawText(ctx, "PAUSED", PX + PW / 2, y + 8, CYA, 3, "center", "#000");
    [live ? "BACK TO MATCH" : "RESUME", this.net.online ? "QUIT TO TITLE (FORFEIT)" : "QUIT TO TITLE"].forEach((t, i) => { const sel = i === this.pauseSel;
      drawText(ctx, (sel ? "> " : "") + t + (sel ? " <" : ""), PX + PW / 2, y + 34 + i * 12, sel ? YEL : "#8070b0", 1, "center"); });
    drawText(ctx, pad.connected ? (live ? "D-PAD PICK  A SELECT  START/B CLOSE" : "D-PAD PICK  A SELECT  START/B RESUME") : "UP/DOWN PICK  ENTER SELECT  " + kn("pause") + (live ? "/ESC CLOSE" : "/ESC RESUME"), PX + PW / 2, y + h - 12, CYA, 1, "center");
  }
  centerBox(lines: string[], col: string) {
    const w = 196, h = 20 + lines.length * 14, x = PX + (PW - w) / 2, y = PY + PH / 2 - h / 2;
    ctx.fillStyle = "rgba(6,2,14,0.88)"; ctx.fillRect(x, y, w, h); this.frame(x, y, w, h, col);
    lines.forEach((l, i) => { const big = i === 0; drawText(ctx, l, PX + PW / 2, y + 10 + i * 14 + (big ? -2 : 2), big ? col : WHT, big ? 3 : 1, "center", big ? "#000" : undefined); });
  }
  frame(x: number, y: number, w: number, h: number, col: string) {
    if (!fxCfg.low) { ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1); ctx.globalAlpha = 1; cycleRect(ctx, x, y, w, h, this.hue(), this.realT); return; }
    ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); ctx.globalAlpha = 0.35; ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1); ctx.globalAlpha = 1; }

  renderLobby() {
    const w = 300, h = 160, x = (W - w) / 2, y = 180; ctx.fillStyle = "rgba(6,2,14,0.94)"; ctx.fillRect(x, y, w, h); this.frame(x, y, w, h, CYA);
    drawText(ctx, (this.net.online ? "ONLINE " : "OFFLINE ") + "LOBBY  " + this.lobbyCount + " / " + MAX_PLAYERS, W / 2, y + 8, this.net.online ? "#60ff80" : CYA, 2, "center");
    ctx.fillStyle = DIM; ctx.fillRect(x + 10, y + 24, w - 20, 5); ctx.fillStyle = MAG; ctx.fillRect(x + 10, y + 24, Math.round((w - 20) * this.lobbyCount / MAX_PLAYERS), 5);
    this.lobbyLog.slice(-9).forEach((l, i) => drawText(ctx, l, x + 12, y + 36 + i * 10, l.startsWith(this.name + " ") || l.startsWith("YOU") ? YEL : l.includes("LEFT") ? "#8070b0" : "#60ff80", 1));
    const hum = Math.max(this.lobbyHumans, this.lobbyLog.length ? 1 : 0);
    drawText(ctx, "HUMANS " + this.lobbyHumans + "  AI BOTS WILL FILL " + (MAX_PLAYERS - this.lobbyHumans) + " SLOTS", x + w - 12, y + 36, CYA, 1, "right"); void hum;
    drawText(ctx, (pad.connected ? "Y" : "C") + ": CONTROLS", x + w - 12, y + h - 36, "#b080ff", 1, "right");
    const cd = this.lobbyCd > 0 ? "MATCH STARTS IN " + Math.ceil(this.lobbyCd) + "S" : "WAITING FOR PLAYERS";
    drawText(ctx, cd, W / 2, y + h - 24, YEL, 1, "center");
    drawText(ctx, this.lobbyVoted ? "VOTED TO START - WAITING FOR OTHERS" : (pad.connected ? "START" : "ENTER") + ": VOTE TO START NOW", W / 2, y + h - 12, this.lobbyVoted ? "#60ff80" : WHT, 1, "center");
  }
  renderTitle(bgOnly = false, starsOnly = false) {
    const t = this.titleT;
    for (const s of this.bgStars) { ctx.fillStyle = s.z > 0.7 ? WHT : "#6a5a9a"; ctx.fillRect(Math.round(s.x / PW * W), Math.round(s.y / PH * H), 1, 1); }
    for (const s of this.streaks) this.drawStreak(s.x / PW * W, s.y / PH * H, s.vx, s.vy, s.col, false);
    if (Math.random() < 0.15) this.streaks.push({ x: rnd(0, PW), y: -10, vx: rnd(-40, 10), vy: rnd(100, 200), life: 3, col: pick(COLORS), big: false });
    const bob = Math.round(Math.sin(t * 2) * 3);
    if (starsOnly) return;
    if (bgOnly) { drawText(ctx, "STARFALL 101", W / 2, 120, MAG, 6, "center", "#3a0040"); return; }
    drawText(ctx, "STARFALL", W / 2, 70 + bob, MAG, 10, "center", "#3a0040");
    drawText(ctx, "101", W / 2, 130 + bob, CYA, 8, "center", "#003040");
    drawText(ctx, "101-PLAYER LAST PILOT STANDING BATTLE ROYALE", W / 2, 180, YEL, 2, "center");
    ctx.drawImage(shipSpr, W / 2 - 11, 200, 22, 22);
    drawText(ctx, (this.net.online ? "ONLINE  " : "OFFLINE  ") + "PILOT " + this.name + (this.netMsg ? "   " + this.netMsg : ""), W / 2, 274, this.net.online ? "#60ff80" : "#8070b0", 1, "center");
    ["LAUNCH", "PILOT", "CONTROLS", "MUSIC"].forEach((m, i) => { const on = this.titleSel === i, blink = Math.floor(t * 2) % 2 === 0;
      const lab = i === 0 ? (pad.connected ? "PRESS START TO LAUNCH" : "PRESS ENTER TO LAUNCH") : i === 1 ? "PILOT: < " + (this.pilotChoice === RANDOM_PILOT ? "RANDOM" : PILOT_NAMES[this.pilotChoice]) + " >"
        : i === 2 ? "CONTROLS  (" + (pad.connected ? "Y" : "C") + ")" : "MUSIC: < " + audio.soundtrackName + " >" + (pad.connected ? "" : "  (" + kn("song") + ")");
      drawText(ctx, (on ? "> " : "  ") + lab + (on ? " <" : "  "), W / 2, 228 + i * 11 + (i ? 3 : 0), on ? (blink ? WHT : YEL) : "#8070b0", i === 0 ? 2 : 1, "center"); });
    const mv = (d: Dev) => { const n = (["up", "down", "left", "right"] as Act[]).map(a => actName(d, a)); return n.every(q => q.startsWith("LS")) ? "L-STICK" : n.every(q => q.startsWith("D-")) ? "D-PAD" : n.join("/"); };
    const help = pad.connected ? ["CONTROLLER: " + mv("pad") + " MOVE   " + pn("fire") + " HOLD FIRE   " + pn("focus") + " HOLD FOCUS   " + pn("bomb") + " BOMB",
      "TARGET: " + pn("tgt0") + " RANDOM  " + pn("tgt1") + " KOS  " + pn("tgt2") + " ATTACKERS  " + pn("tgt3") + " BADGES   START PAUSE",
      ] : ["MOVE: " + mv("key") + "   FIRE: HOLD " + kn("fire") + "   FOCUS: " + kn("focus") + "   BOMB: " + kn("bomb"),
      "TARGET: " + kn("tgt0") + " RANDOM  " + kn("tgt1") + " KOS  " + kn("tgt2") + " ATTACKERS  " + kn("tgt3") + " BADGES   " + kn("mute") + " MUTE  " + kn("pause") + " PAUSE  " + kn("crt") + " CRT",
      "CHAIN SAME-COLOR KILLS. CLEAR A FULL FORMATION TO ARM AN ATTACK. IT SENDS WHEN", "THE CHAIN TIMER RUNS OUT, OR INSTANTLY AT 40 (MINI-BOSS).  CATCH FALLING STARS TO BOOST IT."];
    help.forEach((l, i) => drawText(ctx, l, W / 2, 290 + i * 12, i < 2 ? CYA : "#b080ff", 1, "center"));
  }

  renderPanels() {
    const LW = 176, HUDY = 172; // left column: opponents grid on top, this HUD block below it (mirrors the right column)
    ctx.save(); ctx.translate(0, HUDY);
    // left HUD
    ctx.fillStyle = "#0c0418"; ctx.fillRect(2, 2, LW, 184); this.frame(2, 2, LW, 184, MAG);
    { // your pilot (the watched pilot while spectating), top-right corner of the HUD
      const sr = this.specOn() ? this.rivals[this.spec] : null, av = sr ? sr.avatar : this.pilot, nm = sr ? sr.name : this.name;
      drawPilot(ctx, av, 48, 127, 7, CYA); drawText(ctx, nm.length > 10 ? nm.slice(0, 10) : nm, 151, 58, CYA, 1, "center");
    }
    const rk = String(this.dead ? this.place : this.remaining);
    drawText(ctx, "RANK", 8, 10, YEL, 2); drawText(ctx, rk, 52, 8, WHT, 3); drawText(ctx, "/101", 52 + textWidth(rk, 3) + 4, 14, MAG, 2);
    drawText(ctx, "SCORE", 8, 34, CYA, 1); drawText(ctx, String(this.score).padStart(9, "0"), 44, 32, WHT, 2);
    drawText(ctx, "BOMBS", 8, 50, CYA, 1); for (let i = 0; i < this.bombs; i++) { ctx.fillStyle = YEL; ctx.fillRect(44 + i * 11, 48, 7, 7); ctx.fillStyle = "#806000"; ctx.fillRect(46 + i * 11, 50, 3, 3); }
    drawText(ctx, "WEAPON", 8, 64, CYA, 1); for (let i = 0; i < 4; i++) { ctx.fillStyle = i <= this.weapon ? CYA : DIM; ctx.fillRect(44 + i * 9, 63, 7, 5); }
    drawText(ctx, "ATK +" + this.badges * 10 + "%", 110, 64, YEL, 1);
    drawText(ctx, "BADGES", 8, 78, CYA, 1); for (let i = 0; i < Math.min(this.badges, 12); i++) ctx.drawImage(badgeSpr, 44 + i * 9, 76);
    if (this.badges > 12) drawText(ctx, "+" + (this.badges - 12), 154, 78, YEL, 1);
    drawText(ctx, "KOS " + this.kos, 8, 92, CYA, 1); drawText(ctx, "STAR BOOST +" + this.starBoost, 60, 92, YEL, 1);
    if (this.shield) drawText(ctx, "GUARD UP", 8, 104, CYA, 1);
    // target box
    ctx.fillStyle = "#14062a"; ctx.fillRect(7, 116, LW - 10, 64); this.frame(7, 116, LW - 10, 64, YEL);
    drawText(ctx, "TARGET: " + MODES[this.mode], 12, 121, YEL, 1);
    const tid = this.targets[0];
    if (tid !== undefined && this.rivals[tid]) {
      const r = this.rivals[tid]; this.drawMini(r, 13, 131, true);
      { const nm = r.name + (this.targets.length > 1 ? " +" + (this.targets.length - 1) : ""); drawText(ctx, nm, 36, nm.length > 9 ? 136 : 134, WHT, nm.length > 9 ? 1 : 2); }
      drawText(ctx, "HP", 36, 150, CYA, 1); if (r.hp > 3) drawText(ctx, String(r.hp), 48, 150, MAG, 1); else for (let i = 0; i < 3; i++) { ctx.fillStyle = i < r.hp ? MAG : DIM; ctx.fillRect(48 + i * 7, 149, 5, 5); }
      drawText(ctx, "BADGES " + r.badges, 76, 150, YEL, 1);
      drawText(ctx, pad.connected ? "R-STICK SWITCHES MODE" : kn("tgt0") + "-" + kn("tgt3") + " SWITCH MODE", 36, 164, "#8070b0", 1);
      drawPilot(ctx, r.avatar, 40, 130, 124, YEL); // target's pilot
    }
    ctx.restore();
    if (this.duel) this.renderDuelCards(LW);
    else {
    // grids (all 100 opponents)
    ctx.fillStyle = "#0c0418"; ctx.fillRect(2, 2, LW, 170); this.frame(2, 2, LW, 170, MAG);
    ctx.fillStyle = "#0c0418"; ctx.fillRect(462, 2, LW, 170); this.frame(462, 2, LW, 170, MAG);
    for (const r of this.rivals) {
      const p = this.cellPos(r.id); let dx = 0, dy = 0, gl = 0, gold = false;
      for (const q of this.ripples) { const cx = p.x + CELL_W / 2 - q.x, cy = p.y + CELL_H / 2 - q.y, d = Math.hypot(cx, cy) || 1, k = d - q.t * 260;
        if (Math.abs(k) < 18) { const a = Math.cos(k / 18 * Math.PI / 2) * (1 - q.t / 1.2); dx += cx / d * a * 3; dy += cy / d * a * 3; if (a > gl) { gl = a; gold = q.gold; } } }
      this.drawMini(r, p.x + Math.round(dx), p.y + Math.round(dy), false);
      if (gl > 0.15) { ctx.globalAlpha = Math.min(1, gl); ctx.strokeStyle = gold ? YEL : CYA; ctx.strokeRect(p.x + Math.round(dx) + 0.5, p.y + Math.round(dy) + 0.5, CELL_W - 1, CELL_H - 1); ctx.globalAlpha = 1; }
    }
    }
    // right lower: targeting / incoming / time
    const RX = 468; ctx.fillStyle = "#0c0418"; ctx.fillRect(462, 174, LW, 184); this.frame(462, 174, LW, 184, CYA);
    drawText(ctx, "TARGETING", RX, 182, CYA, 2);
    MODES.forEach((m, i) => { const on = this.mode === i, y = 198 + i * 15; ctx.fillStyle = on ? MAG : "#1a0a30"; ctx.fillRect(RX, y, 164, 12); drawText(ctx, (i + 1) + "  " + m, RX + 4, y + 4, on ? WHT : "#8070b0", 1); drawText(ctx, pad.connected ? pn(("tgt" + i) as Act) : kn(("tgt" + i) as Act), RX + 160, y + 4, on ? WHT : "#5a4a8a", 1, "right"); });
    const att = this.attackers().length;
    drawText(ctx, "ATTACKERS ON YOU: " + att, RX, 262, att > 3 ? SENT_COL : CYA, 1);
    const pw = Math.round(this.chain * (1 + 0.1 * this.badges) + this.starBoost);
    drawText(ctx, "NEXT ATTACK POWER: " + (this.chain > 0 ? pw : 0), RX, 274, YEL, 1);
    if (pad.connected) { drawText(ctx, "PAD: " + pn("fire") + " FIRE  " + pn("focus") + " FOCUS  " + pn("bomb") + " BOMB", RX, 290, "#8070b0", 1); drawText(ctx, "R-STICK = TARGET MODE", RX, 300, "#8070b0", 1); }
    else { drawText(ctx, "FIRE: HOLD " + kn("fire"), RX, 290, "#8070b0", 1); drawText(ctx, "FOCUS: " + kn("focus") + "  BOMB: " + kn("bomb"), RX, 300, "#8070b0", 1); }
    drawText(ctx, this.net.online ? "ONLINE" : "OFFLINE", RX + 164, 342, this.net.online ? "#60ff80" : "#5a4a8a", 1, "right");
    if (this.warns.length || this.projs.some(p => !p.out)) { if (Math.floor(this.realT * 6) % 2) { ctx.fillStyle = SENT_COL; ctx.fillRect(RX, 314, 164, 18); drawText(ctx, "!! INCOMING ATTACK !!", RX + 82, 321, "#000", 1, "center"); } }
    drawText(ctx, "TIME " + Math.floor(this.time / 60) + ":" + String(Math.floor(this.time % 60)).padStart(2, "0") + (this.calm ? "  CALM PHASE" : "  SPEED x" + this.ramp.toFixed(2)), RX, 342, "#8070b0", 1);
  }
  /** Final duel: both grids give way to the two pilots, you on the left, the rival (mirrored to face you) on the right. */
  renderDuelCards(LW: number) {
    const sr = this.specOn() ? this.rivals[this.spec] : null;
    const me = { avatar: sr ? sr.avatar : this.pilot, name: sr ? sr.name : this.name, hp: this.hp, max: 3 };
    const rv = this.rivals.find(r => r.alive && r.id !== this.spec) ?? this.rivals.find(r => r.place === 1 || r.place === 2);
    const card = (x0: number, label: string, nm: string, av: number, edge: string, mirror: boolean, hpTxt: string | null, hp: number, max: number) => {
      ctx.fillStyle = "#0c0418"; ctx.fillRect(x0, 2, LW, 170); this.frame(x0, 2, LW, 170, edge);
      const px = x0 + (LW - 136) / 2;
      drawPilot(ctx, av, 136, px, 9, edge, mirror);
      drawText(ctx, label, px, 149, "#8a7ab8", 1);
      drawText(ctx, nm.length > 8 ? nm.slice(0, 10) : nm, px, 157, WHT, nm.length > 8 ? 1 : 2);
      if (hpTxt) drawText(ctx, hpTxt, px + 136, 157, YEL, 1, "right");
      else for (let i = 0; i < max; i++) { ctx.fillStyle = i < hp ? MAG : DIM; ctx.fillRect(px + 136 - (max - i) * 9 + 2, 157, 7, 7); }
    };
    card(2, sr ? "WATCHING" : "YOU", me.name, me.avatar, CYA, false, null, me.hp, me.max);
    if (rv) card(462, "FINAL RIVAL", rv.name, rv.avatar, SENT_COL, true, "HP " + Math.max(0, rv.hp) + "/" + DUEL_HP, 0, 0);
  }
  renderBottom() { // health + chain meter strip right under the ship
    const x0 = PX - 2, w = PW + 4, y = BY, h = 360 - BY - 2;
    ctx.fillStyle = "#0c0418"; ctx.fillRect(x0, y, w, h); this.frame(x0, y, w, h, CYA);
    for (let i = 0; i < 3; i++) { const on = i < this.hp; ctx.fillStyle = on ? (this.hp === 1 && Math.floor(this.realT * 6) % 2 ? "#ff2040" : MAG) : DIM; ctx.fillRect(x0 + 5 + i * 13, y + 5, 10, 8); if (on) { ctx.fillStyle = WHT; ctx.fillRect(x0 + 6 + i * 13, y + 6, 3, 2); } }
    if (this.hp < 3) { ctx.fillStyle = DIM; ctx.fillRect(x0 + 5, y + 16, 36, 2); ctx.fillStyle = CYA; ctx.fillRect(x0 + 5, y + 16, Math.round(36 * (1 - this.regen / 20)), 2); }
    if (this.shield) { ctx.strokeStyle = CYA; ctx.strokeRect(x0 + 3.5, y + 3.5, 41, 12); }
    if (this.zapT > 0) { const SP = SPECIALS[this.specKind] ?? SPECIALS[0]; drawText(ctx, SP.hud, x0 + 5, y + 20, Math.floor(this.realT * 10) % 2 ? WHT : SP.col, 1); const bx = x0 + 7 + SP.hud.length * 6, bw = Math.max(8, 43 - SP.hud.length * 6); ctx.fillStyle = DIM; ctx.fillRect(bx, y + 21, bw, 3); ctx.fillStyle = SP.col; ctx.fillRect(bx, y + 21, Math.round(bw * Math.min(1, this.zapT / SPECIAL_SECS)), 3); }
    const cx = x0 + 50; const cc = this.chainCol >= 0 ? COLORS[this.chainCol] : WHT;
    if (this.chain > 0) {
      const sc = 2 + (this.chainPulse > 0.5 ? 1 : 0);
      const ncol = this.chain >= BOSS_AT * 0.8 ? YEL : this.chain >= WAVE_AT ? MAG : cc;
      drawText(ctx, "x" + this.chain, cx, y + 11 - sc * 2.5, ncol, sc, "left", "#000");
      const f = this.chainT / this.chainMax, low = f < 0.3 && this.freeze <= 0, bx = cx + 34, bw = w - (bx - x0) - 6;
      ctx.fillStyle = DIM; ctx.fillRect(bx, y + 4, bw, 5);
      ctx.fillStyle = this.freeze > 0 ? "#a0e0ff" : low && Math.floor(this.realT * 12) % 2 ? WHT : cc; ctx.fillRect(bx, y + 4, Math.round(bw * f), 5);
      for (const [th, c] of [[WAVE_AT, MAG], [BOSS_AT, YEL]] as [number, string][]) { const tx = bx + Math.round(bw * th / BOSS_AT) - 1; ctx.fillStyle = this.chain >= th ? c : "#5040a0"; ctx.fillRect(Math.min(tx, bx + bw - 2), y + 2, 2, 9); }
      const tier = this.chain < WAVE_AT ? "RUSH" : this.chain < BOSS_AT ? "WAVE" : "BOSS";
      const lab = this.eligible ? "ARMED: " + tier + "  SENDS WHEN TIMER ENDS" : (this.freeze > 0 ? "FROZEN " + this.freeze.toFixed(1) + "  " : "") + "CLEAR A FORMATION TO ARM";
      drawText(ctx, lab, bx, y + 13, this.eligible ? (Math.floor(this.realT * 5) % 2 ? YEL : WHT) : "#8070b0", 1);
    } else drawText(ctx, "CHAIN: KILL TO START   15 WAVE   40 MINI-BOSS", cx, y + 9, "#6050a0", 1);
  }
  drawMini(r: Rival, x: number, y: number, big: boolean) {
    const w = CELL_W, h = CELL_H;
    ctx.fillStyle = r.alive ? "#0a0420" : "#050208"; ctx.fillRect(x, y, w, h);
    if (r.alive) {
      const t = r.ai + r.seed;
      for (let i = 0; i < 3; i++) { ctx.fillStyle = "#30205a"; ctx.fillRect(x + ((r.seed * 7 + i * 6) % (w - 2)) + 1, y + 6 + ((t * 10 + i * 9) % (h - 7)), 1, 1); }
      const ec = COLORS[(r.col + Math.floor(t / 6)) % 4];
      for (let i = 0; i < 3; i++) { ctx.fillStyle = ec; ctx.fillRect(x + 3 + ((Math.sin(t * 1.3 + i * 2) + 1) * 0.5 * (w - 7)) | 0, y + 8 + ((t * 4 + i * 5) % 12) | 0, 2, 1); }
      if (Math.floor(t * 3) % 2) { ctx.fillStyle = MAG; ctx.fillRect(x + 4 + ((t * 13) % (w - 8)) | 0, y + 18 + ((t * 20) % 8) | 0, 1, 1); }
      ctx.fillStyle = CYA; ctx.fillRect(x + ((Math.sin(t * 0.9) + 1) * 0.5 * (w - 5) + 1) | 0, y + h - 5, 3, 2);
      let bc = r.hp >= 3 ? "#3a3070" : r.hp >= 2 ? "#b0a020" : "#ff3040";
      if (r.flash > 0 && Math.floor(this.realT * 20) % 2) bc = WHT;
      if (this.targets.includes(r.id)) bc = YEL;
      ctx.strokeStyle = bc; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (!big && !fxCfg.low) { ctx.globalAlpha = 0.5; cometRect(ctx, x, y, w, h, this.hue(), this.realT * 0.35 + r.seed); ctx.globalAlpha = 1; }
      drawText(ctx, String(r.id + 1), x + 2, y + 2, this.targets.includes(r.id) ? YEL : r.isBot ? "#9080c0" : "#60ff80", 1);
      if (r.badges > 0) { ctx.fillStyle = YEL; for (let i = 0; i < Math.min(4, r.badges); i++) ctx.fillRect(x + 2 + i * 3, y + h - 9, 2, 2); }
      if (r.target === -1 && !big) { ctx.fillStyle = SENT_COL; ctx.fillRect(x + w - 2, y + 2, 1, 5); }
      if (this.targets.includes(r.id) && !big) { const b = Math.floor(this.realT * 4) % 2; ctx.fillStyle = YEL; ctx.fillRect(x - 1 - b, y - 1 - b, 4, 1); ctx.fillRect(x - 1 - b, y - 1 - b, 1, 4); ctx.fillRect(x + w - 3 + b, y + h + b, 4, 1); ctx.fillRect(x + w + b, y + h - 3 + b, 1, 4); }
    } else {
      ctx.strokeStyle = "#1a1028"; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (r.koT > 0.4) { drawText(ctx, "KO", x + w / 2, y + 10, "#4a3a6a", 1, "center"); drawText(ctx, String(r.place), x + w / 2, y + 20, "#3a2a5a", 1, "center");
        if (r.koBy === -1) { // big X over every pilot YOU knocked out
          const n = Math.max(w, h), L: [number, number, number][] = [];
          for (let i = 0; i < n; i++) { const fy = Math.round(y + 1 + i * (h - 4) / (n - 1)), d = i * (w - 4) / (n - 1); L.push([Math.round(x + 1 + d), fy, Math.round(x + w - 3 - d)]); }
          ctx.fillStyle = MAG; for (const [a, fy, b] of L) { ctx.fillRect(a + 1, fy + 1, 2, 2); ctx.fillRect(b + 1, fy + 1, 2, 2); }
          ctx.fillStyle = YEL; for (const [a, fy, b] of L) { ctx.fillRect(a, fy, 2, 2); ctx.fillRect(b, fy, 2, 2); }
        } }
      else { ctx.fillStyle = r.koBy === -1 ? YEL : WHT; ctx.globalAlpha = 1 - r.koT / 0.4; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1; }
      if (r.koBy === -1 && r.koT < 1.2 && Math.floor(r.koT * 10) % 2 === 0) { ctx.strokeStyle = YEL; ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1); } // your KO flashes gold
    }
  }
  drawStreak(x: number, y: number, vx: number, vy: number, col: string, big: boolean) {
    const n = big ? 14 : 8, l = Math.hypot(vx, vy), ux = vx / l, uy = vy / l;
    for (let i = 0; i < n; i++) { ctx.globalAlpha = 1 - i / n; ctx.fillStyle = i < 2 ? WHT : col; const s = big && i < 4 ? 2 : 1; ctx.fillRect(Math.round(x - ux * i * 2), Math.round(y - uy * i * 2), s, s); }
    ctx.globalAlpha = 1;
  }
  drawBoss(e: Enemy) {
    const fl = e.hp < (e.maxhp || 1) * 0.3 && Math.floor(this.realT * 10) % 2, X = Math.round(e.x), Y = Math.round(e.y);
    const flashOver = (x: number, y: number, w: number, h: number) => { if (fl) { ctx.globalAlpha = 0.4; ctx.fillStyle = WHT; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1; } };
    if ((e.bv ?? 0) >= 100) { this.drawFinal(e, X, Y, !!fl); return; }
    if (e.bv === 1) {
      for (let i = e.segs!.length - 1; i >= 0; i--) { const g = e.segs![i]; ctx.drawImage(serpSegSpr, Math.round(g.x) - 3, Math.round(g.y) - 3); }
      ctx.drawImage(serpHeadSpr, X - 11, Y - 7, 22, 14); flashOver(X - 11, Y - 7, 22, 14);
    } else if (e.bv === 2) {
      ctx.drawImage(fortSpr, X - 28, Y - 8); const sh = e.tur!.some(h => h > 0);
      e.tur!.forEach((h, i) => { const x = X + (i ? 20 : -20), y = Y + 6;
        if (h > 0) { ctx.fillStyle = YEL; ctx.fillRect(x - 4, y - 3, 9, 7); ctx.fillStyle = "#806000"; ctx.fillRect(x - 2, y - 1, 5, 3); const a = Math.atan2(this.py - y, this.px - x); ctx.fillStyle = WHT; for (let k = 3; k < 8; k++) ctx.fillRect(Math.round(x + Math.cos(a) * k), Math.round(y + Math.sin(a) * k), 1, 1);
          ctx.fillStyle = DIM; ctx.fillRect(x - 5, y - 7, 11, 2); ctx.fillStyle = YEL; ctx.fillRect(x - 5, y - 7, Math.round(11 * h / (e.turMax || 1)), 2); }
        else { ctx.fillStyle = "#302838"; ctx.fillRect(x - 4, y - 2, 9, 5); if (Math.random() < 0.3) this.parts.push({ x, y, vx: rnd(-5, 5), vy: rnd(-30, -10), life: 0.5, max: 0.5, col: "#605070", s: 1 }); } });
      if (sh) { ctx.strokeStyle = Math.floor(this.realT * 10) % 2 ? CYA : "#2080a0"; ctx.beginPath(); ctx.arc(X + 0.5, Y + 0.5, 7, 0, 6.283); ctx.stroke(); ctx.fillStyle = "#204060"; ctx.fillRect(X - 3, Y - 3, 7, 7); }
      else { const pul = Math.floor(this.realT * 8) % 2; ctx.fillStyle = pul ? SENT_COL : "#ff9090"; ctx.fillRect(X - 4, Y - 4, 9, 9); ctx.fillStyle = WHT; ctx.fillRect(X - 1, Y - 1, 3, 3); }
      flashOver(X - 28, Y - 8, 56, 16);
    } else if (e.bv === 3) {
      const v = e.vis ?? 0;
      if (v < 1 && Math.floor(this.realT * 12) % 2) { ctx.strokeStyle = MAG; ctx.strokeRect(X - 11.5, Y - 11.5, 23, 23); }
      ctx.globalAlpha = v; ctx.drawImage(phantomSpr, X - 10, Y - 10);
      if (e.eye) { ctx.fillStyle = YEL; ctx.fillRect(X - 4, Y - 2, 9, 5); ctx.fillStyle = "#000"; const px = clamp(Math.round((this.px - e.x) / 40), -2, 2); ctx.fillRect(X - 1 + px, Y - 1, 3, 3); }
      else { ctx.fillStyle = WHT; ctx.fillRect(X - 4, Y, 9, 1); }
      ctx.globalAlpha = 1; flashOver(X - 10, Y - 10, 21, 21);
    } else { ctx.drawImage(bossSpr, X - 21, Y - 10, 42, 20); flashOver(X - 21, Y - 10, 42, 20); }
    const sh = e.bv === 2 && e.tur!.some(h => h > 0);
    ctx.fillStyle = DIM; ctx.fillRect(10, 4, PW - 20, 3); ctx.fillStyle = sh ? CYA : SENT_COL; ctx.fillRect(10, 4, Math.round((PW - 20) * Math.max(0, e.hp) / (e.maxhp || 1)), 3);
    drawText(ctx, this.bossName(e) + (sh ? " (SHIELDED)" : "") + " FROM " + (this.rivals[e.sender ?? -1]?.name || "?"), PW / 2, 10, SENT_COL, 1, "center");
  }
  drawFinal(e: Enemy, X: number, Y: number, fl: boolean) {
    const i = (e.bv ?? 100) - 100, d = FINAL_BOSSES[i]; if (!d) return; const sp = finalSprite(i), col = d.pal[2], S = e.fb;
    if (S) { for (const l of S.tele) { const a = l.life / l.max, on = Math.floor(this.realT * 16) % 2; ctx.globalAlpha = 0.35 + 0.5 * (1 - a); ctx.strokeStyle = on ? l.col : WHT;
        ctx.beginPath(); if (l.ring) ctx.arc(l.x1, l.y1, l.ring * (0.4 + 0.6 * a), 0, 6.283); else { ctx.moveTo(l.x1 + 0.5, l.y1 + 0.5); ctx.lineTo(l.x2 + 0.5, l.y2 + 0.5); } ctx.stroke(); }
      for (const c of S.clones) { ctx.globalAlpha = Math.min(0.55, c.life / 1.6); ctx.drawImage(sp, Math.round(c.x - sp.width / 2) + (Math.floor(this.realT * 30) % 2), Math.round(c.y - sp.height / 2)); } ctx.globalAlpha = 1; }
    const v = e.vis ?? 1; if (v < 1 && Math.floor(this.realT * 20) % 2) { ctx.globalAlpha = 0.6; ctx.drawImage(sp, X - (sp.width >> 1) + ri(-3, 3), Y - (sp.height >> 1)); }
    ctx.globalAlpha = v; ctx.drawImage(sp, X - (sp.width >> 1), Y - (sp.height >> 1));
    if (d.weak) { ctx.fillStyle = e.eye ? YEL : "#402060"; ctx.fillRect(X - 4, Y - 2, 9, e.eye ? 5 : 1); if (e.eye) { ctx.fillStyle = "#000"; ctx.fillRect(X - 1 + clamp(Math.round((this.px - e.x) / 40), -2, 2), Y - 1, 3, 3); } }
    else if (Math.floor(this.realT * 6) % 2) { ctx.fillStyle = WHT; ctx.fillRect(X - 1, Y + (d.hit.dy ?? 0) - 1, 2, 2); }
    ctx.globalAlpha = 1;
    if (fl) { ctx.globalAlpha = 0.35; ctx.fillStyle = WHT; ctx.fillRect(X - (sp.width >> 1), Y - (sp.height >> 1), sp.width, sp.height); ctx.globalAlpha = 1; }
    ctx.fillStyle = DIM; ctx.fillRect(10, 4, PW - 20, 3); ctx.fillStyle = col; ctx.fillRect(10, 4, Math.round((PW - 20) * Math.max(0, e.hp) / (e.maxhp || 1)), 3);
    drawText(ctx, "FINAL BOSS " + d.name + (d.weak && !e.eye ? " (SEALED)" : ""), PW / 2, 10, col, 1, "center");
  }
  renderField() {
    ctx.save(); ctx.translate(PX, PY);
    ctx.beginPath(); ctx.rect(0, 0, PW, PH); ctx.clip();
    ctx.fillStyle = "#04010a"; ctx.fillRect(0, 0, PW, PH);
    const bw = this.bgW, tt = this.realT;
    if (bw[4] > 0.01) { if (!this.coreGrad) { const g = ctx.createLinearGradient(0, 0, 0, PH); g.addColorStop(0, "#1a0204"); g.addColorStop(0.6, "#2a0406"); g.addColorStop(1, "#5a0c06"); this.coreGrad = g; }
      ctx.globalAlpha = bw[4]; ctx.fillStyle = this.coreGrad; ctx.fillRect(0, 0, PW, PH); ctx.globalAlpha = 1; scrollTile(ctx, coreT, tt * 24, bw[4] * 0.42);
      for (let i = 0; i < 36; i++) { const ex = (i * 53.7 + Math.sin(tt + i) * 6) % PW, ey = PH - ((tt * (30 + i % 5 * 9) + i * 37) % (PH + 10)); ctx.globalAlpha = bw[4] * (0.5 + 0.5 * Math.sin(tt * 9 + i)); ctx.fillStyle = i % 3 ? "#ff8030" : YEL; ctx.fillRect(Math.round(ex), Math.round(ey), 1, i % 4 ? 1 : 2); } ctx.globalAlpha = 1; }
    scrollTile(ctx, nebTile, tt * 9, bw[1]); if (!fxCfg.low) scrollTile(ctx, nebTile, tt * 16 + 170, bw[1] * 0.35);
    scrollTile(ctx, fortFar, tt * 14, bw[2]);
    // nebula band (dithered purple haze)
    if (bw[0] > 0.01) ctx.globalAlpha = bw[0];
    for (let yy = 0; yy < PH && bw[0] > 0.01; yy += 2) { const wy = yy - this.time * 6; const cx = PW / 2 + Math.sin(wy * 0.02) * 45 + Math.sin(wy * 0.007) * 25, hw = 18 + Math.sin(wy * 0.05) * 8;
      ctx.fillStyle = "rgba(110,30,170,0.13)"; ctx.fillRect(Math.round(cx - hw * 1.8), yy, Math.round(hw * 3.6), 2);
      ctx.fillStyle = "rgba(170,60,220,0.12)"; ctx.fillRect(Math.round(cx - hw), yy, Math.round(hw * 2), 2);
      if ((yy / 2 + Math.floor(wy)) % 3 === 0) { ctx.fillStyle = "rgba(220,140,255,0.25)"; ctx.fillRect(Math.round(cx + Math.sin(yy * 1.7) * hw), yy, 1, 1); } }
    ctx.globalAlpha = 1;
    for (const s of this.bgStars) { ctx.fillStyle = s.z > 0.75 ? WHT : s.z > 0.45 ? "#8a7ac0" : "#3a2a6a"; ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, s.z > 0.85 ? 2 : 1); }
    scrollTile(ctx, fortNear, tt * 42, bw[3]);
    { const pulse = Math.exp(-audio.beatPhase() * 5); ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.05 + 0.06 * pulse * (0.5 + this.vStage * 0.15); ctx.fillStyle = STAGE_TINT[this.vStage]; ctx.fillRect(0, 0, PW, PH); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; }
    ctx.globalAlpha = clamp(1 - bw[3] - bw[4], 0, 1);
    // side towers
    for (const side of [0, 1]) for (let i = 0; i < 6; i++) { const hh = 40 + ((i * 37) % 60), ww = 10 + (i % 3) * 4; const x = side ? PW - ww - (i * 7) % 18 : (i * 7) % 18; const y = PH - hh - ((i * 23) % 30) + 30;
      ctx.fillStyle = "#140828"; ctx.fillRect(x, y, ww, PH - y); ctx.fillStyle = "#2a1050"; ctx.fillRect(x + 1, y, 1, PH - y); if (i % 2) { ctx.fillStyle = MAG; ctx.fillRect(x + ww / 2, y + 6, 1, 1); } }
    ctx.globalAlpha = 1;
    for (const s of this.streaks) this.drawStreak(s.x, s.y, s.vx, s.vy, s.col, s.big);
    if (this.state === "win") this.renderWinStars();
    if (this.bombFx > 0) { const r = (0.6 - this.bombFx) * 500, o = this.bombAt || { x: this.px, y: this.py }; ctx.strokeStyle = this.bombCol; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, 6.283); ctx.stroke(); ctx.lineWidth = 1; }
    // items
    for (const it of this.items) {
      const x = Math.round(it.x), y = Math.round(it.y);
      if (it.kind === "dot") { ctx.fillStyle = Math.floor(it.t * 8) % 2 ? YEL : WHT; ctx.fillRect(x - 1, y - 1, 2, 2); }
      else if (it.kind === "badge") ctx.drawImage(badgeSpr, x - 3, y - 3);
      else if (it.kind === "star") { ctx.fillStyle = YEL; ctx.fillRect(x - 3, y - 1, 7, 3); ctx.fillRect(x - 1, y - 3, 3, 7); ctx.fillStyle = WHT; ctx.fillRect(x - 1, y - 1, 3, 3); if (Math.floor(it.t * 6) % 2) drawText(ctx, "CATCH!", x, y - 12, YEL, 1, "center"); }
      else { const c = { W: CYA, B: MAG, F: "#a0e0ff", G: "#60ff80", S: Math.floor(this.realT * 10) % 2 ? WHT : SPECIALS[PILOT_SPECIAL[this.pilot] ?? 0].col }[it.kind] || WHT; ctx.fillStyle = "#000"; ctx.fillRect(x - 5, y - 5, 11, 11); ctx.strokeStyle = c; ctx.strokeRect(x - 4.5, y - 4.5, 10, 10); drawText(ctx, it.kind, x - 1, y - 2, c, 1); }
    }
    // enemies
    for (const e of this.enemies) {
      if (e.dead || (!e.boss && e.t < e.delay)) continue;
      if (e.boss) { this.drawBoss(e); continue; }
      const u = e.up ?? 0, spr = (e.hf ?? 0) > 0 ? enemyFlash[u][e.spr] : enemySpr[u][e.spr][e.col]; const bob = Math.floor(e.t * 6) % 2;
      ctx.drawImage(spr, Math.round(e.x - spr.width / 2), Math.round(e.y - spr.height / 2) + bob);
    }
    // player bullets
    for (const b of this.pb) { ctx.fillStyle = b.col; ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 3, 2, 6); ctx.fillStyle = WHT; ctx.fillRect(Math.round(b.x) - 0, Math.round(b.y) - 2, 1, 3); }
    for (const b of this.bolts) { // jagged neon lightning
      for (let i = 0; i < b.pts.length - 1; i++) { const p0 = b.pts[i], p1 = b.pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(p1.x - p0.x, p1.y - p0.y)));
        for (let k = 0; k <= n; k++) { const x = Math.round(p0.x + (p1.x - p0.x) * k / n), y = Math.round(p0.y + (p1.y - p0.y) * k / n); ctx.fillStyle = CYA; ctx.fillRect(x - 1, y, 3, 1); ctx.fillStyle = WHT; ctx.fillRect(x, y, 1, 1); } } }
    for (const b of this.blasts) { const k = 1 - b.life / 0.25; ctx.strokeStyle = k < 0.5 ? YEL : "#ff5020"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, 6 + k * 22, 0, 6.283); ctx.stroke(); ctx.lineWidth = 1; }
    for (const f of this.flames) { const x = Math.round(f.x), y = Math.round(f.y), fl = Math.floor(this.realT * 20) % 2; ctx.fillStyle = "#ff5020"; ctx.fillRect(x - 3, y - 3, 7, 7); ctx.fillStyle = fl ? YEL : "#ff9030"; ctx.fillRect(x - 2, y - 2, 5, 5); ctx.fillStyle = WHT; ctx.fillRect(x - 1, y - 1, 2, 2); }
    if (this.zapT > 0 && this.specKind === 1 && !this.dead) for (let k = 0; k < 3; k++) { const a = this.ringA + k * 2.094, x = Math.round(this.px + Math.cos(a) * 24), y = Math.round(this.py + Math.sin(a) * 24);
      for (let j = 1; j < 4; j++) { const aa = a - j * 0.18; ctx.globalAlpha = 1 - j * 0.25; ctx.fillStyle = "#ff5020"; ctx.fillRect(Math.round(this.px + Math.cos(aa) * 24) - 1, Math.round(this.py + Math.sin(aa) * 24) - 1, 3, 3); } ctx.globalAlpha = 1;
      ctx.fillStyle = "#ff9030"; ctx.fillRect(x - 3, y - 3, 6, 6); ctx.fillStyle = YEL; ctx.fillRect(x - 2, y - 2, 4, 4); ctx.fillStyle = WHT; ctx.fillRect(x - 1, y - 1, 2, 2); }
    for (const b of this.blades) { const x = Math.round(b.x), y = Math.round(b.y), r = Math.floor(b.a) % 2;
      ctx.fillStyle = MAG; if (r) { ctx.fillRect(x - 4, y, 9, 1); ctx.fillRect(x, y - 4, 1, 9); } else { for (let k = -3; k <= 3; k++) { ctx.fillRect(x + k, y + k, 1, 1); ctx.fillRect(x + k, y - k, 1, 1); } }
      ctx.fillStyle = WHT; ctx.fillRect(x - 1, y - 1, 3, 3); ctx.fillStyle = "#000"; ctx.fillRect(x, y, 1, 1); }
    // player
    if (!this.dead) {
      if (this.inv <= 0 || Math.floor(this.realT * 15) % 2) ctx.drawImage(shipSpr, Math.round(this.px) - 5, Math.round(this.py) - 6);
      if (this.shield) { ctx.strokeStyle = Math.floor(this.realT * 8) % 2 ? CYA : "#60ff80"; ctx.beginPath(); ctx.arc(Math.round(this.px) + 0.5, Math.round(this.py) + 0.5, 10, 0, 6.283); ctx.stroke(); }
      if (this.focus) { ctx.fillStyle = WHT; ctx.fillRect(Math.round(this.px) - 1, Math.round(this.py) - 1, 3, 3); ctx.fillStyle = SENT_COL; ctx.fillRect(Math.round(this.px), Math.round(this.py), 1, 1); ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.beginPath(); ctx.arc(this.px, this.py, 10, 0, 6.283); ctx.stroke(); }
    }
    // enemy bullets
    for (const b of this.eb) { const x = Math.round(b.x), y = Math.round(b.y); ctx.fillStyle = b.col; ctx.fillRect(x - 2, y - 1, 4, 2); ctx.fillRect(x - 1, y - 2, 2, 4); ctx.fillStyle = WHT; ctx.fillRect(x - 1, y - 1, 2, 2); }
    for (const p of this.parts) { ctx.globalAlpha = clamp(p.life / p.max * 1.5, 0, 1); ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); } ctx.globalAlpha = 1;
    // warnings
    for (const w of this.warns) if (Math.floor(w.t * 8) % 2) { const x = Math.round(clamp(w.x, 12, PW - 12)); ctx.fillStyle = SENT_COL; ctx.fillRect(x - 5, 4, 11, 2); ctx.fillRect(x - 3, 6, 7, 2); ctx.fillRect(x - 1, 8, 3, 2); drawText(ctx, "INCOMING " + ["RUSH", "WAVE", "BOSS"][w.tier], clamp(x, 26, PW - 26), 13, SENT_COL, 1, "center"); }
    // chain pop near ship
    if (this.chain > 0 && !this.dead) drawText(ctx, "x" + this.chain, Math.round(this.px) + 9, Math.round(this.py) - 12, this.chainCol >= 0 ? COLORS[this.chainCol] : WHT, 1);
    // popups
    for (const p of this.popups) { const k = p.t < 0.12 ? 1 + (0.12 - p.t) * 8 : 1; const sc = Math.max(1, Math.round(p.scale * k)); ctx.globalAlpha = p.t > 1 ? (1.3 - p.t) / 0.3 : 1;
      const col = Math.floor(p.t * 12) % 4 === 0 ? WHT : p.col; drawText(ctx, p.text, clamp(p.x, textWidth(p.text, sc) / 2 + 2, PW - textWidth(p.text, sc) / 2 - 2), p.y - p.t * 12, col, sc, "center", "#000"); }
    ctx.globalAlpha = 1;
    if (this.calm && this.state === "play" && this.time > 2 && this.time < 8) drawText(ctx, "CALM PHASE: WARM UP!", PW / 2, PH - 20, "#8070b0", 1, "center");
    ctx.restore();
    this.frame(PX - 2, PY - 2, PW + 4, PH + 4, CYA);
  }
}

const game = new Game(); game.bindNet(); (window as any).__game = game; (window as any).__fbTune = FB_TUNE; (window as any).__audio = audio; (window as any).__renderMusicPreview = renderMusicPreview; (window as any).__soundtracks = TRACKS.map(t => ({ id: t.id, name: t.title, bpm: t.bpm, sections: t.sections.map(s => ({ id: s.id, name: s.name, bpm: s.bpm, bars: s.chords.trim().split(/\s+/).length })) }));
onPad = c => { game.padMsg = c ? "CONTROLLER CONNECTED" : "CONTROLLER DISCONNECTED"; game.padMsgT = 2.5; if (c && game.state === "play") game.popup("CONTROLLER CONNECTED", PW / 2, 50, "#60ff80", 1); };
// browser autoplay rules: unlock audio on the first key / click / tap on a menu screen so the title theme can start
for (const ev of ["keydown", "pointerdown"]) addEventListener(ev, () => { if (MENU_STATES.includes(game.state) && audio.ctx?.state !== "running") audio.init(); });
chooseTransport().then(t => { if (game.state === "title") game.setNet(t); (window as any).__netReady = true; });
let last = performance.now(), acc = 0; const STEP = 1 / 60; const perf = { t: 0, n: 0 };
function loop(now: number) {
  const fdt = (now - last) / 1000; acc += Math.min(0.1, fdt); last = now;
  perf.t += fdt; perf.n++; if (perf.t > 3) { const fps = perf.n / perf.t; (window as any).__fps = fps; if (fps < 48 && !fxCfg.low && game.state === "play" && !document.hidden) { fxCfg.low = true; game.padMsg = "LOW FX MODE (G TO TOGGLE)"; game.padMsgT = 2.5; } perf.t = 0; perf.n = 0; }
  pollPad();
  while (acc >= STEP) { game.update(STEP); pressed.clear(); acc -= STEP; }
  game.render(); present(); requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
