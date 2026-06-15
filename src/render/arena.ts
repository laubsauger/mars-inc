// Rust Crown arena render view (T5). Circular floor, outer wall, four gates,
// central emblem, lighting. V2: pure render view — holds no sim state.

import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  type Scene,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
} from 'three';
import { ARENA_RADIUS, GATE_COUNT } from '../sim/constants';
import { COL, OUTLINE as OUTLINE_W } from './art/palette';

const RUST = COL.oxidizedIron;
const FLOOR = COL.umberShadow;
const FLOOR_PANEL = COL.oldRust;
const FLOOR_LINE = COL.warmLine;
const EMBLEM = COL.brass;
const HAZARD = COL.kineticGold;
const OUTLINE = COL.nearBlack;

function addOutlineHull(mesh: Mesh, thickness: number): Mesh {
  // Inverted-hull outline (§11.3) for hero props. Render-only.
  const hull = new Mesh(
    mesh.geometry,
    new MeshStandardMaterial({ color: OUTLINE, side: BackSide }),
  );
  hull.scale.multiplyScalar(1 + thickness);
  mesh.add(hull);
  return hull;
}

function makeStandard(color: typeof COL.umberShadow, roughness = 0.85, metalness = 0.12) {
  return new MeshStandardMaterial({ color, roughness, metalness });
}

function addFloorDisc(
  group: Group,
  radius: number,
  color: typeof COL.umberShadow,
  y: number,
): Mesh {
  const disc = new Mesh(new CircleGeometry(radius, 96), makeStandard(color, 0.95, 0.04));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = y;
  disc.receiveShadow = true;
  group.add(disc);
  return disc;
}

