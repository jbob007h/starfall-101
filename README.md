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
`PORT=8090 npm start` then `node mp-test.mjs` (3 headless clients online, incl. spectating); `node controls-test.mjs` (CONTROLS screen / rebinding, needs `npm run serve`).
Single-file offline build: `npm run build:single` -> `/workspace/STARFALL101.html` (index.html with dist/main.js inlined).

## Controls
Defaults (all rebindable on the **CONTROLS** screen: title menu / `C` / controller `Y`, also from the lobby):
| | Keyboard | Controller (standard / Xbox) |
|---|---|---|
| Move | Arrows / WASD | Left stick (analog) / D-pad |
| Fire (hold) | Z / Space | A |
| Focus (hold) | Shift | X |
| Bomb | X | Right Trigger (B no longer bombs) |
| Targeting | 1 Random, 2 KOs, 3 Attackers, 4 Badges | Right stick: up / right / down / left |
| Pause / Mute / CRT / Low-FX | P (Esc fixed), M, V, G | Start (fixed), -, Back, - |
| Start / vote start in lobby / restart | Enter (fixed), R | Start |
CONTROLS screen: separate KEYBOARD / CONTROLLER tabs (Tab or LB/RB), two binds per action, Enter/A = press-to-bind (Esc/Start cancels, 8 s timeout), Del/X clears, a key already used by another action swaps (that action gets the old key), Enter/Esc/Start are reserved, "Reset to defaults" per device. Saved in localStorage (`sf101binds`), applied immediately (src/input.ts). HUD/title hints show the current binds.

## Spectating (online)
When you are knocked out and other humans are still flying, you watch their live game: the server tells a watched player to stream compact snapshots (`snap`: ship, HP, bombs, chain, score, enemies with ids, bullets with velocities, items, targets) at ~15 Hz and relays them only to that player's spectators; the spectator renders them ~110 ms behind, interpolating the ship/enemies and extrapolating bullets. Left/Right (or bound move keys), LB/RB or D-pad switch pilots, L / Y toggles the leaderboard, Enter / Start starts a new match. When the watched pilot is out it switches to the next human; with no humans left the leaderboard is shown. Offline is unchanged.
Dots: +10 points and faster health regen (no bombs). Start with 3 bombs. Power-up drop weights (6% per kill): W 28%, B 18%, S 18%, F 18%, L 18%. Power-ups: W weapon, B bomb (max 5; picking one up at 5 = free TRIPLE BOMB that keeps your chain), F chain freeze, S shield, L lightning (5s auto chain-lightning).
Mini-bosses: SAUCER, SERPENT (hit the head), FORTRESS (turrets, then core), PHANTOM (hit when the eye opens); the design id travels with the attack (`variant`) online.
Attacks send automatically: when the chain timer ends while ARMED, or instantly at chain 40 (mini-boss); bullet wave tier starts at chain 15.

## Music
Genesis-style FM soundtrack synthesized live in Web Audio (no audio files), in `src/audio/music/`:
- `engine.ts` - `MusicEngine`: 2-op FM voices, PSG square harmony, DAC drums, PSG noise, stinger channel. Channels: `fm1` lead, `fm2` echo, `fm3` bass, `fm4` arp, `fm5` pad/guitar, `dac` drums, `sq1` PSG harmony, `psg` noise, `stg` stingers. Every change lands on a musical boundary.
- `songs.ts` - **STARFALL ASCENT** (B minor, 8 sections x 8 bars, 150 -> 184 BPM, every section carries every layer) plus AURORA BREACH, HULL INTEGRITY, LAST VECTOR (3 sections each), and the stingers.
- `director.ts` - game -> music. Edit `DIRECTION` to tune it.

