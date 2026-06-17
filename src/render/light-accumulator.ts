// Feeds the projectile light buffer from EVERY emitter in the world (bolts,
// grenades, enemy shots, pickups) in ONE accumulation pass (begin → add… →
// commit). Cost is the sprite count, not a light per source. Airborne sources
// (grenade, lobbed enemy shots) shrink + dim their FLOOR glow with height so the
// light reads as lifting off the ground. Pure view glue (V2): reads sim, writes
// only the light buffer. Split out of main.ts to keep boot lean.

import { Color } from 'three';
import type { World } from '../sim/world';
import { BeamState } from '../sim/enemy-attacks';
import { type LightBuffer, PROJ_LIGHT_COLS, PROJ_LIGHT_GAIN } from './light-buffer';
import type { LaserView } from './laser-view';

const LIGHT_GRENADE = new Color(1.0, 0.28, 0.14); // hot red — distinct from gold bolts
const LIGHT_ENEMY = new Color(0.85, 0.3, 0.95); // hostile magenta
const LIGHT_SHARD = new Color(0.3, 0.85, 0.7); // xp cyan-green
const LIGHT_BOUNTY = new Color(1.0, 0.78, 0.32); // relic gold
const LIGHT_WEAPON = new Color(1.0, 0.66, 0.34); // crate warm gold
const LIGHT_HEALTH = new Color(1.0, 0.32, 0.28); // medkit red
const LIGHT_LASER = new Color(0.4, 0.9, 1.0); // player Ion Lance — hot cyan beam
const LIGHT_BEAM = new Color(1.0, 0.22, 0.26); // sentinel/charge beam — laser red

/** Splat floor glow along a BEAM (point lights can't draw a line) by sampling a few
 *  points down it — so a laser lights the floor like bolts/grenades do. */
function addBeamLight(
  buf: LightBuffer,
  ox: number,
  oz: number,
  ex: number,
  ez: number,
  color: Color,
  scale: number,
  intensity: number,
): void {
  const dx = ex - ox;
  const dz = ez - oz;
  const steps = Math.max(1, Math.floor(Math.hypot(dx, dz) / 2.5));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    buf.add(ox + dx * t, oz + dz * t, color, scale, intensity);
  }
}

export function accumulateLights(
  lightBuffer: LightBuffer,
  world: World,
  alpha: number,
  laserView?: LaserView,
): void {
  lightBuffer.begin();
  // Player bolts — full glow, tinted + scaled by weapon family (PROJ_LIGHT_GAIN).
  const pp = world.weaponSystem.projectiles;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.prevX[i]! + (pp.posX[i]! - pp.prevX[i]!) * alpha;
    const z = pp.prevZ[i]! + (pp.posZ[i]! - pp.prevZ[i]!) * alpha;
    const style = pp.style[i]!;
    const g = PROJ_LIGHT_GAIN[style] ?? PROJ_LIGHT_GAIN[0]!;
    lightBuffer.add(x, z, PROJ_LIGHT_COLS[style] ?? PROJ_LIGHT_COLS[0]!, g.scale, g.intensity);
  }
  // Grenades — floor glow shrinks/dims as the lob rises (peak ≈ 2.6 over base 0.4).
  const gr = world.grenades;
  for (let i = 0; i < gr.count; i++) {
    const t = Math.min(1, Math.max(0, (gr.posY[i]! - 0.4) / 2.6));
    const f = 1 - t * 0.85; // near 0.15 at the apex
    lightBuffer.add(gr.posX[i]!, gr.posZ[i]!, LIGHT_GRENADE, 1.3 * f, 1.2 * f);
  }
  // Enemy projectiles — lobbed shots arc (height fades the floor glow); guns flat.
  const ep = world.enemyAttacks.projectiles;
  for (let i = 0; i < ep.count; i++) {
    const h = ep.height(i, alpha);
    const f = 1 - Math.min(1, h / 4) * 0.8;
    const x = ep.prevX[i]! + (ep.posX[i]! - ep.prevX[i]!) * alpha;
    const z = ep.prevZ[i]! + (ep.posZ[i]! - ep.prevZ[i]!) * alpha;
    lightBuffer.add(x, z, LIGHT_ENEMY, 1, 0.8 * f);
  }
  // Pickups — subtle, low static floor glow so they're findable on the dark stage.
  const sh = world.shards;
  for (let i = 0; i < sh.count; i++)
    lightBuffer.add(sh.posX[i]!, sh.posZ[i]!, LIGHT_SHARD, 0.5, 0.4);
  const bp = world.bounties.pool;
  for (let i = 0; i < bp.count; i++)
    lightBuffer.add(bp.posX[i]!, bp.posZ[i]!, LIGHT_BOUNTY, 1.1, 0.7);
  const wd = world.weaponDrops.pool;
  for (let i = 0; i < wd.count; i++)
    lightBuffer.add(wd.posX[i]!, wd.posZ[i]!, LIGHT_WEAPON, 1, 0.6);
  const hd = world.healthDrops.pool;
  for (let i = 0; i < hd.count; i++)
    lightBuffer.add(hd.posX[i]!, hd.posZ[i]!, LIGHT_HEALTH, 0.9, 0.6);
  // Sentinel laser beams (sim BeamPool): a FIRING beam lights its whole length; a
  // CHARGING one glows brighter at the muzzle as it winds up.
  const bm = world.enemyAttacks.beams;
  for (let i = 0; i < bm.count; i++) {
    const ox = bm.ox[i]!;
    const oz = bm.oz[i]!;
    if (bm.state[i] === BeamState.Firing) {
      const ex = ox + bm.dirX[i]! * bm.len[i]!;
      const ez = oz + bm.dirZ[i]! * bm.len[i]!;
      addBeamLight(lightBuffer, ox, oz, ex, ez, LIGHT_BEAM, 1.3, 1.3);
    } else {
      lightBuffer.add(ox, oz, LIGHT_BEAM, 1.0, 0.5 * bm.chargeT(i));
    }
  }
  // Player Ion Lance — light the floor along each live hitscan lance (render-side).
  if (laserView) {
    laserView.eachActive((ox, oz, ex, ez, fade) => {
      addBeamLight(lightBuffer, ox, oz, ex, ez, LIGHT_LASER, 1.2 * fade, 1.5 * fade);
    });
  }
  lightBuffer.commit();
}
