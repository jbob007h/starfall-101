// Renders a WAV of each soundtrack track (one full A-B-C loop) via OfflineAudioContext in headless Chromium.
// Needs `npm run serve` on :8080. Output: music_preview/<n>_<track>.wav, plus 0_ascent_demo.wav (layers/stingers/key change walk).
import { chromium } from "playwright"; import fs from "fs";
const b = await chromium.launch(); const p = await b.newPage(); const errs = [];
p.on("pageerror", e => errs.push(String(e))); p.on("console", m => m.type() === "error" && errs.push(m.text()));
await p.goto("http://localhost:8080/?offline");
const tracks = await p.evaluate(() => window.__soundtracks);
fs.mkdirSync("music_preview", { recursive: true });
const jobs = [{ i: 0, demo: true, name: "0_ascent_demo" }, ...tracks.map((t, i) => ({ i, demo: false, name: `${i + 1}_${t.id}` }))];
for (const { i, demo, name } of jobs) {
  const t = tracks[i], bars = t.sections.reduce((a, s) => a + s.bars, 0), secs = t.sections.reduce((a, s) => a + s.bars * 240 / (s.bpm ?? t.bpm), 0) + 2, t0 = Date.now();
  const r = await p.evaluate(async ([i, secs, demo]) => {
    const ab = await window.__renderMusicPreview(i, secs, 44100, demo); const v = new DataView(ab); let pk = 0, sum = 0, n = (ab.byteLength - 44) / 2;
    for (let j = 0; j < n; j++) { const x = Math.abs(v.getInt16(44 + j * 2, true)) / 32768; pk = Math.max(pk, x); sum += x * x; }
    const u8 = new Uint8Array(ab); let bin = ""; for (let j = 0; j < u8.length; j += 0x8000) bin += String.fromCharCode(...u8.subarray(j, j + 0x8000));
    return { b64: btoa(bin), peak: pk, rms: Math.sqrt(sum / n) };
  }, [i, secs, demo]);
  fs.writeFileSync(`music_preview/${name}.wav`, Buffer.from(r.b64, "base64"));
  console.log(name, t.bpm, "bpm", bars, "bars", secs.toFixed(1) + "s", "peak", r.peak.toFixed(3), "rms", r.rms.toFixed(3), "render ms", Date.now() - t0);
}
console.log("errors:", errs); await b.close();
