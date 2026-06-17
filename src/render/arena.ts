// Rust Crown arena view (T5 + T37 art pass). Pure render (V2): builds the floor,
// outer wall, central emblem, spectator tier, lighting, and the four gatehouses
// whose blast doors ANIMATE open while enemies telegraph nearby — so fodder reads
// as walking in through the gate, not popping in. The open signal is derived from
// sim enemy state each frame (render reads sim, never mutates it).
//
// Art direction: warm dusty floor vs. cool gunmetal structures for contrast and
// readability (gameplay reads over the muted floor; gold trim only as accent).

import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Color,
  type Scene,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  RingGeometry,
  SpotLight,
} from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { ARENA_RADIUS, GATE_COUNT } from '../sim/constants';
import { activeArena } from '../sim/arena';
import { EnemyState, type EnemyPool } from '../sim/enemies';
import { COL, OUTLINE as OUTLINE_W } from './art/palette';
import { batchStatic } from './geometry-batch';
import type { LightBuffer } from './light-buffer';

import { PlaneGeometry } from 'three';

// Warm floor family (dusty Mars), cool structural family (gunmetal), gold accent.
// Floor base + panels are dropped a NOTCH below the palette tokens so saturated
// combat accents (gold/cyan tracers, blasts) win readability on a darker stage —
// applies to both arenas (one ArenaView builds either pit).
const FLOOR = COL.umberShadow.clone().multiplyScalar(0.72);
const FLOOR_PANEL = COL.oldRust.clone().multiplyScalar(0.8);
const FLOOR_LINE = COL.warmLine;
const TRIM = COL.kineticGold;
const OUTLINE = COL.nearBlack;
const STEEL_DARK = new Color('#23262c');
const STEEL = new Color('#363b44');
const STEEL_LIT = new Color('#525a66');
const WALL = new Color('#3a2d28'); // warm-tinted iron so wall ties floor to steel
const DOOR = new Color('#1c2230'); // blast doors — cold dark gunmetal, distinct ⊥ the warm wall
const CROWD = new Color('#140f0d');
const PORTAL_FLOOR = new Color('#060507'); // near-black tunnel floor (reads as depth)
const PORTAL_BACK = new Color('#0a0706'); // very dim back wall — a dark hallway, not a lit alcove
const PORTAL_GLOW = new Color('#ff5a2a'); // ominous warm light enemies emerge from
// Gate-ROOM interior (ceiling + side walls): darker than the steel/WALL so the
// recess reads as a shadowed hole behind the opening, not a lit alcove.
const PORTAL_ROOM = new Color('#070809'); // near-black gate-room walls/ceiling (dark hallway read)

const GATE_GAP = 0.14; // angular half-gap cut in the wall at each gate (portal opening)
const PORTAL_DEPTH = 9; // how far the spawn chamber extends out through the wall

const GATE_HALF_WIDTH = 4.6; // opening half-width — wide enough for the boss (r 2.4)
const GATE_HEIGHT = 6.5;
const DOOR_OPEN_RANGE = 7; // a telegraphing enemy within this of a gate opens it
const DOOR_HOLD = 1.8; // standby seconds a gate stays open after the last spawn clears,
// so brief gaps BETWEEN sub-spawns of one wave don't slam it shut + reopen (screen hectic)

function mat(color: Color, roughness = 0.85, metalness = 0.12): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness, metalness });
}

/** Module-scoped handle to the projectile light buffer, set before an ArenaView is
 *  built. `litMat` bakes its emissive sample into floor/wall materials so tracers
 *  spill light onto them. Null → plain materials (e.g. headless/tests). */
let activeLightBuffer: LightBuffer | null = null;
export function setArenaLightBuffer(lb: LightBuffer | null): void {
  activeLightBuffer = lb;
}

/** A surface material that receives projectile light: a node-material clone of
 *  `mat` whose emissive is the light buffer's world-XZ sample. Falls back to a
 *  plain standard material when no light buffer is wired. Same APPEARANCE key for
 *  identical args, so the static batcher still merges these into one draw. */
function litMat(color: Color, roughness = 0.85, metalness = 0.12): MeshStandardMaterial {
  if (!activeLightBuffer) return mat(color, roughness, metalness);
  const m = new MeshStandardNodeMaterial();
  m.color = color;
  m.roughness = roughness;
  m.metalness = metalness;
  m.emissiveNode = activeLightBuffer.emissiveNode();
  return m as unknown as MeshStandardMaterial;
}

// Mark a flat gate/floor piece as a DECAL: drawn before the movers and with depth-
// write OFF, so a player / projectile / enemy / blood splat is never occluded by it
// under the angled camera. Floors sit at renderOrder -2 (below decals at -1), and
// everything that moves stays at the default 0 → always painted on top. "Nothing
// running around ever renders below the floor."
const FLOOR_ORDER = -2;
const DECAL_ORDER = -1;
function asFloorDecal(m: Mesh): void {
  m.renderOrder = DECAL_ORDER;
  const material = m.material;
  if (!Array.isArray(material)) {
    // Pure floor underlay: write NO depth and test NO depth, so it occludes nothing
    // that moves (drawn early via renderOrder, painted over by every mover). Matches
    // how the projectile glow stays unoccluded — but inverted (always BELOW movers).
    material.depthWrite = false;
    material.depthTest = false;
  }
}

function outlineHull(mesh: Mesh, thickness: number): void {
  const hull = new Mesh(
    mesh.geometry,
    new MeshStandardMaterial({ color: OUTLINE, side: BackSide }),
  );
  hull.scale.multiplyScalar(1 + thickness);
  mesh.add(hull);
}

