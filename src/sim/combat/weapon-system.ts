// Weapon + projectile system (T14). Resolves a target per the weapon's targeting
// rule (mouse-aim for the starter sidearm; nearest / lowest-health kept for other
// weapons & upgrades), fires on cooldown into the pooled projectiles, then moves
// projectiles and resolves collisions through the centralized damage pipeline
// (V3). Dead enemies are flagged (health ≤ 0) and compacted after this system so
// hash indices stay valid during the collide loop.

import type { EnemyPool } from '../enemies';
import { EnemyState, ENEMY_BY_VARIANT } from '../enemies';
import type { SpatialHash } from '../spatial-hash';
import type { Player } from '../player';
import { applyRecoil } from '../movement';
import type { Rng } from '../../core/rng';
import { ProjectilePool } from './projectiles';
import {
  type WeaponInstance,
  type WeaponDamageSpec,
  type WeaponDefinition,
  type WeaponFamily,
  equip,
} from './weapon';
import { makePacket, computeOutgoing, applyMitigation } from './damage';
import { corrodeAmp, shockAmp } from './status';
import { procCoefOf } from './proc';
import { applyAreaDamage } from './aoe';
import { knockbackFrom } from './knockback';
import { wallDistance } from '../arena';
import type { RunMods } from '../progression/mods';
import type { ConditionalResult } from '../progression/effects';
import { type FxQueue, ImpactProfile, BLOOD_CRIT_BIT } from '../fx';

/** Weapon family → its NON-EXPLOSIVE hit-FX profile (art doc: each family reads
 *  distinctly). The explosion (Blast) FX is NOT assigned here — it's added at fire
 *  time only when a shot actually detonates (blast > 0), so a heavy orbital slug
 *  with no AoE reads as a strong spark, not an explosion. */
function impactProfile(family: WeaponFamily): ImpactProfile {
  switch (family) {
    case 'sidearm':
    case 'drone':
    case 'orbital': // heavy single bolt — a strong spark unless it carries real AoE
    case 'explosive': // only shows Blast when it genuinely detonates (blast > 0)
      return ImpactProfile.Tick;
    case 'rotary':
      return ImpactProfile.Stitch;
    case 'energy':
      return ImpactProfile.Arc;
  }
}

/** Per-family projectile VISUAL style index (cosmetic; the render maps it to a
 *  shape/length/colour so each gun reads distinctly). Keep in sync with the render
 *  table in `render/projectile-view.ts`. */
export const FAMILY_STYLE: Record<WeaponFamily, number> = {
  sidearm: 0,
  rotary: 1,
  explosive: 2,
  drone: 3,
  energy: 4,
  orbital: 5,
};

const NO_COND: ConditionalResult = { damageMult: 1, critAdd: 0, fireRateMult: 1 };

export interface KillEvent {
  x: number;
  z: number;
  variant: number;
  /** Damage past 0 hp on the killing blow (T65 corpse/overkill builds). */
  overkill?: number;
  /** Enemy footprint radius at death (corpse visual + blast scale). */
  size?: number;
}

/** Called at hit time (before compaction) so the enemy index is still valid —
 *  on-hit triggers + status application hang off this (T38/T39). `procCoef` is the
 *  firing weapon's proc coefficient (T69, V32); `hitDamage` is the damage this hit
 *  dealt (T70, V33) so on-hit DoTs can scale as a fraction of the hit. */
export type OnHit = (enemy: number, crit: boolean, procCoef: number, hitDamage: number) => void;

// Chain lightning is a CROWD-SOFTENER, not a wave-deleter: each arc carries only
// this fraction of the hit BEFORE falloff compounds, so even a high-falloff capstone
// can't pass near-full damage down a whole pack (the instant-wipe complaint). The
// first arc ≈ hit × COEF × chainFalloff, weaker every hop after.
const CHAIN_DAMAGE_COEF = 0.4;
// Multishot total-damage exponent (<1 → diminishing returns). projectileCount^this
// is the total volley damage vs the 1-projectile baseline: 0.7 → ×2 proj ≈ 1.62×,
// ×4 ≈ 2.64×, ×6 ≈ 3.5×. Keeps multishot strong but ⊥ a strict ×N auto-win.
const MULTISHOT_FALLOFF = 0.7;
const RECOIL_CAP = 5.0; // max per-shot velocity kick (V10) — heavy guns kick, ⊥ launch
const RECOIL_SCALE = 6.5; // global recoil punch-up so kick is a real movement factor (toned down from 10 — minigun shove was uncontrollable)
const RICOCHET_HOLD = 0.05; // seconds a projectile parks at a bounce point
const PIERCE_GAP = 0.07; // after a pierce hit, ignore collisions this long (clear the body)

