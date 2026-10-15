// Music director: turns game state and game events into MusicEngine calls. Edit this file (mostly DIRECTION)
// to change how the soundtrack reacts.
//
// Two axes:
//  - Section = match progress (players left, mini-boss on screen, duel). Applied on the next bar line.
//  - Layers  = MOMENTUM, a slow 0..1 meter of how well the player is doing. Kills nudge it up, sending an attack
//    pushes it up a lot (so finishing a chain is a climax, not a drop), hits and lost chains pull it down, and it
//    drains slowly when idle. Layers move one tier at a time, only on 4-bar phrase lines, fast up / slow down.
// On top of that, one-shot reactions: stingers (attack sent, boss down, KO, victory, defeat), a snare build while
// an attack is ARMED, bomb filter sweeps, power-up treatments, a lead duck + fill for incoming attacks and a key
// change for the final ten.
import type { ChannelId, MusicEngine, MusicEvent } from "./engine";

export interface GameMusicState {
  /** Pilots still flying (101 -> 1). */
  remaining: number;
  /** Final 1v1. */
  duel: boolean;
  /** Player is on their last hit point (used when hp isn't given). */
  lowHealth: boolean;
  /** Hit points (1..3) and bombs in stock: together they set the danger level. */
  hp?: number;
  bombs?: number;
  /** Current kill chain. */
  chain: number;
  /** Chain is ARMED (an attack will send when the chain timer ends). */
  armed?: boolean;
  /** A mini-boss is on screen. */
  bossActive?: boolean;
  /** Shield power-up held. */
  shield?: boolean;
  /** Chain freeze (F) running. */
  freeze?: boolean;
  /** Lightning (L) running. */
  lightning?: boolean;
  /** A bomb power-up is on the playfield while the player holds max bombs (touching it = triple bomb). */
  tripleReady?: boolean;
}
export type GameMusicEvent = "kill" | "sent" | "chainLost" | "hurt" | "bomb" | "bombBlast" | "tripleBomb" | "bossDown" | "ko" | "incoming" | "victory" | "defeat";

/** Everything tunable in one place. */
export const DIRECTION = {
  momentum: {
    kill: 0.008, sent: [0.12, 0.2, 0.32], ko: 0.1, bossDown: 0.25, tripleBomb: 0.2, hurt: -0.15, chainLost: -0.06,
    decayPerSec: 0.02,
  },
  tiers: {
    up: [0.2, 0.45, 0.7],       // momentum needed to climb from tier 0->1, 1->2, 2->3
    down: [0.12, 0.35, 0.58],   // momentum below which tier 1/2/3 starts to drop (hysteresis gap)
    phraseBars: 4,              // layer changes only on these bar lines
    minHoldBars: 8,             // a tier stays at least this long
    downPhrases: 2,             // phrases in a row below the line before dropping a tier
  },
  /** Channel levels per tier (channels not listed stay at 1: lead, bass, DAC drums). */
  layers: [
    { fm5: 0, fm4: 0, fm2: 0, sq1: 0, psg: 0.7 },   // 0: lead, bass, drums
    { fm5: 1, fm4: 0, fm2: 0, sq1: 0, psg: 0.85 },  // 1: + pad / guitar stabs
    { fm5: 1, fm4: 1, fm2: 0, sq1: 0, psg: 1 },     // 2: + arp
    { fm5: 1, fm4: 1.1, fm2: 1, sq1: 1, psg: 1 },   // 3: + lead echo, PSG harmony
  ] as Partial<Record<ChannelId, number>>[],
  duelTempoRamp: 3,
  /** Danger = how thin the player's safety margin is (HP + bombs), not what they just did.
   *  Level by table[hp - 1][min(bombs, 2)]; 0 safe, 1 caution, 2 danger, 3 critical (last hit point, no bombs). */
  danger: {
    table: [[3, 2, 2], [1, 1, 0], [0, 0, 0]],
    hz: [20000, 9000, 2600, 1600],     // master low-pass per level
    heartsPerBar: [0, 1, 2, 4],         // heartbeat on beat 1 / beats 1+3 / every beat
    heartVol: [0, 0.5, 0.85, 1],
    ticks: [false, false, false, true], // PSG clock tick on the off-beats
    thin: [1, 1, 1, 0.5],               // pad/stabs + arp level: the band thins out at critical
    reliefSecs: 1.2,                    // filter reopens this slowly when danger drops
  },
  shieldHz: 6500,
  bomb: { hz: 350, duck: 0.25, secs: 1.6 },          // "the bomb ate the music": band ducks + filter sweeps back open
  chainLost: { hz: 1200, secs: 0.6, lead: 0.35, leadSecs: 1.2 },
  incoming: { lead: 0.3, secs: 1.3 },               // lead ducks under the klaxon, drum fill as bullets arrive
  /** Bomb power-up on screen at max bombs = "grab it!": tempo pushes up; touching it (triple bomb) eases it back down. */
  tripleReady: { bpm: 10, rampUp: 1.5, rampDown: 2.5 },
  lightningArp: 1.4,
  armedBuild: [0.25, 1],                             // snare build level when armed .. at bossAt chain
  bossAt: 40,
  spectate: { hz: 2500, tier: 1 },
};

