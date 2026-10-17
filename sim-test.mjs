// MatchSim unit checks (node): the final-duel KO credits the winner in every case. Bundles src/sim.ts with esbuild.
import { buildSync } from "esbuild"; import fs from "fs";
buildSync({ entryPoints: ["src/sim.ts"], bundle: true, format: "esm", platform: "node", outfile: "/tmp/sim-bundle.mjs", logLevel: "error" });
const { MatchSim } = await import("/tmp/sim-bundle.mjs?" + Date.now());
let fail = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fail++; };
function duel(humans) { // slots 0..humans-1 human, rest bots; reduce to the final two: slot 0 and slot 1
  const kos = []; let winner = null;
  const sim = new MatchSim(Array.from({ length: 101 }, (_, i) => ({ name: "P" + i, isBot: i >= humans, ai: i >= humans })), { attack() {}, hit() {}, ko: (id, by, place) => kos.push({ id, by, place }), end: w => { winner = w; } });
  for (const s of sim.slots) if (s.id > 1) sim.eliminate(s, -2);
  return { sim, kos, get winner() { return winner; } };
}
{ const d = duel(1); let n = 0; while (!d.sim.over && n++ < 200) d.sim.humanAttack(0, 1, 2, 80); const k = d.kos.at(-1); ok(d.winner === 0 && k.id === 1 && k.by === 0, "human beats CPU by attacks: CPU KO'd by the human " + JSON.stringify(k)); }
{ const d = duel(1); d.sim.duelT = -999; let n = 0; while (!d.sim.over && n++ < 200000) d.sim.tick(0.05); const k = d.kos.at(-1); ok(k.id === 1 && k.by === 0, "duel attrition finishes the CPU: credited to the human, not STARFALL " + JSON.stringify(k)); }
{ const d = duel(1); d.sim.humanKO(0, -2); const k = d.kos.at(-1); ok(d.winner === 1 && k.id === 0 && k.by === 1, "CPU beats human (field death, unknown killer): credited to the CPU " + JSON.stringify(k)); }
{ const d = duel(2); d.sim.humanKO(1, -2); const k = d.kos.at(-1); ok(d.winner === 0 && k.by === 0, "human vs human (quit/idle/unknown): credited to the winner " + JSON.stringify(k)); }
{ const d = duel(2); d.sim.humanKO(1, 0); const k = d.kos.at(-1); ok(k.by === 0 && k.place === 2, "human vs human with a known killer keeps it " + JSON.stringify(k)); }
fs.rmSync("/tmp/sim-bundle.mjs", { force: true }); if (fail) process.exitCode = 1;
