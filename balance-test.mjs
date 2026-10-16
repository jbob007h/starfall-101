// Balance sims (headless): 14 final bosses vs a standard dodging bot (time-to-kill, hits dealt), and the three
// special weapons' kill counts per 5 s activation against normal mid-match formations.
// Needs `npm run serve` on :8080. Usage: node balance-test.mjs [bossRuns=3] [specRuns=16]
import { chromium } from "playwright";
const BR = +(process.argv[2] || 3), SR = +(process.argv[3] || 16), ONLY = process.argv[4];
const b = await chromium.launch(); const p = await b.newPage(); const errs = [];
p.on("pageerror", e => errs.push(String(e)));
await p.goto("http://localhost:8080/?offline"); await p.waitForTimeout(600);
await p.evaluate(() => {
  const g = window.__game, PW = 272, PH = 324;
  let held = null, hold = 0;
  window.__stdBot = g2 => { // standard bot: human-ish reaction (re-decides every 7 frames), samples 18 moves ahead, avoids bullets/boss bodies, tracks the target's x, always fires
    if (hold-- > 0 && held) return held; hold = 6;
    const tgt = g2.enemies.find(e => e.boss && !e.dead) || g2.enemies.find(e => !e.dead && e.entered);
    const tx = tgt ? tgt.x : PW / 2, ty = 285; let best = null, bs = 1e9;
    for (const focus of [false, true]) for (const [cx, cy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]]) {
      const sp = focus ? 70 : 160; let dng = 0;
      for (const L of [0.12, 0.2]) { const nx = Math.max(6, Math.min(PW - 6, g2.px + cx * sp * L)), ny = Math.max(10, Math.min(PH - 8, g2.py + cy * sp * L));
        for (const q of g2.eb) { const bx = q.x + q.vx * L, by = q.y + q.vy * L, d = Math.hypot(bx - nx, by - ny) - q.r; if (d < 9) dng += (9 - d) * (9 - d); }
        for (const e of g2.enemies) if (e.boss && !e.dead) { const d = Math.hypot(e.x - nx, e.y - ny); if (d < 30) dng += (30 - d) * 4;
          for (const l of e.fb?.tele ?? []) { // telegraphs: mortar circles and rail lines (a human sees these coming)
            if (l.ring) { const d2 = Math.hypot(l.x1 - nx, l.y1 - ny); if (d2 < l.ring + 22) dng += (l.ring + 22 - d2) * 3; }
            else { const vx = l.x2 - l.x1, vy = l.y2 - l.y1, k = Math.max(0, Math.min(1, ((nx - l.x1) * vx + (ny - l.y1) * vy) / (vx * vx + vy * vy))), d2 = Math.hypot(l.x1 + vx * k - nx, l.y1 + vy * k - ny); if (d2 < 14) dng += (14 - d2) * 6; } } } }
      const nx = g2.px + cx * sp * 0.1, ny = g2.py + cy * sp * 0.1;
      const sc = dng * 10 + Math.abs(nx - tx) * 0.6 + Math.abs(ny - ty) * 0.25 + (focus ? 3 : 0);
      if (sc < bs) { bs = sc; best = { dx: cx, dy: cy, fire: true, focus }; }
    }
    held = best;
    return best;
  };
  window.__arena = (duel) => {
    g.reset([]); g.net = { online: false, tick() {}, sendState() {}, sendAttack() {}, sendKO() {}, sendSnap() {}, spectate() {}, requestStart() {}, on() {} };
    if (duel) { g.rivals.forEach((r, i) => { if (i) { r.alive = false; r.place = 3; } }); g.duel = true; }
    Object.assign(g, { time: duel ? 400 : 200, enemies: [], eb: [], items: [], forms: [], waves: [], warns: [], projs: [], weapon: 2, bombs: 0, hp: 3, inv: 0, popups: [] });
    g.bot = window.__stdBot; g.hits = 0;
    if (!g.__h) { g.__h = true; const h0 = g.hurt.bind(g); g.hurt = () => { if (g.inv > 0 || g.dead) return; if (g.shield) return h0(); g.hits++; g.inv = 2.2; g.clearNear(60); }; }
  };
});
if (ONLY === "grid") { // per-boss rate grid: node balance-test.mjs N 0 grid  -> one JSON line per boss/multiplier
  for (let i = 0; i < 15; i++) for (const m of [0.7, 0.85, 1, 1.15, 1.3]) {
    const r = await p.evaluate(([i, m, N]) => { const g = window.__game; let hits = 0, ttk = 0;
      for (let k = 0; k < N; k++) { window.__fbTune.rate[i] = m; window.__arena(true); const e = g.spawnFinal(i, 0); g.cutIn = null; while (!e.dead && e.fb.t < 150) { g.formCd = 1e9; g.update(1 / 60); } hits += g.hits; ttk += e.fb.t; }
      window.__fbTune.rate[i] = 1; return { i, m, hits: hits / N, ttk: ttk / N }; }, [i, m, BR]);
    console.log(JSON.stringify(r));
  }
  await b.close(); process.exit(0);
}
const boss = [];
for (let i = +(process.env.FROM || 0); i < 15 && ONLY !== "spec"; i++) {
  const runs = [];
  for (let r = 0; r < BR; r++) runs.push(await p.evaluate(i => {
    const g = window.__game; window.__arena(true); const e = g.spawnFinal(i, 0); g.cutIn = null;
    let n = 0, bullets = 0, fr = 0; while (!e.dead && e.fb.t < 150) { g.formCd = 1e9; g.update(1 / 60); n++; if (n % 6 === 0) { bullets += g.eb.length; fr++; } }
    return { ttk: +e.fb.t.toFixed(1), hits: g.hits, onScreen: Math.round(bullets / fr), dead: e.dead };
  }, i));
  const avg = k => +(runs.reduce((a, x) => a + x[k], 0) / runs.length).toFixed(1);
  const hv = runs.map(x => x.hits), hm = hv.reduce((a, x) => a + x, 0) / hv.length, se = Math.sqrt(hv.reduce((a, x) => a + (x - hm) ** 2, 0) / Math.max(1, hv.length - 1) / hv.length);
  boss.push({ i, name: await p.evaluate(i => window.__game.bossName({ bv: 100 + i }), i), ttk: avg("ttk"), hits: +hm.toFixed(2), hitsSE: +se.toFixed(2), bullets: avg("onScreen"), killed: runs.every(x => x.dead) });
  console.log(JSON.stringify(boss[boss.length - 1]));
}
const spec = [];
for (const [k, pilot] of ONLY === "boss" ? [] : [[0, 4], [1, 13], [2, 0]]) {
  let kills = 0; const all = [];
  for (let r = 0; r < SR; r++) { const c = await p.evaluate(pilot => {
    const g = window.__game; window.__arena(false); g.pilot = pilot; g.bot = gg => ({ ...window.__stdBot(gg), fire: false }); g.formCd = 0;
    for (let n = 0; n < 6 * 60; n++) g.update(1 / 60); // let formations arrive
    g.specKills = 0; g.collect({ kind: "S", x: g.px, y: g.py, vx: 0, vy: 0, t: 0 });
    for (let n = 0; n < 6.2 * 60; n++) g.update(1 / 60);
    return g.specKills; }, pilot); kills += c; all.push(c); }
  spec.push({ kind: ["LIGHTNING", "INFERNO", "STORM BLADES"][k], killsPerActivation: +(kills / SR).toFixed(2), runs: all.join(",") });
  console.log(JSON.stringify(spec[spec.length - 1]));
}
if (boss.length) { const t = boss.map(x => x.ttk), h = boss.map(x => x.hits), m = a => a.reduce((x, y) => x + y, 0) / a.length;
  console.log("boss ttk mean", m(t).toFixed(1), "range", Math.min(...t), "-", Math.max(...t), "| hits mean", m(h).toFixed(2), "range", Math.min(...h), "-", Math.max(...h)); }
console.log("errors:", errs.length ? errs.join(" | ") : "none");
await b.close();
