// CONTROLS screen + rebinding test (offline). Needs `npm run serve` on :8080.
import { chromium } from "playwright";
const URL = process.env.URL || "http://localhost:8080/";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const p = await ctx.newPage(); const errs = [];
await p.addInitScript(() => {
  const btn = () => ({ pressed: false, touched: false, value: 0 });
  const gp = { id: "Stub Xbox Controller (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn) };
  window.__pad = { gp, on: false, set(i, v) { gp.buttons[i] = { pressed: v, touched: v, value: v ? 1 : 0 }; } };
  navigator.getGamepads = () => [window.__pad.on ? gp : null, null, null, null];
});
p.on("console", m => { if (m.type() === "error") errs.push(m.text()); }); p.on("pageerror", e => errs.push(String(e)));
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const ev = (f, a) => p.evaluate(f, a), wait = t => p.waitForTimeout(t);
const B = () => ev(() => JSON.parse(localStorage.getItem("sf101binds") || "null"));
const key = async k => { await p.keyboard.press(k); await wait(90); };
const tap = async i => { await ev(i => window.__pad.set(i, true), i); await wait(90); await ev(i => window.__pad.set(i, false), i); await wait(90); };
await p.goto(URL + "?offline"); await wait(600);
await ev(() => localStorage.removeItem("sf101binds")); await p.reload(); await wait(600);
await key("KeyC"); ok(await ev(() => window.__game.state) === "controls", "C opens CONTROLS from the title");
for (let i = 0; i < 4; i++) await key("ArrowDown");
await key("Enter"); await key("KeyJ");
let bb = await B(); ok(bb.key.fire[0] === "KeyJ", "keyboard: FIRE bound to J");
await key("ArrowDown"); await key("ArrowDown"); await key("Enter"); await key("KeyJ"); // BOMB := J (taken by FIRE) -> swap
bb = await B(); ok(bb.key.bomb[0] === "KeyJ" && bb.key.fire[0] === "KeyX", "conflict: J moves to BOMB, FIRE receives X");
console.log("msg:", await ev(() => window.__game.ctlMsg));
await wait(150); await p.screenshot({ path: "controls.png" });
await key("Enter"); await key("Enter"); ok(await ev(() => !!window.__game.ctlBind && window.__game.ctlMsg.includes("RESERVED")), "Enter is reserved while binding");
await key("Escape"); ok(await ev(() => window.__game.ctlBind === null && window.__game.state === "controls"), "Esc cancels a pending bind");
// controller tab
await ev(() => { window.__pad.on = true; }); await wait(200);
await tap(5); ok(await ev(() => window.__game.ctlDev) === "pad", "RB switches to CONTROLLER tab");
await tap(12); await tap(12); // D-pad up twice: BOMB -> FIRE
await tap(0); await tap(3); // A = bind, then press Y
bb = await B(); ok(bb.pad.fire[0] === "B3", "controller: FIRE bound to Y");
await tap(0); await ev(() => window.__pad.gp.axes = [0, 0, 0, -1]); await wait(120); await ev(() => window.__pad.gp.axes = [0, 0, 0, 0]); await wait(100);
bb = await B(); ok(bb.pad.fire[0] === "A3-" && bb.pad.tgt0[0] === "B3", "controller: stick direction bindable, swap with TARGET RANDOM");
await wait(100); await p.screenshot({ path: "controls_pad.png" });
for (let i = 0; i < 12; i++) await tap(13); // down to RESET row (row 4 -> 16)
await tap(0); bb = await B(); ok(bb.pad.fire[0] === "B0" && bb.pad.bomb[0] === "B7" && bb.key.fire[0] === "KeyX", "reset restores controller defaults only");
await tap(1); ok(await ev(() => window.__game.state) === "title", "B backs out to title");
// persisted + applied in game
await p.reload(); await wait(600); bb = await B(); ok(bb.key.bomb[0] === "KeyJ", "bindings persist in localStorage");
await key("Enter"); await key("Enter"); await key("Enter"); await wait(300); await key("KeyC"); ok(await ev(() => window.__game.state) === "controls", "C opens CONTROLS from the lobby");
await key("Escape"); ok(await ev(() => window.__game.state) === "lobby", "Esc returns to the lobby");
await key("Enter"); await wait(900); ok(await ev(() => window.__game.state) === "play", "match started");
await ev(() => { window.__game.inv = 1e9; });
await p.keyboard.down("KeyX"); await wait(300); const pb = await ev(() => window.__game.pb.length); await p.keyboard.up("KeyX"); ok(pb > 0, "rebound key X fires");
const b0 = await ev(() => window.__game.bombs); await key("KeyJ"); ok(await ev(() => window.__game.bombs) === b0 - 1, "rebound key J bombs");
await ev(() => { window.__pad.on = true; }); await wait(100);
const b1 = await ev(() => window.__game.bombs); await tap(1); ok(await ev(() => window.__game.bombs) === b1, "controller B no longer bombs");
await tap(7); ok(await ev(() => window.__game.bombs) === b1 - 1, "controller RT bombs");
await ev(() => window.__pad.set(0, true)); await wait(300); ok(await ev(() => window.__game.pb.length) > 0, "controller A fires (held)"); await ev(() => window.__pad.set(0, false));
await ev(() => window.__pad.set(2, true)); await wait(100); ok(await ev(() => window.__game.focus), "controller X focuses"); await ev(() => window.__pad.set(2, false));
await ev(() => window.__pad.gp.axes = [0.9, 0, 0, 0]); const x0 = await ev(() => window.__game.px); await wait(300); ok(await ev(() => window.__game.px) > x0 + 10, "left stick moves"); await ev(() => window.__pad.gp.axes = [0, 0, 0, 0]);
await ev(() => window.__pad.gp.axes = [0, 0, -1, 0]); await wait(120); await ev(() => window.__pad.gp.axes = [0, 0, 0, 0]); await wait(100); ok(await ev(() => window.__game.mode) === 3, "right stick left = BADGES targeting");
// ---- return to title (offline): pause menu, game-over menu, victory menu; then start again
await ev(() => { window.__pad.on = false; }); await wait(150);
const st = () => ev(() => [window.__game.state, window.__audio.playing, window.__game.paused]);
await key("Escape"); ok(await ev(() => window.__game.paused), "Esc pauses");
await key("ArrowDown"); await key("Enter"); let s1 = await st(); ok(s1[0] === "title" && !s1[1] && !s1[2], "pause > QUIT TO TITLE: title, music stopped, unpaused");
const again = async lbl => { await key("Enter"); await key("Enter"); await key("Enter"); await wait(300); await key("Enter"); await wait(900); const s = await st(); ok(s[0] === "play" && s[1], lbl); };
await again("new match after quitting from pause");
await ev(() => { const g = window.__game; g.inv = 0; g.gameOver(); }); await wait(900);
await key("ArrowRight"); ok(await ev(() => window.__game.endSel) === 1, "game over: RIGHT selects TITLE SCREEN");
await wait(200); await p.screenshot({ path: "endmenu.png" });
await key("Enter"); s1 = await st(); ok(s1[0] === "title" && !s1[1], "game over > TITLE SCREEN");
await again("new match after game over -> title");
await ev(() => { const g = window.__game; g.inv = 0; g.gameOver(); }); await wait(900);
await key("Enter"); ok(await ev(() => window.__game.state) === "lobby", "game over > NEW MATCH (default) goes to lobby");
await key("Escape"); ok(await ev(() => window.__game.state) === "title", "Esc in lobby returns to title");
await again("new match after lobby -> title");
await ev(() => { const g = window.__game; g.inv = 1e9; for (const r of g.rivals) { r.alive = false; r.place = r.place || 2; } }); await wait(800);
ok(await ev(() => window.__game.state) === "win", "victory screen");
await ev(() => { window.__pad.on = true; }); await wait(200); await tap(1); s1 = await st(); ok(s1[0] === "title" && !s1[1], "victory: controller B -> title");
await tap(9); await tap(9); await tap(9); await wait(300); await tap(9); await wait(900); ok(await ev(() => window.__game.state) === "play", "controller: new match after victory -> title"); // title > name > pilot > lobby
await tap(9); await tap(13); await tap(0); ok(await ev(() => window.__game.state) === "title", "controller: pause > QUIT TO TITLE");
await ev(() => localStorage.removeItem("sf101binds"));
console.log("missing glyphs:", await ev(() => [...window.__missingGlyphs].join("")), "errors:", errs); if (errs.length) process.exitCode = 1;
await b.close();
