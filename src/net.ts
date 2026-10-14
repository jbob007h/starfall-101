// ---------------------------------------------------------------------------
// Network layer. The game only talks to a `Transport`.
//  - LocalSimTransport: offline; fakes a lobby and runs MatchSim in the browser.
//  - WebSocketTransport: online; the Node server (server/index.ts) is authoritative.
// Game-side ids: the local player is `localId` (-1); the 100 others are 0..99 in
// mini-screen order. Server-side ids are global slots 0..100; transports convert.
// ---------------------------------------------------------------------------
import { MatchSim, Tier, botNames } from "./sim";
export type { Tier } from "./sim";
export const MAX_PLAYERS = 101;
export const LOCAL = -1;

export interface PlayerInfo { id: number; name: string; isBot: boolean; }
export interface PlayerState { id: number; hp: number; badges: number; target: number /* LOCAL = targeting you, -2 = other */; }
export type NetEvent =
  | { type: "lobbyJoin"; player: PlayerInfo; count: number }
  | { type: "lobbyLeave"; id: number; name: string; count: number }
  | { type: "lobbyCountdown"; seconds: number; humans: number }
  | { type: "matchStart"; players: PlayerInfo[]; seed: number }
  | { type: "attack"; from: number; to: number; tier: Tier; power: number; variant: number }
  | { type: "state"; states: PlayerState[] }
  | { type: "hit"; id: number; from: number }
  | { type: "ko"; id: number; by: number; place: number; badges: number }
  | { type: "matchEnd"; winner: number }
  | { type: "disconnected"; reason: string }
  | { type: "snap"; id: number; snap: Snap }   // live gameplay of a watched human (spectator)
  | { type: "watch"; on: boolean };            // someone is spectating you: start/stop sending snapshots
/** Compact gameplay snapshot (~15 Hz) relayed through the server to spectators. Ids are game-local on the client side.
 *  p: [px, py, hp, bombs, chain, chainCol, eligible, chainT%, score, weapon, shield, focus, inv, badges, mode, freeze, zap, regen, starBoost, kos, bombFx%]
 *  e: enemies [uid, x, y, spr, col, up, hitflash] or bosses [uid, x, y, -1-variant, hp, maxhp, sender, vis%, eye, tur0, tur1, turMax, ...segXY]
 *  b: enemy bullets flat [x, y, vx, vy, colIdx, r]; pb: player bullets flat [x, y, vx, vy, colIdx]; it: items flat [x, y, kindIdx]; tg: target ids */
export interface Snap { p: number[]; e: number[][]; b: number[]; pb: number[]; it: number[]; tg: number[]; }
export interface SimHints { time: number; calm: boolean; ramp: number; localBadges: number; localArmed: boolean; localDead: boolean; duel: boolean; }

export interface Transport {
  readonly localId: number;
  readonly online: boolean;
  on(cb: (e: NetEvent) => void): void;
  joinLobby(name: string): void;
  leaveLobby(): void;
  /** Ask to start now (offline: immediately; online: vote, starts when all humans in lobby agree). */
  requestStart(): void;
  /** Local cash-in on opponent `to` (sent immediately; the projectile is visual only). */
  sendAttack(to: number, tier: Tier, power: number): void;
  sendState(hp: number, badges: number, targets: number[], armed: boolean): void;
  sendKO(by: number): void;
  /** Online only: send a gameplay snapshot (only while someone watches you). */
  sendSnap(s: Snap): void;
  /** Online only, after you are out: watch human `id` (game-local), or -2 to stop. */
  spectate(id: number): void;
  tick(dt: number, hints: SimHints): void;
}

/** Converts between global slots (0..100) and game ids (local = -1, others 0..99). */
export class SlotMap {
  constructor(public me: number) {}
  toLocal(g: number) { return g < 0 ? g : g === this.me ? LOCAL : g < this.me ? g : g - 1; }
  toGlobal(l: number) { return l === LOCAL ? this.me : l < 0 ? l : l < this.me ? l : l + 1; }
}
type Cb = (e: NetEvent) => void;

