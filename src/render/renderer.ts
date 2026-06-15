// WebGPU renderer init. §C: WebGPU-only — ⊥ WebGL2 fallback.
// No-WebGPU device → caller shows unsupported screen.

import { WebGPURenderer } from 'three/webgpu';
import type { TierBudget } from './quality';

export function isWebGpuSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export async function createRenderer(
  canvas: HTMLCanvasElement,
  tier: TierBudget,
): Promise<WebGPURenderer> {
  // forceWebGL must stay false — WebGPU-only per §C.
  const renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.pixelRatioCap));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = tier.shadows;
  await renderer.init();
  return renderer;
}
