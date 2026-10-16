// Multiplayer smoke test: run `PORT=8090 npm start` first.
import { chromium } from "playwright";
const URL = process.env.URL || "http://localhost:8090/";
const b = await chromium.launch();
const names = ["ALPHA", "BRAVO", "CHARLIE"]; const pages = []; const errs = [];
const PILOT = { ALPHA: 2, BRAVO: 5, CHARLIE: 3 }; // each human's saved pilot choice
for (const n of names) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const p = await ctx.newPage();
  await p.addInitScript(v => { try { localStorage.setItem("sf101pilot2", String(v)); } catch {} }, PILOT[n]);
  if (n === "ALPHA") await p.addInitScript(() => { // stub controller for spectate switching
    const btn = () => ({ pressed: false, touched: false, value: 0 });
    const gp = { id: "Stub Xbox Controller (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn) };
    window.__pad = { gp, on: false, set(i, v) { gp.buttons[i] = { pressed: v, touched: v, value: v ? 1 : 0 }; } };
    navigator.getGamepads = () => [window.__pad.on ? gp : null, null, null, null];
  });
  p.on("console", m => { if (m.type() === "error") errs.push(n + ": " + m.text()); }); p.on("pageerror", e => errs.push(n + ": " + e));
  await p.goto(URL + "?name=" + n); await p.waitForFunction(() => window.__netReady); pages.push(p);
}
const ev = (p, f, a) => p.evaluate(f, a);
console.log("online:", await Promise.all(pages.map(p => ev(p, () => window.__game.net.online))));
for (const p of pages) { await p.keyboard.press("Enter"); await p.waitForTimeout(200); await p.keyboard.press("Enter"); await p.waitForTimeout(200); await p.keyboard.press("Enter"); await p.waitForTimeout(300); } // title > name > pilot > lobby
await pages[0].waitForTimeout(1200);
for (const p of pages) console.log("lobby", await ev(p, () => [window.__game.state, window.__game.lobbyHumans, window.__game.lobbyCount, window.__game.lobbyLog.join("|"), Math.ceil(window.__game.lobbyCd)]));
await pages[0].screenshot({ path: "screenshot5.png" });
for (const p of pages) { await p.keyboard.press("Enter"); } // everyone votes start
await pages[0].waitForTimeout(1200);
const humans = await Promise.all(pages.map(p => ev(p, () => [window.__game.state, window.__game.rivals.filter(r => !r.isBot).map(r => r.name + "#" + (r.id + 1)).join(",")])));
console.log("in match (state, human rivals seen):", humans);
const seen = await Promise.all(pages.map(p => ev(p, () => Object.fromEntries(window.__game.rivals.filter(r => !r.isBot).map(r => [r.name, r.avatar])))));
console.log("pilots seen by each human:", seen);
if (!names.every((n, i) => Object.entries(seen[i]).every(([o, av]) => av === PILOT[o]))) { console.log("FAIL other humans' chosen pilots"); process.exitCode = 1; }
else console.log("ok   each human sees the others' chosen pilots");
for (const p of pages) await p.keyboard.down("KeyZ");
await pages[0].waitForTimeout(3000);
// ALPHA cashes in a bullet wave on BRAVO
const sent = await ev(pages[0], () => { const g = window.__game; const t = g.rivals.find(r => r.name === "BRAVO"); g.mode = 0; g.randTarget = t.id; g.randCd = 99; g.chain = 45; g.eligible = true; g.cashIn(true); return t.id; });
console.log("ALPHA sent wave to local id", sent);
await pages[1].waitForTimeout(2400);
console.log("BRAVO attackLog:", JSON.stringify(await ev(pages[1], () => window.__game.attackLog.filter(a => !a.from.startsWith("BOT")))));
console.log("BRAVO bosses:", await ev(pages[1], () => window.__game.enemies.filter(e => e.boss).map(e => e.bv)));
await pages[1].screenshot({ path: "screenshot6.png" });
// ---- spectator mode: ALPHA is eliminated and watches the remaining humans
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const specInfo = p => ev(p, () => { const g = window.__game, v = g.specView(); return { state: g.state, humans: g.specIds().map(i => g.rivals[i].name).join(","), spec: g.spec >= 0 ? g.rivals[g.spec].name : null, snaps: g.specCount, lb: g.specLb,
  view: v ? { px: Math.round(v.px), py: Math.round(v.py), hp: v.hp, chain: v.chain, enemies: v.enemies.length, eb: v.eb.length, pb: v.pb.length, score: v.score } : null }; });