interface Cue { track: string; section: string; }
interface Plan {
  name: string;
  pick(s: GameMusicState): Cue;
  /** Stage number for HUD/tests. */
  stage(s: GameMusicState): number;
  spectate: Cue;
  /** BPM added for the duel (STARFALL ASCENT has its own faster duel section instead). */
  duelTempo: number;
}

// STARFALL ASCENT: section by players left; a mini-boss bumps it one section up (never into the final-ten/duel music).
const ASCENT_AT = [85, 70, 55, 40, 25, 10];
const ascentIdx = (s: GameMusicState) => { if (s.duel) return 7; const i = ASCENT_AT.findIndex(th => s.remaining > th); return i < 0 ? 6 : i; };
// Classic adaptive score across the three short tracks.
const CLASSIC: { above: number; cue: Cue }[] = [
  { above: 80, cue: { track: "aurora", section: "A" } }, { above: 65, cue: { track: "aurora", section: "B" } }, { above: 50, cue: { track: "aurora", section: "C" } },
  { above: 37, cue: { track: "hull", section: "A" } }, { above: 25, cue: { track: "hull", section: "B" } }, { above: 10, cue: { track: "hull", section: "C" } },
  { above: 5, cue: { track: "vector", section: "B" } }, { above: 0, cue: { track: "vector", section: "A" } },
];
const classicIdx = (s: GameMusicState) => { const i = CLASSIC.findIndex(r => s.remaining > r.above); return i < 0 ? CLASSIC.length - 1 : i; };
const single = (s: GameMusicState) => s.duel || s.bossActive || s.remaining <= 25 ? 2 : s.remaining <= 60 ? 1 : 0;

/** Soundtrack menu entries ("SWITCH SOUNDTRACK"). Index 0 is the default. */
export const PLANS: Plan[] = [
  {
    name: "STARFALL ASCENT", duelTempo: 0, spectate: { track: "ascent", section: "1" },
    pick: s => { let i = ascentIdx(s); if (s.bossActive && i < 6) i = Math.min(i + 1, 5); return { track: "ascent", section: String(i + 1) }; },
    stage: s => ascentIdx(s),
  },
  {
    name: "CLASSIC FM", duelTempo: 8, spectate: { track: "vector", section: "B" },
    pick: s => {
      if (s.duel) return { track: "vector", section: "C" };
      const c = CLASSIC[classicIdx(s)].cue; return s.bossActive && c.track !== "vector" ? { track: c.track, section: "C" } : c;
    },
    stage: s => s.duel ? CLASSIC.length : classicIdx(s),
  },
  ...[["aurora", "AURORA BREACH"], ["hull", "HULL INTEGRITY"], ["vector", "LAST VECTOR"]].map(([track, name]): Plan => ({
    name, duelTempo: 8, spectate: { track, section: "A" },
    pick: s => ({ track, section: "ABC"[single(s)] }), stage: single,
  })),
];

