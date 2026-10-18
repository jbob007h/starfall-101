// Boss rush: 15 rounds, own boss last, picks apply, victory + best save, game over with rounds cleared. Accelerated via direct boss kills.
import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; let fail = 0;
p.on("pageerror", e => errs.push(String(e))); p.on("console", m => m.type() === "error" && errs.push(m.text()));
const ok = (n, c, d) => { console.log(n + ":", c ? "ok" : "FAIL", d !== undefined ? JSON.stringify(d) : ""); if (!c) fail++; };
await p.goto("http://localhost:8080/"); await p.waitForTimeout(600);
await p.evaluate(() => { localStorage.removeItem("sf101rush"); const g = window.__game; g.pilotChoice = 3; g.setPlayMode("rush"); g.titleSel = 4; });
await p.waitForTimeout(300); await p.screenshot({ path: "/workspace/shots/rush_menu2.png" });
const sh = await p.evaluate(() => window.__game.net.online); ok("offline transport", !sh);
await p.evaluate(() => window.__game.startLobby());
const s0 = await p.evaluate(() => { const g = window.__game, R = g.rush; return { n: R.order.length, last: R.order[14], pilot: g.pilot, uniq: new Set(R.order).size, alive: g.rivals.filter(r => r.alive).length, w: g.weapon, bo: g.bombs }; });
ok("order", s0.n === 15 && s0.uniq === 15 && s0.last === s0.pilot && s0.alive === 0, s0);
ok("starts max weapon + bombs", s0.w === 3 && s0.bo === 5, s0);
const nf = await p.evaluate(() => { const g = window.__game; let f = 0, n = 0; for (let k = 0; k < 4000; k++) { g.items = []; const e = { x: 50, y: 50, hp: 0, col: 0, spr: 0, uid: 1 }; g.enemies.push(e); g.killEnemy(e, true); for (const it of g.items) { if (it.kind !== "dot") n++; if (it.kind === "F") f++; } } g.items = []; g.score = 0; g.chain = 0; return { f, n }; });
ok("no chain freeze drops", nf.f === 0 && nf.n > 50, nf);
const waitPhase = ph => p.waitForFunction(ph => window.__game.rush?.phase === ph, ph, { timeout: 15000 }).catch(async e => { console.log("stuck waiting", ph, await p.evaluate(() => { const g = window.__game, R = g.rush; return JSON.stringify({ s: g.state, dead: g.dead, ph: R?.phase, pt: R?.phaseT, round: R?.round, boss: R?.boss && { hp: R.boss.hp, dead: R.boss.dead } }); })); throw e; });
const hps = [], rates = [], hearts = []; let shadow = false, pickRes = [];
for (let i = 0; i < 15; i++) {
  await waitPhase("fight");
  const info = await p.evaluate(() => { const g = window.__game, R = g.rush; return { hp: R.boss.maxhp, bv: R.boss.bv, ramp: g.ramp, ci: g.cutIn?.text ?? g.cutIn?.title ?? JSON.stringify(g.cutIn ?? "") }; });
  hps.push(info.hp); rates.push(+info.ramp.toFixed(2)); if (i === 14) shadow = /SHADOW/.test(JSON.stringify(info)) && info.bv === 100 + s0.pilot;
  if (i === 1) { const bd = await p.evaluate(() => { const g = window.__game, e = g.rush.boss, R = g.rush, h = e.hp; g.bombBoss(e); const d = h - e.hp; g.rush = null; g.bombBoss(e); const d2 = h - d - e.hp; g.rush = R; return [d, d2]; }); ok("rush bombs full dmg (duel keeps half)", bd[0] === 15 && bd[1] === 7.5, bd); }
  if (i === 3) { await p.waitForTimeout(700); await p.screenshot({ path: "/workspace/shots/rush_fight2.png" }); }
  await p.evaluate(() => { const g = window.__game; g.invuln = 99; g.hp = 1; g.damageBoss(g.rush.boss, 1e7); });
  if (i < 14) {
    await waitPhase("pick");
    if (i === 0) { await p.waitForTimeout(400); await p.screenshot({ path: "/workspace/shots/rush_pick2.png" }); }
    hearts.push(await p.evaluate(() => window.__game.hp)); const k = i % 2;
    if (i === 1) { const fb = await p.evaluate(() => { const g = window.__game; g.weapon = 3; const s = g.score; g.rushPick(0); return g.score - s; }); ok("maxed pick fallback +5000", fb === 5000, fb); await waitPhase("fight"); await p.evaluate(() => { const g = window.__game; g.damageBoss(g.rush.boss, 1e7); }); i++; await waitPhase("pick"); hearts.push(3); }
    await p.evaluate(() => { const g = window.__game; g.weapon = 0; g.bombs = 1; });
    await p.evaluate(k => window.__game.rushPick(k), k);
    pickRes.push(await p.evaluate(k => { const g = window.__game; const r = k === 0 ? g.weapon === 1 : g.bombs === 2; g.hp = 3; g.invuln = 99; return r; }, k));
  }
}
ok("own boss last + FACE YOUR SHADOW", shadow);
ok("hearts refill after each boss", hearts.length === 14 && hearts.every(h => h === 3), hearts);
ok("boss HP x0.55 -> ~x1.25", hps.at(-1) > hps[0], hps);
ok("picks apply", pickRes.length === 13 && pickRes.every(x => x), pickRes);
ok("difficulty scales", rates.at(-1) > rates[0], { ramp: [rates[0], rates.at(-1)] });
await p.waitForFunction(() => window.__game.state === "over", null, { timeout: 15000 }); await p.waitForTimeout(1200);
const v = await p.evaluate(() => { const g = window.__game, R = g.rush; return { won: R.won, round: R.round, times: R.times.length, rank: R.rank, ls: JSON.parse(localStorage.getItem("sf101rush") || "{}") }; });
ok("victory", v.won && v.round === 15 && v.times === 15 && "SABC".includes(v.rank) && v.rank, v);
const best = Object.values(v.ls)[0]; ok("best saved", best && best.time > 0 && best.rounds === 15, best);
await p.screenshot({ path: "/workspace/shots/rush_results.png" });
// NEW RUN via Enter, then lose on round 1
await p.evaluate(() => { window.__game.endSel = 0; }); await p.keyboard.press("Enter"); await p.waitForFunction(() => { const g = window.__game; return g.state === "play" && g.rush?.round === 0 && g.rush.phase === "fight" && g.rush.boss; }, null, { timeout: 15000 });
await p.evaluate(() => { const g = window.__game; g.damageBoss(g.rush.boss, 1e7); }); await waitPhase("pick"); await p.evaluate(() => window.__game.rushPick(2)); await waitPhase("fight");
await p.evaluate(() => { const g = window.__game; g.hp = 1; g.invuln = 0; g.shield = 0; g.hurt(); }); await p.waitForTimeout(1500);
const l = await p.evaluate(() => { const g = window.__game, R = g.rush; return { state: g.state, won: R?.won, round: R?.round, rank: R?.rank, best: R?.best }; });
ok("game over", l.state === "over" && l.won === false && l.round === 1 && l.rank === "C" && l.best.time === best.time, l);
await p.keyboard.press("Escape"); await p.waitForTimeout(500);
const t = await p.evaluate(() => [window.__game.state, window.__game.rush, window.__audio.titleOn]); ok("quit to title", t[0] === "title" && !t[1], t);
console.log("errors:", errs); if (errs.length) fail++; console.log(fail ? "FAILURES " + fail : "ALL OK"); await b.close(); process.exit(fail ? 1 : 0);