export class WeaponSystem {
  readonly projectiles = new ProjectilePool();
  readonly weapons: WeaponInstance[] = [];
  /** On-kill events this step (XP drops consume these at T17). */
  readonly kills: KillEvent[] = [];
  /** Damage applied to enemy health this step (T22 run stats, V20). */
  damageThisStep = 0;
  /** True if any weapon fired this step (drives the on-shot trigger, T55). */
  firedThisStep = false;
  /** True if any hit this step was a CRIT — drives the `recentCrit` build conditional
   *  (Batch 1), tracked independently of trigger registration. */
  critThisStep = false;
  private query: number[] = [];
  /** Reused scratch for hitscan-beam hits — packed (distance,enemyIndex) for a
   *  nearest-first sort without per-shot allocation (V5). */
  private beamHits: number[] = [];
  private chainQuery: number[] = []; // scratch for chain-lightning arc lookup
  private chainVisited: number[] = []; // enemies already hit this chain (no repeats)

  add(w: WeaponInstance): void {
    this.weapons.push(w);
  }

  /** Swap the player's primary weapon (T33 weapon drops). Replaces slot 0. */
  setPrimary(def: WeaponDefinition): void {
    this.weapons[0] = equip(def);
  }

  /** Current primary weapon id (HUD / drop-dedup). */
  get primaryId(): string | undefined {
    return this.weapons[0]?.def.id;
  }

  /** Reset to a fresh-run baseline in place (T22 restart, no reload). */
  reset(): void {
    this.weapons.length = 0;
    this.projectiles.count = 0;
    this.kills.length = 0;
    this.damageThisStep = 0;
  }

  step(
    player: Player,
    enemies: EnemyPool,
    hash: SpatialHash,
    mods: RunMods,
    rng: Rng,
    dt: number,
    fx: FxQueue,
    cond: ConditionalResult = NO_COND,
    onHit?: OnHit,
    firing = true, // primary-fire held / auto-fire on (default true for headless)
  ): void {
    this.kills.length = 0;
    this.damageThisStep = 0;
    this.firedThisStep = false;
    this.critThisStep = false;
    this.fire(player, enemies, mods, rng, dt, fx, cond, firing, onHit);
    this.advanceProjectiles(enemies, hash, mods, rng, dt, fx, onHit);
    compactDead(enemies, this.kills, fx);
  }

