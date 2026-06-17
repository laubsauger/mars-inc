// Enemy archetype pool (T9/T11). Data-oriented struct-of-arrays, fixed capacity,
// swap-remove — no per-frame allocation, no GC churn under crowd load (V5/V6).
// Full generic ECS deferred: archetype pools are the right shape for instanced
// crowds (execution rule 7 — concrete until a third archetype demands it).

import type { Vec2 } from './movement';
import type { Rng } from '../core/rng';

export const enum EnemyState {
  Telegraph = 0, // spawning at a gate, not yet a threat (V9)
  Active = 1,
}

/** How an enemy entered the arena — drives the spawn visual (T33+). Gate units
 *  walk in through a portal; teleport units MATERIALIZE at an interior point. */
export const enum SpawnKind {
  Gate = 0,
  Teleport = 1,
}

/**
 * Ranged-attack profile (T33). Absent = melee/contact only (default). The enemy
 * attack system reads this per enemy via its variant. Extensible by `kind` so
 * future enemy guns (`gun`) drop in beside the lobbed grenade (`lob`) without a
 * rewrite — see [[ranged-enemy-framework]].
 */
export type EnemyAttack =
  | {
      kind: 'lob'; // arc a grenade/molotov to the player's ground point; cooks off
      range: number; // max distance to start an attack
      cooldown: number; // seconds between attacks
      windup: number; // telegraph before release (enemy braces)
      speed: number; // projectile ground speed
      fuse: number; // ground cook-off time once landed (telegraph ring)
      blastRadius: number;
      damage: number;
      freeze?: boolean; // arms a FROST zone (chills the player) instead of a blast
    }
  | {
      kind: 'gun'; // straight fast projectile(s)
      range: number;
      cooldown: number;
      speed: number;
      damage: number;
      spread: number;
      burst?: number; // pellets per volley (default 1 = single aimed round)
    }
  | {
      kind: 'beam'; // charge → telegraph a thickening line → fire a hitscan laser to the wall
      range: number; // engage distance to begin charging
      cooldown: number; // seconds between beams (long — it's a heavy attack)
      charge: number; // telegraph window: aim LOCKS, the line thickens, you dodge off it
      width: number; // beam half-width that hits the player on fire
      damage: number;
      beamLife: number; // seconds the fired beam stays lethal + visible
    };

export interface EnemyType {
  id: string;
  radius: number;
  maxHealth: number;
  speed: number;
  separationWeight: number;
  /** Render variant index for instancing/color. */
  variant: number;
  /** Optional ranged attack; absent = melee/contact only. */
  attack?: EnemyAttack;
  /** Contact (melee) damage on touch; defaults to DEFAULT_CONTACT_DAMAGE. */
  contactDamage?: number;
  /** On death, split into `count` enemies of this variant (T33 blob). */
  splitInto?: { variant: number; count: number };
  /** What a hit/kill sprays (art doc "Commercial Blood Sport"). `blood` = red
   *  humanoid spurts, `ichor` = green ooze. Absent = mechanical (scrap, no
   *  blood — the death dust poof already covers it). Render reads this (V2). */
  gore?: 'blood' | 'ichor';
  /** Engagement radius (world units). When set, the enemy ROAMS (slow wander) and
   *  only locks on + chases once the player comes within this range — a lurker that
   *  ambushes, breaking up the homogeneous everyone-chases swarm. Absent/0 = always
   *  aggressive (the default fodder behaviour). */
  aggroRange?: number;
  /** Preferred standoff distance (world units) for a RANGED unit: it holds/trails
   *  the player at this range instead of closing to melee, so it keeps repositioning
   *  as you move rather than parking on top of you. Absent/0 = melee hold ring. */
  standoff?: number;
  /** Threat cost the wave director spends to field one (§8.3). */
  threat: number;
  /** Damage-absorb charges (T-beam): each blocks ONE incoming damage instance
   *  (a flat shield that pops on the first hit). Absent/0 = no shield. */
  shield?: number;
}

/** Touch damage when an enemy reaches the player, unless its type overrides it. */
export const DEFAULT_CONTACT_DAMAGE = 6;

export const MAX_ENEMIES = 2000;

export class EnemyPool {
  readonly capacity: number;
  count = 0;

