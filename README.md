# STARFALL 101

101-player neon shmup battle royale. TypeScript + Canvas 2D client, Node + `ws` server.

## Run
    npm install
    npm run build && npm run build:server
    npm start                      # http://localhost:8080 : client + WebSocket /ws on the same port (PORT env)
Offline: `npm run serve` (static dist/ only), open `/workspace/STARFALL101.html` directly, or add `?offline`.
URL params: `?name=ACE` (pilot name), `?server=wss://host/ws` (use a specific server), `?offline`.

Display fills the window at any browser zoom/DPR (crisp pixels, letterboxed). `node scale-test.mjs` checks fill at DPR 1-2.

Tests: `node test.mjs` (single player + stubbed gamepad, needs `npm run serve` on :8080);
`PORT=8090 npm start` then `node mp-test.mjs` (3 headless clients online).

## Controls
| | Keyboard | Controller (standard / Xbox) |
|---|---|---|
| Move | Arrows / WASD | Left stick (analog, deadzone) / D-pad |
| Fire (hold) | Z / Space | A |
| Focus (hold) | Shift | X |
| Bomb | X | B |
| Targeting | 1 Random, 2 KOs, 3 Attackers, 4 Badges | Right-stick flick: up / right / down / left |
| Start / vote start in lobby / pause / restart | Enter, P, R | Start |
Dots: +10 points and faster health regen (no bombs). Power-ups: W weapon, B bomb (max 5; picking one up at 5 = free TRIPLE BOMB that keeps your chain), F chain freeze, S shield, L lightning (5s auto chain-lightning).
Mini-bosses: SAUCER, SERPENT (hit the head), FORTRESS (turrets, then core), PHANTOM (hit when the eye opens); the design id travels with the attack (`variant`) online.
Attacks send automatically: when the chain timer ends while ARMED, or instantly at chain 40 (mini-boss); bullet wave tier starts at chain 15.

## Networking
`src/net.ts` defines `Transport` + `NetEvent` (lobbyJoin/Leave/Countdown, matchStart, attack, state, hit, ko, matchEnd, disconnected).
- `LocalSimTransport`: offline, simulated lobby, runs `MatchSim` (src/sim.ts) in the browser.
- `WebSocketTransport`: online. Chosen automatically when the page is served by the Node server (it injects a meta tag) or via `?server=`.
- `server/index.ts`: authoritative lobby (starts at 101 humans, after LOBBY_TIMEOUT=20s from the first join, or when all humans vote Start), bots fill empty slots, slot numbers, routes attacks between humans immediately, runs bots with the same `MatchSim`, decides KOs/placements/KO credit/badges/match end; a disconnected human is KO'd. Several matches can run at once.

## Deploy to Render (free tier)
1. Push this folder (`/workspace/shmup99`) to a GitHub/GitLab repo (repo root = this folder).
2. Render dashboard -> New -> Blueprint -> pick the repo; it reads `render.yaml` (web service, Node, free plan).
   Or New -> Web Service: Build `npm ci --include=dev && npm run build && npm run build:server`, Start `npm start`, Health check `/healthz`.
3. Open `https://<service>.onrender.com` and share the link; everyone who joins within 20s shares a lobby.
Notes: free instances sleep after ~15 min idle (first load takes ~30-60s to wake) and restarts drop live matches. Render passes `PORT` automatically.
