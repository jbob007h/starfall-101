// FM chiptune engine (Sega Genesis / Mega Drive style) with a control API for dynamic, game-driven music.
//
// Voices: 2-operator FM per note (+ optional second parallel modulator, unison, delayed vibrato), slap bass,
// SN76489-style PSG square for the harmony line, DAC drums (kick/snare through an 8-bit-style quantiser)
// and PSG stepped noise (hats/crash).
// Channels: FM1 lead, FM2 lead echo, FM3 bass, FM4 arp, FM5 pad/guitar, FM6 DAC drums, PSG1 harmony, PSG noise,
// plus an engine-level SFX channel for stingers.
//
// Everything the game changes (track, section, key, tempo, channel mix, filter, fills, stingers) is applied on
// musical boundaries (next 16th / beat / bar / section) so changes never land mid-note. Works on any
// BaseAudioContext, so the same engine renders WAV previews through OfflineAudioContext.

export type ChannelId = "fm1" | "fm2" | "fm3" | "fm4" | "fm5" | "dac" | "sq1" | "psg" | "stg";
export const CHANNELS: { id: ChannelId; chip: string; role: string; pan: number; gain: number }[] = [
  { id: "fm1", chip: "FM1", role: "Lead", pan: 0, gain: 0.5 },
  { id: "fm2", chip: "FM2", role: "Echo", pan: -0.7, gain: 0.5 },
  { id: "fm3", chip: "FM3", role: "Bass", pan: 0, gain: 0.75 },
  { id: "fm4", chip: "FM4", role: "Arp", pan: 0.7, gain: 0.28 },
  { id: "fm5", chip: "FM5", role: "Pad / Gtr", pan: 0.2, gain: 0.26 },
  { id: "dac", chip: "FM6", role: "DAC drums", pan: 0, gain: 0.9 },
  { id: "sq1", chip: "PSG1", role: "Harmony", pan: 0.4, gain: 0.45 },
  { id: "psg", chip: "PSG", role: "Noise", pan: 0, gain: 0.22 },
  { id: "stg", chip: "SFX", role: "Stinger", pan: 0, gain: 0.55 },
];
const DECK_CHANNELS = CHANNELS.filter(c => c.id !== "stg");

/** 2-op FM patch. index = modulation depth in multiples of the note frequency (decays to indexSus). */
export interface FMPatch {
  ratio: number; modType?: OscillatorType; index: number; indexSus: number; indexDecay: number;
  ratio2?: number; mod2Type?: OscillatorType; index2?: number;
  a: number; d: number; s: number; r: number; vol: number;
  unison?: number; spread?: number; vib?: { depth: number; rate: number; delay: number };
}

export interface DrumBar { k: string; s: string; h: string; }
export interface SectionDef {
  id: string; name: string;
  /** One chord per bar, e.g. "Em C D B" (qualities: "", m, dim, aug, sus4). */
  chords: string;
  /** Lead melody: NOTE-LENGTH tokens in 16th steps ("E5-6", rest "_-4"), "|" between bars (16 steps each). */
  melody: string;
  /** 16 chars per bar: r root, o octave, f fifth, . rest. */
  bass: string;
  harm: ("pad" | "arp" | "stab")[]; arp?: "up" | "updown";
  /** Arp note length in 16ths (1 = 16ths, 2 = 8ths). */
  arpRate?: number;
  /** Power-chord stab rhythm, 16 chars: x hit, . rest. */
  stab?: string;
  /** 16 chars each: k kick / s snare / h closed hat, o open hat. */
  drums: DrumBar;
  /** Overrides for the section's last bar, and the pattern used by fill(). */
  fill?: Partial<DrumBar>;
  /** Section tempo (default: the track's bpm). */
  bpm?: number;
  /** Lead patch override for this section. */
  lead?: string;
  /** Auto-generated PSG1 harmony under the lead: diatonic third or sixth below, chord-aware. */
  harmony?: "third" | "sixth";
  /** Extra crash every N bars (section start always crashes). */
  crashEvery?: number;
}
export interface TrackDef {
  id: string; title: string; stage: string;
  /** "E minor", "B minor", "C major"... (used for harmony and key-mode stingers). */
  key: string; bpm: number;
  patches: { lead: string; arp: string; pad: string; stab: string; bass?: string };
  /** "sega" = sampled Mega Drive-style DAC kit for every drum hit (hats/crash too) instead of PSG noise. */
  kit?: "sega";
  /** Stabs voiced as full triads (staccato chordal comping) instead of root/fifth/octave power chords. */
  stabChord?: boolean;
  /** Semitones added to the lead melody. */
  shift: number;
  /** tanh drive on the lead + echo channels (0 = clean). */
  drive: number;
  echo: { steps: number; vol: number };
  /** Per-track channel level multipliers. */
  mix?: Partial<Record<ChannelId, number>>;
  /** Key change (semitones) the director applies for the final ten. Default 2. */
  finalTranspose?: number;
  sections: SectionDef[];
}
/** Stinger: a short phrase on the SFX channel. mode "chord": note index walks the current chord (0 root, 1 third,
 *  2 fifth, 3 octave...); mode "key": note index = semitones above the song's tonic (with any key change). */
export interface StingerDef {
  mode: "chord" | "key"; patch: string; len: number;
  /** [step, index, length, velocity?] */
  notes: [number, number, number, number?][];
  kick?: number[]; snare?: number[]; crash?: number[];
}

// ---------------------------------------------------------------- compiler
type Ev =
  | { k: "fm"; ch: ChannelId; patch: string; midi: number; len: number; gate: number; vel: number }
  | { k: "psg"; ch: ChannelId; midi: number; len: number; gate: number; vel: number }
  | { k: "kick" | "snare" | "hat" | "ohat" | "crash"; ch: ChannelId; vel: number };
