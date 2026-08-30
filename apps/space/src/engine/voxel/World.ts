import * as THREE from 'three';
import { Chunk, CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from './Chunk.ts';
import { BlockTypes, DEFAULT_BLOCK_COLOR, normalizeColor } from './BlockTypes.ts';
import { TerrainGenerator } from '../worldgen/TerrainGenerator.ts';
import { LowPolyMesher } from '../mesher/LowPolyMesher.ts';
import { MicroVoxelLayer, MICRO_DIVISIONS } from './MicroVoxelLayer.ts';
import {
  WorldEditPersistence,
  type TerrainEditChunk,
  type WorldEditPersistenceOptions,
} from './WorldEditPersistence.ts';
import {
  applyDistantTerrainMaterial,
  bakeDistantTerrainTexture,
  createDistantTerrainTexture,
} from '../render/DistantTerrainMaterial.ts';
import {
  DISTANT_LOD_SEGMENTS_X,
  DISTANT_LOD_SEGMENTS_Z,
  DISTANT_LOD_TEXTURE_HEIGHT,
  DISTANT_LOD_TEXTURE_WIDTH,
  type DistantLodCacheData,
} from '../render/DistantLodCacheFormat.ts';
import {
  wrapX, wrapZ, wrapChunkX, wrapChunkZ, wrapMicroX, wrapMicroZ,
  bendPoint, unbendPoint, computeChunkBentSphere, hookSceneMaterials,
  TORUS_SIZE_X, TORUS_SIZE_Z, TORUS_R, TORUS_RHO, TORUS_GREF
} from '../torus/TorusWorld.ts';

const DISTANT_SEGMENTS_X = DISTANT_LOD_SEGMENTS_X;
const DISTANT_SEGMENTS_Z = DISTANT_LOD_SEGMENTS_Z;
const DISTANT_TERRAIN_COLOR = 0x718f61;
const DISTANT_UPDATE_INTERVAL_MS = 200;
const DISTANT_COLUMNS_PER_FLUSH = 48;
const STREAM_WORK_BUDGET_MS = 7;
const MAX_STREAM_CHUNKS_PER_FRAME = 6;
const MAX_CHUNK_MESHES_PER_FRAME = 1;
const MAX_REMOTE_CHUNKS_PER_FRAME = 2;
const MAX_MICRO_MESH_CHUNKS_PER_FRAME = 1;
const MAX_CHUNK_EVICTIONS_PER_FRAME = 8;
export const DEFAULT_RENDER_DISTANCE = 8;

// Matches LowPolyMesher and MicroVoxelLayer exactly: each rendered quad is
// triangulated as 0-1-2 and 0-2-3 before the GPU applies the torus bend.
const BENT_VOXEL_RAYCAST_FACES = [
  { normal: [0, 1, 0], quad: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { normal: [0, -1, 0], quad: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { normal: [0, 0, -1], quad: [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]] },
  { normal: [0, 0, 1], quad: [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]] },
  { normal: [-1, 0, 0], quad: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]] },
  { normal: [1, 0, 0], quad: [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]] }
];

function intersectTriangleInclusive(ray, a, b, c, point, barycentric) {
  const plane = new THREE.Plane().setFromCoplanarPoints(a, b, c);
  if (!ray.intersectPlane(plane, point)) return false;
  THREE.Triangle.getBarycoord(point, a, b, c, barycentric);
  const epsilon = 1e-5;
  return barycentric.x >= -epsilon
    && barycentric.y >= -epsilon
    && barycentric.z >= -epsilon;
}

export class World {
  scene: any;
  chunks: Map<string, Chunk>;
  terrainGen: TerrainGenerator;
  mesher: LowPolyMesher;
  renderDistance: number;
  worldGroup: THREE.Group;
  distantSurface: THREE.Mesh;
  /** Seamless 1024x256 baked albedo for the distant shell (1 MiB RGBA, sRGB). */
  distantTexture: THREE.DataTexture;
  distantLodSource: 'shared-cache' | 'generated';
  microVoxels: MicroVoxelLayer;
  /** Browser-local sparse overlay that survives a page refresh for this world. */
  editPersistence: WorldEditPersistence | null;
  dirtyChunks: Set<Chunk>;
  activeChunkKeys: Set<string>;
  lastStreamCenterKey: string;
  private pendingStreamChunks: { cx: number; cz: number; distanceSq: number }[];
  private pendingChunkEvictions: Map<string, Chunk>;
  private pendingRemoteChunkUpdates: Map<string, TerrainEditChunk>;
  private remoteChunkRevisions: Map<string, number>;
  private rayBentPoint: THREE.Vector3;
  private rayFlatPoint: THREE.Vector3;
  /** Bumped on any block/micro-voxel mutation — lets caches (e.g. minimap) know terrain changed. */
  terrainVersion: number;
  /** Incremented after a deferred batch changes the distant terrain shell. */
  distantLodRevision: number;
  private distantBaseHeights: Float32Array;
  private distantPendingColumns: Map<string, { x: number; z: number }>;
  private distantColumnSamples: Map<string, any>;
  private distantVertexColumns: Map<number, Set<string>>;
  private distantLastFlushAt: number;
  private distantSampleRevision: number;
  private distantPoint: THREE.Vector3;
  private distantColor: THREE.Color;
  private distantTangentX: THREE.Vector3;
  private distantTangentZ: THREE.Vector3;
  private distantNormal: THREE.Vector3;
  private distantNeighborA: THREE.Vector3;
  private distantNeighborB: THREE.Vector3;

