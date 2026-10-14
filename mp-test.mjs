// Multiplayer smoke test: run `PORT=8090 npm start` first.
import { chromium } from "playwright";
const URL = process.env.URL || "http://localhost:8090/";
const b = await chromium.launch();
const names = ["ALPHA", "BRAVO", "CHARLIE"]; const pages = []; const errs = [];
for (const n of names) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const p = await ctx.newPage();
  p.on("console", m => { if (m.type() === "error") errs.push(n + ": " + m.text()); }); p.on("pageerror", e => errs.push(n + ": " + e));
  await p.goto(URL + "?name=" + n); await p.waitForFunction(() => window.__netReady); pages.push(p);
}
const ev = (p, f, a) => p.evaluate(f, a);
console.log("online:", await Promise.all(pages.map(p => ev(p, () => window.__game.net.online))));
for (const p of pages) { await p.keyboard.press("Enter"); await p.waitForTimeout(200); await p.keyboard.press("Enter"); await p.waitForTimeout(300); }
await pages[0].waitForTimeout(1200);
for (const p of pages) console.log("lobby", await ev(p, () => [window.__game.state, window.__game.lobbyHumans, window.__game.lobbyCount, window.__game.lobbyLog.join("|"), Math.ceil(window.__game.lobbyCd)]));
await pages[0].screenshot({ path: "screenshot5.png" });
for (const p of pages) { await p.keyboard.press("Enter"); } // everyone votes start
await pages[0].waitForTimeout(1200);
const humans = await Promise.all(pages.map(p => ev(p, () => [window.__game.state, window.__game.rivals.filter(r => !r.isBot).map(r => r.name + "#" + (r.id + 1)).join(",")])));
console.log("in match (state, human rivals seen):", humans);
for (const p of pages) await p.keyboard.down("KeyZ");
await pages[0].waitForTimeout(3000);
// ALPHA cashes in a bullet wave on BRAVO
const sent = await ev(pages[0], () => { const g = window.__game; const t = g.rivals.find(r => r.name === "BRAVO"); g.mode = 0; g.randTarget = t.id; g.randCd = 99; g.chain = 45; g.eligible = true; g.cashIn(true); return t.id; });
console.log("ALPHA sent wave to local id", sent);
await pages[1].waitForTimeout(2400);
console.log("BRAVO attackLog:", JSON.stringify(await ev(pages[1], () => window.__game.attackLog.filter(a => !a.from.startsWith("BOT")))));
console.log("BRAVO bosses:", await ev(pages[1], () => window.__game.enemies.filter(e => e.boss).map(e => e.bv)));
await pages[1].screenshot({ path: "screenshot6.png" });
// CHARLIE disconnects -> should be KO'd for others
await pages[2].context().close();
await pages[0].waitForTimeout(800);
console.log("ALPHA sees CHARLIE alive?", await ev(pages[0], () => window.__game.rivals.find(r => r.name === "CHARLIE").alive));
console.log("errors:", errs);
await b.close();
