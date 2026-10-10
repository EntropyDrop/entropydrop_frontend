import * as THREE from 'three';
import type { Vec3 } from '../types/index.js';
import { _unitCube, _faceGroupMap } from './tokens.js';

export function cubeAt(
  center: Vec3,
  materialIndices: number[],
  faceMask: boolean[] | Uint8Array | number[],
  size: Vec3 = [1, 1, 1]
): THREE.BufferGeometry {
  const g = _unitCube.clone();
  g.scale(size[0], size[1], size[2]);
  g.translate(center[0], center[1], center[2]);
  const kept: number[] = [];
  for (let f = 0; f < 6; f++) {
    if (faceMask[f]) kept.push(f);
  }
  if (kept.length === 6) {
    for (let i = 0; i < 6; i++) {
      g.groups[i]!.materialIndex = materialIndices[i];
    }
    const fgMap = new Map<number, THREE.BufferGeometry>();
    for (let i = 0; i < 6; i++) {
      fgMap.set(i, g);
    }
    _faceGroupMap.set(g, fgMap);
    return g;
  }
  const newIndex: number[] = [];
  const groups: Array<{ start: number; count: number; materialIndex: number }> = [];
  let offset = 0;
  for (const f of kept) {
    for (let k = f * 6; k < f * 6 + 6; k++) {
      newIndex.push(g.index!.getX(k));
    }
    groups.push({ start: offset, count: 6, materialIndex: materialIndices[f]! });
    offset += 6;
  }
  g.setIndex(newIndex);
  g.clearGroups();
  for (const group of groups) {
    g.addGroup(group.start, group.count, group.materialIndex);
  }
  return g;
}

export function boxAt(center: Vec3, size: Vec3, materialIndex: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
  g.translate(center[0], center[1], center[2]);
  g.clearGroups();
  g.addGroup(0, g.index!.count, materialIndex);
  return g;
}

/** Z-axis cylinder (Blender default orientation). */
export function cylinderZ(center: Vec3, radius: number, depth: number, segments = 96): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, depth, segments);
  g.rotateX(Math.PI / 2); // three.js Y axis -> Z axis
  g.translate(center[0], center[1], center[2]);
  g.clearGroups();
  g.addGroup(0, g.index!.count, 0);
  return g;
}

/** Y-axis cylinder (Blender rotation (90,0,0) / (0,90,90) results). */
export function cylinderY(center: Vec3, radius: number, depth: number, segments = 96): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, depth, segments);
  g.translate(center[0], center[1], center[2]);
  g.clearGroups();
  g.addGroup(0, g.index!.count, 0);
  return g;
}

/** X-axis cylinder (Blender rotation (0,90,90) on a Z cylinder). */
export function cylinderX(center: Vec3, radius: number, depth: number, segments = 96): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, depth, segments);
  g.rotateZ(Math.PI / 2); // three.js Y axis -> X axis
  g.translate(center[0], center[1], center[2]);
  g.clearGroups();
  g.addGroup(0, g.index!.count, 0);
  return g;
}

export function sphere(center: Vec3, radius: number, segments = 32): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(radius, segments, segments);
  g.translate(center[0], center[1], center[2]);
  g.clearGroups();
  g.addGroup(0, g.index!.count, 0);
  return g;
}

/**
 * Creates a beveled box centered at `center` with dimensions `[width, depth, height]`
 * and bevel width `bevel`, matching Blender's Bevel modifier on a primitive cube.
 */
