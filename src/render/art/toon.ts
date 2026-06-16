// Toon / ink material option (T37, art doc pillar 2 "quantize light into 2-3
// bands"). Opt-in via settings — the default look stays the smooth standard
// material. A 3-step gradient ramp drives MeshToonMaterial's banded shading.
// Render-only; no sim coupling.

import {
  DataTexture,
  RedFormat,
  NearestFilter,
  MeshToonMaterial,
  type ColorRepresentation,
} from 'three';

/** 3-band shadow ramp for toon shading (dark / mid / lit). Nearest-filtered so
 *  the steps stay hard (no smooth gradient = no smooth PBR, the art-doc enemy). */
export function toonGradient(): DataTexture {
  const data = new Uint8Array([70, 150, 255]);
  const tex = new DataTexture(data, data.length, 1, RedFormat);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const GRADIENT = toonGradient();

/** A banded toon material sharing the one cached gradient ramp. `vertexColors`
 *  on so InstancedMesh per-instance color still tints the crowd. */
export function toonMaterial(color: ColorRepresentation, vertexColors = false): MeshToonMaterial {
  return new MeshToonMaterial({ color, gradientMap: GRADIENT, vertexColors });
}