const BAND: ChannelId[] = ["fm1", "fm2", "fm3", "fm4", "fm5", "sq1"];
const MIXED: ChannelId[] = ["fm1", "fm2", "fm3", "fm4", "fm5", "sq1", "psg"];

export class MusicDirector {
  plan = 0;
  /** Index of the current point in the plan's progression (for tests / HUD). */
  stage = 0;
  /** 0..1 player momentum (drives the layer tier). */
  momentum = 0;
  /** Current layer tier (0..3). */
  tier = 0;
  /** 0 safe .. 3 critical (see DIRECTION.danger). */
  danger = 0;
  mode: "idle" | "play" | "spectate" | "ended" = "idle";
  private cueKey = ""; private transpose = 0; private last: GameMusicState = { remaining: 101, duel: false, lowHealth: false, chain: 0 };
  private barsSince = 99; private lowPhrases = 0; private bossTier = false; private bossWanted = false;
  private applied: Partial<Record<ChannelId, number>> = {}; private filterHz = 20000; private tempoOff = 0; private drumHalf = false;
  private dangerHz = 20000; private bombT = -99; private chainLostT = -99; private incomingT = -99; private tripleReady = false; private duelOn = false; private lastT = 0;
  constructor(private m: MusicEngine) {
    m.on("bar", e => this.onBar(e), { ahead: true });
  }
  get planName() { return PLANS[this.plan].name; }
  private get now() { return this.m.ctx.currentTime; }
  private get p() { return PLANS[this.plan]; }

  setPlan(i: number) { this.plan = ((i % PLANS.length) + PLANS.length) % PLANS.length; if (this.m.playing && this.mode === "play") this.start(this.last); }

  /** Start the music for a fresh match state (cuts straight in, layers at tier 0). */
  start(s: GameMusicState) {
    this.last = { ...s }; this.mode = "play";
    this.momentum = 0; this.tier = 0; this.barsSince = 99; this.lowPhrases = 0; this.bossTier = this.bossWanted = false;
    this.bombT = this.chainLostT = this.incomingT = -99; this.tripleReady = !!s.tripleReady; this.duelOn = s.duel; this.lastT = this.now;
    const cue = this.p.pick(s); this.transpose = this.keyFor(s, cue);
    this.m.setLoopMode("section"); this.m.setDrumMode("normal"); this.drumHalf = false; this.m.setBuild(0);
    this.tempoOff = s.duel ? this.p.duelTempo : 0; this.m.setTempoOffset(this.tempoOff);
    this.m.resetChannels(0); this.applied = {};
    this.filterHz = this.dangerHz = 20000; this.m.setFilter(null, 0); this.danger = this.dangerFor(s);
    this.m.play(cue.track, { section: cue.section, transpose: this.transpose });
    this.cueKey = cue.track + "/" + cue.section; this.stage = this.p.stage(s);
    this.applyMix(0);
  }

