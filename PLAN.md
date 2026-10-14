# STARFALL 101 — Game Plan (draft)

Title: STARFALL 101
Art style: retro 16-bit neon pixel art (magenta, cyan, yellow on a black starfield)
Format: 101-player battle royale vertical shoot-em-up, you vs 100 opponents

## Core loop: Chain & Cash-in
1. Enemies arrive in color-coded formations (like ghost trains).
2. Every kill starts or refreshes a short streak timer.
3. Kills of the same color as your current chain add more to it than off-color kills.
4. Wiping out a full formation before the timer runs out makes the chain eligible to cash in.
5. There is no manual cash-in button: attacks send automatically. When the streak timer expires while an attack is armed (a full formation was cleared), the attack is sent instead of being lost. When the chain reaches the highest tier (mini-boss threshold, 40; bullet wave starts at 15), it is sent immediately and the chain resets. If the timer expires with nothing armed, the chain is lost.
5b. The attack goes to your target. Chain size sets the attack tier:
   - Chain 1-14: sends extra enemies into the rival's field
   - Chain 15-39: sends a bullet-hell wave
   - Chain 40: instantly sends a mini-boss
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
- Lightning: for 5s the ship auto-fires chain-lightning every 0.25s at the nearest enemy, jumping to 2 more (works without holding fire; kills count toward chains). Timer shown in the bottom strip.
- The player starts each match with 3 bombs. Bomb stock is capped at 5. Picking up a Bomb power-up at 5 bombs triggers a TRIPLE BOMB instead: three rapid staggered screen-clearing blasts (~3x bomb damage to mini-bosses), costs no held bombs, and does NOT reset the chain (it refreshes the chain timer) as a reward. Its kills don't add to the chain.
- Drop rate: each normal kill has a 6% chance to drop a power-up; type is a weighted pick: Weapon Up 28%, Bomb 18%, Shield 18%, Chain Freeze 18%, Lightning 18%. (Mini-boss kills always drop one random power-up.)

Regular enemies (formation and sent) are 11px-wide pixel sprites with matching ~7x6 hitboxes (20% larger than v1).

## Mini-bosses (sent at the top attack tier)
The sender's side (sim/server) picks a design id per attack; designs unlock with match stage/attack power (newest favored):
0. SAUCER: side-to-side; rings, spirals, aimed fans. Hit anywhere.
1. SERPENT: weaving head with an armored 8-segment body trail; only the head is weak; body fires aimed shots, head fires fans.
2. FORTRESS: wide hull with two turrets shielding the core; destroy both turrets to expose the core; laser walls with a gap, then a berserk spiral.
3. PHANTOM (unlocks after ~3:20 or attack power 60+): teleports every ~3s (outline warning); only vulnerable while its eye is open; ring burst + rotating 4-arm stream.

## Attack feedback
- Sending: "BULLET WAVE SENT!" + target name, launch whoosh + tiered chime, no screen shake and no hitstop/pause (also none when an attack becomes armed).
- Receiving: INCOMING text only during the warning ("INCOMING BULLET WAVE!" + sender name, INCOMING edge arrows); no second popup at spawn, two-tone klaxon (more pulses for bigger tiers).

## Design pillar: easy to pick up, high skill ceiling
Goal: a casual player survives a few minutes; experts have lots of room to master.

Casual-friendly floor:
- Health bar of 3 pips instead of one-hit death; a pip regenerates after ~20s without being hit.
- Tiny hitbox (classic shmup dot) shown when focusing, so dodging feels fair.
- Fire by holding a button (Z or Space); holding it fires at a steady rate. Releasing lets you hold enemies alive to set up chains.
- Opening ~90s is calm: slow bullets, small formations, and incoming attacks are softened early.
- Default targeting is Random, so new players never have to touch it.
- Enemies drop dots: +10 points each and they speed up health regen (-0.4s on the regen timer), so mistakes are recoverable. Dots do not give bombs; bombs come only from Bomb power-ups and mini-boss drops.

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