  // Components (SoA). Index < count = live.
  readonly posX: Float32Array;
  readonly posZ: Float32Array;
  readonly prevX: Float32Array;
  readonly prevZ: Float32Array;
  readonly velX: Float32Array;
  readonly velZ: Float32Array;
  readonly health: Float32Array;
  /** Per-instance max health (T44): spawn-time difficulty scaling makes this
   *  diverge from the type base, so the health bar reads the right fraction. */
  readonly maxHp: Float32Array;
  readonly radius: Float32Array;
  readonly speed: Float32Array;
  readonly sepWeight: Float32Array;
  readonly variant: Uint8Array;
  readonly state: Uint8Array;
  /** SpawnKind: 0 = gate walk-in, 1 = teleport materialize (drives spawn FX). */
  readonly spawnKind: Uint8Array;
  readonly stateTimer: Float32Array;
  /** Per-enemy steering phase so updates stagger across ticks (low-freq). */
  readonly steerPhase: Uint8Array;
  /** Ranged-attack cooldown remaining (s); 0 = ready (T33). */
  readonly attackCd: Float32Array;
  /** Per-enemy contact (melee) damage (T33). */
  readonly contactDmg: Float32Array;
  /** Engagement radius (world u); 0 = always aggressive. >0 → roams until the
   *  player is within this, then chases (lurker/ambush behaviour). */
  readonly aggroRange: Float32Array;
  // Status effects (T39): per-enemy remaining-time + potency. 0 time = inactive.
  readonly burnTime: Float32Array; // burn DoT remaining (s)
  readonly burnDps: Float32Array; // burn damage per second
  readonly chillTime: Float32Array; // slow remaining (s)
  readonly chillMult: Float32Array; // movement multiplier (1 = none, <1 = slowed)
  readonly markTime: Float32Array; // mark remaining (s)
  readonly markMult: Float32Array; // status-damage amplifier (1 = none, >1 = amplified)
  // Stacking statuses (T52): count + duration. Shock = chain/reaction primer (no
  // standalone effect; consumed by reactions T53). Corrode = armor-shred proxy
  // (amplifies incoming damage). Bleed = stacking DoT.
  readonly shockTime: Float32Array;
  readonly shockStacks: Float32Array;
  readonly corrodeTime: Float32Array;
  readonly corrodeStacks: Float32Array;
  readonly bleedTime: Float32Array;
  readonly bleedStacks: Float32Array;
  readonly bleedDps: Float32Array; // per-stack bleed damage/second
  readonly hitFlash: Float32Array; // cosmetic: 1 on hit, decays → red shimmer (view)
  readonly kbX: Float32Array; // knockback velocity (decays); added on top of steering
  readonly kbZ: Float32Array;
  /** Damage-absorb charges left (T-beam): >0 blocks the next damage instance. */
  readonly shield: Uint8Array;
  /** Elite (T-elite): a promoted, beefier+shielded variant. Drives the view's
   *  "this is a different unit" indicator. 0 = normal. */
  readonly elite: Uint8Array;
  /** Promotion decided this spawn? (so elite/baseline-shield rolls happen once). */
  readonly evaluated: Uint8Array;
  /** Seconds of velocity-ease left after going Active — blends the straight gate
   *  march into steering so the walk-in handoff doesn't snap (T-roam/entry). */
  readonly entryEase: Float32Array;

  constructor(capacity: number = MAX_ENEMIES) {
    this.capacity = capacity;
    this.posX = new Float32Array(capacity);
    this.posZ = new Float32Array(capacity);
    this.prevX = new Float32Array(capacity);
    this.prevZ = new Float32Array(capacity);
    this.velX = new Float32Array(capacity);
    this.velZ = new Float32Array(capacity);
    this.health = new Float32Array(capacity);
    this.maxHp = new Float32Array(capacity);
    this.radius = new Float32Array(capacity);
    this.speed = new Float32Array(capacity);
    this.sepWeight = new Float32Array(capacity);
    this.variant = new Uint8Array(capacity);
    this.state = new Uint8Array(capacity);
    this.spawnKind = new Uint8Array(capacity);
    this.stateTimer = new Float32Array(capacity);
    this.steerPhase = new Uint8Array(capacity);
    this.attackCd = new Float32Array(capacity);
    this.burnTime = new Float32Array(capacity);
    this.burnDps = new Float32Array(capacity);
    this.chillTime = new Float32Array(capacity);
    this.chillMult = new Float32Array(capacity);
    this.markTime = new Float32Array(capacity);
    this.markMult = new Float32Array(capacity);
    this.shockTime = new Float32Array(capacity);
    this.shockStacks = new Float32Array(capacity);
    this.corrodeTime = new Float32Array(capacity);
    this.corrodeStacks = new Float32Array(capacity);
    this.bleedTime = new Float32Array(capacity);
    this.bleedStacks = new Float32Array(capacity);
    this.bleedDps = new Float32Array(capacity);
    this.hitFlash = new Float32Array(capacity);
    this.kbX = new Float32Array(capacity);
    this.kbZ = new Float32Array(capacity);
    this.contactDmg = new Float32Array(capacity);
    this.aggroRange = new Float32Array(capacity);
    this.shield = new Uint8Array(capacity);
    this.elite = new Uint8Array(capacity);
    this.evaluated = new Uint8Array(capacity);
    this.entryEase = new Float32Array(capacity);
  }

