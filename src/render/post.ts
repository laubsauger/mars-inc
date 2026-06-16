// Post-processing stack (WebGPU RenderPipeline + TSL nodes). Bloom on the
// emissive highlights gives the scene its "bang"; optional GTAO (ground-truth
// ambient occlusion) adds contact darkening in crevices/contacts for instant
// depth. AO is a settings toggle — swapping `outputNode` means the AO graph is
// only evaluated when it's actually on (no perf cost when off). Render goes
// through `post.render()` instead of `renderer.renderAsync(scene, camera)`.

import { RenderPipeline, type WebGPURenderer } from 'three/webgpu';
import { pass, mrt, output, normalView, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import type { Scene, PerspectiveCamera } from 'three';

export interface PostStack {
  render(): void;
  setAO(on: boolean): void;
}

export function createPostProcessing(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  aoEnabled = false,
): PostStack {
  const post = new RenderPipeline(renderer);

  // Scene pass outputs colour + view-space normal (MRT) so GTAO can read normals.
  const scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({ output, normal: normalView }));
  const color = scenePass.getTextureNode('output');
  const normal = scenePass.getTextureNode('normal');
  const depth = scenePass.getTextureNode('depth');

  // Higher threshold so lit MODELS don't bloom into a washed haze — only bright
  // emissives blow out. Lower strength keeps it tasteful. (input, strength, radius, threshold)
  const bloomPass = bloom(color, 0.6, 0.6, 0.32);

  const noAO = color.add(bloomPass);
  // GTAO darkens contacts. Use ONLY the AO red channel broadcast to RGB (alpha 1)
  // — multiplying by the raw AO vec4 zeroes G/B and tints everything red.
  const aoPass = ao(depth, normal, camera);
  const aoFactor = vec4(vec3(aoPass.getTextureNode().r), 1);
  const withAO = color.mul(aoFactor).add(bloomPass);

  const apply = (on: boolean): void => {
    post.outputNode = on ? withAO : noAO;
    post.needsUpdate = true;
  };
  apply(aoEnabled);

  // renderer.init() is awaited at creation, so the sync render() path is valid.
  return { render: () => void post.render(), setAO: apply };
}
