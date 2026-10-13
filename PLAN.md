# STARFALL 101 — Game Plan (draft)

Title: STARFALL 101
Art style: retro 16-bit neon pixel art (magenta, cyan, yellow on a black starfield)
Format: 101-player battle royale vertical shoot-em-up, you vs 100 opponents

## Core loop: Chain & Cash-in
1. Enemies arrive in color-coded formations (like ghost trains).
2. Every kill starts or refreshes a short streak timer.
3. Kills of the same color as your current chain add more to it than off-color kills.
4. Wiping out a full formation before the timer runs out makes the chain eligible to cash in.
5. There is no manual cash-in button: attacks send automatically. When the streak timer expires while an attack is armed (a full formation was cleared), the attack is sent instead of being lost. When the chain reaches the highest tier (mini-boss threshold, 25), it is sent immediately and the chain resets. If the timer expires with nothing armed, the chain is lost.
5b. The attack goes to your target. Chain size sets the attack tier:
   - Small chain: sends extra enemies into the rival's field
   - Big chain: sends a bullet-hell wave
   - Huge chain: sends a mini-boss
6. Risk/reward: bank a small attack now, or keep the timer alive across several formations for a bigger payoff. Push past cleared formations to grow the armed attack; if the timer runs out while armed it sends, otherwise the chain is lost.

## Targeting
Pac-Man 99-style auto modes, switchable at any time:
- Random: a random rival
- KOs: rivals closest to elimination
- Attackers: whoever is targeting you (sends hit back at all of them)
- Badges: rivals holding the most badges

## Power-ups
Persistent:
- Badges: KO'd opponents drop pixel badges into your field; each one collected permanently boosts attack power.
In-run drops:
- Weapon upgrade: wider or stronger shot; lost when hit.
- Bomb: clears the screen but resets the chain timer.
- Chain freeze: pauses the streak timer for a few seconds.
- Shield: blocks one hit or one incoming attack.
- Lightning: for ~6s the ship auto-fires chain-lightning every ~0.2s at the nearest enemy, jumping to 2-3 more (works without holding fire; kills count toward chains). Timer shown in the bottom strip.
- Bomb stock is capped at 5.

## Mini-bosses (sent at the top attack tier)
The sender's side (sim/server) picks a design id per attack; designs unlock with match stage/attack power (newest favored):
0. SAUCER: side-to-side; rings, spirals, aimed fans. Hit anywhere.
1. SERPENT: weaving head with an armored 8-segment body trail; only the head is weak; body fires aimed shots, head fires fans.
2. FORTRESS: wide hull with two turrets shielding the core; destroy both turrets to expose the core; laser walls with a gap, then a berserk spiral.
3. PHANTOM: teleports every ~3s (outline warning); only vulnerable while its eye is open; ring burst + rotating 4-arm stream.

## Attack feedback
- Sending: "BULLET WAVE SENT!" + target name, launch whoosh + tiered chime, no screen shake.
- Receiving: "INCOMING BULLET WAVE!" + sender name, INCOMING arrows, two-tone klaxon (more pulses for bigger tiers).

## Design pillar: easy to pick up, high skill ceiling
Goal: a casual player survives a few minutes; experts have lots of room to master.

Casual-friendly floor:
- Health bar of 3 pips instead of one-hit death; a pip regenerates after ~20s without being hit.
- Tiny hitbox (classic shmup dot) shown when focusing, so dodging feels fair.
- Fire by holding a button (Z or Space); holding it fires at a steady rate. Releasing lets you hold enemies alive to set up chains.
- Opening ~90s is calm: slow bullets, small formations, and incoming attacks are softened early.
- Default targeting is Random, so new players never have to touch it.
- Enemies drop dots that heal and charge bombs, so mistakes are recoverable.

High skill ceiling:
- Chain & Cash-in risk/reward: when to bank vs. push for a mini-boss.
- Same-color chaining and route planning across formations.
- Focus mode (hold a button): slower movement and a concentrated shot for threading bullet patterns.
- Grazing: bullets passing very close to you charge the chain timer, rewarding risky dodging.
- Counter-attacks: destroying incoming sent enemies or a mini-boss reflects part of the attack back to the sender.
- Targeting mode choice (Attackers to punish focus, KOs to farm badges).
- Badge snowballing for strong players, balanced by Attackers targeting.