  constructor(
    scene,
    seed = 1337,
    distantCache: DistantLodCacheData | null = null,
    persistenceOptions: WorldEditPersistenceOptions | null = null
  ) {
    this.scene = scene;
    this.chunks = new Map(); // key: "cx,cz" -> Chunk on the wrapped 1024x128 chunk grid.
    this.terrainGen = new TerrainGenerator(seed);
    this.mesher = new LowPolyMesher();

    // Keep 1 m voxel detail nearby. The whole-ring LOD preserves long-range
    // visibility while the default 17x17 window bounds resident voxel arrays.
    // A prebent, roughly 65k-triangle LOD covers the full ring and merges blocks into 4/16/64 m cells by distance.
    this.renderDistance = DEFAULT_RENDER_DISTANCE;
    this.terrainVersion = 0;
    this.distantLodRevision = 0;
    const acceptedDistantCache = distantCache?.seed === seed ? distantCache : null;
    this.distantLodSource = acceptedDistantCache ? 'shared-cache' : 'generated';
    this.distantBaseHeights = new Float32Array(DISTANT_SEGMENTS_X * DISTANT_SEGMENTS_Z);
    // Terrain edits first coalesce by world column, then a 5 Hz budgeted batch
    // updates only the affected low-resolution vertices and their local normals.
    this.distantPendingColumns = new Map();
    this.distantColumnSamples = new Map();
    this.distantVertexColumns = new Map();
    this.distantLastFlushAt = Date.now();
    this.distantSampleRevision = 0;
    this.distantPoint = new THREE.Vector3();
    this.distantColor = new THREE.Color();
    this.distantTangentX = new THREE.Vector3();
    this.distantTangentZ = new THREE.Vector3();
    this.distantNormal = new THREE.Vector3();
    this.distantNeighborA = new THREE.Vector3();
    this.distantNeighborB = new THREE.Vector3();
    this.worldGroup = new THREE.Group();
    this.worldGroup.name = 'VoxelWorld';
    this.scene.add(this.worldGroup);
    this.distantSurface = this.buildDistantSurface(acceptedDistantCache);
    this.worldGroup.add(this.distantSurface);
    this.microVoxels = new MicroVoxelLayer();
    this.worldGroup.add(this.microVoxels.group);
    this.editPersistence = persistenceOptions?.worldId
      ? new WorldEditPersistence(persistenceOptions)
      : null;

    // Generated terrain contains no micro voxels, so its sparse authored layer
    // can be restored immediately. Standard edits are applied lazily below when
    // their chunks stream in.
    if (this.editPersistence) {
      const restoredColumns = new Set<string>();
      let restoredMicro = 0;
      for (const edit of this.editPersistence.getMicroEdits()) {
        if (!this.microVoxels.set(edit.mx, edit.my, edit.mz, edit.color, edit.part)) continue;
        restoredMicro++;
        restoredColumns.add(`${Math.floor(edit.mx / MICRO_DIVISIONS)},${Math.floor(edit.mz / MICRO_DIVISIONS)}`);
      }
      this.terrainVersion += restoredMicro;
      for (const column of restoredColumns) {
        const [x, z] = column.split(',').map(Number);
        this.queueDistantSurfaceUpdate(x, z);
      }
    }

    // Dirty chunks queue for mesh regeneration
    this.dirtyChunks = new Set();
    this.activeChunkKeys = new Set();
    this.lastStreamCenterKey = '';
    this.pendingStreamChunks = [];
    this.pendingChunkEvictions = new Map();
    this.pendingRemoteChunkUpdates = new Map();
    this.remoteChunkRevisions = new Map();
    for (const chunk of persistenceOptions?.remote?.chunks ?? []) {
      const key = World.getChunkKey(wrapChunkX(chunk.chunk_x), wrapChunkZ(chunk.chunk_z));
      const revision = Number.isFinite(Number(chunk.revision)) ? Number(chunk.revision) : 0;
      this.remoteChunkRevisions.set(key, Math.max(this.remoteChunkRevisions.get(key) ?? -1, revision));
    }
    this.rayBentPoint = new THREE.Vector3();
    this.rayFlatPoint = new THREE.Vector3();
  }

