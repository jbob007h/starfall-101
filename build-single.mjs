// Offline single-file build: inline main.js and embed the streamed music (base64) so file:// play has the trance soundtracks.
import fs from "fs";
const h = fs.readFileSync("index.html", "utf8"), js = fs.readFileSync("dist/main.js", "utf8");
const dir = "assets/music", mus = {};
for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) if (f.endsWith(".ogg")) mus[f.slice(0, -4)] = fs.readFileSync(dir + "/" + f).toString("base64");
const out = h.replace('<script src="main.js"></script>', () => "<script>window.__SF_MUSIC=" + JSON.stringify(mus) + ";</script>\n<script type=\"module\">" + js + "</script>");
fs.writeFileSync("/workspace/STARFALL101.html", out);
console.log("STARFALL101.html", (out.length / 1048576).toFixed(2) + " MB,", Object.keys(mus).length, "embedded music files");
