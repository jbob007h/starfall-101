// Screenshots: the three special weapons in action, the 15 final bosses (contact sheet), a duel cut-in. Needs :8080.
import { chromium } from "playwright"; import fs from "fs";
fs.mkdirSync("/workspace/shots", { recursive: true });
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = [];
p.on("pageerror", e => errs.push(String(e))); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
await p.goto("http://localhost:8080/?offline"); await p.waitForTimeout(800);
const arena = () => p.evaluate(() => { const g = window.__game; g.reset([]); g.net = { online: false, tick() {}, sendState() {}, sendAttack() {}, sendKO() {}, sendSnap() {}, spectate() {}, requestStart() {}, on() {} };
  Object.assign(g, { time: 200, enemies: [], eb: [], items: [], forms: [], popups: [], hp: 3, inv: 999, weapon: 2 }); g.cutIn = null; });
const out = {};
for (const [k, pilot, nm] of [[0, 4, "lightning"], [1, 13, "inferno"], [2, 0, "blades"]]) {
  await arena();
  await p.evaluate(pilot => { const g = window.__game; g.pilot = pilot; g.px = 136; g.py = 260; for (let i = 0; i < 4; i++) g.spawnFormation(7, i, i % 4, false, -1);
    for (let n = 0; n < 150; n++) g.update(1 / 60); g.collect({ kind: "S", x: g.px, y: g.py, vx: 0, vy: 0, t: 0 }); for (let n = 0; n < 60; n++) g.update(1 / 60); g.paused = false; }, pilot);
  await p.waitForTimeout(450);
  out[nm] = await p.evaluate(() => [window.__game.specKind, window.__game.specKills, window.__game.zapT.toFixed(1)]);
  await p.screenshot({ path: `/workspace/shots/special_${nm}.png`, clip: { x: 368, y: 8, width: 544, height: 648 } });
}
console.log("specials [kind, kills, t]", JSON.stringify(out));
// 15 bosses -> contact sheet (render each in the field, crop)
const tiles = [];
for (let i = 0; i < 15; i++) {
  await arena();
  await p.evaluate(i => { const g = window.__game; g.px = 136; g.py = 290; const e = g.spawnFinal(i, 1); g.cutIn = null; g.popups = []; for (let n = 0; n < 60 * 5; n++) g.update(1 / 60); g.popups = []; }, i);
  await p.waitForTimeout(250);
  tiles.push((await p.screenshot({ clip: { x: 368, y: 8, width: 544, height: 400 } })).toString("base64"));
}
const sheet = await b.newPage({ viewport: { width: 1640, height: 1240 } });
await sheet.setContent(`<body style="margin:0;background:#05020c;display:grid;grid-template-columns:repeat(4,400px);gap:8px;padding:8px">${tiles.map(t => `<img src="data:image/png;base64,${t}" style="width:400px;height:294px;image-rendering:pixelated">`).join("")}</body>`);
await sheet.screenshot({ path: "/workspace/shots/final_bosses_contact.png", fullPage: true });
// duel start: final boss cut-in from the opponent's pilot
await arena();
await p.evaluate(() => { const g = window.__game; g.rivals.forEach((r, i) => { if (i) { r.alive = false; r.place = 3; } }); g.rivals[0].avatar = 7; g.duel = true; g.enemies.filter(e => e.boss).forEach(e => e.dead = true); g.spawnFinal(7, g.rivals[0].id); for (let n = 0; n < 50; n++) g.update(1 / 60); });
await p.waitForTimeout(300);
console.log("duel:", JSON.stringify(await p.evaluate(() => { const g = window.__game, e = g.enemies.find(x => x.fb); return { duel: g.duel, boss: e ? g.bossName(e) : null, cut: g.cutIn?.sub ?? null }; })));
await p.screenshot({ path: "/workspace/shots/duel_cutin.png", clip: { x: 368, y: 8, width: 544, height: 648 } });
// character select: 4x4 grid (15 pilots + RANDOM), VULCAN highlighted
const p2 = await b.newPage({ viewport: { width: 1280, height: 720 } }); p2.on("pageerror", e => errs.push(String(e)));
await p2.goto("http://localhost:8080/?offline"); await p2.waitForTimeout(800);
await p2.evaluate(() => { const g = window.__game; g.openPilot("title"); g.pilotSel = 14; });
for (const k of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"]) { await p2.keyboard.press(k); await p2.waitForTimeout(80); } // round trip back to 14
console.log("select:", JSON.stringify(await p2.evaluate(() => ({ sel: window.__game.pilotSel, state: window.__game.state }))));
await p2.waitForTimeout(300); await p2.screenshot({ path: "/workspace/shots/select_4x4.png" });
console.log("errors:", errs.length ? errs.join(" | ") : "none");
await b.close();
