import { MusicEngine, CHANNELS } from "./music/engine";
import { TRACKS, PATCHES, STINGERS } from "./music/songs";
import { MusicDirector, PLANS, DIRECTION, GameMusicState, GameMusicEvent } from "./music/director";
export { MusicEngine, MusicDirector, TRACKS, PATCHES, STINGERS, PLANS, DIRECTION, CHANNELS };
export type { GameMusicState, GameMusicEvent };
/** Soundtrack menu entries (director plans): 0 = STARFALL ASCENT, 1 = classic three-track score, 2-4 = one track. */
export const SOUNDTRACKS = PLANS.map(p => ({ name: p.name }));
const LS_ST = "sf101soundtrack";
/** Mix levels: music pulled down ~7 dB and SFX up ~8.5 dB vs the original mix so effects cut through; a limiter on the master catches the peaks. */
export const MIX = { master: 0.6, sfx: 1.6, music: 0.55, musicEngine: 0.9 };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
// Procedural chiptune SFX + Genesis-style adaptive FM music (Web Audio). Music lives in ./music/.
export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode; sfxBus!: GainNode; musBus!: GainNode; filter!: BiquadFilterNode;
  noise!: AudioBuffer;
  lowHealth = false; muted = false; duel = false;
  lastShot = 0;
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext; if (!AC) return;
    const c: AudioContext = new AC(); this.ctx = c;
    this.master = c.createGain(); this.master.gain.value = MIX.master;
    const lim = c.createDynamicsCompressor(); // brick-wall-ish limiter so louder SFX + music can't clip
    lim.threshold.value = -4; lim.knee.value = 2; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
    this.master.connect(lim); lim.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = MIX.sfx; this.sfxBus.connect(this.master);
    this.filter = c.createBiquadFilter(); this.filter.type = "lowpass"; this.filter.frequency.value = 9000; this.filter.Q.value = 6;
    this.musBus = c.createGain(); this.musBus.gain.value = MIX.music; this.musBus.connect(this.master);
    this.music = new MusicEngine(c, this.musBus, TRACKS, PATCHES, STINGERS); this.music.setVolume(MIX.musicEngine, 0);
    this.director = new MusicDirector(this.music); this.director.setPlan(this.soundtrack);
    this.music.on("beat", e => this.heartbeat(e.time, e.beat, e.bpm), { ahead: true }); // danger heartbeat locked to the beat
    const len = c.sampleRate; this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : MIX.master; }
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
  /** Chain kills climb the current chord's notes (one step per 4 kills, 3 octaves), so streaks play along with the song. */
  kill(chain: number) {
    const f = this.chordHz(Math.floor(Math.min(chain, 36) / 4)) || 220 * Math.pow(2, Math.min(chain, 36) / 12);
    this.tone(f, 0.09, "square", 0.12, f * 2); this.noiseHit(0.06, 0.08, 2000);
  }
  graze(n: number) { const f = 600 + Math.min(n, 40) * 30; this.tone(f, 0.05, "triangle", 0.08, f * 1.3); }
  hurt() { this.tone(300, 0.35, "sawtooth", 0.25, 50); this.noiseHit(0.3, 0.3, 200); }
  bomb() { this.noiseHit(0.9, 0.5, 60); this.tone(120, 0.9, "sawtooth", 0.3, 30); }
  cashIn(tier: number) { const base = [523, 659, 784][tier] || 523, t = this.q(); [0, 4, 7, 12, 16].forEach((s, i) => this.tone(base * Math.pow(2, s / 12), 0.12, "square", 0.12, 0, t + i * 0.05)); }
  power() { [0, 5, 9, 12].forEach((s, i) => this.tone(660 * Math.pow(2, s / 12), 0.08, "triangle", 0.15, 0, (this.ctx?.currentTime || 0) + i * 0.04)); }
  ko() { this.tone(1200, 0.4, "square", 0.08, 200); this.noiseHit(0.25, 0.1, 3000); }
  warn() { this.tone(440, 0.1, "square", 0.12); this.tone(440, 0.1, "square", 0.12, 0, (this.ctx?.currentTime || 0) + 0.15); }
  chainLost() { this.tone(400, 0.3, "triangle", 0.15, 100); }
  star() { const t = this.q(); [6, 8, 9, 11].forEach((k, i) => this.tone(this.chordHz(k) || 990 * Math.pow(2, [0, 7, 12, 19][i] / 12), 0.1, "sine", 0.15, 0, t + i * 0.03)); }
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
    const c = this.ctx; if (!c) return; const t = c.currentTime, tq = this.q(t + 0.3); // whoosh now, chime on the 16th grid
    this.sweep(0.35, 250, 5000, 0.5, t); this.tone(180, 0.32, "sawtooth", 0.12, 1400, t);
    const notes = [[24], [19, 24], [12, 19, 24]][tier] || [24]; const base = [784, 659, 523][tier] || 784;
    notes.forEach((n, i) => { const f = base * Math.pow(2, (n - 12) / 12); this.tone(f, 0.45, "sine", 0.22, 0, tq + i * 0.09); this.tone(f * 2, 0.25, "triangle", 0.07, 0, tq + i * 0.09); });
    if (tier === 2) this.tone(90, 0.5, "sine", 0.4, 40, t + 0.28);
  }
  /** INCOMING: two-tone klaxon, more pulses for bigger tiers. */
  incoming(tier: number) {
    const c = this.ctx; if (!c) return; const t = c.currentTime; const n = 2 + tier;
    for (let i = 0; i < n; i++) { this.tone(880, 0.11, "square", 0.13, 840, t + i * 0.24); this.tone(587, 0.11, "square", 0.13, 560, t + i * 0.24 + 0.12); }
  }
  /** INFERNO: fireball launch (low whoosh) / napalm burst (crackling boom); STORM BLADES: metallic throw ting; pickups. */
  fireball() { const c = this.ctx; if (!c) return; const t = c.currentTime; this.noiseHit(0.14, 0.1, 500, t); this.tone(rnd(160, 220), 0.12, "sawtooth", 0.05, 70, t); }
  napalm() { const c = this.ctx; if (!c) return; const t = c.currentTime; this.noiseHit(0.22, 0.16, 250, t); for (let i = 0; i < 3; i++) this.noiseHit(0.03, 0.08, 2500, t + 0.04 + i * 0.05); }
  blade() { const c = this.ctx; if (!c) return; const t = c.currentTime; const f = rnd(2600, 3400); this.tone(f, 0.05, "triangle", 0.05, f * 1.3, t); this.noiseHit(0.02, 0.05, 7000, t); }
  bladeHit() { const c = this.ctx; if (!c) return; const t = c.currentTime; this.tone(rnd(1800, 2400), 0.04, "square", 0.04, 900, t); }
  inferno() { const c = this.ctx; if (!c) return; const t = c.currentTime; this.noiseHit(0.6, 0.25, 150, t); [0, 3, 7, 12].forEach((s, i) => this.tone(220 * Math.pow(2, s / 12), 0.14, "sawtooth", 0.08, 0, t + i * 0.05)); }
  blades() { const c = this.ctx; if (!c) return; const t = c.currentTime; for (let i = 0; i < 5; i++) this.tone(2400 + i * 300, 0.06, "triangle", 0.07, 3600, t + i * 0.04); this.noiseHit(0.1, 0.1, 6000, t); }
  finalBoss() { const c = this.ctx; if (!c) return; const t = c.currentTime; this.noiseHit(1.2, 0.35, 80, t); [0, -5, -12].forEach((s, i) => this.tone(110 * Math.pow(2, s / 12), 0.5, "sawtooth", 0.18, 0, t + i * 0.22)); }
  zap() { const c = this.ctx; if (!c) return; const t = c.currentTime; this.noiseHit(0.08, 0.18, 3500, t); this.tone(rnd(1400, 2200), 0.07, "sawtooth", 0.06, 300, t); this.noiseHit(0.03, 0.12, 6000, t + 0.04); }
  lightning() { const c = this.ctx; if (!c) return; const t = c.currentTime; for (let i = 0; i < 6; i++) this.noiseHit(0.04, 0.2, 4000, t + i * 0.05); [0, 7, 12, 19].forEach((s, i) => this.tone(880 * Math.pow(2, s / 12), 0.1, "square", 0.08, 0, t + 0.3 + i * 0.05)); }
  tripleBomb() { const c = this.ctx; if (!c) return; const t = c.currentTime;
    for (let i = 0; i < 3; i++) { this.noiseHit(0.9, 0.6, 50, t + i * 0.18); this.tone(140 - i * 25, 0.9, "sawtooth", 0.3, 25, t + i * 0.18); this.tone(70, 0.6, "sine", 0.6, 30, t + i * 0.18); }
    // reward arpeggio: up the current chord (octave, 3rd, 5th, 2nd octave) in 16ths on the music's grid
    const tq = this.q(t + 0.55), sd = this.music?.playing ? 60 / this.music.bpm / 4 : 0.06;
    [3, 4, 5, 6].forEach((k, i) => this.tone(this.chordHz(k) || 523 * Math.pow(2, [0, 4, 7, 12][i] / 12), 0.2, "square", 0.12, 0, tq + i * sd)); }
  // ---- Music: FM engine (./music/engine.ts) driven by the director (./music/director.ts) ----
  /** Direct engine access for one-off game cues: audio.music.queue({ section: "C" }), setChannel, setTempoOffset, on("bar", ...). */
  music: MusicEngine | null = null;
  director: MusicDirector | null = null;
  private gs: GameMusicState = { remaining: 101, duel: false, lowHealth: false, hp: 3, bombs: 3, chain: 0, armed: false, bossActive: false, shield: false, freeze: false, lightning: false, tripleReady: false };
  soundtrack = (() => { try { const v = Number(localStorage.getItem(LS_ST)); return v >= 0 && v < SOUNDTRACKS.length ? Math.floor(v) : 0; } catch { return 0; } })();
  get soundtrackName() { return SOUNDTRACKS[this.soundtrack].name; }
  get playing() { return !!this.music?.playing; }
  /** Director stage (index into the active plan's progression). */
  get tier() { return this.director?.stage ?? 0; }
  /** Layer tier 0..3 and the momentum meter behind it. */
  get layerTier() { return this.director?.tier ?? 0; }
  /** The director's tuning block (live object: edits take effect immediately). */
  get direction() { return DIRECTION; }
  get momentum() { return this.director?.momentum ?? 0; }
  get tempo() { return this.music?.bpm ?? 0; }
  /** 0..1 position within the current beat of the music (0 = on the beat), for beat-synced visuals. */
  beatPhase() { return this.music ? this.music.beatPhase() : 0.5; }
  /** Time of the next 16th note of the music (or `from`/now when silent): lands SFX on the grid. */
  private q(from = 0) { const c = this.ctx; if (!c) return 0; const t0 = Math.max(from, c.currentTime); const m = this.music; if (!m?.playing || m.paused) return t0; let t = m.nextStepTime(); const sd = 60 / m.bpm / 4; while (t < t0) t += sd; return t; }
  /** Hz of note k on a ladder of the chord being heard (0 root, 1 third, 2 fifth, 3 octave...), rooted at A3..G#4. 0 when silent. */
  private chordHz(k: number) {
    const ch = this.music?.playing ? this.music.currentChord() : null; if (!ch) return 0;
    const root = 57 + ((ch.root - 9 + 12) % 12), n = ch.iv.length;
    return 440 * Math.pow(2, (root + ch.iv[k % n] + 12 * Math.floor(k / n) - 69) / 12);
  }
  /** Gameplay moments for the music director: kill, sent (data = tier), chainLost, hurt, bomb, bombBlast, tripleBomb, bossDown, ko,
   *  incoming (data = tier), victory, defeat. */
  musicEvent(type: GameMusicEvent, data = 0) { this.director?.event(type, data); }
  /** Feed the live game state to the music director (call every frame during a match). */
  updateMusic(s: Partial<GameMusicState>) {
    Object.assign(this.gs, s); if (s.lowHealth !== undefined) this.lowHealth = s.lowHealth; if (s.duel !== undefined) this.duel = s.duel;
    this.director?.update(this.gs);
  }
  /** Back-compat: players remaining + duel. */
  setRemaining(remaining: number, duel: boolean) { this.updateMusic({ remaining, duel }); }
  /** Switch soundtrack (saved); if music is playing it restarts on the new soundtrack at the matching point. */
  setSoundtrack(i: number) {
    i = ((i % SOUNDTRACKS.length) + SOUNDTRACKS.length) % SOUNDTRACKS.length; if (i === this.soundtrack) return;
    try { localStorage.setItem(LS_ST, String(i)); } catch { /* private mode */ }
    this.soundtrack = i; this.director?.setPlan(i);
  }
  /** Start the match music (restarts it if the spectate / ending music is still playing). */
  startMusic() { if (!this.director || (this.music?.playing && this.director.mode === "play")) return; this.director.start({ ...this.gs, lowHealth: this.lowHealth, duel: this.duel }); }
  stopMusic() { this.music?.stop(); }
  /** Pause / resume the music in place (game pause). */
  pauseMusic(p: boolean) { this.music?.setPaused(p); }
  /** Danger pulse from the director: heartbeat (lub-dub) on 1, 1+3 or every beat, PSG ticks on the off-beats at critical. */
  private heartbeat(t: number, beat: number, bpm: number) {
    if (!this.director || this.music?.paused) return;
    const { heart, tick } = this.director.dangerPulse(beat);
    if (heart > 0) { this.tone(60, 0.15, "sine", 0.5 * heart, 30, t); this.tone(55, 0.12, "sine", 0.35 * heart, 28, t + 0.16); }
    if (tick) this.noiseHit(0.025, 0.07, 6500, t + 30 / bpm);
  }
  /** Danger level 0..3 (HP + bombs). */
  get danger() { return this.director?.danger ?? 0; }
}

