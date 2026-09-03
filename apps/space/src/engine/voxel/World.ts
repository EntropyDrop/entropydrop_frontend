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
import { DistantSurfaceLayer } from '../render/DistantSurfaceLayer.ts';
import type { SurfaceZoneSnapshot } from '../../bootstrap/SpaceSurfaceSnapshot.ts';
import {
  wrapX, wrapZ, wrapChunkX, wrapChunkZ, wrapMicroX, wrapMicroZ,
  bendPoint, unbendPoint, computeChunkBentSphere, hookSceneMaterials,
  TORUS_SIZE_X, TORUS_SIZE_Z
} from '../torus/TorusWorld.ts';

// Leave most of a 120 Hz frame's 8.33 ms budget for simulation, culling and
// rendering. Missing detailed chunks may take a few more frames to stream in,
// while the already-present distant surface prevents visible holes.
const STREAM_WORK_BUDGET_MS = 3;
const MAX_STREAM_CHUNKS_PER_FRAME = 2;
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
  distantSurface: DistantSurfaceLayer;
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

  constructor(
    scene,
    seed = 1337,
    persistenceOptions: WorldEditPersistenceOptions | null = null
  ) {
    this.scene = scene;
    this.chunks = new Map(); // key: "cx,cz" -> Chunk on the wrapped 1024x128 chunk grid.
    this.terrainGen = new TerrainGenerator(seed);
    this.mesher = new LowPolyMesher();

    // Keep 1 m voxel detail nearby. The backend's compact zone snapshots fill
    // one instanced far-surface layer without generating the world in-browser.
    this.renderDistance = DEFAULT_RENDER_DISTANCE;
    this.terrainVersion = 0;
    this.worldGroup = new THREE.Group();
    this.worldGroup.name = 'VoxelWorld';
    this.scene.add(this.worldGroup);
    this.distantSurface = new DistantSurfaceLayer();
    this.worldGroup.add(this.distantSurface.mesh);
    this.microVoxels = new MicroVoxelLayer();
    this.worldGroup.add(this.microVoxels.group);
    this.editPersistence = persistenceOptions?.worldId
      ? new WorldEditPersistence(persistenceOptions)
      : null;

    // Generated terrain contains no micro voxels, so its sparse authored layer
    // can be restored immediately. Standard edits are applied lazily below when
    // their chunks stream in.
    if (this.editPersistence) {
      let restoredMicro = 0;
      for (const edit of this.editPersistence.getMicroEdits()) {
        if (!this.microVoxels.set(edit.mx, edit.my, edit.mz, edit.color, edit.part)) continue;
        restoredMicro++;
      }
      this.terrainVersion += restoredMicro;
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
    }
    return removed;
  }

  clearMicroStandardCell(wx, wy, wz) {
    const removed = this.microVoxels.clearStandardCell(wrapX(wx), wy, wrapZ(wz));
    if (removed) {
      this.editPersistence?.removeMicroStandardCell(wx, wy, wz);
      this.terrainVersion++;
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
    this.distantSurface.setNearField(centerCx, centerCz, r);

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
            this.distantSurface.setDetailChunkReady(cx, cz, false);
            pending.push({ cx, cz, distanceSq: dx * dx + dz * dz });
          } else if (chunk.mesh) {
            chunk.mesh.visible = true;
            this.distantSurface.setDetailChunkReady(cx, cz, true);
          } else if (!chunk.mesh) {
            this.distantSurface.setDetailChunkReady(cx, cz, false);
            chunk.isDirty = true;
            this.dirtyChunks.add(chunk);
          }
        }
      }

      for (const [key, chunk] of this.chunks) {
        if (nextActive.has(key)) continue;
        this.dirtyChunks.delete(chunk);
        this.distantSurface.setDetailChunkReady(chunk.cx, chunk.cz, false);
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
      this.distantSurface.setDetailChunkReady(chunk.cx, chunk.cz, true);

      chunk.isDirty = false;
      this.dirtyChunks.delete(chunk);
      updates++;
    }

  }

  setRenderDistance(distance) {
    this.renderDistance = Math.max(3, Math.min(24, Math.round(Number(distance)) || DEFAULT_RENDER_DISTANCE));
    this.lastStreamCenterKey = null;
  }

  installSurfaceZone(zone: SurfaceZoneSnapshot) {
    this.distantSurface.installZone(zone);
  }

  finalizeSurfaceConnections() {
    return this.distantSurface.finalizeConnections();
  }

  removeSurfaceZone(zoneX: number, zoneZ: number) {
    this.distantSurface.removeZone(zoneX, zoneZ);
  }

  disposeChunkMesh(chunk) {
    if (!chunk?.mesh) return;
    this.distantSurface.setDetailChunkReady(chunk.cx, chunk.cz, false);
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
      for (const cell of extracted) {
        this.editPersistence?.removeMicro(cell.mx, cell.my, cell.mz);
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
      for (const cell of extracted) {
        this.editPersistence?.removeMicro(cell.mx, cell.my, cell.mz);
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
      }
      chunk.hasUserEdits = true;
      if (this.activeChunkKeys.has(key)) {
        chunk.isDirty = true;
        this.dirtyChunks.add(chunk);
      } else {
        if (chunk.mesh) this.disposeChunkMesh(chunk);
        this.pendingChunkEvictions.delete(key);
        chunk.isDirty = false;
      }
    }
    this.remoteChunkRevisions.set(key, revision);
    this.terrainVersion++;
  }
}
