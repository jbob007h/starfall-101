// Sega Genesis / Mega Drive flavoured synthesis on Web Audio:
//  - YM2612-style 4-operator FM: 8 algorithms, op1 self-feedback, per-operator ADSR (AR/D1R/SL/D2R/RR), MUL, DT.
//  - SN76489-style PSG: square tone channels with stepped 2 dB volume envelopes, LFSR noise (white / periodic).
//  - Channel-6 DAC drums: procedurally generated 8-bit samples at ~13.3 kHz (kick, snare, hats, crash, tom).
// Works with any BaseAudioContext (realtime or OfflineAudioContext for previews).

export interface Op { mul: number; tl: number; ar: number; dr: number; sl: number; sr?: number; rr: number; dt?: number; }
export interface Patch { name: string; alg: number; fb: number; ops: [Op, Op, Op, Op]; vol?: number; }

/** YM2612 algorithms: modulation edges [from, to] (0-based op index) and carrier outputs. */
const ALG: { mods: [number, number][]; out: number[] }[] = [
  { mods: [[0, 1], [1, 2], [2, 3]], out: [3] },        // 0: 1>2>3>4
  { mods: [[0, 2], [1, 2], [2, 3]], out: [3] },        // 1: (1+2)>3>4
  { mods: [[1, 2], [0, 3], [2, 3]], out: [3] },        // 2: (1 + 2>3)>4
  { mods: [[0, 1], [1, 3], [2, 3]], out: [3] },        // 3: (1>2 + 3)>4
  { mods: [[0, 1], [2, 3]], out: [1, 3] },             // 4: 1>2 + 3>4
  { mods: [[0, 1], [0, 2], [0, 3]], out: [1, 2, 3] },  // 5: 1>(2,3,4)
  { mods: [[0, 1]], out: [1, 2, 3] },                  // 6: 1>2 + 3 + 4
  { mods: [], out: [0, 1, 2, 3] },                     // 7: additive
];
const MOD_INDEX = 2.6; // modulator TL 1.0 -> frequency deviation of 2.6x its own frequency

const fbCache = new WeakMap<BaseAudioContext, PeriodicWave[]>();
/** Self-feedback on op1 approximated by a periodic wave that morphs sine -> saw as FB rises (0..7). */
function fbWave(ctx: BaseAudioContext, fb: number) {
  let arr = fbCache.get(ctx); if (!arr) { arr = []; fbCache.set(ctx, arr); }
  if (!arr[fb]) {
    const n = 24, re = new Float32Array(n), im = new Float32Array(n), beta = fb / 7 * 0.92;
    for (let k = 1; k < n; k++) im[k] = Math.pow(beta, k - 1) / k;
    arr[fb] = ctx.createPeriodicWave(re, im, { disableNormalization: false });
  }
  return arr[fb];
}

export function midiHz(m: number) { return 440 * Math.pow(2, (m - 69) / 12); }

/** Play one FM note. `dur` is the gate (key-on) length in seconds. */
export function playFM(ctx: BaseAudioContext, dest: AudioNode, p: Patch, freq: number, t: number, dur: number, vel = 1) {
  const alg = ALG[p.alg] || ALG[4], oscs: OscillatorNode[] = [], gains: GainNode[] = [];
  const carrierScale = 0.32 * vel * (p.vol ?? 1) / Math.sqrt(alg.out.length);
  let end = t + dur;
  p.ops.forEach((op, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    const f = freq * op.mul * Math.pow(2, (op.dt || 0) / 1200);
    o.frequency.setValueAtTime(f, t);
    if (i === 0 && p.fb > 0) o.setPeriodicWave(fbWave(ctx, p.fb));
    const carrier = alg.out.includes(i);
    const L = carrier ? op.tl * carrierScale : op.tl * f * MOD_INDEX * (0.6 + 0.4 * vel);
    const gg = g.gain; gg.setValueAtTime(0, t); gg.linearRampToValueAtTime(L, t + op.ar);
    gg.setTargetAtTime(L * op.sl, t + op.ar, Math.max(0.005, op.dr / 3));
    if (op.sr) gg.setTargetAtTime(0, t + op.ar + op.dr, op.sr / 3);
    gg.cancelScheduledValues(t + dur); gg.setTargetAtTime(0, t + dur, Math.max(0.004, op.rr / 3)); // key-off
    o.connect(g); oscs.push(o); gains.push(g);
    end = Math.max(end, t + dur + op.rr * 1.6 + 0.02);
  });
  for (const [a, b] of alg.mods) gains[a].connect(oscs[b].frequency);
  for (const i of alg.out) gains[i].connect(dest);
  for (const o of oscs) { o.start(t); o.stop(end); }
}

