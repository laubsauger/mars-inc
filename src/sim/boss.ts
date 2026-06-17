// Gatekeeper of Phobos — boss controller (T33). Turns the boss enemy from a
// damage sponge into a phased fight. Reads the boss out of the shared enemy pool
// and drives escalating, TELEGRAPHED attacks through the ranged framework
// (lobbed barrages, gun volleys, slam shockwaves) plus gate summons. Phase
// boundaries are HP fractions — crossing one "breaks" the boss (shockwave +
// adds), the readable beat RPG/action bosses use. Exposes a snapshot for the
// HUD health bar. Deterministic via the shared rng (V16).

import { type EnemyPool, EnemyState, RUST_MITE } from './enemies';
import { type Player, hitPlayer } from './player';
import type { Rng } from '../core/rng';
import type { FxQueue } from './fx';
import { type EnemyAttackSystem, BeamStyle } from './enemy-attacks';
import { interiorPoint, wallDistance } from './arena';
import {
  type BossDef,
  type BossMove,
  type BossTier,
  bossByVariant,
  isBossVariant,
} from '../content/bosses';

/** Weighted pick of one move from a phase pool (deterministic via the run rng). */
function pickMove(pool: readonly BossMove[], rng: Rng): BossMove | undefined {
  if (pool.length === 0) return undefined;
  let total = 0;
  for (const m of pool) total += m.weight ?? 1;
  let r = rng.next() * total;
  for (const m of pool) {
    r -= m.weight ?? 1;
    if (r <= 0) return m;
  }
  return pool[pool.length - 1];
}

// Charge attack (T-boss): a brief telegraph (a danger LINE drawn by a damage-0 beam)
// then a snap-slide of the boss body along it — keep moving or get run over.
const CHARGE_TELE = 0.95; // telegraph window (read the lane + dodge off it before it lunges)
const CHARGE_SLIDE = 0.26; // the snap-slide is FAST (a lunge, not a walk)
const CHARGE_DMG = 44; // HEAVY — a long telegraph means getting run over really hurts
const CHARGE_LANE = 1.5; // danger-line half-width (≈ the boss body)

// Kept for back-compat (tests/UI defaults): the Gatekeeper's 3-phase shape. Per-boss
// phase counts now come from the BossDef (T75).
export const BOSS_NAME = 'Gatekeeper of Phobos';
export const BOSS_PHASES = 3;

export interface BossSnapshot {
  active: boolean;
  hp01: number;
  phase: number; // 0-based current phase
  phases: number;
  name: string;
  /** Boss tier — drives the distinct miniboss vs final HUD treatment (T78, V39). */
  tier: BossTier;
}

export class BossController {
  active = false;
  hp01 = 0;
  /** True once ANY boss has been slain (Act-2 unlock / run "won"). */
  defeated = false;
  /** Per-kill EDGE: true only the step a boss dies — the world grants one reward +
   *  counts the kill, then the controller re-arms for the next boss wave (V22 ×N). */
  justDefeated = false;
  /** The boss currently on the field (its identity drives phases/charge/HUD). */
  private def: BossDef | null = null;
  /** Set on the death edge: the id/tier of the boss that just fell — the world uses
   *  it to bank first-kill unlocks + decide act completion (T75/T79). */
  lastKilledId: string | null = null;
  lastKilledTier: BossTier | null = null;
  private phase = 0;
  private timer = 0;
  // Charge state: 0 idle · 1 telegraph (line shown, boss braced) · 2 sliding.
  private chargeState = 0;
  private chargeT = 0;
  private dirX = 0;
  private dirZ = 0;
  private sx = 0; // slide start
  private sz = 0;
  private tx = 0; // slide target
  private tz = 0;
  private chargeHit = false; // contact already dealt this slide

  reset(): void {
    this.active = false;
    this.hp01 = 0;
    this.defeated = false;
    this.justDefeated = false;
    this.def = null;
    this.lastKilledId = null;
    this.lastKilledTier = null;
    this.phase = 0;
    this.timer = 0;
    this.chargeState = 0;
  }

