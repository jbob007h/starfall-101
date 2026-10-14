// Tiny tracker-style sequencer.
// Song = channels (type, patch/instrument, volume, pan) + patterns + stages.
// Pattern = one bar of 16 rows; each channel line is 16 space-separated tokens:
//   note "C4" "F#5" "Bb3", chord "E4+G4+B4", "." = hold previous note, "-" = rest / key-off,
//   DAC/noise channels use drum letters: k kick, s snare, h hat, o open hat, c crash, t tom ("k+c" = layered).
//   Optional velocity suffix: "E5'6" (0-9, default 9). Optional pitch-bend-in: "E5^2" starts 2 semitones below and slides up
//   ("E5^-3" from above); combine as "E5^2'7".
// Stage = { bpm, order: pattern names (looped) }. Stage changes are applied on bar lines only.
import { Patch, playFM, playPSG, playNoise, playDAC, midiHz } from "./genesis";

export type ChType = "fm" | "psg" | "noise" | "dac";
/** drive (optional): amp-style tanh distortion + cabinet low-pass on this channel's bus (distorted FM guitars). */
export interface ChannelDef { name: string; type: ChType; patch?: string; vol: number; pan: number; env?: string; gate?: number; drive?: number; cab?: number; }
export type Pattern = Record<string, string>;
export interface Stage { name: string; bpm: number; order: string[]; patches?: Record<string, string>; /* per-channel patch override */ }
export interface Song { name?: string; channels: ChannelDef[]; patches: Record<string, Patch>; patterns: Record<string, Pattern>; stages: Stage[]; }

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function noteMidi(tok: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(tok); if (!m) return -1;
  return 12 * (Number(m[3]) + 1) + NOTE[m[1].toUpperCase()] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}
export function midiName(m: number) { const n = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]; return n[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }

interface Ev { row: number; len: number; notes: string[]; vel: number; bend: number; }
const parseCache = new Map<string, Ev[]>();
export function parseLine(line: string): Ev[] {
  const hit = parseCache.get(line); if (hit) return hit;
  const toks = line.trim().split(/\s+/); const evs: Ev[] = [];
  toks.forEach((tk, row) => {
    if (tk === "." || tk === "-") return;
    let vel = 9; const q = tk.indexOf("'"); if (q >= 0) { vel = Number(tk.slice(q + 1)) || 0; tk = tk.slice(0, q); }
    let bend = 0; const c = tk.indexOf("^"); if (c >= 0) { bend = -(Number(tk.slice(c + 1)) || 0); tk = tk.slice(0, c); }
    let len = 1; while (row + len < toks.length && toks[row + len] === ".") len++;
    evs.push({ row, len, notes: tk.split("+"), vel: vel / 9, bend });
  });
  parseCache.set(line, evs); return evs;
}

export class Sequencer {
  bar = 0; nextBarTime = 0; stage = 0; pending = 0; bpmBoost = 0; running = false;
  private buses: Record<string, AudioNode> = {};
  constructor(private ctx: BaseAudioContext, out: AudioNode, private song: Song) {
    for (const ch of song.channels) {
      const g = ctx.createGain(); g.gain.value = ch.vol;
      const p = ctx.createStereoPanner(); p.pan.value = ch.pan; g.connect(p); p.connect(out); this.buses[ch.name] = g;
      if (ch.drive) { // input -> pre-gain -> tanh amp -> 2-pole cabinet LP -> channel gain
        const pre = ctx.createGain(), sh = ctx.createWaveShaper(), n = 2048, cv = new Float32Array(n), k = ch.drive;
        for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cv[i] = Math.tanh(x * k) / Math.tanh(k); }
        sh.curve = cv; sh.oversample = "2x"; pre.gain.value = 1;
        const cab = ctx.createBiquadFilter(); cab.type = "lowpass"; cab.frequency.value = ch.cab ?? 4200; cab.Q.value = 0.9;
        const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 90;
        pre.connect(hp); hp.connect(sh); sh.connect(cab); cab.connect(g); this.buses[ch.name] = pre;
      }
    }
  }
  start(at: number) { this.running = true; this.bar = 0; this.stage = this.pending; this.nextBarTime = at; }
  stop() { this.running = false; }
  get bpm() { return this.song.stages[this.stage].bpm + this.bpmBoost; }
  /** Schedule every bar that starts before `until` (AudioContext time). */
  scheduleUntil(until: number) {
    while (this.running && this.nextBarTime < until) {
      this.stage = this.pending; // bar-line transition: no gaps, next bar simply uses the new stage
      const st = this.song.stages[this.stage], pat = this.song.patterns[st.order[this.bar % st.order.length]];
      const row = 60 / this.bpm / 4, t0 = this.nextBarTime;
      if (pat) for (const ch of this.song.channels) { const line = pat[ch.name]; if (line) this.playLine(ch, line, t0, row, st.patches?.[ch.name] ?? ch.patch); }
      this.nextBarTime += row * 16; this.bar++;
    }
  }
  private playLine(ch: ChannelDef, line: string, t0: number, row: number, patch?: string) {
    const bus = this.buses[ch.name], gate = ch.gate ?? 0.92;
    for (const ev of parseLine(line)) {
      const t = t0 + ev.row * row, dur = ev.len * row * gate;
      if (ch.type === "dac") { playDAC(this.ctx, bus, ev.notes.join("+"), t, ev.vel); continue; } // mono DAC: layers premixed
      for (const n of ev.notes) {
        if (ch.type === "noise") playNoise(this.ctx, bus, t, ev.vel, n === "o" ? "ohat" : "hat", n === "p");
        else { const m = noteMidi(n); if (m < 0) continue;
          if (ch.type === "fm") playFM(this.ctx, bus, this.song.patches[patch!], midiHz(m), t, dur, ev.vel, ev.bend);
          else playPSG(this.ctx, bus, midiHz(m), t, dur, ev.vel, ch.env); }
      }
    }
  }
}
