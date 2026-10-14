// Renders a WAV preview of each music stage via OfflineAudioContext in headless Chromium.
import { chromium } from "playwright"; import fs from "fs";
const b = await chromium.launch(); const p = await b.newPage(); const errs = [];
p.on("pageerror", e => errs.push(String(e))); p.on("console", m => m.type() === "error" && errs.push(m.text()));
await p.goto("http://localhost:8080/?offline");
const names = ["1_launch_101-75", "2_pursuit_75-50", "3_assault_50-25", "4_overdrive_25-10", "5_final_boss_10-2", "6_final_duel"];
for (let s = 0; s < 6; s++) {
  const t0 = Date.now();
  const r = await p.evaluate(async ([s, secs]) => {
    const ab = await window.__renderMusicPreview(s, secs); const v = new DataView(ab); let pk = 0, sum = 0, n = (ab.byteLength - 44) / 2;
    for (let i = 0; i < n; i++) { const x = Math.abs(v.getInt16(44 + i * 2, true)) / 32768; pk = Math.max(pk, x); sum += x * x; }
    const u8 = new Uint8Array(ab); let bin = ""; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return { b64: btoa(bin), peak: pk, rms: Math.sqrt(sum / n) };
  }, [s, s >= 4 ? 21 : 13]);
  fs.writeFileSync(`music_preview/${names[s]}.wav`, Buffer.from(r.b64, "base64"));
  console.log(names[s], "peak", r.peak.toFixed(3), "rms", r.rms.toFixed(3), "render ms", Date.now() - t0);
}
console.log("errors:", errs); await b.close();
