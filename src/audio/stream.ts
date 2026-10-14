// Pre-rendered streamed soundtracks (trance): 8 seamless loop sections, crossfaded ~1 bar on section changes.
// Audio files live in dist/music/<file>.ogg (Opus); the single-file build embeds them as base64 in window.__SF_MUSIC.
export interface StreamSection { file: string; bpm: number; bars: number; samples: number; name: string; }
export interface StreamTrack { name: string; key: string; sections: StreamSection[]; }
const SR = 44100;
interface Voice { src: AudioBufferSourceNode; gain: GainNode; t0: number; stage: number; endT: number; }
export class StreamPlayer {
  private cache = new Map<string, Promise<AudioBuffer | null>>(); private ready = new Map<string, AudioBuffer>();
  private cur: Voice | null = null; private old: Voice[] = [];
  running = false; pending = 0; stage = 0; bpm = 140; vol: GainNode;
  constructor(private ctx: BaseAudioContext, out: AudioNode, private track: StreamTrack) {
    this.vol = ctx.createGain(); this.vol.gain.value = 2.0; this.vol.connect(out); this.bpm = track.sections[0].bpm;
  }
  load(i: number): Promise<AudioBuffer | null> {
    const s = this.track.sections[Math.max(0, Math.min(i, this.track.sections.length - 1))]; let p = this.cache.get(s.file);
    if (!p) {
      p = (async () => {
        try {
          const emb = (globalThis as any).__SF_MUSIC?.[s.file] as string | undefined; let data: ArrayBuffer;
          if (emb) { const bin = atob(emb); const u = new Uint8Array(bin.length); for (let j = 0; j < bin.length; j++) u[j] = bin.charCodeAt(j); data = u.buffer; }
          else { const r = await fetch("music/" + s.file + ".ogg"); if (!r.ok) throw new Error("HTTP " + r.status); data = await r.arrayBuffer(); }
          const b = await this.ctx.decodeAudioData(data); this.ready.set(s.file, b); return b;
        } catch (e) { console.warn("music: could not load " + s.file + " (" + e + ")"); this.cache.delete(s.file); return null; }
      })();
      this.cache.set(s.file, p);
    }
    return p;
  }
  private secLen(i: number) { return this.track.sections[i].samples / SR; }
  private barLen(i: number) { return 240 / this.track.sections[i].bpm; }
  private play(i: number, when: number, fade: number) {
    const sec = this.track.sections[i], buf = this.ready.get(sec.file); if (!buf) return;
    const c = this.ctx, src = c.createBufferSource(), g = c.createGain(); src.buffer = buf; src.loop = true;
    src.loopStart = 0; src.loopEnd = Math.min(buf.duration, this.secLen(i));
    if (fade > 0) { g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(1, when + fade); } else g.gain.value = 1;
    src.connect(g); g.connect(this.vol); src.start(when);
    if (this.cur) { const o = this.cur; o.gain.gain.setValueAtTime(1, when); o.gain.gain.linearRampToValueAtTime(0, when + Math.max(fade, 0.05)); o.src.stop(when + fade + 0.1); o.endT = when + fade + 0.1; this.old.push(o); }
    this.cur = { src, gain: g, t0: when, stage: i, endT: Infinity }; this.stage = i; this.bpm = sec.bpm;
    this.load(i + 1); // lazy-load the next section
  }
  start(stage: number) { this.running = true; this.pending = stage; this.load(stage); this.tick(); }
  stop() {
    this.running = false; const c = this.ctx, t = c.currentTime;
    for (const v of [this.cur, ...this.old]) if (v) { try { v.gain.gain.cancelScheduledValues(t); v.gain.gain.setValueAtTime(v.gain.gain.value, t); v.gain.gain.linearRampToValueAtTime(0, t + 0.08); v.src.stop(t + 0.1); } catch { /* already stopped */ } }
    this.cur = null; this.old = [];
  }
  /** Call periodically: starts / switches sections on the next bar line, crossfading over one bar. */
  tick() {
    if (!this.running) return; const now = this.ctx.currentTime;
    this.old = this.old.filter(v => now < v.endT);
    const p = this.pending;
    if (!this.ready.has(this.track.sections[p].file)) { this.load(p); return; }
    if (!this.cur) { this.play(p, now + 0.05, 0.02); return; }
    if (this.cur.stage === p || this.cur.t0 > now) return; // same section, or a switch is already scheduled
    const bl = this.barLen(this.cur.stage), el = now - this.cur.t0, T = this.cur.t0 + Math.ceil((el + 0.1) / bl) * bl;
    this.play(p, T, bl);
  }
  /** 0..1 within the current beat. */
  beatPhase() {
    const v = this.cur; if (!v || !this.running) return 0.5; const b = 60 / this.bpm; const el = this.ctx.currentTime - v.t0; return el < 0 ? 0.5 : (el / b) % 1;
  }
}
