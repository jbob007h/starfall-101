# Generates the NEON VELOCITY track (src/audio/music/songs_velocity.ts). Melodies are written in A natural-minor
# scale degrees (0 = A4, 7 = A5, "+" sharpen, "b" flatten, "r" rest) as "deg:len" tokens, 16 sixteenths per bar.
import json, re
L = "ABCDEFG"
def note(tok):
    m = re.fullmatch(r"(-?\d+)([+b]?)", tok); d = int(m.group(1)); i, o = d % 7, d // 7
    return L[i] + {"+": "#", "b": "b", "": ""}[m.group(2)] + str(4 + o + (1 if i >= 2 else 0))
def mel(bars):
    out = []
    for b in bars.strip().split("|"):
        toks, tot = [], 0
        for t in b.split():
            d, n = t.split(":"); n = int(n); tot += n
            toks.append(("_" if d == "r" else note(d)) + "-" + str(n))
        assert tot == 16, (b, tot); out.append(" ".join(toks))
    return " | ".join(out)

T1 = "4:2 7:2 r:2 7:2 6:2 7:2 9:4 | 9:3 7:3 5:2 r:4 2:2 4:2 | 6:2 8:2 r:2 8:2 7:2 8:2 10:4 | 11:6 10:2 8:4 6:4 | 4:2 7:2 r:2 7:2 6:2 7:2 11:4 | 12:3 11:3 9:2 7:4 5:4 | 6:2 8:2 10:2 13:2 r:2 13:2 12:2 10:2 | 8:12 r:4"
T2 = "10:2 r:2 10:2 12:2 14:4 12:4 | 12:3 10:3 9:2 7:4 9:4 | 9:2 11:2 r:2 11:2 9:2 7:2 4:4 | 6:6 8:2 10:8 | 11:2 r:2 11:2 12:2 11:2 9:2 7:4 | 9:3 7:3 5:2 7:4 9:4 | 8:6 6+:2 4:8 | 6+:2 8:2 11:2 13+:2 11:4 8:4"
T2hi = "10:2 12:2 14:2 12:2 10:4 9:4 | 12:4 11:4 9:4 7:4 | 9:2 11:2 14:2 16:2 14:4 11:4 | 13:8 10:4 8:4 | 14:6 11:2 9:4 7:4 | 9:2 7:2 5:2 7:2 9:4 12:4 | 13+:8 11:8 | 6+:2 8:2 11:2 13+:2 15:8"
TCH = "Am F G Em Am F G G Dm F C G Am F E E"
M7b = "14:6 12:2 10:4 9:4 | 11:6 13:2 15:8 | 14:4 12:4 9:4 12:4 | 13:8 10:4 8:4 | 11:2 12:2 14:4 16:8 | 14:4 12:4 9:4 7:4 | 8:4 11:4 13+:4 15:4 | 13+:12 r:4"

# drum kits
K = dict(
  house=dict(k="k...k...k...k...", s="................", c="....c.......c...", h="..o...o...o...o."),
  brk1=dict(k="k.........k.....", s="....s.......s...", h="h.h.h.h.h.h.h.h."),
  brk2=dict(k="k.k.......k..k..", s="....s..s.s..s...", h="h.hhh.hhh.hhh.hh"),
  brk3=dict(k="k.k.......kk....", s="....s..s.s..s..s", h="h.h.h.h.h.h.h.o."),
  four=dict(k="k...k...k...k...", s="....s.......s...", c="....c.......c...", h="h.o.h.o.h.o.h.o."),
  fourB=dict(k="k...k...k...k.k.", s="....s.......s...", c="....c..c....c...", h="hhohhhohhhohhhoh"),
  drive=dict(k="k.k.k.k.k.k.k.k.", s="....s.......s...", c="....c.......c...", h="hhhohhhohhhohhho"),
  half=dict(k="k.........k.....", s="........s.......", h="h...h...h...h..."),
  sparse=dict(k="k.......k.......", s="................", h="..h...h...h...h."),
)
F = dict(
  tom=dict(s="....s...........", t="........hhmmllll"),
  snr=dict(s="....s...s.s.ssss"),
  clap=dict(s="....s...........", c="....c...c.c.cccc"),
  brk=dict(k="k.k...k...k.k...", s="....s..s..s.s.ss"),
  hit=dict(x="x.......x.......", s="....s.......s.ss"),
  tom2=dict(s="....s.s.........", t="..........hmhmll"),
)
def kits(*n): return [K[x] for x in n]
def fills(*n): return [F[x] for x in n]

