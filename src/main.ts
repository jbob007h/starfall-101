import { drawText, textWidth } from "./font";
import { Audio } from "./audio";
import { LocalSimTransport, Transport, NetEvent, PlayerInfo, MAX_PLAYERS, chooseTransport } from "./net";
import { makeSprite, drawSprite, SHIP, SAUCER, BUG, BOSS, BADGE, SERP_HEAD, SERP_SEG } from "./sprites";

// ---------- constants ----------
const W = 640, H = 360;
const PX = 184, PY = 4, PW = 272, PH = 324; const BY = PY + PH + 3; // bottom HUD strip // playfield
const COLORS = ["#ff3cc8", "#3cf0ff", "#ffe040", "#60ff80"];
const COLOR_NAMES = ["MAGENTA", "CYAN", "GOLD", "LIME"];
const SENT = 4; const SENT_COL = "#ff5050";
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
const POWERUP_WEIGHTS: [string, number][] = [["W", 30], ["B", 13], ["S", 19], ["F", 19], ["L", 19]];
function pickPowerup() { let r = Math.random() * 100; for (const [k, w] of POWERUP_WEIGHTS) { if ((r -= w) < 0) return k; } return "W"; }
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

// ---------- sprites ----------
const shipSpr = makeSprite(SHIP, { c: CYA, w: WHT, m: MAG, y: YEL });
const allCols = [...COLORS, SENT_COL];
function dark(c: string) { return c.replace(/^#(..)(..)(..)$/, (_, r, g, b) => "#" + [r, g, b].map(h => Math.floor(parseInt(h, 16) * 0.4).toString(16).padStart(2, "0")).join("")); }
const saucerSpr = allCols.map(c => makeSprite(SAUCER, { x: c, w: WHT, d: dark(c) }));
const bugSpr = allCols.map(c => makeSprite(BUG, { x: c, w: WHT, d: dark(c) }));
const bossSpr = makeSprite(BOSS, { x: SENT_COL, w: "#ffd0d0", k: "#400010", y: YEL });
const badgeSpr = makeSprite(BADGE, { y: YEL, w: WHT });
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

// ---------- input ----------
const keys = new Set<string>(); const pressed = new Set<string>();
addEventListener("keydown", e => { if (!keys.has(e.code)) pressed.add(e.code); keys.add(e.code); if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault(); audio.init(); });
addEventListener("keyup", e => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
// ---------- gamepad (standard mapping, Xbox labels) ----------
const pad = { ax: 0, ay: 0, held: new Set<string>(), prev: [] as boolean[], flick: false, connected: false };
let onPad: (c: boolean) => void = () => {};
addEventListener("gamepadconnected", () => audio.init());
function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp: Gamepad | null = null; for (const p of pads) if (p && p.connected) { gp = p; break; }
  pad.held.clear(); pad.ax = pad.ay = 0;
  if (!gp) { if (pad.connected) { pad.connected = false; onPad(false); } return; }
  if (!pad.connected) { pad.connected = true; onPad(true); }
  const b = (i: number) => { const x = gp!.buttons[i]; return !!x && (x.pressed || x.value > 0.5); };
  let x = gp.axes[0] || 0, y = gp.axes[1] || 0; const m = Math.hypot(x, y), DZ = 0.22;
  if (m < DZ) x = y = 0; else { const k = Math.min(1, (m - DZ) / (1 - DZ)) / m; x *= k; y *= k; }
  if (b(14)) x = -1; if (b(15)) x = 1; if (b(12)) y = -1; if (b(13)) y = 1;
  pad.ax = x; pad.ay = y;
  if (b(0)) pad.held.add("PadFire"); if (b(2)) pad.held.add("PadFocus");
  for (const [i, code] of [[1, "PadBomb"], [9, "PadStart"], [0, "PadA"]] as [number, string][]) if (b(i) && !pad.prev[i]) pressed.add(code);
  for (let i = 0; i < 17; i++) pad.prev[i] = b(i);
  const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0, rm = Math.hypot(rx, ry); // right-stick flick = targeting
  if (rm > 0.7 && !pad.flick) { pad.flick = true; pressed.add(Math.abs(rx) > Math.abs(ry) ? (rx > 0 ? "Digit2" : "Digit4") : (ry < 0 ? "Digit1" : "Digit3")); }
  else if (rm < 0.4) pad.flick = false;
}
const down = (...c: string[]) => c.some(k => keys.has(k) || pad.held.has(k));
const hit = (...c: string[]) => c.some(k => pressed.has(k));

// ---------- types ----------
interface Rival { id: number; name: string; isBot: boolean; alive: boolean; hp: number; badges: number; skill: number; target: number; retarget: number; sendCd: number;
  flash: number; place: number; regen: number; seed: number; col: number; koT: number; ai: number; }
interface Enemy { x: number; y: number; t: number; delay: number; path: number; x0: number; y0: number; idx: number; hp: number; col: number; form: number;
  fireCd: number; spr: number; entered: boolean; dead: boolean; boss?: boolean; maxhp?: number; sender?: number; vx?: number;
  bv?: number; hist?: { x: number; y: number }[]; segs?: { x: number; y: number }[]; tur?: number[]; turMax?: number; cyc?: number; vis?: number; eye?: boolean; tx?: number; ty?: number; }
interface Formation { id: number; total: number; killed: number; lost: boolean; sent: boolean; sender: number; done: boolean; }
interface Bullet { x: number; y: number; vx: number; vy: number; r: number; grazed?: boolean; col: string; dmg?: number; }
interface Item { x: number; y: number; vx: number; vy: number; kind: string; t: number; }
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; s: number; g?: number; }
interface Proj { variant?: number; sx: number; sy: number; ex: number; ey: number; t: number; dur: number; out: boolean; tier: number; power: number; target: number; sender: number; col: string; }
interface Popup { text: string; x: number; y: number; t: number; col: string; scale: number; ui?: boolean; }
interface Warn { variant?: number; t: number; tier: number; power: number; sender: number; x: number; }
interface Wave { t: number; dur: number; power: number; acc: number; pat: number; }

type State = "title" | "lobby" | "play" | "over" | "win";

class Game {
  state: State = "title"; time = 0; realT = 0;
  rivals: Rival[] = []; enemies: Enemy[] = []; forms: Formation[] = []; pb: Bullet[] = []; eb: Bullet[] = [];
  items: Item[] = []; parts: Part[] = []; uiParts: Part[] = []; projs: Proj[] = []; popups: Popup[] = []; warns: Warn[] = []; waves: Wave[] = [];
  bgStars: { x: number; y: number; z: number }[] = []; streaks: { x: number; y: number; vx: number; vy: number; life: number; col: string; big: boolean }[] = [];
  px = PW / 2; py = PH - 40; hp = 3; inv = 0; regen = 20; weapon = 0; shield = false; bombs = 2; dots = 0; fireCd = 0; focus = false;
  score = 0; badges = 0; starBoost = 0; kos = 0; place = 0; mode = 0; targets: number[] = []; randTarget = -1; randCd = 0;
  chain = 0; chainCol = -1; chainT = 0; chainMax = 2.6; eligible = false; freeze = 0; chainPulse = 0; grazes = 0; bestChain = 0;
  formCd = 2; formId = 0; shake = 0; hitstop = 0; slow = 0; flash = 0; flashCol = WHT; duel = false; dead = false; endT = 0; paused = false;
  lowWarn = 0; tripleQ: number[] = []; bombCol = MAG; bombAt: { x: number; y: number } | null = null; zapT = 0; zapCd = 0; bolts: { pts: { x: number; y: number }[]; life: number }[] = []; bombFx = 0; titleT = 0;
  constructor() { for (let i = 0; i < 90; i++) this.bgStars.push({ x: Math.random() * PW, y: Math.random() * PH, z: rnd(0.2, 1) }); }

  reset(players: PlayerInfo[]) {
    Object.assign(this, { time: 0, enemies: [], forms: [], pb: [], eb: [], items: [], parts: [], uiParts: [], projs: [], popups: [], warns: [], waves: [], streaks: [],
      px: PW / 2, py: PH - 40, hp: 3, inv: 2, regen: 20, weapon: 0, shield: false, bombs: 2, dots: 0, score: 0, badges: 0, starBoost: 0, kos: 0, place: 0,
      zapT: 0, zapCd: 0, bolts: [], tripleQ: [], bombAt: null, chain: 0, chainCol: -1, chainT: 0, eligible: false, freeze: 0, grazes: 0, bestChain: 0, formCd: 2, shake: 0, hitstop: 0, slow: 0, duel: false, dead: false, randTarget: -1, randCd: 0, endT: 0, bombFx: 0 });
    this.rivals = [];
    for (let i = 0; i < 100; i++) { const pl = players[i] || { id: i, name: "BOT", isBot: true };
      this.rivals.push({ id: i, name: pl.name, isBot: pl.isBot, alive: true, hp: 3, badges: 0, skill: 0, target: -2, retarget: 0, sendCd: 0, flash: 0, place: 0, regen: 0, seed: Math.random() * 100, col: Math.floor(Math.random() * 4), koT: 0, ai: 0 }); }
    this.state = "play"; audio.init(); audio.setTier(0); audio.startMusic();
    this.popup("STAGE START!", PW / 2, PH / 2 - 20, YEL, 3);
  }
  // ---------- network / lobby ----------
  net: Transport = new LocalSimTransport(); netMsg = ""; padMsgT = 0; padMsg = "";
  name = (() => { const q = new URLSearchParams(location.search).get("name"); if (q) return q.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "PILOT";
    try { let n = localStorage.getItem("sf101name"); if (!n) { n = "PILOT" + Math.floor(Math.random() * 90 + 10); localStorage.setItem("sf101name", n); } return n; } catch { return "PILOT"; } })();
  attackLog: { from: string; tier: number; t: number }[] = [];
  setNet(t: Transport) { this.net = t; t.on(e => { if (this.net === t) this.onNet(e); }); } lobbyLog: string[] = []; lobbyCount = 0; lobbyCd = -1; lastAttacker = -2; lobbyHumans = 0; lobbyVoted = false;
  bindNet() { this.setNet(this.net); }
  startLobby() { this.state = "lobby"; this.lobbyLog = []; this.lobbyCount = 0; this.lobbyCd = -1; this.lobbyHumans = 0; this.lobbyVoted = false; audio.init(); this.net.joinLobby(this.name); }
  onNet(e: NetEvent) {
    switch (e.type) {
      case "lobbyJoin": this.lobbyCount = e.count; if (!e.player.isBot) { this.lobbyHumans++; this.lobbyLog.push((e.player.id === this.net.localId ? e.player.name + " (YOU)" : e.player.name) + " JOINED"); } break;
      case "lobbyLeave": this.lobbyCount = e.count; this.lobbyHumans--; this.lobbyLog.push(e.name + " LEFT"); break;
      case "lobbyCountdown": this.lobbyCd = e.seconds; this.lobbyHumans = e.humans; break;
      case "matchStart": this.reset(e.players); break;
      case "state": if (this.state !== "play") break; for (const st of e.states) { const r = this.rivals[st.id]; if (r && r.alive) { r.hp = st.hp; r.badges = st.badges; r.target = st.target === this.net.localId ? -1 : -2; } } break;
      case "hit": { const r = this.rivals[e.id]; if (r) { r.flash = 0.4; } break; }
      case "ko": { const r = this.rivals[e.id]; if (r && r.alive && this.state === "play") this.koRival(r, e.by === this.net.localId ? -1 : e.by, e.place, e.badges); break; }
      case "attack": {
        if (e.to !== this.net.localId || this.dead || this.state !== "play") break;
        const cp = this.cellPos(e.from); this.lastAttacker = e.from; this.attackLog.push({ from: this.rivals[e.from]?.name || "?", tier: e.tier, t: this.time });
        this.projs.push({ sx: cp.x + CELL_W / 2, sy: cp.y + CELL_H / 2, ex: PX + PW / 2 + rnd(-60, 60), ey: PY + 10, t: 0, dur: 0.8, out: false, tier: e.tier, power: e.power, variant: e.variant, target: -1, sender: e.from, col: SENT_COL }); break;
      }
      case "matchEnd": if (e.winner === this.net.localId && !this.dead && this.state === "play") { for (const r of this.rivals) r.alive = false; } break; // win resolves in updateRivals
      case "disconnected":
        this.netMsg = "OFFLINE: " + e.reason; const was = this.state; this.setNet(new LocalSimTransport());
        if (was === "lobby") this.startLobby(); else if (was === "play" && !this.dead) { this.gameOver(); } break;
    }
  }
  get aliveAI() { let n = 0; for (const r of this.rivals) if (r.alive) n++; return n; }
  get remaining() { return this.aliveAI + (this.dead ? 0 : 1); }
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
  cellPos(i: number) { const left = i < 50, j = left ? i : i - 50, col = j % 10, row = (j / 10) | 0; return { x: (left ? 5 : 465) + col * 17, y: (left ? 192 : 5) + row * 33 }; }

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
    if (this.state !== "play") {
      this.updateFx(dt);
      if (this.state === "lobby") { this.net.tick(dt, this.hints()); if (this.lobbyCd > 0) this.lobbyCd -= dt; if (hit("Enter", "PadStart")) { this.net.requestStart(); this.lobbyVoted = true; } }
      if (this.state === "title" && hit("Enter", "Space", "KeyZ", "PadStart", "PadA")) this.startLobby();
      else if ((this.state === "over" || this.state === "win") && this.realT - this.endT > 0.6 && hit("Enter", "KeyR", "PadStart")) this.startLobby();
      return;
    }
    if (hit("KeyP", "Escape", "PadStart")) this.paused = !this.paused;
    if (hit("KeyM")) audio.toggleMute();
    if (this.paused) return;
    for (let k = 0; k < 4; k++) if (hit("Digit" + (k + 1), "Numpad" + (k + 1))) { this.mode = k; this.popup("TARGET: " + MODES[k], PW / 2, PH - 70, CYA, 1); }
    if (this.hitstop > 0) { this.hitstop--; return; }
    if (this.slow > 0) { this.slow -= dt; dt *= 0.35; }
    this.time += dt;
    this.updatePlayer(dt); this.updateChain(dt); this.spawnFormations(dt); this.updateEnemies(dt); this.updateBullets(dt);
    this.updateItems(dt); this.updateWaves(dt); this.updateWarns(dt); this.net.tick(dt, this.hints()); this.updateRivals(dt); this.updateProjs(dt); this.updateFx(dt);
    this.randCd -= dt; this.computeTargets();
    const rem = this.remaining; audio.setTier(rem > 75 ? 0 : rem > 50 ? 1 : rem > 25 ? 2 : rem > 10 ? 3 : 4); audio.lowHealth = this.hp === 1;
  }

  updatePlayer(dt: number) {
    this.focus = down("ShiftLeft", "ShiftRight", "PadFocus");
    const sp = this.focus ? 70 : 160; let dx = 0, dy = 0;
    if (down("ArrowLeft", "KeyA")) dx--; if (down("ArrowRight", "KeyD")) dx++; if (down("ArrowUp", "KeyW")) dy--; if (down("ArrowDown", "KeyS")) dy++;
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }
    if (pad.ax || pad.ay) { dx = pad.ax; dy = pad.ay; } // analog
    this.px = clamp(this.px + dx * sp * dt, 6, PW - 6); this.py = clamp(this.py + dy * sp * dt, 10, PH - 8);
    this.inv -= dt; this.fireCd -= dt;
    if (this.fireCd <= 0 && down("KeyZ", "Space", "PadFire")) { // hold to fire
      this.fireCd = 0.075; const w = this.weapon;
      if (this.focus) { const n = 2 + w; for (let i = 0; i < n; i++) this.pb.push({ x: this.px + (i - (n - 1) / 2) * 3, y: this.py - 8, vx: 0, vy: -480, r: 2, col: YEL, dmg: 1.3 }); }
      else {
        this.pb.push({ x: this.px - 3, y: this.py - 6, vx: 0, vy: -420, r: 2, col: MAG }, { x: this.px + 3, y: this.py - 6, vx: 0, vy: -420, r: 2, col: MAG });
        const sides = w; for (let i = 1; i <= sides; i++) { const a = 0.13 * i; this.pb.push({ x: this.px, y: this.py - 4, vx: -Math.sin(a) * 400, vy: -Math.cos(a) * 400, r: 2, col: CYA }, { x: this.px, y: this.py - 4, vx: Math.sin(a) * 400, vy: -Math.cos(a) * 400, r: 2, col: CYA }); }
      }
      audio.shoot();
    }
    if (hit("KeyX", "PadBomb")) this.bomb();
    this.updateLightning(dt); this.updateTriple(dt);
    if (this.hp < 3) { this.regen -= dt; if (this.regen <= 0) { this.hp++; this.regen = 20; this.popup("+1 HP", this.px, this.py - 16, CYA, 1); audio.power(); } } else this.regen = 20;
    // engine particles
    if (Math.random() < 0.7) this.parts.push({ x: this.px + rnd(-1, 1), y: this.py + 7, vx: rnd(-10, 10), vy: rnd(60, 120), life: 0.2, max: 0.2, col: Math.random() < 0.5 ? CYA : WHT, s: 1 });
  }

  /** Lightning power-up: auto chain-lightning to the nearest enemy, jumping to 2-3 more. Kills count toward chains. */
  updateLightning(dt: number) {
    for (const b of this.bolts) b.life -= dt; this.bolts = this.bolts.filter(b => b.life > 0);
    if (this.zapT <= 0 || this.dead) return;
    this.zapT -= dt; this.zapCd -= dt; if (this.zapCd > 0) return; this.zapCd = 0.25;
    const live = (e: Enemy) => !e.dead && (e.boss || (e.t >= e.delay && e.entered)) && e.x > 0 && e.x < PW && e.y > 0 && e.y < PH;
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
      if (best.boss) { const wp = this.bossParts(best).find(p => p.weak); if (wp) this.damageBoss(best, 2, wp.tur); }
      else { best.hp -= 2; if (best.hp <= 0) this.killEnemy(best, true); }
      from = { x: best.x, y: best.y };
    }
    audio.zap();
  }
  /** Bomb pickup at max stock: three staggered full-screen blasts (~3x bomb). Free, and keeps your chain (reward). */
  tripleBomb() {
    this.tripleQ = [0, 0.18, 0.36]; audio.tripleBomb(); this.popup("TRIPLE BOMB!", PW / 2, PH / 2 - 10, YEL, 4); this.inv = Math.max(this.inv, 1.5);
  }
  updateTriple(dt: number) {
    if (!this.tripleQ.length) return;
    this.tripleQ = this.tripleQ.map(t => t - dt);
    while (this.tripleQ.length && this.tripleQ[0] <= 0) {
      this.tripleQ.shift(); const k = 3 - this.tripleQ.length; const col = [YEL, MAG, CYA][k - 1];
      this.shake = 10 + k * 2; this.flash = 0.35; this.flashCol = col; this.bombFx = 0.6; this.bombCol = col;
      this.bombAt = { x: k === 1 ? this.px : rnd(40, PW - 40), y: k === 1 ? this.py : rnd(60, PH - 80) };
      for (const b of this.eb) this.burst(b.x, b.y, b.col, 1, 40); this.eb = [];
      for (const w of this.waves) w.t = w.dur;
      for (const e of this.enemies) { if (e.boss) this.bombBoss(e); else { e.hp = 0; this.killEnemy(e, false); } }
      this.burst(this.bombAt.x, this.bombAt.y, col, 70, 220); this.burst(this.bombAt.x, this.bombAt.y, WHT, 30, 140);
      if (this.chain > 0) this.chainT = this.chainMax; // chain survives (and is kept alive) through the blasts
    }
  }
  bomb() {
    if (this.bombs <= 0) return; this.bombs--; audio.bomb(); this.shake = 8; this.flash = 0.4; this.flashCol = MAG; this.bombFx = 0.6; this.bombCol = MAG; this.bombAt = null;
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
    this.score += power * 500; audio.sent(tier); this.flash = 0.15; this.flashCol = [CYA, MAG, YEL][tier];
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
    if (this.chainT <= 0) { this.popup("CHAIN LOST", PW / 2, 60, "#888888", 2); audio.chainLost(); this.chain = 0; this.chainCol = -1; this.eligible = false; }
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
      const hp = sent ? 2 : (this.time > 240 && Math.random() < 0.3 ? 3 : 1);
      this.enemies.push({ x: -50, y: -50, t: 0, delay: i * (path === 3 ? 0.08 : 0.22), path, x0: path === 1 ? (side ? -12 : PW + 12) : path === 3 ? PW / 2 + (i - (n - 1) / 2) * 20 : x0, y0: rnd(40, 140),
        idx: i, hp, col: sent ? SENT : col, form: f.id, fireCd: rnd(1, 3), spr, entered: false, dead: false, sender, vx: side ? 1 : -1 });
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
  /** Hit regions: weak = takes damage, block = absorbs shots. */
  bossParts(e: Enemy) {
    const P: { x: number; y: number; rx: number; ry: number; weak: boolean; tur?: number }[] = [];
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
    if (t > 40) { e.dead = true; this.popup(BOSS_NAMES[e.bv ?? 0] + " ESCAPED", PW / 2, 80, "#888888", 1); }
    for (const p of this.bossParts(e)) if (this.collidePlayer(p.x, p.y, Math.min(p.rx, p.ry))) { this.hurt(); break; }
  }
  collidePlayer(x: number, y: number, r: number) { const dx = x - this.px, dy = y - this.py; return dx * dx + dy * dy < (r + 1.5) * (r + 1.5); }

  killEnemy(e: Enemy, byShot: boolean) {
    if (e.dead) return; e.dead = true;
    const col = allCols[e.col];
    this.burst(e.x, e.y, col, e.boss ? 80 : 14, e.boss ? 160 : 90); this.burst(e.x, e.y, WHT, 4, 40);
    if (e.boss) {
      this.shake = 10; this.hitstop = 10; audio.explodeBig(); this.flash = 0.3; this.flashCol = YEL; this.score += 20000;
      this.popup("BOSS DOWN!", PW / 2, PH / 2 - 30, YEL, 3);
      this.reflect(e.sender ?? -1, 1, 12);
      for (let i = 0; i < 12; i++) this.items.push({ x: e.x + rnd(-15, 15), y: e.y + rnd(-10, 10), vx: rnd(-30, 30), vy: rnd(-60, 0), kind: "dot", t: 0 });
      this.items.push({ x: e.x, y: e.y, vx: 0, vy: 20, kind: pick(["W", "B", "S", "F", "L"]), t: 0 });
      this.chainAdd(e.col, 5);
      return;
    }
    this.shake = Math.max(this.shake, 1.5);
    const f = this.forms.find(f => f.id === e.form);
    if (byShot) {
      this.chainAdd(e.col, 0);
      this.score += Math.round(100 * (1 + this.chain / 10));
      audio.kill(this.chain);
      if (f) { f.killed++; if (f.killed >= f.total && !f.lost) this.formClear(f, e); }
    } else if (f) f.lost = true;
    const nd = ri(1, 2); for (let i = 0; i < nd; i++) this.items.push({ x: e.x, y: e.y, vx: rnd(-20, 20), vy: rnd(-50, -10), kind: "dot", t: 0 });
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
    if (this.shield) { this.shield = false; this.inv = 1.5; this.popup("SHIELD!", this.px, this.py - 14, CYA, 2); audio.power(); this.clearNear(50); return; }
    this.hp--; this.inv = 2.2; this.regen = 20; this.weapon = Math.max(0, this.weapon - 1);
    audio.hurt(); this.shake = 9; this.hitstop = 8; this.flash = 0.25; this.flashCol = "#ff2040"; this.burst(this.px, this.py, SENT_COL, 30, 120);
    this.clearNear(60);
    if (this.hp === 1) { this.slow = 0.6; this.popup("DANGER!", PW / 2, PH / 2, SENT_COL, 3); }
    if (this.hp <= 0) this.gameOver();
  }
  clearNear(r: number) { this.eb = this.eb.filter(b => { const d = Math.hypot(b.x - this.px, b.y - this.py) > r; if (!d) this.burst(b.x, b.y, b.col, 1, 30); return d; }); }
  gameOver() {
    this.dead = true; this.place = this.aliveAI + 1; this.net.sendKO(this.lastAttacker); this.state = "over"; this.endT = this.realT; audio.stopMusic(); audio.explodeBig();
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
      case "L": this.zapT = 5; this.zapCd = 0; this.popup("LIGHTNING!", this.px, this.py - 16, "#c0f8ff", 2); audio.lightning(); this.flash = 0.1; this.flashCol = CYA; break;
      case "S": this.shield = true; this.popup("SHIELD!", this.px, this.py - 14, CYA, 1); audio.power(); break;
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
    for (const w of this.warns) {
      w.t -= dt;
      if (w.t <= 0) {
        this.flash = 0.12; this.flashCol = SENT_COL; this.shake = Math.max(this.shake, 3);
        if (w.tier === 0) { this.spawnFormation(clamp(3 + Math.floor(w.power / 5), 3, 10), SENT, ri(0, 3), true, w.sender); }
        else if (w.tier === 1) { this.waves.push({ t: 0, dur: 2 + Math.min(3, w.power / 16), power: w.power, acc: 0, pat: ri(0, 1) }); }
        else this.spawnBoss(w.variant ?? 0, w.power, w.sender);
        for (let i = 0; i < 20; i++) this.parts.push({ x: w.x + rnd(-20, 20), y: rnd(0, 30), vx: 0, vy: rnd(20, 80), life: 0.4, max: 0.4, col: SENT_COL, s: 2 });
      }
    }
    this.warns = this.warns.filter(w => w.t > 0);
  }

  // ---------- opponents (state arrives via this.net) ----------
  hints() { return { time: this.time, calm: this.calm, ramp: this.ramp, localBadges: this.badges, localArmed: this.eligible, localDead: this.dead, duel: this.duel }; }
  updateRivals(dt: number) {
    for (const r of this.rivals) { if (!r.alive) { r.koT += dt; continue; } r.flash -= dt; r.ai += dt; }
    if (this.state === "play" && !this.dead) {
      if (this.time % 0.25 < dt) this.net.sendState(this.hp, this.badges, this.targets, this.eligible);
    }
    if (!this.duel && this.aliveAI === 1 && !this.dead) { this.duel = true; this.slow = 1.2; this.popup("FINAL DUEL!", PW / 2, PH / 2 - 10, YEL, 4); this.flash = 0.4; this.flashCol = YEL; }
    if (this.aliveAI === 0 && !this.dead && this.state === "play") { this.state = "win"; this.place = 1; this.endT = this.realT; this.popup("VICTORY!", PW / 2, PH / 2, YEL, 4); audio.stopMusic(); audio.cashIn(2); }
  }
  koRival(v: Rival, killer: number, place: number, badges: number) {
    v.alive = false; v.hp = 0; v.place = place; v.koT = 0; v.badges = badges;
    const cp = this.cellPos(v.id);
    for (let i = 0; i < 26; i++) { const a = Math.random() * 6.283, s = rnd(20, 90); this.uiParts.push({ x: cp.x + rnd(0, CELL_W), y: cp.y + rnd(0, CELL_H), vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: rnd(0.5, 1), max: 1, col: pick([COLORS[v.col], WHT, "#6040a0"]), s: ri(1, 3), g: 160 }); }
    this.kos++;
    // background starfall streak for every KO
    this.streaks.push({ x: rnd(0, PW), y: -10, vx: rnd(-40, 40), vy: rnd(160, 240), life: 2, col: COLORS[v.col], big: false });
    if (killer === -1) {
      this.popup("K.O.!", PW / 2, PH / 2 + 20, YEL, 3); audio.ko(); this.shake = 4; this.score += 10000;
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
          this.warns.push({ t: 1.3, tier: p.tier, power: p.power, sender: p.sender, x: p.ex - PX, variant: p.variant }); audio.incoming(p.tier);
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
    this.shake = Math.max(0, this.shake - dt * 30); this.flash = Math.max(0, this.flash - dt); this.bombFx = Math.max(0, this.bombFx - dt);
    for (const s of this.bgStars) { s.y += s.z * 30 * dt * (this.state === "play" ? Math.sqrt(this.ramp) : 1); if (s.y > PH) { s.y = 0; s.x = Math.random() * PW; } }
    // starfall sky density grows with KOs; meteor shower in the final duel
    const rate = this.duel || this.state === "win" ? 12 : this.kos * 0.03;
    if (Math.random() < rate * dt) this.streaks.push({ x: rnd(-40, PW + 40), y: -10, vx: rnd(-50, 30), vy: rnd(120, 260), life: 3, col: pick(COLORS), big: this.duel && Math.random() < 0.3 });
    for (const s of this.streaks) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
    this.streaks = this.streaks.filter(s => s.life > 0 && s.y < PH + 20);
  }

  // ---------- render ----------
  render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#06020e"; ctx.fillRect(0, 0, W, H);
    const sx = this.shake > 0 ? Math.round(rnd(-1, 1) * this.shake) : 0, sy = this.shake > 0 ? Math.round(rnd(-1, 1) * this.shake) : 0;
    if (this.state === "title") { this.renderTitle(); this.drawPadMsg(); return; }
    if (this.state === "lobby") { this.renderTitle(true); this.renderLobby(); this.drawPadMsg(); return; }
    ctx.setTransform(1, 0, 0, 1, sx * 0.3, sy * 0.3);
    this.renderPanels();
    ctx.setTransform(1, 0, 0, 1, sx, sy);
    this.renderField();
    ctx.setTransform(1, 0, 0, 1, sx * 0.3, sy * 0.3); this.renderBottom();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const p of this.uiParts) { ctx.globalAlpha = clamp(p.life / p.max * 1.5, 0, 1); ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); } ctx.globalAlpha = 1;
    for (const p of this.projs) { const q = this.projPos(p); ctx.fillStyle = p.col; ctx.fillRect(Math.round(q.x) - 2, Math.round(q.y) - 2, 5, 5); ctx.fillStyle = WHT; ctx.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, 3, 3); }
    if (this.flash > 0) { ctx.globalAlpha = Math.min(0.5, this.flash * 2); ctx.fillStyle = this.flashCol; ctx.fillRect(PX, PY, PW, PH); ctx.globalAlpha = 1; }
    this.drawPadMsg();
    if (this.paused) this.centerBox(["PAUSED", "P / START TO RESUME"], CYA);
    if (this.state === "over" && this.realT - this.endT > 0.5) this.centerBox(["GAME OVER", "PLACE #" + this.place + " / 101", "SCORE " + this.score, "KOS " + this.kos + "  BADGES " + this.badges + "  BEST CHAIN " + this.bestChain, "", "R / ENTER / START TO RETRY"], MAG);
    if (this.state === "win" && this.realT - this.endT > 1) this.centerBox(["VICTORY!", "#1 OF 101", "SCORE " + this.score, "KOS " + this.kos + "  BADGES " + this.badges + "  BEST CHAIN " + this.bestChain, "", "R / ENTER / START: AGAIN"], YEL);
  }
  drawPadMsg() { if (this.padMsgT > 0) { const w = textWidth(this.padMsg, 1) + 16; ctx.fillStyle = "#000"; ctx.fillRect((W - w) / 2, 2, w, 13); this.frame((W - w) / 2, 2, w, 13, "#60ff80"); drawText(ctx, this.padMsg, W / 2, 6, "#60ff80", 1, "center"); } }
  centerBox(lines: string[], col: string) {
    const w = 196, h = 20 + lines.length * 14, x = PX + (PW - w) / 2, y = PY + PH / 2 - h / 2;
    ctx.fillStyle = "rgba(6,2,14,0.88)"; ctx.fillRect(x, y, w, h); this.frame(x, y, w, h, col);
    lines.forEach((l, i) => { const big = i === 0; drawText(ctx, l, PX + PW / 2, y + 10 + i * 14 + (big ? -2 : 2), big ? col : WHT, big ? 3 : 1, "center", big ? "#000" : undefined); });
  }
  frame(x: number, y: number, w: number, h: number, col: string) { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); ctx.globalAlpha = 0.35; ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1); ctx.globalAlpha = 1; }

  renderLobby() {
    const w = 300, h = 160, x = (W - w) / 2, y = 180; ctx.fillStyle = "rgba(6,2,14,0.94)"; ctx.fillRect(x, y, w, h); this.frame(x, y, w, h, CYA);
    drawText(ctx, (this.net.online ? "ONLINE " : "OFFLINE ") + "LOBBY  " + this.lobbyCount + " / " + MAX_PLAYERS, W / 2, y + 8, this.net.online ? "#60ff80" : CYA, 2, "center");
    ctx.fillStyle = DIM; ctx.fillRect(x + 10, y + 24, w - 20, 5); ctx.fillStyle = MAG; ctx.fillRect(x + 10, y + 24, Math.round((w - 20) * this.lobbyCount / MAX_PLAYERS), 5);
    this.lobbyLog.slice(-9).forEach((l, i) => drawText(ctx, l, x + 12, y + 36 + i * 10, l.startsWith(this.name + " ") || l.startsWith("YOU") ? YEL : l.includes("LEFT") ? "#8070b0" : "#60ff80", 1));
    const hum = Math.max(this.lobbyHumans, this.lobbyLog.length ? 1 : 0);
    drawText(ctx, "HUMANS " + this.lobbyHumans + "  AI BOTS WILL FILL " + (MAX_PLAYERS - this.lobbyHumans) + " SLOTS", x + w - 12, y + 36, CYA, 1, "right"); void hum;
    const cd = this.lobbyCd > 0 ? "MATCH STARTS IN " + Math.ceil(this.lobbyCd) + "S" : "WAITING FOR PLAYERS";
    drawText(ctx, cd, W / 2, y + h - 24, YEL, 1, "center");
    drawText(ctx, this.lobbyVoted ? "VOTED TO START - WAITING FOR OTHERS" : (pad.connected ? "START" : "ENTER") + ": VOTE TO START NOW", W / 2, y + h - 12, this.lobbyVoted ? "#60ff80" : WHT, 1, "center");
  }
  renderTitle(bgOnly = false) {
    const t = this.titleT;
    for (const s of this.bgStars) { ctx.fillStyle = s.z > 0.7 ? WHT : "#6a5a9a"; ctx.fillRect(Math.round(s.x / PW * W), Math.round(s.y / PH * H), 1, 1); }
    for (const s of this.streaks) this.drawStreak(s.x / PW * W, s.y / PH * H, s.vx, s.vy, s.col, false);
    if (Math.random() < 0.15) this.streaks.push({ x: rnd(0, PW), y: -10, vx: rnd(-40, 10), vy: rnd(100, 200), life: 3, col: pick(COLORS), big: false });
    const bob = Math.round(Math.sin(t * 2) * 3);
    if (bgOnly) { drawText(ctx, "STARFALL 101", W / 2, 120, MAG, 6, "center", "#3a0040"); return; }
    drawText(ctx, "STARFALL", W / 2, 70 + bob, MAG, 10, "center", "#3a0040");
    drawText(ctx, "101", W / 2, 130 + bob, CYA, 8, "center", "#003040");
    drawText(ctx, "101-PLAYER NEON SHOOTER BATTLE ROYALE", W / 2, 180, YEL, 2, "center");
    ctx.drawImage(shipSpr, W / 2 - 11, 200, 22, 22);
    drawText(ctx, (this.net.online ? "ONLINE  " : "OFFLINE  ") + "PILOT " + this.name + (this.netMsg ? "   " + this.netMsg : ""), W / 2, 262, this.net.online ? "#60ff80" : "#8070b0", 1, "center");
    if (Math.floor(t * 2) % 2 === 0) drawText(ctx, pad.connected ? "PRESS START TO LAUNCH" : "PRESS ENTER TO LAUNCH", W / 2, 240, WHT, 2, "center");
    const help = pad.connected ? ["CONTROLLER: L-STICK / D-PAD MOVE   A HOLD FIRE   X HOLD FOCUS   B BOMB", "R-STICK FLICK TARGET: UP RANDOM  RIGHT KOS  DOWN ATTACKERS  LEFT BADGES   START PAUSE",
      ] : ["MOVE: ARROWS / WASD   FIRE: HOLD Z / SPACE   FOCUS: SHIFT   BOMB: X", "TARGET: 1 RANDOM  2 KOS  3 ATTACKERS  4 BADGES    M MUTE   P PAUSE",
      "CHAIN SAME-COLOR KILLS. CLEAR A FULL FORMATION TO ARM AN ATTACK. IT SENDS WHEN", "THE CHAIN TIMER RUNS OUT, OR INSTANTLY AT 40 (MINI-BOSS).  CATCH FALLING STARS TO BOOST IT."];
    help.forEach((l, i) => drawText(ctx, l, W / 2, 280 + i * 12, i < 2 ? CYA : "#b080ff", 1, "center"));
  }

  renderPanels() {
    const LW = 176;
    // left HUD
    ctx.fillStyle = "#0c0418"; ctx.fillRect(2, 2, LW, 184); this.frame(2, 2, LW, 184, MAG);
    const rk = String(this.dead ? this.place : this.remaining);
    drawText(ctx, "RANK", 8, 10, YEL, 2); drawText(ctx, rk, 52, 8, WHT, 3); drawText(ctx, "/101", 52 + textWidth(rk, 3) + 4, 14, MAG, 2);
    drawText(ctx, "SCORE", 8, 34, CYA, 1); drawText(ctx, String(this.score).padStart(9, "0"), 44, 32, WHT, 2);
    drawText(ctx, "BOMBS", 8, 50, CYA, 1); for (let i = 0; i < this.bombs; i++) { ctx.fillStyle = YEL; ctx.fillRect(44 + i * 11, 48, 7, 7); ctx.fillStyle = "#806000"; ctx.fillRect(46 + i * 11, 50, 3, 3); }
    drawText(ctx, "WEAPON", 8, 64, CYA, 1); for (let i = 0; i < 4; i++) { ctx.fillStyle = i <= this.weapon ? CYA : DIM; ctx.fillRect(44 + i * 9, 63, 7, 5); }
    drawText(ctx, "ATK +" + this.badges * 10 + "%", 110, 64, YEL, 1);
    drawText(ctx, "BADGES", 8, 78, CYA, 1); for (let i = 0; i < Math.min(this.badges, 12); i++) ctx.drawImage(badgeSpr, 44 + i * 9, 76);
    if (this.badges > 12) drawText(ctx, "+" + (this.badges - 12), 154, 78, YEL, 1);
    drawText(ctx, "KOS " + this.kos, 8, 92, CYA, 1); drawText(ctx, "STAR BOOST +" + this.starBoost, 60, 92, YEL, 1);
    if (this.shield) drawText(ctx, "SHIELD UP", 8, 104, CYA, 1);
    // target box
    ctx.fillStyle = "#14062a"; ctx.fillRect(7, 116, LW - 10, 64); this.frame(7, 116, LW - 10, 64, YEL);
    drawText(ctx, "TARGET: " + MODES[this.mode], 12, 121, YEL, 1);
    const tid = this.targets[0];
    if (tid !== undefined && this.rivals[tid]) {
      const r = this.rivals[tid]; this.drawMini(r, 13, 131, true);
      drawText(ctx, r.name.slice(0, 8) + (this.targets.length > 1 ? " +" + (this.targets.length - 1) : ""), 36, 134, WHT, 2);
      drawText(ctx, "HP", 36, 150, CYA, 1); for (let i = 0; i < 3; i++) { ctx.fillStyle = i < r.hp ? MAG : DIM; ctx.fillRect(48 + i * 7, 149, 5, 5); }
      drawText(ctx, "BADGES " + r.badges, 76, 150, YEL, 1);
      drawText(ctx, "1-4 SWITCH MODE", 36, 164, "#8070b0", 1);
    }
    // grids (all 100 opponents)
    ctx.fillStyle = "#0c0418"; ctx.fillRect(2, 188, LW, 170); this.frame(2, 188, LW, 170, MAG);
    ctx.fillStyle = "#0c0418"; ctx.fillRect(462, 2, LW, 170); this.frame(462, 2, LW, 170, MAG);
    for (const r of this.rivals) { const p = this.cellPos(r.id); this.drawMini(r, p.x, p.y, false); }
    // right lower: targeting / incoming / time
    const RX = 468; ctx.fillStyle = "#0c0418"; ctx.fillRect(462, 174, LW, 184); this.frame(462, 174, LW, 184, CYA);
    drawText(ctx, "TARGETING", RX, 182, CYA, 2);
    MODES.forEach((m, i) => { const on = this.mode === i, y = 198 + i * 15; ctx.fillStyle = on ? MAG : "#1a0a30"; ctx.fillRect(RX, y, 164, 12); drawText(ctx, (i + 1) + "  " + m, RX + 4, y + 4, on ? WHT : "#8070b0", 1); drawText(ctx, "RS " + ["UP", "RIGHT", "DOWN", "LEFT"][i], RX + 160, y + 4, on ? WHT : "#5a4a8a", 1, "right"); });
    const att = this.attackers().length;
    drawText(ctx, "ATTACKERS ON YOU: " + att, RX, 262, att > 3 ? SENT_COL : CYA, 1);
    const pw = Math.round(this.chain * (1 + 0.1 * this.badges) + this.starBoost);
    drawText(ctx, "NEXT ATTACK POWER: " + (this.chain > 0 ? pw : 0), RX, 274, YEL, 1);
    if (pad.connected) { drawText(ctx, "PAD: A FIRE  X FOCUS  B BOMB", RX, 290, "#8070b0", 1); drawText(ctx, "R-STICK FLICK = TARGET MODE", RX, 300, "#8070b0", 1); }
    else { drawText(ctx, "FIRE: HOLD Z/SPACE", RX, 290, "#8070b0", 1); drawText(ctx, "FOCUS: SHIFT  BOMB: X", RX, 300, "#8070b0", 1); }
    drawText(ctx, this.net.online ? "ONLINE" : "OFFLINE", RX + 164, 342, this.net.online ? "#60ff80" : "#5a4a8a", 1, "right");
    if (this.warns.length || this.projs.some(p => !p.out)) { if (Math.floor(this.realT * 6) % 2) { ctx.fillStyle = SENT_COL; ctx.fillRect(RX, 314, 164, 18); drawText(ctx, "!! INCOMING ATTACK !!", RX + 82, 321, "#000", 1, "center"); } }
    drawText(ctx, "TIME " + Math.floor(this.time / 60) + ":" + String(Math.floor(this.time % 60)).padStart(2, "0") + (this.calm ? "  CALM PHASE" : "  SPEED x" + this.ramp.toFixed(2)), RX, 342, "#8070b0", 1);
  }
  renderBottom() { // health + chain meter strip right under the ship
    const x0 = PX - 2, w = PW + 4, y = BY, h = 360 - BY - 2;
    ctx.fillStyle = "#0c0418"; ctx.fillRect(x0, y, w, h); this.frame(x0, y, w, h, CYA);
    for (let i = 0; i < 3; i++) { const on = i < this.hp; ctx.fillStyle = on ? (this.hp === 1 && Math.floor(this.realT * 6) % 2 ? "#ff2040" : MAG) : DIM; ctx.fillRect(x0 + 5 + i * 13, y + 5, 10, 8); if (on) { ctx.fillStyle = WHT; ctx.fillRect(x0 + 6 + i * 13, y + 6, 3, 2); } }
    if (this.hp < 3) { ctx.fillStyle = DIM; ctx.fillRect(x0 + 5, y + 16, 36, 2); ctx.fillStyle = CYA; ctx.fillRect(x0 + 5, y + 16, Math.round(36 * (1 - this.regen / 20)), 2); }
    if (this.shield) { ctx.strokeStyle = CYA; ctx.strokeRect(x0 + 3.5, y + 3.5, 41, 12); }
    if (this.zapT > 0) { drawText(ctx, "ZAP", x0 + 5, y + 20, Math.floor(this.realT * 10) % 2 ? WHT : CYA, 1); ctx.fillStyle = DIM; ctx.fillRect(x0 + 19, y + 21, 24, 3); ctx.fillStyle = CYA; ctx.fillRect(x0 + 19, y + 21, Math.round(24 * this.zapT / 5), 3); }
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
      drawText(ctx, String(r.id + 1), x + 2, y + 2, this.targets.includes(r.id) ? YEL : r.isBot ? "#9080c0" : "#60ff80", 1);
      if (r.badges > 0) { ctx.fillStyle = YEL; for (let i = 0; i < Math.min(4, r.badges); i++) ctx.fillRect(x + 2 + i * 3, y + h - 9, 2, 2); }
      if (r.target === -1 && !big) { ctx.fillStyle = SENT_COL; ctx.fillRect(x + w - 2, y + 2, 1, 5); }
      if (this.targets.includes(r.id) && !big) { const b = Math.floor(this.realT * 4) % 2; ctx.fillStyle = YEL; ctx.fillRect(x - 1 - b, y - 1 - b, 4, 1); ctx.fillRect(x - 1 - b, y - 1 - b, 1, 4); ctx.fillRect(x + w - 3 + b, y + h + b, 4, 1); ctx.fillRect(x + w + b, y + h - 3 + b, 1, 4); }
    } else {
      ctx.strokeStyle = "#1a1028"; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (r.koT > 0.4) { drawText(ctx, "KO", x + w / 2, y + 10, "#4a3a6a", 1, "center"); drawText(ctx, String(r.place), x + w / 2, y + 20, "#3a2a5a", 1, "center"); }
      else { ctx.fillStyle = WHT; ctx.globalAlpha = 1 - r.koT / 0.4; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1; }
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
    drawText(ctx, BOSS_NAMES[e.bv ?? 0] + (sh ? " (SHIELDED)" : "") + " FROM " + (this.rivals[e.sender ?? -1]?.name || "?"), PW / 2, 10, SENT_COL, 1, "center");
  }
  renderField() {
    ctx.save(); ctx.translate(PX, PY);
    ctx.beginPath(); ctx.rect(0, 0, PW, PH); ctx.clip();
    ctx.fillStyle = "#04010a"; ctx.fillRect(0, 0, PW, PH);
    // nebula band (dithered purple haze)
    for (let yy = 0; yy < PH; yy += 2) { const wy = yy - this.time * 6; const cx = PW / 2 + Math.sin(wy * 0.02) * 45 + Math.sin(wy * 0.007) * 25, hw = 18 + Math.sin(wy * 0.05) * 8;
      ctx.fillStyle = "rgba(110,30,170,0.13)"; ctx.fillRect(Math.round(cx - hw * 1.8), yy, Math.round(hw * 3.6), 2);
      ctx.fillStyle = "rgba(170,60,220,0.12)"; ctx.fillRect(Math.round(cx - hw), yy, Math.round(hw * 2), 2);
      if ((yy / 2 + Math.floor(wy)) % 3 === 0) { ctx.fillStyle = "rgba(220,140,255,0.25)"; ctx.fillRect(Math.round(cx + Math.sin(yy * 1.7) * hw), yy, 1, 1); } }
    for (const s of this.bgStars) { ctx.fillStyle = s.z > 0.75 ? WHT : s.z > 0.45 ? "#8a7ac0" : "#3a2a6a"; ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, s.z > 0.85 ? 2 : 1); }
    // side towers
    for (const side of [0, 1]) for (let i = 0; i < 6; i++) { const hh = 40 + ((i * 37) % 60), ww = 10 + (i % 3) * 4; const x = side ? PW - ww - (i * 7) % 18 : (i * 7) % 18; const y = PH - hh - ((i * 23) % 30) + 30;
      ctx.fillStyle = "#140828"; ctx.fillRect(x, y, ww, PH - y); ctx.fillStyle = "#2a1050"; ctx.fillRect(x + 1, y, 1, PH - y); if (i % 2) { ctx.fillStyle = MAG; ctx.fillRect(x + ww / 2, y + 6, 1, 1); } }
    for (const s of this.streaks) this.drawStreak(s.x, s.y, s.vx, s.vy, s.col, s.big);
    if (this.bombFx > 0) { const r = (0.6 - this.bombFx) * 500, o = this.bombAt || { x: this.px, y: this.py }; ctx.strokeStyle = this.bombCol; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, 6.283); ctx.stroke(); ctx.lineWidth = 1; }
    // items
    for (const it of this.items) {
      const x = Math.round(it.x), y = Math.round(it.y);
      if (it.kind === "dot") { ctx.fillStyle = Math.floor(it.t * 8) % 2 ? YEL : WHT; ctx.fillRect(x - 1, y - 1, 2, 2); }
      else if (it.kind === "badge") ctx.drawImage(badgeSpr, x - 3, y - 3);
      else if (it.kind === "star") { ctx.fillStyle = YEL; ctx.fillRect(x - 3, y - 1, 7, 3); ctx.fillRect(x - 1, y - 3, 3, 7); ctx.fillStyle = WHT; ctx.fillRect(x - 1, y - 1, 3, 3); if (Math.floor(it.t * 6) % 2) drawText(ctx, "CATCH!", x, y - 12, YEL, 1, "center"); }
      else { const c = { W: CYA, B: MAG, F: "#a0e0ff", S: "#60ff80", L: Math.floor(this.realT * 10) % 2 ? WHT : CYA }[it.kind] || WHT; ctx.fillStyle = "#000"; ctx.fillRect(x - 5, y - 5, 11, 11); ctx.strokeStyle = c; ctx.strokeRect(x - 4.5, y - 4.5, 10, 10); drawText(ctx, it.kind, x - 1, y - 2, c, 1); }
    }
    // enemies
    for (const e of this.enemies) {
      if (e.dead || (!e.boss && e.t < e.delay)) continue;
      if (e.boss) { this.drawBoss(e); continue; }
      const spr = (e.spr ? bugSpr : saucerSpr)[e.col]; const bob = Math.floor(e.t * 6) % 2;
      ctx.drawImage(spr, Math.round(e.x - spr.width / 2), Math.round(e.y - spr.height / 2) + bob);
    }
    // player bullets
    for (const b of this.pb) { ctx.fillStyle = b.col; ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 3, 2, 6); ctx.fillStyle = WHT; ctx.fillRect(Math.round(b.x) - 0, Math.round(b.y) - 2, 1, 3); }
    for (const b of this.bolts) { // jagged neon lightning
      for (let i = 0; i < b.pts.length - 1; i++) { const p0 = b.pts[i], p1 = b.pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(p1.x - p0.x, p1.y - p0.y)));
        for (let k = 0; k <= n; k++) { const x = Math.round(p0.x + (p1.x - p0.x) * k / n), y = Math.round(p0.y + (p1.y - p0.y) * k / n); ctx.fillStyle = CYA; ctx.fillRect(x - 1, y, 3, 1); ctx.fillStyle = WHT; ctx.fillRect(x, y, 1, 1); } } }
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

const game = new Game(); game.bindNet(); (window as any).__game = game;
onPad = c => { game.padMsg = c ? "CONTROLLER CONNECTED" : "CONTROLLER DISCONNECTED"; game.padMsgT = 2.5; if (c && game.state === "play") game.popup("CONTROLLER CONNECTED", PW / 2, 50, "#60ff80", 1); };
chooseTransport().then(t => { if (game.state === "title") game.setNet(t); (window as any).__netReady = true; });
let last = performance.now(), acc = 0; const STEP = 1 / 60;
function loop(now: number) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  pollPad();
  while (acc >= STEP) { game.update(STEP); pressed.clear(); acc -= STEP; }
  game.render(); present(); requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
