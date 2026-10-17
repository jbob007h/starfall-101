// Authoritative match simulation, DOM-free: shared by LocalSimTransport (browser)
// and the Node server. Slot ids are global 0..100.
export type Tier = 0 | 1 | 2;
export interface Slot { id: number; name: string; isBot: boolean; ai: boolean; alive: boolean; hp: number; badges: number; skill: number;
  target: number; targets: number[]; retarget: number; sendCd: number; regen: number; armed: boolean; place: number; }
export interface MatchOut {
  attack(from: number, to: number, tier: Tier, power: number, variant: number): void; // delivered to human `to`; variant = mini-boss design
  hit(id: number, from: number): void;
  ko(id: number, by: number, place: number, badges: number): void;
  end(winner: number): void;
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const BOSS_VARIANTS = 4; // 0 SAUCER, 1 SERPENT, 2 FORTRESS, 3 PHANTOM
/** Mini-boss design for a sent attack: designs unlock with match stage / attack power, newest favored. */
export function pickBossVariant(power: number, time: number) {
  const unlocked = Math.min(BOSS_VARIANTS, 2 + (time > 120 || power >= 50 ? 1 : 0) + (time > 200 || power >= 60 ? 1 : 0));
  return Math.random() < 0.4 ? unlocked - 1 : Math.floor(Math.random() * unlocked);
}
export const DUEL_HP = 14, DUEL_REGEN = 17;
const CALLSIGNS = ["NOVA", "VIPER", "ZEPHYR", "RAZOR", "COMET", "BLITZ", "ORBIT", "PULSAR", "QUASAR", "NEBULA", "GHOST", "FALCON", "HAWK", "ROGUE",
  "SPARK", "TITAN", "ECHO", "FLUX", "ONYX", "LYNX", "RAPTOR", "SABER", "VORTEX", "JINX", "KAIJU", "MANTA", "NEON", "PIXEL", "TURBO", "ZERO",
  "ACE", "BLAZE", "CYGNUS", "DRACO", "EMBER", "FROST", "GAMMA", "HELIX", "ION", "JOLT", "KOMET", "LASER", "MAVERICK", "NYX", "OMEGA", "PHOTON",
  "QUAKE", "RADAR", "SIGMA", "TEMPO", "ULTRA", "VEGA", "WARP", "XENON", "YUKI", "ZAP", "ASTRO", "BOLT", "COBRA", "DYNAMO", "ROCKET", "STRIKER",
  "APEX", "BANSHEE", "CIPHER", "DELTA", "RIPTIDE", "SOLAR", "LUNA", "STARLA", "HYDRA", "MIRAGE", "NITRO", "PHANTOM", "RAVEN", "SHOGUN", "TALON",
  "VOLT", "WRAITH", "ZENITH", "AURORA", "BISHOP", "CRUX", "DJINN", "FURY", "GLITCH", "HAVOC", "KESTREL", "MOTH", "OZONE", "PYRO", "RONIN"];
const PREFIX = ["MEGA", "HYPER", "DARK", "STAR", "NEO", "SKY", "RED"];
/** Unique arcade-style callsigns for bots (NOVA, VIPER7, ZEPHYR, HYPERJOLT, ACE99...). */
export function botNames(n: number, taken: string[] = []) {
  const used = new Set(taken.map(t => t.toUpperCase())), out: string[] = [];
  while (out.length < n) {
    const b = pick(CALLSIGNS), r = Math.random();
    let nm = r < 0.5 ? b : r < 0.8 ? b + Math.floor(rnd(2, 10)) : r < 0.9 ? b + Math.floor(rnd(10, 100)) : pick(PREFIX) + b;
    if (nm.length > 10 || used.has(nm)) continue; used.add(nm); out.push(nm);
  }
  return out;
}
export class MatchSim {
  slots: Slot[]; time = 0; over = false; duelT = -1; bossCd: Record<number, number> = {};
  /** players: in slot order. ai=true slots are driven by this sim (bots, or simulated humans offline). */
  constructor(players: { name: string; isBot: boolean; ai: boolean }[], private out: MatchOut) {
    this.slots = players.map((p, i) => ({ id: i, name: p.name, isBot: p.isBot, ai: p.ai, alive: true, hp: 3, badges: 0, skill: p.isBot ? rnd(0.3, 0.9) : rnd(0.5, 1),
      target: -2, targets: [], retarget: rnd(0, 10), sendCd: rnd(18, 40), regen: 0, armed: false, place: 0 }));
  }
  alive() { return this.slots.filter(s => s.alive); }
  calm() { return this.time < 90; }
  ramp() { const a = this.alive().length; return (1 + (101 - a) / 100 * 1.3) * (this.calm() ? 0.65 : 1) * (a <= 2 ? 1.15 : 1); }
  /** Human `from` cashed in on `to`. Bots take damage here; humans get the attack forwarded. */
  humanAttack(from: number, to: number, tier: Tier, power: number) {
    const t = this.slots[to], f = this.slots[from]; if (!t || !t.alive || !f || !f.alive || this.over) return;
    if (t.ai) { this.damage(t, [1, 2, 3][tier] + (power > 50 ? 1 : 0), from); if (Math.random() < 0.5) t.target = from; }
    else this.out.attack(from, to, tier, power, pickBossVariant(power, this.time));
  }
  humanState(id: number, hp: number, badges: number, targets: number[], armed: boolean) {
    const s = this.slots[id]; if (!s || !s.alive) return; s.hp = hp; s.badges = badges; s.targets = targets; s.armed = armed; s.target = targets[0] ?? -2;
  }
  humanKO(id: number, by: number) {
    const s = this.slots[id]; if (!s || !s.alive) return; this.eliminate(s, by);
  }
  private eliminate(s: Slot, by: number) {
    s.alive = false; s.hp = 0; s.place = this.alive().length + 1;
    { const rest = this.alive(); if (rest.length === 1 && (by < 0 || !this.slots[by] || by === s.id)) by = rest[0].id; } // final KO: always credit the winner (duel attrition, field deaths, quits)
    const k = this.slots[by]; if (k && k.alive) k.badges += 1 + Math.floor(s.badges / 2); // humans also self-count from ko events
    this.out.ko(s.id, by, s.place, s.badges);
    for (const b of this.slots) if (b.target === s.id) b.target = -2;
    const al = this.alive();
    if (al.length === 2 && al.some(x => !x.ai) && this.duelT < 0) { this.duelT = this.time; for (const b of al) if (b.ai) { b.hp = DUEL_HP; b.regen = 0; } } // final CPU powers up
    if (!this.over && al.length > 1 && !al.some(x => !x.ai)) { this.finishBots(); return; }
    if (!this.over && (al.length <= 1 || !al.some(x => !x.ai))) { this.over = true; this.out.end(al.length === 1 ? al[0].id : -2); }
  }
  /** No humans left: resolve the remaining bots instantly so every slot gets a placement and KO credit (leaderboard). */
  private finishBots() {
    this.over = true;
    const al = this.alive().map(b => ({ b, k: b.hp + b.skill * 3 + b.badges * 0.5 + Math.random() * 2 })).sort((x, y) => x.k - y.k).map(x => x.b);
    while (al.length > 1) {
      const v = al.shift()!, k = pick(al); v.alive = false; v.hp = 0; v.place = al.length + 1; k.badges += 1 + Math.floor(v.badges / 2);
      this.out.ko(v.id, k.id, v.place, v.badges);
    }
    al[0].place = 1; this.out.end(al[0].id);
  }
  private damage(b: Slot, dmg: number, from: number) {
    b.hp -= dmg; b.regen = 0; this.out.hit(b.id, from);
    if (b.hp <= 0) this.eliminate(b, from);
  }
  /** Pacing curve (piecewise-linear keyframes, seconds -> players left): protected opening to 0:55,
   *  top 20 at 4:00, top 10 at 5:00, then the final 10 linger for the boss music; duel (2) by ~6:40. */
  static PACE: [number, number][] = [[0, 101], [55, 101], [120, 60], [180, 35], [240, 19], [300, 9], [345, 6], [400, 2], [480, 1]];
  private aliveTarget() { const K = MatchSim.PACE, t = this.time; for (let i = 1; i < K.length; i++) if (t <= K[i][0]) { const [t0, a] = K[i - 1], [t1, b] = K[i]; return Math.round(a + (b - a) * (t - t0) / (t1 - t0)); } return 1; }
  /** Final duel: the last CPU has DUEL_HP, regenerates slowly and only takes light "attrition" damage,
   *  so its survival depends mainly on the attacks the human sends (~60-90 s if you play passively). */
  private duelTick(dt: number, al: Slot[]) {
    const b = al.find(x => x.ai); if (!b) return;
    b.regen += dt; if (b.regen > DUEL_REGEN && b.hp < DUEL_HP) { b.hp++; b.regen = 0; }
    if (this.time - this.duelT > 20 && Math.random() < dt / 9) this.damage(b, 1, al.find(x => !x.ai)?.id ?? -2); // duel attrition is the human opponent's pressure
  }
  /** Mini-boss attacks on each human: none before 2:00 / calm; every ~60-90 s mid-game, ~30-45 s in the final 10 / duel. */
  private bossScheduler(dt: number, humans: Slot[], n: number) {
    for (const h of humans) {
      if (this.bossCd[h.id] === undefined) this.bossCd[h.id] = rnd(0, 30);
      if (this.calm() || this.time < 120) continue;
      this.bossCd[h.id] -= dt; if (this.bossCd[h.id] > 0) continue;
      this.bossCd[h.id] = n <= 10 ? rnd(30, 45) : n <= 25 ? rnd(45, 65) : rnd(60, 90);
      const bots = this.alive().filter(x => x.ai), s = bots.find(x => x.target === h.id) ?? pick(bots); if (!s) continue;
      const pw = 40 + Math.floor(rnd(0, 12) * s.skill) + s.badges + (n <= 10 ? 8 : 0);
      this.out.attack(s.id, h.id, 2, pw, pickBossVariant(pw, this.time));
    }
  }
  tick(dt: number) {
    if (this.over) return;
    this.time += dt;
    const al0 = this.alive(), duel = al0.length <= 2 && al0.some(x => !x.ai);
    if (duel) { this.duelTick(dt, al0); if (this.over) return; }
    const excess = duel ? 0 : this.alive().length - this.aliveTarget();
    const rate = (this.calm() ? 0.15 : 0.5) + Math.max(0, excess) * 0.9; // abstract AI-vs-AI fights
    let acc = duel ? 0 : rate * dt;
    while (Math.random() < acc && !this.over) {
      acc -= 1; const v = pick(this.alive().filter(s => s.ai)); if (!v) break; if (excess <= 0 && v.hp <= 1) continue;
      const killer = pick(this.alive().filter(r => r !== v && r.ai)); this.damage(v, 1, killer ? killer.id : -2);
    }
    if (this.over) return;
    const al = this.alive(), n = al.length, humans = al.filter(s => !s.ai), ramp = this.ramp(), calm = this.calm();
    this.bossScheduler(dt, humans, n);
    for (const b of this.slots) {
      if (!b.alive || !b.ai) continue;
      if (!duel && b.hp < 3) { b.regen += dt; if (b.regen > 20) { b.hp++; b.regen = 0; } }
      b.retarget -= dt;
      const tgt = this.slots[b.target];
      if (b.retarget <= 0 || (tgt && !tgt.alive)) {
        b.retarget = rnd(8, 14); b.target = -2;
        if (n <= 2 && humans.length) b.target = humans[0].id;
        else for (const h of humans) { const p = clamp(1.4 / n + 0.03 + h.badges * 0.008 + (h.armed ? 0.01 : 0), 0, 0.9); if (Math.random() < p) { b.target = h.id; break; } }
      }
      const t = this.slots[b.target];
      if (t && t.alive && !t.ai) {
        b.sendCd -= dt;
        if (b.sendCd <= 0 && this.time > 25) {
          b.sendCd = rnd(14, 26) / Math.sqrt(ramp) * (n <= 2 ? 0.5 : 1);
          let tier: Tier = 0; const pw = (calm ? 3 : 4) + Math.floor(rnd(0, 10) * b.skill * ramp) + b.badges;
          if (!calm) { const roll = Math.random() * b.skill * ramp; tier = roll > 0.55 ? 1 : 0; } // mini-bosses come from the boss scheduler below
          // bot attack power respects the tier thresholds (wave 15+, mini-boss 40+)
          const p2 = calm ? Math.min(pw, 5) : Math.max(pw, [0, 15, 40][tier]); this.out.attack(b.id, t.id, tier, p2, pickBossVariant(p2, this.time));
        }
      }
    }
  }
}
