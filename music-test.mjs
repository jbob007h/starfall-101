// Streamed trance soundtracks: load, loop, section switching by players-left (server build + single-file build).
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
for (const url of ["http://localhost:8080/", "file:///workspace/STARFALL101.html"]) {
  const p = await b.newPage(); const errs = [];
  p.on("console", m => { if (m.type() === "error") errs.push(m.text()); }); p.on("pageerror", e => errs.push(String(e)));
  await p.goto(url); await p.waitForTimeout(500);
  for (const st of [2, 3]) {
    const r = await p.evaluate(async st => {
      const a = window.__audio; a.init(); a.setSoundtrack(st); a.setRemaining(101, false); a.startMusic();
      const w = ms => new Promise(r => setTimeout(r, ms)); const log = [];
      await w(1500); log.push([a.tier, a.tempo, !!a.sp?.running]);
      for (const [rem, duel] of [[60, false], [8, false], [2, true]]) { a.setRemaining(rem, duel); await w(4500); log.push([a.tier, a.tempo]); }
      const name = a.soundtrackName; a.stopMusic(); return { name, log };
    }, st);
    console.log(url.slice(0, 22), JSON.stringify(r));
    const ok = r.log[0][0] === 0 && r.log[1][0] === 2 && r.log[2][0] === 6 && r.log[3][0] === 7 && r.log[3][1] >= 150;
    if (!ok) { console.log("FAIL section switching"); process.exitCode = 1; }
  }
  await p.evaluate(() => window.__audio.setSoundtrack(0));
  console.log("console errors:", errs.length ? errs : "none"); if (errs.length) process.exitCode = 1;
  await p.close();
}
await b.close();
