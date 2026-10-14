import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
// Stub a standard-mapping gamepad; tests drive it through window.__pad
await p.addInitScript(() => {
  const btn = () => ({ pressed: false, touched: false, value: 0 });
  const gp = { id: "Stub Xbox Controller (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn) };
  window.__pad = { gp, on: false, set(i, v) { gp.buttons[i] = { pressed: v, touched: v, value: v ? 1 : 0 }; }, axes(a) { gp.axes = a; } };
  navigator.getGamepads = () => [window.__pad.on ? gp : null, null, null, null];
});
p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
p.on("pageerror", e => errs.push(String(e)));
await p.goto("http://localhost:8080/");
await p.waitForTimeout(800);
await p.evaluate(() => { window.__pad.on = true; });
await p.waitForTimeout(400);
console.log("pad title:", await p.evaluate(() => [window.__game.padMsg, window.__game.padMsgT > 0]));
await p.screenshot({ path: "title_pad.png" });
const tap = async i => { await p.evaluate(i => window.__pad.set(i, true), i); await p.waitForTimeout(80); await p.evaluate(i => window.__pad.set(i, false), i); await p.waitForTimeout(80); };
await tap(9); // Start -> name entry
await p.waitForTimeout(300);
for (let i = 0; i < 10; i++) await p.keyboard.press("Backspace");
await p.keyboard.type("ACE"); await tap(12); await tap(12); await tap(15); // pad picker: new letter A -> B, then move right
for (const k of ["Digit7", "Digit7"]) await p.keyboard.press(k);
await p.waitForTimeout(300);
console.log("name entry:", await p.evaluate(() => [window.__game.state, window.__game.nameBuf.join("")]));
await p.screenshot({ path: "screenshot10.png" });
await tap(9); // Start -> lobby
await p.waitForTimeout(900);
console.log("name saved:", await p.evaluate(() => [window.__game.name, localStorage.getItem("sf101name")]));
console.log("lobby:", await p.evaluate(() => [window.__game.state, window.__game.lobbyCount, window.__game.lobbyLog.join("|")]));
await p.screenshot({ path: "lobby.png" });
await tap(9); // Start in lobby -> vote start (offline: starts now)
await p.waitForTimeout(600);
// gamepad gameplay: analog stick + hold A, right-stick flick to KOs
await p.evaluate(() => { window.__pad.set(0, true); window.__pad.axes([0.8, -0.3, 0, 0]); });
const x0 = await p.evaluate(() => window.__game.px); await p.waitForTimeout(500);
const x1 = await p.evaluate(() => [window.__game.px, window.__game.pb.length]);
await p.evaluate(() => window.__pad.axes([0, 0, 1, 0])); await p.waitForTimeout(100); await p.evaluate(() => window.__pad.axes([0, 0, 0, 0]));
await tap(2);
console.log("pad move", x0, "->", x1, "mode", await p.evaluate(() => window.__game.mode));
await p.evaluate(() => { window.__pad.set(0, false); window.__pad.axes([-0.6, 0, 0, 0]); }); await p.waitForTimeout(300); await p.evaluate(() => window.__pad.axes([0, 0, 0, 0]));
const st = await p.evaluate(() => window.__game.state);
console.log("state after enter:", st);
const dirs = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
await p.keyboard.down("KeyZ"); // hold fire
const t0 = Date.now(); let shot1 = false;
while (Date.now() - t0 < 32000) {
  const d = dirs[Math.floor(Math.random() * 4)];
  await p.keyboard.down(d); if (Math.random() < 0.3) await p.keyboard.down("Shift");
  await p.waitForTimeout(250 + Math.random() * 300);
  await p.keyboard.up(d); await p.keyboard.up("Shift");
    if (Math.random() < 0.05) await p.keyboard.press("Digit" + (1 + Math.floor(Math.random() * 4)));
  if (!shot1 && Date.now() - t0 > 6000) { await p.screenshot({ path: "screenshot3.png" }); shot1 = true; }
}
const s = await p.evaluate(() => { const g = window.__game; return { state: g.state, time: g.time, hp: g.hp, chain: g.chain, score: g.score, alive: g.aliveAI, enemies: g.enemies.length, projs: g.projs.length, warns: g.warns.length, fps: 0 }; });
console.log(JSON.stringify(s));
// push to an action-heavy moment: force time forward via fast-forward of simulation
await p.evaluate(() => { const g = window.__game; if (g.state !== "play") g.reset([]); g.time = 200; g.hp = 3; g.inv = 99; for (let i = 0; i < 400; i++) g.update(1/60); g.chain = 20; g.eligible = true; g.cashIn(); g.hitstop = 0; });
await p.waitForTimeout(400);
await p.evaluate(() => { const g = window.__game; g.chain = 45; g.eligible = true; g.cashIn(); g.hitstop = 0; });
await p.evaluate(() => { const g = window.__game; g.warns.push({ t: 0.01, tier: 2, power: 20, sender: 4, x: 100 }, { t: 0.01, tier: 0, power: 12, sender: 7, x: 60 }); });
await p.waitForTimeout(2500);
await p.evaluate(() => { const g = window.__game; g.chain = 12; g.eligible = true; g.chainT = 0.01; g.hitstop = 0; });
await p.waitForTimeout(300);
await p.screenshot({ path: "screenshot4.png" });
// --- all 4 mini-boss designs: spawn each, let it fight for a bit
for (const v of [0, 1, 2, 3]) {
  await p.evaluate(v => { const g = window.__game; g.enemies = g.enemies.filter(e => !e.boss); g.eb = []; g.hp = 3; g.inv = 99; g.spawnBoss(v, 20, 4); }, v);
  await p.waitForTimeout(1800);
  console.log("boss", v, await p.evaluate(() => { const b = window.__game.enemies.find(e => e.boss); return b ? [b.bv, Math.round(b.hp), b.tur ? b.tur.map(Math.round) : null, window.__game.eb.length] : "dead"; }));
}
await p.evaluate(() => { const g = window.__game; g.enemies = g.enemies.filter(e => !e.boss); g.eb = []; g.spawnBoss(2, 25, 9); g.zapT = 0; });
await p.waitForTimeout(2600);
await p.screenshot({ path: "screenshot7.png" });
// --- lightning + INCOMING / SENT labels
await p.evaluate(() => { const g = window.__game; g.enemies = g.enemies.filter(e => !e.boss); g.eb = []; g.popups = [];
  g.spawnFormation(7, 1, 0, false, -1); g.spawnFormation(6, 0, 2, false, -1);
  g.collect({ kind: "L", x: g.px, y: g.py, vx: 0, vy: 0, t: 0 });
  g.onNet({ type: "attack", from: 5, to: -1, tier: 2, power: 20, variant: 3 }); });
await p.waitForTimeout(900);
const zap0 = await p.evaluate(() => [window.__game.zapT.toFixed(1), window.__game.bolts.length, window.__game.score]);
await p.evaluate(() => { const g = window.__game; g.spawnFormation(8, 2, 3, false, -1); g.spawnFormation(6, 3, 0, false, -1); for (const e of g.enemies) if (!e.boss) e.hp = 30; g.zapT = 4;
  g.chain = 20; g.eligible = true; g.hitstop = 0; g.cashIn(); g.hitstop = 0; });
await p.waitForTimeout(700);
await p.evaluate(() => { const g = window.__game; g.onNet({ type: "attack", from: 7, to: -1, tier: 1, power: 12, variant: 0 }); for (const q of g.projs) if (!q.out) q.t = 0.99; });
await p.waitForTimeout(120);
await p.screenshot({ path: "screenshot8.png" });
console.log("lightning [t, bolts, score]", zap0, "texts:", await p.evaluate(() => window.__game.popups.map(q => q.text).join(" | ")));
await p.waitForTimeout(1500);
console.log("incoming boss variant spawned:", await p.evaluate(() => window.__game.enemies.filter(e => e.boss).map(e => e.bv)));
await p.evaluate(() => { const g = window.__game; g.bombs = 5; g.chain = 8; g.chainT = 2; g.spawnFormation(6, 1, 3, false, -1); g.collect({ kind: "B", x: 0, y: 0, vx: 0, vy: 0, t: 0 }); });
await p.waitForTimeout(150); await p.screenshot({ path: "triple_bomb.png" }); await p.waitForTimeout(600);
console.log("triple bomb [bombs, chain>0, queue]:", await p.evaluate(() => { const g = window.__game; return [g.bombs, g.chain > 0, g.tripleQ.length]; }));
// upgraded enemies late in the match
await p.evaluate(() => { const g = window.__game; g.hp = 3; g.inv = 99; g.time = 330; g.enemies.length = 0; g.eb.length = 0; for (let i = 0; i < 4; i++) g.spawnFormation(6, i, i % 3, false, -1); });
await p.waitForTimeout(2600);
await p.screenshot({ path: "screenshot9.png" });
console.log("upgrade tiers [t0,t1,t2] / hp:", await p.evaluate(() => { const g = window.__game, c = [0, 0, 0]; g.enemies.filter(e => !e.boss).forEach(e => c[e.up ?? 0]++); return [c, g.enemies.slice(0, 6).map(e => e.hp)]; }));
console.log("share @60/150/240/330/420s:", await p.evaluate(() => [60, 150, 240, 330, 420].map(t => { const g = window.__game; const ot = g.time; g.time = t; let s = [0, 0, 0]; const n0 = g.enemies.length; for (let i = 0; i < 50; i++) g.spawnFormation(10, 0, 0, false, -1); const add = g.enemies.splice(n0); add.forEach(e => s[e.up]++); g.time = ot; return s.map(x => Math.round(x / 5) + "%").join("/"); })));
const m0 = await p.evaluate(() => ({ stage: window.__audio.tier, bpm: window.__audio.tempo }));
await p.evaluate(() => { const g = window.__game; g.hp = 3; g.inv = 99; let pl = 101; g.rivals.forEach((r, i) => { if (i >= 20 && i < 30) g.koRival(r, -1, i - 12, 0); else if (i >= 6 && r.alive) { r.alive = false; r.place = pl--; r.koBy = (i * 7) % 6; } }); });
await p.waitForTimeout(2600);
console.log("music stage before -> after field shrinks to 7:", m0, "->");
console.log("music:", await p.evaluate(() => { const a = window.__audio; return { playing: a.playing, stage: a.tier, bpm: a.tempo, bar: a.seq && a.seq.bar }; }));
await p.waitForTimeout(600);
await p.screenshot({ path: "screenshot12.png" });
console.log("bot names:", await p.evaluate(() => window.__game.rivals.slice(0, 8).map(r => r.name).join(",")), "unique:", await p.evaluate(() => new Set(window.__game.rivals.map(r => r.name)).size));
await p.evaluate(() => { window.__game.inv = 0; window.__game.gameOver(); });
await p.waitForTimeout(1200);
await p.keyboard.down("ArrowDown"); await p.waitForTimeout(700); await p.keyboard.up("ArrowDown");
await p.waitForTimeout(300); const scrolled = await p.evaluate(() => window.__game.lbScroll);
await p.evaluate(() => { window.__game.lbScroll = 0; }); await p.waitForTimeout(100);
await p.screenshot({ path: "screenshot11.png" }); console.log("scroll after holding down:", scrolled);
console.log("leaderboard:", await p.evaluate(() => { const g = window.__game; return { state: g.state, place: g.place, scroll: g.lbScroll, myKos: g.myKos, unplaced: g.rivals.filter(r => !r.place).length }; }));
console.log("missing glyphs:", await p.evaluate(() => [...window.__missingGlyphs].join("")));
const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
console.log("fps", fps, "errors:", errs);
await b.close();
