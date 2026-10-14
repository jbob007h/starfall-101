// FM music engine + director: game-state cues, section/track changes on bar lines, tempo, channels, pause, events.
// Needs `npm run serve` (or `npm start`) on :8080; also runs against the single-file build if it exists.
import { chromium } from "playwright"; import fs from "fs";
const urls = ["http://localhost:8080/?offline"]; if (fs.existsSync("/workspace/STARFALL101.html")) urls.push("file:///workspace/STARFALL101.html");
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
let fail = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fail++; };
for (const url of urls) {
  console.log("--", url);
  const p = await b.newPage(); const errs = [];
  p.on("console", m => { if (m.type() === "error") errs.push(m.text()); }); p.on("pageerror", e => errs.push(String(e)));
  await p.goto(url); await p.waitForTimeout(400);
  const ev = f => p.evaluate(f), w = ms => p.waitForTimeout(ms);
  const st = () => ev(() => { const s = window.__audio.music.state; return { track: s.track, section: s.section, bar: s.bar, bpm: Math.round(s.bpm), playing: s.playing, paused: s.paused, tier: window.__audio.tier }; });
  await ev(() => { const a = window.__audio; a.init(); a.setSoundtrack(0); window.__bars = 0; window.__secs = [];
    a.updateMusic({ remaining: 101, duel: false, lowHealth: false, chain: 0 }); a.startMusic();
    a.music.on("bar", () => window.__bars++); a.music.on("section", e => window.__secs.push(e.track + "/" + e.section)); });
  await w(1600); let s = await st();
  ok(s.playing && s.track === "aurora" && s.section === "A" && s.bpm === 172, "start: aurora/A @172 " + JSON.stringify(s));
  await ev(() => window.__audio.updateMusic({ remaining: 70 })); await w(2600); s = await st();
  ok(s.track === "aurora" && s.section === "B", "70 left -> aurora/B on a bar line " + JSON.stringify(s));
  await ev(() => window.__audio.updateMusic({ remaining: 45 })); await w(3200); s = await st();
  ok(s.track === "hull" && s.section === "A" && s.bpm === 140, "45 left -> crossfade to hull/A @140 " + JSON.stringify(s));
  await ev(() => window.__audio.updateMusic({ remaining: 2, duel: true })); await w(5500); s = await st();
  ok(s.track === "vector" && s.section === "C" && s.bpm === 164, "duel -> vector/C, tempo ramped to 164 " + JSON.stringify(s));
  const ch = await ev(() => { const m = window.__audio.music; m.setChannel("fm1", { mute: true }); m.setChannel("fm4", { volume: 0.3 }); const c = m.state.channels; return [c.fm1.mute, c.fm4.volume]; });
  ok(ch[0] === true && ch[1] === 0.3, "setChannel mute / volume " + JSON.stringify(ch));
  await ev(() => window.__audio.music.resetChannels());
  await ev(() => window.__audio.music.queue({ section: "A", at: "beat" })); await w(900); s = await st();
  ok(s.section === "A", "direct cue: section A on next beat " + JSON.stringify(s));
  await ev(() => window.__audio.music.setTempo(120, 0)); await w(600); s = await st();
  ok(s.bpm === 120, "setTempo override 120 " + JSON.stringify(s));
  await ev(() => window.__audio.music.setTempo(null, 0));
  await ev(() => window.__audio.pauseMusic(true)); const b0 = await ev(() => window.__bars); await w(2500); const b1 = await ev(() => window.__bars); s = await st();
  ok(s.paused && b1 === b0, "pause freezes position (bars " + b0 + " -> " + b1 + ")");
  await ev(() => window.__audio.pauseMusic(false)); await w(2500); const b2 = await ev(() => window.__bars);
  ok(b2 > b1, "resume continues (bars " + b1 + " -> " + b2 + ")");
  ok(await ev(() => window.__audio.beatPhase() >= 0 && window.__audio.beatPhase() < 1), "beatPhase in [0,1)");
  console.log("sections heard:", (await ev(() => window.__secs)).join(" "));
  await ev(() => { window.__audio.setSoundtrack(3); }); await w(1200); s = await st();
  ok(s.track === "vector", "soundtrack switch -> LAST VECTOR plan " + JSON.stringify(s));
  await ev(() => { window.__audio.setSoundtrack(0); window.__audio.stopMusic(); }); s = await st();
  ok(!s.playing, "stop");
  ok(!errs.length, "console errors: " + (errs.length ? errs.join(" | ") : "none"));
  await p.close();
}
await b.close(); process.exitCode = fail ? 1 : 0;
