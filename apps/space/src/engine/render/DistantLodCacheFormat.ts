export const DISTANT_LOD_CACHE_MAGIC = 'EDLOD001';
export const DISTANT_LOD_SCHEMA_VERSION = 1;
export const DISTANT_LOD_HEADER_BYTES = 36;
export const DISTANT_LOD_SEGMENTS_X = 512;
export const DISTANT_LOD_SEGMENTS_Z = 64;
export const DISTANT_LOD_TEXTURE_WIDTH = 1024;
export const DISTANT_LOD_TEXTURE_HEIGHT = 256;
export const DISTANT_LOD_TEXTURE_BYTES =
  DISTANT_LOD_TEXTURE_WIDTH * DISTANT_LOD_TEXTURE_HEIGHT * 4;
export const DISTANT_LOD_MAX_CACHE_BYTES = 2 * 1024 * 1024;

export interface DistantLodCacheData {
  schemaVersion: number;
  seed: number;
  terrainGeneratorVersion: number;
  segmentsX: number;
  segmentsZ: number;
  textureWidth: number;
  textureHeight: number;
  heights: Uint8Array;
  textureRgba: Uint8Array;
}

function readMagic(bytes: Uint8Array) {
  return String.fromCharCode(...bytes.subarray(0, DISTANT_LOD_CACHE_MAGIC.length));
}

export function parseDistantLodCache(buffer: ArrayBuffer): DistantLodCacheData {
  if (buffer.byteLength < DISTANT_LOD_HEADER_BYTES || buffer.byteLength > DISTANT_LOD_MAX_CACHE_BYTES) {
    throw new Error('distant LOD cache size is invalid');
  }

  const bytes = new Uint8Array(buffer);
  if (readMagic(bytes) !== DISTANT_LOD_CACHE_MAGIC) {
    throw new Error('distant LOD cache magic is invalid');
  }

  const view = new DataView(buffer);
  const schemaVersion = view.getUint16(8, true);
  const headerBytes = view.getUint16(10, true);
  const seed = view.getInt32(12, true);
  const terrainGeneratorVersion = view.getUint16(16, true);
  const segmentsX = view.getUint16(18, true);
  const segmentsZ = view.getUint16(20, true);
  const textureWidth = view.getUint16(22, true);
  const textureHeight = view.getUint16(24, true);
  const heightBytes = view.getUint32(28, true);
  const textureBytes = view.getUint32(32, true);

  if (schemaVersion !== DISTANT_LOD_SCHEMA_VERSION || headerBytes !== DISTANT_LOD_HEADER_BYTES) {
    throw new Error('distant LOD cache schema is unsupported');
  }
  if (
    segmentsX !== DISTANT_LOD_SEGMENTS_X
    || segmentsZ !== DISTANT_LOD_SEGMENTS_Z
    || textureWidth !== DISTANT_LOD_TEXTURE_WIDTH
    || textureHeight !== DISTANT_LOD_TEXTURE_HEIGHT
  ) {
    throw new Error('distant LOD cache dimensions are unsupported');
  }
  if (heightBytes !== segmentsX * segmentsZ || textureBytes !== textureWidth * textureHeight * 4) {
    throw new Error('distant LOD cache payload lengths are invalid');
  }
  if (headerBytes + heightBytes + textureBytes !== buffer.byteLength) {
    throw new Error('distant LOD cache is truncated or has trailing data');
  }

  const heightStart = headerBytes;
  const textureStart = heightStart + heightBytes;
  return {
    schemaVersion,
    seed,
    terrainGeneratorVersion,
    segmentsX,
    segmentsZ,
    textureWidth,
    textureHeight,
    heights: bytes.slice(heightStart, textureStart),
    textureRgba: bytes.slice(textureStart),
  };
}

