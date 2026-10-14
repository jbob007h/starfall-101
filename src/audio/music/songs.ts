// Soundtrack: three original Thunder Force IV-inspired tracks for the FM engine (see engine.ts for the data format).
// Each track has three 8-bar sections (A/B/C). In the game each section loops on its own until the
// director (director.ts) cues another one, so sections double as intensity levels.
import type { FMPatch, TrackDef } from "./engine";

export const PATCHES: Record<string, FMPatch> = {
  brass:   { ratio: 1, index: 3.2, indexSus: 1.6, indexDecay: 0.15, ratio2: 2, index2: 0.5, a: 0.01, d: 0.35, s: 0.72, r: 0.12, vol: 0.55, vib: { depth: 16, rate: 5.6, delay: 0.22 } },
  guitar:  { ratio: 1, modType: "sawtooth", index: 2.2, indexSus: 1.3, indexDecay: 0.2, ratio2: 3, index2: 0.35, a: 0.004, d: 0.5, s: 0.66, r: 0.1, vol: 0.42, unison: 2, spread: 9, vib: { depth: 24, rate: 5.2, delay: 0.28 } },
  synth:   { ratio: 2, index: 2.4, indexSus: 1.4, indexDecay: 0.1, ratio2: 1, mod2Type: "square", index2: 0.6, a: 0.005, d: 0.25, s: 0.75, r: 0.1, vol: 0.5, vib: { depth: 14, rate: 6.2, delay: 0.18 } },
  slap:    { ratio: 1, index: 7, indexSus: 0.9, indexDecay: 0.06, ratio2: 2, index2: 1.2, a: 0.002, d: 0.18, s: 0.45, r: 0.04, vol: 0.9 },
  bell:    { ratio: 2, index: 3, indexSus: 0.3, indexDecay: 0.1, ratio2: 7, index2: 0.4, a: 0.002, d: 0.15, s: 0.15, r: 0.08, vol: 0.5 },
  strings: { ratio: 1, index: 1.4, indexSus: 1, indexDecay: 0.5, a: 0.18, d: 0.6, s: 0.85, r: 0.35, vol: 0.45, unison: 2, spread: 12, vib: { depth: 6, rate: 4.5, delay: 0.4 } },
  gtrStab: { ratio: 1, modType: "sawtooth", index: 2, indexSus: 1, indexDecay: 0.06, a: 0.003, d: 0.12, s: 0.3, r: 0.05, vol: 0.42 },
};

