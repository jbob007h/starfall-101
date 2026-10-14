// Display scaling: fill ~100% on the limiting axis at various viewports / DPRs.
import { chromium } from "playwright";
const b = await chromium.launch(); const errs = [];
for (const dpr of [1, 1.2, 1.3, 1.5, 2]) for (const [w, h] of [[1280, 720], [1366, 768], [1000, 800], [1920, 1080], [985, 554]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr }); const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(String(e)));
  await p.goto("http://localhost:8080/?offline"); await p.waitForTimeout(200);
  const v = await p.evaluate(() => window.__view);
  console.log(`dpr ${dpr} ${w}x${h}: canvas ${v.cw}x${v.ch} game ${v.w}x${v.h} scale ${v.scale.toFixed(3)} fill ${(v.fill * 100).toFixed(1)}%`);
  if (dpr === 1.3 && w === 1366) await p.screenshot({ path: "scale_1366_dpr13.png" });
  await ctx.close();
}
console.log("errors:", errs); await b.close();
