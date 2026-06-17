// Projectile light buffer (render polish). Real per-bolt point lights are out of
// the question (the pool caps at 6000 — even hundreds of dynamic lights would melt
// the forward WebGPU renderer). Instead we accumulate every bolt's glow as a soft
// additive sprite into a small TOP-DOWN render target covering the arena's XZ
// plane — a dynamic "light map". Floor + wall materials then sample it by world XZ
// and add it as emissive, so tracers spill coloured light onto the stage and the
// existing bloom blooms it. Fuzzy by construction (soft-gradient sprites), no blur
// pass, no shadows. Pure view (V2): reads sim pools, writes only its own RT.
//
// The sprite uses a vertex-gradient disc (bright centre → black rim) so the light
// field is naturally soft — the same WebGPU-safe trick as the FX glow (§B1: solid
// vertex/instance colour binds; CanvasTexture maps don't).

import {
  Scene,
  OrthographicCamera,
  InstancedMesh,
  BufferGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  AdditiveBlending,
} from 'three';
import { RenderTarget, type WebGPURenderer } from 'three/webgpu';
import { texture, positionWorld, uniform, vec2 } from 'three/tsl';
import { COL } from './art/palette';

const RT_SIZE = 384; // light-map resolution; soft + cheap (no per-pixel detail needed)
// Master intensity of the spilled light (on top of the on/off strength uniform).
// Kept low so it reads as a subtle glow that BLENDS with the dim stage + bloom,
// not a flashbang painted on the floor.
const INTENSITY = 0.26;
const CAP = 900; // bolts contributing light per frame (cosmetic cap, V5)
const LIGHT_RADIUS = 2.1; // world-units glow radius per bolt — wide enough to pool soft
const Y = 1.2; // sprite height; the ortho cam looks straight down so it's cosmetic

// Per weapon-family light tint — mirrors the projectile-view tracer colours so the
// floor glow matches the bolt that cast it. Index = projectile style (family).
// Exported so callers can colour player bolts by family.
export const PROJ_LIGHT_COLS: Color[] = [
  COL.kineticGold, // sidearm — gold
  COL.sunHigh, // rotary — warm
  new Color(1.0, 0.5, 0.18), // explosive — orange
  COL.eliteMagenta, // drone — purple
  COL.shieldCyan, // energy — cyan
  COL.kineticGold, // orbital — gold
];

/** A unit disc (radius 0.5) whose vertex brightness falls off on a SMOOTH curve
 *  from centre to rim — multiple concentric rings, brightness = (1−t)² so the core
 *  isn't a hard hot point and the edge eases to nothing (a single-ring linear ramp
 *  read as a sharp cone). Vertex colours only → soft glow under additive, no
 *  texture (§B1). */