  private fire(
    player: Player,
    enemies: EnemyPool,
    mods: RunMods,
    rng: Rng,
    dt: number,
    fx: FxQueue,
    cond: ConditionalResult,
    firing: boolean,
    onHit?: OnHit,
  ): void {
    for (const w of this.weapons) {
      w.cooldownLeft -= dt;
      if (w.cooldownLeft > 0) continue;
      // Not firing → the gun is ready but holds (no spawn); clamp so it doesn't
      // bank negative cooldown and burst on release.
      if (!firing) {
        w.cooldownLeft = 0;
        continue;
      }

      const aim = resolveAim(w, player, enemies, mods.rangeMult);
      if (!aim) continue; // nothing to shoot at and no cursor aim

      // Fold in the transient fire-rate ramp (Kinetic Overdraft etc, T55).
      w.cooldownLeft = w.def.cooldown / Math.max(0.01, mods.fireRateMult * cond.fireRateMult);

      // Multishot DIMINISHING RETURNS (build-variety pass): extra projectiles from
      // the multishot mult used to each deal FULL damage → +projectile was a strict
      // ×N DPS button that beat every other build. Now total volley damage scales
      // SUB-linearly: each added projectile pays less. `count^MULTISHOT_FALLOFF`
      // total (e.g. ×2 proj = ~1.62× damage, ×4 = ~2.6×, ×6 = ~3.5×), so multishot
      // is a real direction with a cost, not the no-brainer. Applied to the per-shot
      // multiplier (not the weapon's innate pellets — a shotgun's spread stays full).
      const pc = Math.max(1, mods.projectileCount);
      const multishotFactor = pc > 1 ? Math.pow(pc, MULTISHOT_FALLOFF) / pc : 1;

      // Damage spec with run mods + dynamic conditionals folded in (T38), still
      // resolved through the pipeline (V3).
      const dmg: WeaponDamageSpec = {
        ...w.def.damage,
        multiplier: w.def.damage.multiplier * mods.damageMult * cond.damageMult * multishotFactor,
        critChance: Math.min(1, w.def.damage.critChance + mods.critChanceAdd + cond.critAdd),
        // Crit-damage amplifier (T35): scale the BONUS above 1× by critDamageMult.
        critMultiplier: 1 + (w.def.damage.critMultiplier - 1) * mods.critDamageMult,
      };

      const p = w.def.projectile;
      // Range is an authoritative reach attribute (progression, T33): the bullet
      // expires once it has flown the effective range, so `range` + rangeMult
      // actually limit how far you can shoot in aim mode (not just auto-target
      // acquisition). The def lifetime still caps it shorter for fast-fizzle
      // weapons (e.g. shotgun pellets). Hitscan/laser families can opt out later.
      const effRange = w.def.range * mods.rangeMult;
      const reachLifetime = effRange / Math.max(1e-3, p.speed);
      const life = Math.min(p.lifetime, reachLifetime);
      const muzzle = player.stats.collisionRadius + 0.3;
      const aimAngle = Math.atan2(aim.x, aim.z);
      // Total projectiles = the weapon's innate pellets × multishot stacks.
      const shots = Math.max(1, (w.def.pellets ?? 1) * mods.projectileCount);
      const arc = w.def.spreadArc ?? mods.spreadArc;
      const pierce = p.pierce + Math.max(0, Math.floor(mods.pierce)); // run-mod pierce
      const blast = Math.max(w.def.explosiveRadius ?? 0, mods.blastRadius);
      // Explosion impact FX ONLY when the shot actually detonates (blast > 0); a
      // non-AoE heavy bolt (e.g. orbital Phobos slug) reads as a spark, not a blast.
      const profile = blast > 0 ? ImpactProfile.Blast : impactProfile(w.def.family);
      // Proc strength rides the projectile (T69, V32); build mods can raise it (T70 status lane).
      const procCoef = Math.max(0, procCoefOf(w.def) + mods.procCoefBonus);
      // Fan multishot evenly across the arc; single shot gets random jitter.
      for (let s = 0; s < shots; s++) {
        const fan = shots > 1 ? (s / (shots - 1) - 0.5) * arc : 0;
        const jitter = shots > 1 ? 0 : (rng.next() - 0.5) * w.def.spread;
        const a = aimAngle + fan + jitter;
        const dx = Math.sin(a);
        const dz = Math.cos(a);
        if (w.def.hitscan) {
          // INSTANT beam: damage everything in the line, draw a laser (no projectile).
          this.fireBeam(
            player,
            enemies,
            rng,
            fx,
            dx,
            dz,
            effRange,
            w.def.hitscan.width,
            dmg,
            pierce,
            procCoef,
            mods,
            onHit,
          );
          continue;
        }
        this.projectiles.spawn(
          player.pos.x + dx * muzzle,
          player.pos.z + dz * muzzle,
          dx * p.speed,
          dz * p.speed,
          p.radius,
          life,
          pierce,
          dmg,
          blast,
          profile,
          Math.max(0, Math.floor(mods.ricochet)),
          procCoef,
          1, // inherit global on-hit mods (player shots always do)
          FAMILY_STYLE[w.def.family], // per-family projectile look (T37)
        );
      }

      // Muzzle FX once per shot at the muzzle, aimed along fire direction.
      fx.push('muzzle', player.pos.x + aim.x * muzzle, player.pos.z + aim.z * muzzle, aim.x, aim.z);

      player.facing = Math.atan2(-aim.x, -aim.z); // match player-view nose convention
      // Recoil kicks a SEPARATE impulse velocity (`recoilVel`), not the movement
      // velocity — otherwise a held WASD input lerps the kick away the same step
      // and recoil is invisible while moving. recoilVel decays on its own in
      // stepPlayer and is added to position on top of movement (still V10-capped).
      // More PROJECTILES = more recoil — each extra round/pellet adds to the kick
      // (and lifts the per-call cap with it), so multishot/spread builds turn recoil
      // into a real backward THRUST. This makes weapon knockback a core mobility/CC
      // mechanic that a whole upgrade path (recoil family) leans into.
      // More projectiles = more kick, but with a CEILING so a 10-pellet spray /
      // high-multishot build doesn't multiply the shove into orbit (the recoil
      // family + resistance cards are the intended way to push it further).
      const shotRecoil = Math.min(2.2, 1 + (shots - 1) * 0.25);
      player.recoilVel = applyRecoil(
        player.recoilVel,
        -aim.x,
        -aim.z,
        w.def.recoil * mods.recoilMult * RECOIL_SCALE * shotRecoil,
        player.stats.recoilResistance,
        dt,
        RECOIL_CAP * shotRecoil,
      );
      player.recoilTimer = 0.25; // "recoil is moving the player" window (T55)
      this.firedThisStep = true;
    }
  }

