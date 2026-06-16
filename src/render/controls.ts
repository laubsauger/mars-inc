// Optional orbit/zoom camera (player aid). The base game is a fixed framed view
// (V7), but players can RIGHT-drag to orbit the fixed centre and wheel to zoom —
// e.g. to lower the angle and peek into the gate rooms. A reset restores the
// framed default. Left mouse stays free for weapon aim; pan is disabled so the
// arena centre is always the pivot.

import { MOUSE, TOUCH, type PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ARENA_RADIUS } from '../sim/constants';
import { computeFitDistance, frameArena, AIM_Z } from './camera';

export interface ArenaControls {
  controls: OrbitControls;
  /** Restore the framed default orbit (whole arena visible). */
  reset(): void;
}

export function createControls(
  camera: PerspectiveCamera,
  dom: HTMLElement,
  aspect: number,
): ArenaControls {
  const controls = new OrbitControls(camera, dom);
  controls.target.set(0, 0, AIM_Z);
  controls.enablePan = false; // pivot stays locked on the arena centre
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // Right-drag orbits (left stays free for mouse-aim); wheel/middle zooms.
  controls.mouseButtons = { LEFT: null, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
  controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_ROTATE };
  // Lower the angle to peek into the gate rooms, but never under the floor or
  // fully top-down (keeps the arena readable).
  controls.minPolarAngle = (16 * Math.PI) / 180;
  controls.maxPolarAngle = (84 * Math.PI) / 180;
  const fit = computeFitDistance(ARENA_RADIUS, camera.fov, aspect);
  controls.minDistance = fit * 0.4;
  controls.maxDistance = fit * 1.25;
  controls.update();

  const reset = (): void => {
    frameArena(camera, camera.aspect); // re-place at the framed default position
    controls.target.set(0, 0, AIM_Z);
    controls.update(); // sync OrbitControls' internal spherical to the new pose
  };

  return { controls, reset };
}