function softGlowGeo(rings = 6, seg = 28): BufferGeometry {
  const pos: number[] = [0, 0, 0];
  const col: number[] = [1, 1, 1]; // centre vertex, full bright
  for (let r = 1; r <= rings; r++) {
    const rad = (r / rings) * 0.5;
    const t = r / rings;
    const b = (1 - t) * (1 - t); // smooth quadratic falloff; rim → 0
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * rad, Math.sin(a) * rad, 0);
      col.push(b, b, b);
    }
  }
  const idx: number[] = [];
  for (let s = 0; s < seg; s++) idx.push(0, 1 + s, 1 + ((s + 1) % seg)); // centre fan
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * seg;
    const b0 = 1 + r * seg;
    for (let s = 0; s < seg; s++) {
      const nx = (s + 1) % seg;
      idx.push(a0 + s, b0 + s, a0 + nx, a0 + nx, b0 + s, b0 + nx); // ring quad
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

export class LightBuffer {
  private rt: RenderTarget;
  private scene = new Scene();
  private cam: OrthographicCamera;
  private sprites: InstancedMesh;
  private dummy = new Object3D();
  private tmp = new Color();

  // World→UV mapping (set in configure) + master strength, shared by every
  // material that samples the buffer.
  private uMinX = uniform(0);
  private uMinZ = uniform(0);
  private uSizeX = uniform(1);
  private uSizeZ = uniform(1);
  private uStrength = uniform(0);

  constructor() {
    this.rt = new RenderTarget(RT_SIZE, RT_SIZE, { depthBuffer: false });
    this.cam = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    // Look straight down with +Z as the camera's up, so image X = world X and image
    // Y = world Z (matches the UV mapping in `emissiveNode`, no axis swap).
    this.cam.up.set(0, 0, 1);

    const mat = new MeshBasicMaterial({
      color: 0xffffff, // white base; instanceColor carries the per-bolt tint
      vertexColors: true, // centre→rim gradient = soft glow
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    this.sprites = new InstancedMesh(softGlowGeo(), mat, CAP);
    this.sprites.instanceMatrix.setUsage(DynamicDrawUsage);
    const cbuf = new Float32Array(CAP * 3).fill(1);
    this.sprites.instanceColor = new InstancedBufferAttribute(cbuf, 3);
    this.sprites.instanceColor.setUsage(DynamicDrawUsage);
    this.sprites.frustumCulled = false;
    this.sprites.count = 0;
    this.scene.add(this.sprites);
  }

  /** Frame the buffer over an arena's XZ bounds (call on build + arena switch). */
  configure(minX: number, minZ: number, maxX: number, maxZ: number): void {
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const halfX = (maxX - minX) / 2;
    const halfZ = (maxZ - minZ) / 2;
    this.cam.left = -halfX;
    this.cam.right = halfX;
    this.cam.top = halfZ;
    this.cam.bottom = -halfZ;
    this.cam.position.set(cx, 50, cz);
    this.cam.lookAt(cx, 0, cz);
    this.cam.updateProjectionMatrix();
    this.uMinX.value = minX;
    this.uMinZ.value = minZ;
    this.uSizeX.value = maxX - minX;
    this.uSizeZ.value = maxZ - minZ;
  }

  /** Master on/off + intensity (settings toggle). 0 = no light spill. */
  setStrength(s: number): void {
    this.uStrength.value = s;
  }

  get enabled(): boolean {
    return this.uStrength.value > 0;
  }

  /** TSL emissive contribution for a material: the light sampled at the fragment's
   *  world XZ, scaled by strength. Add to a material's emissiveNode. Shared across
   *  materials (one node instance is fine). */
  emissiveNode() {
    // The top-down ortho camera mirrors the world on BOTH axes vs. the sample UV
    // (camera basis + texture origin), so flip u and v (`oneMinus`) — otherwise the
    // light field reads point-mirrored (a bolt heading top-right lights bottom-left).
    const u = positionWorld.x.sub(this.uMinX).div(this.uSizeX).oneMinus();
    const v = positionWorld.z.sub(this.uMinZ).div(this.uSizeZ).oneMinus();
    return texture(this.rt.texture, vec2(u, v)).rgb.mul(this.uStrength).mul(INTENSITY);
  }

  // ── Per-frame accumulation. Callers begin(), add() any number of emitters from
  //    any pool (bolts, grenades, pickups…), then commit(). Disabled → all no-ops.
  private writeIdx = 0;
  private active = false;

  begin(): void {
    this.active = this.uStrength.value > 0;
    this.writeIdx = 0;
  }

  /** Add one light emitter at world (x,z). `scale` multiplies the base glow radius;
   *  `intensity` scales brightness (both let an airborne/faint source dim down). */
  add(x: number, z: number, color: Color, scale = 1, intensity = 1): void {
    if (!this.active || this.writeIdx >= CAP || intensity <= 0) return;
    const i = this.writeIdx++;
    this.dummy.position.set(x, Y, z);
    this.dummy.rotation.set(-Math.PI / 2, 0, 0); // face the top-down camera
    this.dummy.scale.setScalar(LIGHT_RADIUS * 2 * scale); // geom radius 0.5 → ×2 = world radius
    this.dummy.updateMatrix();
    this.sprites.setMatrixAt(i, this.dummy.matrix);
    this.sprites.setColorAt(i, this.tmp.copy(color).multiplyScalar(intensity));
  }

  commit(): void {
    this.sprites.count = this.writeIdx;
    this.sprites.instanceMatrix.needsUpdate = true;
    if (this.sprites.instanceColor) this.sprites.instanceColor.needsUpdate = true;
  }

  /** Render the accumulation pass into the RT (call once per frame, before the main
   *  scene pass so materials sample this frame's light). Cheap: one instanced draw. */
  render(renderer: WebGPURenderer): void {
    if (this.uStrength.value <= 0) return; // disabled → leave the (cleared) RT dark
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene, this.cam);
    renderer.setRenderTarget(null);
  }
}
