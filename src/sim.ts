// Authoritative match simulation, DOM-free: shared by LocalSimTransport (browser)
// and the Node server. Slot ids are global 0..100.
export type Tier = 0 | 1 | 2;
export interface Slot { id: number; name: string; isBot: boolean; ai: boolean; alive: boolean; hp: number; badges: number; skill: number;
  target: number; targets: number[]; retarget: number; sendCd: number; regen: number; armed: boolean; place: number; }
export interface MatchOut {
  attack(from: number, to: number, tier: Tier, power: number): void; // delivered to human `to`
  hit(id: number, from: number): void;
  ko(id: number, by: number, place: number, badges: number): void;
  end(winner: number): void;
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class MatchSim {
  slots: Slot[]; time = 0; over = false;
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
    if (t.ai) { this.damage(t, [1, 2, 3][tier] + (power > 30 ? 1 : 0), from); if (Math.random() < 0.5) t.target = from; }
    else this.out.attack(from, to, tier, power);
  }
  humanState(id: number, hp: number, badges: number, targets: number[], armed: boolean) {
    const s = this.slots[id]; if (!s || !s.alive) return; s.hp = hp; s.badges = badges; s.targets = targets; s.armed = armed; s.target = targets[0] ?? -2;
  }
  humanKO(id: number, by: number) {
    const s = this.slots[id]; if (!s || !s.alive) return; this.eliminate(s, by);
  }
  private eliminate(s: Slot, by: number) {
    s.alive = false; s.hp = 0; s.place = this.alive().length + 1;
    const k = this.slots[by]; if (k && k.alive) k.badges += 1 + Math.floor(s.badges / 2); // humans also self-count from ko events
    this.out.ko(s.id, by, s.place, s.badges);
    for (const b of this.slots) if (b.target === s.id) b.target = -2;
    const al = this.alive();
    if (!this.over && (al.length <= 1 || !al.some(x => !x.ai))) { this.over = true; this.out.end(al.length === 1 ? al[0].id : -2); }
  }
  private damage(b: Slot, dmg: number, from: number) {
    b.hp -= dmg; b.regen = 0; this.out.hit(b.id, from);
    if (b.hp <= 0) this.eliminate(b, from);
  }
  /** Pacing curve: nobody drops for ~55s, then the field thins to ~1 by ~12 min. */
  private aliveTarget() { const t = this.time; if (t < 55) return 101; const p = clamp((t - 55) / 640, 0, 1); return Math.max(1, Math.round(101 * Math.pow(1 - p, 1.25))); }
  tick(dt: number) {
    if (this.over) return;
    this.time += dt;
    const excess = this.alive().length - this.aliveTarget();
    const rate = (this.calm() ? 0.15 : 0.5) + Math.max(0, excess) * 0.9; // abstract AI-vs-AI fights
    let acc = rate * dt;
    while (Math.random() < acc && !this.over) {
      acc -= 1; const v = pick(this.alive().filter(s => s.ai)); if (!v) break; if (excess <= 0 && v.hp <= 1) continue;
      const killer = pick(this.alive().filter(r => r !== v && r.ai)); this.damage(v, 1, killer ? killer.id : -2);
    }
    if (this.over) return;
    const al = this.alive(), n = al.length, humans = al.filter(s => !s.ai), ramp = this.ramp(), calm = this.calm();
    for (const b of this.slots) {
      if (!b.alive || !b.ai) continue;
      if (b.hp < 3) { b.regen += dt; if (b.regen > 20) { b.hp++; b.regen = 0; } }
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
          if (!calm) { const roll = Math.random() * b.skill * ramp; tier = roll > 1.1 ? 2 : roll > 0.55 ? 1 : 0; }
          this.out.attack(b.id, t.id, tier, calm ? Math.min(pw, 5) : pw);
        }
      }
    }
  }
}