for (const p of pages.slice(1)) await ev(p, () => { window.__game.inv = 1e9; }); // keep the watched pilots alive during the test
await ev(pages[0], () => { const g = window.__game; g.inv = 0; g.gameOver(); });
await pages[0].waitForTimeout(1600);
let s0 = await specInfo(pages[0]); console.log("ALPHA spectating:", JSON.stringify(s0));
ok(s0.state === "over" && ["BRAVO", "CHARLIE"].includes(s0.spec) && s0.snaps > 5 && s0.view && s0.view.pb > 0, "ALPHA out -> spectating a live human with snapshots");
const watchedBy = await Promise.all(pages.slice(1).map(p => ev(p, () => window.__game.watched)));
console.log("watched flags [BRAVO, CHARLIE]:", watchedBy); ok(watchedBy.filter(Boolean).length === 1, "only the watched human streams snapshots");
const c0 = s0.snaps; await pages[0].waitForTimeout(1000); const rate = (await specInfo(pages[0])).snaps - c0; console.log("snapshots/s:", rate); ok(rate >= 12 && rate <= 22, "snapshot rate ~15 Hz");
// interpolation: the rendered ship moves smoothly between 15 Hz snapshots
const wName = s0.spec === "BRAVO" ? 1 : 2; await pages[wName].keyboard.down("ArrowLeft"); await pages[0].waitForTimeout(400);
const smooth = await ev(pages[0], () => new Promise(r => { const xs = []; const f = () => { const v = window.__game.specView(); xs.push(v ? Math.round(v.px * 10) + "," + (v.pb[0] ? Math.round(v.pb[0].y * 10) : "") : ""); if (xs.length < 30) requestAnimationFrame(f); else r(new Set(xs).size); }; requestAnimationFrame(f); }));
await pages[wName].keyboard.up("ArrowLeft");
console.log("distinct interpolated frames (of 30):", smooth); ok(smooth > 18, "interpolated view changes nearly every frame");
await pages[0].keyboard.press("ArrowRight"); await pages[0].waitForTimeout(900);
const s1 = await specInfo(pages[0]); console.log("after RIGHT:", s1.spec, s1.snaps); ok(s1.spec && s1.spec !== s0.spec, "keyboard switches spectated pilot");
await pages[0].screenshot({ path: "spectate.png" });
await ev(pages[0], () => { window.__pad.on = true; }); await pages[0].waitForTimeout(200);
await ev(pages[0], () => window.__pad.set(5, true)); await pages[0].waitForTimeout(100); await ev(pages[0], () => window.__pad.set(5, false)); await pages[0].waitForTimeout(700);
const s2 = await specInfo(pages[0]); console.log("after RB:", s2.spec); ok(s2.spec === s0.spec, "controller RB switches back");
await ev(pages[0], () => window.__pad.set(3, true)); await pages[0].waitForTimeout(100); await ev(pages[0], () => window.__pad.set(3, false)); await pages[0].waitForTimeout(200);
ok((await specInfo(pages[0])).lb === true, "Y shows leaderboard while spectating");
await pages[0].keyboard.press("KeyL"); await pages[0].waitForTimeout(100); ok((await specInfo(pages[0])).lb === false, "L returns to spectating");
// make sure ALPHA watches CHARLIE, then CHARLIE drops: ALPHA should auto-switch to BRAVO
if ((await specInfo(pages[0])).spec !== "CHARLIE") { await pages[0].keyboard.press("ArrowRight"); await pages[0].waitForTimeout(500); }
// CHARLIE disconnects -> should be KO'd for others
await pages[2].context().close();
await pages[0].waitForTimeout(800);
console.log("ALPHA sees CHARLIE alive?", await ev(pages[0], () => window.__game.rivals.find(r => r.name === "CHARLIE").alive));
const s3 = await specInfo(pages[0]); console.log("after CHARLIE left, ALPHA watches:", s3.spec); ok(s3.spec === "BRAVO", "auto-switch when the watched pilot is out");
await pages[0].waitForTimeout(600); ok((await specInfo(pages[0])).snaps > s3.snaps, "snapshots flow from the new pilot");
await ev(pages[1], () => { const g = window.__game; g.inv = 0; g.dead = false; g.gameOver(); }); await pages[0].waitForTimeout(1200);
const s4 = await specInfo(pages[0]); console.log("no humans left:", JSON.stringify(s4)); ok(s4.spec === null, "falls back to the leaderboard when no humans remain");
await pages[0].screenshot({ path: "spectate_end.png" });
// ---- online: ALPHA returns to the title from the end screen, then BRAVO+ALPHA play a new match
await pages[0].keyboard.press("Escape"); await pages[0].waitForTimeout(300);
ok(await ev(pages[0], () => [window.__game.state, window.__game.spec, window.__audio.playing].join()) === "title,-1,false", "ALPHA: Esc on end screen -> title, spectating stopped, music stopped");
await ev(pages[1], () => { window.__game.quitToTitle(); });
for (const p of [pages[0], pages[1]]) { await p.keyboard.press("Enter"); await p.waitForTimeout(200); await p.keyboard.press("Enter"); await p.waitForTimeout(200); await p.keyboard.press("Enter"); await p.waitForTimeout(400); }
const lb = await Promise.all([0, 1].map(i => ev(pages[i], () => [window.__game.state, window.__game.lobbyHumans])));
console.log("relobby:", JSON.stringify(lb)); ok(lb.every(x => x[0] === "lobby" && x[1] === 2), "both rejoin the online lobby after leaving to title");
for (const p of [pages[0], pages[1]]) await p.keyboard.press("Enter");
await pages[0].waitForTimeout(1500);
const nm = await Promise.all([0, 1].map(i => ev(pages[i], () => [window.__game.state, window.__game.rivals.filter(r => !r.isBot).map(r => r.name).join()])));
console.log("new match:", JSON.stringify(nm)); ok(nm[0][0] === "play" && nm[0][1] === "BRAVO" && nm[1][1] === "ALPHA", "new online match starts with both humans");
// quit mid-match from the pause menu: server KOs ALPHA for BRAVO
await pages[0].keyboard.press("Escape"); await pages[0].waitForTimeout(150); await pages[0].keyboard.press("ArrowDown"); await pages[0].waitForTimeout(150); await pages[0].keyboard.press("Enter"); await pages[0].waitForTimeout(800);
ok(await ev(pages[0], () => window.__game.state) === "title", "online pause > QUIT TO TITLE");
ok(await ev(pages[1], () => !window.__game.rivals.find(r => r.name === "ALPHA").alive), "server KOs the pilot who quit");
console.log("errors:", errs); if (errs.length) process.exitCode = 1;
await b.close();