export const TRACKS: TrackDef[] = [
  {
    id: "aurora", title: "AURORA BREACH", stage: "Stage 1 · Open orbit", key: "E minor", bpm: 172,
    patches: { lead: "brass", arp: "bell", pad: "strings", stab: "gtrStab" }, shift: 0, drive: 0,
    echo: { steps: 3, vol: 0.32 },
    sections: [
      { id: "A", name: "Launch", chords: "Em C D Em Em C D D",
        melody: "E5-6 F#5-2 G5-4 B5-4 | C6-6 B5-2 G5-4 E5-4 | F#5-6 G5-2 A5-4 D6-4 | B5-12 _-4 | E5-6 F#5-2 G5-4 B5-4 | C6-4 D6-4 E6-6 D6-2 | D6-6 C6-2 B5-4 A5-4 | A5-8 F#5-4 D5-4",
        bass: "r.o.r.o.r.o.rro.", harm: ["pad"],
        drums: { k: "k.....k.k.......", s: "....s.......s...", h: "h.h.h.h.h.h.h.h." },
        fill: { s: "....s.......ssss" } },
      { id: "B", name: "Pursuit", chords: "Am Em C D Am Em B B",
        melody: "A5-3 C6-3 E6-2 D6-2 C6-2 B5-2 A5-2 | B5-6 G5-2 E5-8 | E5-3 G5-3 C6-2 B5-2 C6-2 D6-2 E6-2 | F#6-8 E6-4 D6-4 | A5-3 C6-3 E6-2 D6-2 C6-2 B5-2 C6-2 | E6-6 D6-2 B5-8 | F#5-4 B5-4 D#6-4 F#6-4 | F#6-12 _-4",
        bass: "r.r.o.r.r.r.o.ro", harm: ["arp"], arp: "up",
        drums: { k: "k.....k.k.....k.", s: "....s.......s...", h: "h.h.h.h.h.h.h.ho" },
        fill: { s: "....s...s.s.ssss" } },
      { id: "C", name: "Breakaway", chords: "C D Em Em C D B B",
        melody: "G5-4 C6-4 E6-6 D6-2 | D6-6 E6-2 F#6-8 | G6-12 F#6-2 E6-2 | B5-12 _-4 | G5-4 C6-4 E6-6 G6-2 | F#6-6 E6-2 D6-4 A6-4 | F#6-6 D#6-2 B5-8 | B5-4 A5-4 F#5-4 D#5-4",
        bass: "r.ror.ror.ror.ro", harm: ["arp", "pad"], arp: "updown",
        drums: { k: "k.k...k.k.k...k.", s: "....s.......s...", h: "hhhhhhhhhhhhhhhh" },
        fill: { k: "k.......k.......", s: "s.s.s.s.ssssssss" } },
    ],
  },
  {
    id: "hull", title: "HULL INTEGRITY", stage: "Stage 3 · Reactor corridor", key: "D minor", bpm: 140,
    patches: { lead: "guitar", arp: "bell", pad: "strings", stab: "gtrStab" }, shift: -12, drive: 2.6,
    echo: { steps: 3, vol: 0.3 },
    sections: [
      { id: "A", name: "Descent", chords: "Dm Dm Bb C Dm Dm Bb A",
        melody: "D5-4 _-2 D5-2 F5-4 A5-4 | G5-2 F5-2 E5-4 D5-8 | D5-4 _-2 D5-2 F5-4 Bb5-4 | A5-2 G5-2 E5-4 C5-8 | D5-4 _-2 D5-2 F5-4 A5-4 | C6-6 Bb5-2 A5-8 | Bb5-6 A5-2 G5-4 F5-4 | E5-12 C#5-4",
        bass: "r.rrr.rrr.rrr.rr", harm: ["pad"],
        drums: { k: "k.kk....k.kk....", s: "....s.......s...", h: "h...h...h...h..." },
        fill: { s: "....s...s..ss.ss" } },
      { id: "B", name: "Pressure", chords: "Gm Dm Bb A Gm Bb A A",
        melody: "G5-6 A5-2 Bb5-4 D6-4 | F6-8 E6-4 D6-4 | D6-6 C6-2 Bb5-4 F5-4 | E5-6 A5-2 C#6-8 | G5-6 A5-2 Bb5-4 D6-4 | F6-6 D6-2 Bb5-8 | A5-4 C#6-4 E6-4 G6-4 | E6-12 _-4",
        bass: "r.rrr.rrr.rrr.rr", harm: ["stab"], stab: "x..x..x.x..x.x..",
        drums: { k: "k.kkk.kkk.kkk.kk", s: "....s.......s...", h: "o...o...o...o..." },
        fill: { s: "....s...s..ss.ss" } },
      { id: "C", name: "Breach", chords: "Bb C Dm Dm Bb C A A",
        melody: "F5-4 Bb5-4 D6-8 | C6-4 E6-4 G6-8 | F6-12 E6-2 D6-2 | A5-12 _-4 | F5-4 Bb5-4 D6-6 F6-2 | G6-6 F6-2 E6-4 C6-4 | C#6-8 E6-8 | A5-4 G5-4 E5-4 C#5-4",
        bass: "r.r.o.r.r.r.o.rf", harm: ["stab", "pad"], stab: "x.x...x.x.x...x.",
        drums: { k: "k.k.k.k.k.k.k.k.", s: "....s.......s...", h: "h.h.h.h.h.h.h.h." },
        fill: { k: "k.k.k.k.k.......", s: "....s...ssssssss" } },
    ],
  },
  {
    id: "vector", title: "LAST VECTOR", stage: "Final stage · Core fortress", key: "A minor", bpm: 156,
    patches: { lead: "synth", arp: "bell", pad: "strings", stab: "gtrStab" }, shift: 0, drive: 0,
    echo: { steps: 3, vol: 0.34 },
    sections: [
      { id: "A", name: "Approach", chords: "Am F G E Am F Dm E",
        melody: "A5-2 E5-2 A5-2 B5-2 C6-4 B5-2 A5-2 | C6-2 A5-2 F5-2 A5-2 C6-4 D6-2 C6-2 | B5-2 G5-2 D5-2 G5-2 B5-4 C6-2 D6-2 | E6-8 D6-2 C6-2 B5-2 G#5-2 | A5-2 E5-2 A5-2 B5-2 C6-4 E6-2 A6-2 | A6-6 G6-2 F6-4 C6-4 | D6-4 F6-4 A6-4 F6-4 | E6-4 D6-4 B5-4 G#5-4",
        bass: "rorororororororo", harm: ["arp"], arp: "updown",
        drums: { k: "k..k..k.k..k..k.", s: "....s.......s...", h: "hhhhhhhhhhhhhhhh" },
        fill: { s: "....s...s.sss.ss" } },
      { id: "B", name: "Lament", chords: "F G Em Am F G E E",
        melody: "C6-8 A5-4 F5-4 | D6-8 B5-4 G5-4 | E6-6 D6-2 B5-4 G5-4 | A5-12 _-4 | C6-8 F6-4 E6-4 | D6-8 G6-4 F6-4 | E6-6 F6-2 E6-4 D6-4 | G#5-4 B5-4 D6-4 E6-4",
        bass: "r.......r...f.o.", harm: ["pad"],
        drums: { k: "k.......k.......", s: "........s.......", h: "h.h.h.h.h.h.h.h." },
        fill: { k: "k.......k.k.k.k.", s: "....s...s.s.ssss" } },
      { id: "C", name: "Final strike", chords: "Dm E Am C F Dm E E",
        melody: "F6-6 E6-2 D6-4 A5-4 | G#5-6 A5-2 B5-4 E6-4 | C6-6 B5-2 A5-4 E5-4 | G5-4 C6-4 E6-4 G6-4 | A6-12 G6-2 F6-2 | F6-6 E6-2 D6-4 F6-4 | E6-8 B5-4 G#5-4 | E5-2 F5-2 G#5-2 A5-2 B5-2 C6-2 D6-2 E6-2",
        bass: "rrorrorrorrorror", harm: ["arp", "pad"], arp: "up",
        drums: { k: "k.k.k.k.k.k.k.k.", s: "....s.......s..s", h: "h.hoh.hoh.hoh.ho" },
        fill: { k: "k.......k.......", s: "s.s.s.s.ssssssss" } },
    ],
  },
];