// ------------------------------- offline -------------------------------
const NAMES = ["NOVA", "PIXL", "ZED", "KAI", "RUNE", "VEGA", "MOTH", "JUNO", "ORCA", "LUX", "TAKO", "BLIP", "ECHO", "FERN", "GLITCH", "HEX", "IRIS", "JINX", "KOI", "NEON"];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export class LocalSimTransport implements Transport {
  readonly localId = LOCAL; readonly online = false;
  private cbs: Cb[] = []; private phase: "idle" | "lobby" | "match" = "idle";
  private lobby: PlayerInfo[] = []; private lobbyT = 0; private nextJoin = 0; private countdown = -1; private humanTarget = 0; private name = "YOU";
  private sim: MatchSim | null = null; private map = new SlotMap(0); private stateT = 0;
  constructor(private humansMin = 2, private humansMax = 9, private lobbySeconds = 2.2) {}
  on(cb: Cb) { this.cbs.push(cb); }
  private emit(e: NetEvent) { for (const c of this.cbs) c(e); }
  joinLobby(name: string) {
    this.name = name; this.phase = "lobby"; this.lobbyT = 0; this.nextJoin = 0.15; this.countdown = -1; this.lobby = []; this.sim = null;
    this.humanTarget = Math.floor(rnd(this.humansMin, this.humansMax + 1));
    this.emit({ type: "lobbyJoin", player: { id: LOCAL, name, isBot: false }, count: 1 });
  }
  leaveLobby() { this.phase = "idle"; }
  requestStart() { if (this.phase === "lobby") { this.fillBots(); this.countdown = 0.01; } }
  sendAttack(to: number, tier: Tier, power: number) { this.sim?.humanAttack(this.map.me, this.map.toGlobal(to), tier, power); }
  sendState(hp: number, badges: number, targets: number[], armed: boolean) { this.sim?.humanState(this.map.me, hp, badges, targets.map(t => this.map.toGlobal(t)), armed); }
  sendKO(by: number) { this.sim?.humanKO(this.map.me, this.map.toGlobal(by)); }
  sendSnap() { /* offline: nobody to watch */ }
  spectate() { /* offline: simulated humans have no live gameplay */ }
  tick(dt: number) {
    if (this.phase === "lobby") this.tickLobby(dt);
    else if (this.phase === "match" && this.sim) {
      this.sim.tick(dt); this.stateT -= dt;
      if (this.stateT <= 0) { this.stateT = 0.25; this.emitStates(); }
    }
  }
  private emitStates() {
    const me = this.map.me;
    this.emit({ type: "state", states: this.sim!.slots.filter(s => s.alive && s.id !== me).map(s => ({ id: this.map.toLocal(s.id), hp: s.hp, badges: s.badges, target: s.target === me ? LOCAL : -2 })) });
  }
  private fillBots() {
    if (this.lobby.length >= MAX_PLAYERS - 1) return;
    const humans = this.lobby.length + 1; let n = 0;
    const bn = botNames(MAX_PLAYERS, [this.name, ...this.lobby.map(p => p.name)]);
    while (this.lobby.length < MAX_PLAYERS - 1) this.lobby.push({ id: 0, name: bn[n++], isBot: true });
    this.emit({ type: "lobbyJoin", player: { id: 0, name: "BOTS", isBot: true }, count: MAX_PLAYERS });
    this.emit({ type: "lobbyCountdown", seconds: this.lobbySeconds * 0.4, humans });
  }
  private tickLobby(dt: number) {
    this.lobbyT += dt; this.nextJoin -= dt;
    const humans = this.lobby.filter(p => !p.isBot);
    if (this.nextJoin <= 0 && this.countdown < 0) {
      this.nextJoin = rnd(0.1, 0.3);
      if (humans.length > 1 && Math.random() < 0.15) {
        const p = pick(humans); this.lobby = this.lobby.filter(q => q !== p);
        this.emit({ type: "lobbyLeave", id: p.id, name: p.name, count: this.lobby.length + 1 });
      } else if (humans.length < this.humanTarget) {
        const p: PlayerInfo = { id: -100 - Math.floor(this.lobbyT * 1000), name: pick(NAMES) + Math.floor(rnd(1, 99)), isBot: false };
        this.lobby.push(p); this.emit({ type: "lobbyJoin", player: p, count: this.lobby.length + 1 });
      }
    }
    if (this.countdown < 0 && this.lobbyT > this.lobbySeconds * 0.6) { this.fillBots(); this.countdown = this.lobbySeconds * 0.4; }
    if (this.countdown >= 0) { this.countdown -= dt; if (this.countdown <= 0) this.startMatch(); }
  }
  private startMatch() {
    const ps = this.lobby.map(p => ({ name: p.name, isBot: p.isBot, ai: true, local: false }));
    ps.push({ name: this.name, isBot: false, ai: false, local: true });
    for (let i = ps.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ps[i], ps[j]] = [ps[j], ps[i]]; }
    this.map = new SlotMap(ps.findIndex(p => p.local));
    this.sim = new MatchSim(ps, {
      attack: (from, to, tier, power, variant) => { if (to === this.map.me) this.emit({ type: "attack", from: this.map.toLocal(from), to: LOCAL, tier, power, variant }); },
      hit: (id, from) => { if (id !== this.map.me) this.emit({ type: "hit", id: this.map.toLocal(id), from: this.map.toLocal(from) }); },
      ko: (id, by, place, badges) => { if (id !== this.map.me) this.emit({ type: "ko", id: this.map.toLocal(id), by: this.map.toLocal(by), place, badges }); },
      end: (winner) => { this.emit({ type: "matchEnd", winner: this.map.toLocal(winner) }); this.phase = "idle"; },
    });
    this.phase = "match"; this.stateT = 0;
    this.emit({ type: "matchStart", players: ps.map((p, i) => ({ id: this.map.toLocal(i), name: p.name, isBot: p.isBot })).filter(p => p.id !== LOCAL).sort((a, b) => a.id - b.id), seed: 0 });
  }
}

