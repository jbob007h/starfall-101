// Boss rush records: v1 migration, per-run updates (loss + win, per-boss bests, rank, runs), records screen navigation (title + results), screenshot.
import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; let fail = 0;
p.on("pageerror", e => errs.push(String(e))); p.on("console", m => m.type() === "error" && errs.push(m.text()));
const key = async k => { await p.keyboard.press(k); await p.waitForTimeout(60); };
const ok = (n, c, d) => { console.log(n + ":", c ? "ok" : "FAIL", d !== undefined ? JSON.stringify(d) : ""); if (!c) fail++; };
await p.goto("http://localhost:8080/"); await p.waitForTimeout(600);
await p.evaluate(() => { localStorage.setItem("sf101rush", JSON.stringify({ IRONCLAD: { time: 500, score: 1000, rounds: 15 } })); const g = window.__game; g.pilotChoice = 3; g.setPlayMode("rush"); });
const ls = () => p.evaluate(() => JSON.parse(localStorage.getItem("sf101rush")).IRONCLAD);
const waitPhase = ph => p.waitForFunction(ph => window.__game.rush?.phase === ph && (ph !== "fight" || window.__game.rush.boss), ph, { timeout: 15000 });
const kill = (n, hitFirst) => p.evaluate(([hf]) => { const g = window.__game; g.invuln = 99; if (hf) g.rush.hitThis = true; g.damageBoss(g.rush.boss, 1e7); }, [hitFirst]);
// run 1: clear 2 bosses (2nd one hit), die on 3rd
await p.evaluate(() => window.__game.startRush());
for (let i = 0; i < 2; i++) { await waitPhase("fight"); await kill(i, i === 1); await waitPhase("pick"); await p.evaluate(() => window.__game.rushPick(1)); }
await waitPhase("fight"); const ord = await p.evaluate(() => window.__game.rush.order.slice(0, 2).map(i => window.__FB?.[i] ?? i));
await p.evaluate(() => { const g = window.__game; g.hp = 1; g.invuln = 0; g.shield = 0; g.hurt(); }); await p.waitForFunction(() => window.__game.state === "over");
const r1 = await ls(); const bk = Object.entries(r1.boss);
ok("loss updates (migrated v1: runs 1->2, time kept, rank C)", r1.runs === 2 && r1.time === 500 && r1.rounds === 15 && r1.rank === "C" && r1.score >= 1000, { runs: r1.runs, time: r1.time, rank: r1.rank, score: r1.score });
ok("per-boss times for cleared bosses only", bk.length === 2 && bk.filter(([, v]) => v.nh).length === 1, r1.boss);
// results -> records via R
await p.waitForTimeout(1100); await p.keyboard.press("KeyR"); await p.waitForTimeout(200);
const s1 = await p.evaluate(() => [window.__game.state, window.__game.recSel, window.__game.rush]); ok("results -> records", s1[0] === "records" && s1[1] === 3 && !s1[2], s1);
await key("ArrowRight"); await key("ArrowRight"); await p.waitForTimeout(100); const rs = await p.evaluate(() => window.__game.recSel);
await key("ArrowLeft"); await p.waitForTimeout(100); const rs2 = await p.evaluate(() => window.__game.recSel);
for (let i = 0; i < 5; i++) await key("ArrowLeft"); await p.waitForTimeout(100); const rs3 = await p.evaluate(() => window.__game.recSel);
ok("browse pilots (wraps)", rs === 5 && rs2 === 4 && rs3 === 14, [rs, rs2, rs3]);
await p.keyboard.press("Escape"); await p.waitForTimeout(150); ok("back to title", await p.evaluate(() => window.__game.state) === "title");
// title RECORDS item
await p.evaluate(() => { window.__game.titleSel = 0; }); for (let i = 0; i < 5; i++) await key("ArrowDown"); await p.waitForTimeout(100);
await p.keyboard.press("Enter"); await p.waitForTimeout(150); { const tr = await p.evaluate(() => [window.__game.titleSel, window.__game.state].join()); ok("title RECORDS item", tr === "5,records", tr); }
await p.keyboard.press("Escape"); await p.waitForTimeout(100);
// run 2: full no-hit win -> rank S, time, rounds, runs 3, 15 bosses
await p.evaluate(() => window.__game.startRush());
for (let i = 0; i < 15; i++) { await waitPhase("fight"); await kill(i, false); if (i < 14) { await waitPhase("pick"); await p.evaluate(() => window.__game.rushPick(0)); } }
await p.waitForFunction(() => window.__game.state === "over"); const r2 = await ls();
ok("win updates (rank S, faster time, runs 3, 15 bosses no-hit)", r2.rank === "S" && r2.time < 500 && r2.runs === 3 && Object.keys(r2.boss).length === 15 && Object.values(r2.boss).filter(v => v.nh).length >= 14, { rank: r2.rank, time: r2.time, runs: r2.runs });
// a later worse loss must not downgrade rank/time
await p.evaluate(() => window.__game.startRush()); await waitPhase("fight");
await p.evaluate(() => { const g = window.__game; g.hp = 1; g.invuln = 0; g.shield = 0; g.hurt(); }); await p.waitForFunction(() => window.__game.state === "over"); const r3 = await ls();
ok("bests kept on worse run", r3.rank === "S" && r3.time === r2.time && r3.runs === 4 && r3.rounds === 15, { rank: r3.rank, runs: r3.runs });
// sample data screenshot
await p.evaluate(() => { const g = window.__game; g.quitToTitle(); const F = ["MAGMA COLOSSUS"]; const all = JSON.parse(localStorage.getItem("sf101rush"));
  const bosses = JSON.parse(JSON.stringify(all.IRONCLAD.boss)); let k = 0; for (const n in bosses) { bosses[n] = { t: 18 + (k * 7.3) % 40, nh: k % 3 !== 1 }; if (k++ > 11) delete bosses[n]; }
  all.IRONCLAD = { time: 512.4, score: 2843150, rounds: 15, rank: "A", runs: 9, boss: bosses }; all.VULCAN = { time: 0, score: 640200, rounds: 8, rank: "C", runs: 3, boss: {} }; all.FROSTFANG = { time: 701.2, score: 1902000, rounds: 15, rank: "B", runs: 5, boss: {} };
  localStorage.setItem("sf101rush", JSON.stringify(all)); g.openRecords(); });
await p.waitForTimeout(400); await p.screenshot({ path: "/workspace/shots/records.png" });
console.log("errors:", errs); if (errs.length) fail++; console.log(fail ? "FAILURES " + fail : "ALL OK"); await b.close(); process.exit(fail ? 1 : 0);
