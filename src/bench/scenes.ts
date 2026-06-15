// Headless sim performance benchmark (T32). Drives the authoritative sim under
// controlled load — large crowds and projectile storms — and records per-step
// sim cost, entity counts, and heap delta (V5 pooling: hot systems shouldn't
// allocate per frame). Pure sim: no Three, no GPU. Render/draw-call metrics
// require a real WebGPU device and belong to the Playwright bench (T31) — they
// are reported here as `null`, not faked.
//
// Tool harness, not a sim system: it may read the clock (performance.now). The
// sim systems themselves stay clock-free so determinism holds (V16).

import { World } from '../sim/world';
import { EnemyState, RUST_MITE, DEBT_HOUND, type EnemyType } from '../sim/enemies';
import { Rng } from '../core/rng';
import { ARENA_RADIUS } from '../sim/constants';
import { contractualSidearm } from '../content/weapons/contractual-sidearm';

export interface SceneSpec {
  name: string;
  /** Live enemies to hold in the arena. */
  enemies: number;
  /** Mix ratio of Debt Hounds (0..1); remainder are Rust Mites. */
  houndRatio?: number;
  /** Projectiles to seed (storm). */
  projectiles?: number;
  /** Fixed steps to measure. */
  steps: number;
  seed: number;
}

export interface SceneMetrics {
  name: string;
  enemies: number;
  projectiles: number;
  steps: number;
  totalSimMs: number;
  msPerStep: number;
  /** Heap growth across the run in KB (V5 alloc proxy; noisy — sanity, not SLA). */
  heapDeltaKb: number;
  endEnemies: number;
  endProjectiles: number;
  /** GPU-only metrics — not measurable headless (see T31). */
  drawCalls: null;
  renderMs: null;
}

const DAMAGE = contractualSidearm.damage;

/** Seed the enemy pool with `n` Active enemies at random in-arena positions. */
function seedEnemies(w: World, n: number, houndRatio: number, rng: Rng): void {
  for (let i = 0; i < n; i++) {
    const ang = rng.range(0, Math.PI * 2);
    const rad = rng.range(0, ARENA_RADIUS - 2);
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    const type: EnemyType = rng.next() < houndRatio ? DEBT_HOUND : RUST_MITE;
    const idx = w.enemies.spawn(type, x, z, 0, i);
    if (idx >= 0) w.enemies.state[idx] = EnemyState.Active; // skip telegraph for load
  }
}

/** Seed a projectile storm: `n` projectiles with random in-arena origin + heading. */
function seedProjectiles(w: World, n: number, rng: Rng): void {
  const pr = w.weaponSystem.projectiles;
  const p = contractualSidearm.projectile;
  for (let i = 0; i < n; i++) {
    const ang = rng.range(0, Math.PI * 2);
    const rad = rng.range(0, ARENA_RADIUS - 2);
    pr.spawn(
      Math.cos(ang) * rad,
      Math.sin(ang) * rad,
      Math.sin(ang) * p.speed,
      Math.cos(ang) * p.speed,
      p.radius,
      p.lifetime,
      p.pierce,
      DAMAGE,
    );
  }
}

const DT = 1 / 60;

/** Run one scene and return its metrics. Deterministic in outcome for a seed. */
export function runScene(spec: SceneSpec): SceneMetrics {
  const rng = new Rng(spec.seed);
  const w = new World(spec.seed);
  w.start(); // enter the pit (resets the run, clears the menu idle gate)
  w.countdown = 0; // skip the pre-combat hold so every step does combat work
  seedEnemies(w, spec.enemies, spec.houndRatio ?? 0, rng);
  if (spec.projectiles) seedProjectiles(w, spec.projectiles, rng);

  const heapBefore = heapUsed();
  const t0 = performance.now();
  for (let s = 0; s < spec.steps; s++) {
    // Top up the crowd so load stays near-constant despite attrition.
    if (w.enemies.count < spec.enemies) {
      seedEnemies(w, spec.enemies - w.enemies.count, spec.houndRatio ?? 0, rng);
    }
    // Keep the sim doing full work every step: a dead player or an open draft
    // would early-return `step` and the benchmark would measure nothing.
    w.player.health = 1e9;
    w.player.maxHealth = 1e9;
    if (w.leveling) w.choose(0);
    w.step(DT);
  }
  const totalSimMs = performance.now() - t0;
  const heapDeltaKb = Math.max(0, (heapUsed() - heapBefore) / 1024);

  return {
    name: spec.name,
    enemies: spec.enemies,
    projectiles: spec.projectiles ?? 0,
    steps: spec.steps,
    totalSimMs,
    msPerStep: totalSimMs / spec.steps,
    heapDeltaKb,
    endEnemies: w.enemies.count,
    endProjectiles: w.weaponSystem.projectiles.count,
    drawCalls: null,
    renderMs: null,
  };
}

/** heapUsed in bytes when running under Node (vitest); 0 in a browser. */
function heapUsed(): number {
  const proc = (globalThis as { process?: { memoryUsage?: () => { heapUsed: number } } }).process;
  return proc?.memoryUsage ? proc.memoryUsage().heapUsed : 0;
}

/** Standard benchmark suite (§ perf scenes): crowds + a projectile storm. */
export const STANDARD_SCENES: readonly SceneSpec[] = [
  { name: 'crowd-500', enemies: 500, steps: 300, seed: 0xb0501 },
  { name: 'crowd-1k', enemies: 1000, steps: 300, seed: 0xb1000 },
  { name: 'crowd-2k', enemies: 2000, steps: 300, seed: 0xb2000 },
  { name: 'mixed-1k', enemies: 1000, houndRatio: 0.4, steps: 300, seed: 0xb14c0 },
  { name: 'projectile-storm', enemies: 800, projectiles: 4000, steps: 300, seed: 0xb5704 },
];

/** Render a metrics table for `pnpm test` / manual inspection. */
export function formatReport(rows: readonly SceneMetrics[]): string {
  const head =
    'scene            enemies  proj   ms/step   total ms   heapΔKB  endEn  endPr   draws';
  const lines = rows.map((m) => {
    const name = m.name.padEnd(16);
    const en = String(m.enemies).padStart(7);
    const pr = String(m.projectiles).padStart(5);
    const mps = m.msPerStep.toFixed(3).padStart(8);
    const tot = m.totalSimMs.toFixed(1).padStart(9);
    const heap = m.heapDeltaKb.toFixed(0).padStart(8);
    const ee = String(m.endEnemies).padStart(6);
    const ep = String(m.endProjectiles).padStart(6);
    const draws = String(m.drawCalls ?? 'n/a (GPU)').padStart(9);
    return `${name} ${en} ${pr} ${mps} ${tot} ${heap} ${ee} ${ep} ${draws}`;
  });
  return [head, ...lines].join('\n');
}