## Adaptive music (Sega Genesis / Mega Drive style)
- Engine (src/audio/music/engine.ts): 2-operator FM per note (second parallel modulator, unison detune, delayed vibrato), YM2612-style channel layout (FM1 lead, FM2 fake-echo of the lead 3 sixteenths late, FM3 slap bass, FM4 arp, FM5 pad / power-chord guitar, FM6 DAC kick+snare through an 8-bit quantiser, PSG stepped noise hats/crash), L/C/R-ish panning, drive on the lead for the guitar track, compressor. Notes are scheduled ~120 ms ahead on the AudioContext clock; cues apply on 16th/beat/bar/section boundaries, track changes can crossfade.
- Songs (src/audio/music/songs.ts): AURORA BREACH (E minor, 172), HULL INTEGRITY (D minor, 140, FM guitar lead + gallop), LAST VECTOR (A minor, 156, boss). 3 x 8-bar sections each, loopable independently.
- Director (src/audio/music/director.ts): ADAPTIVE FM plan walks Aurora A/B/C -> Hull A/B/C -> Last Vector B/A as players drop (thresholds 80/65/50/37/25/10/5), duel = Last Vector C +8 BPM; low health = low-pass + heartbeat on the beat; chain >= 15 = louder arp. Single-track plans: A >60, B >25, C final 25 / duel.
- Previews: `node music-preview.mjs` renders one full loop per track to music_preview/ via OfflineAudioContext.

## Controls
- Keyboard: arrows/WASD move, hold Z/Space fire, Shift focus, X bomb, 1-4 targeting, Enter start, P pause.
- Gamepad (standard mapping, Xbox labels): left stick/d-pad move (analog), A hold fire, X hold focus, B bomb, right-stick flick targeting (up Random, right KOs, down Attackers, left Badges), Start = start / vote start / pause / restart.

## HUD layout
- Wide central playfield; all 100 opponent mini-screens in two compact 10x5 grids on the sides.
- Health pips and the chain meter (counter + timer bar with tier marks, ARMED status) sit in a strip at the bottom of the playfield, right under the ship.

## Tech stack
- HTML + TypeScript + Canvas 2D, matching the existing Pac-Man 99-style project so code can be shared.
- Pixel-art rendering at 640x360 to an offscreen canvas, presented on a display canvas sized to window x devicePixelRatio: nearest-neighbor integer pre-upscale, then a slight final fit to the largest aspect-correct size (fractional allowed), black letterbox; refits on resize and DPR/zoom change.
- Web Audio for SFX and music.
- Networking: the game talks only to a `Transport` interface (src/net.ts) with events lobbyJoin / lobbyLeave / lobbyCountdown / matchStart (player list) / attack / state / hit / ko / matchEnd, and calls joinLobby, leaveLobby, sendAttack, sendState, sendKO, tick.
- Online: `WebSocketTransport` + Node server (server/index.ts, `ws`, same port as the static client; deploy on Render free tier via render.yaml). Server is authoritative for lobby (start at 101 humans, ~20s timeout, or all humans vote Start; bots fill empty slots), slot numbers, attack routing (sent immediately; the projectile is visual only), bot simulation (shared src/sim.ts MatchSim), KOs/placements/KO credit/badges, match end; disconnected humans are KO'd.
- Offline: `LocalSimTransport`: a simulated lobby where a few "human" players join (and sometimes leave), then AI bots fill every empty slot up to 101 and the match starts. It also runs the bots during the match. A `WebSocketTransport` (sketched in net.ts) replaces it for real online play; the server decides lobby fill, slot ids, placement and KO credit.


## Pacing & enemy upgrades (v7)
- CPU elimination curve (src/sim.ts `MatchSim.PACE`, offline + server): protected until 0:55, then ~60 left at 2:00, ~35 at 3:00, ~20 at 4:00, ~10 at 5:00, final 10 linger (6 at 5:45) so the boss music gets its moment, duel (2 left) at ~6:35. Fast-forward sim: 1m 101, 2m ~62, 3m ~37, 4m ~20, 5m ~10, 6m 5, duel ~393 s.
- Upgraded formation enemies from 1:00: tier-1 "armored" (steel plating, 3 HP) share rises 20% -> 85% by 4:00; tier-2 "spiked" (spikes + plating, 5 HP) takes over from 4:00 (up to ~60% of upgrades by 6:30). Same body colour for chaining; white hit-flash + plating chips on non-lethal hits; score x2/x3 and +1/+2 dots. Chains, formation clears, bombs and Lightning (2 dmg per bolt) work normally. Sent enemies unchanged (2 HP).

