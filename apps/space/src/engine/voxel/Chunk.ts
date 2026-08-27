import { DEFAULT_BLOCK_COLOR, normalizeColor } from './BlockTypes.ts';

// Voxel Chunk Data Storage (16x128x16)

export const CHUNK_SIZE_X = 16;
export const CHUNK_SIZE_Y = 128;
export const CHUNK_SIZE_Z = 16;

export class Chunk {
  cx: number;
  cz: number;
  world: any;
  blocks: Uint8Array;
  colors: Uint32Array;
  mesh: any;
  isDirty: boolean;
  hasGenerated: boolean;
  /** Procedural chunks can be regenerated; edited chunks must survive streaming. */
  hasUserEdits: boolean;

  constructor(cx, cz, world) {
    this.cx = cx;
    this.cz = cz;
    this.world = world;

    // 1D Uint8Array for performance & compactness
    this.blocks = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z);
    this.colors = new Uint32Array(CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z);
    this.colors.fill(DEFAULT_BLOCK_COLOR);
    this.mesh = null;
    this.isDirty = true;
    this.hasGenerated = false;
    this.hasUserEdits = false;
  }

  static getIndex(lx, ly, lz) {
    return (ly * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx;
  }

  getLocalBlock(lx, ly, lz) {
    if (lx < 0 || lx >= CHUNK_SIZE_X || ly < 0 || ly >= CHUNK_SIZE_Y || lz < 0 || lz >= CHUNK_SIZE_Z) {
      return 0;
    }
    return this.blocks[Chunk.getIndex(lx, ly, lz)];
  }

  getLocalColor(lx, ly, lz) {
    if (lx < 0 || lx >= CHUNK_SIZE_X || ly < 0 || ly >= CHUNK_SIZE_Y || lz < 0 || lz >= CHUNK_SIZE_Z) {
      return DEFAULT_BLOCK_COLOR;
    }
    return this.colors[Chunk.getIndex(lx, ly, lz)];
  }

  setLocalBlock(lx, ly, lz, blockType, color = DEFAULT_BLOCK_COLOR) {
    if (lx < 0 || lx >= CHUNK_SIZE_X || ly < 0 || ly >= CHUNK_SIZE_Y || lz < 0 || lz >= CHUNK_SIZE_Z) {
      return false;
    }
    const idx = Chunk.getIndex(lx, ly, lz);
    const nextColor = normalizeColor(color);
    if (this.blocks[idx] !== blockType || (blockType !== 0 && this.colors[idx] !== nextColor)) {
      this.blocks[idx] = blockType;
      this.colors[idx] = nextColor;
      this.isDirty = true;

      // Mark neighbors dirty if on boundary
      if (lx === 0 && this.world) this.world.markChunkDirty(this.cx - 1, this.cz);
      if (lx === CHUNK_SIZE_X - 1 && this.world) this.world.markChunkDirty(this.cx + 1, this.cz);
      if (lz === 0 && this.world) this.world.markChunkDirty(this.cx, this.cz - 1);
      if (lz === CHUNK_SIZE_Z - 1 && this.world) this.world.markChunkDirty(this.cx, this.cz + 1);

      return true;
    }
    return false;
  }

  getWorldOrigin() {
    return {
      x: this.cx * CHUNK_SIZE_X,
      y: 0,
      z: this.cz * CHUNK_SIZE_Z
    };
  }
}
