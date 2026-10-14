// STARFALL 101 soundtrack: "Starfall Overdrive" in E minor. Five stages that intensify as players drop out;
// the last stage is the boss-fight tune (also used for the final duel, with a tempo boost).
import { Patch } from "./genesis";
import { Song, Pattern, noteMidi, midiName } from "./sequencer";

// ---------- FM patches (YM2612-style: alg, fb, 4 ops {mul, tl, ar, dr, sl, sr, rr, dt}) ----------
const P: Record<string, Patch> = {
  slapBass: { name: "SLAP BASS", alg: 4, fb: 5, vol: 1.15, ops: [
    { mul: 1, tl: 0.95, ar: 0.001, dr: 0.10, sl: 0.25, rr: 0.04 }, { mul: 1, tl: 1, ar: 0.001, dr: 0.22, sl: 0.55, sr: 1.5, rr: 0.05 },
    { mul: 3, tl: 0.35, ar: 0.001, dr: 0.05, sl: 0.1, rr: 0.04 }, { mul: 0.5, tl: 0.7, ar: 0.001, dr: 0.3, sl: 0.7, sr: 2, rr: 0.05 }] },
  heavyBass: { name: "HEAVY BASS", alg: 0, fb: 6, vol: 1.3, ops: [
    { mul: 1, tl: 0.7, ar: 0.001, dr: 0.3, sl: 0.6, rr: 0.05 }, { mul: 2, tl: 0.55, ar: 0.001, dr: 0.12, sl: 0.4, rr: 0.05 },
    { mul: 1, tl: 0.6, ar: 0.001, dr: 0.2, sl: 0.5, rr: 0.05 }, { mul: 0.5, tl: 1, ar: 0.001, dr: 0.35, sl: 0.75, sr: 2, rr: 0.06 }] },
  leadBrass: { name: "SAW LEAD", alg: 4, fb: 6, vol: 0.85, ops: [
    { mul: 1, tl: 0.8, ar: 0.008, dr: 0.3, sl: 0.75, rr: 0.1 }, { mul: 1, tl: 1, ar: 0.005, dr: 0.4, sl: 0.85, sr: 4, rr: 0.12 },
    { mul: 2, tl: 0.45, ar: 0.01, dr: 0.25, sl: 0.6, rr: 0.1, dt: 9 }, { mul: 1, tl: 0.7, ar: 0.006, dr: 0.4, sl: 0.8, sr: 4, rr: 0.12, dt: -8 }] },
  shred: { name: "SHRED LEAD", alg: 3, fb: 7, vol: 0.8, ops: [
    { mul: 1, tl: 0.9, ar: 0.002, dr: 0.2, sl: 0.8, rr: 0.06 }, { mul: 2, tl: 0.5, ar: 0.002, dr: 0.15, sl: 0.6, rr: 0.06 },
    { mul: 3, tl: 0.3, ar: 0.002, dr: 0.1, sl: 0.4, rr: 0.05, dt: 5 }, { mul: 1, tl: 1, ar: 0.002, dr: 0.3, sl: 0.85, sr: 3, rr: 0.08 }] },
  ePiano: { name: "E.PIANO", alg: 4, fb: 0, vol: 0.55, ops: [
    { mul: 7, tl: 0.25, ar: 0.001, dr: 0.12, sl: 0.0, rr: 0.1 }, { mul: 1, tl: 1, ar: 0.002, dr: 0.6, sl: 0.4, sr: 2.5, rr: 0.25 },
    { mul: 1, tl: 0.5, ar: 0.001, dr: 0.4, sl: 0.3, rr: 0.2 }, { mul: 1, tl: 0.8, ar: 0.002, dr: 0.8, sl: 0.5, sr: 3, rr: 0.3, dt: 6 }] },
  stab: { name: "BRASS STAB", alg: 4, fb: 5, vol: 0.6, ops: [
    { mul: 1, tl: 0.85, ar: 0.004, dr: 0.12, sl: 0.4, rr: 0.06 }, { mul: 1, tl: 1, ar: 0.003, dr: 0.18, sl: 0.5, rr: 0.08 },
    { mul: 1, tl: 0.6, ar: 0.004, dr: 0.15, sl: 0.4, rr: 0.06, dt: 12 }, { mul: 2, tl: 0.6, ar: 0.003, dr: 0.18, sl: 0.5, rr: 0.08, dt: -10 }] },
  bell: { name: "SYNC BELL", alg: 5, fb: 3, vol: 0.5, ops: [
    { mul: 4, tl: 0.35, ar: 0.001, dr: 0.2, sl: 0.2, rr: 0.1 }, { mul: 1, tl: 1, ar: 0.001, dr: 0.25, sl: 0.3, rr: 0.15 },
    { mul: 2, tl: 0.6, ar: 0.001, dr: 0.2, sl: 0.2, rr: 0.12 }, { mul: 4, tl: 0.3, ar: 0.001, dr: 0.15, sl: 0.1, rr: 0.1 }] },
};