S = []
def sec(id, name, bpm, chords, melody, bass, drums, harm, fl, **kw):
    d = dict(id=id, name=name, bpm=bpm, chords=chords, melody=mel(melody), bass=bass, harm=harm, drums=drums, fills=fl)
    d.update(kw); assert len(chords.split()) == len(d["melody"].split("|")), id; S.append(d)

# 1 NIGHT DRIVE: groove intro, lead riffs in, house stabs
sec("1", "Night drive", 132, "Am Am F G Am Am F G Dm Dm Am Am F G Esus4 E",
  "7:3 7:3 6:2 4:4 r:4 | 4:2 6:2 7:2 9:4 7:2 r:4 | 5:3 5:3 4:2 2:4 r:4 | 3:2 4:2 6:4 8:6 r:2 | 7:3 7:3 6:2 4:4 r:4 | 9:2 r:2 9:2 10:2 11:4 9:4 | 12:6 11:2 9:4 7:4 | 8:8 6:4 r:4 | "
  "10:3 9:3 7:2 5:4 7:4 | 3:4 5:4 7:4 10:4 | 9:6 7:2 4:8 | 2:2 4:2 7:2 9:2 11:8 | 12:4 11:4 9:4 7:4 | 6:4 8:4 10:4 13:4 | 11:12 r:4 | 6+:2 7:2 8:2 9:2 8:4 6+:4",
  "r..r..o.r.r..o.r|r..r..o.r..r.so.", kits("house", "house", "brk1", "house"), ["stab"], fills("clap", "tom", "snr"),
  stab="..x...x...x...x.|..x...x...x.x...", harmony="third", next="1b")
sec("1b", "Night drive II", 132, "F G Em Am F G E E",
  "7:2 9:2 12:4 r:2 12:2 11:4 | 10:2 11:2 13:4 r:2 13:2 11:4 | 11:6 10:2 8:4 6:4 | 7:12 r:4 | 5:2 7:2 9:2 12:2 11:4 9:4 | 8:2 10:2 13:2 15:2 14:4 13:4 | 13+:4 11:4 8:4 6+:4 | 11:8 r:8",
  "r.o.r.o.r.o.r.o.|r..r..o.r.r..o.r", kits("brk1", "four"), ["pad", "arp"], fills("tom"),
  arp="up", arpRate=2, harmony="third", fill=F["snr"], next="1")
# 2 MAIN THEME
sec("2", "Main street", 136, TCH, T1 + " | " + T2,
  "r..r..o.r.r..o.r|r..r..o.r..rso.|r.o..r.o.r.o.rso", kits("four", "brk1", "four", "brk2"), ["stab", "arp"], fills("snr", "clap", "tom", "brk"),
  stab="..x...x...x...x.|x..x..x...x..x..", arp="up", arpRate=2, harmony="third", next="2b")
sec("2b", "Main street II", 136, "Dm Em F G Dm Em E E",
  "3:4 5:4 7:2 9:2 10:4 | 4:4 6:4 8:2 10:2 11:4 | 12:6 11:2 9:4 7:4 | 8:4 10:4 13:8 | 10:3 9:3 7:2 5:4 3:4 | 6:3 8:3 11:2 10:4 8:4 | 8:8 6+:8 | 4:2 6+:2 8:2 11:2 13+:8",
  "r...f...o...s.f.|r.o.r.o.r.o.rso", kits("half", "brk1"), ["pad", "arp"], fills("tom2"),
  arp="updown", arpRate=2, harmony="third", fill=F["hit"], next="2")