  /** Hitscan beam (T-laser): instantly damage every active enemy within `width` of
   *  the aim line out to `range` (capped by the wall), piercing up to `pierce+1`
   *  bodies nearest-first. Routes each hit through the SAME damage pipeline (V3),
   *  shield, blood/dmg FX, and on-hit triggers as a bullet — then draws the laser to
   *  the wall. No projectile is spawned. */
  private fireBeam(
    player: Player,
    enemies: EnemyPool,
    rng: Rng,
    fx: FxQueue,
    dx: number,
    dz: number,
    range: number,
    width: number,
    dmg: WeaponDamageSpec,
    pierce: number,
    procCoef: number,
    mods: RunMods,
    onHit?: OnHit,
  ): void {
    const ox = player.pos.x;
    const oz = player.pos.z;
    const maxDist = Math.min(range, wallDistance(ox, oz, dx, dz, range));
    // Gather every enemy the beam line passes through (projection within range,
    // perpendicular distance within the beam half-width + the body radius).
    this.beamHits.length = 0;
    for (let e = 0; e < enemies.count; e++) {
      if (enemies.health[e]! <= 0 || enemies.state[e] !== EnemyState.Active) continue;
      const ex = enemies.posX[e]! - ox;
      const ez = enemies.posZ[e]! - oz;
      const t = ex * dx + ez * dz;
      if (t < 0 || t > maxDist) continue;
      const perp2 = ex * ex + ez * ez - t * t;
      const w = width + enemies.radius[e]!;
      if (perp2 > w * w) continue;
      this.beamHits.push(e | (Math.round(t * 64) << 12)); // pack (t,e) → sort nearest-first
    }
    this.beamHits.sort((a, b) => a - b); // higher bits = t → ascending distance
    const max = Math.min(pierce + 1, this.beamHits.length);
    for (let h = 0; h < max; h++) {
      const e = this.beamHits[h]! & 0xfff;
      const packet = makePacket({
        weaponId: 'beam',
        baseDamage: dmg.base,
        additive: dmg.additive,
        multiplier: dmg.multiplier * corrodeAmp(enemies, e) * shockAmp(enemies, e),
        critChance: dmg.critChance,
        critMultiplier: dmg.critMultiplier,
      });
      const out = computeOutgoing(packet, rng);
      const mit = applyMitigation(out.amount, 0, 0);
      if (enemies.shield[e]! > 0) {
        enemies.shield[e] = enemies.shield[e]! - 1; // absorb the whole instance, pop
      } else {
        this.damageThisStep += Math.min(mit.toHealth, enemies.health[e]!);
        enemies.health[e]! -= mit.toHealth;
      }
      fx.push('impact', enemies.posX[e]!, enemies.posZ[e]!, dx, dz, ImpactProfile.Arc);
      emitBlood(fx, enemies, e, dx, dz, out.crit);
      fx.push('dmg', enemies.posX[e]!, enemies.posZ[e]!, mit.toHealth, 0, out.crit ? 1 : 0);
      if (out.crit) this.critThisStep = true;
      if (onHit) onHit(e, out.crit, procCoef, mit.toHealth);
      if (mods.knockback > 0) knockbackFrom(enemies, e, ox, oz, mods.knockback);
    }
    // The laser always reaches the wall — draw origin → wall point (absolute end).
    fx.push('laser', ox, oz, ox + dx * maxDist, oz + dz * maxDist);
  }

