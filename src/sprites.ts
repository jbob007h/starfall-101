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
export const SAUCER = ["..xxxxx..", ".xwxwxwx.", "xxxxxxxxx", "x.d.d.d.x", ".x.....x."];
export const BUG = ["x.......x", ".x.xxx.x.", "..xxwxx..", ".xxdxdxx.", "xx.x.x.xx", "x.......x"];
export const BOSS = [
  ".......xxxxxxx.......", ".....xxwwwwwwwxx.....", "....xxwkkwwwkkwxx....", "...xxxwkkwwwkkwxxx...",
  "..xxxxxwwwwwwwxxxxx..", ".xxyxxyxxyxxyxxyxxyx.", "xxxxxxxxxxxxxxxxxxxxx", "xx.xx.xx.xx.xx.xx.xxx",
  ".xx...xx.....xx...xx.", "..x....x.....x....x..",
];
export const BADGE = ["...y...", "..yyy..", "yyywyyy", ".yywyy.", "..yyy..", ".yy.yy.", "y.....y"];