/** SN76489 volume steps are 2 dB; envelopes are stepped at 60 Hz like a sound driver would. */
const PSG_ENV: Record<string, number[]> = {
  pluck: [15, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  sustain: [15, 14, 14, 13],
  hat: [14, 10, 6, 2, 0],
  ohat: [14, 13, 12, 11, 10, 9, 8, 7, 6, 4, 2, 0],
};
const step2db = (v: number) => v <= 0 ? 0 : Math.pow(10, -(15 - v) * 2 / 20);
function psgEnv(g: AudioParam, t: number, dur: number, vol: number, env: number[], hold: boolean) {
  const fr = 1 / 60; g.setValueAtTime(0, t);
  let k = 0; for (; k < env.length && k * fr < dur; k++) g.setValueAtTime(vol * step2db(env[k]), t + k * fr);
  if (hold) { g.setValueAtTime(vol * step2db(env[env.length - 1]), t + k * fr); }
  g.setValueAtTime(0, t + Math.max(dur, (hold ? 0 : env.length) * fr));
}
export function playPSG(ctx: BaseAudioContext, dest: AudioNode, freq: number, t: number, dur: number, vol: number, env = "pluck") {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "square";
  o.frequency.setValueAtTime(Math.round(3579545 / 32 / freq) > 0 ? 3579545 / 32 / Math.round(3579545 / 32 / freq) : freq, t); // 10-bit divider quantisation
  const e = PSG_ENV[env] || PSG_ENV.pluck; psgEnv(g.gain, t, env === "sustain" ? dur : Math.min(dur, e.length / 60), vol * 0.16, e, env === "sustain");
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + Math.max(dur, e.length / 60) + 0.05);
}

const noiseCache = new WeakMap<BaseAudioContext, { white: AudioBuffer; periodic: AudioBuffer }>();
function lfsrBuffers(ctx: BaseAudioContext) {
  let n = noiseCache.get(ctx); if (n) return n;
  const sr = ctx.sampleRate, len = sr, clock = 3579545 / 16 / 0x10; // noise clocked like N/512 mode
  const mk = (white: boolean) => {
    const b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0); let reg = 0x4000, acc = 0, out = 1;
    for (let i = 0; i < len; i++) {
      acc += clock / sr;
      while (acc >= 1) { acc -= 1; const bit = white ? ((reg ^ (reg >> 1)) & 1) : (reg & 1); reg = (reg >> 1) | (bit << 14); out = (reg & 1) ? 1 : -1; }
      d[i] = out;
    }
    return b;
  };
  n = { white: mk(true), periodic: mk(false) }; noiseCache.set(ctx, n); return n;
}
export function playNoise(ctx: BaseAudioContext, dest: AudioNode, t: number, vol: number, env = "hat", periodic = false, rate = 1) {
  const b = lfsrBuffers(ctx), s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = periodic ? b.periodic : b.white; s.playbackRate.value = rate;
  const e = PSG_ENV[env] || PSG_ENV.hat; psgEnv(g.gain, t, e.length / 60, vol * 0.12, e, false);
  s.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + e.length / 60 + 0.05);
}

/** Channel-6 DAC drum kit: generated once per context, 8-bit, sample-and-hold at ~13.3 kHz. */
const kitCache = new WeakMap<BaseAudioContext, Record<string, AudioBuffer>>();
export function drumKit(ctx: BaseAudioContext) {
  let kit = kitCache.get(ctx); if (kit) return kit;
  const sr = ctx.sampleRate, DAC = 13300;
  const make = (secs: number, fn: (t: number) => number) => {
    const n = Math.floor(sr * secs), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), hold = Math.max(1, Math.round(sr / DAC));
    let v = 0; for (let i = 0; i < n; i++) { if (i % hold === 0) { v = Math.max(-1, Math.min(1, fn(i / sr))); v = Math.round(v * 127) / 127; } d[i] = v; }
    return b;
  };
  let ph = 0, last = 0;
  const kick = make(0.32, t => { const f = 50 + 140 * Math.exp(-t * 28); ph += 2 * Math.PI * f / sr; return Math.sin(ph) * Math.exp(-t * 9) * 1.3 + (t < 0.004 ? (Math.random() - 0.5) : 0); });
  ph = 0;
  const snare = make(0.24, t => { ph += 2 * Math.PI * 190 / sr; const n = Math.random() * 2 - 1; return (Math.sin(ph) * Math.exp(-t * 30) * 0.7 + n * Math.exp(-t * 14) * 0.8); });
  const hat = make(0.06, t => { const n = Math.random() * 2 - 1, h = n - last; last = n; return h * 0.6 * Math.exp(-t * 70); });
  const ohat = make(0.25, t => { const n = Math.random() * 2 - 1, h = n - last; last = n; return h * 0.5 * Math.exp(-t * 12); });
  const crash = make(1.2, t => { const n = Math.random() * 2 - 1, h = n - last * 0.5; last = n; return h * 0.6 * Math.exp(-t * 3.2); });
  ph = 0;
  const tom = make(0.3, t => { const f = 90 + 120 * Math.exp(-t * 14); ph += 2 * Math.PI * f / sr; return Math.sin(ph) * Math.exp(-t * 8); });
  kit = { k: kick, s: snare, h: hat, o: ohat, c: crash, t: tom }; kitCache.set(ctx, kit); return kit;
}
export function playDAC(ctx: BaseAudioContext, dest: AudioNode, name: string, t: number, vol: number, rate = 1) {
  const b = drumKit(ctx)[name]; if (!b) return;
  const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; s.playbackRate.value = rate; g.gain.value = vol;
  s.connect(g); g.connect(dest); s.start(t);
}

/** Output stage: gentle 9-bit-ish quantiser + band limit for that slightly gritty Genesis DAC/amp character. */
export function genesisOutput(ctx: BaseAudioContext, dest: AudioNode) {
  const crush = ctx.createWaveShaper(), n = 4096, curve = new Float32Array(n), steps = 256;
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.round(Math.tanh(x * 1.2) * steps) / steps; }
  crush.curve = curve;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 12500; lp.Q.value = 0.5;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 30;
  crush.connect(lp); lp.connect(hp); hp.connect(dest);
  return crush; // connect music into this
}
