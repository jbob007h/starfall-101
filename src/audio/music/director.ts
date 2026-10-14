// Music director: turns game state into MusicEngine calls. This is the place to make the soundtrack react to gameplay.
//
// Each frame the game hands over a GameMusicState; the director picks a cue (track + section) from the active plan
// and only talks to the engine when something changes. The engine applies cues on the next bar line, so it is
// safe to call update() every frame.
//
// The engine also takes direct calls (see engine.ts) if a game moment needs something one-off, for example
// `music.queue({ section: "C", at: "beat" })`, `music.setChannel("fm1", { mute: true })` or `music.setTempoOffset(10, 2)`.
import type { MusicEngine } from "./engine";

export interface GameMusicState {
  /** Pilots still flying (101 -> 1). */
  remaining: number;
  /** Final 1v1. */
  duel: boolean;
  /** Player is on their last hit point. */
  lowHealth: boolean;
  /** Current kill chain. */
  chain: number;
}
interface Cue { track: string; section: string; }
interface Plan { name: string; pick(s: GameMusicState): Cue; }

/** Adaptive score: the match walks through all three tracks as the field shrinks; every step is a loopable section. */
const ADAPTIVE: { above: number; cue: Cue }[] = [
  { above: 80, cue: { track: "aurora", section: "A" } }, // 101-81  launch
  { above: 65, cue: { track: "aurora", section: "B" } }, //  80-66
  { above: 50, cue: { track: "aurora", section: "C" } }, //  65-51
  { above: 37, cue: { track: "hull", section: "A" } },   //  50-38
  { above: 25, cue: { track: "hull", section: "B" } },   //  37-26
  { above: 10, cue: { track: "hull", section: "C" } },   //  25-11
  { above: 5, cue: { track: "vector", section: "B" } },  //  10-6   final ten: half-time tension
  { above: 0, cue: { track: "vector", section: "A" } },  //   5-1   boss drive
];
const DUEL: Cue = { track: "vector", section: "C" };

/** Soundtrack menu entries ("SWITCH SOUNDTRACK"). Index 0 is the default. */
export const PLANS: Plan[] = [
  { name: "ADAPTIVE FM", pick: s => s.duel ? DUEL : (ADAPTIVE.find(r => s.remaining > r.above) ?? ADAPTIVE[ADAPTIVE.length - 1]).cue },
  ...[["aurora", "AURORA BREACH"], ["hull", "HULL INTEGRITY"], ["vector", "LAST VECTOR"]].map(([track, name]): Plan => ({
    name, pick: s => ({ track, section: s.duel || s.remaining <= 25 ? "C" : s.remaining <= 60 ? "B" : "A" }),
  })),
];

/** Tunables for the non-section reactions. */
export const DIRECTION = {
  duelTempoOffset: 8,        // BPM added for the final duel...
  duelTempoRamp: 3,          // ...ramped in over this many seconds
  lowHealthFilterHz: 1600,   // muffle the mix on the last hit point
  hotChain: 15,              // chain size that brings the arp forward (same as the bullet-wave tier)
  arpLevel: [0.6, 1.15],     // FM4 level below / at hotChain
};

export class MusicDirector {
  plan = 0;
  /** Index of the current cue in the plan's progression (for tests / HUD). */
  stage = 0;
  private cueKey = ""; private duel = false; private low = false; private hot: boolean | null = null;
  private last: GameMusicState = { remaining: 101, duel: false, lowHealth: false, chain: 0 };
  constructor(private m: MusicEngine) {}

  get planName() { return PLANS[this.plan].name; }
  setPlan(i: number) { this.plan = ((i % PLANS.length) + PLANS.length) % PLANS.length; this.cueKey = ""; if (this.m.playing) this.start(this.last); }

  /** Start the music for a fresh match state (cuts straight in). */
  start(s: GameMusicState) {
    this.last = { ...s };
    const cue = PLANS[this.plan].pick(s);
    this.m.setLoopMode("section");
    this.m.setTempoOffset(s.duel ? DIRECTION.duelTempoOffset : 0);
    this.m.resetChannels(0);
    this.m.setFilter(null, 0);
    this.duel = s.duel; this.low = false; this.hot = null;
    this.m.play(cue.track, { section: cue.section });
    this.cueKey = cue.track + "/" + cue.section; this.stage = this.stageOf(s);
    this.mods(s);
  }

  /** Call every frame with the live game state. Cheap when nothing changed. */
  update(s: GameMusicState) {
    this.last = { ...s };
    if (!this.m.playing) return;
    const cue = PLANS[this.plan].pick(s), key = cue.track + "/" + cue.section;
    if (key !== this.cueKey) {
      const changingTrack = cue.track !== this.cueKey.split("/")[0];
      // new track: crossfade over one bar of the outgoing tempo; same track: jump section on the bar line
      this.m.queue({ track: cue.track, section: cue.section, at: "bar", fade: changingTrack ? 240 / this.m.bpm : 0 });
      this.cueKey = key; this.stage = this.stageOf(s);
    }
    if (s.duel !== this.duel) { this.duel = s.duel; this.m.setTempoOffset(s.duel ? DIRECTION.duelTempoOffset : 0, DIRECTION.duelTempoRamp); }
    this.mods(s);
  }

  private mods(s: GameMusicState) {
    if (s.lowHealth !== this.low) { this.low = s.lowHealth; this.m.setFilter(s.lowHealth ? DIRECTION.lowHealthFilterHz : null, 0.4); }
    const hot = s.chain >= DIRECTION.hotChain;
    if (hot !== this.hot) { this.hot = hot; this.m.setChannel("fm4", { volume: DIRECTION.arpLevel[hot ? 1 : 0] }, 0.3); }
  }
  private stageOf(s: GameMusicState) {
    if (this.plan !== 0) return s.duel || s.remaining <= 25 ? 2 : s.remaining <= 60 ? 1 : 0;
    if (s.duel) return ADAPTIVE.length;
    const i = ADAPTIVE.findIndex(r => s.remaining > r.above); return i < 0 ? ADAPTIVE.length - 1 : i;
  }
}
