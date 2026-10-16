// Title theme flow: silent until first input (autoplay), title theme on menus, crossfades into match music, back on quit.
import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage(); const errs = [];
p.on("pageerror", e => errs.push(String(e))); p.on("console", m => m.type() === "error" && errs.push(m.text()));
await p.goto("http://localhost:8080/?offline"); await p.waitForTimeout(600);
const st = () => p.evaluate(() => { const a = window.__audio, s = a.music?.state; return { state: window.__game.state, title: a.titleOn, track: s?.track ?? null, playing: !!s?.playing }; });
const r = [await st()]; await p.keyboard.press("Shift"); await p.waitForTimeout(500); r.push(await st());
await p.evaluate(() => window.__game.openPilot("title")); await p.waitForTimeout(300); r.push(await st());
await p.evaluate(() => { const g = window.__game; g.startLobby(); g.net.requestStart(); }); await p.waitForTimeout(400); r.push(await st());
await p.waitForFunction(() => window.__game.state === "play", null, { timeout: 30000 }); await p.waitForTimeout(1500); r.push(await st());
// offline vs bots: Esc is a real pause (field time frozen, music paused), labelled PAUSED
await p.keyboard.press("Escape"); await p.waitForTimeout(100); const pz0 = await p.evaluate(() => [window.__game.paused, window.__game.liveMatch(), window.__game.time]); await p.waitForTimeout(600);
const pz1 = await p.evaluate(() => [window.__game.time, window.__audio.music.paused]); console.log("offline pause:", JSON.stringify({ pz0, pz1 }), pz0[0] && !pz0[1] && pz1[0] === pz0[2] && pz1[1] ? "ok" : "FAIL offline pause");
await p.evaluate(() => window.__game.quitToTitle()); await p.waitForTimeout(400); r.push(await st());
console.log(JSON.stringify(r)); console.log("errors:", errs); await b.close();