  /**
   * An ~65k-triangle pre-bent terrain shell keeps the whole doughnut visible
   * across the central hole. Nearby voxel chunks sit 0.35 m above it and retain
   * full block detail; distant terrain no longer requires loading all 131072 chunks.
   */
  buildDistantSurface(cache: DistantLodCacheData | null = null) {
    const segmentsX = DISTANT_SEGMENTS_X;
    const segmentsZ = DISTANT_SEGMENTS_Z;
    const positions: number[] = [];
    const colors: number[] = [];
    const terrainUvs: number[] = [];
    const terrainHeights: number[] = [];
    const terrainEditMasks: number[] = [];
    const indices: number[] = [];
    const point = new THREE.Vector3();
    const color = new THREE.Color();

    for (let ix = 0; ix <= segmentsX; ix++) {
      const x = (ix / segmentsX) * TORUS_SIZE_X;
      for (let iz = 0; iz <= segmentsZ; iz++) {
        const z = (iz / segmentsZ) * TORUS_SIZE_Z;
        const logicalIndex = (ix % segmentsX) * segmentsZ + (iz % segmentsZ);
        const height = cache?.heights[logicalIndex]
          ?? this.terrainGen.sampleHeight(wrapX(x), wrapZ(z));
        if (ix < segmentsX && iz < segmentsZ) {
          this.distantBaseHeights[ix * segmentsZ + iz] = height;
        }
        // Voxel y=height has its top at height+1.0; match exact terrain surface elevation.
        bendPoint(x, height + 1.0, z, point);
        positions.push(point.x, point.y, point.z);
        terrainUvs.push(ix / segmentsX, iz / segmentsZ);
        terrainHeights.push(height);
        terrainEditMasks.push(0);
        color.setHex(DISTANT_TERRAIN_COLOR);
        colors.push(color.r, color.g, color.b);
      }
    }

    const stride = segmentsZ + 1;
    for (let ix = 0; ix < segmentsX; ix++) {
      for (let iz = 0; iz < segmentsZ; iz++) {
        const a = ix * stride + iz;
        const b = (ix + 1) * stride + iz;
        const c = (ix + 1) * stride + iz + 1;
        const d = ix * stride + iz + 1;
        // Reversed winding: X×Z points inward for this torus parameterization.
        indices.push(a, c, b, a, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('terrainUv', new THREE.Float32BufferAttribute(terrainUvs, 2));
    geometry.setAttribute('terrainHeight', new THREE.Float32BufferAttribute(terrainHeights, 1));
    geometry.setAttribute('terrainEditMask', new THREE.Float32BufferAttribute(terrainEditMasks, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    // Player-built towers may lift individual LOD vertices above the generated
    // hills. Keep one conservative sphere instead of recomputing the full shell.
    geometry.boundingSphere.radius = Math.max(
      geometry.boundingSphere.radius,
      TORUS_R + TORUS_RHO + (CHUNK_SIZE_Y - TORUS_GREF) + 2
    );

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      flatShading: true,
      roughness: 0.65,
      metalness: 0.15,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
    material.customProgramCacheKey = () => 'torus-distant-surface-v1';
    // Reuse the immutable shared albedo when its seed matches. Cache misses bake
    // the exact same 1 MiB texture locally; the GPU mip chain then supplies
    // distance-dependent detail coarsening per pixel.
    // Heights are bilinearly resampled from the shell's own 512×64 vertex grid
    // (the same smooth field the surface is built from) instead of re-running
    // noise per texel.
    const baseHeights = this.distantBaseHeights;
    const heightSampler = (wx, wz) => {
      const fx = (wx / TORUS_SIZE_X) * DISTANT_SEGMENTS_X;
      const fz = (wz / TORUS_SIZE_Z) * DISTANT_SEGMENTS_Z;
      const x0 = Math.floor(fx) % DISTANT_SEGMENTS_X;
      const z0 = Math.floor(fz) % DISTANT_SEGMENTS_Z;
      const x1 = (x0 + 1) % DISTANT_SEGMENTS_X;
      const z1 = (z0 + 1) % DISTANT_SEGMENTS_Z;
      const tx = fx - Math.floor(fx);
      const tz = fz - Math.floor(fz);
      const h00 = baseHeights[x0 * DISTANT_SEGMENTS_Z + z0];
      const h10 = baseHeights[x1 * DISTANT_SEGMENTS_Z + z0];
      const h01 = baseHeights[x0 * DISTANT_SEGMENTS_Z + z1];
      const h11 = baseHeights[x1 * DISTANT_SEGMENTS_Z + z1];
      return (h00 + (h10 - h00) * tx) * (1 - tz) + (h01 + (h11 - h01) * tx) * tz;
    };
    this.distantTexture = cache
      ? createDistantTerrainTexture(cache.textureRgba, cache.textureWidth, cache.textureHeight)
      : bakeDistantTerrainTexture(
          heightSampler,
          TORUS_SIZE_X,
          TORUS_SIZE_Z,
          DISTANT_LOD_TEXTURE_WIDTH,
          DISTANT_LOD_TEXTURE_HEIGHT
        );
    applyDistantTerrainMaterial(material, TORUS_SIZE_X, TORUS_SIZE_Z, this.renderDistance, this.distantTexture);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'TorusDistantSurfaceLOD';
    mesh.userData.torusPreBent = true;
    mesh.userData.lodSource = this.distantLodSource;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  /** Coalesce rapid edits to one pending update per standard X/Z column. */
  queueDistantSurfaceUpdate(wx, wz) {
    const x = Math.floor(wrapX(wx));
    const z = Math.floor(wrapZ(wz));
    this.distantPendingColumns.set(`${x},${z}`, { x, z });
  }

  private getDistantVertexForColumn(x, z) {
    const ix = Math.round((x / TORUS_SIZE_X) * DISTANT_SEGMENTS_X) % DISTANT_SEGMENTS_X;
    const iz = Math.round((z / TORUS_SIZE_Z) * DISTANT_SEGMENTS_Z) % DISTANT_SEGMENTS_Z;
    return { ix, iz, logicalIndex: ix * DISTANT_SEGMENTS_Z + iz };
  }

  /** Read the edited column at flush time, after a burst of block operations settles. */
  private sampleCurrentDistantColumn(x, z) {
    const { cx, cz, lx, lz } = this.worldToChunkCoords(x, z);
    const chunk = this.getOrCreateChunk(cx, cz);
    let surfaceY = 0;
    let color = DISTANT_TERRAIN_COLOR;

    for (let y = CHUNK_SIZE_Y - 1; y >= 0; y--) {
      if (chunk.getLocalBlock(lx, y, lz) === BlockTypes.AIR) continue;
      surfaceY = y + 1;
      color = chunk.getLocalColor(lx, y, lz);
      break;
    }

    const microTop = this.microVoxels.getColumnTop(x, z);
    if (microTop && (microTop.my + 1) / MICRO_DIVISIONS > surfaceY) {
      surfaceY = (microTop.my + 1) / MICRO_DIVISIONS;
      color = microTop.color;
    }

    return { surfaceY, color };
  }

  private updateDistantColumnSample(columnKey, x, z, dirtyVertices) {
    const { ix, iz, logicalIndex } = this.getDistantVertexForColumn(x, z);
    const current = this.sampleCurrentDistantColumn(x, z);
    const baseSurfaceY = this.terrainGen.sampleHeight(x, z) + 1;
    const delta = current.surfaceY - baseSurfaceY;
    const visibleOverride = Math.abs(delta) > 1e-6 || current.color !== DISTANT_TERRAIN_COLOR;
    const previous = this.distantColumnSamples.get(columnKey);

    if (previous && previous.logicalIndex !== logicalIndex) {
      const previousColumns = this.distantVertexColumns.get(previous.logicalIndex);
      previousColumns?.delete(columnKey);
      if (previousColumns?.size === 0) this.distantVertexColumns.delete(previous.logicalIndex);
      dirtyVertices.add(previous.logicalIndex);
    }

    if (visibleOverride) {
      this.distantColumnSamples.set(columnKey, {
        x, z, ix, iz, logicalIndex, delta, color: current.color,
        revision: ++this.distantSampleRevision
      });
      let columns = this.distantVertexColumns.get(logicalIndex);
      if (!columns) {
        columns = new Set();
        this.distantVertexColumns.set(logicalIndex, columns);
      }
      columns.add(columnKey);
    } else {
      this.distantColumnSamples.delete(columnKey);
      const columns = this.distantVertexColumns.get(logicalIndex);
      columns?.delete(columnKey);
      if (columns?.size === 0) this.distantVertexColumns.delete(logicalIndex);
    }
    dirtyVertices.add(logicalIndex);
  }

  private forEachDistantSeamCopy(ix, iz, visit) {
    visit(ix, iz);
    if (ix === 0) visit(DISTANT_SEGMENTS_X, iz);
    if (iz === 0) visit(ix, DISTANT_SEGMENTS_Z);
    if (ix === 0 && iz === 0) visit(DISTANT_SEGMENTS_X, DISTANT_SEGMENTS_Z);
  }

  private writeDistantVertex(
    logicalIndex,
    changedPositions,
    changedColors,
    changedHeights,
    changedEditMasks
  ) {
    const ix = Math.floor(logicalIndex / DISTANT_SEGMENTS_Z);
    const iz = logicalIndex % DISTANT_SEGMENTS_Z;
    const columns = this.distantVertexColumns.get(logicalIndex);
    let dominant = null;
    if (columns) {
      for (const columnKey of columns) {
        const sample = this.distantColumnSamples.get(columnKey);
        if (!sample) continue;
        if (!dominant
          || Math.abs(sample.delta) > Math.abs(dominant.delta)
          || (Math.abs(sample.delta) === Math.abs(dominant.delta) && sample.revision > dominant.revision)) {
          dominant = sample;
        }
      }
    }

    const baseHeight = this.distantBaseHeights[logicalIndex];
    const height = baseHeight + (dominant?.delta || 0);
    const x = (ix / DISTANT_SEGMENTS_X) * TORUS_SIZE_X;
    const z = (iz / DISTANT_SEGMENTS_Z) * TORUS_SIZE_Z;
    bendPoint(x, height + 0.65, z, this.distantPoint);
    const shade = THREE.MathUtils.clamp(0.82 + (height - TORUS_GREF) * 0.012, 0.68, 1.0);
    this.distantColor.setHex(dominant?.color ?? DISTANT_TERRAIN_COLOR).multiplyScalar(shade);

    const geometry = this.distantSurface.geometry;
    const positions = geometry.getAttribute('position');
    const colors = geometry.getAttribute('color');
    const heights = geometry.getAttribute('terrainHeight');
    const editMasks = geometry.getAttribute('terrainEditMask');
    const stride = DISTANT_SEGMENTS_Z + 1;
    this.forEachDistantSeamCopy(ix, iz, (copyX, copyZ) => {
      const vertexIndex = copyX * stride + copyZ;
      positions.setXYZ(vertexIndex, this.distantPoint.x, this.distantPoint.y, this.distantPoint.z);
      colors.setXYZ(vertexIndex, this.distantColor.r, this.distantColor.g, this.distantColor.b);
      heights.setX(vertexIndex, height);
      editMasks.setX(vertexIndex, dominant ? 1 : 0);
      changedPositions.add(vertexIndex);
      changedColors.add(vertexIndex);
      changedHeights.add(vertexIndex);
      changedEditMasks.add(vertexIndex);
    });
  }

  private recomputeDistantNormal(logicalIndex, changedNormals) {
    const ix = Math.floor(logicalIndex / DISTANT_SEGMENTS_Z);
    const iz = logicalIndex % DISTANT_SEGMENTS_Z;
    const xm = (ix - 1 + DISTANT_SEGMENTS_X) % DISTANT_SEGMENTS_X;
    const xp = (ix + 1) % DISTANT_SEGMENTS_X;
    const zm = (iz - 1 + DISTANT_SEGMENTS_Z) % DISTANT_SEGMENTS_Z;
    const zp = (iz + 1) % DISTANT_SEGMENTS_Z;
    const stride = DISTANT_SEGMENTS_Z + 1;
    const positions = this.distantSurface.geometry.getAttribute('position');
    const normals = this.distantSurface.geometry.getAttribute('normal');

    this.distantNeighborA.fromBufferAttribute(positions, xp * stride + iz);
    this.distantNeighborB.fromBufferAttribute(positions, xm * stride + iz);
    this.distantTangentX.subVectors(this.distantNeighborA, this.distantNeighborB);
    this.distantNeighborA.fromBufferAttribute(positions, ix * stride + zp);
    this.distantNeighborB.fromBufferAttribute(positions, ix * stride + zm);
    this.distantTangentZ.subVectors(this.distantNeighborA, this.distantNeighborB);
    // Reversed X/Z winding in buildDistantSurface means outward = dZ × dX.
    this.distantNormal.crossVectors(this.distantTangentZ, this.distantTangentX).normalize();

    this.forEachDistantSeamCopy(ix, iz, (copyX, copyZ) => {
      const vertexIndex = copyX * stride + copyZ;
      normals.setXYZ(vertexIndex, this.distantNormal.x, this.distantNormal.y, this.distantNormal.z);
      changedNormals.add(vertexIndex);
    });
  }

  private markDistantAttributeRanges(attribute, changedIndices) {
    if (changedIndices.size === 0) return;
    const sorted = [...changedIndices].sort((a, b) => a - b);
    attribute.clearUpdateRanges();
    let start = sorted[0];
    let previous = start;
    for (let i = 1; i <= sorted.length; i++) {
      const current = sorted[i];
      if (current === previous + 1) {
        previous = current;
        continue;
      }
      attribute.addUpdateRange(start * attribute.itemSize, (previous - start + 1) * attribute.itemSize);
      start = current;
      previous = current;
    }
    attribute.needsUpdate = true;
  }

  /**
   * Flush at most 48 coalesced columns every 200 ms. No full-ring rebuild,
   * normal recomputation, or buffer upload occurs during an individual edit.
   */
  flushDistantSurfaceUpdates(force = false) {
    if (this.distantPendingColumns.size === 0) return 0;
    const now = Date.now();
    if (!force && now - this.distantLastFlushAt < DISTANT_UPDATE_INTERVAL_MS) return 0;
    this.distantLastFlushAt = now;

    const dirtyVertices = new Set<number>();
    let processed = 0;
    for (const [columnKey, column] of this.distantPendingColumns) {
      this.distantPendingColumns.delete(columnKey);
      this.updateDistantColumnSample(columnKey, column.x, column.z, dirtyVertices);
      processed++;
      if (processed >= DISTANT_COLUMNS_PER_FLUSH) break;
    }

    const changedPositions = new Set<number>();
    const changedColors = new Set<number>();
    const changedHeights = new Set<number>();
    const changedEditMasks = new Set<number>();
    const dirtyNormals = new Set<number>();
    for (const logicalIndex of dirtyVertices) {
      this.writeDistantVertex(
        logicalIndex,
        changedPositions,
        changedColors,
        changedHeights,
        changedEditMasks
      );
      const ix = Math.floor(logicalIndex / DISTANT_SEGMENTS_Z);
      const iz = logicalIndex % DISTANT_SEGMENTS_Z;
      dirtyNormals.add(logicalIndex);
      dirtyNormals.add(((ix - 1 + DISTANT_SEGMENTS_X) % DISTANT_SEGMENTS_X) * DISTANT_SEGMENTS_Z + iz);
      dirtyNormals.add(((ix + 1) % DISTANT_SEGMENTS_X) * DISTANT_SEGMENTS_Z + iz);
      dirtyNormals.add(ix * DISTANT_SEGMENTS_Z + ((iz - 1 + DISTANT_SEGMENTS_Z) % DISTANT_SEGMENTS_Z));
      dirtyNormals.add(ix * DISTANT_SEGMENTS_Z + ((iz + 1) % DISTANT_SEGMENTS_Z));
    }

    const changedNormals = new Set<number>();
    for (const logicalIndex of dirtyNormals) this.recomputeDistantNormal(logicalIndex, changedNormals);
    const geometry = this.distantSurface.geometry;
    this.markDistantAttributeRanges(geometry.getAttribute('position'), changedPositions);
    this.markDistantAttributeRanges(geometry.getAttribute('color'), changedColors);
    this.markDistantAttributeRanges(geometry.getAttribute('terrainHeight'), changedHeights);
    this.markDistantAttributeRanges(geometry.getAttribute('terrainEditMask'), changedEditMasks);
    this.markDistantAttributeRanges(geometry.getAttribute('normal'), changedNormals);
    this.distantLodRevision++;
    return processed;
  }

  static getChunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  getChunk(cx, cz) {
    return this.chunks.get(World.getChunkKey(cx, cz)) || null;
  }

  getOrCreateChunk(cx, cz) {
    cx = wrapChunkX(cx);
    cz = wrapChunkZ(cz);
    const key = World.getChunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz, this);
      this.chunks.set(key, chunk);
      this.terrainGen.generateChunk(chunk);
      let restoredStandard = 0;
      for (const edit of this.editPersistence?.getStandardEditsForChunk(cx, cz) ?? []) {
        const lx = edit.x - cx * CHUNK_SIZE_X;
        const lz = edit.z - cz * CHUNK_SIZE_Z;
        if (chunk.setLocalBlock(lx, edit.y, lz, edit.block, edit.color)) {
          restoredStandard++;
          this.queueDistantSurfaceUpdate(edit.x, edit.z);
        }
      }
      if (restoredStandard > 0) {
        chunk.hasUserEdits = true;
        this.terrainVersion += restoredStandard;
      }
      this.dirtyChunks.add(chunk);
    }
    return chunk;
  }

  worldToChunkCoords(wx, wz) {
    wx = wrapX(wx);
    wz = wrapZ(wz);
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    const lx = wx - cx * CHUNK_SIZE_X;
    const lz = wz - cz * CHUNK_SIZE_Z;
    return { cx, cz, lx, lz };
  }

  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_SIZE_Y) return BlockTypes.AIR;
    const { cx, cz, lx, lz } = this.worldToChunkCoords(wx, wz);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return BlockTypes.AIR;
    return chunk.getLocalBlock(lx, wy, lz);
  }

  getBlockColor(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_SIZE_Y) return DEFAULT_BLOCK_COLOR;
    const { cx, cz, lx, lz } = this.worldToChunkCoords(wx, wz);
    const chunk = this.getChunk(cx, cz);
    return chunk ? chunk.getLocalColor(lx, wy, lz) : DEFAULT_BLOCK_COLOR;
  }

  setBlock(wx, wy, wz, blockType, updateMesh = true, color = DEFAULT_BLOCK_COLOR) {
    if (wy < 0 || wy >= CHUNK_SIZE_Y) return false;
    const { cx, cz, lx, lz } = this.worldToChunkCoords(wx, wz);
    const chunk = this.getOrCreateChunk(cx, cz);
    let clearedMicro = 0;
    if (blockType !== BlockTypes.AIR && this.microVoxels.cells.size > 0) {
      clearedMicro = this.microVoxels.clearStandardCell(wrapX(wx), wy, wrapZ(wz));
    }
    const normalizedColor = normalizeColor(color);
    const changed = chunk.setLocalBlock(lx, wy, lz, blockType, normalizedColor);
    if (changed || clearedMicro > 0) chunk.hasUserEdits = true;
    if (changed && updateMesh) {
      this.dirtyChunks.add(chunk);
    }
    if (changed || clearedMicro > 0) {
      this.terrainVersion++;
      this.queueDistantSurfaceUpdate(wx, wz);
    }
    if (changed) {
      this.editPersistence?.recordStandard(wx, wy, wz, blockType, normalizedColor);
    }
    if (clearedMicro > 0) {
      this.editPersistence?.removeMicroStandardCell(wx, wy, wz);
    }
    return changed;
  }

  setBlockColor(wx, wy, wz, color, updateMesh = true) {
    const block = this.getBlock(wx, wy, wz);
    if (block === BlockTypes.AIR) return false;
    return this.setBlock(wx, wy, wz, block, updateMesh, color);
  }

  subdivideBlock(wx, wy, wz) {
    wx = wrapX(wx);
    wz = wrapZ(wz);
    const block = this.getBlock(wx, wy, wz);
    if (block === BlockTypes.AIR) return 0;
    const color = this.getBlockColor(wx, wy, wz);
    this.setBlock(wx, wy, wz, BlockTypes.AIR, true);
    const n = this.microVoxels.subdivide(wx, wy, wz, color);
    if (n > 0) {
      const baseX = wrapX(wx) * MICRO_DIVISIONS;
      const baseY = wy * MICRO_DIVISIONS;
      const baseZ = wrapZ(wz) * MICRO_DIVISIONS;
      for (let dx = 0; dx < MICRO_DIVISIONS; dx++) {
        for (let dy = 0; dy < MICRO_DIVISIONS; dy++) {
          for (let dz = 0; dz < MICRO_DIVISIONS; dz++) {
            this.editPersistence?.recordMicro(baseX + dx, baseY + dy, baseZ + dz, color);
          }
        }
      }
      this.terrainVersion++;
    }
    return n;
  }

  setMicroBlock(mx, my, mz, color = DEFAULT_BLOCK_COLOR, part = null) {
    if (my < 0 || my >= CHUNK_SIZE_Y * MICRO_DIVISIONS) return false;
    mx = wrapMicroX(mx);
    mz = wrapMicroZ(mz);
    const wx = Math.floor(mx / MICRO_DIVISIONS);
    const wy = Math.floor(my / MICRO_DIVISIONS);
    const wz = Math.floor(mz / MICRO_DIVISIONS);
    if (this.getBlock(wx, wy, wz) !== BlockTypes.AIR) return false;
    const ok = this.microVoxels.set(mx, my, mz, color, part);
    if (ok) {
      const persistedColor = this.microVoxels.get(mx, my, mz);
      this.editPersistence?.recordMicro(mx, my, mz, persistedColor, part);
      this.terrainVersion++;
      this.queueDistantSurfaceUpdate(wx, wz);
    }
    return ok;
  }

  /** Read a microblock by integer microcell index (five microcells per standard cell). */
  getMicroBlock(mx, my, mz) {
    const color = this.microVoxels.get(wrapMicroX(mx), my, wrapMicroZ(mz));
    if (color === null || color === undefined) return null;
    return { block: BlockTypes.COLOR_BLOCK, color };
  }

  removeMicroBlock(mx, my, mz) {
    mx = wrapMicroX(mx);
    mz = wrapMicroZ(mz);
    const removed = this.microVoxels.delete(mx, my, mz);
    if (removed) {
      this.editPersistence?.removeMicro(mx, my, mz);
      this.terrainVersion++;
      this.queueDistantSurfaceUpdate(
        Math.floor(mx / MICRO_DIVISIONS),
        Math.floor(mz / MICRO_DIVISIONS)
      );
    }
    return removed;
  }

  clearMicroStandardCell(wx, wy, wz) {
    const removed = this.microVoxels.clearStandardCell(wrapX(wx), wy, wrapZ(wz));
    if (removed) {
      this.editPersistence?.removeMicroStandardCell(wx, wy, wz);
      this.terrainVersion++;
      this.queueDistantSurfaceUpdate(wx, wz);
    }
    return removed;
  }

  hasMicroInStandardCell(wx, wy, wz) {
    return this.microVoxels.hasAnyInStandardCell(wrapX(wx), wy, wrapZ(wz));
  }

  raycastMicro(origin, direction, maxDistance = 10) {
    return this.microVoxels.raycast(origin, direction, maxDistance);
  }

  getMicroBlocksInAABB(aabb) {
    return this.microVoxels.getCellsInAABB(aabb);
  }

  /**
   * Bent-space aiming ray for standard terrain. Sampling only discovers nearby
   * occupied candidates; the final result comes from an exact intersection with
   * the same bent face triangles that LowPolyMesher sends to the GPU.
   */
  raycastBent(originBent, dirBent, maxDistance = 8) {
    const result = this.raycastBentVoxelFaces(
      originBent,
      dirBent,
      maxDistance,
      1,
      (x, y, z) => this.getBlock(x, y, z),
      value => value !== BlockTypes.AIR
    );
    if (!result) return { hit: false };

    const { x, y, z } = result.cell;
    const normal = result.normal;
    return {
      hit: true,
      kind: 'standard',
      hitPos: { x, y, z },
      placePos: { x: x + normal.x, y: y + normal.y, z: z + normal.z },
      normal,
      block: result.value,
      color: this.getBlockColor(x, y, z),
      size: 1,
      distance: result.distance,
      entry: result.entry
    };
  }

  /**
   * Exact bent-face raycast for 0.2 m micro voxels.
   */
  raycastMicroBent(originBent, dirBent, maxDistance = 8) {
    const result = this.raycastBentVoxelFaces(
      originBent,
      dirBent,
      maxDistance,
      MICRO_DIVISIONS,
      (mx, my, mz) => this.microVoxels.get(mx, my, mz),
      value => value !== null && value !== undefined
    );
    if (!result) return { hit: false };

    const { x: mx, y: my, z: mz } = result.cell;
    const normal = result.normal;
    return {
      hit: true,
      kind: 'micro',
      microPos: { x: mx, y: my, z: mz },
      hitPos: {
        x: mx / MICRO_DIVISIONS,
        y: my / MICRO_DIVISIONS,
        z: mz / MICRO_DIVISIONS
      },
      placeMicroPos: {
        x: mx + normal.x,
        y: my + normal.y,
        z: mz + normal.z
      },
      normal,
      color: result.value,
      size: 1 / MICRO_DIVISIONS,
      distance: result.distance,
      entry: result.entry
    };
  }

  /**
   * Discover occupied cells along the inverse-bent screen ray, then intersect
   * their exposed faces exactly in bent space. The one-cell neighborhood makes
   * grazing hits independent of the discovery step size.
   */
  raycastBentVoxelFaces(originBent, dirBent, maxDistance, divisions, getValue, isOccupied) {
    const direction = dirBent.clone().normalize();
    const ray = new THREE.Ray(originBent.clone(), direction);
    const cellSize = 1 / divisions;
    // Candidate discovery can be coarser than the cell because every sample
    // checks its full one-cell neighborhood; exact triangles decide the hit.
    const step = Math.min(0.25, cellSize);
    const cappedDistance = Math.min(maxDistance, 32);
    const periodX = TORUS_SIZE_X * divisions;
    const periodZ = TORUS_SIZE_Z * divisions;
    const maxY = CHUNK_SIZE_Y * divisions;
    const candidates = new Map();
    const p = this.rayBentPoint;
    const flat = this.rayFlatPoint;

    for (let t = 0; t <= cappedDistance + step; t += step) {
      p.copy(originBent).addScaledVector(direction, Math.min(t, cappedDistance));
      unbendPoint(p.x, p.y, p.z, flat);
      const sampleX = Math.floor(flat.x * divisions);
      const sampleY = Math.floor(flat.y * divisions);
      const sampleZ = Math.floor(flat.z * divisions);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const y = sampleY + dy;
          if (y < 0 || y >= maxY) continue;
          for (let dz = -1; dz <= 1; dz++) {
            const x = ((sampleX + dx) % periodX + periodX) % periodX;
            const z = ((sampleZ + dz) % periodZ + periodZ) % periodZ;
            const key = `${x},${y},${z}`;
            if (candidates.has(key)) continue;
            const value = getValue(x, y, z);
            if (isOccupied(value)) candidates.set(key, { x, y, z, value });
          }
        }
      }
    }

