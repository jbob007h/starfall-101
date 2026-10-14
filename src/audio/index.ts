import { Sequencer } from "./sequencer";
import { genesisOutput } from "./genesis";
import { SONG } from "./songs";
import { SONG_TF, TF_THRESHOLDS } from "./songs_tf";
import { Song } from "./sequencer";
import { StreamPlayer, StreamTrack } from "./stream";
import { TRANCE1, TRANCE2 } from "./trance";
/** Soundtracks: 0 = original "Starfall Overdrive" (6 stages), 1 = "Thunder Blitz" (8 sections),
 *  2/3 = pre-rendered trance (8 streamed loop sections, same thresholds as Thunder Blitz). */
const streamSong = (t: StreamTrack): Song => ({ name: t.name, channels: [], patches: {}, patterns: {}, stages: t.sections.map(s => ({ name: s.name, bpm: s.bpm, order: new Array(s.bars).fill("") })) });
export const SOUNDTRACKS: { name: string; song: Song; thresholds: number[]; stream?: StreamTrack }[] = [
  { name: "STARFALL OVERDRIVE", song: SONG, thresholds: [75, 50, 25, 10] },
  { name: "THUNDER BLITZ", song: SONG_TF, thresholds: TF_THRESHOLDS },
  { name: TRANCE1.name, song: streamSong(TRANCE1), thresholds: TF_THRESHOLDS, stream: TRANCE1 },
  { name: TRANCE2.name, song: streamSong(TRANCE2), thresholds: TF_THRESHOLDS, stream: TRANCE2 },
];
const LS_ST = "sf101soundtrack";
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
// Procedural chiptune SFX + Genesis-style adaptive FM music (Web Audio).
export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode; sfxBus!: GainNode; musBus!: GainNode; filter!: BiquadFilterNode;
  noise!: AudioBuffer;
  playing = false; step = 0; nextTime = 0; timer = 0;
  tier = 0; pendingTier = 0; tempo = 112; lowHealth = false; muted = false;
  lastShot = 0;
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext; if (!AC) return;
    const c: AudioContext = new AC(); this.ctx = c;
    this.master = c.createGain(); this.master.gain.value = 0.5; this.master.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.6; this.sfxBus.connect(this.master);
    this.filter = c.createBiquadFilter(); this.filter.type = "lowpass"; this.filter.frequency.value = 9000; this.filter.Q.value = 6;
    this.musBus = c.createGain(); this.musBus.gain.value = 0.55; this.musBus.connect(this.master);
    const len = c.sampleRate; this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.5; }
  tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo = 0, when = 0, bus?: AudioNode) {
    const c = this.ctx; if (!c) return; const t = when || c.currentTime;
    const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(bus || this.sfxBus); o.start(t); o.stop(t + dur + 0.02);
  }
  noiseHit(dur: number, vol: number, hp = 1000, when = 0, bus?: AudioNode) {
    const c = this.ctx; if (!c) return; const t = when || c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus || this.sfxBus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  // ---- SFX ----
  shoot() { const c = this.ctx; if (!c || c.currentTime - this.lastShot < 0.07) return; this.lastShot = c.currentTime; this.tone(880, 0.04, "square", 0.03, 440); }
  kill(chain: number) { const f = 220 * Math.pow(2, Math.min(chain, 36) / 12); this.tone(f, 0.09, "square", 0.12, f * 2); this.noiseHit(0.06, 0.08, 2000); }
  graze(n: number) { const f = 600 + Math.min(n, 40) * 30; this.tone(f, 0.05, "triangle", 0.08, f * 1.3); }
  hurt() { this.tone(300, 0.35, "sawtooth", 0.25, 50); this.noiseHit(0.3, 0.3, 200); }
  bomb() { this.noiseHit(0.9, 0.5, 60); this.tone(120, 0.9, "sawtooth", 0.3, 30); }
  cashIn(tier: number) { const base = [523, 659, 784][tier] || 523; [0, 4, 7, 12, 16].forEach((s, i) => this.tone(base * Math.pow(2, s / 12), 0.12, "square", 0.12, 0, (this.ctx?.currentTime || 0) + i * 0.05)); }
  power() { [0, 5, 9, 12].forEach((s, i) => this.tone(660 * Math.pow(2, s / 12), 0.08, "triangle", 0.15, 0, (this.ctx?.currentTime || 0) + i * 0.04)); }
  ko() { this.tone(1200, 0.4, "square", 0.08, 200); this.noiseHit(0.25, 0.1, 3000); }
  warn() { this.tone(440, 0.1, "square", 0.12); this.tone(440, 0.1, "square", 0.12, 0, (this.ctx?.currentTime || 0) + 0.15); }
  chainLost() { this.tone(400, 0.3, "triangle", 0.15, 100); }
  star() { [0, 7, 12, 19].forEach((s, i) => this.tone(990 * Math.pow(2, s / 12), 0.1, "sine", 0.15, 0, (this.ctx?.currentTime || 0) + i * 0.03)); }
  dot() { this.tone(1500, 0.03, "sine", 0.04); }
  bossHit() { this.noiseHit(0.03, 0.05, 4000); }
  explodeBig() { this.noiseHit(0.7, 0.4, 100); this.tone(200, 0.6, "square", 0.2, 30); }
  /** Bandpass noise sweep (whoosh). */
  sweep(dur: number, f0: number, f1: number, vol: number, when = 0) {
    const c = this.ctx; if (!c) return; const t = when || c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise; const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 4;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus); src.start(t); src.stop(t + dur + 0.02);
  }
  /** ATTACK SENT: rising launch whoosh + saw riser, then a bell chime (1/2/3 notes by tier; boom on mini-boss). */
  sent(tier: number) {
    const c = this.ctx; if (!c) return; const t = c.currentTime;
    this.sweep(0.35, 250, 5000, 0.5, t); this.tone(180, 0.32, "sawtooth", 0.12, 1400, t);
    const notes = [[24], [19, 24], [12, 19, 24]][tier] || [24]; const base = [784, 659, 523][tier] || 784;
    notes.forEach((n, i) => { const f = base * Math.pow(2, (n - 12) / 12); this.tone(f, 0.45, "sine", 0.22, 0, t + 0.3 + i * 0.09); this.tone(f * 2, 0.25, "triangle", 0.07, 0, t + 0.3 + i * 0.09); });
    if (tier === 2) this.tone(90, 0.5, "sine", 0.4, 40, t + 0.28);
  }
  /** INCOMING: two-tone klaxon, more pulses for bigger tiers. */
  incoming(tier: number) {
    const c = this.ctx; if (!c) return; const t = c.currentTime; const n = 2 + tier;
    for (let i = 0; i < n; i++) { this.tone(880, 0.11, "square", 0.13, 840, t + i * 0.24); this.tone(587, 0.11, "square", 0.13, 560, t + i * 0.24 + 0.12); }
  }
  zap() { const c = this.ctx; if (!c) return; const t = c.currentTime; this.noiseHit(0.08, 0.18, 3500, t); this.tone(rnd(1400, 2200), 0.07, "sawtooth", 0.06, 300, t); this.noiseHit(0.03, 0.12, 6000, t + 0.04); }
  lightning() { const c = this.ctx; if (!c) return; const t = c.currentTime; for (let i = 0; i < 6; i++) this.noiseHit(0.04, 0.2, 4000, t + i * 0.05); [0, 7, 12, 19].forEach((s, i) => this.tone(880 * Math.pow(2, s / 12), 0.1, "square", 0.08, 0, t + 0.3 + i * 0.05)); }
  tripleBomb() { const c = this.ctx; if (!c) return; const t = c.currentTime;
    for (let i = 0; i < 3; i++) { this.noiseHit(0.9, 0.6, 50, t + i * 0.18); this.tone(140 - i * 25, 0.9, "sawtooth", 0.3, 25, t + i * 0.18); this.tone(70, 0.6, "sine", 0.6, 30, t + i * 0.18); }
    [0, 4, 7, 12].forEach((n, i) => this.tone(523 * Math.pow(2, n / 12), 0.2, "square", 0.12, 0, t + 0.6 + i * 0.06)); }
  // ---- Music: Genesis-style FM tracker (see genesis.ts / sequencer.ts / songs.ts) ----
  seq: Sequencer | null = null; private timer2 = 0; duel = false;
  /** 0..4 = stage by players remaining (101-75, 75-50, 50-25, 25-10, final 10 = boss theme); duel => stage 5. Applied on the next bar line. */
  /** 0..1 position within the current beat of the music (0 = on the beat), for beat-synced visuals. */
  beatPhase() {
    if (this.sp) return this.sp.beatPhase();
    const q = this.seq, c = this.ctx; if (!q || !c || !q.running) return 0.5;
    const beat = 60 / q.bpm, bar = beat * 4; let s = q.nextBarTime - bar; const now = c.currentTime;
    while (s > now) s -= bar; return ((now - s) / beat) % 1;
  }
  setTier(t: number) { this.pendingTier = t; if (this.seq) { this.seq.pending = this.duel ? 5 : Math.max(0, Math.min(4, t)); } }
  soundtrack = (() => { try { const v = Number(localStorage.getItem(LS_ST)); return v >= 0 && v < SOUNDTRACKS.length ? Math.floor(v) : 0; } catch { return 0; } })();
  private seqs: Sequencer[] = []; sp: StreamPlayer | null = null; private sps: StreamPlayer[] = []; private out: AudioNode | null = null;
  get soundtrackName() { return SOUNDTRACKS[this.soundtrack].name; }
  /** Stage for the current soundtrack from players remaining (duel => last stage). */
  stageFor(remaining: number, duel: boolean) {
    const st = SOUNDTRACKS[this.soundtrack], n = st.song.stages.length; if (duel) return n - 1;
    const i = st.thresholds.findIndex(th => remaining > th); return i < 0 ? st.thresholds.length : i;
  }
  /** Set music stage from the match state (works for any soundtrack). */
  setRemaining(remaining: number, duel: boolean) { this.lastRem = remaining; this.lastDuel = duel; this.pendingTier = this.stageFor(remaining, duel); if (this.seq) this.seq.pending = this.pendingTier; if (this.sp) this.sp.pending = this.pendingTier; }
  private lastRem = 101; private lastDuel = false;
  /** Switch soundtrack (saved); if music is playing it restarts on the new soundtrack at the matching stage. */
  setSoundtrack(i: number) {
    i = ((i % SOUNDTRACKS.length) + SOUNDTRACKS.length) % SOUNDTRACKS.length; if (i === this.soundtrack) return;
    try { localStorage.setItem(LS_ST, String(i)); } catch { /* private mode */ }
    const was = this.playing; if (was) this.stopMusic();
    this.soundtrack = i; this.seq = null; this.sp = null; this.pendingTier = this.stageFor(this.lastRem, this.lastDuel);
    if (was) this.startMusic();
  }
  startMusic() {
    const c = this.ctx; if (!c) return;
    const stt = SOUNDTRACKS[this.soundtrack];
    if (stt.stream) {
      if (!this.sp) this.sp = this.sps[this.soundtrack] ??= new StreamPlayer(c, this.musBus, stt.stream);
      if (this.playing) return; this.playing = true; this.sp.start(this.pendingTier); this.tier = this.pendingTier; this.tempo = this.sp.bpm; this.beatT = c.currentTime + 0.1;
      this.timer2 = window.setInterval(() => this.schedule(), 25); return;
    }
    if (!this.out) this.out = genesisOutput(c, this.musBus);
    if (!this.seq) this.seq = this.seqs[this.soundtrack] ??= new Sequencer(c, this.out, SOUNDTRACKS[this.soundtrack].song);
    if (this.playing) return; this.playing = true;
    this.seq.pending = this.pendingTier; this.seq.start(c.currentTime + 0.1); this.tier = this.pendingTier; this.beatT = c.currentTime + 0.1;
    this.timer2 = window.setInterval(() => this.schedule(), 25);
  }
  stopMusic() { this.playing = false; this.seq?.stop(); this.sp?.stop(); clearInterval(this.timer2); }
  private beatT = 0;
  schedule() {
    const c = this.ctx, sp = this.sp, q = this.seq; if (!c || (!q && !sp)) return;
    let bpm: number;
    if (sp) { sp.tick(); this.tier = sp.stage; this.tempo = bpm = sp.bpm; }
    else { q!.scheduleUntil(c.currentTime + 0.15); this.tier = q!.stage; this.tempo = bpm = q!.bpm; }
    // heartbeat on low health, locked to the beat
    while (this.beatT < c.currentTime + 0.15) { if (this.lowHealth) { this.tone(60, 0.15, "sine", 0.5, 30, this.beatT); this.tone(55, 0.12, "sine", 0.35, 28, this.beatT + 0.16); } this.beatT += 60 / bpm; }
  }
}

/** Offline preview: render `secs` of a music stage to a 16-bit stereo WAV (used by music-preview.mjs). */
export async function renderMusicPreview(stage: number, secs: number, sr = 44100, soundtrack = 0): Promise<ArrayBuffer> {
  const SONG = SOUNDTRACKS[soundtrack]?.song ?? SOUNDTRACKS[0].song;
  const oc = new OfflineAudioContext(2, Math.floor(sr * secs), sr);
  const bus = oc.createGain(); bus.gain.value = 0.5; bus.connect(oc.destination);
  const seq = new Sequencer(oc, genesisOutput(oc, bus), SONG); seq.pending = Math.min(stage, SONG.stages.length - 1);
  seq.start(0.05); seq.scheduleUntil(secs);
  const buf = await oc.startRendering();
  const n = buf.length, out = new DataView(new ArrayBuffer(44 + n * 4)), w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); out.setUint32(4, 36 + n * 4, true); w(8, "WAVE"); w(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, "data"); out.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  return out.buffer;
}