# 3 BACK ALLEY: call and response, Bb colour
sec("3", "Back alley", 140, "Dm Dm Am Am Bb C Am Am Dm Dm Am Am Bb C E E",
  "3:2 3:2 r:2 5:2 r:2 7:2 5:4 | 3:2 2:2 0:4 r:8 | 4:2 4:2 r:2 7:2 r:2 9:2 7:4 | 4:2 2:2 0:4 r:4 -3:4 | 3:4 5:4 8b:4 7:4 | 9:6 7:2 4:8 | 7:3 9:3 11:2 9:8 | r:8 4:2 6:2 7:4 | "
  "10:2 10:2 r:2 12:2 r:2 14:2 12:4 | 10:2 9:2 7:4 r:4 9:4 | 11:2 11:2 r:2 14:2 r:2 16:2 14:4 | 11:2 9:2 7:4 r:4 4:4 | 5:4 8b:4 10:4 12:4 | 11:6 9:2 7:8 | 8:4 6+:4 4:4 6+:4 | 8:12 r:4",
  "r.or.or.r.or.ror|r..r.or..r.r.so.|r.or.or.r.o.rr.o", kits("brk2", "brk3", "brk2", "fourB"), ["pad", "arp"], fills("brk", "tom", "clap", "snr"),
  arp="updown", harmony="third", next="3b")
sec("3b", "Back alley II", 140, "F G Am Am F G Esus4 E",
  "7:2 r:2 7:2 9:2 r:2 12:2 11:4 | 10:2 r:2 10:2 8:2 r:2 6:2 8:4 | 7:8 4:4 7:4 | 9:2 11:2 9:2 7:2 4:8 | 5:2 7:2 9:2 12:2 r:2 12:2 11:4 | 10:4 13:4 15:8 | 14:12 r:4 | 13+:4 11:4 8:4 6+:4",
  "r.o.r.o.r.o.r.o.|r..r..o.r.r..o.s", kits("four", "fourB"), ["stab", "arp"], fills("hit"),
  stab="x..x..x...x..x..|..x...x...x.x.x.", arp="up", harmony="third", fill=F["tom"], next="3")
# 4 ROOFTOPS: tension, minor descents
sec("4", "Rooftops", 143, "Am Am G G F F E E Am Am G G F G E E",
  "0:4 2:2 4:2 r:2 7:2 6:2 4:2 | 2:6 0:2 4:8 | -1:4 1:2 3:2 r:2 6:2 5:2 3:2 | 1:6 -1:2 3:8 | 5:4 7:2 9:2 r:2 12:2 11:2 9:2 | 7:6 5:2 2:8 | 6+:4 8:4 11:4 13+:4 | 11:8 8:4 6+:4 | "
  "7:2 7:2 9:2 11:2 r:2 11:2 9:2 7:2 | 9:6 7:2 4:8 | 6:2 6:2 8:2 10:2 r:2 10:2 8:2 6:2 | 8:6 6:2 3:8 | 5:2 7:2 9:2 12:2 14:4 12:4 | 13:4 10:4 8:4 6:4 | 6+:2 8:2 11:2 13+:2 14:4 13+:4 | 11:12 r:4",
  "r..r..r.o..o..rs|r..r..r.o..o.ro.|rrorrorrorrorros", kits("brk3", "drive", "brk2", "drive"), ["stab", "arp"], fills("tom", "snr", "brk", "hit"),
  stab="x..x..x.x..x..x.|x..x..x...x.x...", arp="up", harmony="third", crashEvery=8, next="4b")
sec("4b", "Rooftops break", 143, "Dm Dm F F Am Am E E",
  "10:12 r:4 | 9:4 7:4 5:8 | 12:12 r:4 | 11:4 9:4 7:8 | 11:8 9:4 7:4 | 9:8 4:8 | 8:8 6+:8 | 11:4 r:4 13+:4 r:4",
  "r.......r.......|r...o...r...o.s.", kits("sparse", "half", "brk1", "brk2"), ["pad"], fills("tom2"),
  drumSeq="00112233", harmony="sixth", fill=F["tom"], next="4")
