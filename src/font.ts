// Tiny 3x5 bitmap font drawn with fillRect (crisp pixel text).
const G: Record<string, string> = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110",
  E: "111100110100111", F: "111100110100100", G: "011100101101011", H: "101101111101101",
  I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
  M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100",
  Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
  Y: "101101010010010", Z: "111001010100111",
  "0": "111101101101111", "1": "010110010010111", "2": "110001010100111", "3": "110001010001110",
  "4": "101101111001001", "5": "111100110001110", "6": "011100111101111", "7": "111001010010010",
  "8": "111101111101111", "9": "111101111001110",
  " ": "000000000000000", "!": "010010010000010", ".": "000000000000010", ",": "000000000010100",
  ":": "000010000010000", "/": "001001010100100", "-": "000000111000000", "+": "000010111010000",
  "(": "010100100100010", ")": "010001001001010", "x": "000101010101000", "%": "101001010100101", "?": "110001010000010", "#": "101111101111101",
  ">": "100010001010100", "<": "001010100010001", "'": "010010000000000", "*": "101010101000000",
};
export function textWidth(s: string, scale = 1) { return s.length * 4 * scale - scale; }
export function drawText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale = 1, align: "left" | "center" | "right" = "left", shadow?: string) {
  if (align !== "left") { const w = textWidth(s, scale); x -= align === "center" ? w / 2 : w; }
  x = Math.round(x); y = Math.round(y);
  if (shadow) { const o = Math.max(1, Math.round(scale / 3)); drawRaw(ctx, s, x + o, y + o, shadow, scale); };
  drawRaw(ctx, s, x, y, color, scale);
}
function drawRaw(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale: number) {
  ctx.fillStyle = color;
  for (let i = 0; i < s.length; i++) {
    let ch = s[i]; let g = G[ch] ?? G[ch.toUpperCase()]; if (!g) g = G["?"];
    for (let p = 0; p < 15; p++) if (g.charCodeAt(p) === 49) ctx.fillRect(x + (p % 3) * scale, y + ((p / 3) | 0) * scale, scale, scale);
    x += 4 * scale;
  }
}