  /** Drive the boss this step. No-op when no boss is on the field. */
  step(
    enemies: EnemyPool,
    player: Player,
    attacks: EnemyAttackSystem,
    rng: Rng,
    dt: number,
    fx: FxQueue,
  ): void {
    const b = this.findBoss(enemies);
    if (b < 0) {
      // Boss left the field. If one was active it just DIED this step → fire the
      // per-kill edge (world rewards + counts it) and re-arm for the next wave.
      this.justDefeated = this.active;
      if (this.active) {
        this.defeated = true;
        this.lastKilledId = this.def?.id ?? null;
        this.lastKilledTier = this.def?.tier ?? null;
      }
      this.active = false;
      this.hp01 = 0;
      return;
    }
    this.justDefeated = false;
    // Identify the boss on the field (its def drives phases/charge/name/tier).
    this.def = bossByVariant(enemies.variant[b]!) ?? this.def;
    const phases = this.def?.phases ?? BOSS_PHASES;
    if (!this.active) {
      this.active = true;
      this.phase = 0;
      this.timer = this.cadence(0);
    }
    const hp = Math.max(0, enemies.health[b]!);
    // Per-instance max so the HP bar reads correctly for SCALED (escalating) bosses.
    this.hp01 = hp / Math.max(1, enemies.maxHp[b]! || this.def?.enemyType.maxHealth || 1);

    // Phase break: crossing a threshold escalates + punishes with a shockwave/adds.
    const want = this.phaseFor(this.hp01, phases);
    if (want > this.phase) {
      this.phase = want;
      this.onPhaseBreak(enemies, attacks, rng, fx, b);
    }

    // A charge OWNS the boss while it runs (telegraph + slide) — no other attacks
    // fire, and the boss body position is driven directly here, overriding steering.
    if (this.chargeState > 0) {
      this.driveCharge(enemies, player, fx, b, dt);
      return;
    }

    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.cadence(this.phase);
      // Pick + execute one move from this boss's per-phase moveset (T-bossmoves) —
      // the bespoke behaviour is DATA, the controller just runs it.
      this.runMove(enemies, player, attacks, rng, fx, b);
    }
  }

  /** Begin a charge: lock the line toward the player, draw the danger telegraph (a
   *  damage-0 beam to the target), and brace. */
  private startCharge(
    enemies: EnemyPool,
    player: Player,
    attacks: EnemyAttackSystem,
    fx: FxQueue,
    b: number,
  ): void {
    const ex = enemies.posX[b]!;
    const ez = enemies.posZ[b]!;
    let dx = player.pos.x - ex;
    let dz = player.pos.z - ez;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // Charge to just PAST the player, capped at the wall (minus the body so it
    // doesn't bury itself in the wall).
    const wall = wallDistance(ex, ez, dx, dz, 60) - enemies.radius[b]!;
    const dist = Math.min(wall, l + 4);
    this.dirX = dx;
    this.dirZ = dz;
    this.sx = ex;
    this.sz = ez;
    this.tx = ex + dx * dist;
    this.tz = ez + dz * dist;
    this.chargeState = 1;
    this.chargeT = CHARGE_TELE;
    this.chargeHit = false;
    // Danger line: a damage-0 telegraph beam (the render thickens it as it "charges",
    // and flashes when the boss launches) — reuses the laser-sentinel beam visual.
    attacks.beams.spawn(ex, ez, dx, dz, dist, CHARGE_LANE, CHARGE_TELE, 0, BeamStyle.Charge);
    fx.push('muzzle', ex, ez, dx, dz);
  }

  /** Advance an in-progress charge: hold during the telegraph, then snap-slide the
   *  body along the line, running over the player for heavy contact. */
  private driveCharge(
    enemies: EnemyPool,
    player: Player,
    fx: FxQueue,
    b: number,
    dt: number,
  ): void {
    if (this.chargeState === 1) {
      // Telegraph: brace in place (override steering drift) until the line elapses.
      enemies.posX[b] = this.sx;
      enemies.posZ[b] = this.sz;
      enemies.velX[b] = 0;
      enemies.velZ[b] = 0;
      this.chargeT -= dt;
      if (this.chargeT <= 0) {
        this.chargeState = 2;
        this.chargeT = CHARGE_SLIDE;
        fx.push('muzzle', this.sx, this.sz, this.dirX, this.dirZ); // launch cue
      }
      return;
    }
    // Sliding: ease the body from start → target; deal one heavy contact hit if it
    // catches the player.
    this.chargeT -= dt;
    const p = Math.min(1, 1 - Math.max(0, this.chargeT) / CHARGE_SLIDE);
    const ease = p * (2 - p); // ease-out — a fast launch that settles
    const bx = this.sx + (this.tx - this.sx) * ease;
    const bz = this.sz + (this.tz - this.sz) * ease;
    enemies.posX[b] = bx;
    enemies.posZ[b] = bz;
    if (!this.chargeHit) {
      const ddx = player.pos.x - bx;
      const ddz = player.pos.z - bz;
      const rr = enemies.radius[b]! + player.stats.collisionRadius + 0.3;
      if (ddx * ddx + ddz * ddz <= rr * rr) {
        hitPlayer(player, CHARGE_DMG, { variant: enemies.variant[b]!, kind: 'charge' });
        this.chargeHit = true;
        fx.push('impact', bx, bz, this.dirX, this.dirZ);
      }
    }
    if (this.chargeT <= 0) {
      this.chargeState = 0;
      this.timer = this.cadence(this.phase); // resume normal cadence
    }
  }

  /** Current phase (0-based) of the active boss — drives the director's boss-creep
   *  intensity so reinforcements escalate as the fight breaks (T44/V42). */
  get currentPhase(): number {
    return this.phase;
  }

  snapshot(): BossSnapshot {
    return {
      active: this.active,
      hp01: this.hp01,
      phase: this.phase,
      phases: this.def?.phases ?? BOSS_PHASES,
      name: this.def?.name ?? BOSS_NAME,
      tier: this.def?.tier ?? 'final',
    };
  }

  private findBoss(enemies: EnemyPool): number {
    for (let i = 0; i < enemies.count; i++) {
      if (enemies.state[i] === EnemyState.Active && isBossVariant(enemies.variant[i]!)) return i;
    }
    return -1;
  }

  /** HP fraction → phase. 2-phase minibosses break once (≤50%); 3-phase finals
   *  break at 66% and 33% (the classic three-act boss arc). */
  private phaseFor(frac: number, phases: number): number {
    if (phases <= 2) return frac > 0.5 ? 0 : 1;
    return frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
  }

  private cadence(phase: number): number {
    return phase <= 0 ? 2.6 : phase === 1 ? 1.8 : 1.2; // faster each phase
  }

  /** Pick + execute ONE move from this boss's per-phase moveset (T-bossmoves). The
   *  behaviour is DATA (BossDef.moves); this just dispatches to the right helper. All
   *  telegraphed (V9 spirit), pipeline-routed (V3). */
  private runMove(
    enemies: EnemyPool,
    player: Player,
    attacks: EnemyAttackSystem,
    rng: Rng,
    fx: FxQueue,
    b: number,
  ): void {
    const ex = enemies.posX[b]!;
    const ez = enemies.posZ[b]!;
    const px = player.pos.x;
    const pz = player.pos.z;

    const pools = this.def?.moves;
    const pool = pools && pools.length ? pools[Math.min(this.phase, pools.length - 1)]! : [];
    const move = pickMove(pool, rng);
    if (!move) {
      // No moveset (shouldn't happen) → a plain aimed lob so the boss still fights.
      attacks.lobAt(ex, ez, px, pz, 12, 1.1, 3.6, 22);
      fx.push('muzzle', ex, ez, 0, 0);
      return;
    }

    switch (move.kind) {
      case 'aimedLob':
        attacks.lobAt(ex, ez, px, pz, 12, 1.1, move.radius ?? 3.6, move.damage ?? 22);
        break;
      case 'ringLob': {
        const n = move.count ?? 5;
        const rr = move.radius ?? 4;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          attacks.lobAt(
            ex,
            ez,
            px + Math.cos(a) * rr,
            pz + Math.sin(a) * rr,
            12,
            1.1,
            3.0,
            move.damage ?? 18,
          );
        }
        break;
      }
      case 'spiralLob': {
        // An expanding spiral around the player — rotating denial that pushes outward.
        const n = move.count ?? 8;
        const base = rng.next() * Math.PI * 2;
        for (let k = 0; k < n; k++) {
          const a = base + k * 0.7;
          const rr = 2 + (k / n) * 6;
          attacks.lobAt(
            ex,
            ez,
            px + Math.cos(a) * rr,
            pz + Math.sin(a) * rr,
            13,
            1.0,
            3.0,
            move.damage ?? 16,
          );
        }
        break;
      }
      case 'gunVolley': {
        const n = move.count ?? 4;
        for (let k = 0; k < n; k++) {
          attacks.gunShot(ex, ez, px, pz, 24, move.damage ?? 10, 0.22, 40, rng);
        }
        break;
      }
      case 'meteorBarrage':
        this.meteorBarrage(attacks, fx, px, pz, rng, move.count, move.damage, move.radius);
        break;
      case 'laserStar':
        this.laserStar(attacks, ex, ez, rng, move.count);
        break;
      case 'charge':
        // Charge OWNS the body across steps; bail out without the muzzle cue.
        if (this.def?.charge !== false) {
          this.startCharge(enemies, player, attacks, fx, b);
          return;
        }
        attacks.lobAt(ex, ez, px, pz, 12, 1.1, 3.6, 22); // non-charger fallback
        break;
      case 'summon':
        this.summonAdds(enemies, rng, move.count ?? 3);
        break;
    }
    fx.push('muzzle', ex, ez, 0, 0);
  }

  /** Summon interior adds near the walls (gate-less reinforcements during a fight). */
  private summonAdds(enemies: EnemyPool, rng: Rng, n: number): void {
    for (let k = 0; k < n; k++) {
      const p = interiorPoint(rng.next(), rng.next(), 0.7, 0.92);
      enemies.spawn(RUST_MITE, p.x, p.z, 0.6, k);
    }
  }

  /** Orbital meteor barrage (T44) — telegraphed strikes scattered around the player.
   *  Reuses the Moonshot meteor FX (a falling rock onto the telegraph) + the hazard
   *  pool's delayed AoE (V3 damage on cook-off). More strikes deeper into the fight. */
  private meteorBarrage(
    attacks: EnemyAttackSystem,
    fx: FxQueue,
    px: number,
    pz: number,
    rng: Rng,
    count?: number,
    damage?: number,
    radiusOverride?: number,
  ): void {
    const n = count ?? 3 + this.phase;
    const radius = radiusOverride ?? 3.2;
    const dmg = damage ?? 20;
    const fuse = 1.3; // telegraph + meteor fall time (dodgeable)
    for (let k = 0; k < n; k++) {
      const ang = rng.next() * Math.PI * 2;
      const d = rng.next() * 6; // scatter around the player, not a guaranteed hit
      const x = px + Math.cos(ang) * d;
      const z = pz + Math.sin(ang) * d;
      attacks.hazardAt(x, z, radius, fuse, dmg);
      // variant 1 = HOSTILE meteor → render tints it violet so it never reads as the
      // player's own orange Moonshot (T44 feedback).
      fx.push('meteor', x, z, fuse, radius, 1);
    }
  }

  /** Radial laser star (T44) — a ring of telegraphed beams firing outward from the
   *  boss. Reuses the sentinel beam pool (charge → hitscan flash). Static lines:
   *  read the lock during the charge and step off them. */
  private laserStar(
    attacks: EnemyAttackSystem,
    ex: number,
    ez: number,
    rng: Rng,
    count?: number,
  ): void {
    const beams = count ?? 4 + this.phase; // a denser star deeper in
    const base = rng.next() * Math.PI * 2;
    for (let k = 0; k < beams; k++) {
      const a = base + (k / beams) * Math.PI * 2;
      // owner -1 → a STATIC beam (doesn't track the boss); long enough to span the pit.
      attacks.beams.spawn(
        ex,
        ez,
        Math.cos(a),
        Math.sin(a),
        70,
        1.0,
        1.2,
        30,
        BeamStyle.Sentinel,
        -1,
        0,
      );
    }
  }

  /** On a phase break: slam shockwave centered on the boss + gate summons. */
  private onPhaseBreak(
    enemies: EnemyPool,
    attacks: EnemyAttackSystem,
    rng: Rng,
    fx: FxQueue,
    b: number,
  ): void {
    const ex = enemies.posX[b]!;
    const ez = enemies.posZ[b]!;
    attacks.hazardAt(ex, ez, 8 + this.phase * 2, 1.3, 24); // big telegraphed slam
    const adds = 2 + this.phase;
    for (let k = 0; k < adds; k++) {
      const p = interiorPoint(rng.next(), rng.next(), 0.7, 0.92); // near the walls
      enemies.spawn(RUST_MITE, p.x, p.z, 0.6, k);
    }
    // Final bosses punctuate a phase break with a radial laser star — a dramatic
    // "the fight escalates" beat on top of the slam (T44).
    if (this.def?.tier === 'final') this.laserStar(attacks, ex, ez, rng);
    fx.push('death', ex, ez); // heavy break cue
  }
}
