export type Pal = Record<string, string>;
export function makeSprite(rows: string[], pal: Pal): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext("2d")!;
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const col = pal[r[x]]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } } });
  return c;
}
export const SHIP = [
  ".....c.....", "....cwc....", "....cwc....", "...cmwmc...", "...cmwmc...", "..cmmwmmc..",
  ".cmmcwcmmc.", "cmm.cwc.mmc", "cm..cwc..mc", "c...yyy...c", "....y.y....",
];
export const SAUCER = ["...xxxxx...", "..xxxxxxx..", ".xwxxwxxwx.", "xxxxxxxxxxx", "x.dd.d.dd.x", ".xx.....xx."]; // 11x6 (~20% larger)
export const BUG = ["x.........x", ".x..xxx..x.", "..xxxwxxx..", ".xxxwwwxxx.", "xxdxxdxxdxx", "x..x...x..x", "x.........x"]; // 11x7
export const BOSS = [
  ".......xxxxxxx.......", ".....xxwwwwwwwxx.....", "....xxwkkwwwkkwxx....", "...xxxwkkwwwkkwxxx...",
  "..xxxxxwwwwwwwxxxxx..", ".xxyxxyxxyxxyxxyxxyx.", "xxxxxxxxxxxxxxxxxxxxx", "xx.xx.xx.xx.xx.xx.xxx",
  ".xx...xx.....xx...xx.", "..x....x.....x....x..",
];
export const BADGE = ["...y...", "..yyy..", "yyywyyy", ".yywyy.", "..yyy..", ".yy.yy.", "y.....y"];
export const SERP_HEAD = [
  "...xxxxx...", "..xwwxwwx..", ".xxwkxkwxx.", "xxxxxxxxxxx", "xyx.xxx.xyx", ".x..xyx..x.", "....x.x....",
];
export const SERP_SEG = ["..xxx..", ".xmmmx.", "xmmwmmx", "xmwwwmx", "xmmwmmx", ".xmmmx.", "..xxx.."];
/** Procedural sprite: draw with fillRects into an offscreen canvas. */
export function drawSprite(w: number, h: number, fn: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; fn(c.getContext("2d")!); return c;
}