// ---------- pattern helpers ----------
const toks = (s: string) => s.trim().split(/\s+/);
const T = (line: string, semis: number) => toks(line).map(tk => tk.split("+").map(n => { const q = n.indexOf("'"), base = q >= 0 ? n.slice(0, q) : n, m = noteMidi(base); return m < 0 ? n : midiName(m + semis) + (q >= 0 ? n.slice(q) : ""); }).join("+")).join(" ");
const chord = (ns: number[]) => ns.map(midiName).join("+");
const rhythm = (r: string, x: string) => toks(r).map(t => t === "X" ? x : t).join(" ");
const arp = (tri: number[], idx: number[], oct: number) => idx.map(i => midiName(i === 3 ? tri[0] + 12 + oct : tri[i] + oct)).join(" ");
const shift = (line: string, n: number) => { const a = toks(line); return [...Array(n).fill("-"), ...a.slice(0, 16 - n)].join(" "); };
const crash = (d: string) => { const a = toks(d); a[0] = a[0] + "+c"; return a.join(" "); };
const FILL = "k . s . s s . s s s k s s'7 s'8 s s";

// E minor progression i - VI - VII - V for stages 0-3; boss: i - bII - bIII - II (Phrygian menace)
const PROG = [{ tri: [64, 67, 71], bass: 0 }, { tri: [60, 64, 67], bass: -4 }, { tri: [62, 66, 69], bass: -2 }, { tri: [59, 63, 66], bass: -5 }];
const BOSSP = [{ tri: [64, 67, 71], bass: 0 }, { tri: [65, 69, 72], bass: 1 }, { tri: [67, 71, 74], bass: 3 }, { tri: [66, 70, 73], bass: 2 }];

const BASS_A = "E2 . E3 . E2 . E3 . E2 . E3 . D3 . E3 .";
const BASS_B = "E2 E2 E3 E2 - E2 E3 E2 E2 E2 E3 E2 D3 E2 B2 E3";
const BASS_C = "E2 E2 E3 E2 E2 E3 D3 E2 E2 E2 E3 E2 G2 A2 B2 D3";
const BASS_BOSS = "E2 E2 E2 E3 E2 E2 E3 E2 E2 E2 E3 E2 G2 E2 A#2 B2";
const DRUMS = [
  "k . h . s . h . k . k h s . h .",
  "k . h k s . h . k . k h s . h h",
  "k h h k s h h k k h k h s h s h",
  "k h k h s h k k k h k h s s k s",
];
const DRUM_BOSS = "k h s h k k s h k h s h k s k s";
const HATS = "h h'5 o h'5 h h'5 o h'5 h h'5 o h'5 h h'5 o h";
const LEAD = [
  "E5 . . B4 . . E5 . F#5 . G5 . F#5 . E5 D5", "E5 . . . . . G5 . . . A5 . G5 . E5 .",
  "F#5 . . D5 . . F#5 . A5 . . . B5 . A5 .", "F#5 . . . . . . . D#5 . F#5 . B5 . . .",
  "B5 . . A5 . . G5 . A5 . B5 . D6 . B5 .", "C6 . . B5 . . G5 . . . E5 . G5 . C6 .",
  "D6 . . C6 . . A5 . F#5 . A5 . D6 . E6 .", "D#6 . . . B5 . . . F#5 . A5 . B5 . . -",
];
const BOSS_LEAD = [
  "E5 F#5 G5 A5 B5 A5 G5 F#5 E5 F#5 G5 B5 E6 . D#6 .", "F5 G5 A5 C6 F6 . E6 C6 A5 C6 E6 F6 A6 . G6 F6",
  "G5 A5 B5 D6 G6 F#6 D6 B5 G5 B5 D6 G6 B6 . A6 G6", "F#5 A#5 C#6 F#6 E6 C#6 A#5 C#6 D#6 F#6 A6 . B6 A6 F#6 D#6",
  "E6 . B5 . G5 . B5 E6 G6 . F#6 E6 D#6 . B5 .", "F6 . C6 . A5 . C6 F6 A6 . G6 F6 E6 . C6 .",
  "G6 . D6 . B5 . D6 G6 B6 . A6 G6 F#6 . D6 .", "E6 D#6 C6 B5 A5 G5 F#5 E5 D#5 E5 F#5 G5 A5 B5 C6 D#6",
];
const ARP_IDX = [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 2, 1, 2, 3];

