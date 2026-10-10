import * as THREE from 'three';
import { getManifold } from '../manifoldRuntime.js';
import type { MaterialToken } from '../types/index.js';
import type { CutterWithToken } from './csg.js';
import { CUT_TOKEN } from './tokens.js';

/** Keep material seams as property vertices, while welding their topology. */
function toSolid(wasm: any, geometry: THREE.BufferGeometry, tokens: MaterialToken[]): any {
  const position = geometry.getAttribute('position');
  const color = geometry.getAttribute('color');
  const index = geometry.getIndex();
  const count = index?.count ?? position.count;
  const materials = new Uint32Array(count / 3);
  for (const group of geometry.groups) {
    materials.fill(group.materialIndex ?? 0, group.start / 3, Math.min(count, group.start + group.count) / 3);
  }
  const properties = new Float32Array(count * 6);
  const triangles = new Uint32Array(count);
  const skinColor = new THREE.Color();
  for (let corner = 0; corner < count; corner++) {
    const vertex = index ? index.getX(corner) : corner;
    const offset = corner * 6;
    properties[offset] = position.getX(vertex);
    properties[offset + 1] = position.getY(vertex);
    properties[offset + 2] = position.getZ(vertex);
    const token = tokens[materials[Math.floor(corner / 3)]] ?? CUT_TOKEN;
    if (!color) skinColor.setRGB(token.color[0] ?? 0, token.color[1] ?? 0, token.color[2] ?? 0, THREE.SRGBColorSpace);
    properties[offset + 3] = color ? color.getX(vertex) : skinColor.r;
    properties[offset + 4] = color ? color.getY(vertex) : skinColor.g;
    properties[offset + 5] = color ? color.getZ(vertex) : skinColor.b;
    triangles[corner] = corner;
  }
  const mesh = new wasm.Mesh({
    numProp: 6,
    vertProperties: properties,
    triVerts: triangles,
    // Preserve pixel/material boundaries through coplanar simplification.
    faceID: materials,
    tolerance: 1e-6,
  });
  mesh.merge();
  return wasm.Manifold.ofMesh(mesh);
}

function requireValid(solid: any, stage: string): void {
  const status = solid.status();
  if (status !== 'NoError') throw new Error(`${stage}失败：${status}`);
}

function toGeometry(solid: any): THREE.BufferGeometry | null {
  const mesh = solid.getMesh();
  if (!mesh.triVerts.length) return null;
  const positions = new Float32Array(mesh.triVerts.length * 3);
  const colors = new Float32Array(positions.length);
  for (let i = 0; i < mesh.triVerts.length; i++) {
    const source = mesh.triVerts[i] * mesh.numProp;
    positions.set(mesh.vertProperties.subarray(source, source + 3), i * 3);
    colors.set(mesh.vertProperties.subarray(source + 3, source + 6), i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Union closed skin solids before subtracting sockets. Concatenating overlapping
 * cube shells is not a Boolean union and leaves ambiguous faces at the rim.
 * Input geometries remain owned by the caller; every WASM solid is released.
 */
export async function buildClosedPartGeometry(
  block: THREE.BufferGeometry,
  decor: THREE.BufferGeometry[] | undefined,
  tokens: MaterialToken[],
  cutters: CutterWithToken[],
): Promise<THREE.BufferGeometry | null> {
  const wasm = await getManifold();
  const owned = new Set<any>();
  const keep = (solid: any) => { owned.add(solid); return solid; };
  try {
    const inputs = [block, ...(decor ?? [])].map(geometry => {
      const solid = keep(toSolid(wasm, geometry, tokens));
      requireValid(solid, '实体构建');
      return solid;
    });
    let solid = keep(wasm.Manifold.union(inputs));
    requireValid(solid, '皮肤实体合并');
    for (const cutter of cutters) {
      const tool = keep(toSolid(wasm, cutter.geometry, [cutter.token ?? CUT_TOKEN]));
      requireValid(tool, '切割体构建');
      solid = keep(solid.subtract(tool));
      requireValid(solid, cutter.label ?? '布尔切割');
    }
    return toGeometry(solid);
  } finally {
    for (const solid of [...owned].reverse()) solid.delete();
  }
}
