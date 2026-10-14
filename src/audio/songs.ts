// STARFALL 101 soundtrack: "Starfall Overdrive" in E minor. Five stages that intensify as players drop out;
// final 10 = boss-fight theme; final duel = the same theme, climactic variation.
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

// E minor progression i - VI - VII - V
const PROG = [{ tri: [64, 67, 71], bass: 0 }, { tri: [60, 64, 67], bass: -4 }, { tri: [62, 66, 69], bass: -2 }, { tri: [59, 63, 66], bass: -5 }];

const BASS_A = "E2 . E3 . E2 . E3 . E2 . E3 . D3 . E3 .";
const BASS_B = "E2 E2 E3 E2 - E2 E3 E2 E2 E2 E3 E2 D3 E2 B2 E3";
const BASS_C = "E2 E2 E3 E2 E2 E3 D3 E2 E2 E2 E3 E2 G2 A2 B2 D3";
// All percussion is DAC PCM (mono, layered hits premixed): k kick, s snare, h/o hats, c crash, t/u toms, p clap
const DRUMS = [
  "k . h . s . h . k . k h s . h .",
  "k h h k s h h h k h k h s h o h",
  "k h o k s+h h h k k h k h s h s o",
  "k+h h k h s+h h k k k+h h k h s s+p k s",
];
const FILL = "k . s . s s . s u u t t s s'7 s s";
const LEAD = [
  "E5 . . B4 . . E5 . F#5 . G5 . F#5 . E5 D5", "E5 . . . . . G5 . . . A5 . G5 . E5 .",
  "F#5 . . D5 . . F#5 . A5 . . . B5 . A5 .", "F#5 . . . . . . . D#5 . F#5 . B5 . . .",
  "B5 . . A5 . . G5 . A5 . B5 . D6 . B5 .", "C6 . . B5 . . G5 . . . E5 . G5 . C6 .",
  "D6 . . C6 . . A5 . F#5 . A5 . D6 . E6 .", "D#6 . . . B5 . . . F#5 . A5 . B5 . . -",
];
const ARP_IDX = [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 2, 1, 2, 3];

// ---------- BOSS THEME (final 10) + FINAL DUEL variation ----------
// 16 bars: A = call/response hook over Em-C-D-B (x2, second answer climbs, fill only at the phrase end),
//          B = Am-Em-C-B / C-D-B-B bridge that lifts to E6 and runs back into the hook.
const CH: Record<string, { tri: number[]; bass: number }> = {
  Em: { tri: [64, 67, 71], bass: 0 }, C: { tri: [60, 64, 67], bass: -4 }, D: { tri: [62, 66, 69], bass: -2 },
  B: { tri: [59, 63, 66], bass: -5 }, Am: { tri: [69, 72, 76], bass: 5 },
};
const BOSS_CHORDS = ["Em", "C", "D", "B", "Em", "C", "D", "B", "Am", "Em", "C", "B", "C", "D", "B", "B"];
const HOOK = [
  "E5 . . . B5 . . . A5 . G5 . F#5 . G5 .",      // call
  "E5 . . . . . . . - . G5 . A5 . B5 .",
  "A5 . . . F#5 . . . D5 . E5 . F#5 . A5 .",      // response
  "F#5 . . . . . . . D#5 . . . B4 . . .",
  "E5 . . . B5 . . . A5 . G5 . F#5 . G5 .",      // call
  "E5 . . . . . . . - . G5 . A5 . B5 .",
  "C6 . . . B5 . . . A5 . B5 . C6 . D6 .",        // response climbs
  "B5 . . . . . . . F#5 G5 A5 B5 C6 B5 A5 F#5",   // phrase-end fill
  "C6 . . . B5 . . . A5 . . . E5 . . .",          // bridge
  "G5 . . . F#5 . . . E5 . . . B4 . . .",
  "E5 . G5 . C6 . . . B5 . A5 . G5 . E5 .",
  "F#5 . . . . . . . - . B4 . D#5 . F#5 .",
  "G5 . . . A5 . . . B5 . . . E6 . . .",
  "D6 . . . C6 . B5 . A5 . . . F#5 . A5 .",
  "B5 . . . . . . . . . . . . . . .",
  "B5 A5 G5 F#5 E5 F#5 G5 A5 B5 C6 D#6 E6 F#6 . D#6 .", // run back into the hook
];
/** Diatonic third below in E minor (D# over the B chord). */
function third(line: string, chordName: string) {
  const pcs = chordName === "B" ? [4, 6, 7, 9, 11, 0, 3] : [4, 6, 7, 9, 11, 0, 2];
  return toks(line).map(tk => { const m = noteMidi(tk); if (m < 0) return tk; let d = pcs.indexOf(((m % 12) + 12) % 12);
    if (d < 0) return midiName(m - 3); const tp = pcs[(d + 5) % 7]; let x = m - 1; while (((x % 12) + 12) % 12 !== tp) x--; return midiName(x); }).join(" ");
}
const BOSS_BASS = "E2 . E2 E3 E2 . E2 E3 E2 . E2 E3 E2 . E3 E2";
const DUEL_BASS = "E2 E2 E3 E2 E2 E2 E3 E2 E2 E2 E3 E2 E2 E3 E2 E3";
const BOSS_DRUM = "k+h h s+h h k+h h s+h k k+h h s+h h k+h k s+o h";
const DUEL_DRUM = "k+h k s+h k k+h k s+h k k+h k s+h k k s+h s+p s";
const BOSS_FILL = "k . s . s s . s u u t t s s s+p s";

