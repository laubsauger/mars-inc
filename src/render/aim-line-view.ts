// Aim lines (player aid). Thin, slightly transparent lines from the player along
// each fire direction — mirroring the weapon's multishot fan exactly, so a
// 3-projectile build shows three lines at the projectile angles. Each line
// terminates at the first enemy hit, the weapon's max range, or the arena wall —
// whichever is nearest. Pure view (V2): the raycast is computed in the render
// layer from sim state and never written back. Fat-line (Line2) → constant ~2px.

import { type Scene } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { EnemyState, type EnemyPool } from '../sim/enemies';
import { ARENA_RADIUS } from '../sim/constants';
import { COL } from './art/palette';

const Y = 0.6; // line height (roughly gun level)
const MAX_LINES = 32; // pooled; covers heavy multishot stacks

export class AimLineView {
  private lines: Line2[] = [];
  private mat: LineMaterial;

  constructor(scene: Scene, width: number, height: number) {
    this.mat = new LineMaterial({
      color: COL.kineticGold.getHex(),
      linewidth: 2, // pixels (worldUnits defaults off)
      transparent: true,
      opacity: 0.5,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.mat.resolution.set(width, height);
    for (let i = 0; i < MAX_LINES; i++) {
      const geo = new LineGeometry();
      geo.setPositions([0, Y, 0, 0, Y, 0]);
      const ln = new Line2(geo, this.mat);
      ln.frustumCulled = false;
      ln.renderOrder = 1;
      ln.visible = false;
      scene.add(ln);
      this.lines.push(ln);
    }
  }

  setResolution(width: number, height: number): void {
    this.mat.resolution.set(width, height);
  }

  /** Distance along a unit ray to the first enemy / max range / arena wall. */
  private raycast(
    pool: EnemyPool,
    px: number,
    pz: number,
    dx: number,
    dz: number,
    maxRange: number,
  ): number {
    const pd = px * dx + pz * dz;
    const disc = pd * pd - (px * px + pz * pz - ARENA_RADIUS * ARENA_RADIUS);
    const tWall = disc > 0 ? -pd + Math.sqrt(disc) : maxRange;
    let tHit = Math.min(maxRange, tWall);
    for (let i = 0; i < pool.count; i++) {
      if (pool.state[i] !== EnemyState.Active) continue;
      const ocx = pool.posX[i]! - px;
      const ocz = pool.posZ[i]! - pz;
      const tca = ocx * dx + ocz * dz;
      if (tca <= 0) continue; // behind the aim direction
      const er = pool.radius[i]!;
      const d2 = ocx * ocx + ocz * ocz - tca * tca;
      if (d2 > er * er) continue; // ray misses
      const t = tca - Math.sqrt(er * er - d2);
      if (t > 0 && t < tHit) tHit = t;
    }
    return tHit;
  }

  /**
   * Render one line per fire direction. `dirs` is a flat [dx0,dz0, dx1,dz1, …]
   * of unit directions (matching the weapon's multishot fan); `count` is how
   * many to draw. Extra pooled lines are hidden.
   */
  sync(
    pool: EnemyPool,
    px: number,
    pz: number,
    dirs: Float32Array,
    count: number,
    maxRange: number,
    startGap: number,
  ): void {
    const n = Math.min(count, MAX_LINES);
    for (let i = 0; i < MAX_LINES; i++) {
      const ln = this.lines[i]!;
      if (i >= n) {
        ln.visible = false;
        continue;
      }
      const dx = dirs[i * 2]!;
      const dz = dirs[i * 2 + 1]!;
      const t = this.raycast(pool, px, pz, dx, dz, maxRange);
      ln.visible = true;
      ln.geometry.setPositions([
        px + dx * startGap,
        Y,
        pz + dz * startGap,
        px + dx * t,
        Y,
        pz + dz * t,
      ]);
    }
  }

  hide(): void {
    for (const l of this.lines) l.visible = false;
  }
}