  private advanceProjectiles(
    enemies: EnemyPool,
    hash: SpatialHash,
    mods: RunMods,
    rng: Rng,
    dt: number,
    fx: FxQueue,
    onHit?: OnHit,
  ): void {
    const pr = this.projectiles;
    for (let i = pr.count - 1; i >= 0; i--) {
      // Bounce park (ricochet): the projectile dwells a few frames at the hit
      // point before launching at the next enemy, so the redirect reads as a
      // hit→hit sequence rather than a teleport. Frozen, no collision, still ages.
      if (pr.hold[i]! > 0) {
        pr.hold[i]! -= dt;
        pr.prevX[i] = pr.posX[i]!;
        pr.prevZ[i] = pr.posZ[i]!;
        pr.life[i]! -= dt;
        if (pr.life[i]! <= 0) pr.kill(i);
        continue;
      }
      pr.prevX[i] = pr.posX[i]!;
      pr.prevZ[i] = pr.posZ[i]!;
      pr.posX[i]! += pr.velX[i]! * dt;
      pr.posZ[i]! += pr.velZ[i]! * dt;
      pr.life[i]! -= dt;
      if (pr.hitCd[i]! > 0) pr.hitCd[i]! -= dt; // post-pierce body-clear window

      let dead = pr.life[i]! <= 0;

      // Skip collision while still clearing the last pierced body, so pierce
      // passes to the NEXT enemy instead of re-hitting the same one.
      if (!dead && pr.hitCd[i]! <= 0) {
        const r = pr.radius[i]!;
        // Set once a pierce hit lands this step → after the step we open a brief
        // body-clear window so the projectile can't re-hit the SAME body next step
        // (which is what ate pierce on enemy #1 instead of passing to #2).
        let pierced = false;
        const n = hash.queryCircle(pr.posX[i]!, pr.posZ[i]!, r + 1, this.query);
        for (let k = 0; k < n; k++) {
          const e = this.query[k]!;
          if (e >= enemies.count || enemies.health[e]! <= 0) continue;
          if (enemies.state[e] !== EnemyState.Active) continue; // telegraph = invulnerable
          const rr = r + enemies.radius[e]!;
          const ex = pr.posX[i]! - enemies.posX[e]!;
          const ez = pr.posZ[i]! - enemies.posZ[e]!;
          if (ex * ex + ez * ez > rr * rr) continue;

          // Centralized damage pipeline (V3). Corroded targets take more (armor
          // shred, T52) — folded into the multiplier so it stays pipeline-routed.
          const packet = makePacket({
            weaponId: 'projectile',
            baseDamage: pr.dmgBase[i]!,
            additive: pr.dmgAdd[i]!,
            multiplier: pr.dmgMult[i]! * corrodeAmp(enemies, e) * shockAmp(enemies, e),
            critChance: pr.critChance[i]!,
            critMultiplier: pr.critMult[i]!,
          });
          const out = computeOutgoing(packet, rng);
          const mit = applyMitigation(out.amount, 0, 0);
          // Absorb shield (T-beam): a live charge soaks this WHOLE damage instance
          // and pops — the hit still registers (triggers/fx fire) but deals no HP.
          if (enemies.shield[e]! > 0) {
            enemies.shield[e] = enemies.shield[e]! - 1;
          } else {
            // Count effective damage (clamp to remaining health, no overkill) for
            // run stats — must match what the sim actually removed (V20).
            this.damageThisStep += Math.min(mit.toHealth, enemies.health[e]!);
            enemies.health[e]! -= mit.toHealth;
          }
          // Drone (and other "dumb") bolts don't inherit the build's GLOBAL on-hit
          // mods — chain, knockback, on-hit status triggers all gate on `inherit`,
          // so a companion drone isn't secretly an explosive/chaining murder-bot
          // unless the Networked Munitions keystone flips it on.
          const inheritMods = pr.inherit[i] !== 0;
          // Concussive knockback: shove the enemy along the shot line (T42 CC).
          if (inheritMods && mods.knockback > 0) {
            knockbackFrom(enemies, e, pr.posX[i]!, pr.posZ[i]!, mods.knockback);
          }
          {
            const l = Math.hypot(pr.velX[i]!, pr.velZ[i]!) || 1;
            fx.push(
              'impact',
              pr.posX[i]!,
              pr.posZ[i]!,
              pr.velX[i]! / l,
              pr.velZ[i]! / l,
              pr.profile[i]!,
            );
          }
          // Blood spurt on biological hits, thrown along the projectile's travel
          // direction (art doc: matter exits away from the hit face). Crit → violent.
          emitBlood(fx, enemies, e, pr.velX[i]!, pr.velZ[i]!, out.crit);
          // Floating damage number at the enemy (amount in dx, crit flag in variant).
          fx.push('dmg', enemies.posX[e]!, enemies.posZ[e]!, mit.toHealth, 0, out.crit ? 1 : 0);
          if (out.crit) this.critThisStep = true;
          // On-hit hook (before compaction → index valid): triggers + status (T38/T39).
          // Proc coefficient rides the projectile → scales on-hit effects (T69, V32);
          // the hit's damage (T70, V33) lets on-hit DoTs scale as a fraction of it.
          if (onHit && inheritMods) onHit(e, out.crit, pr.procCoef[i]!, mit.toHealth);

          // Chain lightning: arc reduced damage to nearby enemies (Arc Garnishment).
          if (inheritMods && mods.chainCount > 0) {
            this.chainLightning(enemies, hash, e, pr, i, mods, rng, fx);
          }

          // Explosive payload: detonate AoE on impact (V3-routed), then die —
          // overrides pierce. The direct-hit enemy is excluded (already damaged).
          if (pr.blast[i]! > 0) {
            const blastDealt = applyAreaDamage(
              enemies,
              hash,
              pr.posX[i]!,
              pr.posZ[i]!,
              pr.blast[i]!,
              {
                // Splash carries only a FRACTION of weapon damage by default
                // (mods.blastDamageMult starts low); explosive upgrades scale it up.
                amount: pr.dmgBase[i]! * pr.dmgMult[i]! * mods.blastDamageMult,
                critChance: pr.critChance[i]!,
                critMultiplier: pr.critMult[i]!,
                damageType: 'explosive',
                exclude: e,
                fx, // per-enemy splash numbers (replaces the old aggregate)
              },
              rng,
            );
            this.damageThisStep += blastDealt;
            fx.push('impact', pr.posX[i]!, pr.posZ[i]!, 0, 0, ImpactProfile.Blast);
            dead = true;
            break;
          }

          if (pr.pierce[i]! > 0) {
            pr.pierce[i]!--;
            pierced = true; // body-clear window opened after this step's hits
            continue; // keep hitting OTHER overlapping enemies in the SAME pass
          }
          // Out of pierce: ricochet to a fresh enemy if able, else die. The
          // redirected projectile is a VISIBLE bounce (own travel), unlike the
          // instant chain arc.
          if (pr.bounces[i]! > 0 && this.ricochetTo(enemies, hash, e, pr, i, mods, fx)) {
            dead = false;
            break;
          }
          dead = true;
          break;
        }
        // Survived the pass with pierce to spare → hold off re-hitting this body.
        if (!dead && pierced) pr.hitCd[i] = PIERCE_GAP;
      }

      if (dead) pr.kill(i);
    }
  }