const patterns: Record<string, Pattern> = {};
function stagePatterns(s: number) {
  const names: string[] = [];
  for (let b = 0; b < 8; b++) {
    const c = PROG[b % 4], p: Pattern = {};
    let drums = DRUMS[s]; if (b === 7) drums = FILL; if (b === 0 || (s >= 3 && b === 4)) drums = crash(drums);
    p.dac = drums;
    p.bass = T(s === 0 ? BASS_A : s === 1 ? BASS_B : BASS_C, c.bass);
    p.pad = s === 0 ? rhythm("X . . . . . X . . . X . . . . .", chord(c.tri)) : rhythm("X . . X . . X . . . X . X . . .", chord(c.tri));
    if (s >= 1) p.psg1 = arp(c.tri, ARP_IDX, 12);
    if (s >= 2) p.lead = LEAD[b];
    if (s >= 3) { p.harm = T(LEAD[b], -5); p.psg2 = shift(LEAD[b], 3); p.brass = rhythm("- - X . - - X . - - X . - X . .", chord([c.tri[0] - 12, c.tri[2] - 12])); }
    const name = `s${s}b${b}`; patterns[name] = p; names.push(name);
  }
  return names;
}
function bossPatterns(duel: boolean) {
  const names: string[] = [];
  for (let b = 0; b < 16; b++) {
    // duel: the hook twice, second time modulated up a whole step (climactic key change), harmonized throughout
    const k = duel ? b % 8 : b, up = duel && b >= 8 ? 2 : 0, cn = BOSS_CHORDS[k], c = CH[cn], p: Pattern = {};
    const phraseEnd = duel ? b === 7 || b === 15 : b === 7 || b === 15;
    let drums = duel ? DUEL_DRUM : BOSS_DRUM; if (phraseEnd) drums = BOSS_FILL;
    if (duel ? b % 2 === 0 : b % 4 === 0) drums = crash(drums);
    p.dac = drums;
    p.bass = T(duel ? DUEL_BASS : BOSS_BASS, c.bass + up);
    p.lead = T(HOOK[k], up);
    if (duel || (b >= 4 && b < 8) || b >= 12) p.harm = T(third(HOOK[k], cn), up);
    p.pad = T(rhythm("X . . . . . . . X . . . . . . .", chord(c.tri.map(n => n - 12))), up);
    p.brass = T(rhythm(duel ? "X . . X . . X . . . X . X . . ." : "X . . . . . X . . . . . X . . .", chord([c.tri[0] - 24, c.tri[0] - 17, c.tri[0] - 12])), up);
    p.psg1 = T(arp(c.tri, [0, 1, 2, 1, 0, 1, 2, 3], 12).split(" ").map(x => x + " .").join(" "), up); // calm 8th-note arps under the hook
    const name = `${duel ? "duel" : "boss"}b${b}`; patterns[name] = p; names.push(name);
  }
  return names;
}
const orders = [0, 1, 2, 3].map(stagePatterns);

export const SONG: Song = {
  patches: P, patterns,
  channels: [ // 5 FM + FM channel 6 in DAC mode, plus SN76489 PSG tone channels. Genesis-style panning.
    { name: "bass", type: "fm", patch: "slapBass", vol: 0.95, pan: 0, gate: 0.8 },
    { name: "lead", type: "fm", patch: "leadBrass", vol: 0.8, pan: 0.15 },
    { name: "harm", type: "fm", patch: "leadBrass", vol: 0.42, pan: -0.55 },
    { name: "pad", type: "fm", patch: "ePiano", vol: 0.45, pan: 0.45 },
    { name: "brass", type: "fm", patch: "stab", vol: 0.5, pan: -0.3, gate: 0.6 },
    { name: "dac", type: "dac", vol: 0.9, pan: 0 },
    { name: "psg1", type: "psg", vol: 0.45, pan: 0.6, env: "pluck" },
    { name: "psg2", type: "psg", vol: 0.35, pan: -0.6, env: "sustain" },
  ],
  stages: [
    { name: "LAUNCH", bpm: 150, order: orders[0] },
    { name: "PURSUIT", bpm: 156, order: orders[1] },
    { name: "ASSAULT", bpm: 164, order: orders[2] },
    { name: "OVERDRIVE", bpm: 172, order: orders[3] },
    { name: "FINAL BOSS", bpm: 186, order: bossPatterns(false), patches: { bass: "heavyBass", lead: "leadBrass", harm: "leadBrass" } },
    { name: "FINAL DUEL", bpm: 194, order: bossPatterns(true), patches: { bass: "heavyBass", lead: "leadBrass", harm: "shred" } },
  ],
};
