import { chromium } from "playwright"; import fs from "fs";
const b = await chromium.launch(); const p = await b.newPage(); const errs = [];
p.on("pageerror", e => errs.push(String(e))); p.on("console", m => m.type() === "error" && errs.push(m.text()));
await p.goto("http://localhost:8080/?offline"); await p.waitForTimeout(500);
const i = (await p.evaluate(() => window.__soundtracks)).findIndex(t => t.id === "title");
const secs = 8 * 240 / 126 + 56 * 240 / 126 + 8;
const r = await p.evaluate(async ([i, secs]) => { const ab = await window.__renderMusicPreview(i, secs, 44100, false); const u8 = new Uint8Array(ab); let bin = ""; for (let j = 0; j < u8.length; j += 0x8000) bin += String.fromCharCode(...u8.subarray(j, j + 0x8000)); return btoa(bin); }, [i, secs]);
fs.writeFileSync("/workspace/music_styles/title_preview.wav", Buffer.from(r, "base64"));
// flow: title -> key unlock -> title theme; start match -> match music; quit -> title theme
await p.keyboard.press("Shift"); await p.waitForTimeout(600);
const a = await p.evaluate(() => [window.__audio.titleOn, window.__audio.music?.playing]);
await p.evaluate(() => window.__game.startGame ? 0 : 0);
console.log("title after input:", a, "idx", i, "errors", errs);
await b.close();
