// Floating world-anchored text (render-only, V2). Two jobs:
//  - Damage numbers: pooled + AGGREGATED (§C) — rapid hits on the same spot tally
//    into one rising number instead of spamming dozens. Bounded pool.
//  - Pickup labels: a readable name floats over each weapon crate (until proper
//    models exist you can't tell what a drop is otherwise).
// Both are projected to screen here; React renders the bounded list as DOM with
// a readability backdrop. Never per-enemy DOM — capped well below the crowd.

import { Vector3, type Camera } from 'three';
import type { WeaponDropPool } from '../sim/weapon-drops';
import { DROP_TTL, DROP_FADE } from '../sim/weapon-drops';
import { WEAPONS } from '../content/weapons/index';
import { ACCENT, INK } from './art/palette';

const MAX_DMG = 160; // hard cap on concurrent damage numbers (bounded DOM). Raised
// from 48 now that every hit gets its OWN number — a fast multishot build sprays
// far more at once, and 48 recycled them away before they could read.
const TTL = 0.9; // lifetime of a damage number (s)

export interface ScreenLabel {
  id: string;
  x: number; // screen px
  y: number;
  text: string;
  color: string;
  size: number; // font px
  opacity: number;
  kind: 'dmg' | 'pickup';
  /** Damage labels: a critical hit (gold + "!" + glow). */
  crit?: boolean;
  /** Pickup labels: show the "E" key chip (always true for crates). */
  prompt?: boolean;
  /** Pickup labels: true for the crate in equip range (the bright candidate). */
  active?: boolean;
}

export class FloatingText {
  private dx = new Float32Array(MAX_DMG);
  private dz = new Float32Array(MAX_DMG);
  private amt = new Float32Array(MAX_DMG);
  private age = new Float32Array(MAX_DMG);
  // Per-number launch velocity for the arc (world units/s): horizontal drift +
  // an upward pop that gravity pulls back down (RPG-style "spat out of the hit").
  private vx = new Float32Array(MAX_DMG);
  private vz = new Float32Array(MAX_DMG);
  private vy = new Float32Array(MAX_DMG);
  // 0 = normal enemy damage, 1 = crit, 2 = damage TO the player (self).
  private flag = new Uint8Array(MAX_DMG);
  private count = 0;
  private v = new Vector3();

  /** Record damage at a world point — EACH hit instance gets its OWN flying number
   *  (no aggregation). Summing nearby hits into one tally read as far higher
   *  per-hit damage than the build actually does, which was misleading. */
  addDamage(x: number, z: number, amount: number, flag: number): void {
    if (amount <= 0) return;
    let slot = this.count;
    if (this.count >= MAX_DMG) {
      slot = 0; // recycle the oldest
      for (let i = 1; i < this.count; i++) if (this.age[i]! > this.age[slot]!) slot = i;
    } else {
      this.count++;
    }
    this.dx[slot] = x;
    this.dz[slot] = z;
    this.amt[slot] = amount;
    this.age[slot] = 0;
    this.flag[slot] = flag;
    // Launch: a random horizontal direction (deterministic hash, no Math.random
    // in the hot path) + an upward pop. Gravity in collect() pulls it back into
    // an arc. Self-hits (flag 2) pop straight up so they read as "you took dmg".
    const hash = Math.sin(slot * 12.9898 + x * 4.1414 + z * 2.7182) * 43758.5453;
    const r = hash - Math.floor(hash);
    const ang = r * Math.PI * 2;
    const spd = flag === 2 ? 0.2 : 0.9 + r * 0.7;
    this.vx[slot] = Math.cos(ang) * spd;
    this.vz[slot] = Math.sin(ang) * spd;
    this.vy[slot] = 3.2; // upward pop; G applied over age
  }

  update(dt: number): void {
    for (let i = this.count - 1; i >= 0; i--) {
      this.age[i]! += dt;
      if (this.age[i]! >= TTL) {
        const last = --this.count;
        this.dx[i] = this.dx[last]!;
        this.dz[i] = this.dz[last]!;
        this.amt[i] = this.amt[last]!;
        this.age[i] = this.age[last]!;
        this.vx[i] = this.vx[last]!;
        this.vz[i] = this.vz[last]!;
        this.vy[i] = this.vy[last]!;
        this.flag[i] = this.flag[last]!;
      }
    }
  }