Pacing:
- Global speed and density ramps as players drop out (like Pac-Man 99), so matches end in ~10-15 minutes.

## Feel: fast-paced with lots of juice
Speed:
- Snappy ship movement with no acceleration lag; fast bullets; formations enter quickly.
- Quick restarts: under 3 seconds from KO to a new match.
Juice:
- Screen shake scaled to impact (small on kills, big on bombs and mini-boss deaths).
- Hit-stop: a few frames of freeze on big kills and cash-ins.
- Pixel particle bursts, neon flashes, and sparks on every kill.
- Chain counter that pulses, grows, and changes color as it climbs; the timer bar flashes when low.
- Cash-in: a big neon text pop ("BULLET WAVE!") and a visible projectile flying from your field to the target's mini-screen.
- Incoming-attack warning: arrows at the screen edge, then a flash as enemies warp in.
- KOs: the opponent's mini-screen shatters, then a badge flies into your field.
- Grazing makes sparks and a rising tone.
- Punchy chiptune SFX with pitch climbing on chains; music tempo rises as players drop out.
- Brief slow motion on near-death and on the final duel for the win.

## Signature feature: Starfall
- Every player you KO falls into your screen as a shooting star streaking across the background.
- Catching it powers up your next cash-in (works alongside the permanent badge boost).
- The background sky fills with falling stars as players drop out, a living visual of the remaining field.
- Final duel takes place under a huge meteor shower made of every eliminated player.

## Adaptive music
- Layered chiptune track that intensifies as players drop out:
  - 101-75 left: base groove (bass + drums)
  - 75-50: add arpeggio lead, tempo up
  - 50-25: add melody and harder drums, tempo up again
  - 25-10: full mix with driving percussion and filter sweeps
  - Final 10 and final duel: max tempo, extra synth layer, heartbeat pulse on low health
- Transitions are synced to the beat so layers drop in cleanly.

## Controls
- Keyboard: arrows/WASD move, hold Z/Space fire, Shift focus, X bomb, 1-4 targeting, Enter start, P pause.
- Gamepad (standard mapping, Xbox labels): left stick/d-pad move (analog), A hold fire, X hold focus, B bomb, right-stick flick targeting (up Random, right KOs, down Attackers, left Badges), Start = start / vote start / pause / restart.

## HUD layout
- Wide central playfield; all 100 opponent mini-screens in two compact 10x5 grids on the sides.
- Health pips and the chain meter (counter + timer bar with tier marks, ARMED status) sit in a strip at the bottom of the playfield, right under the ship.

## Tech stack
- HTML + TypeScript + Canvas 2D, matching the existing Pac-Man 99-style project so code can be shared.
- Pixel-art rendering at a low internal resolution scaled up with smoothing off.
- Web Audio for SFX and music.
- Networking: the game talks only to a `Transport` interface (src/net.ts) with events lobbyJoin / lobbyLeave / lobbyCountdown / matchStart (player list) / attack / state / hit / ko / matchEnd, and calls joinLobby, leaveLobby, sendAttack, sendState, sendKO, tick.
- Online: `WebSocketTransport` + Node server (server/index.ts, `ws`, same port as the static client; deploy on Render free tier via render.yaml). Server is authoritative for lobby (start at 101 humans, ~20s timeout, or all humans vote Start; bots fill empty slots), slot numbers, attack routing (sent immediately; the projectile is visual only), bot simulation (shared src/sim.ts MatchSim), KOs/placements/KO credit/badges, match end; disconnected humans are KO'd.
- Offline: `LocalSimTransport`: a simulated lobby where a few "human" players join (and sometimes leave), then AI bots fill every empty slot up to 101 and the match starts. It also runs the bots during the match. A `WebSocketTransport` (sketched in net.ts) replaces it for real online play; the server decides lobby fill, slot ids, placement and KO credit.