# 5 MAIN THEME HIGH
sec("5", "Top gear", 146, TCH, T1 + " | " + T2hi,
  "r.rro.rrr.rro.rr|r.or.or.r.or.ros|rrorrorrorrorror", kits("fourB", "brk2", "drive", "brk3"), ["pad", "stab", "arp"], fills("clap", "brk", "tom", "hit"),
  stab="..x...x...x...x.", arp="updown", harmony="third", crashEvery=4, next="5b")
sec("5b", "Top gear II", 146, "F G Am C F G E E",
  "12:3 12:3 11:2 9:4 7:4 | 10:3 10:3 8:2 6:4 8:4 | 7:3 9:3 11:2 14:8 | 13:4 11:4 9:4 11:4 | 12:3 12:3 14:2 12:4 9:4 | 13:3 13:3 15:2 13:4 10:4 | 11:4 13+:4 15:4 13+:4 | 11:8 r:8",
  "r.or.or.r.or.ror|rorororororororo", kits("drive", "brk2"), ["stab", "arp"], fills("tom"),
  stab="x..x..x.x..x.x..", arp="up", harmony="third", fill=F["snr"], next="5")
# 6 RIOT: 16th-note runs
sec("6", "Riot", 149, "Am G F G Am G F E Dm Em F G Dm Em E E",
  "7:1 6:1 7:1 9:1 11:2 9:2 7:2 4:2 7:4 | 6:1 5:1 6:1 8:1 10:2 8:2 6:2 3:2 6:4 | 5:1 4:1 5:1 7:1 9:2 7:2 5:2 2:2 5:4 | 6:2 8:2 10:2 13:2 10:2 8:2 6:4 | "
  "11:1 10:1 11:1 12:1 14:2 12:2 11:2 9:2 11:4 | 10:1 9:1 10:1 11:1 13:2 11:2 10:2 8:2 10:4 | 9:1 8:1 9:1 10:1 12:2 10:2 9:2 7:2 5:4 | 6+:2 8:2 11:2 13+:2 11:2 8:2 6+:4 | "
  "10:4 12:2 10:2 9:4 7:4 | 11:4 13:2 11:2 10:4 8:4 | 12:2 14:2 12:2 9:2 7:2 9:2 12:4 | 13:6 15:2 13:8 | 14:2 12:2 10:2 9:2 10:2 12:2 14:4 | 15:2 13:2 11:2 10:2 11:2 13:2 15:4 | 13+:4 11:4 8:4 13+:4 | 11:2 8:2 6+:2 4:2 6+:2 8:2 11:4",
  "rorororororororo|rorororororosoro|r.rrr.rrr.rrr.ro", kits("drive", "brk2", "drive", "brk3"), ["stab", "arp"], fills("brk", "hit", "tom", "clap"),
  stab="x.x.x.x.x.x.x.x.|x..x..x.x..x.x..", arp="up", harmony="third", crashEvery=4, next="6b")
sec("6b", "Riot II", 149, "F G Am Am F G E E",
  "12:2 r:2 12:2 r:2 11:2 9:2 7:4 | 13:2 r:2 13:2 r:2 12:2 10:2 8:4 | 14:12 r:4 | 11:2 12:2 14:2 16:2 14:8 | 12:2 r:2 12:2 r:2 14:2 12:2 9:4 | 13:2 r:2 13:2 r:2 15:2 13:2 10:4 | 13+:8 11:8 | 13+:2 11:2 8:2 6+:2 4:8",
  "rorororororororo|r.or.or.r.or.ros", [dict(K["drive"], x="x.......x......."), K["brk2"]], ["stab", "pad"], fills("tom"),
  stab="x.x.x.x.x.x.x.x.", harmony="sixth", fill=F["snr"], next="6")