  /** Spawn an enemy in Telegraph state. Returns index, or -1 if full. */
  spawn(
    type: EnemyType,
    x: number,
    z: number,
    telegraph: number,
    phase: number,
    hpScale = 1,
    spawnKind: number = SpawnKind.Gate,
  ): number {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.posX[i] = x;
    this.posZ[i] = z;
    this.prevX[i] = x;
    this.prevZ[i] = z;
    this.velX[i] = 0;
    this.velZ[i] = 0;
    this.health[i] = type.maxHealth * hpScale; // difficulty scaling (T44)
    this.maxHp[i] = this.health[i]!;
    this.radius[i] = type.radius;
    this.speed[i] = type.speed;
    this.sepWeight[i] = type.separationWeight;
    this.variant[i] = type.variant;
    this.state[i] = EnemyState.Telegraph;
    this.spawnKind[i] = spawnKind;
    this.stateTimer[i] = telegraph;
    this.steerPhase[i] = phase & 0xff;
    // First-shot delay for the beam turret (sentinel): hold fire ~0.7 cooldown after
    // spawning so it walks out of the gate + repositions before its first laser,
    // instead of charging the instant it appears.
    this.attackCd[i] = type.attack?.kind === 'beam' ? type.attack.cooldown * 0.7 : 0;
    // Contact damage also scales with difficulty (dampened ~sqrt of HP scale) so
    // late-game / Act-2 hosts actually THREATEN, not just soak hits (T44/T-Act).
    this.contactDmg[i] =
      (type.contactDamage ?? DEFAULT_CONTACT_DAMAGE) * (1 + (hpScale - 1) * 0.55);
    this.aggroRange[i] = type.aggroRange ?? 0;
    this.burnTime[i] = 0;
    this.burnDps[i] = 0;
    this.chillTime[i] = 0;
    this.chillMult[i] = 1;
    this.markTime[i] = 0;
    this.markMult[i] = 1;
    this.shockTime[i] = 0;
    this.shockStacks[i] = 0;
    this.corrodeTime[i] = 0;
    this.corrodeStacks[i] = 0;
    this.bleedTime[i] = 0;
    this.bleedStacks[i] = 0;
    this.bleedDps[i] = 0;
    this.hitFlash[i] = 0;
    this.kbX[i] = 0;
    this.kbZ[i] = 0;
    this.shield[i] = type.shield ?? 0;
    this.elite[i] = 0;
    this.evaluated[i] = 0;
    this.entryEase[i] = 0;
    return i;
  }

  /** Promote a freshly-spawned enemy into an ELITE (T-elite): beefier, hits harder,
   *  visibly bigger + shielded. The view reads `elite` to flag it as a step-up unit. */
  promote(i: number, hpMult: number, contactMult: number, shield: number): void {
    this.elite[i] = 1;
    this.maxHp[i] = this.maxHp[i]! * hpMult;
    this.health[i] = this.maxHp[i]!; // full HP at promotion
    this.contactDmg[i] = this.contactDmg[i]! * contactMult;
    this.radius[i] = this.radius[i]! * 1.25; // bigger silhouette = the read
    this.shield[i] = shield;
  }

