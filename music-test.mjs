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
  // danger = HP + bombs (bomb use itself is neutral: no momentum change)
  const m0 = (await st()).mom; await ev(() => window.__audio.musicEvent("bomb")); s = await st();
  ok(s.mom <= m0, "bomb use doesn't raise momentum (" + m0 + " -> " + s.mom + ")"); await w(1800); // let the bomb duck finish
  const dz = async o => { await gs(o); await w(250); return ev(() => ({ d: window.__audio.danger, fm5: +window.__audio.music.channel("fm5").volume.toFixed(2) })); };
  let d = await dz({ hp: 3, bombs: 0 }); ok(d.d === 0, "3 HP, no bombs -> safe (0)");
  d = await dz({ hp: 2, bombs: 1 }); ok(d.d === 1, "2 HP, 1 bomb -> caution (1)");
  d = await dz({ hp: 1, bombs: 2 }); ok(d.d === 2, "1 HP, 2 bombs -> danger (2)");
  const f5 = d.fm5; d = await dz({ hp: 1, bombs: 0 });
  ok(d.d === 3 && d.fm5 <= f5 * 0.55, "1 HP, no bombs -> critical (3), band thinned " + JSON.stringify(d));
  const pulse = await ev(() => [0, 1, 2, 3].map(b => window.__audio.director.dangerPulse(b)));
  ok(pulse.every(p => p.heart === 1 && p.tick), "critical: heartbeat every beat + off-beat ticks");
  d = await dz({ hp: 3, bombs: 3 }); ok(d.d === 0, "recovered -> safe");
  // triple bomb: power-up on screen at max bombs pushes the tempo; touching it = reward swell + one duck per blast + tempo eases back
  const base = (await st()).bpm;
  await gs({ tripleReady: true }); await w(2200); s = await st();
  ok(s.bpm >= base + 9, "bomb power-up on screen at 5 bombs -> tempo up (" + base + " -> " + s.bpm + ")");
  const mT = (await st()).mom;
  await ev(() => { const a = window.__audio; a.updateMusic({ tripleReady: false }); a.tripleBomb(); a.musicEvent("tripleBomb"); [0, 180, 360].forEach(d => setTimeout(() => a.musicEvent("bombBlast"), d)); });
  const bass = () => ev(() => { window.__audio.updateMusic({}); return window.__audio.music.channel("fm3").volume; }); // the game ticks the director every frame
  await w(250); const duck1 = await bass(); await w(450); const duck3 = await bass();
  s = await st();
  ok(s.mom > mT, "triple bomb rewards momentum (" + mT + " -> " + s.mom + ")");
  ok(duck1 < 0.6 && duck3 < 0.6, "each blast re-ducks the band (bass " + duck1.toFixed(2) + ", " + duck3.toFixed(2) + ")");
  await w(3200); s = await st();
  ok(Math.abs(s.bpm - base) <= 1, "tempo eases back down after the pickup (" + s.bpm + ")");
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
  // EMERALD SKY: full adaptive walk (sections 1-8, tiers, boss bump, danger, key change, duel, spectate, victory)
  {
    const ei = await ev(() => { const a = window.__audio; for (let i = 0; i < 16; i++) { a.setSoundtrack(i); if (a.director.planName === "EMERALD SKY") return i; } return -1; });
    ok(ei >= 2, "EMERALD SKY is a selectable soundtrack (index " + ei + ")");
    await ev(() => { const a = window.__audio; a.updateMusic({ remaining: 101, duel: false, hp: 3, bombs: 2, bossActive: false }); a.startMusic(); }); await w(1000); s = await st();
    ok(s.track === "emerald" && s.section === "1" && s.bpm === 140 && s.tier === 0, "emerald: start 1 @140 tier 0 " + JSON.stringify({ track: s.track, section: s.section, bpm: s.bpm, tier: s.tier }));
    for (const [rem, sec] of [[80, "2"], [60, "3"], [45, "4"], [30, "5"], [15, "6"]]) {
      await gs({ remaining: rem }); await w(2000); s = await st();
      ok(s.section === sec && s.tr === 0, `emerald: ${rem} left -> section ${sec} (${s.section} @${s.bpm})`);
    }
    await ev(() => { for (let i = 0; i < 3; i++) window.__audio.musicEvent("sent", 2); }); await w(5000); s = await st();
    ok(s.tier === 3 && s.ch.fm2 === 1 && s.ch.sq1 === 1, "emerald: momentum -> tier 3 (" + s.tier + ")");
    await gs({ remaining: 30, bossActive: true }); await w(2000); s = await st();
    ok(s.section === "6", "emerald: boss bumps 5 -> 6 (" + s.section + ")"); await gs({ bossActive: false });
    let dd = await (async () => { await gs({ hp: 1, bombs: 0 }); await w(300); return ev(() => window.__audio.danger); })();
    ok(dd === 3, "emerald: critical danger (" + dd + ")"); await gs({ hp: 3, bombs: 2 });
    await gs({ remaining: 8 }); await w(2200); s = await st();
    ok(s.section === "7" && s.tr === 1 && s.bpm >= 170, "emerald: final ten -> 7, key +1 " + JSON.stringify({ section: s.section, tr: s.tr, bpm: s.bpm }));
    await gs({ remaining: 2, duel: true }); await w(2200); s = await st();
    ok(s.section === "8" && s.tr === 1 && s.bpm >= 180, "emerald: duel -> 8 " + JSON.stringify({ section: s.section, bpm: s.bpm }));
    await ev(() => window.__audio.musicEvent("defeat")); await w(3000); s = await st();
    ok(s.mode === "spectate" && s.track === "emerald" && s.section === "1" && s.ch.fm1 === 0 && s.tr === 0, "emerald: defeat -> spectate section 1 " + JSON.stringify({ mode: s.mode, section: s.section }));
    await ev(() => { const a = window.__audio; a.updateMusic({ remaining: 101, duel: false }); a.startMusic(); }); await w(800);
    await ev(() => window.__audio.musicEvent("victory")); await w(4500); s = await st();
    ok(!s.playing && s.mode === "ended", "emerald: victory fanfare ends the music");
    await ev(() => window.__audio.setSoundtrack(0));
  }
  console.log("sections heard:", (await ev(() => window.__secs)).join(" "));
  ok(!errs.length, "console errors: " + (errs.length ? errs.join(" | ") : "none"));
  await p.close();
}
await b.close(); process.exitCode = fail ? 1 : 0;