  /** Project active damage numbers + crate labels to screen-space for the DOM. */
  collect(
    camera: Camera,
    w: number,
    h: number,
    drops: WeaponDropPool,
    promptIndex = -1,
  ): ScreenLabel[] {
    const out: ScreenLabel[] = [];
    const G = 7; // gravity on the pop arc (world units/s²)
    for (let i = 0; i < this.count; i++) {
      const age = this.age[i]!;
      const t = age / TTL;
      // Arc: lateral drift + an upward pop pulled back down by gravity.
      const ax = this.dx[i]! + this.vx[i]! * age;
      const az = this.dz[i]! + this.vz[i]! * age;
      const ay = 1.2 + this.vy[i]! * age - 0.5 * G * age * age;
      this.v.set(ax, ay, az).project(camera);
      if (this.v.z > 1) continue;
      // DoT ticks (burn/bleed) remove fractional health each step; don't render a
      // number until the aggregated total rounds to ≥1, so no "0" ever pops.
      if (Math.round(this.amt[i]!) < 1) continue;
      const f = this.flag[i];
      const isCrit = f === 1;
      const isSelf = f === 2;
      // Spring pop: overshoot the size on spawn, settle fast. Crits punch harder.
      const pop = 1 + (isCrit ? 0.65 : 0.5) * Math.exp(-age * (isCrit ? 13 : 16));
      const base = isCrit ? 15 : isSelf ? 14 : 11;
      const val = Math.round(this.amt[i]!);
      out.push({
        id: `d${i}`,
        x: (this.v.x * 0.5 + 0.5) * w,
        y: (-this.v.y * 0.5 + 0.5) * h,
        // Crit gets a "!" so it reads as a crit even out of the corner of your eye.
        text: isSelf ? `-${val}` : isCrit ? `${val}!` : `${val}`,
        color: isSelf ? ACCENT.healthRed : isCrit ? ACCENT.kineticGold : '#f3e6c0',
        size: base * pop,
        opacity: 1 - t * t,
        kind: 'dmg',
        crit: isCrit,
      });
    }
    for (let i = 0; i < drops.count; i++) {
      // Float the label well ABOVE the bobbing crate so it never covers it.
      this.v.set(drops.posX[i]!, 2.7, drops.posZ[i]!).project(camera);
      if (this.v.z > 1) continue;
      const def = WEAPONS[drops.weapon[i]!];
      // The "E to equip" prompt shows on EVERY crate so the bind is always taught
      // in context; the crate in equip range is the brighter, larger candidate.
      const inRange = i === promptIndex;
      // Fade + blink in the crate's final seconds so its despawn reads.
      const age = drops.age[i]!;
      let opacity = inRange ? 1 : 0.78;
      if (age > DROP_TTL - DROP_FADE) {
        const left = Math.max(0, DROP_TTL - age) / DROP_FADE; // 1 → 0
        opacity = 0.35 + 0.45 * left + 0.2 * (0.5 + 0.5 * Math.sin(age * 14)); // blink
      }
      out.push({
        id: `p${i}`,
        x: (this.v.x * 0.5 + 0.5) * w,
        y: (-this.v.y * 0.5 + 0.5) * h,
        text: def?.displayName ?? 'Weapon',
        // Out of range = readable light label (info only). In range = bright gold
        // + the E prompt. Both get a backdrop (in FloatingLayer) so the name reads
        // over the busy floor regardless.
        color: inRange ? ACCENT.kineticGold : '#efe4cf',
        size: inRange ? 14 : 12,
        opacity,
        kind: 'pickup',
        prompt: inRange, // E prompt ONLY when actually in equip range
        active: inRange,
      });
    }
    return out;
  }
}

export const FLOATING_INK = INK.nearBlack; // backdrop tint (shared with the HUD)
