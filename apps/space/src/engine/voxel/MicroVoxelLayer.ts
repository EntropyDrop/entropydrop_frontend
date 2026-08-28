import * as THREE from 'three';
import { DEFAULT_BLOCK_COLOR, normalizeColor } from './BlockTypes.ts';
import {
  bendPoint,
  TORUS_SIZE_X,
  TORUS_SIZE_Z,
  unwrapPeriodicNear,
  wrapMicroX,
  wrapMicroZ
} from '../torus/TorusWorld.ts';

export const MICRO_DIVISIONS = 5;
export const MICRO_SIZE = 1 / MICRO_DIVISIONS;
const MICRO_CHUNK_SIZE = 16 * MICRO_DIVISIONS;

function key(mx, my, mz) {
  return `${wrapMicroX(mx)},${my},${wrapMicroZ(mz)}`;
}

function meshChunkKey(mx, mz) {
  return `${Math.floor(wrapMicroX(mx) / MICRO_CHUNK_SIZE)},${Math.floor(wrapMicroZ(mz) / MICRO_CHUNK_SIZE)}`;
}

export class MicroVoxelLayer {
  cells: Map<string, number>;
  parts: Map<string, any>;
  columnLayers: Map<string, Map<number, { count: number; color: number }>>;
  columnTops: Map<string, { my: number; color: number }>;
  dirty: boolean;
  group: THREE.Group;
  /** Compatibility alias for callers that only need to know whether a mesh exists. */
  mesh: any;
  meshChunks: Map<string, THREE.Mesh>;
  private chunkCells: Map<string, Set<string>>;
  private dirtyMeshChunks: Set<string>;
  material: THREE.MeshStandardMaterial;