  /** Call every frame with the live game state. Cheap when nothing changed. */
  update(s: GameMusicState) {
    this.last = { ...s };
    if (!this.m.playing || this.mode !== "play") return;
    const now = this.now, dt = Math.min(0.25, Math.max(0, now - this.lastT)); this.lastT = now;
    this.momentum = Math.max(0, this.momentum - DIRECTION.momentum.decayPerSec * dt);

    // section / track / key: held while chain freeze runs ("freeze the music too")
    if (!s.freeze) {
      const cue = this.p.pick(s), key = cue.track + "/" + cue.section, tr = this.keyFor(s, cue);
      if (key !== this.cueKey || tr !== this.transpose) {
        const changingTrack = cue.track !== this.cueKey.split("/")[0];
        this.m.queue({ track: cue.track, section: cue.section, transpose: tr, at: "bar", fade: changingTrack ? 240 / this.m.bpm : 0 });
        this.cueKey = key; this.transpose = tr; this.stage = this.p.stage(s);
      }
    }
    // freeze -> half-time drums
    if (!!s.freeze !== this.drumHalf) { this.drumHalf = !!s.freeze; this.m.setDrumMode(this.drumHalf ? "half" : "normal"); }
    // armed -> snare build toward the send
    const [b0, b1] = DIRECTION.armedBuild;
    this.m.setBuild(s.armed ? b0 + (b1 - b0) * Math.min(1, s.chain / DIRECTION.bossAt) : 0);
    // tempo: duel offset + "grab the bomb" push (eases back down, slower, once it's touched or gone)
    const TR = DIRECTION.tripleReady, ready = !!s.tripleReady;
    const off = (s.duel ? this.p.duelTempo : 0) + (ready ? TR.bpm : 0);
    if (off !== this.tempoOff) {
      const ramp = s.duel !== this.duelOn ? DIRECTION.duelTempoRamp : ready ? TR.rampUp : TR.rampDown;
      this.m.setTempoOffset(off, ramp); this.tempoOff = off;
    }
    this.tripleReady = ready; this.duelOn = s.duel;
    // danger level from HP + bombs; its filter closes quickly and reopens slowly (relief)
    const D = DIRECTION; this.danger = this.dangerFor(s);
    const dHz = D.danger.hz[this.danger];
    this.dangerHz = dHz < this.dangerHz ? dHz : Math.min(dHz, this.dangerHz * Math.pow(20000 / D.danger.hz[3], dt / D.danger.reliefSecs));
    // filter: the lowest of every active treatment
    let hz = Math.min(20000, this.dangerHz);
    if (s.shield) hz = Math.min(hz, D.shieldHz);
    const kb = (now - this.bombT) / D.bomb.secs; if (kb >= 0 && kb < 1) hz = Math.min(hz, D.bomb.hz * Math.pow(20000 / D.bomb.hz, kb));
    const kc = (now - this.chainLostT) / D.chainLost.secs; if (kc >= 0 && kc < 1) hz = Math.min(hz, D.chainLost.hz * Math.pow(20000 / D.chainLost.hz, kc));
    if (Math.abs(hz - this.filterHz) / this.filterHz > 0.03) { this.filterHz = hz; this.m.setFilter(hz >= 19999 ? null : hz, 0.06); }
    // boss on screen forces the full band on the next bar (onBar); ducks apply right away
    this.bossWanted = !!s.bossActive;
    this.applyMix(0.08);
  }

  /** One-shot gameplay moments. */
  event(type: GameMusicEvent, data = 0) {
    const M = DIRECTION.momentum, now = this.now;
    const bump = (d: number) => { this.momentum = Math.max(0, Math.min(1, this.momentum + d)); };
    if (type === "victory") { if (this.m.playing) this.m.stinger("victory", { at: "beat", end: true }); else this.m.stinger("victory"); this.mode = "ended"; return; }
    if (type === "defeat") { this.toSpectate(); return; }
    if (this.mode !== "play") return;
    switch (type) {
      case "kill": bump(M.kill); break;
      case "sent": bump(M.sent[data] ?? M.sent[0]); this.m.stinger("sent" + Math.max(0, Math.min(2, data)), { at: "beat" }); break;
      case "chainLost": bump(M.chainLost); this.chainLostT = now; break;
      case "hurt": bump(M.hurt); break;
      case "bomb": this.bombT = now; break;
      case "bombBlast": this.bombT = now; break; // each of the triple bomb's three blasts ducks + sweeps
      case "tripleBomb": bump(M.tripleBomb); this.m.stinger("triple", { at: "beat" }); break; // reward + relief swell
      case "bossDown": bump(M.bossDown); this.m.stinger("bossDown", { at: "beat" }); break;
      case "ko": bump(M.ko); this.m.stinger("ko", { at: "now" }); break;
      case "incoming": this.incomingT = now; this.m.fill(); break;
    }
  }

