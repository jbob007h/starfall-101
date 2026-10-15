"""Anime-style pixel portraits (16/32-bit Sega RPG look: Phantasy Star IV / Shining Force).

Pipeline: each pilot is drawn as flat cel-shaded vector parts (polygons from smooth curves) in a 0..100 unit
square, 3/4 view facing left, on a high-res canvas; then reduced to the pixel grid with a priority-mode filter
(no colour blending: every pixel is one palette colour, and feature colours like lashes/pupils/highlights win their
block so faces survive at 40-48px), then dark selective outlines are added where a part sits in front of another.
"""
import math
import numpy as np
from PIL import Image, ImageDraw

LINE = "#120818"


def hx(c):
    c = c.lstrip("#"); return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16))


# ---------------------------------------------------------------- geometry helpers (units 0..100)
def cr(pts, closed=True, n=10):
    """Catmull-Rom spline through pts."""
    P = list(pts); out = []
    m = len(P)
    rng = range(m) if closed else range(m - 1)
    for i in rng:
        p0 = P[(i - 1) % m] if closed or i > 0 else P[0]
        p1, p2 = P[i], P[(i + 1) % m]
        p3 = P[(i + 2) % m] if closed or i + 2 < m else P[-1]
        for k in range(n):
            t = k / n; t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    if not closed: out.append(P[-1])
    return out


def qb(a, c, b, n=10):
    return [((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]) for t in np.linspace(0, 1, n)]


def lock(r0, r1, tip, bend=(0, 0)):
    """A tapered hair lock from root edge r0-r1 to tip, bowed by `bend`."""
    m0 = ((r0[0] + tip[0]) / 2 + bend[0], (r0[1] + tip[1]) / 2 + bend[1])
    m1 = ((r1[0] + tip[0]) / 2 + bend[0] * 0.7, (r1[1] + tip[1]) / 2 + bend[1] * 0.7)
    return qb(r0, m0, tip) + qb(tip, m1, r1)


def ell(cx, cy, rx, ry, n=40, a0=0, a1=2 * math.pi):
    return [(cx + rx * math.cos(a), cy + ry * math.sin(a)) for a in np.linspace(a0, a1, n)]


