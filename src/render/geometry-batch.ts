// Generic static-geometry batcher (perf). Merges every static, single-material
// Mesh under a root into ONE merged Mesh per material — cutting a few hundred
// draw calls (e.g. an arena's seams/ribs/gates) down to one-per-material. Bakes
// each mesh's transform into its geometry, so the merged result is positionally
// identical. Animated/dynamic subtrees are pruned via `skip` and left untouched.
//
// Reusable across arenas (and any static prop set): build the scene normally,
// mark the few things that move (`userData.batchDynamic = true`), then call
// `batchStatic(group)`. The whole arena is always on screen (V7), so losing
// per-mesh frustum culling costs nothing.

import { Mesh, Matrix4, type Object3D, type BufferGeometry, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface BatchOptions {
  /** Return true to PRUNE a subtree (it + its descendants are left as-is). Use
   *  for animated nodes (gate-door pivots, anything you transform per frame). */
  skip?: (o: Object3D) => boolean;
}

interface Group {
  geos: BufferGeometry[];
  originals: Mesh[];
  material: Material; // shared instance for the merged mesh (first seen for the key)
  castShadow: boolean;
  receiveShadow: boolean;
}

/** Group meshes by material APPEARANCE, not reference — builders often mint a
 *  fresh material per mesh (e.g. an arena's `mat(color, …)` helper), so reference
 *  equality would merge nothing. Two materials with the same key render identical
 *  and can safely share one instance on the merged mesh. */
function materialKey(m: Material): string {
  const a = m as unknown as {
    type: string;
    color?: { getHexString(): string };
    emissive?: { getHexString(): string };
    roughness?: number;
    metalness?: number;
    emissiveIntensity?: number;
    opacity?: number;
    transparent?: boolean;
    side?: number;
    map?: { uuid: string } | null;
    blending?: number;
    toneMapped?: boolean;
  };
  return [
    a.type,
    a.color?.getHexString() ?? '-',
    a.emissive?.getHexString() ?? '-',
    a.roughness ?? '-',
    a.metalness ?? '-',
    a.emissiveIntensity ?? '-',
    a.opacity ?? '-',
    a.transparent ? 1 : 0,
    a.side ?? '-',
    a.map?.uuid ?? '-',
    a.blending ?? '-',
    a.toneMapped ? 1 : 0,
  ].join('|');
}

/** Merge static single-material meshes under `root` into one mesh per material.
 *  Returns how many draw calls were collapsed (originals removed − merges added).
 *  Mutates `root` in place. */
export function batchStatic(root: Object3D, opts: BatchOptions = {}): number {
  root.updateMatrixWorld(true);
  const rootInv = new Matrix4().copy(root.matrixWorld).invert();
  const skip = opts.skip;
  const byKey = new Map<string, Group>();
  const local = new Matrix4();

  const visit = (o: Object3D): void => {
    if (skip?.(o)) return; // prune this subtree entirely
    for (const child of o.children) visit(child);
    const m = o as Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return; // skip multi-material
    const mat = m.material as Material;
    const key = materialKey(mat);
    // Bake the mesh's transform into root-LOCAL space (the merged mesh parents
    // to root), so a transformed root doesn't double-apply.
    local.multiplyMatrices(rootInv, m.matrixWorld);
    const g = m.geometry.clone();
    g.applyMatrix4(local);
    let entry = byKey.get(key);
    if (!entry) {
      entry = { geos: [], originals: [], material: mat, castShadow: false, receiveShadow: false };
      byKey.set(key, entry);
    }
    entry.geos.push(g);
    entry.originals.push(m);
    entry.castShadow ||= m.castShadow;
    entry.receiveShadow ||= m.receiveShadow;
  };
  visit(root);

  let saved = 0;
  for (const group of byKey.values()) {
    const mat = group.material;
    if (group.geos.length < 2) {
      group.geos.forEach((g) => g.dispose()); // nothing to gain from a single mesh
      continue;
    }
    const merged = mergeGeometries(group.geos, false);
    group.geos.forEach((g) => g.dispose());
    if (!merged) continue; // incompatible attributes — leave originals untouched
    for (const m of group.originals) m.removeFromParent();
    const mesh = new Mesh(merged, mat);
    mesh.castShadow = group.castShadow;
    mesh.receiveShadow = group.receiveShadow;
    mesh.matrixAutoUpdate = false; // static — never re-derive its matrix
    mesh.frustumCulled = false; // whole arena is always on screen (V7)
    root.add(mesh);
    saved += group.originals.length - 1;
  }
  return saved;
}
