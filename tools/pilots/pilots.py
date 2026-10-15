"""Original STARFALL 101 pilots in a 16/32-bit Sega RPG portrait style. Units: 0..100 square, 3/4 view facing left."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from anime import Art, render, cr, qb, lock, ell, stroke, LINE
from PIL import Image

SKIN = dict(base="#f4c49e", sh="#c8846a", hi="#ffe4cc", line="#5a2a2a")
SKIN_TAN = dict(base="#d9996c", sh="#9c5a3c", hi="#f0c49a", line="#4a2014")
SKIN_PALE = dict(base="#ece2f2", sh="#a99ac4", hi="#ffffff", line="#3a2a52")
SKIN_GREEN = dict(base="#62c46c", sh="#2c7a44", hi="#b2f0a6", line="#0e2a16")

FACE = [(35, 36), (31.5, 47), (32.5, 58), (36, 67), (43, 77.5), (48, 79.5), (56.5, 74.5), (64, 65), (66.5, 54), (66, 42), (56, 33), (44, 32)]


def base_face(a, skin, face=FACE, ear=True, neck=True, jaw_shadow=True):
    if neck:
        a.new_part(); a.add(cr([(45, 70), (60, 68), (62, 96), (44, 97)]), skin["base"])
        a.add(cr([(45, 70), (60, 68), (61, 81), (47, 83)]), skin["sh"], outline=False)
    return None


def body(a, col, sh, hi=None, collar=None):
    a.new_part()
    a.add(cr([(4, 104), (8, 90), (24, 82), (44, 86), (62, 85), (78, 81), (94, 88), (98, 104)]), col)
    a.add(cr([(60, 86), (78, 81), (94, 88), (98, 104), (70, 104)]), sh, outline=False)
    if hi: a.add(cr([(12, 92), (24, 85), (36, 86), (24, 90)]), hi, outline=False)


def head(a, skin, ear=True, face=FACE):
    if ear:
        a.new_part(); a.add(ell(66.5, 57, 3.8, 6.8), skin["base"])
        a.add(ell(67.2, 58, 1.7, 3.6), skin["sh"], outline=False)
    a.new_part(); a.mask("face", cr(face)); a.add(cr(face), skin["base"])
    # cel shadow: near (right) side of the face and under the jaw
    a.add(cr([(61, 46), (66.5, 54), (64, 65), (56.5, 74.5), (52, 77), (57, 69), (61, 60)]), skin["sh"], outline=False, clip="face")
    # cheek highlight
    a.add(ell(39, 63, 3.2, 1.6), skin["hi"], outline=False, clip="face")


def eye(a, cx, cy, w, h, iris, iris_dk, name, lid=LINE, lashes=True, look=-0.06):
    a.new_part()
    wh = cr([(cx - w / 2, cy + 0.3), (cx - w * 0.2, cy - h * 0.5), (cx + w * 0.25, cy - h * 0.5), (cx + w / 2, cy - h * 0.05),
             (cx + w * 0.2, cy + h * 0.45), (cx - w * 0.25, cy + h * 0.42)])
    a.mask(name, wh)
    a.add(wh, "#ffffff", pri=2, outline=False)
    ix, iy = cx + w * look, cy + h * 0.05
    a.add(ell(ix, iy, w * 0.27, h * 0.62), iris, pri=3, outline=False, clip=name)
    a.add(ell(ix, iy - h * 0.25, w * 0.27, h * 0.4), iris_dk, pri=3, outline=False, clip=name)
    a.add(ell(ix, iy + h * 0.02, w * 0.11, h * 0.3), LINE, pri=4, outline=False, clip=name)
    a.add(ell(ix - w * 0.1, iy - h * 0.2, w * 0.08, h * 0.13), "#ffffff", pri=6, outline=False, clip=name)
    a.add(ell(ix + w * 0.08, iy + h * 0.28, w * 0.04, h * 0.07), "#ffffff", pri=5, outline=False, clip=name)
    # upper lid / lashes (thick, with an outer flick) and a short lower lid line
    up = cr([(cx - w / 2 - 0.4, cy + 0.8), (cx - w * 0.2, cy - h * 0.55), (cx + w * 0.25, cy - h * 0.58), (cx + w / 2 + 1.0, cy - h * 0.05),
             (cx + w / 2 + (2.4 if lashes else 1.2), cy + h * 0.22)], closed=False, n=6)
    a.add(stroke(up, h * 0.36), lid, pri=5, outline=False)
    a.add(stroke(cr([(cx + w * 0.0, cy + h * 0.5), (cx + w * 0.3, cy + h * 0.42), (cx + w * 0.52, cy + h * 0.2)], closed=False, n=5), 0.9), lid, pri=3, outline=False)


def eyes(a, iris, iris_dk, lashes=False, look=-0.06, hs=1.0, skip_near=False):
    if not skip_near: eye(a, 56.5, 55.5, 11.5, 7.6 * hs, iris, iris_dk, "eyeN", lashes=lashes, look=look)
    eye(a, 40.0, 55.5, 8.0, 7.2 * hs, iris, iris_dk, "eyeF", lashes=lashes, look=look)


def brows(a, col, angry=0.0, thick=2.0):
    a.new_part()
    a.add(stroke(cr([(50.5, 47.5 + angry), (56.5, 45.0), (63.5, 46.5)], closed=False, n=6), thick), col, pri=4, outline=False)
    a.add(stroke(cr([(36, 47.2), (40.5, 45.8), (44.5, 47.3 + angry)], closed=False, n=6), thick * 0.9), col, pri=4, outline=False)


def nose_mouth(a, skin, mouth="flat"):
    a.add(stroke([(44.6, 58.5), (43.4, 63.5), (45.8, 65)], 1.1), skin["sh"], pri=3, outline=False)
    a.add(stroke([(43.8, 65), (45.6, 65.6)], 0.9), skin["line"], pri=4, outline=False)
    if mouth == "flat":
        a.add(stroke(cr([(42.5, 70.6), (45.5, 71.2), (49.5, 70.6)], closed=False, n=5), 1.1), skin["line"], pri=4, outline=False)
    elif mouth == "smile":
        a.add(stroke(cr([(42.0, 70.0), (45.5, 71.6), (50.5, 69.8)], closed=False, n=5), 1.1), skin["line"], pri=4, outline=False)
    elif mouth == "smirk":
        a.add(stroke(cr([(42.5, 71.2), (46.5, 71.2), (51.0, 69.0)], closed=False, n=5), 1.2), skin["line"], pri=4, outline=False)
    elif mouth == "grin":
        a.add(cr([(40.5, 68.5), (51.5, 67.0), (49.5, 73.5), (43.5, 74.5)]), LINE, pri=4, outline=False)
        a.add(cr([(41.5, 68.8), (50.5, 67.5), (49.6, 69.6), (42.5, 70.2)]), "#ffffff", pri=5, outline=False)


def fringe(a, locks, H, skin, cap):
    """Front hair: a cast shadow on the face that follows each lock, then the locks and the cap joining them."""
    a.new_part()
    for r0, r1, tip, b in locks:
        sh = lock((r0[0] + 1.2, r0[1] + 2.4), (r1[0] + 1.2, r1[1] + 2.4), (tip[0] + 1.4, tip[1] + 2.6), b)
        a.add(sh, skin["sh"], outline=False, clip="face")
    for r0, r1, tip, b in locks:
        a.add(lock(r0, r1, tip, b), H["base"])
    a.add(cr(cap), H["base"], outline=False)
    for r0, r1, tip, b in locks:  # strand definition: a dark line down each lock's right side
        m = ((r1[0] + tip[0]) / 2 + b[0] * 0.7 - 0.6, (r1[1] + tip[1]) / 2 + b[1] * 0.7)
        P = qb((r1[0] - 0.8, r1[1] + 1.5), m, tip, 8)[:-2]
        a.add(stroke(P, 1.0), H["sh"], pri=2, outline=False)


def hl_arc(a, pts, col, w=2.4, gaps=4):
    """Broken anime highlight band along an arc."""
    P = cr(pts, closed=False, n=8); n = len(P); seg = n // (gaps * 2 - 1)
    for i in range(0, n - 1, seg * 2):
        part = P[i:i + seg + 1]
        if len(part) > 1: a.add(stroke(part, w), col, pri=2, outline=False)


def body_shade(a, col, sh, hi, seam=None):
    a.new_part()
    a.add(cr([(4, 104), (8, 90), (24, 82), (44, 86), (62, 85), (78, 81), (94, 88), (98, 104)]), col)
    a.add(cr([(58, 87), (78, 81), (94, 88), (98, 104), (66, 104)]), sh, outline=False)
    a.add(cr([(8, 96), (14, 88), (26, 83), (38, 86), (24, 88), (14, 94)]), hi, outline=False)
    if seam: a.add(stroke(cr([(30, 104), (34, 92), (44, 87)], closed=False, n=5), 0.9), seam, pri=2, outline=False)


# ---------------------------------------------------------------- ACE: spiky dark hair, headset, white pilot armour
def ace():
    a = Art(); H = dict(base="#262a54", sh="#13152e", hi="#4f62b4", sp="#9ab6ff")
    a.new_part()  # back hair with chunky Sega-RPG tufts
    a.add(cr([(26, 46), (26, 24), (39, 11), (58, 9), (72, 17), (78, 33), (76, 52), (71, 63), (67, 44), (58, 36), (44, 35), (34, 44), (32, 58), (26, 56)]), H["base"])
    for r0, r1, tip, b in [((27, 34), (34, 20), (13, 25), (1, 4)), ((36, 15), (48, 10), (34, 1), (3, 2)), ((50, 10), (61, 11), (63, 0), (-2, 2)),
                           ((63, 13), (72, 21), (86, 12), (-1, 4)), ((70, 24), (77, 36), (90, 31), (-1, 4)), ((73, 40), (76, 54), (87, 55), (0, -2))]:
        a.add(lock(r0, r1, tip, b), H["base"])
    a.add(cr([(66, 30), (78, 33), (76, 52), (71, 63), (68, 46)]), H["sh"], outline=False)
    a.add(cr([(70, 24), (77, 36), (90, 31), (80, 30)]), H["sh"], outline=False)
    base_face(a, SKIN)
    body_shade(a, "#e8ecfa", "#97a2c8", "#ffffff", seam="#97a2c8")
    a.new_part()  # collar
    a.add(cr([(39, 79), (45, 89), (62, 88), (69, 77), (64, 75), (58, 84), (48, 85), (43, 77)]), "#1d2a66")
    a.add(cr([(44, 86), (62, 85), (61, 88), (45, 89)]), "#3cf0ff", outline=False)
    a.add(cr([(18, 92), (30, 87), (29, 91), (17, 96)]), "#3cf0ff", outline=False)
    head(a, SKIN)
    eyes(a, "#3a6ad0", "#1a2a6a")
    brows(a, H["base"], angry=1.0)
    nose_mouth(a, SKIN, "flat")
    fringe(a, [((30, 31), (40, 26), (29, 53), (-2, 0)), ((36, 27), (46, 25), (37, 50), (1, 0)), ((42, 26), (52, 25), (45, 48), (1, 0)),
               ((48, 25), (58, 27), (54, 47), (0, 0)), ((55, 27), (64, 30), (61, 49), (-1, 0)), ((61, 30), (70, 36), (68, 54), (-1, 0)),
               ((39, 28), (49, 26), (42, 44), (0, 0))], H, SKIN,
           [(30, 31), (44, 23), (60, 24), (70, 35), (64, 33), (52, 30), (40, 31)])
    hl_arc(a, [(33, 26), (44, 19.5), (58, 19.5), (67, 25)], H["hi"], w=2.6, gaps=4)
    for x0 in (39, 48, 56):
        a.add(stroke([(x0, 31), (x0 + 0.4, 37)], 1.1), H["hi"], pri=2, outline=False)
    a.add(stroke([(46, 19.5), (51, 19.3)], 1.2), H["sp"], pri=3, outline=False)
    a.new_part()  # headset + mic
    a.add(ell(67.5, 56.5, 4.6, 6.2), "#c9d0ea")
    a.add(ell(68.3, 56.5, 2.2, 3.6), "#3cf0ff", pri=3, outline=False)
    a.add(stroke(cr([(66, 62), (62, 69), (54, 72.5)], closed=False, n=6), 1.6), "#c9d0ea", pri=2)
    a.add(ell(53.5, 72.6, 1.5, 1.3), "#3cf0ff", pri=4)
    return a, dict(bg=("#0c0824", "#20185a"), glow="#2e2a7a", rim="#3cf0ff")


# ---------------------------------------------------------------- NOVA: long magenta hair, gold circlet, navy coat
def nova():
    a = Art(); H = dict(base="#c43a9c", sh="#7a1a68", hi="#ff7ad0", sp="#ffd2f2")
    a.new_part()
    a.add(cr([(25, 42), (27, 21), (41, 10), (60, 10), (73, 20), (77, 40), (79, 70), (82, 96), (68, 98), (68, 70), (66, 48), (34, 46), (32, 70), (30, 98), (16, 96), (21, 70)]), H["base"])
    a.add(cr([(66, 48), (77, 40), (79, 70), (82, 96), (70, 97)]), H["sh"], outline=False)
    a.add(cr([(21, 70), (25, 50), (30, 70), (28, 96), (18, 96)]), H["sh"], outline=False)
    base_face(a, SKIN)
    body_shade(a, "#1d2a66", "#111640", "#2e4596")
    a.new_part()
    a.add(cr([(38, 80), (45, 90), (62, 89), (70, 78), (64, 75), (58, 85), (48, 86), (43, 77)]), "#f2f4ff")
    a.add(cr([(26, 86), (38, 84), (40, 88), (28, 92)]), "#eeb21c", outline=False)
    a.add(cr([(68, 84), (82, 84), (80, 89), (68, 89)]), "#eeb21c", outline=False)
    head(a, SKIN)
    eyes(a, "#22b8e0", "#0c4a7a", lashes=True)
    brows(a, H["sh"], angry=0.4, thick=1.6)
    nose_mouth(a, SKIN, "smile")
    a.new_part()  # circlet under the fringe
    a.add(stroke(cr([(33, 39), (48, 36), (66, 39)], closed=False, n=8), 2.2), "#eeb21c", pri=2)
    a.add(ell(48, 36.6, 1.8, 2.2), "#ff3cc8", pri=4)
    fringe(a, [((29, 30), (40, 25), (32, 51), (-3, 2)), ((35, 26), (46, 24), (37, 46), (-1, 1)), ((42, 24), (52, 24), (45, 44), (-1, 1)),
               ((49, 24), (58, 25), (51, 42), (0, 0)), ((55, 25), (65, 29), (61, 45), (1, 0)), ((62, 29), (71, 36), (69, 53), (1, 0)),
               ((66, 40), (71, 45), (71, 80), (2, 0)), ((30, 42), (34, 44), (29, 76), (-2, 0))], H, SKIN,
           [(29, 32), (42, 23), (60, 23), (72, 34), (62, 31), (50, 28), (38, 30)])
    hl_arc(a, [(31, 28), (43, 20), (59, 20), (69, 27)], H["hi"], w=2.8, gaps=4)
    a.add(stroke(cr([(70, 50), (71.5, 62), (71.2, 74)], closed=False, n=5), 1.2), H["hi"], pri=2, outline=False)
    a.add(stroke([(46, 19.5), (53, 19.4)], 1.2), H["sp"], pri=3, outline=False)
    return a, dict(bg=("#140626", "#3a0f4a"), glow="#5a1a6a", rim="#3cf0ff")


# ---------------------------------------------------------------- ZEPHYR: reptilian, white hood with a red crest, toothy grin
def zephyr():
    a = Art(); SK = SKIN_GREEN; HOOD = dict(base="#e2e6f4", sh="#8e96b8", hi="#ffffff")
    face = [(35, 37), (31, 47), (31.5, 58), (35, 68), (42, 78.5), (48.5, 80.5), (57, 75), (64.5, 65), (67, 54), (66, 42), (56, 33), (44, 32)]
    a.new_part()  # hood back + drape
    a.add(cr([(20, 52), (22, 24), (37, 9), (60, 8), (77, 19), (81, 44), (80, 70), (90, 90), (96, 104), (4, 104), (12, 88), (20, 72)]), HOOD["base"])
    a.add(cr([(64, 40), (81, 44), (80, 70), (90, 90), (96, 104), (72, 104), (70, 72)]), HOOD["sh"], outline=False)
    a.new_part(); a.add(cr([(45, 70), (60, 68), (62, 96), (44, 97)]), SK["sh"])
    a.new_part(); a.add(cr([(36, 84), (46, 90), (62, 90), (72, 82), (68, 100), (34, 100)]), "#2a2450")  # inner collar
    head(a, SK, ear=False, face=face)
    a.add(stroke(cr([(34, 62), (37, 66), (40, 67)], closed=False, n=4), 0.9), SK["line"], pri=3, outline=False)  # cheek scales
    a.add(stroke(cr([(60, 63), (62, 60), (64, 59)], closed=False, n=4), 0.9), SK["line"], pri=3, outline=False)
    eyes(a, "#ffd23c", "#c87a10", look=-0.1, hs=0.8)
    for cx, w in ((56.5, 11.5), (40.0, 8.0)):  # slit pupils
        a.add(ell(cx + w * -0.1, 55.8, w * 0.05, 3.0), LINE, pri=6, outline=False)
    brows(a, SK["line"], angry=2.4, thick=2.4)
    nose_mouth(a, SK, "grin")
    a.add(cr([(43.5, 69.7), (44.6, 69.6), (44.0, 72.0)]), "#ffffff", pri=6, outline=False)  # fangs
    a.add(cr([(48.2, 69.0), (49.3, 68.9), (48.8, 71.4)]), "#ffffff", pri=6, outline=False)
    a.new_part()  # hood brim over the forehead and cheeks
    a.add(cr([(28, 44), (32, 31), (44, 25), (60, 26), (70, 33), (72, 46), (67, 41), (58, 34), (44, 33), (35, 39), (32, 50)]), HOOD["base"])
    a.add(cr([(66, 36), (70, 33), (72, 46), (67, 41)]), HOOD["sh"], outline=False)
    a.add(stroke(cr([(34, 33), (46, 27), (58, 28)], closed=False, n=6), 1.6), HOOD["hi"], pri=2, outline=False)
    for st in ([(46, 25), (44, 15)], [(50.5, 24.5), (50.5, 13)], [(55, 25), (57, 15)]):  # red crest (original mark)
        a.add(stroke(st, 2.2), "#d8303c", pri=3, outline=False)
    a.add(stroke(cr([(43, 21), (50.5, 23.5), (58, 21)], closed=False, n=5), 1.6), "#d8303c", pri=3, outline=False)
    return a, dict(bg=("#04140e", "#0e3a2a"), glow="#124a3a", rim="#ff3cc8")


# ---------------------------------------------------------------- TITAN: veteran captain, grey mane, beard, gold circlet
def titan():
    a = Art(); SK = SKIN_TAN; H = dict(base="#a6abc4", sh="#5f6480", hi="#e2e6f4", sp="#ffffff")
    a.new_part()
    a.add(cr([(25, 50), (26, 24), (39, 11), (60, 10), (74, 19), (79, 36), (78, 62), (72, 76), (66, 50), (58, 38), (42, 38), (33, 46), (31, 64), (26, 66)]), H["base"])
    for r0, r1, tip, b in [((68, 22), (76, 32), (90, 36), (0, -3)), ((74, 36), (78, 50), (91, 58), (0, -3)), ((74, 54), (77, 66), (86, 80), (2, -2)),
                           ((29, 28), (25, 40), (13, 42), (0, -2)), ((25, 46), (26, 60), (15, 68), (0, -2)), ((44, 11), (55, 10), (52, 1), (-2, 0)),
                           ((56, 11), (66, 15), (73, 6), (-2, 2))]:
        a.add(lock(r0, r1, tip, b), H["base"])
    a.add(cr([(66, 40), (79, 36), (78, 62), (72, 76), (67, 54)]), H["sh"], outline=False)
    for st in ([(46, 17), (62, 20), (73, 34)], [(52, 22), (66, 28), (75, 46)], [(42, 19), (32, 28), (28, 44)], [(56, 28), (68, 36), (74, 58)]):
        a.add(stroke(cr(st, closed=False, n=6), 1.1), H["sh"], pri=2, outline=False)
    for st in ([(40, 16), (50, 13.5), (60, 15)], [(30, 30), (33, 24)]):
        a.add(stroke(cr(st, closed=False, n=6), 2.0), H["hi"], pri=2, outline=False)
    base_face(a, SK)
    body_shade(a, "#1d2a66", "#111640", "#2e4596")
    a.new_part()  # gold pauldrons + red cape collar
    a.add(cr([(6, 100), (10, 86), (24, 80), (36, 84), (30, 94), (16, 100)]), "#eeb21c")
    a.add(cr([(70, 82), (84, 80), (96, 90), (96, 100), (80, 98)]), "#a8640c")
    a.add(cr([(38, 82), (46, 92), (62, 91), (70, 80), (60, 86), (48, 87)]), "#c0283a")
    head(a, SK)
    eyes(a, "#4a7ad0", "#1a2a6a", hs=0.72)
    brows(a, H["sh"], angry=1.6, thick=2.6)
    a.new_part()  # beard + moustache
    a.add(cr([(32, 58), (37, 71), (43, 84), (50, 87), (58, 81), (64, 68), (66.5, 56), (62, 62), (57, 69), (50, 71), (44, 71), (37, 65)]), H["base"])
    a.add(cr([(58, 66), (64.5, 62), (63, 72), (57, 81), (52, 84), (56, 75)]), H["sh"], outline=False)
    a.add(cr([(38.5, 66.5), (45.5, 65.4), (51.5, 67.2), (52.5, 70.2), (46, 68.8), (40, 70.2)]), H["sh"])
    a.add(stroke([(43, 72.2), (48.5, 72.4)], 1.0), LINE, pri=4, outline=False)
    a.add(stroke(cr([(40, 76), (46, 80), (52, 79)], closed=False, n=5), 0.9), H["hi"], pri=2, outline=False)
    a.add(stroke([(44.6, 58.5), (43.4, 63.5), (45.8, 65)], 1.1), SK["sh"], pri=3, outline=False)
    fringe(a, [((44, 31), (52, 31), (47, 39), (0, 0)), ((62, 33), (68, 38), (70, 50), (1, 0)), ((31, 40), (35, 37), (30, 50), (-1, 0))], H, SK,
           [(33, 38), (40, 32), (52, 30.5), (64, 32), (68, 38), (60, 34), (50, 33), (40, 35)])
    a.new_part()  # circlet
    a.add(stroke(cr([(32, 41), (49, 37.5), (67, 41)], closed=False, n=8), 3.0), "#eeb21c", pri=2)
    a.add(ell(49, 38.2, 2.0, 2.3), "#d8303c", pri=4)
    a.add(ell(40, 39.6, 1.2, 1.4), "#d8303c", pri=4); a.add(ell(58, 39.5, 1.2, 1.4), "#d8303c", pri=4)
    return a, dict(bg=("#140a04", "#3a220a"), glow="#4a2a0a", rim="#3cf0ff")


# ---------------------------------------------------------------- KITSUNE: fox-eared racer, orange bob, whisker marks
def kitsune():
    a = Art(); H = dict(base="#f08a2a", sh="#a8501a", hi="#ffc070", sp="#fff0c8")
    a.new_part()  # ears behind the hair mass
    a.add(cr([(56, 24), (69, 1), (76, 30)]), H["base"]); a.add(cr([(60, 22), (68.5, 7), (72, 26)]), "#ffe0c0", outline=False)
    a.add(cr([(32, 26), (27, 3), (46, 18)]), H["base"]); a.add(cr([(34, 23), (30, 9), (42, 18)]), "#ffe0c0", outline=False)
    a.add(cr([(66.5, 5), (69, 1), (71, 7)]), LINE, outline=False); a.add(cr([(27.5, 7), (27, 3), (31, 6)]), LINE, outline=False)
    a.new_part()
    a.add(cr([(24, 52), (25, 26), (38, 14), (60, 13), (74, 22), (78, 40), (79, 62), (73, 74), (66, 50), (34, 48), (31, 68), (23, 72)]), H["base"])
    a.add(cr([(66, 44), (78, 40), (79, 62), (73, 74), (67, 56)]), H["sh"], outline=False)
    base_face(a, SKIN)
    body_shade(a, "#86197a", "#420c4a", "#d03aa4")
    a.new_part(); a.add(cr([(36, 80), (44, 92), (64, 92), (72, 80), (64, 84), (48, 86)]), "#20b0a8")  # scarf
    a.add(cr([(56, 86), (66, 84), (70, 98), (60, 99)]), "#127a74", outline=False)
    head(a, SKIN)
    eyes(a, "#e8a020", "#8a4a10", lashes=True)
    brows(a, H["sh"], angry=-0.6, thick=1.5)
    nose_mouth(a, SKIN, "smile")
    for y in (64.5, 67.0):  # whisker marks
        a.add(stroke([(33.5, y), (37.5, y + 0.6)], 1.0), "#d03aa4", pri=4, outline=False)
        a.add(stroke([(58.5, y + 0.6), (63, y)], 1.0), "#d03aa4", pri=4, outline=False)
    fringe(a, [((29, 30), (39, 26), (31, 50), (-2, 2)), ((35, 26), (45, 24), (38, 46), (-1, 1)), ((42, 24), (52, 24), (46, 44), (0, 1)),
               ((49, 24), (58, 25), (53, 43), (0, 0)), ((55, 25), (65, 29), (62, 47), (1, 0)), ((62, 29), (71, 36), (70, 54), (1, 0)),
               ((66, 42), (72, 46), (73, 72), (2, 0)), ((29, 42), (34, 44), (28, 70), (-2, 0))], H, SKIN,
           [(28, 32), (41, 22), (60, 22), (72, 34), (62, 31), (50, 28), (38, 30)])
    hl_arc(a, [(31, 28), (43, 20.5), (59, 20.5), (69, 27)], H["hi"], w=2.6, gaps=4)
    a.add(stroke([(47, 20), (53, 19.8)], 1.2), H["sp"], pri=3, outline=False)
    return a, dict(bg=("#140626", "#3a0f4a"), glow="#5a1a6a", rim="#3cf0ff")


# ---------------------------------------------------------------- UNIT-9: android, long silver hair, fin ears, cyan seams
def unit9():
    a = Art(); SK = SKIN_PALE; H = dict(base="#c8ccdc", sh="#7a7f98", hi="#ffffff", sp="#ffffff")
    a.new_part()
    a.add(cr([(24, 44), (26, 21), (40, 10), (60, 10), (74, 19), (78, 40), (80, 72), (84, 98), (70, 99), (68, 70), (66, 48), (34, 46), (31, 72), (28, 99), (14, 97), (20, 70)]), H["base"])
    a.add(cr([(66, 46), (78, 40), (80, 72), (84, 98), (71, 98)]), H["sh"], outline=False)
    a.add(cr([(20, 70), (24, 50), (30, 72), (27, 97), (16, 96)]), H["sh"], outline=False)
    base_face(a, SK)
    body_shade(a, "#262836", "#0e0e18", "#4c5164")
    a.new_part()
    a.add(cr([(38, 79), (45, 90), (62, 89), (70, 77), (64, 74), (58, 85), (48, 86), (43, 76)]), "#9aa1b4")
    a.add(stroke(cr([(14, 98), (26, 88), (40, 88)], closed=False, n=5), 1.0), "#3cf0ff", pri=3, outline=False)
    a.add(stroke(cr([(66, 88), (82, 86), (94, 94)], closed=False, n=5), 1.0), "#3cf0ff", pri=3, outline=False)
    a.new_part()  # audio fin (pointed ear)
    a.add(cr([(64.5, 52), (80, 38), (74, 50), (67.5, 63)]), SK["base"]); a.add(cr([(67, 52), (77, 42), (68, 59)]), SK["sh"], outline=False)
    head(a, SK, ear=False)
    a.add(stroke(cr([(58.5, 61), (60, 66), (59, 71)], closed=False, n=4), 0.9), "#3cf0ff", pri=4, outline=False)  # face seams
    a.add(stroke([(36, 61), (37.5, 66)], 0.8), "#3cf0ff", pri=4, outline=False)
    eyes(a, "#ff3c50", "#7a0a14", look=-0.04, hs=0.85)
    brows(a, H["sh"], angry=0.2, thick=1.3)
    nose_mouth(a, SK, "flat")
    fringe(a, [((46, 24), (50, 24), (36, 52), (-4, 2)), ((50, 24), (54, 24), (64, 50), (3, 1)), ((40, 25), (47, 24), (31, 56), (-2, 2)),
               ((54, 24), (62, 27), (69, 58), (2, 1)), ((63, 30), (70, 36), (72, 84), (2, 0)), ((30, 40), (34, 44), (28, 80), (-2, 0))], H, SK,
           [(30, 34), (42, 22), (58, 22), (70, 34), (60, 27), (50, 25), (40, 28)])
    hl_arc(a, [(32, 28), (43, 20.5), (59, 20.5), (69, 27)], H["hi"], w=2.4, gaps=4)
    a.add(cr([(48.6, 31), (50, 29), (51.4, 31), (50, 33)]), "#3cf0ff", pri=4, outline=False)  # forehead light
    return a, dict(bg=("#14040e", "#3a0a1a"), glow="#5a1020", rim="#ff3cc8")


# ---------------------------------------------------------------- EMBER: bald veteran rival, flame tattoo, cyber-eye, scar
def ember():
    a = Art(); SK = SKIN_TAN
    face = [(35, 37), (31.5, 47), (32.5, 58), (36, 68), (43, 78), (48.5, 80), (57, 75), (64.5, 65), (67, 54), (66.5, 42), (56, 33), (44, 32)]
    base_face(a, SK)
    body_shade(a, "#1f3a2a", "#0e1e16", "#2e5a40")
    a.new_part(); a.add(cr([(36, 80), (44, 91), (63, 90), (72, 79), (63, 84), (48, 86)]), "#c0283a")
    a.new_part()  # big pointed ear + gold ring
    a.add(cr([(64.5, 50), (82, 41), (74, 54), (67.5, 64)]), SK["base"]); a.add(cr([(67, 51), (78, 44), (68, 59)]), SK["sh"], outline=False)
    a.add(ell(68, 66.5, 1.8, 2.2), "#eeb21c", pri=3)
    head(a, SK, ear=False, face=face)
    fp = a.part  # bald cranium: same part as the face, so no line crosses the forehead
    a.mask("skull", cr([(31, 50), (30, 28), (41, 15), (57, 14), (69, 22), (72, 40), (68, 50)]))
    a.add(cr([(31, 50), (30, 28), (41, 15), (57, 14), (69, 22), (72, 40), (68, 50)]), SK["base"], part=fp)
    a.add(cr([(58, 18), (69, 22), (72, 40), (68, 50), (62, 40)]), SK["sh"], part=fp, outline=False, clip="skull")
    a.add(ell(40, 24, 5, 2.4), SK["hi"], part=fp, outline=False, clip="skull")
    for st in ([(60, 22), (64, 30), (60, 36)], [(64, 26), (68, 32), (65, 40)], [(56, 28), (59, 34), (56, 40)]):  # flame tattoo
        a.add(stroke(cr(st, closed=False, n=5), 1.8), "#d8303c", part=fp, pri=3, outline=False)
    eyes(a, "#3a9a6a", "#14402a", hs=0.7, skip_near=True)
    a.new_part()  # cyber eye on the near side
    a.add(ell(56.8, 55.5, 5.4, 4.8), "#4c5164", pri=3)
    a.add(ell(56.8, 55.5, 3.2, 3.0), "#880a16", pri=4, outline=False)
    a.add(ell(56.4, 55.2, 1.8, 1.7), "#ff2a3c", pri=5, outline=False)
    a.add(ell(55.6, 54.4, 0.8, 0.8), "#fff0c0", pri=6, outline=False)
    brows(a, "#c0283a", angry=2.2, thick=2.4)
    a.add(stroke([(37, 46), (42, 58), (39, 63)], 1.0), "#7a2018", pri=5, outline=False)  # scar over the far eye
    nose_mouth(a, SK, "smirk")
    a.add(stroke(cr([(41, 75), (47, 78), (54, 75)], closed=False, n=5), 1.0), SK["sh"], pri=2, outline=False)  # stubble shade
    return a, dict(bg=("#140404", "#3a0a0a"), glow="#6a1410", rim="#3cf0ff")


PILOTS = {"ACE": ace, "NOVA": nova, "ZEPHYR": zephyr, "TITAN": titan, "KITSUNE": kitsune, "UNIT-9": unit9, "EMBER": ember}


def portrait(name, N):
    a, st = PILOTS[name]()
    return render(a, N, bg=st["bg"], glow=st["glow"], rim=st["rim"])