How the default score (STARFALL ASCENT) reacts:
- **Section = match progress**: 101-86 Ignition, 85-71 Liftoff, 70-56 Formation, 55-41 Crossfire, 40-26 Overdrive, 25-11 Warzone, final ten (key up a half step), duel. A mini-boss on screen bumps it one section up with the full band; it drops back when the boss is gone.
- **Layers = momentum**, a hidden 0..1 meter: kills +0.008, attack sent +0.12/+0.2/+0.32 by tier, KO +0.1, boss down +0.25, hit -0.15, chain lost -0.06, drains 0.02/s. Tiers: 0 lead+bass+drums, 1 +pad/stabs, 2 +arp, 3 +echo + PSG harmony. Changes only on 4-bar phrase lines, one tier at a time, at least 8 bars apart, and dropping needs 2 phrases below a lower line. Finishing a chain raises momentum, so the music never drops when an attack sends.
- **Moments**: attack sent = stinger on the next beat (bigger per tier); ARMED = snare build that grows with the chain; boss down / KO / victory / defeat stingers; incoming attack = lead ducks under the klaxon + drum fill; bomb = band ducks and the filter sweeps open; triple bomb = +10 BPM for 4 bars; F freeze = half-time drums and the section holds; L lightning = arp up front; S shield = warmer filter; last hit point = muffled + heartbeat on the beat; knocked out = defeat sting, then muffled Ignition with the lead out while spectating; victory = fanfare, music ends.
- **SFX on the grid**: chain kills climb the current chord's notes; attack chime, star pickup and cash-in fanfare land on the next 16th.
- SWITCH SOUNDTRACK cycles STARFALL ASCENT, CLASSIC FM (the three short tracks in sequence) and each short track alone.

The game calls `audio.updateMusic({ remaining, duel, lowHealth, chain, armed, bossActive, shield, freeze, lightning })` every frame, `audio.musicEvent(name, data)` for moments and `audio.pauseMusic(paused)`. For one-off cues use `audio.music` (the engine) directly:

| Call | Effect |
|---|---|
| `queue({ track?, section?, transpose?, at?, fade? })` | switch track / section / key on the next `"now"` (16th) / `"beat"` / `"bar"` (default) / `"section"` boundary; `fade` = crossfade seconds on a track change |
| `stinger(name \| def, { at?, end? })` | play a stinger on the next boundary; `end: true` fades the band and stops after it |
| `fill()` / `setDrumMode("half" \| "normal")` / `setBuild(0..1)` | drum fill next bar / half-time drums / snare build-up |
| `play(track, { section?, loop?, transpose? })` / `stop(fade?)` / `pause()` / `resume()` | transport |
| `setTempo(bpm \| null, ramp?)` / `setTempoOffset(delta, ramp?)` | absolute override / offset from each section's BPM |
| `setChannel(id, { mute?, volume? }, fade?, at?)` / `resetChannels()` | per-channel mix, kept across track changes; `at` lands it on an exact audio time |
| `setFilter(hz \| null, ramp?)` / `setVolume(v, ramp?)` | master low-pass / volume |
| `on(type, fn, { ahead? })` | `beat` `bar` `section` `track` `loop` `stop`; `ahead: true` fires ~120 ms early with the exact audio `time` |
| `state`, `bpm`, `currentChord()`, `nextStepTime()`, `beatPhase()` | what's audible now; chord for musical SFX; next 16th for quantizing |

Song format: chords one per bar, melody as `NOTE-LENGTH` tokens in 16ths with `|` between bars, 16-char bass/drum/stab rows, optional per-section `bpm`, `lead` patch, `arpRate`, `harmony` ("third"/"sixth", auto PSG line) and `crashEvery` (see `engine.ts`). Bars that don't add up to 16 steps throw at startup.
`node music-test.mjs` (with `npm run serve`) checks sections, tiers, boss bump, freeze, build, key change, stingers, spectate and victory; `node music-preview.mjs` writes `music_preview/0_ascent_demo.wav` (layers + stingers walk) and one full pass per track.

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

## Pacing & enemy upgrades
CPU players drop faster (top 20 at ~4:00, top 10 at ~5:00, duel at ~6:35). From 1:00, formation enemies are gradually replaced by armored (3 HP) and later spiked (5 HP) variants that keep their chain colour, flash/chip when hit and give more score and dots. Details in PLAN.md.

## Final duel & mini-bosses
The last CPU in the duel is tougher (6 HP, slow regen, little random attrition): beat it with your attacks (~75 s if passive). CPUs send mini-bosses roughly every 60-90 s from 2:00 and every 30-45 s in the final 10; at most 2 mini-bosses are active at once, extras queue.

## Duel, names & leaderboard
The final duel CPU has 14 HP and regenerates; beat it with a sustained barrage (~7 attacks). Enter your pilot name after the title (saved locally, used online). Bots have arcade callsigns. After you are out (or win), a scrollable 101-place leaderboard shows who KO'd whom, with stars for your KOs; your KOs also get a big X on the grid.

## Visual FX
CRT filter (V / Select), stage backgrounds (starfield -> nebula -> fortress -> red core), beat-pulsing palette shifts, palette-cycled borders, mini-boss cut-in banner, grid KO ripples, raster wobble on bombs, a meteor "1ST" on victory. G toggles low-FX mode (auto when fps drops).