const isDrum = (e: Ev) => e.k !== "fm" && e.k !== "psg";
export interface CompiledSection { id: string; name: string; L: number; bpm: number; bars: string[]; ev: Ev[][]; fillEv: Ev[][]; }
export interface CompiledTrack { def: TrackDef; sections: CompiledSection[]; loopSteps: number; tonic: number; }

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const midiName = (m: number) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const pcOf = (l: string, acc: string) => (PC[l] + (acc === "#" ? 1 : acc === "b" ? -1 : 0) + 12) % 12;
export function noteToMidi(n: string) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(n); if (!m) throw new Error("music: bad note " + n);
  return 12 * (+m[3] + 1) + pcOf(m[1], m[2]);
}
const QUAL: Record<string, number[]> = { "": [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], sus4: [0, 5, 7] };
const chordCache = new Map<string, { pc: number; iv: number[]; name: string }>();
export function parseChord(c: string) {
  let r = chordCache.get(c); if (r) return r;
  const m = /^([A-G])([#b]?)(m|dim|aug|sus4)?$/.exec(c); if (!m) throw new Error("music: bad chord " + c);
  r = { pc: pcOf(m[1], m[2]), iv: QUAL[m[3] || ""], name: c }; chordCache.set(c, r); return r;
}
function parseKey(k: string) {
  const m = /^([A-G])([#b]?)\s*(major|minor)?/i.exec(k.trim()); if (!m) return { tonic: 0, scale: [0, 2, 4, 5, 7, 9, 11] };
  const minor = (m[3] || "minor").toLowerCase() === "minor";
  return { tonic: pcOf(m[1], m[2]), scale: minor ? [0, 2, 3, 5, 7, 8, 10, 11] : [0, 2, 4, 5, 7, 9, 11] }; // minor includes the raised 7th
}
const DEFAULT_FILL = "....s...s.s.ssss";

function drumEvents(d: DrumBar, add: (s: number, e: Ev) => void, b0: number, rollFrom8: boolean) {
  for (let s = 0; s < 16; s++) {
    if (d.k[s] === "k") add(b0 + s, { k: "kick", ch: "dac", vel: 1 });
    if (d.s[s] === "s") add(b0 + s, { k: "snare", ch: "dac", vel: rollFrom8 && s >= 8 ? 0.6 + 0.04 * (s - 8) : 1 });
    if (d.h[s] === "h") add(b0 + s, { k: "hat", ch: "psg", vel: s % 4 === 0 ? 1 : 0.65 });
    if (d.h[s] === "o") add(b0 + s, { k: "ohat", ch: "psg", vel: 0.9 });
  }
}

/** Compile each section to its own looping step grid (16th notes). Throws on malformed bars so data bugs fail loudly. */
export function compileTrack(tr: TrackDef): CompiledTrack {
  const key = parseKey(tr.key);
  const sections = tr.sections.map(sec => {
    const chords = sec.chords.trim().split(/\s+/).map(parseChord), L = chords.length * 16;
    const ev: Ev[][] = Array.from({ length: L }, () => []);
    const add = (step: number, e: Ev) => ev[((step % L) + L) % L].push(e);
    const lead = sec.lead ?? tr.patches.lead;
    const mbars = sec.melody.split("|");
    if (mbars.length !== chords.length) throw new Error(`music: ${tr.id}/${sec.id} has ${mbars.length} melody bars for ${chords.length} chords`);
    let st = 0;
    mbars.forEach((mb, i) => {
      let sum = 0; const ch = chords[i], cpcs = ch.iv.map(iv => (ch.pc + iv) % 12);
      for (const tok of mb.trim().split(/\s+/)) {
        const [n, len] = tok.split("-"), l = +len; sum += l;
        if (n !== "_") {
          const midi = noteToMidi(n) + tr.shift;
          add(st, { k: "fm", ch: "fm1", patch: lead, midi, len: l, gate: 0.95, vel: 1 });
          add(st + tr.echo.steps, { k: "fm", ch: "fm2", patch: lead, midi, len: l, gate: 0.95, vel: tr.echo.vol }); // fake echo
          if (sec.harmony) {
            const cands = sec.harmony === "third" ? [midi - 3, midi - 4] : [midi - 8, midi - 9];
            const inChord = cands.find(c => cpcs.includes(((c % 12) + 12) % 12));
            const inKey = cands.find(c => key.scale.includes(((c - key.tonic) % 12 + 12) % 12));
            add(st, { k: "psg", ch: "sq1", midi: inChord ?? inKey ?? cands[0], len: l, gate: 0.9, vel: 0.85 });
          }
        }
        st += l;
      }
      if (sum !== 16) throw new Error(`music: ${tr.id}/${sec.id} bar ${i + 1} has ${sum} steps`);
    });
    let prevPad: { chord: string; evs: { len: number }[] } | null = null;
    const rate = sec.arpRate ?? 1;
    chords.forEach((ch, bi) => {
      const b0 = bi * 16, last = bi === chords.length - 1, root = 36 + ch.pc;
      for (let s = 0; s < 16; s++) {
        const c = sec.bass[s]; if (!c || c === ".") continue;
        add(b0 + s, { k: "fm", ch: "fm3", patch: tr.patches.bass ?? "slap", midi: root + (c === "o" ? 12 : c === "f" ? 7 : 0), len: sec.bass[s + 1] === "." ? 2 : 1, gate: 0.85, vel: 1 });
      }
      if (sec.harm.includes("pad")) {
        if (prevPad && prevPad.chord === ch.name) prevPad.evs.forEach(e => e.len += 16); // held across repeated chords
        else {
          const evs = ch.iv.map(iv => ({ k: "fm" as const, ch: "fm5" as ChannelId, patch: tr.patches.pad, midi: 48 + ch.pc + iv, len: 16, gate: 0.98, vel: 0.8 }));
          evs.forEach(e => add(b0, e)); prevPad = { chord: ch.name, evs };
        }
      }
      if (sec.harm.includes("arp")) {
        const base = (ch.pc >= 7 ? 48 : 60) + ch.pc, tones = [0, ch.iv[1], ch.iv[2], 12];
        const order = sec.arp === "updown" ? [0, 1, 2, 3, 2, 1] : [0, 1, 2, 3];
        for (let s = 0; s < 16; s += rate) add(b0 + s, { k: "fm", ch: "fm4", patch: tr.patches.arp, midi: base + tones[order[((b0 + s) / rate) % order.length]], len: rate, gate: 0.9, vel: s % 4 === 0 ? 1 : 0.7 });
      }
      if (sec.harm.includes("stab") && sec.stab) {
        const p = sec.stab, base = tr.stabChord ? (ch.pc >= 8 ? 48 : 60) + ch.pc : (ch.pc >= 7 ? 36 : 48) + ch.pc;
        const voicing = tr.stabChord ? [0, ch.iv[1], ch.iv[2]] : [0, 7, 12];
        for (let s = 0; s < 16; s++) {
          if (p[s] !== "x") continue;
          let len = 1; while (len < 2 && s + len < 16 && p[s + len] === ".") len++;
          for (const iv of voicing) add(b0 + s, { k: "fm", ch: "fm5", patch: tr.patches.stab, midi: base + iv, len, gate: 0.8, vel: 0.9 });
        }
      }
      drumEvents({ ...sec.drums, ...((last && sec.fill) || {}) }, add, b0, !!(last && sec.fill?.s));
      if (sec.crashEvery && bi > 0 && bi % sec.crashEvery === 0) add(b0, { k: "crash", ch: "psg", vel: 0.8 });
    });
    add(0, { k: "crash", ch: "psg", vel: 1 });
    const fillEv: Ev[][] = Array.from({ length: 16 }, () => []);
    drumEvents({ ...sec.drums, s: DEFAULT_FILL, ...(sec.fill || {}) }, (s, e) => fillEv[s].push(e), 0, true);
    return { id: sec.id, name: sec.name, L, bpm: sec.bpm ?? tr.bpm, bars: chords.map(c => c.name), ev, fillEv };
  });
  return { def: tr, sections, loopSteps: sections.reduce((a, s) => a + s.L, 0), tonic: key.tonic };
}

// ---------------------------------------------------------------- engine
export type Boundary = "now" | "beat" | "bar" | "section";
export type LoopMode = "section" | "song";
export type DrumMode = "normal" | "half";
export type MusicEventType = "beat" | "bar" | "section" | "track" | "loop" | "stop";
export interface MusicEvent { type: MusicEventType; time: number; track: string; section: string; bar: number; beat: number; bpm: number; }
export interface Cue {
  /** Track id or index. Omit to stay on the current track. */
  track?: string | number;
  /** Section id ("A") or index. Omit = first section on a track change, current section otherwise. */
  section?: string | number;
  /** Key change in semitones from the written key (applies from the boundary on). */
  transpose?: number;
  /** Musical boundary to switch on (default "bar"). */
  at?: Boundary;
  /** Crossfade seconds on a track change (0 = cut on the boundary, letting notes ring out). */
  fade?: number;
}
export interface ChannelSettings { mute: boolean; volume: number; }
export interface MusicState {
  playing: boolean; paused: boolean; track: string; trackIndex: number; title: string;
  section: string; sectionIndex: number; sectionName: string; bar: number; bars: number; chord: string;
  bpm: number; transpose: number; loopMode: LoopMode; drumMode: DrumMode; channels: Record<ChannelId, ChannelSettings>;
}

interface Deck {
  ti: number; track: CompiledTrack; sec: number; step: number; next: number; endAt: number; fillBar: number;
  group: GainNode; level: Partial<Record<ChannelId, GainNode>>; input: Partial<Record<ChannelId, AudioNode>>;
}
interface Pending { ti: number; sec: number | null; transpose: number | null; at: Boundary; fade: number; }
interface PendingStinger { def: StingerDef; at: Boundary; end: boolean; }
type Handler = (e: MusicEvent) => void;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const LOOKAHEAD = 0.12;
const PSG_LV = (v: number) => v <= 0 ? 0 : Math.pow(10, -(15 - v) * 2 / 20); // SN76489 2 dB steps

export class MusicEngine {
  readonly tracks: CompiledTrack[];
  /** Post-mix volume (after the compressor). */
  readonly volume: GainNode;
  private mix: GainNode; private lpf: BiquadFilterNode; private comp: DynamicsCompressorNode;
  private stgIn: GainNode; private stgDac: AudioNode;
  private noise: AudioBuffer; private dacCurve: Float32Array; private driveCurves = new Map<number, Float32Array>();
  private deck: Deck | null = null; private fading: Deck[] = []; private pending: Pending | null = null;
  private stingers: PendingStinger[] = []; private stopAt = 0;
  private bpmNow = 120; private bpmFrom = 120; private bpmTo = 120; private rampT0 = 0; private rampT1 = 0;
  private tempoOverride: number | null = null; private tempoOffset = 0;
  private chans = Object.fromEntries(CHANNELS.map(c => [c.id, { mute: false, volume: 1 }])) as Record<ChannelId, ChannelSettings>;
  private handlers: { type: MusicEventType | "*"; fn: Handler; ahead: boolean }[] = [];
  private evq: MusicEvent[] = [];
  private heard: MusicEvent | null = null; private lastBeat: MusicEvent | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private fillPending = false;
  loopMode: LoopMode = "section";
  drumMode: DrumMode = "normal";
  /** Key change in semitones (pitched channels only). Change it on a boundary with queue({ transpose }). */
  transpose = 0;
  /** 0..1 snare build-up layered over the drums (e.g. while an attack is armed). */
  build = 0;
  paused = false;
  /** Set false to drive scheduling yourself with tick()/scheduleUntil() (offline rendering does this). */
  autoTick: boolean;

  constructor(readonly ctx: BaseAudioContext, dest: AudioNode, defs: TrackDef[], readonly patches: Record<string, FMPatch>, readonly stingerDefs: Record<string, StingerDef> = {}) {
    this.tracks = defs.map(compileTrack);
    this.mix = ctx.createGain(); this.mix.gain.value = 0.55;
    this.lpf = ctx.createBiquadFilter(); this.lpf.type = "lowpass"; this.lpf.frequency.value = 20000; this.lpf.Q.value = 0.5;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 3; this.comp.attack.value = 0.005; this.comp.release.value = 0.15;
    this.volume = ctx.createGain(); this.volume.gain.value = 1;
    this.mix.connect(this.lpf); this.lpf.connect(this.comp); this.comp.connect(this.volume); this.volume.connect(dest);
    const len = ctx.sampleRate; this.noise = ctx.createBuffer(1, len, ctx.sampleRate); // PSG-ish stepped noise
    const nd = this.noise.getChannelData(0); let v = 0; for (let i = 0; i < len; i++) { if (i % 2 === 0) v = Math.random() * 2 - 1; nd[i] = v; }
    const n = 4096; this.dacCurve = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; this.dacCurve[i] = Math.round(Math.tanh(1.4 * x) * 40) / 40; }
    // stinger channel lives outside the track decks so it rings on through track changes and stop()
    this.stgIn = ctx.createGain(); this.stgIn.gain.value = CHANNELS.find(c => c.id === "stg")!.gain; this.stgIn.connect(this.mix);
    const sh = ctx.createWaveShaper(); sh.curve = this.dacCurve as Float32Array<ArrayBuffer>; sh.connect(this.stgIn); this.stgDac = sh;
    this.autoTick = typeof window !== "undefined" && typeof OfflineAudioContext !== "undefined" && !(ctx instanceof OfflineAudioContext);
  }

  // ------------------------------------------------------------ queries
  trackIndex(t: string | number) {
    const i = typeof t === "number" ? t : this.tracks.findIndex(x => x.def.id === t);
    if (i < 0 || i >= this.tracks.length) throw new Error("music: unknown track " + t); return i;
  }
  sectionIndex(ti: number, s: string | number) {
    const secs = this.tracks[ti].sections, i = typeof s === "number" ? s : secs.findIndex(x => x.id === s);
    if (i < 0 || i >= secs.length) throw new Error("music: unknown section " + s); return i;
  }
  get playing() { return !!this.deck; }
  /** Current tempo (follows ramps). */
  get bpm() { return this.bpmNow; }
  /** What is audible right now (lags the scheduler by the lookahead). */
  get state(): MusicState {
    const h = this.heard, d = this.deck, ti = h ? this.trackIndex(h.track) : d?.ti ?? 0, tr = this.tracks[ti];
    const si = h ? this.sectionIndex(ti, h.section) : d?.sec ?? 0, sec = tr.sections[si], bar = h?.bar ?? 0;
    const channels = {} as Record<ChannelId, ChannelSettings>; for (const c of CHANNELS) channels[c.id] = { ...this.chans[c.id] };
    return {
      playing: !!d, paused: this.paused, track: tr.def.id, trackIndex: ti, title: tr.def.title,
      section: sec.id, sectionIndex: si, sectionName: sec.name, bar, bars: sec.L / 16, chord: sec.bars[bar] ?? "",
      bpm: this.bpmNow, transpose: this.transpose, loopMode: this.loopMode, drumMode: this.drumMode, channels,
    };
  }
  /** The chord being heard now, key change included: root pitch class + intervals. */
  currentChord(): { root: number; iv: number[] } | null {
    const s = this.deck ? this.state : null; if (!s || !s.chord) return null;
    const c = parseChord(s.chord); return { root: (c.pc + this.transpose + 120) % 12, iv: c.iv };
  }
  /** AudioContext time of the next 16th-note grid line (now if nothing is playing). Use it to quantize SFX. */
  nextStepTime(every = 1) {
    const now = this.ctx.currentTime, d = this.deck; if (!d || this.paused) return now;
    const sd = 60 / this.bpmNow / 4 * every; const k = Math.floor((d.next - now) / sd); return Math.max(now, d.next - k * sd);
  }
  /** 0..1 position within the current beat (0 = on the beat) for beat-synced visuals; 0.5 when silent. */
  beatPhase() {
    const b = this.lastBeat; if (!b || !this.deck || this.paused) return 0.5;
    const el = this.ctx.currentTime - b.time, dur = 60 / b.bpm; return el < 0 ? 0 : (el / dur) % 1;
  }

  // ------------------------------------------------------------ transport
  /** Start (or restart) a track immediately. */
  play(track: string | number, opts: { section?: string | number; loop?: LoopMode; at?: number; transpose?: number } = {}) {
    const ti = this.trackIndex(track), sec = opts.section === undefined ? 0 : this.sectionIndex(ti, opts.section);
    if (opts.loop) this.loopMode = opts.loop;
    this.stop(0.05, false);
    this.paused = false; this.pending = null; this.transpose = opts.transpose ?? 0;
    const t = opts.at ?? this.ctx.currentTime + 0.06;
    this.deck = this.makeDeck(ti, sec, t);
    this.resetTempo(this.deck, t);
    this.startTimer(); this.tick();
  }
  /** Change track / section / key on the next musical boundary. Merges with a cue that hasn't applied yet. */
  queue(cue: Cue) {
    if (!this.deck) { if (cue.track !== undefined) this.play(cue.track, { section: cue.section, transpose: cue.transpose }); return; }
    const p = this.pending;
    const ti = cue.track === undefined ? (p?.ti ?? this.deck.ti) : this.trackIndex(cue.track);
    const sec = cue.section === undefined ? (cue.track === undefined ? p?.sec ?? null : null) : this.sectionIndex(ti, cue.section);
    this.pending = { ti, sec, transpose: cue.transpose ?? p?.transpose ?? null, at: cue.at ?? p?.at ?? "bar", fade: cue.fade ?? p?.fade ?? 0 };
  }
  /** Is a queued cue still waiting for its boundary? */
  get hasPending() { return !!this.pending; }
  stop(fade = 0.08, emit = true) {
    const t = this.ctx.currentTime;
    for (const d of [this.deck, ...this.fading]) if (d) this.retire(d, t, fade);
    const had = !!this.deck;
    this.deck = null; this.fading = []; this.pending = null; this.paused = false; this.evq = []; this.heard = null; this.lastBeat = null;
    this.stingers = []; this.stopAt = 0; this.fillPending = false; this.build = 0; this.drumMode = "normal";
    this.stopTimer();
    if (had && emit) this.emitNow("stop");
  }
  /** Freeze the song position and silence the music; resume() continues from the same step. */
  pause() {
    if (!this.deck || this.paused) return;
    this.paused = true; const t = this.ctx.currentTime;
    for (const d of [this.deck, ...this.fading]) { d.group.gain.cancelScheduledValues(t); d.group.gain.setTargetAtTime(0, t, 0.02); }
    this.evq = this.evq.filter(e => e.time <= t);
  }
  resume() {
    if (!this.deck || !this.paused) return;
    this.paused = false; const t = this.ctx.currentTime + 0.05;
    this.deck.next = t; this.deck.group.gain.cancelScheduledValues(t); this.deck.group.gain.setTargetAtTime(1, t, 0.02);
    for (const d of this.fading) this.retire(d, t, 0.05);
    this.fading = []; this.tick();
  }
  setPaused(p: boolean) { if (p) this.pause(); else this.resume(); }
  /** "section" = loop the current section until told otherwise (game default); "song" = play sections in order. */
  setLoopMode(m: LoopMode) { this.loopMode = m; }

  // ------------------------------------------------------------ performance
  /** Replace the drums of the next bar with the section's fill. */
  fill() { this.fillPending = true; }
  /** "half" = half-time drums (kick on 1, snare on 3, quarter hats) until set back to "normal". */
  setDrumMode(m: DrumMode) { this.drumMode = m; }
  /** 0..1 snare build-up (8ths, then 16ths above 0.6), getting louder through each bar. */
  setBuild(level: number) { this.build = Math.max(0, Math.min(1, level)); }
  /** Play a stinger on the next boundary (default "beat"). end: true fades the band out under it and stops afterwards. */
  stinger(name: string | StingerDef, opts: { at?: Boundary; end?: boolean } = {}) {
    const def = typeof name === "string" ? this.stingerDefs[name] : name; if (!def) return;
    if (!this.deck || this.paused) { this.fireStinger(def, this.ctx.currentTime + 0.02, null, false); return; }
    this.stingers.push({ def, at: opts.at ?? "beat", end: !!opts.end });
  }

  // ------------------------------------------------------------ mix / tempo
  /** Absolute tempo override (null = back to the section's tempo + offset). Ramps over `ramp` seconds. */
  setTempo(bpm: number | null, ramp = 0) { this.tempoOverride = bpm; this.retarget(ramp); }
  /** Tempo relative to each section's own BPM (e.g. +8 for the final duel). Kept across track changes. */
  setTempoOffset(delta: number, ramp = 0) { this.tempoOffset = delta; this.retarget(ramp); }
  get tempoOffsetValue() { return this.tempoOffset; }
  /** Mute / set the level (0..1+) of one channel. Applies to every track and survives track changes.
   *  `at` (AudioContext time) lands the change exactly, e.g. on a bar line from an { ahead: true } bar handler. */
  setChannel(id: ChannelId, s: Partial<ChannelSettings>, fade = 0.05, at?: number) {
    Object.assign(this.chans[id], s);
    if (id === "stg") { const v = this.chans.stg.mute ? 0 : CHANNELS.find(c => c.id === "stg")!.gain * this.chans.stg.volume; this.ramp(this.stgIn.gain, v, fade, at); return; }
    for (const d of [this.deck, ...this.fading]) if (d) this.applyLevel(d, id, fade, at);
  }
  setChannels(all: Partial<Record<ChannelId, Partial<ChannelSettings>>>, fade = 0.05, at?: number) { for (const k in all) this.setChannel(k as ChannelId, all[k as ChannelId]!, fade, at); }
  channel(id: ChannelId): ChannelSettings { return { ...this.chans[id] }; }
  /** Unmute every channel at full level. */
  resetChannels(fade = 0.05) { for (const c of CHANNELS) this.setChannel(c.id, { mute: false, volume: 1 }, fade); }
  /** Master low-pass in Hz (null = open). 3390 Hz is the Model 1 Genesis headphone-out character. */
  setFilter(hz: number | null, ramp = 0.05) { this.lpf.frequency.setTargetAtTime(hz ?? 20000, this.ctx.currentTime, Math.max(0.005, ramp / 3)); }
  setVolume(v: number, ramp = 0.05) { this.volume.gain.setTargetAtTime(v, this.ctx.currentTime, Math.max(0.005, ramp / 3)); }

  // ------------------------------------------------------------ events
  /** Subscribe to beat/bar/section/track/loop/stop ("*" = all). Fires when the moment is heard;
   *  with { ahead: true } it fires when scheduled (~120 ms early) with the exact AudioContext `time`,
   *  so you can schedule your own sounds on the beat. Returns an unsubscribe function. */
  on(type: MusicEventType | "*", fn: Handler, opts: { ahead?: boolean } = {}) {
    const h = { type, fn, ahead: !!opts.ahead }; this.handlers.push(h);
    return () => { this.handlers = this.handlers.filter(x => x !== h); };
  }

  // ------------------------------------------------------------ scheduling
  /** Realtime pump: schedule ahead and dispatch heard events. Runs on its own timer when autoTick is on. */
  tick() {
    const now = this.ctx.currentTime;
    if (this.stopAt && now >= this.stopAt) { this.stop(0.3); return; }
    this.scheduleUntil(now + LOOKAHEAD);
    while (this.evq.length && this.evq[0].time <= now) this.dispatch(this.evq.shift()!, false);
  }
  /** Schedule all steps that start before `until` (AudioContext time). */
  scheduleUntil(until: number) {
    if (!this.deck || this.paused) return;
    for (const d of this.fading) { while (d.next < Math.min(until, d.endAt)) this.stepDeck(d, false); }
    this.fading = this.fading.filter(d => d.next < d.endAt);
    while (this.deck && this.deck.next < until && !(this.stopAt && this.deck.next >= this.stopAt)) {
      this.applyPending(this.deck);
      this.stepDeck(this.deck, true);
    }
  }

  private stepDeck(d: Deck, main: boolean) {
    const t = d.next;
    if (main) this.advanceTempo(t);
    const sec = d.track.sections[d.sec], s16 = d.step % 16, bar = Math.floor(d.step / 16);
    if (main && s16 === 0) {
      if (d.fillBar !== bar) d.fillBar = -1;
      if (this.fillPending) { d.fillBar = bar; this.fillPending = false; }
    }
    if (main && d.step % 4 === 0) {
      const base = { time: t, track: d.track.def.id, section: sec.id, bar, beat: (d.step / 4) % 4, bpm: this.bpmNow };
      if (d.step === 0) this.emit({ ...base, type: "section" });
      if (s16 === 0) this.emit({ ...base, type: "bar" });
      this.emit({ ...base, type: "beat" });
    }
    if (main && this.stingers.length) {
      const fire = this.stingers.filter(p => p.at === "now" || (p.at === "beat" && d.step % 4 === 0) || (p.at === "bar" && s16 === 0) || (p.at === "section" && d.step === 0));
      if (fire.length) { this.stingers = this.stingers.filter(p => !fire.includes(p)); for (const p of fire) this.fireStinger(p.def, t, d, p.end); }
    }
    const half = main ? this.drumMode === "half" : false, fillBar = d.fillBar === bar;
    for (const e of sec.ev[d.step]) {
      if (isDrum(e) && e.k !== "crash" && (half || fillBar)) continue;
      this.playEv(d, e, t);
    }
    if (fillBar) for (const e of sec.fillEv[s16]) this.playEv(d, e, t);
    else if (half) {
      if (s16 === 0 || s16 === 10) this.playEv(d, { k: "kick", ch: "dac", vel: 1 }, t);
      if (s16 === 8) this.playEv(d, { k: "snare", ch: "dac", vel: 1 }, t);
      if (s16 % 4 === 0) this.playEv(d, { k: "hat", ch: "psg", vel: 0.8 }, t);
    }
    if (main && this.build > 0 && !half && !fillBar && (d.step % 2 === 0 || this.build >= 0.6))
      this.playEv(d, { k: "snare", ch: "dac", vel: (0.12 + 0.4 * this.build) * (0.55 + 0.45 * s16 / 15) }, t);
    d.next += 60 / this.bpmNow / 4; d.step++;
    if (d.step >= sec.L) {
      d.step = 0;
      if (this.loopMode === "song") {
        d.sec = (d.sec + 1) % d.track.sections.length;
        if (main) { this.retarget(240 / this.bpmNow, d); if (d.sec === 0) this.emitAt("loop", d, d.next); }
      } else if (main) this.emitAt("loop", d, d.next);
    }
  }
  private applyPending(d: Deck) {
    const p = this.pending; if (!p) return;
    const ok = p.at === "now" || (p.at === "beat" && d.step % 4 === 0) || (p.at === "bar" && d.step % 16 === 0) || (p.at === "section" && d.step === 0);
    if (!ok) return;
    this.pending = null;
    const t = d.next;
    if (p.transpose !== null) this.transpose = p.transpose;
    if (p.ti !== d.ti) {
      const nd = this.makeDeck(p.ti, p.sec ?? 0, t, p.fade);
      if (p.fade > 0) { d.endAt = t + p.fade; d.group.gain.setValueAtTime(1, t); d.group.gain.linearRampToValueAtTime(0, t + p.fade); this.fading.push(d); }
      else this.retire(d, t, 0.15);
      this.deck = nd; this.resetTempo(nd, t);
      this.emitAt("track", nd, t);
    } else if (p.sec !== null && (p.sec !== d.sec || d.step !== 0)) {
      d.sec = p.sec; d.step = 0; this.retarget(240 / this.bpmNow, d);
    }
  }
  private makeDeck(ti: number, sec: number, t: number, fadeIn = 0): Deck {
    const c = this.ctx, tr = this.tracks[ti], def = tr.def;
    const group = c.createGain();
    if (fadeIn > 0) { group.gain.setValueAtTime(0, t); group.gain.linearRampToValueAtTime(1, t + fadeIn); } else group.gain.value = 1;
    group.connect(this.mix);
    const level: Deck["level"] = {}, input: Deck["input"] = {};
    for (const ch of DECK_CHANNELS) {
      const g = c.createGain(); let node: AudioNode = g;
      if (ch.id === "dac") { const sh = c.createWaveShaper(); sh.curve = this.dacCurve as Float32Array<ArrayBuffer>; node.connect(sh); node = sh; }
      if (def.drive && (ch.id === "fm1" || ch.id === "fm2")) { const sh = c.createWaveShaper(); sh.curve = this.driveCurve(def.drive) as Float32Array<ArrayBuffer>; sh.oversample = "2x"; node.connect(sh); node = sh; }
      const pan = c.createStereoPanner(); pan.pan.value = ch.pan; node.connect(pan); pan.connect(group);
      level[ch.id] = g; input[ch.id] = g;
    }
    const d: Deck = { ti, track: tr, sec, step: 0, next: t, endAt: Infinity, fillBar: -1, group, level, input };
    for (const ch of DECK_CHANNELS) this.applyLevel(d, ch.id, 0);
    return d;
  }
  private retire(d: Deck, t: number, fade: number) {
    d.endAt = Math.min(d.endAt, t);
    try { d.group.gain.cancelScheduledValues(t); d.group.gain.setTargetAtTime(0, t, Math.max(0.005, fade / 3)); } catch { /* ignore */ }
    const g = d.group;
    if (this.autoTick) setTimeout(() => { try { g.disconnect(); } catch { /* ignore */ } }, (t - this.ctx.currentTime + fade + 3) * 1000);
  }
  private ramp(p: AudioParam, v: number, fade: number, at?: number) {
    const t = Math.max(this.ctx.currentTime, at ?? 0);
    if (fade <= 0) { p.cancelScheduledValues(t); p.setValueAtTime(v, t); } else p.setTargetAtTime(v, t, fade / 3);
  }
  private applyLevel(d: Deck, id: ChannelId, fade: number, at?: number) {
    const g = d.level[id]; if (!g) return;
    const s = this.chans[id], base = CHANNELS.find(c => c.id === id)!.gain * (d.track.def.mix?.[id] ?? 1);
    this.ramp(g.gain, s.mute ? 0 : base * s.volume, fade, at);
  }
  private driveCurve(k: number) {
    let c = this.driveCurves.get(k); if (c) return c;
    const n = 1024; c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    this.driveCurves.set(k, c); return c;
  }

  // tempo: linear ramp in time from bpmFrom to bpmTo over [rampT0, rampT1], sampled per 16th step
  private targetBpm(d: Deck) { return this.tempoOverride ?? d.track.sections[d.sec].bpm + this.tempoOffset; }
  private resetTempo(d: Deck, t = this.ctx.currentTime) { this.bpmNow = this.bpmFrom = this.bpmTo = this.targetBpm(d); this.rampT0 = this.rampT1 = t; }
  private retarget(ramp: number, d = this.deck) {
    if (!d) return;
    const t = Math.max(this.ctx.currentTime, d.next);
    this.bpmFrom = this.bpmNow; this.bpmTo = this.targetBpm(d); this.rampT0 = t; this.rampT1 = t + Math.max(0, ramp);
    if (ramp <= 0) this.bpmNow = this.bpmTo;
  }
  private advanceTempo(t: number) {
    if (this.bpmNow === this.bpmTo) return;
    const k = this.rampT1 <= this.rampT0 ? 1 : Math.min(1, Math.max(0, (t - this.rampT0) / (this.rampT1 - this.rampT0)));
    this.bpmNow = this.bpmFrom + (this.bpmTo - this.bpmFrom) * k;
  }

  private emitAt(type: MusicEventType, d: Deck, t: number) {
    const sec = d.track.sections[d.sec];
    this.emit({ type, time: t, track: d.track.def.id, section: sec.id, bar: Math.floor(d.step / 16), beat: 0, bpm: this.bpmNow });
  }
  private emitNow(type: MusicEventType) {
    this.dispatch({ type, time: this.ctx.currentTime, track: "", section: "", bar: 0, beat: 0, bpm: this.bpmNow }, false);
  }
  private emit(e: MusicEvent) { this.dispatch(e, true); this.evq.push(e); }
  private dispatch(e: MusicEvent, ahead: boolean) {
    if (!ahead) { if (e.type === "beat") this.lastBeat = e; if (e.type === "bar") this.heard = e; }
    for (const h of this.handlers) if (h.ahead === ahead && (h.type === "*" || h.type === e.type)) { try { h.fn(e); } catch (err) { console.error(err); } }
  }
  private startTimer() { if (this.autoTick && !this.timer) this.timer = setInterval(() => this.tick(), 25); }
  private stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  private fireStinger(def: StingerDef, t: number, d: Deck | null, end: boolean) {
    const sd = 60 / this.bpmNow / 4;
    let base: number, tones: number[];
    if (def.mode === "chord") {
      const name = d ? d.track.sections[d.sec].bars[Math.floor(d.step / 16)] : this.state.chord;
      const c = parseChord(name || "C"), root = (c.pc + this.transpose + 120) % 12;
      base = 60 + root; tones = c.iv;
    } else {
      const tr = d ? d.track : this.tracks[this.state.trackIndex];
      base = 60 + ((tr.tonic + this.transpose + 120) % 12); tones = [];
    }
    const P = this.patches[def.patch];
    for (const [st, idx, len, vel] of def.notes) {
      const midi = def.mode === "chord" ? base + tones[idx % tones.length] + 12 * Math.floor(idx / tones.length) : base + idx;
      if (P) this.fm(this.stgIn, t + st * sd, midi, len * sd * 0.95, P, vel ?? 1);
    }
    for (const s of def.kick ?? []) this.kick(this.stgDac, t + s * sd, 1);
    for (const s of def.snare ?? []) this.snare(this.stgDac, t + s * sd, 0.9);
    for (const s of def.crash ?? []) this.crash(this.stgIn, t + s * sd, 0.9);
    if (end && d) {
      const dur = def.len * sd;
      for (const x of [d, ...this.fading]) { x.group.gain.setValueAtTime(1, t); x.group.gain.linearRampToValueAtTime(0, t + dur * 0.6); }
      this.stopAt = t + dur + 0.1;
    }
  }

  // ------------------------------------------------------------ voices
  private playEv(d: Deck, e: Ev, t: number) {
    const bus = d.input[e.ch]; if (!bus) return;
    if (d.track.def.kit === "sega" && e.k !== "fm" && e.k !== "psg") { this.sample(bus, t, this.segaKit()[e.k], e.vel); return; }
    switch (e.k) {
      case "fm": { const p = this.patches[e.patch]; if (p) this.fm(bus, t, e.midi + this.transpose, e.len * (60 / this.bpmNow / 4) * e.gate, p, e.vel); break; }
      case "psg": this.psg(bus, t, e.midi + this.transpose, e.len * (60 / this.bpmNow / 4) * e.gate, e.vel); break;
      case "kick": this.kick(bus, t, e.vel); break;
      case "snare": this.snare(bus, t, e.vel); break;
      case "hat": this.hat(bus, t, e.vel, false); break;
      case "ohat": this.hat(bus, t, e.vel, true); break;
      case "crash": this.crash(bus, t, e.vel); break;
    }
  }
  private osc(type: OscillatorType = "sine", f = 0) { const o = this.ctx.createOscillator(); o.type = type; if (f) o.frequency.value = f; return o; }
  private fm(bus: AudioNode, t: number, midi: number, dur: number, P: FMPatch, vel: number) {
    const c = this.ctx, f = mtof(midi), u = P.unison || 1;
    dur = Math.max(dur, P.a + 0.02);
    const end = t + dur, stopAt = end + P.r * 6 + 0.02, pk = vel * P.vol / Math.sqrt(u);
    const out = c.createGain();
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(pk, t + P.a);
    out.gain.setTargetAtTime(pk * P.s, t + P.a, P.d); out.gain.setTargetAtTime(0, end, P.r);
    out.connect(bus);
    const nodes: OscillatorNode[] = [];
    const mod = this.osc(P.modType, f * P.ratio), mg = c.createGain();
    mg.gain.setValueAtTime(P.index * f, t); mg.gain.setTargetAtTime(P.indexSus * f, t, P.indexDecay);
    mod.connect(mg); nodes.push(mod);
    let mg2: GainNode | null = null;
    if (P.ratio2) {
      const m2 = this.osc(P.mod2Type, f * P.ratio2); mg2 = c.createGain();
      mg2.gain.setValueAtTime((P.index2 ?? 0) * f, t); mg2.gain.setTargetAtTime((P.index2 ?? 0) * f * 0.3, t, P.indexDecay * 2);
      m2.connect(mg2); nodes.push(m2);
    }
    let lg: GainNode | null = null;
    if (P.vib && dur > P.vib.delay) {
      const lfo = this.osc("sine", P.vib.rate); lg = c.createGain();
      lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + P.vib.delay); lg.gain.linearRampToValueAtTime(P.vib.depth, t + P.vib.delay + 0.25);
      lfo.connect(lg); nodes.push(lfo);
    }
    for (let i = 0; i < u; i++) {
      const car = this.osc("sine", f);
      if (u > 1) car.detune.value = (i - (u - 1) / 2) * (P.spread || 0);
      mg.connect(car.frequency); if (mg2) mg2.connect(car.frequency); if (lg) lg.connect(car.detune);
      car.connect(out); nodes.push(car);
    }
    for (const n of nodes) { n.start(t); n.stop(stopAt); }
    nodes[nodes.length - 1].onended = () => { try { out.disconnect(); } catch { /* ignore */ } };
  }
  /** SN76489 square: 10-bit divider pitch quantisation, 60 Hz stepped 2 dB attack/release envelope. */
  private psg(bus: AudioNode, t: number, midi: number, dur: number, vel: number) {
    const f = mtof(midi), div = Math.max(1, Math.round(3579545 / 32 / f));
    const o = this.osc("square", 3579545 / 32 / div), g = this.ctx.createGain(), vol = 0.16 * vel, fr = 1 / 60;
    dur = Math.max(dur, 3 * fr);
    g.gain.setValueAtTime(0, t);
    [15, 14, 14, 13].forEach((v, k) => g.gain.setValueAtTime(vol * PSG_LV(v), t + k * fr));
    [11, 9, 7, 5, 3, 0].forEach((v, k) => g.gain.setValueAtTime(vol * PSG_LV(v), t + dur + k * fr));
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 7 * fr);
    o.onended = () => { try { g.disconnect(); } catch { /* ignore */ } };
  }
  /** Mega Drive-style drum samples: rendered once, hard-compressed, held at ~13 kHz and quantised to 8 bits like a DAC sample. */
  private kitBufs: Record<"kick" | "snare" | "hat" | "ohat" | "crash", AudioBuffer> | null = null;
  private segaKit() {
    if (this.kitBufs) return this.kitBufs;
    const sr = this.ctx.sampleRate, hold = Math.max(1, Math.round(sr / 13300));
    let seed = 0x5eed; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
    const make = (secs: number, fn: (t: number, n: number) => number, drive: number) => {
      const len = Math.ceil(secs * sr), b = this.ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
      let held = 0, prevN = 0;
      for (let i = 0; i < len; i++) {
        if (i % hold === 0) { const n = rnd(); const hp = n - prevN; prevN = n; held = Math.round(Math.tanh(drive * fn(i / sr, hp * 0.5)) / Math.tanh(drive) * 127) / 127; }
        d[i] = held * Math.min(1, (len - i) / (sr * 0.004));
      }
      return b;
    };
    let ph = 0, ph2 = 0;
    const kick = make(0.2, (t, n) => { const f = 55 + 190 * Math.exp(-t / 0.025); ph += 2 * Math.PI * f / 13300; return Math.sin(ph) * Math.exp(-t / 0.09) + n * 1.2 * Math.exp(-t / 0.004); }, 2.6);
    const snare = make(0.17, (t, n) => { ph2 += 2 * Math.PI * (180 + 60 * Math.exp(-t / 0.02)) / 13300; return 0.7 * Math.sin(ph2) * Math.exp(-t / 0.04) + 1.1 * n * Math.exp(-t / 0.06); }, 3.2);
    const hat = make(0.05, (t, n) => n * Math.exp(-t / 0.012), 2);
    const ohat = make(0.2, (t, n) => n * Math.exp(-t / 0.07), 2);
    const crash = make(1.1, (t, n) => n * (0.6 * Math.exp(-t / 0.35) + 0.4 * Math.exp(-t / 0.05)), 1.8);
    return (this.kitBufs = { kick, snare, hat, ohat, crash });
  }
  private sample(bus: AudioNode, t: number, buf: AudioBuffer, v: number) {
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); s.buffer = buf; g.gain.value = 0.8 * v;
    s.connect(g); g.connect(bus); s.start(t); s.onended = () => { try { g.disconnect(); } catch { /* ignore */ } };
  }
  private noiseSrc(t: number, dur: number) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.start(t, Math.random() * 0.8); s.stop(t + dur); return s; }
  private decay(t: number, v: number, dur: number) { const g = this.ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); return g; }
  private filt(type: BiquadFilterType, f: number, q?: number) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; }
  private kick(bus: AudioNode, t: number, v: number) {
    const o = this.osc("sine"); o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    const g = this.decay(t, v, 0.3); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.32);
    const n = this.noiseSrc(t, 0.015), hp = this.filt("highpass", 2000), g2 = this.decay(t, 0.3 * v, 0.012); n.connect(hp); hp.connect(g2); g2.connect(bus);
  }
  private snare(bus: AudioNode, t: number, v: number) {
    const n = this.noiseSrc(t, 0.2), bp = this.filt("bandpass", 2000, 0.7), g = this.decay(t, 0.9 * v, 0.18); n.connect(bp); bp.connect(g); g.connect(bus);
    const o = this.osc("triangle"); o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const g2 = this.decay(t, 0.5 * v, 0.09); o.connect(g2); g2.connect(bus); o.start(t); o.stop(t + 0.1);
  }
  private hat(bus: AudioNode, t: number, v: number, open: boolean) {
    const d = open ? 0.16 : 0.035, n = this.noiseSrc(t, d + 0.02), hp = this.filt("highpass", 7000), g = this.decay(t, 0.6 * v, d);
    n.connect(hp); hp.connect(g); g.connect(bus);
  }
  private crash(bus: AudioNode, t: number, v: number) {
    const n = this.noiseSrc(t, 1.35), hp = this.filt("highpass", 4200), g = this.decay(t, 0.5 * v, 1.3);
    n.connect(hp); hp.connect(g); g.connect(bus);
  }
}
