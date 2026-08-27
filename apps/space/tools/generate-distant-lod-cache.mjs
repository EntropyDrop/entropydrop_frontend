import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createNoise3D } from 'simplex-noise';

const MAGIC = 'EDLOD001';
const SCHEMA_VERSION = 1;
const HEADER_BYTES = 36;
const SEED = 20260827;
const TERRAIN_GENERATOR_VERSION = 1;
const SEGMENTS_X = 512;
const SEGMENTS_Z = 64;
const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = 256;
const WORLD_SIZE_X = 16384;
const WORLD_SIZE_Z = 2048;
const TORUS_R = WORLD_SIZE_X / (Math.PI * 2);
const TORUS_RHO = WORLD_SIZE_Z / (Math.PI * 2);
const GROUND_REFERENCE = 16;
const SPAWN_X = WORLD_SIZE_X / 2;
const SPAWN_Z = WORLD_SIZE_Z / 2;
const TAU = Math.PI * 2;

function createTerrainSampler(seed) {
  let state = seed;
  const random = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
  const noise3D = createNoise3D(random);

  return (wx, wz) => {
    const theta = (wx / WORLD_SIZE_X) * TAU;
    const phi = (wz / WORLD_SIZE_Z) * TAU;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    const px = (TORUS_R + TORUS_RHO * cp) * ct;
    const py = (TORUS_R + TORUS_RHO * cp) * st;
    const pz = TORUS_RHO * sp;
    const broad = noise3D(px * 0.018, py * 0.018, pz * 0.018);
    const detail = noise3D(px * 0.052, py * 0.052, pz * 0.052);
    let height = Math.round(GROUND_REFERENCE + broad * 3.4 + detail * 1.2);
    const spawnDistance = Math.hypot(wx - SPAWN_X, wz - SPAWN_Z);
    if (spawnDistance < 26) {
      const blend = Math.max(0, Math.min(1, (spawnDistance - 10) / 16));
      height = Math.round(GROUND_REFERENCE * (1 - blend) + height * blend);
    }
    return Math.max(11, Math.min(21, height));
  };
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function toLinear(rgb) {
  return rgb.map(srgbToLinear);
}
const DRY_GRASS = toLinear([0.395, 0.510, 0.335]);
const LUSH_GRASS = toLinear([0.4431, 0.5608, 0.3804]);
const SOIL = toLinear([0.5020, 0.4200, 0.3608]);
const ROCK = toLinear([0.4000, 0.4392, 0.4902]);

function fract(v) {
  return v - Math.floor(v);
}
function terrainWave(uvX, uvY, freqX, freqY, phase) {
  return Math.sin(TAU * (uvX * freqX + uvY * freqY) + phase) * 0.5 + 0.5;
}
function terrainBlockHash(cellX, cellY, cellSize) {
  let px = fract((cellX + cellSize * 0.071) * 0.1031);
  let py = fract((cellY + cellSize * 0.113) * 0.1030);
  const d = px * py + py * px + 33.33;
  px += d;
  py += d;
  return fract((px + py) * px);
}
function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
function mix(a, b, t) {
  return a + (b - a) * t;
}
function linearToSrgbByte(v) {
  const c = Math.max(0, Math.min(1, v));
  return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
}

function distantAlbedo(uvX, uvY, height, spawnDistance) {
  const macro = Math.min(1, Math.max(0,
    terrainWave(uvX, uvY, 13, 2, 0.7) * 0.45
    + terrainWave(uvX, uvY, 29, -4, 2.1) * 0.32
    + terrainWave(uvX, uvY, 47, 6, 4.3) * 0.23
  ));
  const medium = Math.min(1, Math.max(0,
    terrainWave(uvX, uvY, 83, 11, 1.4) * 0.58
    + terrainWave(uvX, uvY, 137, -17, 3.2) * 0.42
  ));
  const elevation = smoothstep(16, 20.5, height);
  const soilMask = smoothstep(0.46, 0.78, (1 - macro) * 0.68 + medium * 0.32);
  const rockMask = smoothstep(0.58, 0.88, elevation * 0.62 + Math.abs(medium - 0.5) * 0.92);
  let r = mix(LUSH_GRASS[0], DRY_GRASS[0], macro * 0.45);
  let g = mix(LUSH_GRASS[1], DRY_GRASS[1], macro * 0.45);
  let b = mix(LUSH_GRASS[2], DRY_GRASS[2], macro * 0.45);
  r = mix(r, SOIL[0], soilMask * 0.55);
  g = mix(g, SOIL[1], soilMask * 0.55);
  b = mix(b, SOIL[2], soilMask * 0.55);
  r = mix(r, ROCK[0], rockMask * 0.70);
  g = mix(g, ROCK[1], rockMask * 0.70);
  b = mix(b, ROCK[2], rockMask * 0.70);
  const micro = 1 + (medium - 0.5) * 0.08;
  const blockScale = 1 + (
    terrainBlockHash(
      Math.floor(uvX * TEXTURE_WIDTH) % TEXTURE_WIDTH,
      Math.floor(uvY * TEXTURE_HEIGHT) % TEXTURE_HEIGHT,
      4
    ) - 0.5
  ) * 0.16;
  r *= micro * blockScale;
  g *= micro * blockScale;
  b *= micro * blockScale;
  r = mix(r, Math.floor(r * 16 + 0.5) / 16, 0.4);
  g = mix(g, Math.floor(g * 16 + 0.5) / 16, 0.4);
  b = mix(b, Math.floor(b * 16 + 0.5) / 16, 0.4);
  const padClear = 1 - smoothstep(10, 32, spawnDistance);
  return [
    mix(r, LUSH_GRASS[0], padClear),
    mix(g, LUSH_GRASS[1], padClear),
    mix(b, LUSH_GRASS[2], padClear),
  ];
}

const sampleHeight = createTerrainSampler(SEED);
const heights = new Uint8Array(SEGMENTS_X * SEGMENTS_Z);
for (let ix = 0; ix < SEGMENTS_X; ix++) {
  const x = (ix / SEGMENTS_X) * WORLD_SIZE_X;
  for (let iz = 0; iz < SEGMENTS_Z; iz++) {
    heights[ix * SEGMENTS_Z + iz] = sampleHeight(x, (iz / SEGMENTS_Z) * WORLD_SIZE_Z);
  }
}

function cachedHeightAt(wx, wz) {
  const fx = (wx / WORLD_SIZE_X) * SEGMENTS_X;
  const fz = (wz / WORLD_SIZE_Z) * SEGMENTS_Z;
  const floorX = Math.floor(fx);
  const floorZ = Math.floor(fz);
  const x0 = floorX % SEGMENTS_X;
  const z0 = floorZ % SEGMENTS_Z;
  const x1 = (x0 + 1) % SEGMENTS_X;
  const z1 = (z0 + 1) % SEGMENTS_Z;
  const tx = fx - floorX;
  const tz = fz - floorZ;
  const h00 = heights[x0 * SEGMENTS_Z + z0];
  const h10 = heights[x1 * SEGMENTS_Z + z0];
  const h01 = heights[x0 * SEGMENTS_Z + z1];
  const h11 = heights[x1 * SEGMENTS_Z + z1];
  return (h00 + (h10 - h00) * tx) * (1 - tz) + (h01 + (h11 - h01) * tx) * tz;
}

const texture = new Uint8Array(TEXTURE_WIDTH * TEXTURE_HEIGHT * 4);
for (let ty = 0; ty < TEXTURE_HEIGHT; ty++) {
  const uvY = (ty + 0.5) / TEXTURE_HEIGHT;
  const wz = uvY * WORLD_SIZE_Z;
  const dz = Math.min(Math.abs(wz - SPAWN_Z), WORLD_SIZE_Z - Math.abs(wz - SPAWN_Z));
  for (let tx = 0; tx < TEXTURE_WIDTH; tx++) {
    const uvX = (tx + 0.5) / TEXTURE_WIDTH;
    const wx = uvX * WORLD_SIZE_X;
    const dx = Math.min(Math.abs(wx - SPAWN_X), WORLD_SIZE_X - Math.abs(wx - SPAWN_X));
    const rgb = distantAlbedo(uvX, uvY, cachedHeightAt(wx, wz), Math.hypot(dx, dz));
    const offset = (ty * TEXTURE_WIDTH + tx) * 4;
    texture[offset] = linearToSrgbByte(rgb[0]);
    texture[offset + 1] = linearToSrgbByte(rgb[1]);
    texture[offset + 2] = linearToSrgbByte(rgb[2]);
    texture[offset + 3] = 255;
  }
}

const header = Buffer.alloc(HEADER_BYTES);
header.write(MAGIC, 0, 'ascii');
header.writeUInt16LE(SCHEMA_VERSION, 8);
header.writeUInt16LE(HEADER_BYTES, 10);
header.writeInt32LE(SEED, 12);
header.writeUInt16LE(TERRAIN_GENERATOR_VERSION, 16);
header.writeUInt16LE(SEGMENTS_X, 18);
header.writeUInt16LE(SEGMENTS_Z, 20);
header.writeUInt16LE(TEXTURE_WIDTH, 22);
header.writeUInt16LE(TEXTURE_HEIGHT, 24);
header.writeUInt32LE(heights.byteLength, 28);
header.writeUInt32LE(texture.byteLength, 32);

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(toolsDir, '../src/assets/distant-lod-v1-seed-20260827.bin');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, Buffer.concat([header, Buffer.from(heights), Buffer.from(texture)]));
console.log(JSON.stringify({
  output,
  seed: SEED,
  texture: `${TEXTURE_WIDTH}x${TEXTURE_HEIGHT}`,
  textureBytes: texture.byteLength,
  cacheBytes: HEADER_BYTES + heights.byteLength + texture.byteLength,
}));