  /**
   * Redirect a projectile toward the nearest fresh enemy within `ricochetRange`
   * (a real bounce — the projectile keeps flying, distinct from the instant chain
   * arc). Preserves speed, weakens the hit a touch per bounce, and parks the
   * projectile briefly so the redirect reads as a sequence. Returns false (→ die)
   * when no target is in range. Deterministic: nearest-by-distance, no rng.
   */
  private ricochetTo(
    enemies: EnemyPool,
    hash: SpatialHash,
    fromE: number,
    pr: ProjectilePool,
    i: number,
    mods: RunMods,
    fx: FxQueue,
  ): boolean {
    const ox = pr.posX[i]!;
    const oz = pr.posZ[i]!;
    const n = hash.queryCircle(ox, oz, mods.ricochetRange, this.chainQuery);
    let bestE = -1;
    let bestD2 = mods.ricochetRange * mods.ricochetRange;
    for (let k = 0; k < n; k++) {
      const e = this.chainQuery[k]!;
      if (e === fromE || e >= enemies.count) continue;
      if (enemies.health[e]! <= 0 || enemies.state[e] !== EnemyState.Active) continue;
      const dx = enemies.posX[e]! - ox;
      const dz = enemies.posZ[e]! - oz;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestE = e;
      }
    }
    if (bestE < 0) return false;

