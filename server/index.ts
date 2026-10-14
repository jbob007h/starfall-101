// STARFALL 101 server: static client + authoritative lobby/match over WebSocket (same port).
import http from "http";
import fs from "fs";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { MatchSim, Tier, botNames } from "../src/sim";

const PORT = Number(process.env.PORT) || 8080;
const MAX = 101;
const LOBBY_TIMEOUT = Number(process.env.LOBBY_TIMEOUT || 20); // seconds after first human joins
const DIST = path.resolve(__dirname, "../../dist");
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png", ".css": "text/css", ".json": "application/json" };

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (url === "/healthz") { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify({ starfall: 1, lobby: lobby.members.size, matches: matches.size })); return; }
  let f = path.normalize(path.join(DIST, url === "/" ? "index.html" : url));
  if (!f.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(f.endsWith("index.html") ? data.toString().replace("</head>", '<meta name="starfall-online" content="1"></head>') : data);
  });
});

interface Client { ws: WebSocket; conn: number; name: string; match: Match | null; slot: number; ready: boolean; alive: boolean; }
interface Match { id: number; sim: MatchSim; clients: Map<number, Client>; /* slot -> client */ stateT: number;
  watchers: Map<Client, number>; /* spectator -> watched slot */ watched: Set<number>; /* slots told to stream snapshots */ }
let nextConn = 1, nextMatch = 1;
const lobby = { members: new Map<number, Client>(), firstJoin: 0, lastCd: -1 };
const matches = new Map<number, Match>();

const send = (c: Client, o: object) => { if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(o)); };
const lobbyBroadcast = (o: object) => { for (const c of lobby.members.values()) send(c, o); };
const clean = (s: unknown) => String(s || "PILOT").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "PILOT";