interface GateDoors {
  cx: number; // opening centre at the wall (world)
  cz: number;
  tx: number; // tangent / slide axis (unit)
  tz: number;
  y: number; // vertical centre of the doors
  doorW: number; // half-width of each door (= its slide distance when fully open)
  mx: number; // inner mouth point (where enemies appear) — drives open detection
  mz: number;
  leftPivot: Group; // each door half pulls OUTWARD along ±tangent to open
  rightPivot: Group;
  open: number; // 0 closed … 1 open (animated)
  hold: number; // standby seconds left to stay open after the last spawn (anti-flicker)
  alert: number; // 0 base-colour … 1 red, SNAPS up when opening starts, eases back on close
  /** Emissive bits that blare red as the gate opens: door seams + the floor-edge sill.
   *  Each carries its own resting `base` colour + `intensity` so it lerps base→alert. */
  glowMats: { mat: MeshStandardMaterial; base: Color; intensity: number }[];
}

export class ArenaView {
  readonly group = new Group();
  private gates: GateDoors[] = [];
  private gateGlowT = 0; // time accumulator for the gate-open red-alert pulse
  private lights: Object3D[] = []; // scene-parented lights, tracked for dispose()
  private accent = new Color(activeArena().accent);

  constructor(scene: Scene) {
    const shape = activeArena().shape;
    if (shape.kind === 'rect') {
      this.buildRect(shape.halfW, shape.halfZ, scene);
    } else {
      this.buildFloor();
      this.buildWallAndCrowd();
      this.buildEmblem();
      for (let i = 0; i < GATE_COUNT; i++) this.buildGate((i / GATE_COUNT) * Math.PI * 2);
      this.buildLighting(scene);
    }
    // Collapse static geometry into one mesh per material (animated doors, if any,
    // are tagged batchDynamic and left untouched).
    batchStatic(this.group, { skip: (o) => o.userData.batchDynamic === true });
    scene.add(this.group);
  }

  /** Remove this arena from the scene (for live arena switching). */
  dispose(scene: Scene): void {
    scene.remove(this.group);
    for (const l of this.lights) scene.remove(l);
    this.lights.length = 0;
  }

  private addLight(scene: Scene, l: Object3D): void {
    this.lights.push(l);
    scene.add(l);
  }

  /** A 16:9 rectangular pit — blue-lit so it reads instantly distinct from the
   *  warm Rust Crown. Floor grid + raised accent rim + perimeter walls + four
   *  gate recesses at the side midpoints (static; no animated doors yet). */
  private buildRect(halfW: number, halfZ: number, scene: Scene): void {
    // Floor.
    const floor = new Mesh(new PlaneGeometry(halfW * 2, halfZ * 2), litMat(FLOOR, 0.95, 0.04));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.renderOrder = FLOOR_ORDER; // floor below all decals + movers
    this.group.add(floor);

    // Floor grid lines (panel seams) — faint emissive so they read on the dark floor.
    const lineMat = new MeshStandardMaterial({
      color: FLOOR_LINE,
      emissive: this.accent,
      emissiveIntensity: 0.12,
      roughness: 0.7,
      metalness: 0.1,
    });
    const grid = 6;
    for (let i = 1; i < grid; i++) {
      const fx = -halfW + (i / grid) * halfW * 2;
      const vline = new Mesh(new BoxGeometry(0.12, 0.06, halfZ * 2), lineMat);
      vline.position.set(fx, 0.03, 0);
      this.group.add(vline);
    }
    for (let i = 1; i < grid; i++) {
      const fz = -halfZ + (i / grid) * halfZ * 2;
      const hline = new Mesh(new BoxGeometry(halfW * 2, 0.06, 0.12), lineMat);
      hline.position.set(0, 0.03, fz);
      this.group.add(hline);
    }
    // Centre marker.
    const centre = new Mesh(new RingGeometry(2.4, 2.7, 48), lineMat);
    centre.rotation.x = -Math.PI / 2;
    centre.position.y = 0.04;
    this.group.add(centre);

    // Raised blue accent rim around the floor edge (the arena's highlight colour).
    const rimMat = new MeshStandardMaterial({
      color: this.accent,
      emissive: this.accent,
      emissiveIntensity: 0.55,
      roughness: 0.4,
      metalness: 0.2,
    });
    const rimT = 0.25; // band thickness — halved (was 0.5, read too chunky)
    const rimH = 0.35;
    const gateHalf = 5; // opening half-width at each side midpoint (rim + walls break here)
    // The accent rim BREAKS at each gate (a gap of ±gateHalf at every side midpoint)
    // instead of running unbroken around the floor — so the gate + its doors read as
    // their own thing, not buried under the perimeter band. Two segments per side.
    const rimSeg = (x: number, z: number, w: number, d: number): void => {
      const r = new Mesh(new BoxGeometry(w, rimH, d), rimMat);
      r.position.set(x, rimH / 2, z);
      this.group.add(r);
    };
    const segX = halfW + rimT / 2 - gateHalf; // side-along-x segment length (corner → gate)
    const cX = (gateHalf + halfW + rimT / 2) / 2;
    for (const sz of [halfZ, -halfZ]) {
      rimSeg(cX, sz, segX, rimT);
      rimSeg(-cX, sz, segX, rimT);
    }
    const segZ = halfZ + rimT / 2 - gateHalf; // side-along-z segment length
    const cZ = (gateHalf + halfZ + rimT / 2) / 2;
    for (const sx of [halfW, -halfW]) {
      rimSeg(sx, cZ, rimT, segZ);
      rimSeg(sx, -cZ, rimT, segZ);
    }

    // Perimeter walls (gunmetal slabs just outside the rim), with gate gaps at the
    // side midpoints. Built as boxes; BackSide isn't needed since the camera looks
    // down and in.
    const wallMat = litMat(new Color('#2b3038'), 0.85, 0.25);
    const wallH = 5;
    const wallSeg = (cx: number, cz: number, w: number, d: number): void => {
      const m = new Mesh(new BoxGeometry(w, wallH, d), wallMat);
      m.position.set(cx, wallH / 2, cz);
      m.castShadow = true;
      this.group.add(m);
    };
    const t = 1.2; // wall thickness
    const off = 0.9; // sit just beyond the rim
    // Top/bottom walls (along x) split around the centre gate. The NEAR side (+z, the
    // camera sits south of the pit) is CULLED — its tall slabs occluded the south gate
    // + buried the near floor edge. The south GATEHOUSE still stands (built below), so
    // the gate reads; only the flanking wall slabs are dropped (fixed-cam, the missing
    // near wall never frames into view — the far wall is the backdrop).
    for (const sz of [halfZ + off, -(halfZ + off)]) {
      if (sz > 0) continue; // skip the near (south) wall — camera looks in over it
      const segW = halfW - gateHalf;
      wallSeg((halfW + gateHalf) / 2, sz, segW, t);
      wallSeg(-(halfW + gateHalf) / 2, sz, segW, t);
    }
    // Left/right walls (along z) split around the centre gate. The NEAR (+z) halves are
    // culled too so the south corners open up and the near floor edge reads; the far
    // (−z) halves stay as the backdrop frame.
    for (const sx of [halfW + off, -(halfW + off)]) {
      const segD = halfZ - gateHalf;
      wallSeg(sx, -(halfZ + gateHalf) / 2, t, segD);
    }
    // Detailed gatehouses at the four side midpoints (gate 0=+x,1=+z,2=−x,3=−z).
    for (let g = 0; g < 4; g++) this.buildRectGate(g, halfW, halfZ, off, gateHalf, wallH);

    this.buildRectLighting(scene, halfW, halfZ);
  }

