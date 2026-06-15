// Rust Crown arena render view (T5). Circular floor, outer wall, four gates,
// central emblem, lighting. V2: pure render view — holds no sim state.

import {
  Group,
  Mesh,
  CircleGeometry,
  RingGeometry,
  CylinderGeometry,
  BoxGeometry,
  MeshStandardMaterial,
  BackSide,
  AmbientLight,
  DirectionalLight,
  type Scene,
} from 'three';
import { ARENA_RADIUS, GATE_COUNT } from '../sim/constants';
import { COL, OUTLINE as OUTLINE_W } from './art/palette';

const RUST = COL.oxidizedIron;
const FLOOR = COL.umberShadow;
const EMBLEM = COL.marsDust;
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

export function buildArena(scene: Scene): Group {
  const group = new Group();

  // Floor — flat disc on the x,z plane (V4: y is visual only).
  const floor = new Mesh(
    new CircleGeometry(ARENA_RADIUS, 96),
    new MeshStandardMaterial({ color: FLOOR, roughness: 0.95, metalness: 0.05 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Central emblem / pressure plate.
  const emblem = new Mesh(
    new CircleGeometry(ARENA_RADIUS * 0.14, 48),
    new MeshStandardMaterial({ color: EMBLEM, emissive: EMBLEM, emissiveIntensity: 0.25 }),
  );
  emblem.rotation.x = -Math.PI / 2;
  emblem.position.y = 0.02;
  group.add(emblem);

  // Outer wall ring.
  const wall = new Mesh(
    new RingGeometry(ARENA_RADIUS, ARENA_RADIUS + 2.5, 96),
    new MeshStandardMaterial({ color: RUST, roughness: 0.8, metalness: 0.3 }),
  );
  wall.rotation.x = -Math.PI / 2;
  wall.position.y = 0.05;
  group.add(wall);

  // Four gates at cardinal points.
  for (let i = 0; i < GATE_COUNT; i++) {
    const angle = (i / GATE_COUNT) * Math.PI * 2;
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
    addOutlineHull(gate, OUTLINE_W.prop);
    group.add(gate);
  }

  // Decorative wall posts (crown silhouette) every 30°.
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const post = new Mesh(
      new CylinderGeometry(0.6, 0.8, 5, 8),
      new MeshStandardMaterial({ color: RUST, roughness: 0.85 }),
    );
    post.position.set(
      Math.cos(angle) * (ARENA_RADIUS + 1.5),
      2.5,
      Math.sin(angle) * (ARENA_RADIUS + 1.5),
    );
    group.add(post);
  }

  // Lighting (§24 Epic B).
  scene.add(new AmbientLight('#553322', 1.1));
  const key = new DirectionalLight('#ffd9a0', 2.2);
  key.position.set(20, 40, 12);
  key.castShadow = true;
  scene.add(key);
  const rim = new DirectionalLight('#4488ff', 0.5);
  rim.position.set(-25, 18, -20);
  scene.add(rim);

  scene.add(group);
  return group;
}
