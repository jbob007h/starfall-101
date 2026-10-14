// Offline single-file build: inline main.js into index.html (music is synthesized at runtime, no assets).
import fs from "fs";
const h = fs.readFileSync("index.html", "utf8"), js = fs.readFileSync("dist/main.js", "utf8");
const out = h.replace('<script src="main.js"></script>', () => "<script type=\"module\">" + js + "</script>");
fs.writeFileSync("/workspace/STARFALL101.html", out);
console.log("STARFALL101.html", (out.length / 1048576).toFixed(2) + " MB");