  constructor() {
    this.cells = new Map();
    this.parts = new Map();
    // Sparse per-column height index used by the deferred distant-terrain LOD.
    // It avoids scanning 5×5×640 possible micro cells for every thumbnail update.
    this.columnLayers = new Map();
    this.columnTops = new Map();
    this.dirty = false;
    this.group = new THREE.Group();
    this.group.name = 'MicroVoxelLayer';
    this.mesh = null;
    this.meshChunks = new Map();
    this.chunkCells = new Map();
    this.dirtyMeshChunks = new Set();
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.65,
      metalness: 0.15
    });
  }

  get(mx, my, mz) {
    return this.cells.get(key(mx, my, mz)) ?? null;
  }

  has(mx, my, mz) {
    return this.cells.has(key(mx, my, mz));
  }

  private markMeshChunkDirty(mx, mz) {
    const wrappedX = wrapMicroX(mx);
    const wrappedZ = wrapMicroZ(mz);
    this.dirtyMeshChunks.add(meshChunkKey(wrappedX, wrappedZ));
    const localX = wrappedX % MICRO_CHUNK_SIZE;
    const localZ = wrappedZ % MICRO_CHUNK_SIZE;
    if (localX === 0) this.dirtyMeshChunks.add(meshChunkKey(wrappedX - 1, wrappedZ));
    if (localX === MICRO_CHUNK_SIZE - 1) this.dirtyMeshChunks.add(meshChunkKey(wrappedX + 1, wrappedZ));
    if (localZ === 0) this.dirtyMeshChunks.add(meshChunkKey(wrappedX, wrappedZ - 1));
    if (localZ === MICRO_CHUNK_SIZE - 1) this.dirtyMeshChunks.add(meshChunkKey(wrappedX, wrappedZ + 1));
    this.dirty = true;
  }

  private addChunkCell(cellKey, mx, mz) {
    const chunkKey = meshChunkKey(mx, mz);
    let cells = this.chunkCells.get(chunkKey);
    if (!cells) {
      cells = new Set();
      this.chunkCells.set(chunkKey, cells);
    }
    cells.add(cellKey);
  }

  private removeChunkCell(cellKey, mx, mz) {
    const chunkKey = meshChunkKey(mx, mz);
    const cells = this.chunkCells.get(chunkKey);
    cells?.delete(cellKey);
    if (cells?.size === 0) this.chunkCells.delete(chunkKey);
  }

  private getColumnKey(mx, mz) {
    return `${Math.floor(wrapMicroX(mx) / MICRO_DIVISIONS)},${Math.floor(wrapMicroZ(mz) / MICRO_DIVISIONS)}`;
  }

  private indexCellSet(mx, my, mz, color, isNew) {
    const columnKey = this.getColumnKey(mx, mz);
    let layers = this.columnLayers.get(columnKey);
    if (!layers) {
      layers = new Map();
      this.columnLayers.set(columnKey, layers);
    }
    let layer = layers.get(my);
    if (!layer) {
      layer = { count: 0, color };
      layers.set(my, layer);
    }
    if (isNew) layer.count++;
    layer.color = color;
    const top = this.columnTops.get(columnKey);
    if (!top || my >= top.my) this.columnTops.set(columnKey, { my, color });
  }

  private indexCellDelete(mx, my, mz) {
    const columnKey = this.getColumnKey(mx, mz);
    const layers = this.columnLayers.get(columnKey);
    const layer = layers?.get(my);
    if (!layers || !layer) return;
    layer.count--;
    if (layer.count <= 0) layers.delete(my);
    if (layers.size === 0) {
      this.columnLayers.delete(columnKey);
      this.columnTops.delete(columnKey);
      return;
    }
    const top = this.columnTops.get(columnKey);
    if (top?.my !== my) return;
    if (layers.has(my)) {
      this.columnTops.set(columnKey, { my, color: layers.get(my).color });
      return;
    }
    let topMy = -1;
    let topColor = DEFAULT_BLOCK_COLOR;
    for (const [layerY, value] of layers) {
      if (layerY <= topMy) continue;
      topMy = layerY;
      topColor = value.color;
    }
    this.columnTops.set(columnKey, { my: topMy, color: topColor });
  }

  /** Highest occupied micro layer in a standard X/Z column, cached in O(1). */
  getColumnTop(wx, wz) {
    const columnKey = this.getColumnKey(wx * MICRO_DIVISIONS, wz * MICRO_DIVISIONS);
    return this.columnTops.get(columnKey) ?? null;
  }

  set(mx, my, mz, color = DEFAULT_BLOCK_COLOR, part = null) {
    const normalized = normalizeColor(color);
    const cellKey = key(mx, my, mz);
    const isNew = !this.cells.has(cellKey);
    const currentPart = this.parts.get(cellKey) ?? null;
    if (this.cells.get(cellKey) === normalized && currentPart === part) return false;
    this.cells.set(cellKey, normalized);
    if (isNew) this.addChunkCell(cellKey, mx, mz);
    this.indexCellSet(mx, my, mz, normalized, isNew);
    if (part) this.parts.set(cellKey, part);
    else this.parts.delete(cellKey);
    this.markMeshChunkDirty(mx, mz);
    return true;
  }

  delete(mx, my, mz) {
    const cellKey = key(mx, my, mz);
    const removed = this.cells.delete(cellKey);
    this.parts.delete(cellKey);
    if (removed) {
      this.removeChunkCell(cellKey, mx, mz);
      this.indexCellDelete(mx, my, mz);
      this.markMeshChunkDirty(mx, mz);
    }
    return removed;
  }

  subdivide(wx, wy, wz, color = DEFAULT_BLOCK_COLOR) {
    const baseX = wx * MICRO_DIVISIONS;
    const baseY = wy * MICRO_DIVISIONS;
    const baseZ = wz * MICRO_DIVISIONS;
    const normalized = normalizeColor(color);
    for (let dx = 0; dx < MICRO_DIVISIONS; dx++) {
      for (let dy = 0; dy < MICRO_DIVISIONS; dy++) {
        for (let dz = 0; dz < MICRO_DIVISIONS; dz++) {
          const mx = baseX + dx;
          const my = baseY + dy;
          const mz = baseZ + dz;
          this.set(mx, my, mz, normalized, null);
        }
      }
    }
    return MICRO_DIVISIONS ** 3;
  }

  clearStandardCell(wx, wy, wz) {
    const baseX = wx * MICRO_DIVISIONS;
    const baseY = wy * MICRO_DIVISIONS;
    const baseZ = wz * MICRO_DIVISIONS;
    let removed = 0;
    for (let dx = 0; dx < MICRO_DIVISIONS; dx++) {
      for (let dy = 0; dy < MICRO_DIVISIONS; dy++) {
        for (let dz = 0; dz < MICRO_DIVISIONS; dz++) {
          if (this.delete(baseX + dx, baseY + dy, baseZ + dz)) removed++;
        }
      }
    }
    return removed;
  }

  hasAnyInStandardCell(wx, wy, wz) {
    const baseX = wx * MICRO_DIVISIONS;
    const baseY = wy * MICRO_DIVISIONS;
    const baseZ = wz * MICRO_DIVISIONS;
    for (let dx = 0; dx < MICRO_DIVISIONS; dx++) {
      for (let dy = 0; dy < MICRO_DIVISIONS; dy++) {
        for (let dz = 0; dz < MICRO_DIVISIONS; dz++) {
          if (this.cells.has(key(baseX + dx, baseY + dy, baseZ + dz))) return true;
        }
      }
    }
    return false;
  }

  extractRegion(minX, minY, minZ, maxX, maxY, maxZ) {
    const extracted = [];
    const minMx = minX * MICRO_DIVISIONS;
    const minMy = minY * MICRO_DIVISIONS;
    const minMz = minZ * MICRO_DIVISIONS;
    const maxMx = (maxX + 1) * MICRO_DIVISIONS - 1;
    const maxMy = (maxY + 1) * MICRO_DIVISIONS - 1;
    const maxMz = (maxZ + 1) * MICRO_DIVISIONS - 1;

    for (const [cellKey, color] of this.cells) {
      const [mx, my, mz] = cellKey.split(',').map(Number);
      const extractedMx = unwrapPeriodicNear(mx, minMx, TORUS_SIZE_X * MICRO_DIVISIONS);
      const extractedMz = unwrapPeriodicNear(mz, minMz, TORUS_SIZE_Z * MICRO_DIVISIONS);
      if (extractedMx < minMx || extractedMx > maxMx || my < minMy || my > maxMy
        || extractedMz < minMz || extractedMz > maxMz) continue;
      extracted.push({ mx: extractedMx, my, mz: extractedMz, color, part: this.parts.get(cellKey) ?? null });
      this.cells.delete(cellKey);
      this.removeChunkCell(cellKey, mx, mz);
      this.indexCellDelete(mx, my, mz);
      this.parts.delete(cellKey);
      this.markMeshChunkDirty(mx, mz);
    }

    return extracted;
  }

  /**
   * Remove and return every microcell whose integer micro indices fall inside
   * the inclusive [min..max] range. Micro indices are absolute (0.2 m grid),
   * so callers can target a single cell by passing equal min/max values.
   */
  extractCellsInBox(minMx, minMy, minMz, maxMx, maxMy, maxMz) {
    const extracted = [];
    if (!Number.isFinite(minMx) || !Number.isFinite(minMy) || !Number.isFinite(minMz)
      || !Number.isFinite(maxMx) || !Number.isFinite(maxMy) || !Number.isFinite(maxMz)) {
      return extracted;
    }
    for (const [cellKey, color] of this.cells) {
      const [mx, my, mz] = cellKey.split(',').map(Number);
      const extractedMx = unwrapPeriodicNear(mx, minMx, TORUS_SIZE_X * MICRO_DIVISIONS);
      const extractedMz = unwrapPeriodicNear(mz, minMz, TORUS_SIZE_Z * MICRO_DIVISIONS);
      if (extractedMx < minMx || extractedMx > maxMx || my < minMy || my > maxMy
        || extractedMz < minMz || extractedMz > maxMz) continue;
      extracted.push({ mx: extractedMx, my, mz: extractedMz, color, part: this.parts.get(cellKey) ?? null });
      this.cells.delete(cellKey);
      this.removeChunkCell(cellKey, mx, mz);
      this.indexCellDelete(mx, my, mz);
      this.parts.delete(cellKey);
      this.markMeshChunkDirty(mx, mz);
    }
    return extracted;
  }

  getCellsInAABB(aabb) {
    const cells = [];
    const minX = Math.floor(aabb.minX * MICRO_DIVISIONS);
    const maxX = Math.floor(aabb.maxX * MICRO_DIVISIONS);
    const minY = Math.floor(aabb.minY * MICRO_DIVISIONS);
    const maxY = Math.floor(aabb.maxY * MICRO_DIVISIONS);
    const minZ = Math.floor(aabb.minZ * MICRO_DIVISIONS);
    const maxZ = Math.floor(aabb.maxZ * MICRO_DIVISIONS);

    for (let mx = minX; mx <= maxX; mx++) {
      for (let my = minY; my <= maxY; my++) {
        for (let mz = minZ; mz <= maxZ; mz++) {
          const color = this.get(mx, my, mz);
          if (color === null) continue;
          cells.push({
            x: mx * MICRO_SIZE,
            y: my * MICRO_SIZE,
            z: mz * MICRO_SIZE,
            size: MICRO_SIZE,
            color,
            micro: true
          });
        }
      }
    }
    return cells;
  }

  raycast(origin, direction, maxDistance = 10) {
    const startX = origin.x * MICRO_DIVISIONS;
    const startY = origin.y * MICRO_DIVISIONS;
    const startZ = origin.z * MICRO_DIVISIONS;
    const dirX = direction.x;
    const dirY = direction.y;
    const dirZ = direction.z;

    let mx = Math.floor(startX);
    let my = Math.floor(startY);
    let mz = Math.floor(startZ);
    const stepX = Math.sign(dirX);
    const stepY = Math.sign(dirY);
    const stepZ = Math.sign(dirZ);
    const deltaX = stepX ? Math.abs(1 / dirX) : Infinity;
    const deltaY = stepY ? Math.abs(1 / dirY) : Infinity;
    const deltaZ = stepZ ? Math.abs(1 / dirZ) : Infinity;
    let maxX = stepX === 0 ? Infinity : stepX > 0
      ? (Math.floor(startX) + 1 - startX) * deltaX
      : (startX - Math.floor(startX)) * deltaX;
    let maxY = stepY === 0 ? Infinity : stepY > 0
      ? (Math.floor(startY) + 1 - startY) * deltaY
      : (startY - Math.floor(startY)) * deltaY;
    let maxZ = stepZ === 0 ? Infinity : stepZ > 0
      ? (Math.floor(startZ) + 1 - startZ) * deltaZ
      : (startZ - Math.floor(startZ)) * deltaZ;
    let normal = { x: 0, y: 0, z: 0 };
    let scaledDistance = 0;
    const maxScaledDistance = maxDistance * MICRO_DIVISIONS;

    while (scaledDistance <= maxScaledDistance) {
      const color = this.get(mx, my, mz);
      if (color !== null) {
        return {
          hit: true,
          kind: 'micro',
          microPos: { x: mx, y: my, z: mz },
          hitPos: { x: mx * MICRO_SIZE, y: my * MICRO_SIZE, z: mz * MICRO_SIZE },
          placeMicroPos: { x: mx + normal.x, y: my + normal.y, z: mz + normal.z },
          normal,
          color,
          size: MICRO_SIZE,
          distance: scaledDistance * MICRO_SIZE
        };
      }

      if (maxX < maxY) {
        if (maxX < maxZ) {
          scaledDistance = maxX;
          maxX += deltaX;
          mx += stepX;
          normal = { x: -stepX, y: 0, z: 0 };
        } else {
          scaledDistance = maxZ;
          maxZ += deltaZ;
          mz += stepZ;
          normal = { x: 0, y: 0, z: -stepZ };
        }
      } else if (maxY < maxZ) {
        scaledDistance = maxY;
        maxY += deltaY;
        my += stepY;
        normal = { x: 0, y: -stepY, z: 0 };
      } else {
        scaledDistance = maxZ;
        maxZ += deltaZ;
        mz += stepZ;
        normal = { x: 0, y: 0, z: -stepZ };
      }
    }
    return { hit: false };
  }

  updateMesh() {
    if (!this.dirty) return false;
    this.dirty = false;
    const dirtyChunks = [...this.dirtyMeshChunks];
    this.dirtyMeshChunks.clear();
    const tempColor = new THREE.Color();
    const faces = [
      { d: [0, 1, 0], n: [0, 1, 0], s: 1.0, q: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
      { d: [0,-1, 0], n: [0,-1,0], s: 0.6, q: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
      { d: [0,0,-1], n: [0,0,-1], s: 0.85, q: [[1,1,0],[1,0,0],[0,0,0],[0,1,0]] },
      { d: [0,0, 1], n: [0,0, 1], s: 0.85, q: [[0,1,1],[0,0,1],[1,0,1],[1,1,1]] },
      { d: [-1,0,0], n: [-1,0,0], s: 0.85, q: [[0,1,0],[0,0,0],[0,0,1],[0,1,1]] },
      { d: [ 1,0,0], n: [ 1,0,0], s: 0.85, q: [[1,1,1],[1,0,1],[1,0,0],[1,1,0]] }
    ];

    for (const chunkKey of dirtyChunks) {
      const previous = this.meshChunks.get(chunkKey);
      if (previous) {
        this.group.remove(previous);
        previous.geometry.dispose();
        this.meshChunks.delete(chunkKey);
      }
      const cellKeys = this.chunkCells.get(chunkKey);
      if (!cellKeys?.size) continue;

      const positions = [];
      const normals = [];
      const colors = [];
      for (const cellKey of cellKeys) {
        const color = this.cells.get(cellKey);
        if (color === undefined) continue;
        const [mx, my, mz] = cellKey.split(',').map(Number);
        tempColor.setHex(color);
        for (const face of faces) {
          if (this.has(mx + face.d[0], my + face.d[1], mz + face.d[2])) continue;
          const vertices = face.q.map(v => [
            (mx + v[0]) * MICRO_SIZE,
            (my + v[1]) * MICRO_SIZE,
            (mz + v[2]) * MICRO_SIZE
          ]);
          const rgb = [tempColor.r * face.s, tempColor.g * face.s, tempColor.b * face.s];
          for (const index of [0, 1, 2, 0, 2, 3]) {
            positions.push(...vertices[index]);
            normals.push(...face.n);
            colors.push(...rgb);
          }
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      // Each horizontal chunk has its own bent-space sphere, so distant edits
      // neither rebuild nor widen the culling bounds of unrelated micro voxels.
      const bentBox = new THREE.Box3();
      const bentVertex = new THREE.Vector3();
      for (const cellKey of cellKeys) {
        const [mx, my, mz] = cellKey.split(',').map(Number);
        bendPoint(
          (mx + 0.5) * MICRO_SIZE,
          (my + 0.5) * MICRO_SIZE,
          (mz + 0.5) * MICRO_SIZE,
          bentVertex
        );
        bentBox.expandByPoint(bentVertex);
      }
      // Conservative allowance for each bent 0.2 m cell around its center.
      bentBox.expandByScalar(MICRO_SIZE * 1.5);
      geometry.boundingSphere = new THREE.Sphere();
      bentBox.getBoundingSphere(geometry.boundingSphere);
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.name = `MicroVoxelChunk:${chunkKey}`;
      mesh.userData.microChunkKey = chunkKey;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.meshChunks.set(chunkKey, mesh);
      this.group.add(mesh);
    }
    this.mesh = this.meshChunks.values().next().value || null;
    return true;
  }
}