    const speed = Math.hypot(pr.velX[i]!, pr.velZ[i]!) || 1;
    const dx = enemies.posX[bestE]! - ox;
    const dz = enemies.posZ[bestE]! - oz;
    const l = Math.hypot(dx, dz) || 1;
    pr.velX[i] = (dx / l) * speed;
    pr.velZ[i] = (dz / l) * speed;
    // Step the projectile clear of the enemy it just hit (along the new heading)
    // so it doesn't immediately re-collide with the source and waste the bounce.
    const clear = enemies.radius[fromE]! + pr.radius[i]! + 0.1;
    pr.posX[i]! += (dx / l) * clear;
    pr.posZ[i]! += (dz / l) * clear;
    pr.dmgMult[i]! *= mods.ricochetRetain; // each bounce weaker (starts low; upgrades raise it)
    pr.bounces[i]!--;
    pr.hold[i] = RICOCHET_HOLD; // brief dwell → reads as a hit→hit sequence
    fx.push('muzzle', ox, oz, dx / l, dz / l); // small pop at the bounce point
    return true;
  }

  /**
   * Chain lightning: a TRAVELLING arc that hops struck-enemy → nearest unhit
   * neighbour → next, up to `mods.chainCount` jumps, each within `mods.chainRange`
   * of the PREVIOUS hop (a real chain, not a star from the origin) and weaker by
   * `mods.chainFalloff`. Emits a bolt per segment so it reads as lightning leaping
   * body to body. Pipeline-routed (V3), deterministic (nearest-by-distance, V16).
   */
  private chainLightning(
    enemies: EnemyPool,
    hash: SpatialHash,
    fromE: number,
    pr: ProjectilePool,
    i: number,
    mods: RunMods,
    rng: Rng,
    fx: FxQueue,
  ): void {
    let curX = enemies.posX[fromE]!;
    let curZ = enemies.posZ[fromE]!;
    let mult = pr.dmgMult[i]! * CHAIN_DAMAGE_COEF * mods.chainFalloff;
    const visited = this.chainVisited;
    visited.length = 0;
    visited.push(fromE);

    for (let hop = 0; hop < mods.chainCount; hop++) {
      const n = hash.queryCircle(curX, curZ, mods.chainRange, this.chainQuery);
      let best = -1;
      let bestD2 = mods.chainRange * mods.chainRange;
      for (let k = 0; k < n; k++) {
        const e = this.chainQuery[k]!;
        if (e >= enemies.count || enemies.health[e]! <= 0) continue;
        if (enemies.state[e] !== EnemyState.Active) continue;
        if (visited.includes(e)) continue;
        const dx = enemies.posX[e]! - curX;
        const dz = enemies.posZ[e]! - curZ;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = e;
        }
      }
      if (best < 0) break; // chain dies out when no neighbour is in hop range

      const packet = makePacket({
        weaponId: 'chain',
        baseDamage: pr.dmgBase[i]!,
        additive: pr.dmgAdd[i]!,
        multiplier: mult,
        critChance: pr.critChance[i]!,
        critMultiplier: pr.critMult[i]!,
      });
      const out = computeOutgoing(packet, rng);
      const mit = applyMitigation(out.amount, 0, 0);
      if (out.crit) this.critThisStep = true;
      this.damageThisStep += Math.min(mit.toHealth, enemies.health[best]!);
      enemies.health[best]! -= mit.toHealth;
      const bx = enemies.posX[best]!;
      const bz = enemies.posZ[best]!;
      fx.push('impact', bx, bz, 0, 0, ImpactProfile.Arc);
      emitBlood(fx, enemies, best, bx - curX, bz - curZ);
      fx.push('dmg', bx, bz, mit.toHealth, 0, out.crit ? 1 : 0);
      // Bolt for THIS segment: previous hop → this enemy (from x,z; to dx,dz).
      fx.push('chain', curX, curZ, bx, bz);
      visited.push(best);
      curX = bx;
      curZ = bz;
      mult *= mods.chainFalloff;
    }
  }
}

/** Push a blood-spray FX for a biological enemy hit. `hx,hz` = incoming travel
 *  direction (un-normalized ok); the render layer throws spurts that way and
 *  drops a directional floor decal. Mechanical enemies (no `gore`) spray nothing
 *  — their death dust covers it. Carries the enemy variant for blood vs ichor. */
function emitBlood(
  fx: FxQueue,
  enemies: EnemyPool,
  e: number,
  hx: number,
  hz: number,
  crit = false,
): void {
  const v = enemies.variant[e]!;
  if (!ENEMY_BY_VARIANT[v]?.gore) return;
  const l = Math.hypot(hx, hz) || 1;
  const ux = hx / l;
  const uz = hz / l;
  // Emit from the body SURFACE on the exit side (center + dir*radius), not the
  // center — on big units a center spawn buries the spray inside the mesh where
  // it gets occluded ("swallowed"). Push it just past the surface so it clears.
  const r = enemies.radius[e]! * 0.9;
  const variant = crit ? v | BLOOD_CRIT_BIT : v;
  fx.push('blood', enemies.posX[e]! + ux * r, enemies.posZ[e]! + uz * r, ux, uz, variant);
}

