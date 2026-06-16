// Fixed camera. V7: whole arena always visible. ⊥ tracking/gameplay-rotation/
// threat-hiding zoom. Mild top-down tilt for comic 3D readability, framed so the
// full circular arena fits at any aspect ratio.

import { PerspectiveCamera, Vector3, Raycaster, Plane, Vector2 } from 'three';
import { activeArena, arenaExtent } from '../sim/arena';

const FOV_DEG = 45;
const TILT_RAD = (62 * Math.PI) / 180; // 0 = straight down, 90 = horizon
const MARGIN = 1.4; // start fully zoomed out (whole arena + breathing room) — players zoom IN from here
// Perspective foreshortens the far (top) half, so the arena centroid projects
// below screen center → it drifts down. Aim slightly toward the near side to
// recenter (V7). Scaled by the active arena's depth half-extent (live, so it
// updates when the arena is switched).
export function arenaAimZ(): number {
  return arenaExtent().halfZ * 0.16;
}

/**
 * Distance from arena center along the view axis so a circle of `radius` fits
 * within both the vertical and horizontal FOV at the given aspect.
 * Pure — unit-tested. V7 depends on this never cropping the arena.
 */
export function computeFitDistance(
  radius: number,
  fovDeg: number,
  aspect: number,
  margin: number = MARGIN,
): number {
  const vFov = (fovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const need = radius * margin;
  const distV = need / Math.tan(vFov / 2);
  const distH = need / Math.tan(hFov / 2);
  return Math.max(distV, distH);
}

/** Distance to fit a HALF-W × HALF-Z rectangle in both FOVs (V7). */
export function computeFitDistanceRect(
  halfW: number,
  halfZ: number,
  fovDeg: number,
  aspect: number,
  margin: number = MARGIN,
): number {
  const vFov = (fovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const distH = (halfW * margin) / Math.tan(hFov / 2);
  const distV = (halfZ * margin) / Math.tan(vFov / 2);
  return Math.max(distH, distV);
}

/** Fit distance for the ACTIVE arena (circle or rect). Shared by camera + controls. */
export function arenaFitDistance(fovDeg: number, aspect: number, margin: number = MARGIN): number {
  const s = activeArena().shape;
  if (s.kind === 'circle') return computeFitDistance(s.radius, fovDeg, aspect, margin);
  return computeFitDistanceRect(s.halfW, s.halfZ, fovDeg, aspect, margin);
}

export function createCamera(aspect: number): PerspectiveCamera {
  const cam = new PerspectiveCamera(FOV_DEG, aspect, 1, 500);
  frameArena(cam, aspect);
  return cam;
}

/** Reposition camera to frame the whole arena. Call on resize. */
export function frameArena(cam: PerspectiveCamera, aspect: number): void {
  cam.aspect = aspect;
  const dist = arenaFitDistance(cam.fov, aspect);
  // Look at center (0,0,0). Camera above and pulled back along +z by tilt.
  const y = dist * Math.sin(TILT_RAD);
  const z = dist * Math.cos(TILT_RAD);
  cam.position.set(0, y, z);
  cam.up.set(0, 1, 0);
  cam.lookAt(new Vector3(0, 0, arenaAimZ()));
  cam.updateProjectionMatrix();
}

const _ray = new Raycaster();
const _ndc = new Vector2();
const _ground = new Plane(new Vector3(0, 1, 0), 0); // y = 0 arena floor
const _hit = new Vector3();

/**
 * Project a CSS-pixel screen point onto the arena floor (y=0) → world (x,z).
 * Returns null if the ray misses the plane (camera looking away). Used for
 * mouse-directed aim (§5.1) and the ground cursor.
 */
export function screenToGround(
  cam: PerspectiveCamera,
  px: number,
  py: number,
  width: number,
  height: number,
): { x: number; z: number } | null {
  _ndc.set((px / width) * 2 - 1, -(py / height) * 2 + 1);
  _ray.setFromCamera(_ndc, cam);
  const hit = _ray.ray.intersectPlane(_ground, _hit);
  if (!hit) return null;
  return { x: hit.x, z: hit.z };
}
