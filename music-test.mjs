// Dynamic music: STARFALL ASCENT sections by players left, momentum layer tiers, stingers, mini-boss bump,
// final-ten key change, freeze half-time, armed build, defeat -> spectate, victory -> ending, plus the raw engine API.
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
  const ev = (f, a) => p.evaluate(f, a), w = ms => p.waitForTimeout(ms);
  const st = () => ev(() => { const a = window.__audio, s = a.music.state; return { track: s.track, section: s.section, bar: s.bar, bpm: Math.round(s.bpm), tr: s.transpose, playing: s.playing, paused: s.paused, drum: s.drumMode, tier: a.layerTier, stage: a.tier, mom: +a.momentum.toFixed(2), mode: a.director.mode, ch: Object.fromEntries(Object.entries(s.channels).map(([k, v]) => [k, +v.volume.toFixed(2)])) }; });
  const gs = o => ev(o => window.__audio.updateMusic(o), o);
  // fast phrases for the test: every bar is a phrase line, no hold
  await ev(() => { const a = window.__audio; a.init(); const T = a.direction.tiers; T.phraseBars = 1; T.minHoldBars = 0; T.downPhrases = 1; a.setSoundtrack(0); window.__secs = [];
    a.updateMusic({ remaining: 101, duel: false, lowHealth: false, chain: 0, armed: false, bossActive: false, shield: false, freeze: false, lightning: false }); a.startMusic();
    a.music.on("section", e => window.__secs.push(e.section)); });
  await w(1200); let s = await st();
  ok(s.playing && s.track === "ascent" && s.section === "1" && s.bpm === 150 && s.tier === 0, "start: ascent/1 @150, tier 0 " + JSON.stringify({ section: s.section, bpm: s.bpm, tier: s.tier }));
  ok(s.ch.fm4 === 0 && s.ch.fm2 === 0 && s.ch.sq1 === 0 && s.ch.fm5 === 0 && s.ch.fm1 === 1, "tier 0 = lead/bass/drums only " + JSON.stringify(s.ch));
  await gs({ remaining: 60 }); await w(2200); s = await st();
  ok(s.section === "3" && s.bpm >= 156, "60 left -> section 3, tempo ramps to 158 " + JSON.stringify({ section: s.section, bpm: s.bpm }));
  // momentum: three mini-boss sends -> climbs tiers one bar at a time
  await ev(() => { for (let i = 0; i < 3; i++) window.__audio.musicEvent("sent", 2); }); s = await st();
  ok(s.mom >= 0.9, "attacks sent push momentum up (" + s.mom + ")");
  await w(5500); s = await st();
  ok(s.tier === 3 && s.ch.fm2 === 1 && s.ch.sq1 === 1 && s.ch.fm4 > 1, "momentum -> tier 3: echo + harmony + arp in " + JSON.stringify({ tier: s.tier, ch: s.ch }));
  await ev(() => { window.__audio.director.momentum = 0; window.__audio.musicEvent("hurt"); }); await w(2400); s = await st();
  ok(s.tier < 3, "momentum drained -> tier drops one step per phrase (now " + s.tier + ")");
  // mini-boss bumps one section up, full band
  await gs({ bossActive: true }); await w(2000); s = await st();
  ok(s.section === "4" && s.ch.fm2 === 1 && s.ch.sq1 === 1, "mini-boss -> section 4, full band " + JSON.stringify({ section: s.section, ch: s.ch }));
  await gs({ bossActive: false }); await ev(() => window.__audio.musicEvent("bossDown")); await w(1800); s = await st();
  ok(s.section === "3", "boss gone -> back to section 3 (" + s.section + ")");
  // freeze -> half-time drums, section held
  await gs({ freeze: true, remaining: 45 }); await w(1500); s = await st();
  ok(s.drum === "half" && s.section === "3", "freeze: half-time drums, section held " + JSON.stringify({ drum: s.drum, section: s.section }));
  await gs({ freeze: false }); await w(2000); s = await st();
  ok(s.drum === "normal" && s.section === "4", "freeze over -> normal drums, cue catches up to section 4 (" + s.section + ")");
  // armed build
  const bl = await ev(() => { window.__audio.updateMusic({ armed: true, chain: 30 }); return window.__audio.music.build; });
  ok(bl > 0.6, "armed at chain 30 -> snare build " + bl.toFixed(2)); await gs({ armed: false, chain: 0 });
  // final ten key change, duel
  await gs({ remaining: 8 }); await w(2200); s = await st();
  ok(s.section === "7" && s.tr === 1 && s.bpm >= 170, "final ten -> section 7, key +1 " + JSON.stringify({ section: s.section, tr: s.tr, bpm: s.bpm }));
  await gs({ remaining: 2, duel: true }); await w(2200); s = await st();
  ok(s.section === "8" && s.tr === 1, "duel -> section 8 " + JSON.stringify({ section: s.section, bpm: s.bpm }));
  // chord-aware kill pitch
  const ch = await ev(() => window.__audio.music.currentChord());
  ok(ch && ch.iv.length === 3, "currentChord " + JSON.stringify(ch));
  // pause / resume
  await ev(() => window.__audio.pauseMusic(true)); const b0 = (await st()).bar; await w(1200); s = await st();
  ok(s.paused && s.bar === b0, "pause freezes"); await ev(() => window.__audio.pauseMusic(false));
  // defeat -> spectate music; new match restarts
  await ev(() => window.__audio.musicEvent("defeat")); await w(3000); s = await st();
  ok(s.mode === "spectate" && s.section === "1" && s.ch.fm1 === 0 && s.tr === 0, "defeat -> spectate: section 1, lead out, key reset " + JSON.stringify({ mode: s.mode, section: s.section, fm1: s.ch.fm1 }));
  await ev(() => { const a = window.__audio; a.updateMusic({ remaining: 101, duel: false }); a.startMusic(); }); await w(800); s = await st();
  ok(s.mode === "play" && s.section === "1" && s.tier === 0 && s.ch.fm1 === 1, "new match restarts from spectate music");
  // victory -> fanfare then stop
  await ev(() => window.__audio.musicEvent("victory")); await w(4500); s = await st();
  ok(!s.playing && s.mode === "ended", "victory fanfare ends the music");
  // classic plan still works
  await ev(() => { const a = window.__audio; a.setSoundtrack(1); a.updateMusic({ remaining: 70, duel: false }); a.startMusic(); }); await w(1200); s = await st();
  ok(s.track === "aurora" && s.section === "B", "CLASSIC FM plan: 70 left -> aurora/B " + JSON.stringify({ track: s.track, section: s.section }));
  await ev(() => { const a = window.__audio; a.stopMusic(); a.setSoundtrack(0); });
  console.log("sections heard:", (await ev(() => window.__secs)).join(" "));
  ok(!errs.length, "console errors: " + (errs.length ? errs.join(" | ") : "none"));
  await p.close();
}
await b.close(); process.exitCode = fail ? 1 : 0;