  /** Swap-remove: move the last live enemy into slot i. */
  kill(i: number): void {
    const last = --this.count;
    if (i !== last) {
      this.posX[i] = this.posX[last]!;
      this.posZ[i] = this.posZ[last]!;
      this.prevX[i] = this.prevX[last]!;
      this.prevZ[i] = this.prevZ[last]!;
      this.velX[i] = this.velX[last]!;
      this.velZ[i] = this.velZ[last]!;
      this.health[i] = this.health[last]!;
      this.maxHp[i] = this.maxHp[last]!;
      this.radius[i] = this.radius[last]!;
      this.speed[i] = this.speed[last]!;
      this.sepWeight[i] = this.sepWeight[last]!;
      this.variant[i] = this.variant[last]!;
      this.state[i] = this.state[last]!;
      this.spawnKind[i] = this.spawnKind[last]!;
      this.stateTimer[i] = this.stateTimer[last]!;
      this.steerPhase[i] = this.steerPhase[last]!;
      this.attackCd[i] = this.attackCd[last]!;
      this.contactDmg[i] = this.contactDmg[last]!;
      this.aggroRange[i] = this.aggroRange[last]!;
      this.burnTime[i] = this.burnTime[last]!;
      this.burnDps[i] = this.burnDps[last]!;
      this.chillTime[i] = this.chillTime[last]!;
      this.chillMult[i] = this.chillMult[last]!;
      this.markTime[i] = this.markTime[last]!;
      this.markMult[i] = this.markMult[last]!;
      this.shockTime[i] = this.shockTime[last]!;
      this.shockStacks[i] = this.shockStacks[last]!;
      this.corrodeTime[i] = this.corrodeTime[last]!;
      this.corrodeStacks[i] = this.corrodeStacks[last]!;
      this.bleedTime[i] = this.bleedTime[last]!;
      this.bleedStacks[i] = this.bleedStacks[last]!;
      this.bleedDps[i] = this.bleedDps[last]!;
      this.hitFlash[i] = this.hitFlash[last]!;
      this.kbX[i] = this.kbX[last]!;
      this.kbZ[i] = this.kbZ[last]!;
      this.shield[i] = this.shield[last]!;
      this.elite[i] = this.elite[last]!;
      this.evaluated[i] = this.evaluated[last]!;
      this.entryEase[i] = this.entryEase[last]!;
    }
  }

  damage(i: number, amount: number): boolean {
    this.health[i]! -= amount;
    this.hitFlash[i] = 1; // cosmetic flash; decayed each step, tinted by the view
    return this.health[i]! <= 0;
  }

  /** Decay the cosmetic hit-flash toward 0 (called once per sim step). */
  decayHitFlash(dt: number): void {
    const k = dt * 8; // ~0.12s flash
    for (let i = 0; i < this.count; i++) {
      const v = this.hitFlash[i]! - k;
      this.hitFlash[i] = v > 0 ? v : 0;
    }
  }
}

// In-world naming per docs/art-direction.md humor rules.
export const RUST_MITE: EnemyType = {
  id: 'rust-mite',
  radius: 0.8,
  maxHealth: 6,
  speed: 2.4, // tier-1 fodder: a slow shamble, clear kiting headroom early (player base 8)
  separationWeight: 1.0,
  variant: 0,
  threat: 1,
  gore: 'blood', // tier-1 fodder still bleeds (scaled small by its radius, see blood-view)
};

export const DEBT_HOUND: EnemyType = {
  id: 'debt-hound',
  radius: 0.82,
  maxHealth: 14,
  speed: 4.6, // the fast mover: real pressure (~0.65× player) but leaves kiting room
  separationWeight: 1.2,
  variant: 1,
  threat: 4,
  gore: 'blood',
};

// Gatekeeper of Phobos — slice boss (T33 down-payment, art/mechanics → T33/T37).
// Big, slow, high-HP damage sponge that shares the instanced crowd pool (V6):
// one mesh, per-instance color (eliteMagenta) + radius scale. Placeholder until
// the full boss kit lands.
export const BOSS_GATEKEEPER: EnemyType = {
  id: 'gatekeeper-of-phobos',
  radius: 2.4,
  maxHealth: 1500,
  speed: 2.4,
  separationWeight: 0.3,
  variant: 2,
  threat: 250,
  contactDamage: 22, // body-checks hurt — don't stand in the Gatekeeper
};