export function createBeveledBox(
  center: Vec3,
  size: Vec3,
  bevel = 0.0,
  segments = 16
): THREE.BufferGeometry {
  if (bevel <= 0.0001) {
    const box = new THREE.BoxGeometry(size[0], size[1], size[2]);
    box.translate(center[0], center[1], center[2]);
    box.clearGroups();
    box.addGroup(0, box.index!.count, 0);
    return box;
  }

  // In Blender, bevel is applied to the local unit box [-1, 1] with bevel width W
  const W = Math.min(Math.max(bevel, 0), 0.9999);
  const inner = 1.0 - W;
  const N = Math.max(4, segments);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  function addVertex(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
    const idx = positions.length / 3;
    positions.push(x, y, z);
    const len = Math.hypot(nx, ny, nz) || 1;
    normals.push(nx / len, ny / len, nz / len);
    uvs.push(0, 0);
    return idx;
  }

  function addOrientedTri(i0: number, i1: number, i2: number) {
    const p0 = new THREE.Vector3(positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]);
    const p1 = new THREE.Vector3(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]);
    const p2 = new THREE.Vector3(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]);
    const fn = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(p1, p0),
      new THREE.Vector3().subVectors(p2, p0)
    );
    const mid = new THREE.Vector3().add(p0).add(p1).add(p2).divideScalar(3);
    if (fn.dot(mid) >= 0) {
      indices.push(i0, i1, i2);
    } else {
      indices.push(i0, i2, i1);
    }
  }

  function addOrientedQuad(i0: number, i1: number, i2: number, i3: number) {
    addOrientedTri(i0, i1, i2);
    addOrientedTri(i0, i2, i3);
  }

  // 1. 6 Flat Faces
  // +Z face
  {
    const v0 = addVertex(-inner, -inner, 1, 0, 0, 1);
    const v1 = addVertex(inner, -inner, 1, 0, 0, 1);
    const v2 = addVertex(inner, inner, 1, 0, 0, 1);
    const v3 = addVertex(-inner, inner, 1, 0, 0, 1);
    addOrientedQuad(v0, v1, v2, v3);
  }
  // -Z face
  {
    const v0 = addVertex(inner, -inner, -1, 0, 0, -1);
    const v1 = addVertex(-inner, -inner, -1, 0, 0, -1);
    const v2 = addVertex(-inner, inner, -1, 0, 0, -1);
    const v3 = addVertex(inner, inner, -1, 0, 0, -1);
    addOrientedQuad(v0, v1, v2, v3);
  }
  // +Y face
  {
    const v0 = addVertex(-inner, 1, inner, 0, 1, 0);
    const v1 = addVertex(inner, 1, inner, 0, 1, 0);
    const v2 = addVertex(inner, 1, -inner, 0, 1, 0);
    const v3 = addVertex(-inner, 1, -inner, 0, 1, 0);
    addOrientedQuad(v0, v1, v2, v3);
  }
  // -Y face
  {
    const v0 = addVertex(inner, -1, inner, 0, -1, 0);
    const v1 = addVertex(-inner, -1, inner, 0, -1, 0);
    const v2 = addVertex(-inner, -1, -inner, 0, -1, 0);
    const v3 = addVertex(inner, -1, -inner, 0, -1, 0);
    addOrientedQuad(v0, v1, v2, v3);
  }
  // +X face
  {
    const v0 = addVertex(1, -inner, -inner, 1, 0, 0);
    const v1 = addVertex(1, inner, -inner, 1, 0, 0);
    const v2 = addVertex(1, inner, inner, 1, 0, 0);
    const v3 = addVertex(1, -inner, inner, 1, 0, 0);
    addOrientedQuad(v0, v1, v2, v3);
  }
  // -X face
  {
    const v0 = addVertex(-1, inner, -inner, -1, 0, 0);
    const v1 = addVertex(-1, -inner, -inner, -1, 0, 0);
    const v2 = addVertex(-1, -inner, inner, -1, 0, 0);
    const v3 = addVertex(-1, inner, inner, -1, 0, 0);
    addOrientedQuad(v0, v1, v2, v3);
  }

  // 2. 12 Edges
  for (const sy of [1, -1]) {
    for (const sz of [1, -1]) {
      const cy = sy * inner;
      const cz = sz * inner;
      const rowA: number[] = [];
      const rowB: number[] = [];
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * (Math.PI / 2);
        const ny = Math.cos(t);
        const nz = Math.sin(t);
        const y = cy + sy * W * ny;
        const z = cz + sz * W * nz;
        rowA.push(addVertex(-inner, y, z, 0, sy * ny, sz * nz));
        rowB.push(addVertex(inner, y, z, 0, sy * ny, sz * nz));
      }
      for (let i = 0; i < N; i++) {
        addOrientedQuad(rowA[i]!, rowB[i]!, rowB[i + 1]!, rowA[i + 1]!);
      }
    }
  }

  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const cx = sx * inner;
      const cz = sz * inner;
      const rowA: number[] = [];
      const rowB: number[] = [];
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * (Math.PI / 2);
        const nx = Math.cos(t);
        const nz = Math.sin(t);
        const x = cx + sx * W * nx;
        const z = cz + sz * W * nz;
        rowA.push(addVertex(x, -inner, z, sx * nx, 0, sz * nz));
        rowB.push(addVertex(x, inner, z, sx * nx, 0, sz * nz));
      }
      for (let i = 0; i < N; i++) {
        addOrientedQuad(rowA[i]!, rowB[i]!, rowB[i + 1]!, rowA[i + 1]!);
      }
    }
  }

  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      const cx = sx * inner;
      const cy = sy * inner;
      const rowA: number[] = [];
      const rowB: number[] = [];
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * (Math.PI / 2);
        const nx = Math.cos(t);
        const ny = Math.sin(t);
        const x = cx + sx * W * nx;
        const y = cy + sy * W * ny;
        rowA.push(addVertex(x, y, -inner, sx * nx, sy * ny, 0));
        rowB.push(addVertex(x, y, inner, sx * nx, sy * ny, 0));
      }
      for (let i = 0; i < N; i++) {
        addOrientedQuad(rowA[i]!, rowB[i]!, rowB[i + 1]!, rowA[i + 1]!);
      }
    }
  }

  // 3. 8 Spherical Corners
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      for (const sz of [1, -1]) {
        const cx = sx * inner;
        const cy = sy * inner;
        const cz = sz * inner;
        const grid: number[][] = [];
        for (let j = 0; j <= N; j++) {
          const phi = (j / N) * (Math.PI / 2);
          const nz = Math.sin(phi);
          const r = Math.cos(phi);
          const row: number[] = [];
          for (let i = 0; i <= N; i++) {
            const theta = (i / N) * (Math.PI / 2);
            const nx = r * Math.cos(theta);
            const ny = r * Math.sin(theta);
            const x = cx + sx * W * nx;
            const y = cy + sy * W * ny;
            const z = cz + sz * W * nz;
            row.push(addVertex(x, y, z, sx * nx, sy * ny, sz * nz));
          }
          grid.push(row);
        }

        for (let j = 0; j < N; j++) {
          for (let i = 0; i < N; i++) {
            const v00 = grid[j]![i]!;
            const v10 = grid[j]![i + 1]!;
            const v11 = grid[j + 1]![i + 1]!;
            const v01 = grid[j + 1]![i]!;
            if (j === N - 1) {
              addOrientedTri(v00, v10, v01);
            } else {
              addOrientedQuad(v00, v10, v11, v01);
            }
          }
        }
      }
    }
  }

  // 4. Scale and Translate
  const scaleX = size[0] / 2;
  const scaleY = size[1] / 2;
  const scaleZ = size[2] / 2;

  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = positions[i]! * scaleX + center[0];
    positions[i + 1] = positions[i + 1]! * scaleY + center[1];
    positions[i + 2] = positions[i + 2]! * scaleZ + center[2];
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.clearGroups();
  geom.addGroup(0, indices.length, 0);
  return geom;
}