/** Offline preview: render `secs` of a track (all sections in order) to a 16-bit stereo WAV (used by music-preview.mjs).
 *  demo: also walk the layer tiers (one step up at bar 5 of each section), fire attack/boss stingers and the final-ten key change,
 *  roughly what a strong match sounds like. */
export async function renderMusicPreview(track: number, secs: number, sr = 44100, demo = false): Promise<ArrayBuffer> {
  const oc = new OfflineAudioContext(2, Math.floor(sr * secs), sr);
  const bus = oc.createGain(); bus.gain.value = MIX.music * MIX.master; bus.connect(oc.destination);
  const m = new MusicEngine(oc, bus, TRACKS, PATCHES, STINGERS); m.autoTick = false; m.setVolume(MIX.musicEngine, 0);
  if (demo) {
    const n = m.tracks[track].sections.length, fin = m.tracks[track].def.finalTranspose ?? 2;
    m.on("bar", e => {
      const i = m.sectionIndex(track, e.section), tier = Math.min(3, Math.floor(i * 4 / n) + (e.bar >= 4 ? 1 : 0));
      if (e.bar === 0 || e.bar === 4) for (const [id, v] of Object.entries(DIRECTION.layers[tier])) m.setChannel(id as never, { volume: v }, 0.1, e.time);
      if (e.bar === 0) m.transpose = i >= n - 2 ? fin : 0;
      if (e.bar === 6) m.stinger(i === n - 1 ? "bossDown" : "sent" + (i % 3));
    }, { ahead: true });
  }
  m.play(track, { loop: "song", at: 0.05 }); m.scheduleUntil(secs);
  const buf = await oc.startRendering();
  const n = buf.length, out = new DataView(new ArrayBuffer(44 + n * 4)), w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); out.setUint32(4, 36 + n * 4, true); w(8, "WAVE"); w(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, "data"); out.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  return out.buffer;
}