// Severance Lobber — first ranged class (T33). Hangs back (slow) and lobs a
// liability writ that cooks off on the ground, telegraphing its blast radius
// before it goes off. The general ranged framework also carries the future
// `gun` kind — see [[ranged-enemy-framework]].
export const SEVERANCE_LOBBER: EnemyType = {
  id: 'severance-lobber',
  radius: 0.74,
  maxHealth: 20,
  speed: 2.8,
  separationWeight: 0.9,
  variant: 3,
  gore: 'blood',
  threat: 6,
  attack: {
    kind: 'lob',
    range: 18,
    cooldown: 4.2,
    windup: 0.45,
    speed: 14,
    fuse: 1.0,
    blastRadius: 3.4,
    damage: 18,
  },
};

// Repossession Marshal — first gun enemy (T33). Fires straight rounds from range
// on a tight cooldown; lower per-hit damage than the lob but relentless, forcing
// the player to break line of sight / keep moving. Exercises the `gun` path of
// the ranged framework — see [[ranged-enemy-framework]].
export const REPO_MARSHAL: EnemyType = {
  id: 'repo-marshal',
  radius: 0.74,
  maxHealth: 16,
  speed: 2.8,
  separationWeight: 0.9,
  variant: 4,
  gore: 'blood',
  threat: 8,
  attack: {
    kind: 'gun',
    range: 17, // must close in — no cross-arena sniping
    cooldown: 2.8, // slower, readable cadence
    speed: 20, // slower rounds → dodgeable
    damage: 8,
    spread: 0.12,
  },
};

// Foreclosure Mortar — long-range artillery zoner (T33). Slow and fragile-ish but
// lobs a heavy, wide, slow-fusing shell from across the arena: it denies space
// rather than chasing. Forces movement even when nothing is close.
export const FORECLOSURE_MORTAR: EnemyType = {
  id: 'foreclosure-mortar',
  radius: 0.8,
  maxHealth: 28,
  speed: 2.0,
  separationWeight: 0.8,
  variant: 5,
  threat: 12,
  attack: {
    kind: 'lob',
    range: 26,
    cooldown: 6.5,
    windup: 0.6,
    speed: 10,
    fuse: 1.4,
    blastRadius: 5.0,
    damage: 26,
  },
};

// Riot Shotgunner — close-range burst (T33). Fires a shotgun spray of pellets;
// brutal up close, harmless at distance — the counter is to keep it at range.
export const RIOT_SHOTGUNNER: EnemyType = {
  id: 'riot-shotgunner',
  radius: 0.74,
  maxHealth: 18,
  speed: 3.6,
  separationWeight: 0.9,
  variant: 6,
  gore: 'blood',
  threat: 9,
  attack: {
    kind: 'gun',
    range: 11,
    cooldown: 3.4,
    speed: 20,
    damage: 5,
    spread: 0.5,
    burst: 5,
  },
};

// Audit Brute — slow melee wall (T33). High HP, big body, and a punishing touch:
// it can't be ignored or bodyblocked casually. The melee counterweight to the
// ranged classes; rewards kiting and burst damage. LURKER (T-roam): it patrols
// until you wander within 15u, then commits to the charge — a brute can be left
// alone if you keep your distance, but ambushes once you close.
export const AUDIT_BRUTE: EnemyType = {
  id: 'audit-brute',
  radius: 1.1,
  maxHealth: 90,
  speed: 2.6,
  separationWeight: 0.5,
  variant: 7,
  gore: 'blood',
  threat: 16,
  contactDamage: 16,
  aggroRange: 15,
};

// Liability Blob — splitter (T33). On death it doesn't just die: it ruptures
// into two smaller Bloblings (variant 10) that scatter and keep coming. Kills
// multiply your threat unless you can clear the spawn quickly — rewards AoE.
export const LIABILITY_BLOB: EnemyType = {
  id: 'liability-blob',
  radius: 1.0,
  maxHealth: 36,
  speed: 2.6,
  separationWeight: 0.7,
  variant: 9,
  gore: 'ichor',
  threat: 7,
  splitInto: { variant: 10, count: 2 },
};

// Blobling — the split product (T33). Small, quick, fragile, and does NOT split
// again (terminal), so the chain ends after one rupture.
export const BLOBLING: EnemyType = {
  id: 'blobling',
  radius: 0.62,
  maxHealth: 9,
  speed: 3.8, // split product: quick, but under the runner so it doesn't out-pace kiting
  separationWeight: 0.9,
  variant: 10,
  gore: 'ichor',
  threat: 2,
};