/**
 * Port of mc_blender_utils.create_custom_spun_shape: a capped mesh built from
 * profile rings transformed by `modify` over `steps`.
 */
export function createSpunShape(
  location: Vec3,
  initialVertices: Vec3[],
  steps: number,
  modify: (vertices: Vec3[], totalSteps: number, step: number) => Vec3[]
): THREE.BufferGeometry {
  const vpr = initialVertices.length;
  const firstRing = modify(initialVertices, steps, 0);
  const finalRing = modify(initialVertices, steps, steps);

  const centerOf = (vertices: Vec3[]): Vec3 => {
    const c: Vec3 = [0, 0, 0];
    for (const v of vertices) {
      c[0] += v[0] / vpr;
      c[1] += v[1] / vpr;
      c[2] += v[2] / vpr;
    }
    return c;
  };

  const vertices: Vec3[] = [centerOf(firstRing), ...firstRing];
  const faces: number[][] = [];

  for (let step = 1; step <= steps; step++) {
    const ring = modify(initialVertices, steps, step);
    const currentStart = vertices.length;
    const previousStart = currentStart - vpr;
    vertices.push(...ring);
    for (let index = 0; index < vpr; index++) {
      const nextIndex = (index + 1) % vpr;
      faces.push([
        previousStart + index,
        previousStart + nextIndex,
        currentStart + nextIndex,
        currentStart + index,
      ]);
    }
  }

  for (let index = 0; index < vpr; index++) {
    const nextIndex = (index + 1) % vpr;
    faces.push([0, 1 + nextIndex, 1 + index]);
  }

  const bottomCenterIndex = vertices.length;
  vertices.push(centerOf(finalRing));
  const lastRingStart = bottomCenterIndex - vpr;
  for (let index = 0; index < vpr; index++) {
    const nextIndex = (index + 1) % vpr;
    faces.push([
      bottomCenterIndex,
      lastRingStart + index,
      lastRingStart + nextIndex,
    ]);
  }

  const positions = new Float32Array(vertices.length * 3);
  for (let i = 0; i < vertices.length; i++) {
    positions[i * 3] = vertices[i]![0];
    positions[i * 3 + 1] = vertices[i]![1];
    positions[i * 3 + 2] = vertices[i]![2];
  }
  const indices: number[] = [];
  for (const face of faces) {
    if (face.length === 4) {
      indices.push(face[0]!, face[1]!, face[2]!, face[0]!, face[2]!, face[3]!);
    } else if (face.length === 3) {
      indices.push(face[0]!, face[1]!, face[2]!);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(indices);
  // CSG requires position/uv/normal on every input geometry
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vertices.length * 2), 2));
  g.translate(location[0], location[1], location[2]);
  g.computeVertexNormals();
  g.clearGroups();
  g.addGroup(0, g.index!.count, 0);
  ensureOutwardWinding(g);
  return g;
}