  /** One rectangular gatehouse: a recessed dark tunnel, two side pillars, a heavy
   *  lintel, and accent glow on the lintel top + floor threshold — built structure,
   *  not a flat slab. All pieces are deliberately NON-coplanar (no z-fighting), and
   *  the group is oriented so the opening faces the arena centre. */
  private buildRectGate(
    gate: number,
    halfW: number,
    halfZ: number,
    off: number,
    gateHalf: number,
    wallH: number,
  ): void {
    const horizontal = gate === 1 || gate === 3; // +z / −z gates run along x
    const sign = gate === 0 || gate === 1 ? 1 : -1;
    // The +z gate (1) is the CAMERA-SIDE gate: its roof (lintel) + back wall sit
    // between the oblique camera and the opening, hiding the seam + floor glow. Drop
    // those occluders for this one gate so its red-alert glow reads (the pillars + sills
    // + doors stay, so it's still clearly a gate).
    const nearGate = gate === 1;
    const g = new Group();
    // Local frame: opening faces −z (toward arena centre), gap spans local x =
    // ±gateHalf, tunnel depth runs +z (outward). Rotate each gate so −z points in.
    if (horizontal) {
      g.position.set(0, 0, sign * (halfZ + off));
      g.rotation.y = sign > 0 ? 0 : Math.PI; // +z gate faces −z already; −z gate flips
    } else {
      g.position.set(sign * (halfW + off), 0, 0);
      g.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2; // +x faces −x (inward), −x faces +x
    }

    const steel = mat(new Color('#2b3038'), 0.8, 0.3);
    const dark = mat(new Color('#050608'), 0.7, 0.2); // near-black recess — a dark hallway behind the gate
    const glowMat = new MeshStandardMaterial({
      color: this.accent,
      emissive: this.accent,
      emissiveIntensity: 1.0,
      roughness: 0.4,
      metalness: 0.3,
    });

    // Recessed tunnel behind the wall (reads as depth). Skipped on the near gate —
    // it's a tall camera-side occluder for that one.
    if (!nearGate) {
      const back = new Mesh(new BoxGeometry(gateHalf * 2, wallH, 0.6), dark);
      back.position.set(0, wallH / 2, 3.4);
      g.add(back);
    }
    const tunFloor = new Mesh(new PlaneGeometry(gateHalf * 2, 3.6), dark);
    tunFloor.rotation.x = -Math.PI / 2;
    tunFloor.position.set(0, 0.06, 1.7);
    g.add(tunFloor);

    // Side pillars flanking the gap (inner face at ±gateHalf), sitting in the wall.
    for (const sx of [-1, 1]) {
      const pillar = new Mesh(new BoxGeometry(1.2, wallH, 1.6), steel);
      pillar.position.set(sx * (gateHalf + 0.6), wallH / 2, 0.4);
      pillar.castShadow = true;
      this.outlineProp(pillar);
      g.add(pillar);
    }

    // Lintel: INTERSECTS the pillars (overlapping solids, no shared face) so its
    // bottom (wallH−0.3) sits inside them and its top is clear above. Skipped on the
    // near gate — it's the "roof" that hid this gate's glow from the camera.
    if (!nearGate) {
      const lintel = new Mesh(new BoxGeometry(gateHalf * 2 + 2.8, 1.4, 1.8), steel);
      lintel.position.set(0, wallH + 0.4, 0.4);
      lintel.castShadow = true;
      this.outlineProp(lintel);
      g.add(lintel);
    }
    // (Removed the top accent glow bar over the lintel — it read as a bright edge on
    // the inner gate frame; the seam stripes + sill carry the accent now.)
    // Accent strip on the INWARD face of the lintel (offset in −z past the face).
    // (Removed the top inward-face accent strip — another glowing top edge on the
    // gate frame; the seam stripes + sill carry the accent now.)
    // Floor + ceiling threshold glow where the tunnel meets the arena. SAME material
    // (glowMat) so both inherit the open/close blue→red tint from one source.
    const sill = new Mesh(new BoxGeometry(gateHalf * 2, 0.14, 0.3), glowMat);
    sill.position.set(0, 0.1, -0.2);
    sill.userData.batchDynamic = true; // live material (per-gate red tint) — never batch
    g.add(sill);
    // Ceiling sill mirrors the floor — but SKIP it on the near gate: with its lintel
    // culled it would float at the top of the opening and clutter the read of what's
    // walking through the bottom gate.
    if (!nearGate) {
      const sillTop = new Mesh(new BoxGeometry(gateHalf * 2, 0.14, 0.3), glowMat);
      sillTop.position.set(0, wallH - 0.4, -0.2); // just under the lintel — mirrors the floor sill
      sillTop.userData.batchDynamic = true;
      g.add(sillTop);
    }

    // Two sliding door halves over the gap. Parented to the gate group (already
    // oriented), so in LOCAL space the slide axis is +x and faceY = 0. World mouth
    // point (just inside the wall) drives the open/close animation.
    const mx = horizontal ? 0 : sign * (halfW - 1.5);
    const mz = horizontal ? sign * (halfZ - 1.5) : 0;
    const gateDoors = this.addSlidingDoors({
      parent: g,
      cx: 0,
      cz: -0.3, // sit at the arena-side face of the gap
      tx: 1,
      tz: 0,
      y: wallH / 2,
      doorW: gateHalf + 0.2,
      doorH: wallH - 0.5, // a touch shorter than the wall so the door TOP face never
      // sits coplanar with the wall top as it slides under (z-fight on top); the lintel
      // covers the small gap.
      faceY: 0,
      localXSign: 1, // g-local: local +x = +tangent (no rotation flip)
      mx,
      mz,
    });
    // The floor-edge sill blares red with the doors (shares the open/close tint).
    gateDoors.glowMats.push({ mat: glowMat, base: this.accent.clone(), intensity: 1.0 });

    this.group.add(g);
  }

