// Post-processing stack (WebGPU PostProcessing + TSL nodes). Bloom on the
// emissive highlights (gate trim/portal glow, projectiles, gold accents, FX)
// gives the scene its AAA "bang" without per-object work. Render goes through
// `post.renderAsync()` instead of `renderer.renderAsync(scene, camera)`.

import { PostProcessing, type WebGPURenderer } from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import type { Scene, PerspectiveCamera } from 'three';

export interface PostStack {
  renderAsync(): Promise<void>;
}

export function createPostProcessing(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
): PostStack {
  const post = new PostProcessing(renderer);
  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode();
  // (input, strength, radius, threshold) — threshold keeps the mid-tones clean
  // so only genuinely bright emissives blow out into glow.
  // Calmer global bloom so the lit-gold arena rings/trim don't blow out; the
  // projectile + pickup materials are pushed brighter (below) to keep THEIR
  // glow intact under the lower strength.
  const bloomPass = bloom(color, 0.85, 0.6, 0.16);
  post.outputNode = color.add(bloomPass);
  return {
    renderAsync: () => post.renderAsync() as unknown as Promise<void>,
  };
}
