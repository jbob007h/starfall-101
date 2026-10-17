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
// offline: lose the final duel (2nd place) -> NEW MATCH starts a fresh offline match (never spectating)
await p.evaluate(() => { const g = window.__game; g.startLobby(); g.net.requestStart(); }); await p.waitForFunction(() => window.__game.state === "play", null, { timeout: 30000 });
await p.evaluate(() => { const g = window.__game; g.rivals.forEach((x, i) => { if (i) { x.alive = false; x.place = 3; } }); }); await p.waitForTimeout(800);
await p.evaluate(() => window.__game.gameOver()); await p.waitForTimeout(1500);
const o1 = await p.evaluate(() => [window.__game.state, window.__game.place, window.__game.spec, window.__game.late]);
await p.evaluate(() => { window.__game.endSel = 0; }); await p.keyboard.press("Enter"); await p.waitForTimeout(2500);
const o2 = await p.evaluate(() => [window.__game.state, window.__game.spec, window.__game.late, window.__game.aliveAI]);
console.log("offline duel loss:", JSON.stringify({ o1, o2 }), o1[0] === "over" && o1[1] === 2 && (o2[0] === "lobby" || o2[0] === "play") && o2[1] === -1 && !o2[2] ? "ok" : "FAIL offline NEW MATCH after 2nd place");
// weapon pity: at the lowest weapon the next drop is W; with a W on screen normal odds; above lowest normal odds
const pity = await p.evaluate(() => { const g = window.__game, R = Math.random, out = [];
  const drop = () => { Math.random = () => 0.01; const e = { x: 50, y: 50, hp: 0, col: 0, spr: 0, uid: 1 }; g.enemies.push(e); try { g.killEnemy(e, true); } catch (x) { out.push("err " + x); } Math.random = R; return g.items.filter(q => q.kind !== "dot").pop()?.kind; };
  g.state = "play"; g.items = []; g.weapon = 0; out.push(drop()); out.push(drop()); g.items = []; out.push(drop()); g.weapon = 1; let n = 0, w = 0; for (let k = 0; k < 3000; k++) { g.items = []; const e = { x: 50, y: 50, hp: 0, col: 0, spr: 0, uid: 1 }; g.enemies.push(e); g.killEnemy(e, true); const it = g.items.find(q => q.kind !== "dot"); if (it) { n++; if (it.kind === "W") w++; } } out.push(+(w / Math.max(1, n)).toFixed(2)); return out; });
console.log("pity:", JSON.stringify(pity), pity[0] === "W" && pity[2] === "W" && pity[3] > 0.15 && pity[3] < 0.45 ? "ok" : "FAIL weapon pity");
console.log(JSON.stringify(r)); console.log("errors:", errs); await b.close();
