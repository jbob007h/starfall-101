// STARFALL 101 second soundtrack: "THUNDER BLITZ" — Mega Drive hard-rock / fusion FM in the Technosoft style
// (original material). Eight sections that intensify as the field shrinks; each is twice the length of its
// counterpart in the original soundtrack (16 bars, boss + duel 32 bars). Key journey: Am -> Bm -> Cm -> Dm/Em ->
// build -> Em boss (modulating to F#m) -> duel (Em -> F#m climax).
import { Patch } from "./genesis";
import { Song, Pattern, noteMidi, midiName } from "./sequencer";

// ---------- FM patches (YM2612-style) ----------
const P: Record<string, Patch> = {
  // Overdriven FM guitar: fb 7 saw-ish op1 into detuned carriers; the channel's amp/cab shaper does the rest.
  gtrLead: { name: "OD GUITAR LEAD", alg: 4, fb: 7, vol: 0.9, bendTime: 0.11, vib: { rate: 5.6, depth: 24, delay: 0.2 }, ops: [
    { mul: 1, tl: 0.95, ar: 0.002, dr: 0.4, sl: 0.8, rr: 0.08 }, { mul: 1, tl: 1, ar: 0.003, dr: 0.6, sl: 0.85, sr: 6, rr: 0.1 },
    { mul: 2, tl: 0.6, ar: 0.002, dr: 0.35, sl: 0.7, rr: 0.08, dt: 7 }, { mul: 1, tl: 0.85, ar: 0.003, dr: 0.6, sl: 0.85, sr: 6, rr: 0.1, dt: -7 }] },
  gtrTwin: { name: "OD GUITAR TWIN", alg: 4, fb: 6, vol: 0.85, bendTime: 0.11, vib: { rate: 5.2, depth: 20, delay: 0.24 }, ops: [
    { mul: 1, tl: 0.9, ar: 0.002, dr: 0.4, sl: 0.8, rr: 0.08 }, { mul: 1, tl: 1, ar: 0.003, dr: 0.6, sl: 0.85, sr: 6, rr: 0.1 },
    { mul: 3, tl: 0.35, ar: 0.002, dr: 0.3, sl: 0.6, rr: 0.08, dt: -5 }, { mul: 2, tl: 0.6, ar: 0.003, dr: 0.6, sl: 0.8, sr: 6, rr: 0.1, dt: 6 }] },
  // Palm-muted rhythm guitar (power chords through heavy drive)
  gtrRhythm: { name: "OD RHYTHM GTR", alg: 0, fb: 6, vol: 0.9, ops: [
    { mul: 1, tl: 0.8, ar: 0.001, dr: 0.2, sl: 0.6, rr: 0.04 }, { mul: 1, tl: 0.6, ar: 0.001, dr: 0.15, sl: 0.5, rr: 0.04 },
    { mul: 2, tl: 0.4, ar: 0.001, dr: 0.12, sl: 0.5, rr: 0.04 }, { mul: 1, tl: 1, ar: 0.001, dr: 0.25, sl: 0.55, sr: 1.2, rr: 0.05 }] },
  pickBass: { name: "PICK BASS", alg: 4, fb: 5, vol: 1.2, ops: [
    { mul: 1, tl: 0.9, ar: 0.001, dr: 0.07, sl: 0.3, rr: 0.03 }, { mul: 1, tl: 1, ar: 0.001, dr: 0.18, sl: 0.6, sr: 1.4, rr: 0.04 },
    { mul: 5, tl: 0.25, ar: 0.001, dr: 0.04, sl: 0.0, rr: 0.03 }, { mul: 0.5, tl: 0.75, ar: 0.001, dr: 0.25, sl: 0.7, sr: 2, rr: 0.04 }] },
  slapBass: { name: "FUSION SLAP", alg: 4, fb: 6, vol: 1.2, ops: [
    { mul: 2, tl: 0.9, ar: 0.001, dr: 0.06, sl: 0.15, rr: 0.03 }, { mul: 1, tl: 1, ar: 0.001, dr: 0.2, sl: 0.5, sr: 1.5, rr: 0.04 },
    { mul: 4, tl: 0.4, ar: 0.001, dr: 0.04, sl: 0.05, rr: 0.03 }, { mul: 0.5, tl: 0.7, ar: 0.001, dr: 0.28, sl: 0.65, sr: 2, rr: 0.05 }] },
  synArp: { name: "SYNC ARP", alg: 4, fb: 4, vol: 0.6, ops: [
    { mul: 3, tl: 0.5, ar: 0.001, dr: 0.09, sl: 0.2, rr: 0.05 }, { mul: 1, tl: 1, ar: 0.001, dr: 0.14, sl: 0.35, rr: 0.06 },
    { mul: 2, tl: 0.55, ar: 0.001, dr: 0.1, sl: 0.3, rr: 0.05, dt: 8 }, { mul: 2, tl: 0.6, ar: 0.001, dr: 0.12, sl: 0.3, rr: 0.06 }] },
};