def stroke(pts, w):
    """Polyline -> polygon of width w (tapered ends)."""
    L = []; R = []
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        a = pts[max(0, i - 1)]; b = pts[min(n - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]; d = math.hypot(dx, dy) or 1
        k = w / 2 * (0.35 + 0.65 * math.sin(math.pi * (i + 0.5) / n))
        L.append((x - dy / d * k, y + dx / d * k)); R.append((x + dy / d * k, y - dx / d * k))
    return L + R[::-1]


# ---------------------------------------------------------------- drawing list
class Art:
    """Ops are drawn back-to-front. Each op: polygon, colour, part id (for outlines), priority, outline flag, clip."""
    def __init__(self, palette=None):
        self.pal = palette; self.ops = []; self.part = 0; self.masks = {}
    def mask(self, name, pts): self.masks[name] = pts
    def new_part(self): self.part += 1; return self.part
    def add(self, pts, col, part=None, pri=1, outline=True, clip=None):
        self.ops.append((pts, col, self.part if part is None else part, pri, outline, clip))


def render(art, N, k=None, bg=("#0c0824", "#2a1a6a"), glow="#3a2a8a", rim=None, line=LINE, zoom=1.1, cx=52, cy=60):
    k = k or max(4, int(round(640 / N)))
    S = N * k
    cols = [line, "#ffffff"] + sorted({op[1] for op in art.ops} - {line, "#ffffff"})
    cidx = {c: i for i, c in enumerate(cols)}
    cim = Image.new("L", (S, S), 255); pim = Image.new("L", (S, S), 0); rim_ = Image.new("L", (S, S), 0)
    dc, dp, dr = ImageDraw.Draw(cim), ImageDraw.Draw(pim), ImageDraw.Draw(rim_)
    sc = lambda pts: [(((x - cx) * zoom + 50) * S / 100, ((y - cy) * zoom + 50 + (cy - 50)) * S / 100) for x, y in pts]
    clips = {}
    for name, pts in art.masks.items():
        m = Image.new("L", (S, S), 0); ImageDraw.Draw(m).polygon(sc(pts), fill=255); clips[name] = m
    for pts, col, part, pri, outline, clip in art.ops:
        P = sc(pts)
        if clip is None:
            dc.polygon(P, fill=cidx[col]); dp.polygon(P, fill=part); dr.polygon(P, fill=pri * 16 + (1 if outline else 0))
        else:
            m = Image.new("L", (S, S), 0); ImageDraw.Draw(m).polygon(P, fill=255)
            m = Image.fromarray(np.minimum(np.array(m), np.array(clips[clip])))
            cim.paste(cidx[col], mask=m); pim.paste(part, mask=m); rim_.paste(pri * 16 + (1 if outline else 0), mask=m)
    C = np.array(cim).reshape(N, k, N, k).transpose(0, 2, 1, 3).reshape(N, N, k * k)
    Pm = np.array(pim).reshape(N, k, N, k).transpose(0, 2, 1, 3).reshape(N, N, k * k)
    R = np.array(rim_).reshape(N, k, N, k).transpose(0, 2, 1, 3).reshape(N, N, k * k)
    pri = (R >> 4).astype(np.float32)
    ncol = len(cols) + 1
    Cc = np.where(C == 255, ncol - 1, C)
    w = np.where(C == 255, 1.0, np.maximum(pri, 1.0))
    counts = np.zeros((N, N, ncol), np.float32)
    for c in range(ncol): counts[..., c] = ((Cc == c) * w).sum(-1)
    # the background only wins if it really covers most of the block
    counts[..., ncol - 1] *= 0.8
    best = counts.argmax(-1)
    # part + outline flag of the winning colour: take the most common part among that colour's samples
    part = np.zeros((N, N), int); outl = np.zeros((N, N), bool)
    for y in range(N):
        for x in range(N):
            b = best[y, x]
            if b == ncol - 1: part[y, x] = 0; continue
            sel = Cc[y, x] == b
            vals = Pm[y, x][sel]; part[y, x] = np.bincount(vals).argmax()
            outl[y, x] = (R[y, x][sel] & 1).max() == 1
    img = np.zeros((N, N, 3), np.float32)
    # background: dark gradient + faint grid + dithered glow (same family as the game's panels)
    BAY = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0
    yy, xx = np.mgrid[0:N, 0:N]
    t = (yy / N)[..., None]
    img[:] = np.array(hx(bg[0]), np.float32) * (1 - t) + np.array(hx(bg[1]), np.float32) * t
    gstep = max(4, N // 9)
    gm = (xx % gstep == 0) | (yy % gstep == 0)
    img[gm] = img[gm] * 0.75 + np.array(hx("#2a1d5a"), np.float32) * 0.25
    gr = np.hypot((xx - N * 0.55) / N, (yy - N * 0.42) / N)
    gmask = np.clip(0.75 - gr * 1.4, 0, 1) > BAY[yy % 4, xx % 4] * 0.9
    img[gmask] = img[gmask] * 0.5 + np.array(hx(glow), np.float32) * 0.5
    fg = best < ncol - 1
    pal = np.array([hx(c) for c in cols], np.float32)
    img[fg] = pal[best[fg]]
    # selective outlines: silhouette, and where an outlined part sits in front of a part with a lower id
    out = np.zeros((N, N), bool)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        nb = np.full((N, N), -1)
        ys = slice(max(0, dy), N + min(0, dy)); xs = slice(max(0, dx), N + min(0, dx))
        yd = slice(max(0, -dy), N + min(0, -dy)); xd = slice(max(0, -dx), N + min(0, -dx))
        nb[yd, xd] = np.where(fg[ys, xs], part[ys, xs], -1)
        out |= fg & outl & ((nb == -1) | ((nb >= 0) & (nb < part)))
    img[out] = np.array(hx(line), np.float32)
    if rim:  # thin neon rim on the right silhouette, game palette
        sh = np.zeros((N, N), bool); sh[:, :-1] = ~fg[:, 1:]; sh[:, -1] = True
        edge = fg & sh
        inner = np.zeros((N, N), bool); inner[:, :-1] = edge[:, 1:]
        r = inner & fg & ~edge & (yy < N * 0.92)
        img[r] = np.array(hx(rim), np.float32) * 0.7 + img[r] * 0.3
    return Image.fromarray(img.clip(0, 255).astype(np.uint8))