    const barycentric = new THREE.Vector3();
    let closest = null;
    let closestDistance = cappedDistance;
    for (const cell of candidates.values()) {
      const originX = cell.x * cellSize;
      const originY = cell.y * cellSize;
      const originZ = cell.z * cellSize;

      for (const face of BENT_VOXEL_RAYCAST_FACES) {
        const [nx, ny, nz] = face.normal;
        const neighborX = ((cell.x + nx) % periodX + periodX) % periodX;
        const neighborZ = ((cell.z + nz) % periodZ + periodZ) % periodZ;
        if (isOccupied(getValue(neighborX, cell.y + ny, neighborZ))) continue;

        const flatCorners = face.quad.map(([x, y, z]) => new THREE.Vector3(
          originX + x * cellSize,
          originY + y * cellSize,
          originZ + z * cellSize
        ));
        const bentCorners = flatCorners.map(corner => bendPoint(corner.x, corner.y, corner.z));

        for (const [ia, ib, ic] of [[0, 1, 2], [0, 2, 3]]) {
          const bentPoint = new THREE.Vector3();
          if (!intersectTriangleInclusive(
            ray, bentCorners[ia], bentCorners[ib], bentCorners[ic], bentPoint, barycentric
          )) continue;
          const distance = originBent.distanceTo(bentPoint);
          if (distance > closestDistance + 1e-9) continue;
          const entry = flatCorners[ia].clone().multiplyScalar(barycentric.x)
            .addScaledVector(flatCorners[ib], barycentric.y)
            .addScaledVector(flatCorners[ic], barycentric.z);
          closestDistance = distance;
          closest = {
            cell,
            value: cell.value,
            normal: { x: nx, y: ny, z: nz },
            distance,
            entry: { x: entry.x, y: entry.y, z: entry.z }
          };
        }
      }
    }
    return closest;
  }

  /** Sample the hit-face normal, pointing from the hit cell toward the previous air cell. */
  static _faceNormal(lastAir, hx, hy, hz, dirFlat, periodX = 0, periodZ = 0) {
    if (lastAir) {
      const dx = World._wrappedDelta(lastAir.x, hx, periodX);
      const dy = hy - lastAir.y;
      const dz = World._wrappedDelta(lastAir.z, hz, periodZ);
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const az = Math.abs(dz);
      if (ax >= ay && ax >= az && ax > 0) return { x: -Math.sign(dx), y: 0, z: 0 };
      if (ay >= ax && ay >= az && ay > 0) return { x: 0, y: -Math.sign(dy), z: 0 };
      if (az > 0) return { x: 0, y: 0, z: -Math.sign(dz) };
    }
    const d = {
      x: -(dirFlat ? dirFlat.x : 0),
      y: -(dirFlat ? dirFlat.y : 0),
      z: -(dirFlat ? dirFlat.z : 0)
    };
    const ax = Math.abs(d.x);
    const ay = Math.abs(d.y);
    const az = Math.abs(d.z);
    if (ax >= ay && ax >= az) return { x: Math.sign(d.x) || 0, y: 0, z: 0 };
    if (ay >= az) return { x: 0, y: Math.sign(d.y) || 0, z: 0 };
    return { x: 0, y: 0, z: Math.sign(d.z) || 0 };
  }

  static _wrappedDelta(from, to, period) {
    let delta = to - from;
    if (period > 0) {
      if (delta > period / 2) delta -= period;
      else if (delta < -period / 2) delta += period;
    }
    return delta;
  }

  /** Approximate the sampled ray's exact face entry while retaining tangential aim. */
  static _entryPoint(flat, hx, hy, hz, normal, cellSize) {
    const entry = { x: flat.x, y: flat.y, z: flat.z };
    if (normal.x) entry.x = (hx + (normal.x > 0 ? 1 : 0)) * cellSize;
    if (normal.y) entry.y = (hy + (normal.y > 0 ? 1 : 0)) * cellSize;
    if (normal.z) entry.z = (hz + (normal.z > 0 ? 1 : 0)) * cellSize;
    return entry;
  }

  markChunkDirty(cx, cz) {
    cx = wrapChunkX(cx);
    cz = wrapChunkZ(cz);
    const chunk = this.getChunk(cx, cz);
    if (chunk) {
      chunk.isDirty = true;
      this.dirtyChunks.add(chunk);
    }
  }

  /**
   * Update and regenerate dirty chunks
   */
  updateChunksAround(playerX, playerZ) {
    const frameWorkStartedAt = performance.now();
    this.processPendingRemoteChunkUpdates(frameWorkStartedAt);
    const centerCx = Math.floor(wrapX(playerX) / CHUNK_SIZE_X);
    const centerCz = Math.floor(wrapZ(playerZ) / CHUNK_SIZE_Z);
    const r = this.renderDistance;

    // Recompute the streaming window only after crossing a chunk boundary. The
    // old implementation repeated 169 modulo/map lookups on every frame and
    // kept every visited mesh resident forever.
    const streamCenterKey = `${centerCx},${centerCz}`;
    if (streamCenterKey !== this.lastStreamCenterKey) {
      const nextActive = new Set<string>();
      const pending: { cx: number; cz: number; distanceSq: number }[] = [];
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const cx = wrapChunkX(centerCx + dx);
          const cz = wrapChunkZ(centerCz + dz);
          const key = World.getChunkKey(cx, cz);
          nextActive.add(key);
          this.pendingChunkEvictions.delete(key);
          const chunk = this.getChunk(cx, cz);
          if (!chunk) {
            pending.push({ cx, cz, distanceSq: dx * dx + dz * dz });
          } else if (chunk.mesh) {
            chunk.mesh.visible = true;
          } else if (!chunk.mesh) {
            chunk.isDirty = true;
            this.dirtyChunks.add(chunk);
          }
        }
      }

      for (const [key, chunk] of this.chunks) {
        if (nextActive.has(key)) continue;
        this.dirtyChunks.delete(chunk);
        if (chunk.mesh) chunk.mesh.visible = false;
        this.pendingChunkEvictions.set(key, chunk);
      }

      this.activeChunkKeys = nextActive;
      this.pendingStreamChunks = pending.sort((a, b) => a.distanceSq - b.distanceSq);
      this.lastStreamCenterKey = streamCenterKey;
    }

    this.processPendingChunkEvictions(frameWorkStartedAt);

    // Player-authored and remote micro edits are visible work; service one
    // dirty micro mesh before spending the remaining frame budget on new
    // procedural chunks.
    if (
      performance.now() - frameWorkStartedAt < STREAM_WORK_BUDGET_MS
      && this.microVoxels.updateMesh(MAX_MICRO_MESH_CHUNKS_PER_FRAME)
    ) {
      for (const mesh of this.microVoxels.takeRecentlyRebuiltMeshes()) {
        hookSceneMaterials(mesh);
      }
    }

    // Allocate/generate the nearest missing chunks progressively instead of
    // synchronously constructing the entire window during one frame.
    let generated = 0;
    while (this.pendingStreamChunks.length > 0 && generated < MAX_STREAM_CHUNKS_PER_FRAME) {
      if (performance.now() - frameWorkStartedAt >= STREAM_WORK_BUDGET_MS) break;
      const next = this.pendingStreamChunks.shift();
      if (!next) break;
      const { cx, cz } = next;
      const key = World.getChunkKey(cx, cz);
      if (!this.activeChunkKeys.has(key)) continue;
      const chunk = this.getOrCreateChunk(cx, cz);
      if (!chunk.mesh) {
        chunk.isDirty = true;
        this.dirtyChunks.add(chunk);
      }
      generated++;
    }

    // Process dirty chunks
    let updates = 0;
    const maxUpdatesPerFrame = MAX_CHUNK_MESHES_PER_FRAME;

    for (const chunk of this.dirtyChunks) {
      if (updates >= maxUpdatesPerFrame) break;
      if (performance.now() - frameWorkStartedAt >= STREAM_WORK_BUDGET_MS) break;
      const key = World.getChunkKey(chunk.cx, chunk.cz);
      if (!this.activeChunkKeys.has(key)) continue;

      if (chunk.mesh) {
        this.disposeChunkMesh(chunk);
      }

      chunk.mesh = this.mesher.buildChunkMesh(chunk);
      // Bent-space bounding-sphere cache for frustum culling.
      chunk.mesh.userData.bentSphere = computeChunkBentSphere(chunk.cx, chunk.cz);
      // A rebuilt chunk must receive both its torus vertex shader and bent
      // customDepthMaterial before it is attached to the live scene. Waiting
      // for SceneRenderer's low-frequency material scan lets one or more
      // shadow passes render the replacement in flat coordinates, producing a
      // full-screen light/dark flash whenever terrain is destroyed.
      hookSceneMaterials(chunk.mesh);
      // cullChunks handles the parent Group in bent space. Its child meshes must
      // not be culled a second time with their flat-space geometry spheres.
      chunk.mesh.traverse((child) => {
        if (child.isMesh) child.frustumCulled = false;
      });
      this.worldGroup.add(chunk.mesh);

      chunk.isDirty = false;
      this.dirtyChunks.delete(chunk);
      updates++;
    }

    if (performance.now() - frameWorkStartedAt < STREAM_WORK_BUDGET_MS) {
      this.flushDistantSurfaceUpdates();
    }
  }

  setRenderDistance(distance) {
    this.renderDistance = Math.max(3, Math.min(24, Math.round(Number(distance)) || DEFAULT_RENDER_DISTANCE));
    this.lastStreamCenterKey = null;
    this.syncDistantLodUniforms();
  }

  syncDistantLodUniforms() {
    const shader = (this.distantSurface?.material as any)?.userData?.shader;
    if (shader?.uniforms) {
      const r = this.renderDistance;
      if (shader.uniforms.uLodDiscardRadius) shader.uniforms.uLodDiscardRadius.value = Math.max(48.0, (r - 0.75) * 16.0);
      if (shader.uniforms.uNearRadius) shader.uniforms.uNearRadius.value = Math.max(150.0, (r - 0.75) * 16.0);
      if (shader.uniforms.uNearEndRadius) shader.uniforms.uNearEndRadius.value = Math.max(400.0, r * 16.0 * 2.6);
      if (shader.uniforms.uAtmoStart) shader.uniforms.uAtmoStart.value = Math.max(900.0, r * 16.0 * 5.0);
      if (shader.uniforms.uAtmoEnd) shader.uniforms.uAtmoEnd.value = Math.max(2600.0, r * 16.0 * 18.0);
    }
  }

  disposeChunkMesh(chunk) {
    if (!chunk?.mesh) return;
    this.worldGroup.remove(chunk.mesh);
    chunk.mesh.traverse((child) => {
      if (child.isMesh && child.geometry) child.geometry.dispose();
    });
    chunk.mesh = null;
  }

  private processPendingChunkEvictions(frameWorkStartedAt: number) {
    let processed = 0;
    for (const [key, chunk] of this.pendingChunkEvictions) {
      if (processed >= MAX_CHUNK_EVICTIONS_PER_FRAME) break;
      if (performance.now() - frameWorkStartedAt >= STREAM_WORK_BUDGET_MS) break;
      this.pendingChunkEvictions.delete(key);
      if (this.activeChunkKeys.has(key)) continue;
      if (chunk.mesh) this.disposeChunkMesh(chunk);
      this.dirtyChunks.delete(chunk);
      if (!chunk.hasUserEdits) this.chunks.delete(key);
      processed++;
    }
  }

  /**
   * Fast 3D DDA Voxel Raycaster
   */
  raycast(origin, direction, maxDistance = 10) {
    const startX = origin.x;
    const startY = origin.y;
    const startZ = origin.z;

    const dirX = direction.x;
    const dirY = direction.y;
    const dirZ = direction.z;

    let x = Math.floor(startX);
    let y = Math.floor(startY);
    let z = Math.floor(startZ);

    const stepX = Math.sign(dirX);
    const stepY = Math.sign(dirY);
    const stepZ = Math.sign(dirZ);

    const tDeltaX = stepX !== 0 ? Math.abs(1 / dirX) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dirY) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dirZ) : Infinity;

    let tMaxX = stepX === 0 ? Infinity : stepX > 0
      ? (Math.floor(startX) + 1 - startX) * tDeltaX
      : (startX - Math.floor(startX)) * tDeltaX;
    let tMaxY = stepY === 0 ? Infinity : stepY > 0
      ? (Math.floor(startY) + 1 - startY) * tDeltaY
      : (startY - Math.floor(startY)) * tDeltaY;
    let tMaxZ = stepZ === 0 ? Infinity : stepZ > 0
      ? (Math.floor(startZ) + 1 - startZ) * tDeltaZ
      : (startZ - Math.floor(startZ)) * tDeltaZ;

    let normal = { x: 0, y: 0, z: 0 };
    let distance = 0;

    while (distance <= maxDistance) {
      const block = this.getBlock(x, y, z);
      if (block !== BlockTypes.AIR) {
        return {
          hit: true,
          kind: 'standard',
          hitPos: { x, y, z },
          placePos: { x: x + normal.x, y: y + normal.y, z: z + normal.z },
          normal,
          block,
          color: this.getBlockColor(x, y, z),
          size: 1,
          distance
        };
      }

      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          distance = tMaxX;
          tMaxX += tDeltaX;
          x = wrapX(x + stepX);
          normal = { x: -stepX, y: 0, z: 0 };
        } else {
          distance = tMaxZ;
          tMaxZ += tDeltaZ;
          z = wrapZ(z + stepZ);
          normal = { x: 0, y: 0, z: -stepZ };
        }
      } else {
        if (tMaxY < tMaxZ) {
          distance = tMaxY;
          tMaxY += tDeltaY;
          y += stepY;
          normal = { x: 0, y: -stepY, z: 0 };
        } else {
          distance = tMaxZ;
          tMaxZ += tDeltaZ;
          z = wrapZ(z + stepZ);
          normal = { x: 0, y: 0, z: -stepZ };
        }
      }
    }

    return { hit: false };
  }

  /**
   * Super Glue: BFS Connected Component Flood Fill
   * Returns array of {x, y, z, blockType}
   */
  getConnectedBlocks(startX, startY, startZ, maxBlocks = 512) {
    const originBlock = this.getBlock(startX, startY, startZ);
    if (!originBlock || originBlock === BlockTypes.AIR) return [];

    const queue = [{ x: startX, y: startY, z: startZ }];
    const visited = new Set();
    const result = [];
    const originKey = `${wrapX(startX)},${startY},${wrapZ(startZ)}`;
    visited.add(originKey);

    const neighbors = [
      { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }
    ];

    while (queue.length > 0 && result.length < maxBlocks) {
      const current = queue.shift();
      const b = this.getBlock(current.x, current.y, current.z);

      if (b !== BlockTypes.AIR) {
        result.push({
          x: wrapX(current.x),
          y: current.y,
          z: wrapZ(current.z),
          block: b,
          color: this.getBlockColor(current.x, current.y, current.z)
        });

        for (const n of neighbors) {
          const nx = current.x + n.x;
          const ny = current.y + n.y;
          const nz = current.z + n.z;
          const key = `${wrapX(nx)},${ny},${wrapZ(nz)}`;

          if (!visited.has(key)) {
            visited.add(key);
            const nb = this.getBlock(nx, ny, nz);
            if (nb !== BlockTypes.AIR) {
              queue.push({ x: nx, y: ny, z: nz });
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Extract region bounding box for contraption assembly
   */
  extractRegion(minX, minY, minZ, maxX, maxY, maxZ) {
    const blocks = [];
    const affectedChunks: Set<Chunk> = new Set();

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const block = this.getBlock(x, y, z);
          if (block !== BlockTypes.AIR) {
            blocks.push({
              worldX: x,
              worldY: y,
              worldZ: z,
              block,
              color: this.getBlockColor(x, y, z)
            });
            // Clear block from world
            this.setBlock(x, y, z, BlockTypes.AIR, false);
            const { cx, cz } = this.worldToChunkCoords(x, z);
            const chunk = this.getChunk(cx, cz);
            if (chunk) affectedChunks.add(chunk);
          }
        }
      }
    }

    // Mark affected chunks dirty to update meshes
    for (const chunk of affectedChunks) {
      chunk.isDirty = true;
      this.dirtyChunks.add(chunk);
    }

    return blocks;
  }

  extractMicroRegion(minX, minY, minZ, maxX, maxY, maxZ) {
    const extracted = this.microVoxels.extractRegion(minX, minY, minZ, maxX, maxY, maxZ);
    if (extracted.length > 0) {
      const columns = new Set<string>();
      for (const cell of extracted) {
        this.editPersistence?.removeMicro(cell.mx, cell.my, cell.mz);
        const x = Math.floor(cell.mx / MICRO_DIVISIONS);
        const z = Math.floor(cell.mz / MICRO_DIVISIONS);
        columns.add(`${x},${z}`);
      }
      for (const column of columns) {
        const [x, z] = column.split(',').map(Number);
        this.queueDistantSurfaceUpdate(x, z);
      }
      this.terrainVersion++;
    }
    return extracted;
  }

  /**
   * Remove and return microcells inside an inclusive integer micro-index box.
   * Unlike extractMicroRegion the bounds are 0.2 m grid coordinates, so a
   * single cell is addressed by equal min/max values without float artifacts.
   */
  extractMicroCellRegion(minMx, minMy, minMz, maxMx, maxMy, maxMz) {
    const extracted = this.microVoxels.extractCellsInBox(minMx, minMy, minMz, maxMx, maxMy, maxMz);
    if (extracted.length > 0) {
      const columns = new Set<string>();
      for (const cell of extracted) {
        this.editPersistence?.removeMicro(cell.mx, cell.my, cell.mz);
        const x = Math.floor(cell.mx / MICRO_DIVISIONS);
        const z = Math.floor(cell.mz / MICRO_DIVISIONS);
        columns.add(`${x},${z}`);
      }
      for (const column of columns) {
        const [x, z] = column.split(',').map(Number);
        this.queueDistantSurfaceUpdate(x, z);
      }
      this.terrainVersion++;
    }
    return extracted;
  }

  /** Force pending browser-local terrain edits to durable storage. */
  flushPersistedEdits() {
    return this.editPersistence?.flush() ?? false;
  }

  /**
   * Coalesce network/AOI updates and apply a small bounded batch per animation
   * frame. A direct synchronous entry point remains for tests and explicit
   * callers that need immediate visibility.
   */
  queueRemoteChunkUpdates(updates: TerrainEditChunk[]) {
    if (!Array.isArray(updates) || updates.length === 0) return;
    for (const update of updates) {
      const cx = wrapChunkX(update.chunk_x);
      const cz = wrapChunkZ(update.chunk_z);
      const key = World.getChunkKey(cx, cz);
      const revision = Number.isFinite(Number(update.revision)) ? Number(update.revision) : 0;
      if ((this.remoteChunkRevisions.get(key) ?? -1) >= revision) continue;
      const previous = this.pendingRemoteChunkUpdates.get(key);
      if (previous && Number(previous.revision) >= revision) continue;
      this.pendingRemoteChunkUpdates.set(key, {
        chunk_x: cx,
        chunk_z: cz,
        revision,
        standard: Array.isArray(update.standard) ? update.standard : [],
        micro: Array.isArray(update.micro) ? update.micro : [],
      });
    }
  }

  private processPendingRemoteChunkUpdates(frameWorkStartedAt: number) {
    let processed = 0;
    for (const [key, update] of this.pendingRemoteChunkUpdates) {
      if (processed >= MAX_REMOTE_CHUNKS_PER_FRAME) break;
      if (processed > 0 && performance.now() - frameWorkStartedAt >= STREAM_WORK_BUDGET_MS) break;
      this.pendingRemoteChunkUpdates.delete(key);
      this.applyRemoteChunkUpdate(update);
      processed++;
    }
  }

  applyRemoteChunkUpdates(updates: TerrainEditChunk[]) {
    if (!Array.isArray(updates) || updates.length === 0) return;
    for (const update of updates) this.applyRemoteChunkUpdate(update);
  }

  private applyRemoteChunkUpdate(update: TerrainEditChunk) {
    const cx = wrapChunkX(update.chunk_x);
    const cz = wrapChunkZ(update.chunk_z);
    const key = World.getChunkKey(cx, cz);
    const revision = Number.isFinite(Number(update.revision)) ? Number(update.revision) : 0;
    if ((this.remoteChunkRevisions.get(key) ?? -1) >= revision) return;

    this.editPersistence?.replaceRemoteChunk({
      chunk_x: cx,
      chunk_z: cz,
      revision,
      standard: update.standard,
      micro: update.micro,
    });

    this.microVoxels.clearChunk(cx, cz);

    const microEdits = this.editPersistence
      ? [...this.editPersistence.getMicroEditsForChunk(cx, cz)]
      : (Array.isArray(update.micro) ? update.micro : [])
        .filter(edit => Array.isArray(edit) && edit.length >= 4)
        .map(edit => ({ mx: edit[0], my: edit[1], mz: edit[2], color: edit[3], part: edit[4] || null }));
    for (const edit of microEdits) {
      this.microVoxels.set(edit.mx, edit.my, edit.mz, edit.color, edit.part);
    }

    const standardEdits = this.editPersistence
      ? [...this.editPersistence.getStandardEditsForChunk(cx, cz)]
      : (Array.isArray(update.standard) ? update.standard : [])
        .filter(edit => Array.isArray(edit) && edit.length >= 5)
        .map(edit => ({ x: edit[0], y: edit[1], z: edit[2], block: edit[3], color: edit[4] }));

    // If chunk is currently loaded in memory, regenerate and apply standard blocks
    const chunk = this.chunks.get(key);
    if (chunk) {
      this.terrainGen.generateChunk(chunk);
      for (const edit of standardEdits) {
        const lx = edit.x - cx * CHUNK_SIZE_X;
        const lz = edit.z - cz * CHUNK_SIZE_Z;
        chunk.setLocalBlock(lx, edit.y, lz, edit.block, edit.color);
        this.queueDistantSurfaceUpdate(edit.x, edit.z);
      }
      chunk.hasUserEdits = true;
      chunk.isDirty = true;
      this.dirtyChunks.add(chunk);
    } else {
      for (const edit of standardEdits) {
        this.queueDistantSurfaceUpdate(edit.x, edit.z);
      }
    }
    this.remoteChunkRevisions.set(key, revision);
    this.terrainVersion++;
  }
}