  /** Thin inverted-hull ink outline on a prop (matches the hero/arena outline). */
  private outlineProp(mesh: Mesh): void {
    outlineHull(mesh, OUTLINE_W.prop);
  }

  /** Cool key + blue rim lighting for the Cold Vault (keeps the floor low-contrast
   *  so saturated combat accents win, art-doc accent discipline). */
  private buildRectLighting(scene: Scene, halfW: number, halfZ: number): void {
    this.addLight(scene, new AmbientLight('#2a3340', 0.85));
    const key = new DirectionalLight('#dce8ff', 1.5);
    key.position.set(halfW * 0.5, 60, halfZ * 0.4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const cam = key.shadow.camera;
    cam.left = -halfW - 6;
    cam.right = halfW + 6;
    cam.top = halfZ + 6;
    cam.bottom = -halfZ - 6;
    cam.near = 10;
    cam.far = 160;
    cam.updateProjectionMatrix();
    this.addLight(scene, key);
    const rim = new DirectionalLight(activeArena().accent, 0.5);
    rim.position.set(-halfW, 20, -halfZ);
    this.addLight(scene, rim);
    const fill = new PointLight('#3a4a66', 0.6, 200);
    fill.position.set(0, 30, 0);
    this.addLight(scene, fill);
  }

  private buildFloor(): void {
    const disc = new Mesh(new CircleGeometry(ARENA_RADIUS, 96), mat(FLOOR, 0.95, 0.04));
    disc.rotation.x = -Math.PI / 2;
    disc.receiveShadow = true;
    disc.renderOrder = FLOOR_ORDER; // floor below all decals + movers
    this.group.add(disc);

    // Concentric inlay rings + radial seams break up the flat floor (readable).
    const ring = (inner: number, outer: number, color: Color, y: number): void => {
      const m = new Mesh(new RingGeometry(inner, outer, 128), mat(color, 0.9, 0.06));
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      m.receiveShadow = true;
      this.group.add(m);
    };
    ring(ARENA_RADIUS * 0.24, ARENA_RADIUS * 0.255, FLOOR_LINE, 0.03);
    ring(ARENA_RADIUS * 0.5, ARENA_RADIUS * 0.515, FLOOR_LINE, 0.028);
    ring(ARENA_RADIUS * 0.74, ARENA_RADIUS * 0.752, FLOOR_PANEL, 0.024);
    ring(ARENA_RADIUS * 0.9, ARENA_RADIUS * 0.912, TRIM, 0.02); // thin gold boundary

    // Radial seams: wider + a low raised ridge so the key light rakes one face
    // (cheap "normal" read), with a faint emissive so bloom kisses the edge and
    // they actually read against the dusty floor. One shared material (24 seams).
    const len = ARENA_RADIUS * 0.7;
    const midR = ARENA_RADIUS * 0.2 + len * 0.5;
    const seamGeo = new BoxGeometry(0.2, 0.09, len);
    const seamMat = new MeshStandardMaterial({
      color: FLOOR_LINE,
      emissive: FLOOR_LINE,
      emissiveIntensity: 0.18,
      roughness: 0.6,
      metalness: 0.1,
    });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const seam = new Mesh(seamGeo, seamMat);
      seam.position.set(Math.cos(a) * midR, 0.03, Math.sin(a) * midR);
      seam.rotation.y = Math.PI / 2 - a;
      seam.castShadow = true;
      seam.receiveShadow = true;
      this.group.add(seam);
    }
  }

