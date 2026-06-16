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

const MAX_DMG = 48; // hard cap on concurrent damage numbers (bounded DOM)
const AGG_R2 = 1.6 * 1.6; // hits within this radius...
const AGG_WINDOW = 0.4; // ...and this recent → tally into the same number
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

  /** Record damage at a world point — aggregates into a nearby recent number of
   *  the same flag (so player-hit numbers never merge with enemy-damage ones). */
  addDamage(x: number, z: number, amount: number, flag: number): void {
    if (amount <= 0) return;
    for (let i = 0; i < this.count; i++) {
      if (this.age[i]! >= AGG_WINDOW || this.flag[i] === 2 || flag === 2) continue;
      const ddx = this.dx[i]! - x;
      const ddz = this.dz[i]! - z;
      if (ddx * ddx + ddz * ddz < AGG_R2) {
        this.amt[i]! += amount;
        this.age[i] = 0; // keep it alive + rising while tallying
        if (flag === 1) this.flag[i] = 1; // a crit anywhere in the tally → gold
        return;
      }
    }
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
      const f = this.flag[i];
      const isCrit = f === 1;
      const isSelf = f === 2;
      // Spring pop: overshoot the size on spawn, settle fast (~0.16s).
      const pop = 1 + 0.5 * Math.exp(-age * 16);
      const base = isCrit ? 15 : isSelf ? 14 : 11;
      out.push({
        id: `d${i}`,
        x: (this.v.x * 0.5 + 0.5) * w,
        y: (-this.v.y * 0.5 + 0.5) * h,
        text: isSelf ? `-${Math.round(this.amt[i]!)}` : `${Math.round(this.amt[i]!)}`,
        color: isSelf ? ACCENT.healthRed : isCrit ? ACCENT.kineticGold : '#f3e6c0',
        size: base * pop,
        opacity: 1 - t * t,
        kind: 'dmg',
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
        color: inRange ? ACCENT.kineticGold : INK.warmLine,
        size: inRange ? 13 : 11,
        opacity,
        kind: 'pickup',
        prompt: true,
        active: inRange,
      });
    }
    return out;
  }
}

export const FLOATING_INK = INK.nearBlack; // backdrop tint (shared with the HUD)
