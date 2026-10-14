// Rebindable input: keyboard codes (KeyboardEvent.code) and controller codes
// ("B<n>" standard-mapping button, "A<n>+" / "A<n>-" axis direction). Saved in localStorage.
export type Act = "up" | "down" | "left" | "right" | "fire" | "focus" | "bomb" | "tgt0" | "tgt1" | "tgt2" | "tgt3" | "pause" | "mute" | "crt" | "lowfx" | "song";
export type Dev = "key" | "pad";
export const ACTIONS: { id: Act; label: string }[] = [
  { id: "up", label: "MOVE UP" }, { id: "down", label: "MOVE DOWN" }, { id: "left", label: "MOVE LEFT" }, { id: "right", label: "MOVE RIGHT" },
  { id: "fire", label: "FIRE (HOLD)" }, { id: "focus", label: "FOCUS (HOLD)" }, { id: "bomb", label: "BOMB" },
  { id: "tgt0", label: "TARGET RANDOM" }, { id: "tgt1", label: "TARGET KOS" }, { id: "tgt2", label: "TARGET ATTACKERS" }, { id: "tgt3", label: "TARGET BADGES" },
  { id: "pause", label: "PAUSE" }, { id: "mute", label: "MUTE MUSIC" }, { id: "crt", label: "CRT FILTER" }, { id: "lowfx", label: "LOW FX" }, { id: "song", label: "SWITCH SOUNDTRACK" },
];
export type Binds = Record<Dev, Record<Act, string[]>>;
export const DEFAULTS: Binds = {
  key: { up: ["ArrowUp", "KeyW"], down: ["ArrowDown", "KeyS"], left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"], fire: ["KeyZ", "Space"], focus: ["ShiftLeft", "ShiftRight"],
    bomb: ["KeyX", ""], tgt0: ["Digit1", "Numpad1"], tgt1: ["Digit2", "Numpad2"], tgt2: ["Digit3", "Numpad3"], tgt3: ["Digit4", "Numpad4"], pause: ["KeyP", ""], mute: ["KeyM", ""], crt: ["KeyV", ""], lowfx: ["KeyG", ""], song: ["KeyN", ""] },
  // left stick move (D-pad as alternate), right stick = targeting, A fire, X focus, RT bomb
  pad: { up: ["A1-", "B12"], down: ["A1+", "B13"], left: ["A0-", "B14"], right: ["A0+", "B15"], fire: ["B0", ""], focus: ["B2", ""], bomb: ["B7", ""],
    tgt0: ["A3-", ""], tgt1: ["A2+", ""], tgt2: ["A3+", ""], tgt3: ["A2-", ""], pause: ["", ""], mute: ["", ""], crt: ["B8", ""], lowfx: ["", ""], song: ["", ""] },
};
/** Fixed keys: Enter (menus), Escape (back / pause / cancel), Start (menu / pause). */
export const RESERVED: Record<Dev, string[]> = { key: ["Enter", "Escape"], pad: ["B9"] };
const LS = "sf101binds";
const clone = (b: Binds): Binds => JSON.parse(JSON.stringify(b));
export let binds: Binds = load();
function load(): Binds {
  const b = clone(DEFAULTS);
  try { const s = JSON.parse(localStorage.getItem(LS) || "null"); if (s) for (const d of ["key", "pad"] as Dev[]) for (const a of ACTIONS) { const v = s[d]?.[a.id]; if (Array.isArray(v)) b[d][a.id] = [String(v[0] || ""), String(v[1] || "")]; } } catch { /* defaults */ }
  return b;
}
export function saveBinds() { try { localStorage.setItem(LS, JSON.stringify(binds)); } catch { /* private mode */ } }
export function resetBinds(dev?: Dev) { const d = clone(DEFAULTS); if (dev) binds[dev] = d[dev]; else binds = d; saveBinds(); }
/** Bind `code` to action/slot. If another action already uses it, the two swap (that action gets our old code). Returns the swapped action. */
export function bind(dev: Dev, act: Act, slot: number, code: string): Act | null {
  const B = binds[dev], old = B[act][slot]; let swapped: Act | null = null;
  for (const a of ACTIONS) for (let s = 0; s < 2; s++) if (B[a.id][s] === code && !(a.id === act && s === slot)) {
    if (a.id === act) B[a.id][s] = ""; // same action, other slot: just move it
    else { B[a.id][s] = old && !B[a.id].includes(old) ? old : ""; swapped = a.id; }
  }
  B[act][slot] = code; saveBinds(); return swapped;
}
export function clearBind(dev: Dev, act: Act, slot: number) { binds[dev][act][slot] = ""; saveBinds(); }