  private buildEmblem(): void {
    // Centre mark = a thin inner RING on the floor (a "centre circle"). Smooth +
    // low emissive so it reads as a flat marking, never a fixture.
    const ring = new Mesh(
      new RingGeometry(ARENA_RADIUS * 0.13, ARENA_RADIUS * 0.143, 96),
      new MeshStandardMaterial({
        color: FLOOR_LINE,
        emissive: COL.brass,
        emissiveIntensity: 0.12,
        roughness: 0.8,
        metalness: 0.1,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    ring.receiveShadow = true;
    this.group.add(ring);
  }

  private buildWallAndCrowd(): void {
    // Outer wall: a taller banked ring with vertical buttresses → mass + shadow.
    // Built as four ARCS with a gap at each gate so you can see THROUGH the
    // opening into the recessed portal tunnel (the wall no longer caps the mouth).
    const wallMat = new MeshStandardMaterial({
      color: WALL,
      roughness: 0.85,
      metalness: 0.2,
      side: BackSide,
    });
    const span = (Math.PI * 2) / GATE_COUNT;
    for (let g = 0; g < GATE_COUNT; g++) {
      const start = g * span + GATE_GAP;
      const len = span - GATE_GAP * 2;
      const wall = new Mesh(
        new CylinderGeometry(ARENA_RADIUS + 2.6, ARENA_RADIUS + 1.8, 5.5, 26, 1, true, start, len),
        wallMat,
      );
      wall.position.y = 2.75;
      wall.receiveShadow = true;
      this.group.add(wall);

      // Lip arc. RingGeometry rotated -π/2 sweeps clockwise in world, so mirror
      // thetaStart (−(start+len)) to land the gap on the same arc as the wall.
      const lip = new Mesh(
        new RingGeometry(ARENA_RADIUS + 2.4, ARENA_RADIUS + 3.4, 26, 1, -(start + len), len),
        mat(STEEL, 0.7, 0.4),
      );
      lip.rotation.x = -Math.PI / 2;
      lip.position.y = 5.5;
      this.group.add(lip);
    }

    // Buttress ribs around the wall — but SKIP the gate openings so nothing pokes
    // through a gatehouse (the gate clip the player saw).
    const gateSkip = 0.32; // rad on either side of each cardinal gate
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      if (this.nearGate(a, gateSkip)) continue;
      const rib = new Mesh(
        new BoxGeometry(0.5, 5.4, 0.9),
        mat(i % 2 ? STEEL : STEEL_DARK, 0.8, 0.35),
      );
      rib.position.set(Math.cos(a) * (ARENA_RADIUS + 2.3), 2.7, Math.sin(a) * (ARENA_RADIUS + 2.3));
      rib.rotation.y = -a;
      rib.castShadow = true;
      rib.receiveShadow = true;
      this.group.add(rib);
    }

    // Spectator tier: a dark raised band suggesting a packed, unlit crowd.
    const tier = new Mesh(
      new CylinderGeometry(ARENA_RADIUS + 9, ARENA_RADIUS + 4, 4, 64, 1, true),
      new MeshStandardMaterial({ color: CROWD, roughness: 1, metalness: 0, side: BackSide }),
    );
    tier.position.y = 6.5;
    this.group.add(tier);
  }

  /** True if angle `a` is within `tol` of any cardinal gate angle. */
  private nearGate(a: number, tol: number): boolean {
    for (let g = 0; g < GATE_COUNT; g++) {
      const ga = (g / GATE_COUNT) * Math.PI * 2;
      const d = Math.abs(((a - ga + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d < tol) return true;
    }
    return false;
  }

  private buildGate(angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tx = -sin; // tangent (door slide axis)
    const tz = cos;
    const wallR = ARENA_RADIUS + 1.2;
    const cx = cos * wallR;
    const cz = sin * wallR;
    const faceY = Math.PI / 2 - angle; // face the arena centre

    // Approach apron on the floor inside the gate (hazard-striped landing). It's
    // FLOOR — flush + flagged as a decal so a mover (player/projectile/enemy) is
    // never occluded by it under the angled camera (nothing on the floor renders
    // over things running around). asFloorDecal: low + depthWrite off + drawn first.
    const apron = new Mesh(
      new BoxGeometry(GATE_HALF_WIDTH * 2 + 1, 0.04, 8),
      mat(STEEL_DARK, 0.85, 0.3),
    );
    const apronR = ARENA_RADIUS - 3.5;
    apron.position.set(cos * apronR, 0.02, sin * apronR);
    apron.rotation.y = faceY;
    apron.receiveShadow = true;
    asFloorDecal(apron);
    this.group.add(apron);
    for (const o of [-(GATE_HALF_WIDTH - 0.6), GATE_HALF_WIDTH - 0.6]) {
      const stripe = new Mesh(new BoxGeometry(0.4, 0.05, 7), mat(TRIM, 0.7, 0.1));
      stripe.position.set(cos * apronR + tx * o, 0.045, sin * apronR + tz * o);
      stripe.rotation.y = faceY;
      asFloorDecal(stripe);
      this.group.add(stripe);
    }

    // Gatehouse frame: two pillars + a lintel forming a tall opening.
    const pillar = (side: number): void => {
      const px = cx + tx * side * (GATE_HALF_WIDTH + 0.7);
      const pz = cz + tz * side * (GATE_HALF_WIDTH + 0.7);
      const p = new Mesh(new BoxGeometry(1.4, GATE_HEIGHT + 1.5, 2.6), mat(STEEL, 0.75, 0.45));
      p.position.set(px, (GATE_HEIGHT + 1.5) / 2, pz);
      p.rotation.y = faceY;
      p.castShadow = true;
      p.receiveShadow = true;
      outlineHull(p, OUTLINE_W.prop);
      this.group.add(p);
      const cap = new Mesh(new BoxGeometry(1.7, 0.6, 3), mat(TRIM, 0.6, 0.5));
      cap.position.set(px, GATE_HEIGHT + 1.5, pz);
      cap.rotation.y = faceY;
      this.group.add(cap);
    };
    pillar(-1);
    pillar(1);

    // Recessed portal tunnel behind the doors: a dark room extending OUTWARD
    // through the wall gap, so the gate reads as a real opening you can see into.
    // Enemies spawn inside it (behind the blast doors) and march out through the
    // gate (T37/T40 walk-in). Floor + ceiling + side walls + a faintly glowing
    // back wall, with an inner light that silhouettes enemies as they emerge.
    // The chamber is WIDER than the opening, so through the gate you peek into a
    // real room (not a corridor). Opening stays GATE_HALF_WIDTH; the room flares.
    const roomHalf = GATE_HALF_WIDTH + 1.6;
    const innerMid = ARENA_RADIUS + 1.0 + PORTAL_DEPTH / 2;
    const backR = ARENA_RADIUS + 1.0 + PORTAL_DEPTH;

    const tFloor = new Mesh(
      new BoxGeometry(roomHalf * 2, 0.2, PORTAL_DEPTH),
      mat(PORTAL_FLOOR, 1, 0.05),
    );
    tFloor.position.set(cos * innerMid, -0.02, sin * innerMid);
    tFloor.rotation.y = faceY;
    tFloor.receiveShadow = true;
    this.group.add(tFloor);

    // Glowing threshold strip on the room floor at the door line — marks where
    // they emerge, and adds a warm read to the chamber.
    const sillMat = new MeshStandardMaterial({
      color: new Color(PORTAL_GLOW),
      emissive: new Color(PORTAL_GLOW),
      emissiveIntensity: 0.6,
    });
    const sill = new Mesh(new BoxGeometry(GATE_HALF_WIDTH * 2, 0.05, 0.5), sillMat);
    sill.position.set(cos * (ARENA_RADIUS + 1.4), 0.045, sin * (ARENA_RADIUS + 1.4));
    sill.rotation.y = faceY;
    asFloorDecal(sill);
    sill.userData.batchDynamic = true; // live material (per-gate red tint) — never batch
    this.group.add(sill);
    // Matching CEILING strip at the top of the opening — same material → same tint.
    const sillTop = new Mesh(new BoxGeometry(GATE_HALF_WIDTH * 2, 0.05, 0.5), sillMat);
    sillTop.position.set(
      cos * (ARENA_RADIUS + 1.4),
      GATE_HEIGHT - 0.45,
      sin * (ARENA_RADIUS + 1.4),
    );
    sillTop.rotation.y = faceY;
    sillTop.userData.batchDynamic = true;
    this.group.add(sillTop);

    const ceil = new Mesh(
      new BoxGeometry(roomHalf * 2 + 0.8, 0.8, PORTAL_DEPTH),
      mat(PORTAL_ROOM, 1, 0.1),
    );
    ceil.position.set(cos * innerMid, GATE_HEIGHT + 0.1, sin * innerMid);
    ceil.rotation.y = faceY;
    ceil.castShadow = true;
    this.group.add(ceil);

    for (const side of [-1, 1]) {
      const sw = new Mesh(
        new BoxGeometry(0.8, GATE_HEIGHT + 0.4, PORTAL_DEPTH),
        mat(PORTAL_ROOM, 1, 0.12),
      );
      sw.position.set(
        cos * innerMid + tx * side * (roomHalf + 0.4),
        (GATE_HEIGHT + 0.4) / 2,
        sin * innerMid + tz * side * (roomHalf + 0.4),
      );
      sw.rotation.y = faceY;
      sw.receiveShadow = true;
      this.group.add(sw);
    }

    const back = new Mesh(
      new BoxGeometry(roomHalf * 2 + 0.8, GATE_HEIGHT + 0.4, 0.8),
      new MeshStandardMaterial({
        color: PORTAL_BACK,
        emissive: PORTAL_GLOW,
        emissiveIntensity: 0.28, // faint ember at the end of the dark hallway
        roughness: 1,
      }),
    );
    back.position.set(cos * backR, (GATE_HEIGHT + 0.4) / 2, sin * backR);
    back.rotation.y = faceY;
    this.group.add(back);

    // Inner light: a FAINT ominous ember deep in the chamber that just backlights
    // enemies as they emerge — kept low so the gate reads as a DARK hallway, not a
    // lit alcove (was 18 → washed the recess out to wall brightness).
    const portalLight = new PointLight(PORTAL_GLOW, 5, 18, 2);
    portalLight.position.set(cos * (backR - 1.8), GATE_HEIGHT * 0.5, sin * (backR - 1.8));
    this.group.add(portalLight);

    // Jamb slabs flush with the wall, flanking the opening — mask the buttress
    // seam beside the pillars WITHOUT covering the opening itself.
    for (const side of [-1, 1]) {
      const jamb = new Mesh(
        new BoxGeometry(3.0, GATE_HEIGHT + 2.4, 1.4),
        mat(STEEL_DARK, 0.85, 0.3),
      );
      jamb.position.set(
        cos * (ARENA_RADIUS + 1.6) + tx * side * (GATE_HALF_WIDTH + 2.2),
        (GATE_HEIGHT + 2.4) / 2,
        sin * (ARENA_RADIUS + 1.6) + tz * side * (GATE_HALF_WIDTH + 2.2),
      );
      jamb.rotation.y = faceY;
      jamb.castShadow = true;
      jamb.receiveShadow = true;
      this.group.add(jamb);
    }

    const lintel = new Mesh(
      new BoxGeometry(GATE_HALF_WIDTH * 2 + 2.8, 1.0, 2.6), // slimmer roof beam (was 1.6 — too thick)
      mat(STEEL_LIT, 0.7, 0.5),
    );
    lintel.position.set(cx, GATE_HEIGHT + 0.1, cz);
    lintel.rotation.y = faceY;
    lintel.castShadow = true;
    outlineHull(lintel, OUTLINE_W.prop);
    this.group.add(lintel);

    // Gate number plate (glowing) on the lintel.
    const plate = new Mesh(
      new BoxGeometry(2, 0.9, 0.2),
      new MeshStandardMaterial({ color: TRIM, emissive: TRIM, emissiveIntensity: 0.5 }),
    );
    plate.position.set(cx - cos * 1.4, GATE_HEIGHT + 0.3, cz - sin * 1.4);
    plate.rotation.y = faceY;
    this.group.add(plate);

    // Two blast-door halves that PULL APART along the tangent (one ±, one ∓) to open
    // and meet at the centre to close. The inner (seam) edges carry the accent stripe.
    const mouthR = ARENA_RADIUS - 1.5;
    const gate = this.addSlidingDoors({
      parent: this.group,
      cx,
      cz,
      tx,
      tz,
      y: GATE_HEIGHT / 2,
      doorW: GATE_HALF_WIDTH + 0.2,
      doorH: GATE_HEIGHT - 0.4, // door TOP stays below the frame top → no coplanar z-fight
      faceY,
      localXSign: -1, // faceY = π/2 − angle flips local +x → −tangent
      mx: cos * mouthR,
      mz: sin * mouthR,
    });
    // The floor-edge threshold sill blares red with the doors (resting warm portal glow).
    gate.glowMats.push({ mat: sillMat, base: new Color(PORTAL_GLOW), intensity: 0.6 });

    // Two angled spotlights from the gate's arena-facing top corners, coning down
    // onto the approach plate — fakes volumetric beams + lights the entry so new
    // enemies read as they walk in (§3.1 subtle reactive arena).
    // Two UPLIGHTS at the front (arena-side) corners of the entry plate, raking
    // up at the gate. Casts dramatic shadows up the walls and silhouettes enemies
    // as they pass through the beam — more alive than a flat top-down wash.
    const aim = new Object3D();
    aim.position.set(cos * (ARENA_RADIUS + 0.5), GATE_HEIGHT * 0.6, sin * (ARENA_RADIUS + 0.5));
    this.group.add(aim);
    const plateFrontR = apronR - 3.6; // front edge of the plate, toward the arena
    for (const side of [-1, 1]) {
      const spot = new SpotLight('#ffcf9a', 40, 28, 0.34, 0.4, 1.3);
      spot.position.set(
        cos * plateFrontR + tx * side * (GATE_HALF_WIDTH - 0.3),
        0.45,
        sin * plateFrontR + tz * side * (GATE_HALF_WIDTH - 0.3),
      );
      spot.target = aim;
      spot.castShadow = false; // entry uplights light the gate; shadows here are noisy + costly
      this.group.add(spot);
    }
  }

  /** Build the two sliding door halves for ONE gate (either arena) and register it
   *  for animation. Each half is a pivot Group placed at its closed position; opening
   *  pulls it OUTWARD along ±tangent (placeDoors). The inner (seam) edge of each half
   *  carries the emissive accent stripe so the two-piece open/close reads clearly. */
  private addSlidingDoors(o: {
    parent: Group; // world group (circle) OR the gate's local group (rect, pre-oriented)
    cx: number; // all coords below are in the PARENT'S frame
    cz: number;
    tx: number;
    tz: number;
    y: number;
    doorW: number;
    doorH: number;
    faceY: number;
    /** Sign mapping the door's LOCAL +x to the +tangent direction (circle's faceY
     *  flips it, the rect's doesn't). Used to place the seam on the inner edge — the
     *  door itself is centred on the pivot so coverage is sign-independent. */
    localXSign: number;
    mx: number; // mouth point is WORLD (compared against enemy positions)
    mz: number;
  }): GateDoors {
    const glowMats: GateDoors['glowMats'] = []; // door seams (+ caller's sill) for the tint
    const makeDoor = (sideSign: number): Group => {
      const pivot = new Group();
      pivot.userData.batchDynamic = true; // animated (slides open) — never batch it
      pivot.rotation.y = o.faceY; // position is set by placeDoors
      const d = new Mesh(new BoxGeometry(o.doorW, o.doorH, 1), mat(DOOR, 0.6, 0.65));
      d.castShadow = true;
      d.receiveShadow = true;
      d.position.x = 0; // CENTRED on the pivot → placeDoors puts the pivot at the door
      // centre, so both halves meet at the gate centre when closed (no rotation-sign trap)
      // (Removed the gold hazard chevrons on the door face — read as flat clutter.)
      // Emissive arena-accent stripe down the door's INNER (seam) edge — the key
      // open/close read: CLOSED, the two stripes meet at the centre as one bright bar;
      // as the halves pull apart the bars separate + travel to the pillars. Slightly
      // proud of the door (depth 1.06 vs 1) so it reads as a lit edge from any angle.
      const seamMat = new MeshStandardMaterial({
        color: this.accent.clone(),
        emissive: this.accent.clone(),
        emissiveIntensity: 1.2,
        roughness: 0.4,
      });
      glowMats.push({ mat: seamMat, base: this.accent.clone(), intensity: 1.2 });
      const seam = new Mesh(new BoxGeometry(0.2, o.doorH - 0.2, 1.06), seamMat);
      // Inner (gate-centre-facing) edge in LOCAL x: the +tangent edge for the left
      // half, −tangent for the right, mapped through localXSign.
      seam.position.set((-sideSign * o.localXSign * o.doorW) / 2, 0, 0);
      d.add(seam);
      outlineHull(d, OUTLINE_W.prop);
      pivot.add(d);
      o.parent.add(pivot);
      return pivot;
    };
    const gate: GateDoors = {
      cx: o.cx,
      cz: o.cz,
      tx: o.tx,
      tz: o.tz,
      y: o.y,
      doorW: o.doorW,
      mx: o.mx,
      mz: o.mz,
      leftPivot: makeDoor(-1),
      rightPivot: makeDoor(1),
      open: 0,
      hold: 0,
      alert: 0,
      glowMats,
    };
    this.gates.push(gate);
    this.placeDoors(gate, 0);
    return gate;
  }

  /** Open amount (0 closed → 1 open) slides each half OUTWARD along the tangent by up
   *  to a full door-width, so the two pieces part from the centre and tuck toward the
   *  pillars. The seam stripes travel with them, selling the pull-apart. */
  private placeDoors(g: GateDoors, open: number): void {
    // Each pivot sits at its door's CENTRE along the tangent. Closed (slide 0): the
    // centres are ∓doorW/2, so each half (width doorW, centred) spans out to the gate
    // centre — the two MEET at 0. Opening slides each centre out by the OPENING half-
    // width (doorW − 0.2, the 0.2 being the closed overlap), so the inner edge + its
    // glowing seam stop exactly AT the opening edge — never sliding past into the wall
    // (which over-slid by a notch + buried the seam, and z-fought the coplanar wall).
    const half = g.doorW / 2;
    const slide = open * (g.doorW - 0.2);
    const lo = -(half + slide); // left door centre
    const ro = half + slide; // right door centre
    g.leftPivot.position.set(g.cx + g.tx * lo, g.y, g.cz + g.tz * lo);
    g.rightPivot.position.set(g.cx + g.tx * ro, g.y, g.cz + g.tz * ro);
  }

  /** Animate gate doors: open while an enemy is telegraphing near the gate (T37). */
  update(enemies: EnemyPool, dt: number): void {
    this.gateGlowT += dt; // drives the red-alert pulse while a gate is ajar
    for (const g of this.gates) {
      let wantOpen = false;
      const r2 = DOOR_OPEN_RANGE * DOOR_OPEN_RANGE;
      // Inner mouth of the gate (where enemies appear) — stored per gate (shape-agnostic).
      const mx = g.mx;
      const mz = g.mz;
      for (let i = 0; i < enemies.count; i++) {
        const dx = enemies.posX[i]! - mx;
        const dz = enemies.posZ[i]! - mz;
        if (dx * dx + dz * dz >= r2) continue;
        // Hold the gate open ONLY for THIS emission: enemies still spawning
        // (Telegraph) or freshly active and still MARCHING IN from the gate
        // (entryEase > 0). Once the last spawned unit has cleared the throat its
        // ease expires → close. An enemy merely FIGHTING near the gate (entryEase 0)
        // no longer pins it open (that's why it lingered).
        if (enemies.state[i] === EnemyState.Telegraph) {
          wantOpen = true;
          break;
        }
        if (enemies.entryEase[i]! > 0) wantOpen = true; // still walking through
      }
      // STANDBY hold: keep the gate open for DOOR_HOLD seconds after the last spawn
      // clears, so the brief gaps between sub-spawns of one wave don't slam it shut +
      // reopen (the hectic flicker). Only a real lull closes it.
      if (wantOpen) g.hold = DOOR_HOLD;
      else g.hold = Math.max(0, g.hold - dt);
      const effOpen = wantOpen || g.hold > 0;

      const target = effOpen ? 1 : 0;
      const speed = effOpen ? 5 : 3.4; // open fast, snap shut once the hold expires
      g.open += (target - g.open) * Math.min(1, speed * dt);
      this.placeDoors(g, g.open);

      // Alert tint is DECOUPLED from the door slide: it snaps to red the instant the
      // opening starts (super-short fade) and eases back to base while closing — not a
      // gradual ramp tied to how far the door has slid. Stays red through the hold.
      const alertSpeed = effOpen ? 18 : 4;
      g.alert += ((effOpen ? 1 : 0) - g.alert) * Math.min(1, alertSpeed * dt);

      // Seam glow: the defined arena accent (calm blue) when shut → a blaring red
      // alert as it opens to spawn, hottest a touch before fully open, with a pulse
      // while ajar. Lerps back to blue as it closes. Sells the incoming-enemies cue.
      const heat = g.alert; // snaps red on open, eases to base on close
      // Slow, shallow breathe — present but not attention-grabbing (was fast + deep).
      const pulse = g.alert > 0.04 ? 0.92 + 0.08 * Math.sin(this.gateGlowT * 3.4) : 1;
      for (const gm of g.glowMats) {
        gm.mat.emissive.copy(gm.base).lerp(COL.gateAlert, heat);
        gm.mat.color.copy(gm.mat.emissive);
        gm.mat.emissiveIntensity = gm.intensity * (1 + 0.75 * g.open) * pulse;
      }
    }
  }

  private buildLighting(scene: Scene): void {
    this.addLight(scene, new AmbientLight('#46342a', 0.8));
    const key = new DirectionalLight('#ffe0b0', 2.3);
    key.position.set(20, 44, 12);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.00035;
    key.shadow.normalBias = 0.012;
    key.shadow.camera.left = -ARENA_RADIUS - 12;
    key.shadow.camera.right = ARENA_RADIUS + 12;
    key.shadow.camera.top = ARENA_RADIUS + 12;
    key.shadow.camera.bottom = -ARENA_RADIUS - 12;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 110;
    key.shadow.camera.updateProjectionMatrix();
    this.addLight(scene, key);
    const rim = new DirectionalLight('#3aa0ff', 0.85); // cool rim separates steel from floor
    rim.position.set(-26, 20, -22);
    this.addLight(scene, rim);
    const fill = new DirectionalLight('#c46a2b', 0.35);
    fill.position.set(0, 12, 30);
    this.addLight(scene, fill);
  }
}