/** Returns a unit aim direction (x,z) for the weapon, or null if no target.
 *  Exported for target-selection unit tests (T30, V19). */
export function resolveAim(
  w: WeaponInstance,
  player: Player,
  enemies: EnemyPool,
  rangeMult = 1,
): { x: number; z: number } | null {
  const rule = w.def.targeting;
  const range = w.def.range * rangeMult; // effective range (progression attribute)

  // Mouse-directed: fire toward the ground cursor; soft-snap to the enemy
  // nearest the cursor when one is in range, else straight at the cursor.
  if (rule === 'aim' || rule === 'nearest-to-aim') {
    if (player.aim.has) {
      const ax = player.aim.x - player.pos.x;
      const az = player.aim.z - player.pos.z;
      if (rule === 'nearest-to-aim') {
        const snap = nearestToPoint(player, enemies, player.aim.x, player.aim.z, range);
        if (snap) return snap;
      }
      const l = Math.hypot(ax, az);
      if (l > 1e-6) return { x: ax / l, z: az / l };
    }
    // Fall back to nearest enemy when there's no cursor (e.g. keyboard-only).
    return nearestToPoint(player, enemies, player.pos.x, player.pos.z, range);
  }

  if (rule === 'lowest-health') return lowestHealth(player, enemies, range);
  return nearestToPoint(player, enemies, player.pos.x, player.pos.z, range);
}

function nearestToPoint(
  player: Player,
  enemies: EnemyPool,
  qx: number,
  qz: number,
  range: number,
): { x: number; z: number } | null {
  let best = -1;
  let bestD = range * range;
  for (let e = 0; e < enemies.count; e++) {
    if (enemies.state[e] !== EnemyState.Active) continue;
    // In-range from the player, ranked by distance to the query point.
    const px = enemies.posX[e]! - player.pos.x;
    const pz = enemies.posZ[e]! - player.pos.z;
    if (px * px + pz * pz > range * range) continue;
    const dx = enemies.posX[e]! - qx;
    const dz = enemies.posZ[e]! - qz;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return aimAt(player, enemies, best);
}

function lowestHealth(
  player: Player,
  enemies: EnemyPool,
  range: number,
): { x: number; z: number } | null {
  let best = -1;
  let bestHp = Infinity;
  for (let e = 0; e < enemies.count; e++) {
    if (enemies.state[e] !== EnemyState.Active) continue;
    const px = enemies.posX[e]! - player.pos.x;
    const pz = enemies.posZ[e]! - player.pos.z;
    if (px * px + pz * pz > range * range) continue;
    if (enemies.health[e]! < bestHp) {
      bestHp = enemies.health[e]!;
      best = e;
    }
  }
  return aimAt(player, enemies, best);
}

function aimAt(player: Player, enemies: EnemyPool, e: number): { x: number; z: number } | null {
  if (e < 0) return null;
  const dx = enemies.posX[e]! - player.pos.x;
  const dz = enemies.posZ[e]! - player.pos.z;
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) return { x: 1, z: 0 };
  return { x: dx / l, z: dz / l };
}

/** Swap-remove all dead enemies, emitting on-kill events (V5 pooling) + death FX. */
function compactDead(enemies: EnemyPool, kills: KillEvent[], fx: FxQueue): void {
  for (let i = enemies.count - 1; i >= 0; i--) {
    if (enemies.health[i]! <= 0) {
      const x = enemies.posX[i]!;
      const z = enemies.posZ[i]!;
      const variant = enemies.variant[i]!;
      // health is now ≤ 0 — its magnitude IS the overkill (T65). Radius = body size.
      kills.push({
        x,
        z,
        variant,
        overkill: Math.max(0, -enemies.health[i]!),
        size: enemies.radius[i]!,
      });
      // Carry the body radius in the dx slot so the render scales the death poof to
      // the enemy — a small mite gets a tiny puff, not a swarm-wide flash (T37).
      fx.push('death', x, z, enemies.radius[i]!, 0, variant);
      // Boss death (T77/V38): a massively scaled blood eruption that splatters the
      // ground, on top of the death poof. Render reads dx = boss radius for scale.
      if (ENEMY_BY_VARIANT[variant]?.boss)
        fx.push('bloodburst', x, z, enemies.radius[i]!, 0, variant);
      enemies.kill(i);
    }
  }
}