// ---------- helpers ----------
const toks = (s: string) => s.trim().split(/\s+/);
const pcOf = (n: string) => ((noteMidi(n + "4") % 12) + 12) % 12;
/** Transpose a note line, keeping "^bend" / "'vel" suffixes. */
function T(line: string, s: number) {
  if (!s) return line;
  return toks(line).map(tk => tk.split("+").map(n => { const m = /^([A-G][#b]?-?\d)(.*)$/.exec(n); if (!m) return n; const v = noteMidi(m[1]); return v < 0 ? n : midiName(v + s) + m[2]; }).join("+")).join(" ");
}
interface Ch { root: number; minor: boolean; }
function chord(name: string, s = 0): Ch { const m = /^([A-G][#b]?)(m?)$/.exec(name)!; return { root: (pcOf(m[1]) + s + 120) % 12, minor: m[2] === "m" }; }
const inRange = (pc: number, lo: number) => lo + ((pc - lo) % 12 + 12) % 12;
const tri = (c: Ch, lo: number) => { const r = inRange(c.root, lo); return [r, r + (c.minor ? 3 : 4), r + 7]; };
/** Diatonic third below in natural minor of `key` (raised 7th over the V chord). Non-scale notes drop a minor third. */
function third(line: string, key: number, c: Ch) {
  const sc = [0, 2, 3, 5, 7, 8, 10].map(x => (x + key) % 12); if (!c.minor && c.root === (key + 7) % 12) sc[6] = (key + 11) % 12;
  return toks(line).map(tk => { const m = /^([A-G][#b]?-?\d)(.*)$/.exec(tk); if (!m) return tk; const v = noteMidi(m[1]), d = sc.indexOf(v % 12);
    if (d < 0) return midiName(v - 3) + m[2]; const tp = sc[(d + 5) % 7]; let x = v - 1; while (x % 12 !== tp) x--; return midiName(x) + m[2]; }).join(" ");
}
const shift = (line: string, n: number) => { const a = toks(line); return [...Array(n).fill("-"), ...a.slice(0, 16 - n)].join(" "); };
const strip = (line: string) => toks(line).map(t => t.replace(/\^-?\d+/, "")).join(" ");

const BASS: Record<string, string> = {
  eighth: "0 . 0 . 0 . 0 . 0 . 0 . 0 . 12 .",
  drive: "0 0 12 0 0 0 12 0 0 0 12 0 0 12 10 7",
  gallop: "0 . 0 0 0 . 0 0 0 . 0 0 12 . 10 7",
  slap: "0 . 12 0 - 0 12 - 0 7 12 - 0 . 10 12",
  boss: "0 0 12 0 0 0 12 0 0 0 12 0 7 0 10 12",
  pedal: "0 0 0 0 0 0 0 0 0 0 0 0 0 12 0 0",
  whole: "0 . . . . . . . 0 . . . . . . 12",
};
const GTR: Record<string, string> = {
  hold: "X . . . . . . . X . . . . . . .",
  riff: "X . x . x . X x . X . x X . x .",
  chug8: "X . x . X . x . X . x . X . x .",
  chug16: "X x x . X x x . X x x . X . X .",
  stab: "X . . X . . X . . . X . X . . .",
  boss: "X . x X . x X . X . x X . X . x",
  build: "X x x x X x x x X x x x X x X x",
  none: "- - - - - - - - - - - - - - - -",
};
const DR: Record<string, string> = {
  rock: "K . h . S . h . K . K . S . h .",
  rock2: "K h h K S h h h K h K h S h o h",
  drive: "K h K h S h K h K h K K S h o h",
  gallop: "K+h K K+h . S+h . K+h K . K K+h . S+h . o h",
  double: "K+h K K+h K S+h K K+h K K+h K K+h K S+h K K+o K",
  half: "K . h . h . h . S . h . h . h .",
  fusion: "K . h K . h S h . K h K S h K o",
  boss: "K+R h K h S+h h K+R K h K K+R h S+h h K S",
  duel: "K+R K S+h K K+R K S+h K K+R K S+h K K+R S S+h K",
  roll: "S'4 S'4 S'5 S'5 S'6 S'6 S'7 S'7 S'7 S'8 S'8 S'8 S S S S",
  fillA: "K . S . S S . S T T U U L L S S",
  fillB: "S S T T S S U U S S L L S S S S",
  fillC: "K S . S T . U . L . K+S . K+S K+S K+S K+S",
};
const crash = (d: string) => { const a = toks(d); a[0] = a[0] === "." || a[0] === "-" ? "c" : a[0] + "+c"; return a.join(" "); };
const bassLine = (c: Ch, style: string) => { const r = inRange(c.root, 33); return toks(BASS[style]).map(t => /^\d+$/.test(t) ? midiName(r + Number(t)) : t).join(" "); };
const gtrLine = (c: Ch, style: string) => { const r = inRange(c.root, 40), pc = [r, r + 7, r + 12].map(midiName).join("+");
  return toks(GTR[style]).map(t => t === "X" ? pc : t === "x" ? pc + "'6" : t).join(" "); };
const ARPS: Record<string, number[]> = {
  arp8: [0, -1, 1, -1, 2, -1, 3, -1, 2, -1, 1, -1, 2, -1, 3, -1],
  arp16: [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5, 4, 3],
  run: [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5],
  runDown: [6, 5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 0, 2],
};
const arpLine = (c: Ch, style: string, lo = 57) => { const t3 = tri(c, lo); return ARPS[style].map(i => i < 0 ? "-" : midiName(t3[i % 3] + 12 * Math.floor(i / 3))).join(" "); };

// ---------- themes (original) ----------
const INTRO = ["A4^2 . . . . . . . . . . . E5 . . .", "F5 . . . . . . . E5 . . . C5 . . .", "D5 . . . . . . . G5^2 . . . . . . .", "E5^2 . . . . . . . . . . . . . . -",
  "A5^2 . . . . . . . . . . . G5 . E5 .", "F5 . . . . . . . A5 . . . C6 . . .", "B5^2 . . . . . . . A5 . . . G5 . D5 .", "E5^2 . . . . . . . . . . . - . . -"];
const A_CH = ["Am", "F", "G", "Em", "Am", "F", "G", "E"];
const THEME_A = ["E5 . . . A5 . . . G5 . E5 . D5 . E5 .", "C5 . . . . . . . A4 . C5 . F5 . E5 .", "D5 . . . G5 . . . B5 . A5 . G5 . D5 .", "E5^2 . . . . . . . . . . . B4 C5 D5 E5",
  "A5 . . . G5 . E5 . A5 . . . C6 . B5 .", "A5 . . . F5 . . . C6 . . . A5 . F5 .", "G5 . A5 . B5 . D6 . . . C6 . B5 . G5 .", "G#5^1 . . . . . . . E5 F5 G#5 A5 B5 C6 D6 E6"];
const B_CH = ["Dm", "Am", "F", "C", "Dm", "Am", "Bb", "E"];
const THEME_B = ["F5 . . E5 . . D5 . A5 . . . F5 . D5 .", "E5 . . . C5 . . . A4 . C5 . E5 . A5 .", "A5 . . G5 . . F5 . C6 . . . A5 . F5 .", "G5^2 . . . . . . . E5 . G5 . C6 . E6 .",
  "D6 . . C6 . . A5 . F5 . A5 . D6 . F6 .", "E6^2 . . . . . C6 . A5 . . . E5 . A5 .", "F5 . . . Bb5 . . . D6 . C6 . Bb5 . F5 .", "G#5^2 . . . . . . . B5 . . . E6 . . -"];
const C_CH = ["Cm", "Ab", "Bb", "G", "Cm", "Ab", "Fm", "G"];
const THEME_C = ["G5 . Eb5 . C5 . Eb5 . G5 . . . C6 . Bb5 .", "Ab5 . . . G5 . Eb5 . C5 . . . Eb5 . Ab5 .", "Bb5 . . . D6 . . . F6 . Eb6 . D6 . Bb5 .", "B5^2 . . . . . . . G5 . B5 . D6 . F6 .",
  "Eb6 . . D6 . . C6 . G5 . . . Eb5 . G5 .", "C6 . . Bb5 . . Ab5 . Eb5 . . . C5 . Eb5 .", "F5 . Ab5 . C6 . F6 . Eb6 . D6 . C6 . Ab5 .", "G5^2 . . . . . . . D6 . B5 . G5 . D5 ."];
const D_CH = ["Gm", "A", "Dm", "Dm", "Bb", "C", "A", "A"];
const THEME_D = ["D5 . F5 G5 . Bb5 . A5 G5 . F5 . D5 . F5 G5", "A5 . . . C#6 . . . E6 . . . C#6 . A5 .", "D6 . . C6 . A5 . F5 G5 A5 . . . D5 . .", "F5^2 . . . . . . . E5 . F5 . A5 . D6 .",
  "D6 . . F6 . . D6 . Bb5 . C6 . D6 . F6 .", "E6^2 . . . . . C6 . G5 . C6 . E6 . G6 .", "F6 . E6 . C#6 . A5 . E5 . G5 . A5 . C#6 .", "E6^2 . . . . . . . C#6 D6 E6 F6 G6 F6 E6 C#6"];
const BUILD_CH = ["F", "F", "G", "G", "Ab", "Ab", "Bb", "B"];
const BUILD = ["C5^2 . . . . . . . . . . . A4 . C5 .", "F5 . . . . . . . E5 . . . C5 . . .", "D5^2 . . . . . . . . . . . B4 . D5 .", "G5 . . . . . . . F5 . . . D5 . . .",
  "Eb5^2 . . . . . . . . . . . C5 . Eb5 .", "Ab5 . . . . . . . G5 . . . Eb5 . . .", "F5^2 . . . . . . . D5 . F5 . Bb5 . D6 .", "D#6^2 . . . . . . . . . . . . . . -"];
const BA_CH = ["Em", "C", "D", "Bm", "Em", "C", "Am", "B"];
const BOSS_A = ["B4 . E5 . G5 . B5 . . . A5 . G5 . F#5 .", "G5 . . . E5 . . . C5 . E5 . G5 . C6 .", "A5 . . . F#5 . D5 . A5 . . . D6 . C6 .", "B5^2 . . . . . . . F#5 . . . D5 . F#5 .",
  "E6 . . . D6 . B5 . G5 . . . B5 . E6 .", "C6 . . . B5 . G5 . E5 . . . G5 . C6 .", "A5 . C6 . E6 . . . D6 . C6 . B5 . A5 .", "D#6^1 . . . . . . . B5 C6 D#6 E6 F#6 . . -"];
const BB_CH = ["C", "D", "Em", "Em", "Am", "C", "B", "B"];
const BOSS_B = ["G6 . . . E6 . . . C6 . . . G5 . . .", "F#6 . . . D6 . . . A5 . . . F#5 . . .", "G5 . . . B5 . . . E6 . . . G6 . . .", "F#6^2 . . . . . . . E6 . D6 . B5 . G5 .",
  "A5 . . . C6 . . . E6 . . . A6 . . .", "G6 . . . E6 . . . C6 . . . E6 . G6 .", "F#6^2 . . . . . . . . . . . D#6 . . .", "B5 A5 G5 F#5 E5 F#5 G5 A5 B5 C6 D#6 E6 F#6 G6 A6 B6"];
const BRK_CH = ["Em", "Em", "C", "C", "D", "D", "B", "B"];
const BREAK = [null, null, null, null, "B5^2 . . . . . . . . . . . A5 . G5 .", "A5^2 . . . . . . . . . . . F#5 . A5 .", "B5^2 . . . . . . . . . . . . . . .", "D#6^1 . . . . . . . F#6 . D#6 . B5 . F#5 ."];

// ---------- section builder ----------
interface Opt { mel: (string | null)[]; ch: string[]; s?: number; key: number; harm?: boolean | number[]; bass: string; gtr: string; drum: string | string[]; keys?: string | null; keysFrom?: number;
  echo?: boolean; pad?: boolean; fill?: string; crashEvery?: number; pedal?: string; arpLead?: boolean; }
const patterns: Record<string, Pattern> = {};
let pid = 0;
function phrase(o: Opt): string[] {
  const out: string[] = [], s = o.s ?? 0, key = (o.key + s) % 12;
  for (let b = 0; b < 8; b++) {
    const c = chord(o.ch[b], s), p: Pattern = {};
    let d = Array.isArray(o.drum) ? o.drum[b] : o.drum; if (b === 7 && o.fill) d = DR[o.fill]; else d = DR[d] ?? d;
    if (b === 0 || (o.crashEvery && b % o.crashEvery === 0)) d = crash(d);
    p.dac = d;
    p.bass = bassLine(o.pedal ? chord(o.pedal, s) : c, o.bass);
    p.gtr = gtrLine(c, o.gtr);
    const m = o.mel[b] ? T(o.mel[b]!, s) : null;
    if (o.arpLead && b < 7) p.lead = arpLine(c, b % 2 ? "runDown" : "run", 69);
    else if (m) p.lead = m;
    const harmOn = Array.isArray(o.harm) ? o.harm.includes(b) : o.harm;
    if (o.arpLead) { const t3 = tri(c, 64); p.harm = midiName(t3[1]) + "^1 . . . . . . . " + midiName(t3[2]) + " . . . . . . ."; }
    else if (m && harmOn) p.harm = third(m, key, c);
    if (o.keys && b >= (o.keysFrom ?? 0)) p.keys = arpLine(c, o.keys);
    if (o.echo && p.lead) p.psg1 = T(strip(shift(p.lead, 3)), 12);
    if (o.pad) p.psg2 = [midiName(tri(c, 76)[1]), ".", ".", ".", ".", ".", ".", ".", midiName(tri(c, 76)[0]), ".", ".", ".", ".", ".", ".", "."].join(" ");
    const name = `tf${pid++}`; patterns[name] = p; out.push(name);
  }
  return out;
}
const A = 9, Cn = 0, D = 2, E = 4;
const sections: { name: string; bpm: number; order: string[]; patches?: Record<string, string> }[] = [
  { name: "IGNITION", bpm: 148, order: [
    ...phrase({ mel: Array(8).fill(null), ch: A_CH, key: A, bass: "eighth", gtr: "riff", drum: "rock", keys: "arp8", keysFrom: 4, fill: "fillA" }),
    ...phrase({ mel: INTRO, ch: A_CH, key: A, bass: "eighth", gtr: "chug8", drum: "rock2", keys: "arp8", fill: "fillA" })] },
  { name: "STRIKE VECTOR", bpm: 154, order: [
    ...phrase({ mel: THEME_A, ch: A_CH, key: A, bass: "eighth", gtr: "chug8", drum: "rock2", keys: "arp8", fill: "fillA" }),
    ...phrase({ mel: THEME_B, ch: B_CH, key: A, bass: "drive", gtr: "chug8", drum: "drive", keys: "arp8", harm: [4, 5, 6, 7], fill: "fillB" })] },
  { name: "SKY RAIDER", bpm: 160, order: [
    ...phrase({ mel: THEME_A, ch: A_CH, s: 2, key: A, harm: true, bass: "gallop", gtr: "chug16", drum: "drive", keys: "arp16", fill: "fillA" }),
    ...phrase({ mel: THEME_B, ch: B_CH, s: 2, key: A, harm: true, bass: "gallop", gtr: "chug16", drum: "gallop", keys: "arp16", fill: "fillB", crashEvery: 4 })] },
  { name: "IRON TEMPEST", bpm: 166, order: [
    ...phrase({ mel: THEME_C, ch: C_CH, key: Cn, harm: true, bass: "gallop", gtr: "stab", drum: "gallop", keys: "arp16", echo: true, fill: "fillA" }),
    ...phrase({ mel: [...Array(7).fill(null), THEME_C[7]], ch: C_CH, key: Cn, arpLead: true, bass: "drive", gtr: "chug16", drum: "double", keys: null, fill: "fillB", crashEvery: 4 })] },
  { name: "LIGHTNING CORE", bpm: 172, order: [
    ...phrase({ mel: THEME_D, ch: D_CH, key: D, harm: [2, 3, 4, 5, 6, 7], bass: "slap", gtr: "stab", drum: "fusion", keys: "arp16", echo: true, fill: "fillA" }),
    ...phrase({ mel: THEME_D, ch: D_CH, s: 2, key: D, harm: true, bass: "slap", gtr: "chug16", drum: "drive", keys: "arp16", echo: true, pad: true, fill: "fillB", crashEvery: 4 })] },
  { name: "FINAL APPROACH", bpm: 178, order: [
    ...phrase({ mel: BUILD, ch: BUILD_CH, key: A, harm: [4, 5, 6, 7], pedal: "E", bass: "pedal", gtr: "build", drum: ["half", "half", "rock2", "rock2", "drive", "drive", "double", "roll"], keys: "arp16", keysFrom: 2, pad: true, crashEvery: 2 }),
    ...phrase({ mel: THEME_A, ch: A_CH, s: 2, key: A, harm: true, bass: "drive", gtr: "chug16", drum: "double", keys: "arp16", echo: true, pad: true, fill: "fillB", crashEvery: 4 })] },
  { name: "THUNDER EMPEROR", bpm: 188, order: [
    ...phrase({ mel: BOSS_A, ch: BA_CH, key: E, harm: [4, 5, 6, 7], bass: "boss", gtr: "boss", drum: "boss", keys: "arp16", fill: "fillC", crashEvery: 4 }),
    ...phrase({ mel: BOSS_B, ch: BB_CH, key: E, harm: true, bass: "boss", gtr: "boss", drum: "boss", keys: "arp16", echo: true, fill: "fillB", crashEvery: 2 }),
    ...phrase({ mel: BREAK, ch: BRK_CH, key: E, bass: "whole", gtr: "hold", drum: ["half", "half", "half", "half", "drive", "drive", "double", "roll"], keys: "run", pad: true, crashEvery: 4 }),
    ...phrase({ mel: BOSS_A, ch: BA_CH, s: 2, key: E, harm: true, bass: "boss", gtr: "boss", drum: "double", keys: "arp16", echo: true, pad: true, fill: "fillC", crashEvery: 2 })],
    patches: { bass: "pickBass" } },
  { name: "LAST STAND", bpm: 198, order: [
    ...phrase({ mel: BOSS_A, ch: BA_CH, key: E, harm: true, bass: "boss", gtr: "boss", drum: "duel", keys: "arp16", echo: true, fill: "fillC", crashEvery: 2 }),
    ...phrase({ mel: BOSS_B, ch: BB_CH, key: E, harm: true, bass: "drive", gtr: "build", drum: "duel", keys: "run", echo: true, pad: true, fill: "fillB", crashEvery: 2 }),
    ...phrase({ mel: THEME_A, ch: A_CH, s: 7, key: A, harm: true, bass: "gallop", gtr: "chug16", drum: "double", keys: "arp16", echo: true, fill: "fillA", crashEvery: 2 }),
    ...phrase({ mel: THEME_A, ch: A_CH, s: 9, key: A, harm: true, bass: "boss", gtr: "boss", drum: "duel", keys: "run", echo: true, pad: true, fill: "fillC", crashEvery: 2 })],
    patches: { harm: "gtrLead" } },
];

/** Player-count thresholds: section i plays while remaining > TF_THRESHOLDS[i]; at or below the last = boss section; duel = final section. */
export const TF_THRESHOLDS = [85, 70, 55, 40, 25, 10];

export const SONG_TF: Song = {
  name: "THUNDER BLITZ", patches: P, patterns, stages: sections,
  channels: [ // 5 FM + DAC + 2 PSG
    { name: "bass", type: "fm", patch: "pickBass", vol: 0.95, pan: 0, gate: 0.75 },
    { name: "lead", type: "fm", patch: "gtrLead", vol: 0.2, pan: 0.2, gate: 0.97, drive: 5, cab: 4800 },
    { name: "harm", type: "fm", patch: "gtrTwin", vol: 0.13, pan: -0.45, gate: 0.97, drive: 5, cab: 4400 },
    { name: "gtr", type: "fm", patch: "gtrRhythm", vol: 0.13, pan: -0.15, gate: 0.55, drive: 9, cab: 3600 },
    { name: "keys", type: "fm", patch: "synArp", vol: 0.4, pan: 0.5, gate: 0.7 },
    { name: "dac", type: "dac", vol: 0.95, pan: 0 },
    { name: "psg1", type: "psg", vol: 0.28, pan: 0.6, env: "pluck" },
    { name: "psg2", type: "psg", vol: 0.25, pan: -0.6, env: "sustain" },
  ],
};
// LIGHTNING CORE uses the fusion slap bass
SONG_TF.stages[4].patches = { bass: "slapBass" };
