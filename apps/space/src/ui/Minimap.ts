import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../engine/voxel/Chunk.ts';
import { MICRO_DIVISIONS } from '../engine/voxel/MicroVoxelLayer.ts';
import { TORUS_SIZE_X, TORUS_SIZE_Z, wrapX, wrapZ, wrapChunkX, wrapChunkZ } from '../engine/torus/TorusWorld.ts';

/**
 * Bottom-right minimap rendered on a top-down 2D canvas with seamless Torus wrap.
 * - Terrain: scans the highest standard or microblock in each loaded chunk column
 *   and draws its actual color; unloaded regions appear dark as fog of war.
 * - Entities: contraptions are dots, with the driven vehicle highlighted.
 * - Player: a white arrow points along camera yaw.
 * The terrain layer is rebuilt only after grid movement or voxel-version changes;
 * each frame redraws only the overlay.
 */
export class Minimap {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  world: any;
  contraptionManager: any;

  static SIZE = 192; // CSS px
  static RANGE = 96; // Covers ±96 cells, matching the guaranteed six-chunk render radius.
  static CELLS = 192; // 192x192 world cells at 1 px per cell; integer alignment prevents shimmer.
  static VOID_COLOR = [12, 16, 24]; // Unloaded region.

  terrainCanvas: HTMLCanvasElement;
  terrainCtx: CanvasRenderingContext2D;
  size = Minimap.SIZE;
  gridCenterX = 0;
  gridCenterZ = 0;
  lastVersion = -1;
  lastGridX = 0;
  lastGridZ = 0;
  lastRecompute = 0;
  heights: Int32Array = new Int32Array(Minimap.CELLS * Minimap.CELLS);
  colors: Uint32Array = new Uint32Array(Minimap.CELLS * Minimap.CELLS);
  imageData: ImageData | null = null;
  dpr = 1;