const patterns: Record<string, Pattern> = {};
function stagePatterns(s: number) {
  const names: string[] = [];
  for (let b = 0; b < 8; b++) {
    const boss = s === 4, c = (boss ? BOSSP : PROG)[b % 4], p: Pattern = {};
    let drums = boss ? DRUM_BOSS : DRUMS[s]; if (b === 7) drums = FILL; if (b === 0 || (s >= 3 && b === 4)) drums = crash(drums);
    p.dac = drums;
    if (boss) {
      p.bass = T(BASS_BOSS, c.bass);
      p.lead = BOSS_LEAD[b];
      p.harm = T(BOSS_LEAD[b], -12);
      p.pad = rhythm("X . . . . . . . X . . . . . . .", chord(c.tri.map(n => n - 12)));
      p.brass = rhythm("X . . X . . X . X . . X . . X .", chord([c.tri[0] - 24, c.tri[0] - 17, c.tri[0] - 12]));
      p.psg1 = arp(c.tri, ARP_IDX, 12); p.psg2 = shift(BOSS_LEAD[b], 2); p.noise = toks(HATS).map(() => "h").join(" ");
    } else {
      p.bass = T(s === 0 ? BASS_A : s === 1 ? BASS_B : BASS_C, c.bass);
      p.pad = s === 0 ? rhythm("X . . . . . X . . . X . . . . .", chord(c.tri)) : rhythm("X . . X . . X . . . X . X . . .", chord(c.tri));
      if (s >= 1) { p.psg1 = arp(c.tri, ARP_IDX, 12); p.noise = HATS; }
      if (s >= 2) p.lead = LEAD[b];
      if (s >= 3) { p.harm = T(LEAD[b], -5); p.psg2 = shift(LEAD[b], 3); p.brass = rhythm("- - X . - - X . - - X . - X . .", chord([c.tri[0] - 12, c.tri[2] - 12])); }
    }
    const name = `s${s}b${b}`; patterns[name] = p; names.push(name);
  }
  return names;
}
const orders = [0, 1, 2, 3, 4].map(stagePatterns);

export const SONG: Song = {
  patches: P, patterns,
  channels: [ // 5 FM + channel-6 DAC, plus SN76489 PSG (2 tone + noise). Genesis-style hard-ish panning.
    { name: "bass", type: "fm", patch: "slapBass", vol: 0.95, pan: 0, gate: 0.8 },
    { name: "lead", type: "fm", patch: "leadBrass", vol: 0.75, pan: 0.15 },
    { name: "harm", type: "fm", patch: "leadBrass", vol: 0.42, pan: -0.55 },
    { name: "pad", type: "fm", patch: "ePiano", vol: 0.5, pan: 0.45 },
    { name: "brass", type: "fm", patch: "stab", vol: 0.55, pan: -0.3, gate: 0.6 },
    { name: "dac", type: "dac", vol: 0.95, pan: 0 },
    { name: "psg1", type: "psg", vol: 0.55, pan: 0.6, env: "pluck" },
    { name: "psg2", type: "psg", vol: 0.35, pan: -0.6, env: "sustain" },
    { name: "noise", type: "noise", vol: 0.5, pan: 0.25 },
  ],
  stages: [
    { name: "LAUNCH", bpm: 150, order: orders[0] },
    { name: "PURSUIT", bpm: 156, order: orders[1] },
    { name: "ASSAULT", bpm: 164, order: orders[2] },
    { name: "OVERDRIVE", bpm: 172, order: orders[3] },
    { name: "FINAL BOSS", bpm: 186, order: orders[4], patches: { bass: "heavyBass", lead: "shred", harm: "shred" } },
  ],
};