// ------------------------------- online --------------------------------
/** Wire protocol (JSON). Client->server: join, leave, start, attack, state, ko. Server->client: see server/index.ts. */
export class WebSocketTransport implements Transport {
  readonly localId = LOCAL; readonly online = true;
  private cbs: Cb[] = []; private ws: WebSocket | null = null; private conn = -1; private map = new SlotMap(0); private queue: string[] = [];
  private lastState = 0;
  constructor(public url: string) {}
  on(cb: Cb) { this.cbs.push(cb); }
  private emit(e: NetEvent) { for (const c of this.cbs) c(e); }
  private send(o: object) { const s = JSON.stringify(o); if (this.ws && this.ws.readyState === 1) this.ws.send(s); else this.queue.push(s); }
  private connect() {
    if (this.ws && this.ws.readyState <= 1) return;
    const ws = new WebSocket(this.url); this.ws = ws;
    ws.onopen = () => { for (const s of this.queue) ws.send(s); this.queue = []; };
    ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.emit({ type: "disconnected", reason: "CONNECTION LOST" }); } };
    ws.onerror = () => { /* onclose follows */ };
    ws.onmessage = m => { try { this.onMsg(JSON.parse(m.data)); } catch { /* ignore malformed */ } };
  }
  private onMsg(m: any) {
    const L = (g: number) => this.map.toLocal(g);
    switch (m.t) {
      case "welcome": this.conn = m.conn; break;
      case "lobbyJoin": this.emit({ type: "lobbyJoin", player: { id: m.id === this.conn ? LOCAL : m.id, name: m.name, isBot: !!m.isBot }, count: m.count }); break;
      case "lobbyLeave": this.emit({ type: "lobbyLeave", id: m.id, name: m.name, count: m.count }); break;
      case "lobbyCountdown": this.emit({ type: "lobbyCountdown", seconds: m.seconds, humans: m.humans }); break;
      case "matchStart": this.map = new SlotMap(m.you);
        this.emit({ type: "matchStart", seed: m.seed || 0, players: (m.players as any[]).filter(p => p.id !== m.you).map(p => ({ id: L(p.id), name: p.name, isBot: p.isBot })).sort((a, b) => a.id - b.id) }); break;
      case "attack": if (m.to === this.map.me) this.emit({ type: "attack", from: L(m.from), to: LOCAL, tier: m.tier, power: m.power, variant: (m.variant | 0) % 4 }); break;
      case "state": this.emit({ type: "state", states: (m.s as number[][]).filter(a => a[0] !== this.map.me).map(([id, hp, badges, tg]) => ({ id: L(id), hp, badges, target: tg ? LOCAL : -2 })) }); break;
      case "hit": if (m.id !== this.map.me) this.emit({ type: "hit", id: L(m.id), from: L(m.from) }); break;
      case "ko": if (m.id !== this.map.me) this.emit({ type: "ko", id: L(m.id), by: L(m.by), place: m.place, badges: m.badges }); break;
      case "matchEnd": this.emit({ type: "matchEnd", winner: L(m.winner) }); break;
      case "watch": this.emit({ type: "watch", on: !!m.on }); break;
      case "snap": { if (m.id === this.map.me || !Array.isArray(m.p)) break;
        const e = (Array.isArray(m.e) ? m.e : []).map((q: number[]) => { if (q[3] < 0) { q = q.slice(); q[6] = L(q[6]); } return q; });
        this.emit({ type: "snap", id: L(m.id), snap: { p: m.p, e, b: m.b || [], pb: m.pb || [], it: m.it || [], tg: (m.tg || []).map(L) } }); break; }
    }
  }
  joinLobby(name: string) { this.connect(); this.send({ t: "join", name }); }
  leaveLobby() { this.send({ t: "leave" }); }
  requestStart() { this.send({ t: "start" }); }
  sendAttack(to: number, tier: Tier, power: number) { this.send({ t: "attack", to: this.map.toGlobal(to), tier, power }); }
  sendState(hp: number, badges: number, targets: number[], armed: boolean) {
    const now = performance.now(); if (now - this.lastState < 240) return; this.lastState = now;
    this.send({ t: "state", hp, badges, targets: targets.map(t => this.map.toGlobal(t)), armed });
  }
  sendKO(by: number) { this.send({ t: "ko", by: this.map.toGlobal(by) }); }
  sendSnap(s: Snap) {
    const G = (l: number) => this.map.toGlobal(l);
    this.send({ t: "snap", p: s.p, e: s.e.map(q => { if (q[3] < 0) { q = q.slice(); q[6] = G(q[6]); } return q; }), b: s.b, pb: s.pb, it: s.it, tg: s.tg.map(G) });
  }
  spectate(id: number) { this.send({ t: "spec", target: id < 0 ? -1 : this.map.toGlobal(id) }); }
  tick() { /* event-driven */ }
}

/** Pick a transport: ?offline, ?server=wss://host/ws, the page's own server (meta tag), else offline. */
export async function chooseTransport(): Promise<Transport> {
  const q = new URLSearchParams(location.search);
  if (q.has("offline") || location.protocol === "file:") return new LocalSimTransport();
  const s = q.get("server"); if (s) return new WebSocketTransport(s);
  // the Node server injects <meta name="starfall-online"> into index.html it serves
  if (document.querySelector('meta[name="starfall-online"]')) return new WebSocketTransport((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
  return new LocalSimTransport();
}