const KEYN: Record<string, string> = { ArrowUp: "UP", ArrowDown: "DOWN", ArrowLeft: "LEFT", ArrowRight: "RIGHT", Space: "SPACE", ShiftLeft: "LSHIFT", ShiftRight: "RSHIFT",
  ControlLeft: "LCTRL", ControlRight: "RCTRL", AltLeft: "LALT", AltRight: "RALT", Backspace: "BKSP", Tab: "TAB", CapsLock: "CAPS", Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/", Quote: "'",
  Semicolon: "SEMI", BracketLeft: "LBRKT", BracketRight: "RBRKT", Backslash: "BSLASH", Backquote: "TILDE", Delete: "DEL", Insert: "INS", Home: "HOME", End: "END", PageUp: "PGUP", PageDown: "PGDN", MetaLeft: "META", MetaRight: "META" };
const BTN = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "BACK", "START", "L3", "R3", "D-UP", "D-DOWN", "D-LEFT", "D-RIGHT", "HOME"];
export function codeName(dev: Dev, c: string) {
  if (!c) return "---";
  if (dev === "key") return KEYN[c] ?? (/^Key[A-Z]$/.test(c) ? c[3] : /^Digit\d$/.test(c) ? c[5] : /^Numpad/.test(c) ? "NUM" + c.slice(6).toUpperCase().slice(0, 3) : c.toUpperCase().slice(0, 7));
  const m = /^A(\d+)([+-])$/.exec(c);
  if (m) { const ax = +m[1], st = ax < 2 ? "LS" : ax < 4 ? "RS" : "AX" + ax, dir = ax % 2 === 0 ? (m[2] === "+" ? "RIGHT" : "LEFT") : (m[2] === "+" ? "DOWN" : "UP"); return st + " " + dir; }
  const i = +c.slice(1); return BTN[i] ?? "BTN" + i;
}
/** Short label for HUD hints: first bound code for the device. */
export function actName(dev: Dev, a: Act) { const b = binds[dev][a]; return codeName(dev, b[0] || b[1]); }

// ---------- live state ----------
export const keys = new Set<string>(); export const pressed = new Set<string>();
export const typed: string[] = []; // every keydown in order (name entry / key capture must not drop keystrokes)
/** Current controller values per code (0..1) and the raw stick/menu state. */
export const pad = { vals: new Map<string, number>(), held: new Set<string>(), prev: new Set<string>(), connected: false, ax: 0, ay: 0, lastCode: "" };
const DZ = 0.22;
export function pollPadState(gp: Gamepad | null) {
  pad.vals.clear(); pad.held.clear(); pad.ax = pad.ay = 0;
  if (!gp) { pad.prev.clear(); return; }
  gp.buttons.forEach((x, i) => { const v = x ? Math.max(x.value || 0, x.pressed ? 1 : 0) : 0; if (v > 0) pad.vals.set("B" + i, v); });
  for (let s = 0; s < gp.axes.length; s += 2) { // radial deadzone per stick
    let x = gp.axes[s] || 0, y = gp.axes[s + 1] || 0; const m = Math.hypot(x, y);
    if (m < DZ) x = y = 0; else { const k = Math.min(1, (m - DZ) / (1 - DZ)) / m; x *= k; y *= k; }
    if (s === 0) { pad.ax = x; pad.ay = y; }
    if (x > 0) pad.vals.set(`A${s}+`, x); if (x < 0) pad.vals.set(`A${s}-`, -x);
    if (y > 0) pad.vals.set(`A${s + 1}+`, y); if (y < 0) pad.vals.set(`A${s + 1}-`, -y);
  }
  for (const [c, v] of pad.vals) { const axis = c[0] === "A"; if (v > (axis ? (pad.prev.has(c) ? 0.35 : 0.6) : 0.5)) pad.held.add(c); }
  for (const c of pad.held) if (!pad.prev.has(c)) { pressed.add(c); pad.lastCode = c; }
  pad.prev = new Set(pad.held);
}
export const actDown = (a: Act) => binds.key[a].some(c => c && keys.has(c)) || binds.pad[a].some(c => c && pad.held.has(c));
export const actHit = (a: Act) => binds.key[a].some(c => c && pressed.has(c)) || binds.pad[a].some(c => c && pressed.has(c));
/** 0..1 analog value (keys = 1, sticks/triggers = magnitude). */
export const actVal = (a: Act) => { let v = binds.key[a].some(c => c && keys.has(c)) ? 1 : 0; for (const c of binds.pad[a]) if (c) v = Math.max(v, c[0] === "A" ? pad.vals.get(c) ?? 0 : pad.held.has(c) ? 1 : 0); return v; };