function addFloorRing(
  group: Group,
  innerRadius: number,
  outerRadius: number,
  color: typeof COL.umberShadow,
  y: number,
): Mesh {
  const ring = new Mesh(
    new RingGeometry(innerRadius, outerRadius, 128),
    makeStandard(color, 0.9, 0.08),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = y;
  ring.receiveShadow = true;
  group.add(ring);
  return ring;
}

function addRadialInlay(
  group: Group,
  angle: number,
  startRadius: number,
  endRadius: number,
  width: number,
  color: typeof COL.umberShadow,
  y: number,
): Mesh {
  const length = endRadius - startRadius;
  const midRadius = startRadius + length * 0.5;
  const inlay = new Mesh(new BoxGeometry(width, 0.04, length), makeStandard(color, 0.92, 0.08));
  inlay.position.set(Math.cos(angle) * midRadius, y, Math.sin(angle) * midRadius);
  inlay.rotation.y = Math.PI / 2 - angle;
  inlay.receiveShadow = true;
  group.add(inlay);
  return inlay;
}

function addGateApproach(group: Group, angle: number): void {
  const approachRadius = ARENA_RADIUS - 2.5;
  const pad = new Mesh(new BoxGeometry(5.2, 0.08, 7.5), makeStandard(FLOOR_PANEL, 0.88, 0.16));
  pad.position.set(Math.cos(angle) * approachRadius, 0.09, Math.sin(angle) * approachRadius);
  pad.rotation.y = Math.PI / 2 - angle;
  pad.receiveShadow = true;
  group.add(pad);

  for (const offset of [-1.2, 1.2]) {
    const stripe = new Mesh(new BoxGeometry(0.35, 0.09, 6.6), makeStandard(HAZARD, 0.72, 0.1));
    stripe.position.set(
      Math.cos(angle) * approachRadius + Math.cos(angle + Math.PI / 2) * offset,
      0.13,
      Math.sin(angle) * approachRadius + Math.sin(angle + Math.PI / 2) * offset,
    );
    stripe.rotation.y = Math.PI / 2 - angle;
    stripe.receiveShadow = true;
    group.add(stripe);
  }
}

export function buildArena(scene: Scene): Group {
  const group = new Group();

  // Floor — flat disc on the x,z plane (V4: y is visual only). Layered rings and
  // inlays break up the old flat "brown pancake" placeholder without changing sim.
  addFloorDisc(group, ARENA_RADIUS, FLOOR, 0);
  addFloorRing(group, ARENA_RADIUS * 0.22, ARENA_RADIUS * 0.235, FLOOR_LINE, 0.035);
  addFloorRing(group, ARENA_RADIUS * 0.48, ARENA_RADIUS * 0.492, FLOOR_LINE, 0.03);
  addFloorRing(group, ARENA_RADIUS * 0.72, ARENA_RADIUS * 0.735, FLOOR_PANEL, 0.025);

  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    addRadialInlay(group, angle, ARENA_RADIUS * 0.2, ARENA_RADIUS * 0.9, 0.08, FLOOR_LINE, 0.04);
  }

  // Central emblem / spawn plate. Kept muted so the player and pickups read over it.
  addFloorRing(group, ARENA_RADIUS * 0.095, ARENA_RADIUS * 0.145, FLOOR_PANEL, 0.06);
  addFloorRing(group, ARENA_RADIUS * 0.045, ARENA_RADIUS * 0.052, EMBLEM, 0.08);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    addRadialInlay(group, angle, ARENA_RADIUS * 0.055, ARENA_RADIUS * 0.13, 0.1, EMBLEM, 0.09);
  }

  // Outer wall ring.
  const wall = new Mesh(
    new RingGeometry(ARENA_RADIUS, ARENA_RADIUS + 2.5, 96),
    new MeshStandardMaterial({ color: RUST, roughness: 0.8, metalness: 0.3 }),
  );
  wall.rotation.x = -Math.PI / 2;
  wall.position.y = 0.05;
  wall.receiveShadow = true;
  group.add(wall);

  // Four gates at cardinal points.
  for (let i = 0; i < GATE_COUNT; i++) {
    const angle = (i / GATE_COUNT) * Math.PI * 2;
    addGateApproach(group, angle);

    const gate = new Mesh(
      new BoxGeometry(6, 4, 1.5),
      new MeshStandardMaterial({ color: RUST, roughness: 0.7, metalness: 0.4 }),
    );
    gate.position.set(
      Math.cos(angle) * (ARENA_RADIUS + 1),
      2,
      Math.sin(angle) * (ARENA_RADIUS + 1),
    );
    gate.lookAt(0, 2, 0);
    gate.castShadow = true;
    gate.receiveShadow = true;
    addOutlineHull(gate, OUTLINE_W.prop);
    group.add(gate);
  }

  // Decorative wall posts (crown silhouette) every 30°.
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const x = Math.cos(angle) * (ARENA_RADIUS + 1.5);
    const z = Math.sin(angle) * (ARENA_RADIUS + 1.5);
    const socket = new Mesh(
      new CylinderGeometry(0.92, 1.05, 0.28, 8),
      new MeshStandardMaterial({ color: OUTLINE, roughness: 0.95, metalness: 0.05 }),
    );
    socket.position.set(x, 0.14, z);
    socket.castShadow = true;
    socket.receiveShadow = true;
    group.add(socket);

    const post = new Mesh(
      new CylinderGeometry(0.6, 0.8, 5, 8),
      new MeshStandardMaterial({ color: RUST, roughness: 0.85 }),
    );
    post.position.set(x, 2.5, z);
    post.castShadow = true;
    post.receiveShadow = true;
    group.add(post);
  }

  // Lighting (§24 Epic B).
  scene.add(new AmbientLight('#553322', 0.85));
  const key = new DirectionalLight('#ffd9a0', 2.2);
  key.position.set(20, 40, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00035;
  key.shadow.normalBias = 0.01;
  key.shadow.camera.left = -ARENA_RADIUS - 8;
  key.shadow.camera.right = ARENA_RADIUS + 8;
  key.shadow.camera.top = ARENA_RADIUS + 8;
  key.shadow.camera.bottom = -ARENA_RADIUS - 8;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 90;
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key);
  const rim = new DirectionalLight('#32d7ff', 0.72);
  rim.position.set(-25, 18, -20);
  scene.add(rim);

  scene.add(group);
  return group;
}
