import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ColorRGB, MaterialToken } from '../types/index.js';
import { buildClosedPartGeometry } from './manifoldCsg.js';


export interface CutterWithToken {
  geometry: THREE.BufferGeometry;
  token?: MaterialToken;
  visual?: THREE.BufferGeometry;
  label?: string;
  color?: string;
}

/**
 * Merge an array of BufferGeometries while preserving their groups / multi-material indices.
 */
export function mergeWithGroups(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geoms.length === 0) return null;
  if (geoms.length === 1) return geoms[0]!;
  const normalized = geoms.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(normalized, false);
  if (!merged) return null;

  let vertexOffset = 0;
  for (const g of normalized) {
    for (const group of g.groups) {
      merged.addGroup(vertexOffset + group.start, group.count, group.materialIndex);
    }
    vertexOffset += g.attributes.position!.count;
  }
  for (const g of geoms) {
    g.dispose();
  }
  return merged;
}

/**
 * Build one closed colored solid shared by the viewport and STL export.
 * Input geometry ownership remains with the caller.
 */
export async function buildPartGeometry(
  block: THREE.BufferGeometry,
  decorGeoms: THREE.BufferGeometry[] | undefined,
  tokens: MaterialToken[],
  cutters: CutterWithToken[]
): Promise<THREE.BufferGeometry | null> {
  return buildClosedPartGeometry(block, decorGeoms, tokens, cutters);
}

/**
 * Flatten a group/multi-material CSG result into a single non-indexed,
 * per-vertex-colored geometry (one draw call per part). Faces whose pixel
 * alpha < 1 are dropped (they render as see-through in Blender too).
 */
export function toVertexColoredGeometry(
  geometry: THREE.BufferGeometry,
  materials: MaterialToken[]
): THREE.BufferGeometry | null {
  const posAttr = geometry.attributes.position;
  if (!posAttr) return null;
  const index = geometry.index;
  const triCount = index ? index.count / 3 : posAttr.count / 3;

  const outPos: number[] = [];
  const outCol: number[] = [];
  const skinColor = new THREE.Color();
  for (const group of geometry.groups) {
    const mat = materials[group.materialIndex ?? 0];
    if (!mat) continue;
    if (mat.opacity < 0.999) continue; // transparent skin pixels -> see-through
    skinColor.setRGB(mat.color[0] ?? 0, mat.color[1] ?? 0, mat.color[2] ?? 0, THREE.SRGBColorSpace);
    const triStart = Math.round(group.start / 3);
    const triEnd = group.count === Infinity ? triCount : Math.round((group.start + group.count) / 3);
    for (let t = triStart; t < triEnd; t++) {
      const a = index ? index.getX(t * 3) : t * 3;
      const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      for (const vi of [a, b, c]) {
        outPos.push(posAttr.getX(vi), posAttr.getY(vi), posAttr.getZ(vi));
        // vertex colors are linear; skin colors are sRGB
        outCol.push(skinColor.r, skinColor.g, skinColor.b);
      }
    }
  }

  if (outPos.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(outCol, 3));
  g.computeVertexNormals();
  return g;
}

export function colorizeGeometry(
  geometry: THREE.BufferGeometry,
  colorRgb: ColorRGB = [0.22, 0.74, 0.97]
): THREE.BufferGeometry {
  const pos = geometry.attributes.position!;
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const skinColor = new THREE.Color().setRGB(...colorRgb, THREE.SRGBColorSpace);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = skinColor.r;
    colors[i * 3 + 1] = skinColor.g;
    colors[i * 3 + 2] = skinColor.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