// Phase Stalker — teleport ambusher (T33+). Ignores the gates entirely: it
// MATERIALIZES at an interior point near the player after a brief telegraph
// (V9 — dodgeable), then rushes in fast. The threat is positional — it can
// appear behind your kite line, so you can't just watch the gates.
export const PHASE_STALKER: EnemyType = {
  id: 'phase-stalker',
  radius: 0.72,
  maxHealth: 24,
  speed: 6.2, // blinks in, then sprints — pressure unit
  separationWeight: 0.9,
  variant: 11,
  gore: 'blood',
  threat: 9,
  contactDamage: 12,
};

/** Display names by variant — for HUD intros / readouts (T33). */
export const ENEMY_DISPLAY_NAME: readonly string[] = [
  'Rust Mite',
  'Debt Hound',
  'Gatekeeper of Phobos',
  'Severance Lobber',
  'Repossession Marshal',
  'Foreclosure Mortar',
  'Riot Shotgunner',
  'Audit Brute',
  'Frostbite Auditor',
  'Liability Blob',
  'Blobling',
  'Phase Stalker',
  'Lance Sentinel',
  'Gargantuan',
];

// Frostbite Auditor — cryo lobber (T33). Lobs a slow-fusing FROST writ that
// blooms into a freezing zone: little damage, but it chills (slows) the player —
// deadly when it strips your kiting speed mid-swarm. Its hazard reads cyan, not
// the red of an explosive grenade.
export const FROSTBITE_AUDITOR: EnemyType = {
  id: 'frostbite-auditor',
  radius: 0.74,
  maxHealth: 22,
  speed: 2.6,
  separationWeight: 0.9,
  variant: 8,
  gore: 'blood',
  threat: 7,
  attack: {
    kind: 'lob',
    range: 19,
    cooldown: 5.0,
    windup: 0.5,
    speed: 13,
    fuse: 1.2,
    blastRadius: 4.0,
    damage: 6,
    freeze: true,
  },
};

/** Lance Sentinel (T-beam): a slow, heavy laser turret. It CHARGES — telegraphing a
 *  thickening line toward where you were — then fires a hitscan beam down that line
 *  to the wall. Rare + tanky + a one-hit shield, so it never swarms; it forces you
 *  to keep moving off its firing line. */
export const LANCE_SENTINEL: EnemyType = {
  id: 'lance-sentinel',
  radius: 0.85,
  maxHealth: 140, // hefty — a real obstacle, not fodder
  speed: 1.4, // slow creeping turret, but mobile enough to reposition between shots
  separationWeight: 0.7,
  variant: 12,
  gore: 'blood',
  threat: 26, // expensive → the director fields it rarely, never in groups
  shield: 1, // absorbs the first instance of damage
  standoff: 9, // holds ~9u off the player + trails them — never parks point-blank
  attack: {
    kind: 'beam',
    range: 20, // detection/fire range — must close in somewhat, can't snipe the whole pit
    cooldown: 4.5,
    charge: 1.3, // generous telegraph: lock + thicken, you dodge off the line
    width: 0.7, // beam half-width that catches the player
    damage: 26,
    beamLife: 0.22, // brief lethal flash once it fires
  },
};

/** Devourer (T-garg): a slow, hulking thing that EATS small enemies it reaches —
 *  each meal grows its body, HP, and contact damage (and heals it). Left alone in a
 *  crowd it snowballs into a wall, so you either kill it early or keep the fodder
 *  away from it. Rare; never swarms. (Growth lives in sim/gargantuan.ts.) */
export const GARGANTUAN: EnemyType = {
  id: 'gargantuan',
  radius: 1.0, // grows from here as it feeds
  maxHealth: 90,
  speed: 1.6, // slow lumber
  separationWeight: 0.5,
  variant: 13,
  gore: 'blood',
  contactDamage: 14,
  threat: 22, // expensive → rare, never in groups
};

/** Variant index → enemy type, so SoA-pooled enemies recover their def (and
 *  attack profile) at runtime without storing it per instance. */
export const ENEMY_BY_VARIANT: readonly (EnemyType | undefined)[] = [
  RUST_MITE,
  DEBT_HOUND,
  BOSS_GATEKEEPER,
  SEVERANCE_LOBBER,
  REPO_MARSHAL,
  FORECLOSURE_MORTAR,
  RIOT_SHOTGUNNER,
  AUDIT_BRUTE,
  FROSTBITE_AUDITOR,
  LIABILITY_BLOB,
  BLOBLING,
  PHASE_STALKER,
  LANCE_SENTINEL,
  GARGANTUAN,
];