  // ---- internals
  private dangerFor(s: GameMusicState) {
    const hp = Math.max(1, Math.min(3, s.hp ?? (s.lowHealth ? 1 : 3))), bombs = Math.max(0, Math.min(2, s.bombs ?? 2));
    return DIRECTION.danger.table[hp - 1][bombs];
  }
  /** Heartbeat / tick pattern for a beat (used by the SFX layer, scheduled on the music's beat clock). */
  dangerPulse(beat: number): { heart: number; tick: boolean } {
    if (this.mode !== "play") return { heart: 0, tick: false };
    const D = DIRECTION.danger, n = D.heartsPerBar[this.danger], on = n >= 4 || (n === 2 && beat % 2 === 0) || (n === 1 && beat === 0);
    return { heart: on ? D.heartVol[this.danger] : 0, tick: D.ticks[this.danger] };
  }
  private keyFor(s: GameMusicState, cue: Cue) {
    if (!(s.duel || s.remaining <= 10)) return 0;
    return this.m.tracks[this.m.trackIndex(cue.track)].def.finalTranspose ?? 2;
  }
  /** Phrase-locked tier changes, landed exactly on the bar line (ahead handler gets the audio time). */
  private onBar(e: MusicEvent) {
    if (this.mode !== "play") return;
    this.barsSince++;
    const T = DIRECTION.tiers, m = this.momentum;
    if (e.bar % T.phraseBars === 0 && this.barsSince >= T.minHoldBars) {
      if (this.tier < 3 && m >= T.up[this.tier]) { this.tier++; this.barsSince = 0; this.lowPhrases = 0; }
      else if (this.tier > 0 && m < T.down[this.tier - 1]) { if (++this.lowPhrases >= T.downPhrases) { this.tier--; this.barsSince = 0; this.lowPhrases = 0; } }
      else this.lowPhrases = 0;
    }
    this.bossTier = this.bossWanted;
    this.applyMix(0.12, e.time);
  }
  private applyMix(fade: number, at?: number) {
    const D = DIRECTION, now = this.now;
    const tier = this.mode === "spectate" ? D.spectate.tier : this.bossTier ? 3 : this.tier;
    const lay = D.layers[tier];
    const kb = (now - this.bombT) / D.bomb.secs, bombDuck = kb >= 0 && kb < 1 ? D.bomb.duck + (1 - D.bomb.duck) * kb * kb : 1;
    let lead = 1;
    if (now - this.chainLostT < D.chainLost.leadSecs) lead = Math.min(lead, D.chainLost.lead);
    if (now - this.incomingT < D.incoming.secs) lead = Math.min(lead, D.incoming.lead);
    if (this.mode === "spectate") lead = 0;
    for (const id of MIXED) {
      let v = lay[id] ?? 1;
      if (id === "fm4" && this.last.lightning && this.mode === "play") v = Math.max(v, D.lightningArp);
      if (id === "fm1" || id === "fm2") v *= lead;
      if (BAND.includes(id)) v *= bombDuck;
      if ((id === "fm4" || id === "fm5") && this.mode === "play") v *= DIRECTION.danger.thin[this.danger];
      if (Math.abs((this.applied[id] ?? -1) - v) > 0.01) { this.m.setChannel(id, { volume: v }, fade, at); this.applied[id] = v; }
    }
  }
  /** Knocked out: defeat sting, then the plan's calm section, muffled, lead out, until the next match or title. */
  private toSpectate() {
    if (!this.m.playing) return;
    this.mode = "spectate"; this.danger = 0;
    this.m.stinger("defeat", { at: "beat" });
    this.m.setBuild(0); this.m.setDrumMode("normal"); this.drumHalf = false; this.m.setTempoOffset(0, 2); this.tempoOff = 0;
    const sp = this.p.spectate;
    this.m.queue({ track: sp.track, section: sp.section, transpose: 0, at: "bar", fade: 1.5 });
    this.cueKey = sp.track + "/" + sp.section; this.transpose = 0;
    this.filterHz = DIRECTION.spectate.hz; this.m.setFilter(DIRECTION.spectate.hz, 1.5);
    this.applyMix(1.5);
  }
}
