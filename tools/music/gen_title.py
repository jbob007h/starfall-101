# Generates the STARFALL title theme (src/audio/music/songs_title.ts). Melodies are written in A natural-minor
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

BPM = 126
# 1 IGNITION: intro (heard once): pads and arp swell, kick creeps in, lead teases the hook
sec("1", "Ignition", BPM, "Am Am F F C C G E",
  "r:16 | r:8 4:4 7:4 | 9:12 7:4 | 5:8 4:8 | 2:12 4:4 | 7:16 | 6:8 8:4 10:4 | 11:8 6+:4 8:4",
  "r.......r.......|r.......r...o...", [dict(k="................", s="................", h="................"), K["sparse"], K["half"], dict(K["four"], s="........s...s.ss")],
  ["pad", "arp"], fills("tom"), drumSeq="00112233", arp="up", arpRate=2, harmony="sixth", fill=F["snr"], next="2")
TA8 = ("7:3 7:3 9:2 11:4 9:4 | 12:3 11:3 9:2 7:4 5:4 | 4:2 7:2 9:2 11:2 r:2 11:2 9:2 7:2 | 8:6 6:2 10:8 | "
       "7:3 7:3 9:2 11:4 14:4 | 12:3 11:3 12:2 14:4 12:4 | 13:4 11:4 10:4 8:4")
TCH = "Am F C G Am F G E Dm F C G Am F E E"
# 2 THEME A: the hook
sec("2", "Theme", BPM, TCH,
  TA8 + " | 11:12 r:2 6+:2 | 10:3 9:3 7:2 5:4 3:4 | 5:2 7:2 9:2 12:2 r:2 12:2 11:2 9:2 | 11:6 9:2 4:8 | 6:2 8:2 10:2 13:2 r:2 13:2 12:2 10:2 | "
  "14:6 12:2 11:4 9:4 | 12:6 11:2 9:4 12:4 | 13+:4 11:4 8:4 6+:4 | 11:8 r:4 8:2 6+:2",
  "r..r..o.r.r..o.r|r..r..o.r..r.so.", kits("four", "brk1", "four", "fourB"), ["stab", "arp"], fills("clap", "tom", "snr", "brk"),
  stab="..x...x...x...x.|x..x..x...x..x..", arp="up", arpRate=2, harmony="third", next="3")
# 3 LIFT: soaring answer, climbs to the top of the range
sec("3", "Lift", BPM, "F G Em Am F G Am Am Dm Em F G F G Esus4 E",
  "12:4 r:2 12:2 14:4 12:4 | 13:4 r:2 13:2 15:4 13:4 | 13:6 11:2 8:8 | 9:2 11:2 14:4 r:4 14:2 16:2 | 17:6 16:2 14:4 12:4 | 13:6 15:2 17:8 | 16:4 14:4 11:4 9:4 | 14:12 r:4 | "
  "10:4 12:4 14:4 17:4 | 11:4 13:4 15:4 18:4 | 17:6 16:2 14:8 | 13:6 14:2 15:8 | 16:3 14:3 12:2 9:8 | 15:3 13:3 10:2 8:8 | 14:16 | 13+:8 11:4 8:4",
  "rorororororororo|r.or.or.r.or.ros", kits("drive", "brk2", "drive", "brk3"), ["pad", "stab", "arp"], fills("hit", "brk", "tom", "clap"),
  lead="sorSyn", stab="x..x..x.x..x.x..", arp="updown", arpRate=2, harmony="sixth", crashEvery=4, next="4")
# 4 COUNTDOWN: breakdown that winds back up (snare build into the reprise)
sec("4", "Countdown", BPM, "Dm Dm F F Am Am E E",
  "r:16 | 3:4 5:4 7:8 | r:16 | 5:4 7:4 9:8 | r:8 7:4 9:4 | 11:16 | 6+:8 8:8 | 11:4 13+:4 15:4 r:4",
  "r.......r.......|r...o...r...o.s.", [K["sparse"], K["half"], dict(K["half"], s="....s.......s..."), dict(K["four"], s="....s...s.s.ssss")],
  ["pad", "arp"], fills("tom2"), drumSeq="00112233", arp="up", arpRate=1, harmony="sixth", fill=dict(k="k...k...k...k...", s="ssssssssssssssss", x="x..............."), next="5")
# 5 THEME REPRISE: hook again, then a new higher second half and a different cadence
sec("5", "Reprise", BPM, TCH,
  TA8 + " | 11:8 13+:4 15:4 | 17:4 14:4 10:4 14:4 | 16:4 12:4 9:4 12:4 | 16:4 11:4 9:4 11:4 | 13:6 15:2 17:8 | "
  "16:2 14:2 11:2 14:2 16:4 18:4 | 17:8 16:4 14:4 | 15:4 13+:4 11:4 8:4 | 11:12 r:4",
  "r.rro.rrr.rro.rr|r.or.or.r.or.ros|rrorrorrorrorror", [dict(K["drive"], x="x..............."), K["brk2"], K["fourB"], K["brk3"]], ["pad", "stab", "arp"], fills("clap", "brk", "tom", "hit"),
  stab="..x...x...x...x.", arp="updown", arpRate=2, harmony="third", crashEvery=4, next="2")

track = dict(id="title", title="STARFALL CALLING", stage="Title & menus", key="A minor", bpm=BPM,
  patches=dict(lead="synth", arp="bell", pad="strings", stab="sorPiano", bass="sorBass", hit="orchHit"),
  shift=0, drive=0.8, echo=dict(steps=3, vol=0.26), kit="sega", stabChord=True, mix=dict(fm5=0.85, sq1=0.7), sections=S)
open("src/audio/music/songs_title.ts", "w").write(
  "// GENERATED by tools/music/gen_title.py: edit the generator, not this file.\n"
  "// STARFALL CALLING: original title / menu theme. Intro (8 bars, once) then a 56-bar loop: Theme 16, Lift 16, Countdown 8, Reprise 16.\n"
  "import type { TrackDef } from \"./engine\";\n\nexport const TITLE_THEME: TrackDef = " + json.dumps(track, indent=1, ensure_ascii=False) + ";\n")
print(len(S), "sections", sum(len(s["chords"].split()) for s in S), "bars")