/**
 * Splitter death (T33): if `variant` ruptures (has `splitInto`), spawn its
 * children at (x,z) with a deterministic ring scatter (V16 via the seeded rng).
 * Children spawn telegraphed (V9). Returns how many were spawned — 0 when the
 * variant isn't a splitter, the child variant is unknown, or the pool is full.
 */
export function splitOnDeath(
  pool: EnemyPool,
  variant: number,
  x: number,
  z: number,
  rng: Rng,
): number {
  const split = ENEMY_BY_VARIANT[variant]?.splitInto;
  if (!split) return 0;
  const child = ENEMY_BY_VARIANT[split.variant];
  if (!child) return 0;
  let spawned = 0;
  const off = child.radius + 0.3;
  for (let s = 0; s < split.count; s++) {
    const ang = rng.next() * Math.PI * 2;
    const phase = (rng.next() * 256) | 0;
    const i = pool.spawn(child, x + Math.cos(ang) * off, z + Math.sin(ang) * off, 0.2, phase);
    if (i >= 0) spawned++;
  }
  return spawned;
}

export interface SteerWeights {
  seek: number;
  separation: number;
}

export const DEFAULT_STEER: SteerWeights = { seek: 1, separation: 1.4 };

/**
 * Compute a desired velocity for one enemy: seek the target plus local
 * separation from neighbors. Pure — neighbor positions are supplied by the
 * caller (from the spatial hash). Returns a velocity scaled to `speed`.
 */
export function steerEnemy(
  px: number,
  pz: number,
  target: Vec2,
  speed: number,
  sepWeight: number,
  neighborsX: Float32Array,
  neighborsZ: Float32Array,
  neighborCount: number,
  selfRadius: number,
  weights: SteerWeights,
  stopDist = 0,
): Vec2 {
  // Seek (unit vector toward the target).
  let sx = target.x - px;
  let sz = target.z - pz;
  const sl = Math.hypot(sx, sz);
  if (sl > 1e-6) {
    sx /= sl;
    sz /= sl;
  }

  // Hold at the contact ring: fade the inward seek to 0 as the enemy reaches
  // `stopDist` (its footprint vs the player), so the crowd forms a RING around
  // the player instead of all piling onto the centre point and jiggling.
  let seekScale = weights.seek;
  if (stopDist > 0) {
    const band = 0.7; // soft approach so they ease in, not slam-and-bounce
    if (sl <= stopDist) seekScale = 0;
    else if (sl < stopDist + band) seekScale *= (sl - stopDist) / band;
  }

  // Separation: push away from close neighbors, weighted by closeness.
  let ax = 0;
  let az = 0;
  for (let n = 0; n < neighborCount; n++) {
    const dx = px - neighborsX[n]!;
    const dz = pz - neighborsZ[n]!;
    const d2 = dx * dx + dz * dz;
    const minDist = selfRadius * 2;
    if (d2 > 1e-6 && d2 < minDist * minDist) {
      const d = Math.sqrt(d2);
      ax += (dx / d) * (1 - d / minDist);
      az += (dz / d) * (1 - d / minDist);
    }
  }

  let dx = sx * seekScale + ax * sepWeight * weights.separation;
  let dz = sz * seekScale + az * sepWeight * weights.separation;

  // Hard ring constraint: once at/inside the stop ring, forbid any INWARD radial
  // motion. Seek is already zeroed, but a dense crowd's separation pushes inner
  // enemies toward the player (their neighbors are all on the outer side) —
  // which would drive them onto the centre. Project out the toward-player
  // component so they can only slide tangentially or get pushed back OUT. This
  // is what actually kills the centre-pile and the jiggle (no in/out bounce).
  if (stopDist > 0 && sl <= stopDist && sl > 1e-6) {
    const inward = dx * sx + dz * sz; // +ve = moving toward the player
    if (inward > 0) {
      dx -= inward * sx;
      dz -= inward * sz;
    }
  }

  const dl = Math.hypot(dx, dz);
  if (dl > 1e-6) {
    dx = (dx / dl) * speed;
    dz = (dz / dl) * speed;
  }
  return { x: dx, z: dz };
}