/** Flip triangle winding if the majority of faces point inward. */
export function ensureOutwardWinding(geometry: THREE.BufferGeometry): void {
  const pos = geometry.attributes.position!;
  const index = geometry.index!;
  const centroid: Vec3 = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    centroid[0] += pos.getX(i);
    centroid[1] += pos.getY(i);
    centroid[2] += pos.getZ(i);
  }
  centroid[0] /= pos.count;
  centroid[1] /= pos.count;
  centroid[2] /= pos.count;

  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();
  const triCenter = new THREE.Vector3();
  let outward = 0;
  const triCount = index.count / 3;
  for (let t = 0; t < triCount; t++) {
    const a = index.getX(t * 3);
    const b = index.getX(t * 3 + 1);
    const c = index.getX(t * 3 + 2);
    ab.set(pos.getX(b) - pos.getX(a), pos.getY(b) - pos.getY(a), pos.getZ(b) - pos.getZ(a));
    ac.set(pos.getX(c) - pos.getX(a), pos.getY(c) - pos.getY(a), pos.getZ(c) - pos.getZ(a));
    n.crossVectors(ab, ac);
    triCenter.set(
      (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3 - centroid[0],
      (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3 - centroid[1],
      (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3 - centroid[2]
    );
    if (n.dot(triCenter) >= 0) outward++;
  }
  if (outward < triCount / 2) {
    // majority inward -> reverse winding
    const arr = index.array as number[] | Uint16Array | Uint32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const tmp = arr[i + 1]!;
      arr[i + 1] = arr[i + 2]!;
      arr[i + 2] = tmp;
    }
    index.needsUpdate = true;
  }
}