## Final duel & CPU mini-bosses (v8)
- Final duel (you + 1 CPU): the last CPU powers up to 6 HP, regenerates 1 HP / 40 s, background AI-vs-AI attrition is off; only light attrition (~1 dmg / 9 s, after a 20 s grace) applies, so its survival mainly depends on the attacks you send (rush 1 / wave 2 / boss 3 dmg, +1 at power 50+). Passive-play duel: ~76 s average (was ~47 s).
- CPU mini-bosses come from a per-human scheduler (sim): none before 2:00 or during the calm opening; then one every 60-90 s (>25 left), 45-65 s (11-25 left), 30-45 s (final 10 / duel). Regular bot sends are rush/wave only. Client caps active mini-bosses at 2; extra incoming bosses wait (warning keeps flashing) until one is destroyed.
- Measured (100 fast-forward sims): incoming mini-bosses per match 0-2m 0 / 2-4m 2.0 / 4-5m ~1.0 / 5m+ ~4.2 (before: 0 / 0.33 / 0.5 / 3.2, sometimes 5 within 25 s).

## Epic duel, names, leaderboard (v9)
- Final duel: last CPU powers up to 14 HP (set the moment the duel starts), regenerates 1 HP / 17 s, light attrition (~1 / 9 s after 20 s grace), keeps sending mini-bosses every 30-45 s. Prominent "FINAL RIVAL" 14-segment HP bar at the top of the field. Sims (100 each): passive duel avg ~181 s (80-450); attacking once per 7 s (35% rush / 45% wave / 20% boss) wins in ~41 s with ~6.7 attacks.
- Pilot name entry after the title (keyboard typing A-Z 0-9 + Backspace; pad: d-pad up/down letter, left/right move, A next, B delete, Start OK), max 10 chars, saved in localStorage (`sf101name`) and prefilled; sent to the server on join. `?name=` only prefills.
- Bots get unique arcade callsigns (sim.ts `botNames`, used offline and by the server): NOVA, VIPER7, HYPERJOLT, ACE42...
- When no humans remain, the sim resolves the remaining bots instantly (placements + KO credit), so every slot has a place.
- Leaderboard on game over / victory: all 101 places (name, CPU/HUM/YOU, "KO BY NAME", yellow star next to pilots YOU knocked out), own row highlighted, scroll with arrows/W/S/stick (PageUp/Down), Enter/Start to play again. Online it keeps filling live from server KO events.
- Opponent grid: big yellow/magenta X over every mini-screen YOU knocked out.

## Visual flash pass (v10)
- CRT filter (default on, V / Select toggles, saved): 48-band barrel curve (gentle, c=0.009), scanlines, vignette at display resolution; field bloom = 1/4-res copy drawn additively with smoothing.
- Stage parallax backgrounds by players left (crossfade ~2 s): starfield/haze (101-75) -> nebula (75-50) -> nebula + far fortress ruins (50-25) -> fortress with near side walls (25-10) -> red-hot core with molten veins + embers (final 10 / duel).
- Per-stage palette (cyan -> blue/magenta -> magenta -> red/magenta -> red/orange) used for a screen-tint that pulses on the music beat (Audio.beatPhase from the sequencer clock) and for palette-cycled borders: a smooth single-hue (stage hue) bright-to-dim gradient chases around every panel/play-area/strip frame; mini-screens get a faint single-hue travelling highlight so health colours stay readable.
- Mini-boss send cut-in: thin strip with pilot portrait + boss slides along the top edge of the field in ~0.9 s, no pause.
- KO shockwave ripples across the opponent grid; your KOs flash gold (then keep the X).
- Raster line-scroll wave on bombs, triple bombs and the FINAL DUEL start.
- Victory: falling meteors assemble into a giant "1ST"; leaderboard follows after ~4.5 s.
- Low-FX mode (G, saved; auto-enabled if fps < 48 for 3 s): no bloom/barrel/second nebula layer/cycling borders. Headless measurement: 59-61 fps with everything on.