  constructor(parent: HTMLElement, world, contraptionManager) {
    this.world = world;
    this.contraptionManager = contraptionManager;

    this.container = document.createElement('div');
    this.container.className = 'minimap-container';
    this.container.innerHTML = '<canvas class="minimap-canvas"></canvas>';
    this.canvas = this.container.querySelector('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    parent.appendChild(this.container);

    this.terrainCanvas = document.createElement('canvas');
    this.terrainCanvas.width = Minimap.CELLS;
    this.terrainCanvas.height = Minimap.CELLS;
    this.terrainCtx = this.terrainCanvas.getContext('2d')!;
    this.imageData = this.terrainCtx.createImageData(Minimap.CELLS, Minimap.CELLS);

    this.applySize();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.applySize());
    }
  }

  applySize() {
    if (typeof window === 'undefined') return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.size = Math.max(96, Math.min(Minimap.SIZE, this.container.clientWidth - 8 || Minimap.SIZE));
    const size = this.size;
    this.canvas.width = size * this.dpr;
    this.canvas.height = size * this.dpr;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
  }

  /**
   * Called every frame.
   * @param playerPos Player world coordinates {x, z}.
   * @param yaw Camera yaw in radians using YXZ order.
   * @param isDriving Whether the player is driving.
   * @param drivenContraption The driven entity, or null.
   */
  update(playerPos, yaw, isDriving, drivenContraption) {
    const px = playerPos.x;
    const pz = playerPos.z;
    const now = performance.now();

    // Rebuild after integer-grid movement or voxel-version changes, throttled to
    // 150 ms so scripts that edit every frame cannot force continuous rebuilds.
    const gridX = Math.floor(px);
    const gridZ = Math.floor(pz);
    const version = this.world?.terrainVersion || 0;
    if ((gridX !== this.lastGridX || gridZ !== this.lastGridZ || version !== this.lastVersion || this.lastRecompute === 0) &&
        (now - this.lastRecompute >= 150 || this.lastRecompute === 0)) {
      this.recomputeTerrain(gridX, gridZ);
      this.lastGridX = gridX;
      this.lastGridZ = gridZ;
      this.lastVersion = version;
      this.lastRecompute = now;
    }

    // Composite the terrain layer, entities, and player every frame.
    const ctx = this.ctx;
    const size = this.size;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrainCanvas, 0, 0, Minimap.CELLS, Minimap.CELLS, 0, 0, size, size);

    // Entity dots with toroidal shortest displacement
    const scale = size / Minimap.CELLS;
    const list = this.contraptionManager?.contraptions || [];
    for (const c of list) {
      if (!c || !c.position) continue;
      let dx = wrapX(c.position.x) - wrapX(px);
      if (dx > TORUS_SIZE_X / 2) dx -= TORUS_SIZE_X;
      else if (dx < -TORUS_SIZE_X / 2) dx += TORUS_SIZE_X;

      let dz = wrapZ(c.position.z) - wrapZ(pz);
      if (dz > TORUS_SIZE_Z / 2) dz -= TORUS_SIZE_Z;
      else if (dz < -TORUS_SIZE_Z / 2) dz += TORUS_SIZE_Z;

      const cx = (dx + Minimap.RANGE) * scale;
      const cz = (dz + Minimap.RANGE) * scale;
      if (cx < 0 || cx > size || cz < 0 || cz > size) continue;
      const driven = isDriving && drivenContraption === c;
      ctx.beginPath();
      ctx.arc(cx, cz, driven ? 3.5 : 2.6, 0, Math.PI * 2);
      ctx.fillStyle = driven ? '#ffe066' : '#f2a93b';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(10, 12, 18, 0.9)';
      ctx.stroke();
      if (driven) {
        ctx.beginPath();
        ctx.arc(cx, cz, 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 224, 102, 0.7)';
        ctx.stroke();
      }
    }

    // Player arrow: world +X is right, +Z is down; camera heading is -sin(yaw), -cos(yaw).
    const ax = -Math.sin(yaw);
    const az = -Math.cos(yaw);
    const cx = size / 2;
    const cz = size / 2;
    const len = 9;
    const half = 4.5;
    ctx.beginPath();
    ctx.moveTo(cx + ax * len, cz + az * len);
    ctx.lineTo(cx - az * half, cz + ax * half);
    ctx.lineTo(cx + az * half, cz - ax * half);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(10, 12, 18, 0.85)';
    ctx.stroke();

    // North marker.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('N', size / 2, 5);
  }

  /** Rebuild the terrain layer on an offscreen canvas with toroidal wrap around integer world coordinates. */
  recomputeTerrain(centerX, centerZ) {
    const C = Minimap.CELLS;
    const halfRange = Minimap.RANGE;
    this.gridCenterX = centerX;
    this.gridCenterZ = centerZ;

    this.heights.fill(0);
    this.colors.fill(0);

    const world = this.world;
    if (!world || !world.chunks) return;

    const wrappedCenterX = wrapX(centerX);
    const wrappedCenterZ = wrapZ(centerZ);

    const centerChunkX = Math.floor(wrappedCenterX / CHUNK_SIZE_X);
    const centerChunkZ = Math.floor(wrappedCenterZ / CHUNK_SIZE_Z);
    const chunkRadius = Math.ceil(halfRange / CHUNK_SIZE_X); // 6 chunks covers ±96m

    // 1) Standard blocks: iterate chunks around the player using toroidal wrapping
    for (let dcx = -chunkRadius; dcx <= chunkRadius; dcx++) {
      const cx = wrapChunkX(centerChunkX + dcx);
      for (let dcz = -chunkRadius; dcz <= chunkRadius; dcz++) {
        const cz = wrapChunkZ(centerChunkZ + dcz);
        const chunk = world.getChunk ? world.getChunk(cx, cz) : world.chunks.get(`${cx},${cz}`);
        if (!chunk) continue;

        for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
          const cellWx = cx * CHUNK_SIZE_X + lx;
          let dx = cellWx - wrappedCenterX;
          if (dx > TORUS_SIZE_X / 2) dx -= TORUS_SIZE_X;
          else if (dx < -TORUS_SIZE_X / 2) dx += TORUS_SIZE_X;

          const gx = Math.round(dx + halfRange);
          if (gx < 0 || gx >= C) continue;

          for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
            const cellWz = cz * CHUNK_SIZE_Z + lz;
            let dz = cellWz - wrappedCenterZ;
            if (dz > TORUS_SIZE_Z / 2) dz -= TORUS_SIZE_Z;
            else if (dz < -TORUS_SIZE_Z / 2) dz += TORUS_SIZE_Z;

            const gz = Math.round(dz + halfRange);
            if (gz < 0 || gz >= C) continue;

            const i = gz * C + gx;
            let topY = -1;
            let color = 0;
            for (let y = CHUNK_SIZE_Y - 1; y >= 0; y--) {
              if (chunk.getLocalBlock(lx, y, lz) !== 0) {
                topY = y;
                color = chunk.getLocalColor(lx, y, lz);
                break;
              }
            }
            if (topY >= 0) {
              this.heights[i] = topY + 1; // 0 means no block.
              this.colors[i] = color;
            }
          }
        }
      }
    }

    // 2) Microblocks: one pass records the highest microblock in each column using toroidal wrapping
    const micros = world.microVoxels?.cells;
    if (micros && micros.size > 0) {
      for (const [key, color] of micros) {
        const parts = key.split(',');
        if (parts.length !== 3) continue;
        const cellWx = Math.floor(Number(parts[0]) / MICRO_DIVISIONS);
        const cellWz = Math.floor(Number(parts[2]) / MICRO_DIVISIONS);

        let dx = wrapX(cellWx) - wrappedCenterX;
        if (dx > TORUS_SIZE_X / 2) dx -= TORUS_SIZE_X;
        else if (dx < -TORUS_SIZE_X / 2) dx += TORUS_SIZE_X;

        let dz = wrapZ(cellWz) - wrappedCenterZ;
        if (dz > TORUS_SIZE_Z / 2) dz -= TORUS_SIZE_Z;
        else if (dz < -TORUS_SIZE_Z / 2) dz += TORUS_SIZE_Z;

        const gx = Math.round(dx + halfRange);
        const gz = Math.round(dz + halfRange);
        if (gx < 0 || gx >= C || gz < 0 || gz >= C) continue;

        const i = gz * C + gx;
        const my = Number(parts[1]) + 1;
        if (my > this.heights[i]) {
          this.heights[i] = my;
          this.colors[i] = color;
        }
      }
    }

    // 3) Fill ImageData with height shading.
    if (!this.imageData) return;
    const data = this.imageData.data;
    const voidR = Minimap.VOID_COLOR[0], voidG = Minimap.VOID_COLOR[1], voidB = Minimap.VOID_COLOR[2];
    for (let i = 0; i < C * C; i++) {
      const h = this.heights[i];
      const o = i * 4;
      if (h <= 0) {
        data[o] = voidR; data[o + 1] = voidG; data[o + 2] = voidB; data[o + 3] = 255;
        continue;
      }
      const color = this.colors[i];
      const shade = 0.72 + 0.28 * Math.min(1, (h - 1) / (CHUNK_SIZE_Y - 1));
      data[o] = ((color >> 16) & 0xff) * shade;
      data[o + 1] = ((color >> 8) & 0xff) * shade;
      data[o + 2] = (color & 0xff) * shade;
      data[o + 3] = 255;
    }

    this.terrainCtx.putImageData(this.imageData, 0, 0);
  }
}