/** Spectating: eliminated humans watch a live human; that human streams compact snapshots (~15 Hz) only while watched. */
function setWatch(m: Match, c: Client, slot: number) {
  const t = m.clients.get(slot);
  if (slot >= 0 && t && t.alive && t !== c && !c.alive) m.watchers.set(c, slot); else m.watchers.delete(c);
  const now = new Set(m.watchers.values());
  for (const s of now) if (!m.watched.has(s)) { const x = m.clients.get(s); if (x) send(x, { t: "watch", on: true }); }
  for (const s of m.watched) if (!now.has(s)) { const x = m.clients.get(s); if (x) send(x, { t: "watch", on: false }); }
  m.watched = now;
}
const nums = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []).map(x => Math.round(Number(x) || 0));
function relaySnap(m: Match, c: Client, d: any) {
  if (!m.watched.has(c.slot)) return;
  const out = JSON.stringify({ t: "snap", id: c.slot, p: nums(d.p, 24), e: (Array.isArray(d.e) ? d.e : []).slice(0, 80).map((q: unknown) => nums(q, 40)),
    b: nums(d.b, 6 * 260), pb: nums(d.pb, 5 * 90), it: nums(d.it, 3 * 40), tg: nums(d.tg, 8) });
  for (const [w, s] of m.watchers) if (s === c.slot && w.ws.readyState === WebSocket.OPEN) w.ws.send(out);
}
function leaveCurrent(c: Client) {
  if (lobby.members.delete(c.conn)) lobbyBroadcast({ t: "lobbyLeave", id: c.conn, name: c.name, count: lobby.members.size });
  if (c.match) { const m = c.match; if (c.alive) m.sim.humanKO(c.slot, -2); setWatch(m, c, -1); m.clients.delete(c.slot); c.match = null; c.alive = false; }
}
function joinLobby(c: Client, name: string) {
  leaveCurrent(c); c.name = clean(name); c.ready = false;
  if (lobby.members.size === 0) lobby.firstJoin = Date.now();
  lobby.members.set(c.conn, c);
  for (const o of lobby.members.values()) send(c, { t: "lobbyJoin", id: o.conn, name: o.name, isBot: false, count: lobby.members.size });
  for (const o of lobby.members.values()) if (o !== c) send(o, { t: "lobbyJoin", id: c.conn, name: c.name, isBot: false, count: lobby.members.size });
  lobby.lastCd = -1;
}
function startMatch() {
  const humans = [...lobby.members.values()]; lobby.members.clear();
  const players: { name: string; isBot: boolean; ai: boolean; c?: Client }[] = humans.map(c => ({ name: c.name, isBot: false, ai: false, c }));
  const bn = botNames(MAX, humans.map(c => c.name)); let n = 0; while (players.length < MAX) players.push({ name: bn[n++], isBot: true, ai: true });
  for (let i = players.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [players[i], players[j]] = [players[j], players[i]]; }
  const m: Match = { id: nextMatch++, clients: new Map(), stateT: 0, sim: null as unknown as MatchSim, watchers: new Map(), watched: new Set() };
  const toAll = (o: object) => { for (const c of m.clients.values()) send(c, o); };
  m.sim = new MatchSim(players, {
    attack: (from, to, tier, power, variant) => { const c = m.clients.get(to); if (c) send(c, { t: "attack", from, to, tier, power, variant }); },
    hit: (id, from) => toAll({ t: "hit", id, from }),
    ko: (id, by, place, badges) => { toAll({ t: "ko", id, by, place, badges }); const c = m.clients.get(id); if (c) c.alive = false; },
    end: (winner) => { toAll({ t: "matchEnd", winner }); setTimeout(() => matches.delete(m.id), 1000); },
  });
  const list = players.map((p, i) => ({ id: i, name: p.name, isBot: p.isBot }));
  players.forEach((p, i) => { if (p.c) { p.c.match = m; p.c.slot = i; p.c.alive = true; m.clients.set(i, p.c); send(p.c, { t: "matchStart", you: i, players: list, seed: m.id }); } });
  matches.set(m.id, m);
  console.log(`match ${m.id} started: ${humans.length} humans + ${MAX - humans.length} bots`);
}

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 64 * 1024 });
wss.on("connection", ws => {
  const c: Client = { ws, conn: nextConn++, name: "PILOT", match: null, slot: -1, ready: false, alive: false };
  send(c, { t: "welcome", conn: c.conn });
  ws.on("message", raw => {
    let m: any; try { m = JSON.parse(String(raw)); } catch { return; }
    switch (m.t) {
      case "snap": if (c.match && c.alive) relaySnap(c.match, c, m); break;
      case "spec": if (c.match && !c.alive) setWatch(c.match, c, m.target | 0); break;
      case "join": joinLobby(c, m.name); break;
      case "leave": leaveCurrent(c); break;
      case "start": if (lobby.members.has(c.conn)) { c.ready = true; } break;
      case "attack": if (c.match && c.alive) { const tier = Math.max(0, Math.min(2, m.tier | 0)) as Tier; c.match.sim.humanAttack(c.slot, m.to | 0, tier, Math.max(0, Math.min(200, Number(m.power) || 0))); } break;
      case "state": if (c.match && c.alive) c.match.sim.humanState(c.slot, Math.max(0, Math.min(3, m.hp | 0)), Math.max(0, m.badges | 0), (Array.isArray(m.targets) ? m.targets : []).slice(0, 8).map((x: unknown) => Number(x) | 0), !!m.armed); break;
      case "ko": if (c.match && c.alive) { c.match.sim.humanKO(c.slot, m.by | 0); c.alive = false; } break;
    }
  });
  ws.on("close", () => leaveCurrent(c)); // a disconnected human is KO'd
});

let last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min(0.2, (now - last) / 1000); last = now;
  // lobby: start when full, on timeout, or when every human pressed Start
  if (lobby.members.size) {
    const left = Math.max(0, LOBBY_TIMEOUT - (now - lobby.firstJoin) / 1000);
    const allReady = [...lobby.members.values()].every(c => c.ready);
    if (lobby.members.size >= MAX || left <= 0 || allReady) startMatch();
    else { const s = Math.ceil(left); if (s !== lobby.lastCd) { lobby.lastCd = s; lobbyBroadcast({ t: "lobbyCountdown", seconds: left, humans: lobby.members.size }); } }
  }
  for (const m of matches.values()) {
    m.sim.tick(dt); m.stateT -= dt;
    if (m.stateT <= 0) {
      m.stateT = 0.25;
      const alive = m.sim.slots.filter(s => s.alive);
      for (const c of m.clients.values()) send(c, { t: "state", s: alive.map(s => [s.id, s.hp, s.badges, s.ai ? (s.target === c.slot ? 1 : 0) : (s.targets.includes(c.slot) ? 1 : 0)]) });
    }
  }
}, 50);

server.listen(PORT, () => console.log(`STARFALL 101 server on :${PORT} (static ${DIST}, ws /ws)`));