# 7 FINAL TEN (director adds the key change): soaring lead
sec("7", "Final ten", 152, "F G Am Am F G E E Dm Em F G Am F E E",
  "12:6 11:2 9:4 7:4 | 8:6 10:2 13:8 | 11:6 9:2 7:8 | 9:2 11:2 14:4 12:4 11:4 | 12:6 14:2 12:4 9:4 | 10:6 13:2 15:8 | 13+:6 11:2 8:8 | 11:4 13+:4 15:4 13+:4 | " + M7b,
  "rrorrorrorrorror|rorororororosoro", kits("drive", "fourB", "drive", "brk2"), ["pad", "arp"], fills("hit", "brk", "tom", "clap"),
  lead="sorSyn", arp="updown", harmony="sixth", crashEvery=4, next="7b")
sec("7b", "Final ten II", 152, "Am G F G Am G E E",
  "14:4 11:4 7:4 11:4 | 13:4 10:4 6:4 10:4 | 12:4 9:4 5:4 9:4 | 10:4 13:4 15:8 | 14:2 15:2 16:4 14:4 11:4 | 13:2 14:2 15:4 13:4 10:4 | 11:4 13+:4 15:4 13+:4 | 11:12 r:4",
  "rorororororororo|rrorrorrorrorror", [dict(K["drive"], x="x..........x...."), K["brk3"]], ["stab", "arp"], fills("tom2"),
  lead="sorSyn", stab="x..x..x.x..x.x..", arp="up", harmony="sixth", fill=F["hit"], next="7")
# 8 LAST DUEL: main theme + soaring answer, orchestra hits
sec("8", "Last duel", 156, "Am F G Em Am F G G Dm Em F G Am F E E", T1 + " | " + M7b,
  "rorororororororo|rrorrorrorrorros", [dict(K["drive"], x="x..............."), K["brk2"], K["drive"], K["brk3"]], ["stab", "pad", "arp"], fills("hit", "brk", "tom", "clap"),
  stab="x..x..x.x..x.x..", arp="up", harmony="sixth", crashEvery=2, next="8b")
sec("8b", "Last duel II", 156, "F G Em Am F G E E",
  "12:2 14:2 12:2 9:2 12:4 14:4 | 13:2 15:2 13:2 10:2 13:4 15:4 | 15:6 13:2 11:8 | 14:2 11:2 9:2 7:2 9:2 11:2 14:4 | 16:4 14:4 12:4 14:4 | 15:4 13:4 10:4 13:4 | 13+:2 15:2 13+:2 11:2 8:2 11:2 13+:4 | 11:16",
  "rorororororororo", [dict(K["drive"], x="x.......x......."), K["brk3"]], ["stab", "arp"], fills("tom"),
  lead="sorSyn", stab="x.x.x.x.x.x.x.x.", arp="up", harmony="sixth", crashEvery=2, fill=dict(k="k.......k.......", s="s.s.s.s.ssssssss", x="x..............."), next="8")

track = dict(id="velocity", title="NEON VELOCITY", stage="Full match · 101 to 1", key="A minor", bpm=132,
  patches=dict(lead="sorLead", arp="sorArp", pad="sorOrgan", stab="sorPiano", bass="sorBass", hit="orchHit"),
  shift=0, drive=1.4, echo=dict(steps=3, vol=0.24), finalTranspose=2, kit="sega", stabChord=True,
  mix=dict(fm5=0.9, sq1=0.7), sections=S)
open("src/audio/music/songs_velocity.ts", "w").write(
  "// GENERATED by tools/music/gen_velocity.py: edit the generator, not this file.\n"
  "// NEON VELOCITY: original street-brawler house/breakbeat score (SoR2-style YM2612 palette) for the adaptive director.\n"
  "// 8 player-count stages, each a 16-bar A section chained to an 8-bar B variant (next), with rotating drum kits/fills/bass.\n"
  "import type { TrackDef } from \"./engine\";\n\nexport const VELOCITY: TrackDef = " + json.dumps(track, indent=1, ensure_ascii=False) + ";\n")
print(len(S), "sections", sum(len(s["chords"].split()) for s in S), "bars")
