// Optional free camera (dev aid). The base game is a fixed framed view (V7), but
// with this opt-in you can MIDDLE-drag to PAN and wheel to ZOOM — to peek into the
// gate rooms or inspect a corner. A reset restores the framed default. Crucially
// LEFT (fire) and RIGHT (grenade) mouse buttons stay free — camera lives entirely
// on the middle button + wheel, so there's no double-assignment with combat.

import { MOUSE, TOUCH, type PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { arenaFitDistance, frameArena, arenaAimZ } from './camera';

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
  controls.target.set(0, 0, arenaAimZ());
  // Off by default (opt-in setting): players kept nudging the orbit/zoom by
  // accident and losing the framed view. `update()` still runs for damping +
  // camera-shake regardless; `enabled` only gates INPUT.
  controls.enabled = false;
  controls.enablePan = true; // MIDDLE-drag pans the view (dev: inspect a corner)
  controls.screenSpacePanning = true; // pan in the screen plane — intuitive top-down
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // Camera lives on MIDDLE + wheel ONLY: middle-drag pans, wheel zooms. LEFT/RIGHT
  // stay null so fire (left) + grenade (right) are never double-bound to the camera.
  controls.mouseButtons = { LEFT: null, MIDDLE: MOUSE.PAN, RIGHT: null };
  controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN };
  const fit = arenaFitDistance(camera.fov, aspect);
  // Framed default IS the fully-zoomed-out view now (MARGIN baked into `fit`);
  // only a hair of extra dolly-out, and the same absolute closest zoom-in.
  controls.minDistance = fit * 0.32;
  controls.maxDistance = fit * 1.05;
  controls.update();

  const reset = (): void => {
    frameArena(camera, camera.aspect); // re-place at the framed default position
    controls.target.set(0, 0, arenaAimZ());
    controls.update(); // sync OrbitControls' internal spherical to the new pose
  };

  return { controls, reset };
}
