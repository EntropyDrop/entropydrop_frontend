import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Icon } from '@iconify/react';
import { Link } from 'react-router-dom';

// ============================================================================
// 1. DETERMINISTIC SIMPLEX NOISE 2D / 3D (Identical to Game Engine & Backend)
// ============================================================================

const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
];

class FastSimplexNoise {
  private perm: Uint8Array;

  constructor(seed: number = 42) {
    let state = Math.floor(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    // Matches the engine's LCG exactly: (state * 9301 + 49297) % 233280
    for (let i = 254; i >= 0; i--) {
      state = (state * 9301 + 49297) % 233280;
      const r = state / 233280;
      const swapIndex = Math.floor(r * (i + 1));
      const temp = p[i];
      p[i] = p[swapIndex];
      p[swapIndex] = temp;
    }

    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
    }
  }

  noise2D(x: number, y: number): number {
    const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
    const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;

    let i1: number, j1: number;
    if (x0 > y0) { i1 = 1; j1 = 0; }
    else { i1 = 0; j1 = 1; }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      t0 *= t0;
      const gi0 = this.perm[ii + this.perm[jj]] % 12;
      n0 = t0 * t0 * (GRAD3[gi0][0] * x0 + GRAD3[gi0][1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      t1 *= t1;
      const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 12;
      n1 = t1 * t1 * (GRAD3[gi1][0] * x1 + GRAD3[gi1][1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      t2 *= t2;
      const gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % 12;
      n2 = t2 * t2 * (GRAD3[gi2][0] * x2 + GRAD3[gi2][1] * y2);
    }
    return 70.0 * (n0 + n1 + n2);
  }

  noise3D(x: number, y: number, z: number): number {
    const skew = (x + y + z) / 3;
    const i = Math.floor(x + skew);
    const j = Math.floor(y + skew);
    const k = Math.floor(z + skew);
    const unskew = (i + j + k) / 6;
    const x0 = x - (i - unskew);
    const y0 = y - (j - unskew);
    const z0 = z - (k - unskew);

    let i1: number, j1: number, k1: number;
    let i2: number, j2: number, k2: number;

    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }

    const offsets = [
      [x0, y0, z0, 0, 0, 0],
      [x0 - i1 + 1 / 6, y0 - j1 + 1 / 6, z0 - k1 + 1 / 6, i1, j1, k1],
      [x0 - i2 + 1 / 3, y0 - j2 + 1 / 3, z0 - k2 + 1 / 3, i2, j2, k2],
      [x0 - 0.5, y0 - 0.5, z0 - 0.5, 1, 1, 1],
    ];

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    let total = 0.0;

    for (const [ox, oy, oz, di, dj, dk] of offsets) {
      const atten = 0.6 - ox * ox - oy * oy - oz * oz;
      if (atten > 0) {
        const gi = this.perm[ii + di + this.perm[jj + dj + this.perm[kk + dk]]] % 12;
        const g = GRAD3[gi];
        const atten2 = atten * atten;
        total += atten2 * atten2 * (g[0] * ox + g[1] * oy + g[2] * oz);
      }
    }
    return 32 * total;
  }
}

// ============================================================================
// 2. TORUS CONSTANTS & ALGORITHMS
// ============================================================================

const TORUS_SIZE_X = 16384;
const TORUS_SIZE_Z = 2048;
const TORUS_R = 2607.59;
const TORUS_RHO = 325.95;
const TORUS_SPAWN_X = 8192;
const TORUS_SPAWN_Z = 1024;

export type AlgorithmType =
  | 'torus_official'
  | 'fbm_fractal'
  | 'ridged_mountain'
  | 'terraced_scifi'
  | 'density_3d'
  | 'cyberpunk_city'
  | 'mandelbox_dusk'
  | 'custom_code';

export interface TerrainConfig {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  offsetX: number;
  offsetZ: number;
  step: number; // 1 = 1m resolution, 2 = 2m resolution
  yCutoff: number; // Slice view
  algorithm: AlgorithmType;
  seed: number;
  // Parameters
  baseHeight: number;
  broadFreq: number;
  broadAmp: number;
  detailFreq: number;
  detailAmp: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  terraceSteps: number;
  densityStrength: number;
  spawnFlatten: boolean;
  minClamp: number;
  maxClamp: number;
  customCode: string;
  theme: string;
  renderMode: 'voxel' | 'surface' | 'wireframe';
  // Cyberpunk City Parameters
  cityBlockSize: number;
  streetWidth: number;
  buildingMaxHeight: number;
  skybridgeInterval: number;
  windowDensity: number;
  neonTheme: 'neo_tokyo' | 'matrix' | 'outrun';
  // Mandelbox Dusk Parameters
  mandelboxScale: number;
  mandelboxFold: number;
  mandelboxMinR: number;
  mandelboxFixedR: number;
  mandelboxIters: number;
  mandelboxZoom: number;
  mandelboxThreshold: number;
  mandelboxOffsetX: number;
  mandelboxOffsetZ: number;
}

const DEFAULT_CONFIG: TerrainConfig = {
  sizeX: 64,
  sizeY: 56,
  sizeZ: 64,
  offsetX: 8192,
  offsetZ: 1024,
  step: 1,
  yCutoff: 56,
  algorithm: 'mandelbox_dusk',
  seed: 42,
  baseHeight: 16,
  broadFreq: 0.018,
  broadAmp: 3.4,
  detailFreq: 0.052,
  detailAmp: 1.2,
  octaves: 4,
  persistence: 0.5,
  lacunarity: 2.0,
  terraceSteps: 4,
  densityStrength: 1.4,
  spawnFlatten: true,
  minClamp: 4,
  maxClamp: 64,
  customCode: `// (wx, wz, noise3D, noise2D, config) => height
const r = Math.sqrt((wx - 8192)**2 + (wz - 1024)**2);
const ripple = Math.sin(r * 0.15) * 4;
const n = noise2D(wx * 0.04, wz * 0.04) * 6;
return Math.round(16 + ripple + n);`,
  theme: 'dusk',
  renderMode: 'voxel',
  cityBlockSize: 18,
  streetWidth: 5,
  buildingMaxHeight: 44,
  skybridgeInterval: 14,
  windowDensity: 0.65,
  neonTheme: 'neo_tokyo',
  mandelboxScale: -1.85,
  mandelboxFold: 1.0,
  mandelboxMinR: 0.5,
  mandelboxFixedR: 1.0,
  mandelboxIters: 5,
  mandelboxZoom: 0.05,
  mandelboxThreshold: 0.16,
  mandelboxOffsetX: 1.05,
  mandelboxOffsetZ: 1.05,
};

const THEMES: Record<string, { name: string; surface: number; middle: number; deep: number }> = {
  dusk: { name: 'Mandelbox Sunset Dusk', surface: 0xfbbf24, middle: 0xf43f5e, deep: 0x1e1b4b },
  nature: { name: 'EntropyDrop Nature', surface: 0x718f61, middle: 0x806b5c, deep: 0x66707d },
  scifi: { name: 'Cyberpunk Neon Matrix', surface: 0x00f0ff, middle: 0xf43f5e, deep: 0x090d16 },
  volcanic: { name: 'Volcanic Magma', surface: 0xff5722, middle: 0x3e2723, deep: 0x1a1a1a },
  arctic: { name: 'Glacier Frost', surface: 0xf8fafc, middle: 0x38bdf8, deep: 0x0f172a },
  desert: { name: 'Dune Sandstone', surface: 0xf59e0b, middle: 0xb45309, deep: 0x78350f },
};

// ============================================================================
// 2.5 DETERMINISTIC HASH UTILITIES & CYBERPUNK CITY GENERATOR
// ============================================================================

function hash2(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function hash3(x: number, y: number, z: number): number {
  const n = Math.sin(x * 12.9898 + y * 45.164 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function generateCyberpunkCityVoxels(
  cols: number,
  rows: number,
  step: number,
  config: TerrainConfig
): { x: number; y: number; z: number; color: number }[] {
  const voxels: { x: number; y: number; z: number; color: number }[] = [];
  const P = Math.max(12, config.cityBlockSize);
  const W = Math.max(3, Math.min(P - 4, config.streetWidth));
  const lotSize = P - W;
  const maxH = Math.min(config.sizeY, config.buildingMaxHeight);
  const cutoff = config.yCutoff;
  const interval = Math.max(6, config.skybridgeInterval);
  const winDensity = config.windowDensity;

  // Palette selection
  let C_ROAD_BASE = 0x0a101d;
  let C_ROAD_GRID = 0x00f0ff;
  let C_ROAD_GRID_SUB = 0x00b4d8;
  const C_ROAD_ZEBRA = 0xe2e8f0;

  let C_PILLAR_STEEL = 0x1e293b;
  let C_PILLAR_NEON = 0x00f0ff;
  let C_PILLAR_RING = 0xf43f5e;

  let C_BRIDGE_FLOOR = 0x1e293b;
  let C_BRIDGE_SIGN = 0x00f0ff;

  const C_WALL_BASE = 0x16202e;
  const C_WALL_TRIM = 0x334155;
  const C_ROOF = 0x0f172a;
  const C_ANTENNA = 0x94a3b8;
  let C_BEACON = 0xf43f5e;

  let C_WIN_CYAN = 0x00f0ff;
  let C_WIN_AMBER = 0xfbbf24;
  let C_WIN_PINK = 0xf43f5e;
  let C_WIN_MINT = 0x10b981;
  const C_WIN_OFF = 0x070c14;

  if (config.neonTheme === 'matrix') {
    C_ROAD_GRID = 0x10b981;
    C_ROAD_GRID_SUB = 0x059669;
    C_PILLAR_NEON = 0x10b981;
    C_PILLAR_RING = 0x84cc16;
    C_BRIDGE_SIGN = 0x10b981;
    C_BEACON = 0x84cc16;
    C_WIN_CYAN = 0x10b981;
    C_WIN_AMBER = 0xa3e635;
    C_WIN_PINK = 0x34d399;
    C_WIN_MINT = 0x06b6d4;
  } else if (config.neonTheme === 'outrun') {
    C_ROAD_GRID = 0xf43f5e;
    C_ROAD_GRID_SUB = 0xd946ef;
    C_PILLAR_NEON = 0xf43f5e;
    C_PILLAR_RING = 0xf59e0b;
    C_BRIDGE_SIGN = 0xf43f5e;
    C_BEACON = 0xfacc15;
    C_WIN_CYAN = 0xf43f5e;
    C_WIN_AMBER = 0xfbbf24;
    C_WIN_PINK = 0xc084fc;
    C_WIN_MINT = 0x38bdf8;
  }

  // Iterate over grid columns (X) and rows (Z)
  for (let ix = 0; ix < cols; ix++) {
    const posX = (ix - cols / 2) * step;
    const wx = Math.round(config.offsetX + posX);
    const lx = ((wx % P) + P) % P;
    const cx = Math.floor(wx / P);

    for (let iz = 0; iz < rows; iz++) {
      const posZ = (iz - rows / 2) * step;
      const wz = Math.round(config.offsetZ + posZ);
      const lz = ((wz % P) + P) % P;
      const cz = Math.floor(wz / P);

      const isStreetX = lx < W;
      const isStreetZ = lz < W;
      const isStreet = isStreetX || isStreetZ;

      // ----------------------------------------------------------------------
      // 1. STREETS & SKYBRIDGES (Road canyon)
      // ----------------------------------------------------------------------
      if (isStreet) {
        if (cutoff >= 0) {
          let roadCol = C_ROAD_BASE;
          const isMidX = lx === Math.floor(W / 2);
          const isMidZ = lz === Math.floor(W / 2);

          // Glowing cyan gridlines on dark road pavement (tron digital grid)
          if (isStreetX && isMidX) {
            roadCol = C_ROAD_GRID;
          } else if (isStreetZ && isMidZ) {
            roadCol = C_ROAD_GRID;
          } else if ((lx % 2 === 0 && isStreetZ) || (lz % 2 === 0 && isStreetX)) {
            roadCol = C_ROAD_GRID_SUB;
          } else if ((lx === W - 1 || lx === 0) && lz % 2 === 0 && !isStreetZ) {
            roadCol = C_ROAD_ZEBRA;
          } else if ((lz === W - 1 || lz === 0) && lx % 2 === 0 && !isStreetX) {
            roadCol = C_ROAD_ZEBRA;
          }

          voxels.push({ x: posX, y: 0, z: posZ, color: roadCol });
        }

        // Multi-tier Skybridges across streets ("GRID NEXUS" style elevated corridors)
        const isBridgeAlignZ = (lz === 0 || lz === 1 || lz === P - 1 || lz === Math.floor(lotSize / 2) + W);
        const isBridgeAlignX = (lx === 0 || lx === 1 || lx === P - 1 || lx === Math.floor(lotSize / 2) + W);

        for (let y = interval; y <= Math.min(config.sizeY, maxH, cutoff); y += interval) {
          let hasBridge = false;
          let isBridgeEdge = false;

          if (isStreetX && isBridgeAlignZ) {
            hasBridge = true;
            isBridgeEdge = lz === 0 || lz === P - 1;
          } else if (isStreetZ && isBridgeAlignX) {
            hasBridge = true;
            isBridgeEdge = lx === 0 || lx === P - 1;
          }

          if (hasBridge) {
            // Deck walkway
            voxels.push({
              x: posX,
              y,
              z: posZ,
              color: isBridgeEdge ? C_BRIDGE_SIGN : C_BRIDGE_FLOOR,
            });
            // Illuminated signage & edge railing
            if (y + 1 <= cutoff && isBridgeEdge) {
              const signCol = (Math.floor(y / interval) % 2 === 0) ? C_BRIDGE_SIGN : C_PILLAR_RING;
              voxels.push({ x: posX, y: y + 1, z: posZ, color: signCol });
            }
          }
        }

        // Atmospheric Flying Vehicle Spinners
        const isMidX = lx === Math.floor(W / 2);
        if ((cx + cz) % 3 === 0 && isStreetX && isMidX && !isStreetZ) {
          const vehY = 8 + ((cx * 5 + cz * 3) % 12);
          if (vehY <= cutoff && lz === Math.floor(P / 2)) {
            voxels.push({ x: posX, y: vehY, z: posZ, color: C_ROAD_GRID });
            voxels.push({ x: posX, y: vehY, z: posZ + step, color: 0xef4444 });
          }
        }

        continue;
      }

      // ----------------------------------------------------------------------
      // 2. CITY BLOCK LOTS (Buildings & Corner Mega-Pillars)
      // ----------------------------------------------------------------------
      const bx = lx - W; // 0 <= bx < lotSize
      const bz = lz - W; // 0 <= bz < lotSize

      // Corner Mega-Pillars (2x2 corner structural columns)
      const isCornerPillar =
        (bx < 2 && bz < 2) ||
        (bx >= lotSize - 2 && bz < 2) ||
        (bx < 2 && bz >= lotSize - 2) ||
        (bx >= lotSize - 2 && bz >= lotSize - 2);

      if (isCornerPillar) {
        const pillarTop = Math.min(config.sizeY, maxH + 4);
        const clampedTop = Math.min(pillarTop, cutoff);
        const isOuterCorner =
          (bx === 0 && bz === 0) ||
          (bx === lotSize - 1 && bz === 0) ||
          (bx === 0 && bz === lotSize - 1) ||
          (bx === lotSize - 1 && bz === lotSize - 1);

        for (let y = 0; y <= clampedTop; y++) {
          let c = C_PILLAR_STEEL;
          if (isOuterCorner) {
            c = C_PILLAR_NEON; // Vertical neon strip running up the column
          } else if (y % interval === 0) {
            c = C_PILLAR_RING; // Structural band ring at bridge intersections
          } else if (y % 4 === 0) {
            c = C_WALL_TRIM;
          }
          voxels.push({ x: posX, y, z: posZ, color: c });
        }
        continue;
      }

      // ----------------------------------------------------------------------
      // 3. SKYSCRAPERS & TOWERS
      // ----------------------------------------------------------------------
      const halfLot = Math.floor(lotSize / 2);
      const subX = bx < halfLot ? 0 : 1;
      const subZ = bz < halfLot ? 0 : 1;
      const lotSeed = hash2(cx * 11 + subX + config.seed * 0.1, cz * 11 + subZ + config.seed * 0.1);

      // Distinct tower heights per lot
      const towerHeight = Math.floor(16 + lotSeed * (maxH - 16));
      const clampedTowerH = Math.min(config.sizeY, towerHeight);

      // Setback step boundaries
      const minBx = subX === 0 ? 2 : halfLot;
      const maxBx = subX === 0 ? halfLot - 1 : lotSize - 3;
      const minBz = subZ === 0 ? 2 : halfLot;
      const maxBz = subZ === 0 ? halfLot - 1 : lotSize - 3;

      const edgeDist = Math.min(bx - minBx, maxBx - bx, bz - minBz, maxBz - bz);

      for (let y = 0; y <= Math.min(clampedTowerH, cutoff); y++) {
        // Setback logic: upper levels step inward
        let setback = 0;
        if (y > clampedTowerH * 0.85) setback = 2;
        else if (y > clampedTowerH * 0.65) setback = 1;

        if (edgeDist < setback) {
          // Empty space due to stepped setback
          continue;
        }

        // Fast surface culling: only exterior facade walls, roof, or slice top
        const isFacade = edgeDist === setback;
        const isRoof = y === clampedTowerH;
        const isSliceTop = y === cutoff;
        const isTerraceFloor =
          (y === Math.floor(clampedTowerH * 0.65) || y === Math.floor(clampedTowerH * 0.85)) &&
          edgeDist >= setback;

        if (!isFacade && !isRoof && !isSliceTop && !isTerraceFloor) {
          // Interior solid block - skip for 60 FPS performance!
          continue;
        }

        let col = C_WALL_BASE;

        if (isRoof || isTerraceFloor) {
          col = C_ROOF;
          if (edgeDist === setback) col = C_WALL_TRIM;
        } else if (isFacade) {
          // Check for facade window matrix
          const isWinPos = y > 1 && y % 2 === 0 && (bx + bz) % 2 === 0;
          if (isWinPos) {
            const wHash = hash3(wx * 2.3 + config.seed, y * 3.7, wz * 2.3);
            if (wHash < winDensity) {
              // Lit window matrix (Cyan, Amber, Pink, Mint)
              if (wHash < winDensity * 0.40) col = C_WIN_CYAN;
              else if (wHash < winDensity * 0.75) col = C_WIN_AMBER;
              else if (wHash < winDensity * 0.90) col = C_WIN_PINK;
              else col = C_WIN_MINT;
            } else {
              col = C_WIN_OFF;
            }
          } else {
            col = (bx === minBx || bx === maxBx || bz === minBz || bz === maxBz) ? C_WALL_TRIM : C_WALL_BASE;
          }
        }

        voxels.push({ x: posX, y, z: posZ, color: col });
      }

      // Rooftop Spire & Warning Beacon
      const centerBx = Math.floor((minBx + maxBx) / 2);
      const centerBz = Math.floor((minBz + maxBz) / 2);
      if (bx === centerBx && bz === centerBz && clampedTowerH <= cutoff) {
        const antennaH = Math.min(config.sizeY, clampedTowerH + 4);
        for (let ay = clampedTowerH + 1; ay <= Math.min(antennaH, cutoff); ay++) {
          const isTip = ay === antennaH;
          voxels.push({
            x: posX,
            y: ay,
            z: posZ,
            color: isTip ? C_BEACON : C_ANTENNA,
          });
        }
      }
    }
  }

  return voxels;
}

// ============================================================================
// 2.6 MANDELBOX FRACTAL EVALUATOR & "CITY AT DUSK" GENERATOR
// ============================================================================

function sampleMandelboxDE(
  x: number,
  y: number,
  z: number,
  scale: number,
  fold: number,
  minR: number,
  fixedR: number,
  iters: number
): { dist: number; trap: number; edge: number } {
  let px = x;
  let py = y;
  let pz = z;
  const minR2 = minR * minR;
  const fixedR2 = fixedR * fixedR;
  let dr = 1.0;
  let trap = 1e10;
  let minEdge = 1e10;

  for (let i = 0; i < iters; i++) {
    // 1. Box Fold: fold coords when exceeding [-fold, fold]
    const ox = px, oy = py, oz = pz;
    if (px > fold) px = 2 * fold - px;
    else if (px < -fold) px = -2 * fold - px;

    if (py > fold) py = 2 * fold - py;
    else if (py < -fold) py = -2 * fold - py;

    if (pz > fold) pz = 2 * fold - pz;
    else if (pz < -fold) pz = -2 * fold - pz;

    const ex = Math.abs(Math.abs(ox) - fold);
    const ey = Math.abs(Math.abs(oy) - fold);
    const ez = Math.abs(Math.abs(oz) - fold);
    minEdge = Math.min(minEdge, Math.min(ex, ey, ez));

    // 2. Sphere Fold
    const r2 = px * px + py * py + pz * pz;
    trap = Math.min(trap, r2);

    if (r2 < minR2) {
      const factor = fixedR2 / minR2;
      px *= factor;
      py *= factor;
      pz *= factor;
      dr *= factor;
    } else if (r2 < fixedR2) {
      const factor = fixedR2 / r2;
      px *= factor;
      py *= factor;
      pz *= factor;
      dr *= factor;
    }

    // 3. Scale and translate by original coordinate
    px = px * scale + x;
    py = py * scale + y;
    pz = pz * scale + z;
    dr = dr * Math.abs(scale) + 1.0;
  }

  const len = Math.sqrt(px * px + py * py + pz * pz);
  const dist = (len - Math.abs(scale - 1.0)) / Math.max(1e-5, dr);
  return { dist, trap, edge: minEdge };
}

function generateMandelboxDuskVoxels(
  cols: number,
  rows: number,
  step: number,
  config: TerrainConfig
): { x: number; y: number; z: number; color: number }[] {
  const voxels: { x: number; y: number; z: number; color: number }[] = [];
  const {
    sizeY,
    yCutoff,
    mandelboxScale,
    mandelboxFold,
    mandelboxMinR,
    mandelboxFixedR,
    mandelboxIters,
    mandelboxZoom,
    mandelboxThreshold,
    seed,
  } = config;

  const cutoff = Math.min(sizeY, yCutoff);
  const zoom = mandelboxZoom;
  const thres = mandelboxThreshold;

  // City at Dusk palette
  const C_SUNSET_GOLD = 0xfbbf24;    // Golden hour highlights
  const C_SUNSET_AMBER = 0xf59e0b;   // Warm amber facade
  const C_DUSK_ROSE = 0xf43f5e;      // Atmospheric dusk rose / twilight pink
  const C_DUSK_CRIMSON = 0xbe123c;   // Terraced mid-level crimson
  const C_TWILIGHT_INDIGO = 0x4338ca;// Shaded colonnades and recursive arches
  const C_SHADOW_PURPLE = 0x2e1065;  // Deep violet shadow
  const C_OBSIDIAN = 0x0f172a;       // Ground foundation / dark bedrock
  const C_LANTERN_GOLD = 0xffe066;   // Warm evening window lantern
  const C_LANTERN_AMBER = 0xff9f1c;  // Glowing amber niche light

  // 3D column generation with surface culling
  for (let ix = 0; ix < cols; ix++) {
    const posX = (ix - cols / 2) * step;
    const wx = config.offsetX + posX;
    const mx = posX * zoom + (config.mandelboxOffsetX ?? 1.05);

    for (let iz = 0; iz < rows; iz++) {
      const posZ = (iz - rows / 2) * step;
      const wz = config.offsetZ + posZ;
      const mz = posZ * zoom + (config.mandelboxOffsetZ ?? 1.05);

      let prevSolid = false;

      for (let y = 0; y <= cutoff; y++) {
        // Vertical fractal offset: aligns the fractal city base with the ground
        const my = (y - 12) * zoom;

        // Ground foundation at y = 0
        let isSolid = y === 0;
        let trapVal = 1;
        let edgeVal = 1;

        if (!isSolid) {
          const res = sampleMandelboxDE(
            mx,
            my,
            mz,
            mandelboxScale,
            mandelboxFold,
            mandelboxMinR,
            mandelboxFixedR,
            mandelboxIters
          );
          trapVal = res.trap;
          edgeVal = res.edge;
          isSolid = res.dist < thres;
        }

        // Surface culling: only emit visible voxels
        if (isSolid) {
          let nextSolid = false;
          if (y < cutoff) {
            const nextMy = (y + 1 - 12) * zoom;
            const nextRes = sampleMandelboxDE(
              mx,
              nextMy,
              mz,
              mandelboxScale,
              mandelboxFold,
              mandelboxMinR,
              mandelboxFixedR,
              mandelboxIters
            );
            nextSolid = nextRes.dist < thres;
          }

          let isWall = false;
          if (prevSolid && nextSolid && y > 0 && y < cutoff) {
            const deltaM = step * zoom;
            const deX = sampleMandelboxDE(
              mx + deltaM,
              my,
              mz,
              mandelboxScale,
              mandelboxFold,
              mandelboxMinR,
              mandelboxFixedR,
              Math.min(3, mandelboxIters)
            ).dist;
            isWall = deX >= thres;
          }

          const isSurface = !prevSolid || !nextSolid || isWall || y === cutoff || y === 0;

          if (isSurface) {
            const hNorm = y / Math.max(1, sizeY);
            // Low angle sunset from west (-X direction)
            const sunAngle = Math.max(0, -mx * 0.7 + mz * 0.3 + 0.5);

            let col = C_TWILIGHT_INDIGO;

            if (y === 0) {
              col = C_OBSIDIAN;
            } else if (hNorm > 0.65) {
              col = sunAngle > 0.4 ? C_SUNSET_GOLD : C_SUNSET_AMBER;
            } else if (hNorm > 0.35) {
              col = sunAngle > 0.5 ? C_DUSK_ROSE : C_DUSK_CRIMSON;
            } else {
              col = sunAngle > 0.6 ? C_TWILIGHT_INDIGO : C_SHADOW_PURPLE;
            }

            // Twinkling dusk lanterns inside fractal window niches
            if (y > 1 && y < sizeY * 0.8 && (edgeVal < 0.06 || trapVal < 0.25)) {
              const lanternHash = hash3(wx * 3.1 + seed, y * 5.7, wz * 3.1);
              if (lanternHash < 0.22) {
                col = lanternHash < 0.12 ? C_LANTERN_GOLD : C_LANTERN_AMBER;
              }
            }

            voxels.push({ x: posX, y, z: posZ, color: col });
          }
        }

        prevSolid = isSolid;
      }
    }
  }

  return voxels;
}

// ============================================================================
// 3. MAIN REACT COMPONENT
// ============================================================================

export function TerrainLabPage() {
  const [config, setConfig] = useState<TerrainConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<'dimensions' | 'algorithm' | 'shading' | 'export'>('dimensions');
  const [stats, setStats] = useState({
    voxelCount: 0,
    minY: 0,
    maxY: 0,
    avgY: 0,
    calcTimeMs: 0,
    meshTimeMs: 0,
    fps: 60,
  });
  const [copiedCode, setCopiedCode] = useState<'ts' | 'py' | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniMapRef = useRef<HTMLCanvasElement>(null);

  // Three.js instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const terrainGroupRef = useRef<THREE.Group | null>(null);
  const bboxMeshRef = useRef<THREE.BoxHelper | null>(null);

  const noise = useMemo(() => new FastSimplexNoise(config.seed), [config.seed]);

  // Compute terrain height at world coordinates
  const sampleHeight = useCallback((wx: number, wz: number, cfg: TerrainConfig): number => {
    const { algorithm, baseHeight, broadFreq, broadAmp, detailFreq, detailAmp, minClamp, maxClamp } = cfg;

    if (algorithm === 'torus_official') {
      const theta = (wx / TORUS_SIZE_X) * Math.PI * 2;
      const phi = (wz / TORUS_SIZE_Z) * Math.PI * 2;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);

      const px = (TORUS_R + TORUS_RHO * cp) * ct;
      const py = (TORUS_R + TORUS_RHO * cp) * st;
      const pz = TORUS_RHO * sp;

      const broad = noise.noise3D(px * broadFreq, py * broadFreq, pz * broadFreq);
      const detail = noise.noise3D(px * detailFreq, py * detailFreq, pz * detailFreq);
      let h = Math.round(baseHeight + broad * broadAmp + detail * detailAmp);

      if (cfg.spawnFlatten) {
        const dSpawn = Math.hypot(wx - TORUS_SPAWN_X, wz - TORUS_SPAWN_Z);
        if (dSpawn < 26) {
          const blend = Math.max(0, Math.min(1, (dSpawn - 10) / 16));
          h = Math.round(baseHeight * (1 - blend) + h * blend);
        }
      }
      return Math.max(minClamp, Math.min(maxClamp, h));
    }

    if (algorithm === 'fbm_fractal') {
      let amp = 1;
      let freq = broadFreq;
      let sum = 0;
      let maxA = 0;
      for (let o = 0; o < cfg.octaves; o++) {
        sum += noise.noise2D(wx * freq, wz * freq) * amp;
        maxA += amp;
        amp *= cfg.persistence;
        freq *= cfg.lacunarity;
      }
      const norm = maxA > 0 ? sum / maxA : 0;
      const h = Math.round(baseHeight + norm * broadAmp * 3);
      return Math.max(minClamp, Math.min(maxClamp, h));
    }

    if (algorithm === 'ridged_mountain') {
      let amp = 1;
      let freq = broadFreq;
      let sum = 0;
      for (let o = 0; o < cfg.octaves; o++) {
        let n = noise.noise2D(wx * freq, wz * freq);
        n = 1.0 - Math.abs(n);
        n = n * n;
        sum += n * amp;
        amp *= cfg.persistence;
        freq *= cfg.lacunarity;
      }
      const h = Math.round(baseHeight + sum * broadAmp * 2.5);
      return Math.max(minClamp, Math.min(maxClamp, h));
    }

    if (algorithm === 'terraced_scifi') {
      const raw = noise.noise2D(wx * broadFreq, wz * broadFreq) * broadAmp * 2;
      const rawH = baseHeight + raw;
      const step = Math.max(1, cfg.terraceSteps);
      const h = Math.round(Math.floor(rawH / step) * step);
      return Math.max(minClamp, Math.min(maxClamp, h));
    }

    if (algorithm === 'cyberpunk_city') {
      const P = Math.max(12, cfg.cityBlockSize);
      const W = Math.max(3, Math.min(P - 4, cfg.streetWidth));
      const lotSize = P - W;
      const lx = ((Math.floor(wx) % P) + P) % P;
      const lz = ((Math.floor(wz) % P) + P) % P;
      const cx = Math.floor(wx / P);
      const cz = Math.floor(wz / P);

      // Street canyon ground
      if (lx < W || lz < W) {
        return 0;
      }

      const bx = lx - W;
      const bz = lz - W;
      const isCornerPillar =
        (bx < 2 && bz < 2) ||
        (bx >= lotSize - 2 && bz < 2) ||
        (bx < 2 && bz >= lotSize - 2) ||
        (bx >= lotSize - 2 && bz >= lotSize - 2);

      if (isCornerPillar) {
        return Math.min(cfg.sizeY, cfg.buildingMaxHeight + 4);
      }

      const halfLot = Math.floor(lotSize / 2);
      const subX = bx < halfLot ? 0 : 1;
      const subZ = bz < halfLot ? 0 : 1;
      const lotSeed = hash2(cx * 11 + subX + cfg.seed * 0.1, cz * 11 + subZ + cfg.seed * 0.1);
      const towerHeight = Math.floor(16 + lotSeed * (cfg.buildingMaxHeight - 16));
      return Math.min(cfg.sizeY, towerHeight);
    }

    if (algorithm === 'mandelbox_dusk') {
      const zoom = cfg.mandelboxZoom;
      const thres = cfg.mandelboxThreshold;
      const posX = wx - cfg.offsetX;
      const posZ = wz - cfg.offsetZ;
      const mx = posX * zoom + (cfg.mandelboxOffsetX ?? 1.05);
      const mz = posZ * zoom + (cfg.mandelboxOffsetZ ?? 1.05);

      for (let y = Math.min(cfg.sizeY, cfg.yCutoff); y >= 1; y -= 2) {
        const my = (y - 12) * zoom;
        const res = sampleMandelboxDE(
          mx,
          my,
          mz,
          cfg.mandelboxScale,
          cfg.mandelboxFold,
          cfg.mandelboxMinR,
          cfg.mandelboxFixedR,
          Math.min(4, cfg.mandelboxIters)
        );
        if (res.dist < thres) {
          return y;
        }
      }
      return 1;
    }

    if (algorithm === 'custom_code') {
      try {
        const fn = new Function('wx', 'wz', 'noise3D', 'noise2D', 'config', cfg.customCode);
        const res = fn(wx, wz, (x: number, y: number, z: number) => noise.noise3D(x, y, z), (x: number, y: number) => noise.noise2D(x, y), cfg);
        return Math.max(minClamp, Math.min(maxClamp, Number.isFinite(res) ? Math.round(res) : baseHeight));
      } catch {
        return baseHeight;
      }
    }

    return baseHeight;
  }, [noise]);

  // Check 3D density for cavity/arch mode
  const sampleDensity = useCallback((wx: number, wy: number, wz: number, cfg: TerrainConfig): boolean => {
    if (cfg.algorithm !== 'density_3d') return false;
    const n = noise.noise3D(wx * cfg.broadFreq, wy * cfg.broadFreq * 1.5, wz * cfg.broadFreq);
    const density = (cfg.baseHeight - wy) / 10 + n * cfg.densityStrength;
    return density > 0;
  }, [noise]);

  // ==========================================================================
  // 4. THREE.JS SCENE SETUP
  // ==========================================================================

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e14);
    scene.fog = new THREE.FogExp2(0x0a0e14, 0.008);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.5, 1000);
    camera.position.set(60, 50, 70);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, canvasRef.current);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 + 0.1;
    controls.target.set(0, 10, 0);
    controlsRef.current = controls;

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xddeeff, 0x1b2533, 1.2);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 2.0);
    dirLight.position.set(80, 120, 60);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    // Subtle blue fill light
    const fillLight = new THREE.DirectionalLight(0x4080ff, 0.6);
    fillLight.position.set(-60, 40, -60);
    scene.add(fillLight);

    // Ground helper grid
    const grid = new THREE.GridHelper(300, 30, 0x1f2e3d, 0x121a24);
    grid.position.y = -0.01;
    scene.add(grid);

    // Terrain Group
    const terrainGroup = new THREE.Group();
    scene.add(terrainGroup);
    terrainGroupRef.current = terrainGroup;

    // Handle Window Resize
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Render Loop
    let animId: number;
    let frameCount = 0;
    let lastFpsUpdate = performance.now();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);

      frameCount++;
      const now = performance.now();
      const elapsed = now - lastFpsUpdate;
      if (elapsed >= 500) {
        const measured = Math.round((frameCount * 1000) / elapsed);
        setStats(s => ({ ...s, fps: Number.isFinite(measured) && measured > 0 ? measured : 60 }));
        frameCount = 0;
        lastFpsUpdate = now;
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  // ==========================================================================
  // 5. REBUILD MESH ON CONFIG CHANGE
  // ==========================================================================

  const rebuildTerrain = useCallback(() => {
    if (!sceneRef.current || !terrainGroupRef.current) return;
    const group = terrainGroupRef.current;

    // Clear previous objects
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if ((child as any).geometry) (child as any).geometry.dispose();
      if ((child as any).material) {
        if (Array.isArray((child as any).material)) {
          (child as any).material.forEach((m: any) => m.dispose());
        } else {
          (child as any).material.dispose();
        }
      }
    }

    const t0 = performance.now();

    const { sizeX, sizeZ, sizeY, offsetX, offsetZ, step, yCutoff, algorithm, theme, renderMode } = config;
    const themeColors = THEMES[theme] || THEMES.nature;

    const cols = Math.floor(sizeX / step);
    const rows = Math.floor(sizeZ / step);

    const heights: number[][] = [];
    let minY = Infinity;
    let maxY = -Infinity;
    let sumY = 0;
    let sampleCount = 0;

    // Heightmap calculation
    for (let x = 0; x < cols; x++) {
      heights[x] = [];
      const wx = offsetX + (x - cols / 2) * step;
      for (let z = 0; z < rows; z++) {
        const wz = offsetZ + (z - rows / 2) * step;
        const h = Math.min(sizeY, Math.max(0, sampleHeight(wx, wz, config)));
        heights[x][z] = h;
        minY = Math.min(minY, h);
        maxY = Math.max(maxY, h);
        sumY += h;
        sampleCount++;
      }
    }

    const t1 = performance.now();

    // Adjust Scene Atmosphere & Fog
    if (sceneRef.current) {
      if (algorithm === 'cyberpunk_city') {
        sceneRef.current.background = new THREE.Color(0x060811);
        sceneRef.current.fog = new THREE.FogExp2(0x060811, 0.007);
      } else if (algorithm === 'mandelbox_dusk') {
        sceneRef.current.background = new THREE.Color(0x120c24);
        sceneRef.current.fog = new THREE.FogExp2(0x120c24, 0.0065);
      } else {
        sceneRef.current.background = new THREE.Color(0x0a0e14);
        sceneRef.current.fog = new THREE.FogExp2(0x0a0e14, 0.008);
      }
    }

    let emittedCount = cols * rows;

    // ------------------------------------------------------------------------
    // A. VOXEL INSTANCED MESH
    // ------------------------------------------------------------------------
    if (renderMode === 'voxel') {
      let voxelList: { x: number; y: number; z: number; color: number }[] = [];

      const colorSurface = new THREE.Color(themeColors.surface);
      const colorMiddle = new THREE.Color(themeColors.middle);
      const colorDeep = new THREE.Color(themeColors.deep);

      if (algorithm === 'cyberpunk_city') {
        voxelList = generateCyberpunkCityVoxels(cols, rows, step, config);
      } else if (algorithm === 'mandelbox_dusk') {
        voxelList = generateMandelboxDuskVoxels(cols, rows, step, config);
      } else if (algorithm === 'density_3d') {
        // True 3D Density cavity sampling
        for (let ix = 0; ix < cols; ix++) {
          const wx = offsetX + (ix - cols / 2) * step;
          const posX = (ix - cols / 2) * step;
          for (let iz = 0; iz < rows; iz++) {
            const wz = offsetZ + (iz - rows / 2) * step;
            const posZ = (iz - rows / 2) * step;
            for (let y = 0; y <= Math.min(sizeY, yCutoff); y++) {
              if (sampleDensity(wx, y, wz, config)) {
                let c = colorDeep;
                if (y >= sizeY * 0.7) c = colorSurface;
                else if (y >= sizeY * 0.4) c = colorMiddle;
                voxelList.push({ x: posX, y, z: posZ, color: c.getHex() });
              }
            }
          }
        }
      } else {
        for (let ix = 0; ix < cols; ix++) {
          const posX = (ix - cols / 2) * step;
          for (let iz = 0; iz < rows; iz++) {
            const posZ = (iz - rows / 2) * step;
            const topH = heights[ix][iz];
            const clampedTop = Math.min(topH, yCutoff);

            // Render top block and visible underground blocks down to topH - 5
            for (let y = Math.max(0, clampedTop - 4); y <= clampedTop; y++) {
              let c = colorDeep;
              if (y === topH) c = colorSurface;
              else if (y >= topH - 2) c = colorMiddle;
              voxelList.push({ x: posX, y, z: posZ, color: c.getHex() });
            }
          }
        }
      }

      const totalVoxels = voxelList.length;
      emittedCount = totalVoxels;
      if (totalVoxels > 0) {
        const boxGeo = new THREE.BoxGeometry(step, 1, step);
        const boxMat = new THREE.MeshStandardMaterial({
          roughness: 0.85,
          metalness: 0.1,
        });

        const instanced = new THREE.InstancedMesh(boxGeo, boxMat, totalVoxels);
        instanced.castShadow = true;
        instanced.receiveShadow = true;

        const dummy = new THREE.Object3D();
        const dummyColor = new THREE.Color();

        for (let i = 0; i < totalVoxels; i++) {
          const v = voxelList[i];
          dummy.position.set(v.x, v.y + 0.5, v.z);
          dummy.updateMatrix();
          instanced.setMatrixAt(i, dummy.matrix);

          dummyColor.setHex(v.color);
          instanced.setColorAt(i, dummyColor);
        }
        instanced.instanceMatrix.needsUpdate = true;
        if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
        group.add(instanced);
      }
    }
    // ------------------------------------------------------------------------
    // B. SMOOTH SURFACE MESH / WIREFRAME
    // ------------------------------------------------------------------------
    else {
      const planeGeo = new THREE.PlaneGeometry(
        sizeX,
        sizeZ,
        cols - 1,
        rows - 1
      );
      planeGeo.rotateX(-Math.PI / 2);

      const posAttr = planeGeo.attributes.position;
      const count = posAttr.count;
      const colors = new Float32Array(count * 3);

      const colorSurface = new THREE.Color(themeColors.surface);
      const colorMiddle = new THREE.Color(themeColors.middle);
      const colorDeep = new THREE.Color(themeColors.deep);
      const tmpColor = new THREE.Color();

      let ptr = 0;
      for (let iz = 0; iz < rows; iz++) {
        for (let ix = 0; ix < cols; ix++) {
          const h = Math.min(heights[ix][iz], yCutoff);
          posAttr.setY(ptr, h);

          const factor = (h - minY) / (maxY - minY || 1);
          if (factor > 0.6) {
            tmpColor.lerpColors(colorMiddle, colorSurface, (factor - 0.6) / 0.4);
          } else {
            tmpColor.lerpColors(colorDeep, colorMiddle, factor / 0.6);
          }
          colors[ptr * 3] = tmpColor.r;
          colors[ptr * 3 + 1] = tmpColor.g;
          colors[ptr * 3 + 2] = tmpColor.b;
          ptr++;
        }
      }

      planeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      planeGeo.computeVertexNormals();

      const meshMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.8,
        wireframe: renderMode === 'wireframe',
      });

      const mesh = new THREE.Mesh(planeGeo, meshMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // Update Bounding Box outline
    if (bboxMeshRef.current && sceneRef.current) {
      sceneRef.current.remove(bboxMeshRef.current);
    }
    const boxHelper = new THREE.BoxHelper(new THREE.Mesh(new THREE.BoxGeometry(sizeX, sizeY, sizeZ)), 0x38bdf8);
    boxHelper.position.set(0, sizeY / 2, 0);
    sceneRef.current.add(boxHelper);
    bboxMeshRef.current = boxHelper;

    const t2 = performance.now();

    setStats(s => ({
      ...s,
      voxelCount: emittedCount,
      minY,
      maxY,
      avgY: sampleCount > 0 ? parseFloat((sumY / sampleCount).toFixed(1)) : 0,
      calcTimeMs: parseFloat((t1 - t0).toFixed(2)),
      meshTimeMs: parseFloat((t2 - t1).toFixed(2)),
    }));

    // Draw 2D Mini Heightmap
    if (miniMapRef.current) {
      const cvs = miniMapRef.current;
      const ctx = cvs.getContext('2d');
      if (ctx) {
        cvs.width = cols;
        cvs.height = rows;
        const imgData = ctx.createImageData(cols, rows);
        for (let x = 0; x < cols; x++) {
          for (let z = 0; z < rows; z++) {
            const h = heights[x][z];
            const norm = (h - minY) / (maxY - minY || 1);
            const idx = (z * cols + x) * 4;
            imgData.data[idx] = Math.round(norm * 240 + 15);
            imgData.data[idx + 1] = Math.round((1 - Math.abs(norm - 0.5) * 2) * 200 + 40);
            imgData.data[idx + 2] = Math.round((1 - norm) * 220 + 30);
            imgData.data[idx + 3] = 255;
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }
    }
  }, [config, sampleHeight, sampleDensity]);

  // Re-run terrain build on config update
  useEffect(() => {
    rebuildTerrain();
  }, [rebuildTerrain]);

  // Camera presets
  const setCameraView = (view: 'iso' | 'top' | 'front' | 'side') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const { sizeX, sizeY, sizeZ } = config;
    const maxDim = Math.max(sizeX, sizeZ, sizeY);

    if (view === 'iso') {
      cameraRef.current.position.set(maxDim * 1.2, maxDim * 1.0, maxDim * 1.2);
      controlsRef.current.target.set(0, sizeY * 0.3, 0);
    } else if (view === 'top') {
      cameraRef.current.position.set(0, maxDim * 2.0, 0.01);
      controlsRef.current.target.set(0, 0, 0);
    } else if (view === 'front') {
      cameraRef.current.position.set(0, sizeY * 0.4, maxDim * 1.6);
      controlsRef.current.target.set(0, sizeY * 0.4, 0);
    } else if (view === 'side') {
      cameraRef.current.position.set(maxDim * 1.6, sizeY * 0.4, 0);
      controlsRef.current.target.set(0, sizeY * 0.4, 0);
    }
    controlsRef.current.update();
  };

  // Generate copyable code
  const generatedCode = useMemo(() => {
    if (config.algorithm === 'mandelbox_dusk') {
      const tsCode = `// TypeScript - Mandelbox City at Dusk Distance Estimator
export function mandelboxDE(x: number, y: number, z: number, cfg = {
  scale: ${config.mandelboxScale},
  fold: ${config.mandelboxFold},
  minR: ${config.mandelboxMinR},
  fixedR: ${config.mandelboxFixedR},
  iters: ${config.mandelboxIters}
}) {
  let px = x, py = y, pz = z;
  const minR2 = cfg.minR ** 2, fixedR2 = cfg.fixedR ** 2;
  let dr = 1.0;

  for (let i = 0; i < cfg.iters; i++) {
    // Box fold
    if (px > cfg.fold) px = 2 * cfg.fold - px;
    else if (px < -cfg.fold) px = -2 * cfg.fold - px;
    if (py > cfg.fold) py = 2 * cfg.fold - py;
    else if (py < -cfg.fold) py = -2 * cfg.fold - py;
    if (pz > cfg.fold) pz = 2 * cfg.fold - pz;
    else if (pz < -cfg.fold) pz = -2 * cfg.fold - pz;

    // Sphere fold
    const r2 = px * px + py * py + pz * pz;
    if (r2 < minR2) {
      const factor = fixedR2 / minR2;
      px *= factor; py *= factor; pz *= factor; dr *= factor;
    } else if (r2 < fixedR2) {
      const factor = fixedR2 / r2;
      px *= factor; py *= factor; pz *= factor; dr *= factor;
    }

    px = px * cfg.scale + x;
    py = py * cfg.scale + y;
    pz = pz * cfg.scale + z;
    dr = dr * Math.abs(cfg.scale) + 1.0;
  }
  return (Math.hypot(px, py, pz) - Math.abs(cfg.scale - 1)) / dr;
}`;

      const pyCode = `# Python - Mandelbox City at Dusk Distance Estimator
def mandelbox_de(x: float, y: float, z: float, scale=${config.mandelboxScale}, fold=${config.mandelboxFold}, min_r=${config.mandelboxMinR}, fixed_r=${config.mandelboxFixedR}, iters=${config.mandelboxIters}) -> float:
    px, py, pz = x, y, z
    min_r2, fixed_r2 = min_r ** 2, fixed_r ** 2
    dr = 1.0

    for _ in range(iters):
        # Box fold
        if px > fold: px = 2 * fold - px
        elif px < -fold: px = -2 * fold - px
        if py > fold: py = 2 * fold - py
        elif py < -fold: py = -2 * fold - py
        if pz > fold: pz = 2 * fold - pz
        elif pz < -fold: pz = -2 * fold - pz

        # Sphere fold
        r2 = px * px + py * py + pz * pz
        if r2 < min_r2:
            factor = fixed_r2 / min_r2
            px *= factor; py *= factor; pz *= factor; dr *= factor
        elif r2 < fixed_r2:
            factor = fixed_r2 / r2
            px *= factor; py *= factor; pz *= factor; dr *= factor

        px = px * scale + x
        py = py * scale + y
        pz = pz * scale + z
        dr = dr * abs(scale) + 1.0

    return (math.hypot(px, py, pz) - abs(scale - 1.0)) / dr`;

      return { ts: tsCode, py: pyCode };
    }

    if (config.algorithm === 'cyberpunk_city') {
      const tsCode = `// TypeScript - Cyberpunk Mega-City Generator
export function getCityVoxel(wx: number, wy: number, wz: number, cfg = {
  blockSize: ${config.cityBlockSize},
  streetWidth: ${config.streetWidth},
  maxH: ${config.buildingMaxHeight},
  skybridgeInterval: ${config.skybridgeInterval},
  windowDensity: ${config.windowDensity}
}) {
  const P = cfg.blockSize;
  const W = cfg.streetWidth;
  const lx = ((wx % P) + P) % P;
  const lz = ((wz % P) + P) % P;
  const isStreet = lx < W || lz < W;

  // 1. Digital Road Grid (Ground)
  if (isStreet && wy === 0) {
    const isMid = lx === Math.floor(W / 2) || lz === Math.floor(W / 2);
    return { type: 'road', color: isMid ? 0x00f0ff : 0x0a101d };
  }

  // 2. Elevated Multi-Tier Skybridges
  if (isStreet && wy > 0 && wy % cfg.skybridgeInterval === 0 && wy <= cfg.maxH) {
    return { type: 'skybridge', color: 0x00f0ff };
  }

  // 3. Corner Mega-Pillars & Stepped Skyscrapers
  const bx = lx - W;
  const bz = lz - W;
  const lotSize = P - W;
  const isPillar = (bx < 2 && bz < 2) || (bx >= lotSize - 2 && bz < 2) || (bx < 2 && bz >= lotSize - 2);
  if (isPillar && wy <= cfg.maxH + 4) {
    return { type: 'mega_pillar', color: 0x00f0ff };
  }

  return null;
}`;

      const pyCode = `# Python - Cyberpunk Mega-City Generator
def get_city_voxel(wx: int, wy: int, wz: int, block_size=${config.cityBlockSize}, street_width=${config.streetWidth}, max_h=${config.buildingMaxHeight}, skybridge_interval=${config.skybridgeInterval}):
    P, W = block_size, street_width
    lx = wx % P
    lz = wz % P
    is_street = lx < W or lz < W

    # 1. Road surface
    if is_street and wy == 0:
        is_mid = lx == W // 2 or lz == W // 2
        return "road_cyan_grid" if is_mid else "road_asphalt"

    # 2. Skybridges
    if is_street and wy > 0 and wy % skybridge_interval == 0 and wy <= max_h:
        return "skybridge_corridor"

    # 3. Corner Mega-Pillars
    bx = lx - W
    bz = lz - W
    lot_size = P - W
    is_pillar = (bx < 2 and bz < 2) or (bx >= lot_size - 2 and bz < 2)
    if is_pillar and wy <= max_h + 4:
        return "corner_mega_pillar"

    return "skyscraper"`;

      return { ts: tsCode, py: pyCode };
    }

    const tsCode = `// TypeScript - For engine/src/worldgen/TerrainGenerator.ts
sampleHeight(wx: number, wz: number): number {
  const theta = (wx / ${TORUS_SIZE_X}) * Math.PI * 2;
  const phi = (wz / ${TORUS_SIZE_Z}) * Math.PI * 2;
  const px = (${TORUS_R} + ${TORUS_RHO} * Math.cos(phi)) * Math.cos(theta);
  const py = (${TORUS_R} + ${TORUS_RHO} * Math.cos(phi)) * Math.sin(theta);
  const pz = ${TORUS_RHO} * Math.sin(phi);

  const broad = this.noise3D(px * ${config.broadFreq}, py * ${config.broadFreq}, pz * ${config.broadFreq});
  const detail = this.noise3D(px * ${config.detailFreq}, py * ${config.detailFreq}, pz * ${config.detailFreq});
  let height = Math.round(${config.baseHeight} + broad * ${config.broadAmp} + detail * ${config.detailAmp});

  ${config.spawnFlatten ? `const dSpawn = Math.hypot(wx - 8192, wz - 1024);
  if (dSpawn < 26) {
    const blend = Math.max(0, Math.min(1, (dSpawn - 10) / 16));
    height = Math.round(${config.baseHeight} * (1 - blend) + height * blend);
  }` : ''}
  return Math.max(${config.minClamp}, Math.min(${config.maxClamp}, height));
}`;

    const pyCode = `# Python - For server/space_surface.py
def sample_height(self, world_x: int, world_z: int) -> int:
    theta = (world_x / ${TORUS_SIZE_X}) * math.tau
    phi = (world_z / ${TORUS_SIZE_Z}) * math.tau
    px = (${TORUS_R} + ${TORUS_RHO} * math.cos(phi)) * math.cos(theta)
    py = (${TORUS_R} + ${TORUS_RHO} * math.cos(phi)) * math.sin(theta)
    pz = ${TORUS_RHO} * math.sin(phi)

    broad = self.noise(px * ${config.broadFreq}, py * ${config.broadFreq}, pz * ${config.broadFreq})
    detail = self.noise(px * ${config.detailFreq}, py * ${config.detailFreq}, pz * ${config.detailFreq})
    height = math.floor(${config.baseHeight} + broad * ${config.broadAmp} + detail * ${config.detailAmp} + 0.5)

    ${config.spawnFlatten ? `spawn_distance = math.hypot(world_x - 8192, world_z - 1024)
    if spawn_distance < 26:
        blend = max(0.0, min(1.0, (spawn_distance - 10) / 16))
        height = math.floor(${config.baseHeight} * (1 - blend) + height * blend + 0.5)` : ''}
    return max(${config.minClamp}, min(${config.maxClamp}, height))`;

    return { ts: tsCode, py: pyCode };
  }, [config]);

  const copyToClipboard = (type: 'ts' | 'py') => {
    navigator.clipboard.writeText(type === 'ts' ? generatedCode.ts : generatedCode.py);
    setCopiedCode(type);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#090d13] text-gray-200 select-none font-mono">
      {/* Top Navigation Bar */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-3 bg-[#0f1722]/80 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center gap-3">
          <Link
            to="/space/intro"
            className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded border border-white/10 no-underline"
          >
            <Icon icon="mdi:arrow-left" className="text-sm" />
            <span>Space</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-base tracking-wide flex items-center gap-1.5">
              <Icon icon="mdi:terrain" className="text-[#70be51] text-lg" />
              EntropyDrop · Terrain Lab
            </span>
            <span className="px-2 py-0.5 text-[10px] font-semibold bg-[#70be51]/20 text-[#abdf9f] border border-[#70be51]/30 rounded">
              VOXEL ALGORITHM WORKBENCH
            </span>
          </div>
        </div>

        {/* Preset Switcher */}
        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/10 text-xs">
          <button
            onClick={() =>
              setConfig(c => ({
                ...c,
                algorithm: 'mandelbox_dusk',
                sizeX: 64,
                sizeY: 56,
                sizeZ: 64,
                yCutoff: 56,
                mandelboxScale: -1.85,
                mandelboxFold: 1.0,
                mandelboxMinR: 0.5,
                mandelboxFixedR: 1.0,
                mandelboxIters: 5,
                mandelboxZoom: 0.075,
                mandelboxThreshold: 0.18,
                theme: 'dusk',
                renderMode: 'voxel',
              }))
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-all ${config.algorithm === 'mandelbox_dusk' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-bold shadow-[0_0_12px_rgba(245,158,11,0.35)]' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
          >
            <span>🌇</span>
            <span>Mandelbox Dusk</span>
          </button>
          <button
            onClick={() =>
              setConfig(c => ({
                ...c,
                algorithm: 'cyberpunk_city',
                sizeX: 64,
                sizeY: 56,
                sizeZ: 64,
                yCutoff: 56,
                cityBlockSize: 18,
                streetWidth: 5,
                buildingMaxHeight: 44,
                skybridgeInterval: 14,
                windowDensity: 0.65,
                neonTheme: 'neo_tokyo',
                theme: 'scifi',
                renderMode: 'voxel',
              }))
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-all ${config.algorithm === 'cyberpunk_city' ? 'bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/50 font-bold shadow-[0_0_12px_rgba(0,240,255,0.35)]' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
          >
            <span>🌃</span>
            <span>Cyberpunk City</span>
          </button>
          <button
            onClick={() =>
              setConfig(c => ({
                ...c,
                algorithm: 'torus_official',
                sizeX: 48,
                sizeY: 48,
                sizeZ: 48,
                yCutoff: 48,
                theme: 'nature',
                renderMode: 'voxel',
              }))
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-all ${config.algorithm === 'torus_official' ? 'bg-[#70be51]/20 text-[#abdf9f] border border-[#70be51]/50 font-bold' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
          >
            <span>🌱</span>
            <span>Torus Game</span>
          </button>
          <button
            onClick={() =>
              setConfig(c => ({
                ...c,
                algorithm: 'terraced_scifi',
                sizeX: 64,
                sizeY: 48,
                sizeZ: 64,
                yCutoff: 48,
                theme: 'arctic',
                renderMode: 'voxel',
              }))
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-all ${config.algorithm === 'terraced_scifi' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
          >
            <span>🛸</span>
            <span>Sci-Fi Steppes</span>
          </button>
        </div>

        {/* Top Quick Actions */}
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setConfig(c => ({ ...c, seed: Math.floor(Math.random() * 999999) }))}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-white transition-all"
            title="Randomize Seed"
          >
            <Icon icon="mdi:dice-5-outline" className="text-sm text-[#70be51]" />
            <span>Seed: {config.seed}</span>
          </button>

          <button
            onClick={rebuildTerrain}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3c8527] hover:bg-[#4ea833] text-white font-semibold rounded shadow transition-all active:scale-95"
          >
            <Icon icon="mdi:refresh" className="text-sm" />
            <span>Regenerate</span>
          </button>

          <button
            onClick={() => setConfig(DEFAULT_CONFIG)}
            className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-white/60 hover:text-white"
            title="Reset All Parameters"
          >
            <Icon icon="mdi:restore" className="text-sm" />
          </button>
        </div>
      </header>

      {/* 3D Canvas Viewport */}
      <div ref={containerRef} className="absolute inset-0 z-0">
        <canvas ref={canvasRef} className="w-full h-full block cursor-grab active:cursor-grabbing" />
      </div>

      {/* Floating View Angle Selector */}
      <div className="absolute top-16 right-6 z-20 flex items-center gap-1 bg-[#0f1722]/85 backdrop-blur-md p-1 border border-white/10 rounded shadow-lg text-xs">
        <button
          onClick={() => setCameraView('iso')}
          className="px-2.5 py-1 rounded hover:bg-white/10 text-white/80 hover:text-white"
        >
          Perspective
        </button>
        <button
          onClick={() => setCameraView('top')}
          className="px-2.5 py-1 rounded hover:bg-white/10 text-white/80 hover:text-white"
        >
          Top
        </button>
        <button
          onClick={() => setCameraView('front')}
          className="px-2.5 py-1 rounded hover:bg-white/10 text-white/80 hover:text-white"
        >
          Front
        </button>
        <button
          onClick={() => setCameraView('side')}
          className="px-2.5 py-1 rounded hover:bg-white/10 text-white/80 hover:text-white"
        >
          Side
        </button>
      </div>

      {/* Left Control Dashboard */}
      <aside className="absolute top-16 left-6 bottom-6 z-20 w-84 bg-[#0f1722]/90 backdrop-blur-xl border border-white/15 rounded-lg shadow-2xl flex flex-col overflow-hidden text-xs">
        {/* Navigation Tabs */}
        <div className="flex border-b border-white/10 bg-black/20 text-[11px]">
          <button
            onClick={() => setActiveTab('dimensions')}
            className={`flex-1 py-2.5 flex items-center justify-center gap-1 transition-colors ${activeTab === 'dimensions' ? 'text-[#70be51] border-b-2 border-[#70be51] bg-white/5 font-bold' : 'text-white/50 hover:text-white'}`}
          >
            <Icon icon="mdi:ruler-square" />
            <span>Size XYZ</span>
          </button>
          <button
            onClick={() => setActiveTab('algorithm')}
            className={`flex-1 py-2.5 flex items-center justify-center gap-1 transition-colors ${activeTab === 'algorithm' ? 'text-[#70be51] border-b-2 border-[#70be51] bg-white/5 font-bold' : 'text-white/50 hover:text-white'}`}
          >
            <Icon icon="mdi:sine-wave" />
            <span>Algorithm</span>
          </button>
          <button
            onClick={() => setActiveTab('shading')}
            className={`flex-1 py-2.5 flex items-center justify-center gap-1 transition-colors ${activeTab === 'shading' ? 'text-[#70be51] border-b-2 border-[#70be51] bg-white/5 font-bold' : 'text-white/50 hover:text-white'}`}
          >
            <Icon icon="mdi:palette" />
            <span>Visual</span>
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`flex-1 py-2.5 flex items-center justify-center gap-1 transition-colors ${activeTab === 'export' ? 'text-[#70be51] border-b-2 border-[#70be51] bg-white/5 font-bold' : 'text-white/50 hover:text-white'}`}
          >
            <Icon icon="mdi:code-braces" />
            <span>Code</span>
          </button>
        </div>

        {/* Tab Content Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* TAB 1: DIMENSIONS */}
          {activeTab === 'dimensions' && (
            <div className="space-y-4">
              <div className="text-[11px] uppercase tracking-wider text-white/40 font-bold">
                Generation Volume (X · Y · Z)
              </div>

              {/* Size X */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-white/80">
                  <span className="flex items-center gap-1 text-red-400 font-bold">
                    <Icon icon="mdi:axis-x-arrow" /> Size X (Width):
                  </span>
                  <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-white font-bold">{config.sizeX}m</span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="192"
                  step="8"
                  value={config.sizeX}
                  onChange={e => setConfig(c => ({ ...c, sizeX: Number(e.target.value) }))}
                  className="w-full accent-[#70be51] cursor-pointer"
                />
                <div className="flex gap-1.5">
                  {[16, 32, 48, 64, 128].map(s => (
                    <button
                      key={s}
                      onClick={() => setConfig(c => ({ ...c, sizeX: s }))}
                      className={`flex-1 py-1 text-[10px] rounded border ${config.sizeX === s ? 'bg-[#70be51]/20 border-[#70be51] text-[#abdf9f]' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Size Z */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-white/80">
                  <span className="flex items-center gap-1 text-blue-400 font-bold">
                    <Icon icon="mdi:axis-z-arrow" /> Size Z (Depth):
                  </span>
                  <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-white font-bold">{config.sizeZ}m</span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="192"
                  step="8"
                  value={config.sizeZ}
                  onChange={e => setConfig(c => ({ ...c, sizeZ: Number(e.target.value) }))}
                  className="w-full accent-[#70be51] cursor-pointer"
                />
                <div className="flex gap-1.5">
                  {[16, 32, 48, 64, 128].map(s => (
                    <button
                      key={s}
                      onClick={() => setConfig(c => ({ ...c, sizeZ: s }))}
                      className={`flex-1 py-1 text-[10px] rounded border ${config.sizeZ === s ? 'bg-[#70be51]/20 border-[#70be51] text-[#abdf9f]' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Size Y */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-white/80">
                  <span className="flex items-center gap-1 text-green-400 font-bold">
                    <Icon icon="mdi:axis-y-arrow" /> Size Y (Max Height):
                  </span>
                  <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-white font-bold">{config.sizeY}m</span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="96"
                  step="4"
                  value={config.sizeY}
                  onChange={e => setConfig(c => ({ ...c, sizeY: Number(e.target.value) }))}
                  className="w-full accent-[#70be51] cursor-pointer"
                />
              </div>

              {/* Y Cutoff (Cross Section) */}
              <div className="space-y-1.5 pt-2 border-t border-white/10">
                <div className="flex justify-between items-center text-white/80">
                  <span className="text-yellow-400 flex items-center gap-1">
                    <Icon icon="mdi:layers-triple-outline" /> Y-Slice Inspector:
                  </span>
                  <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-white font-bold">≤ {config.yCutoff}m</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max={config.sizeY}
                  step="1"
                  value={config.yCutoff}
                  onChange={e => setConfig(c => ({ ...c, yCutoff: Number(e.target.value) }))}
                  className="w-full accent-yellow-500 cursor-pointer"
                />
              </div>

              {/* World Origin Offset */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="text-white/60 font-semibold flex items-center justify-between">
                  <span>World Offset Anchor:</span>
                  <button
                    onClick={() => setConfig(c => ({ ...c, offsetX: 8192, offsetZ: 1024 }))}
                    className="text-[10px] text-[#70be51] hover:underline"
                  >
                    Reset to Spawn
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-white/40">X Coordinate</label>
                    <input
                      type="number"
                      value={config.offsetX}
                      onChange={e => setConfig(c => ({ ...c, offsetX: Number(e.target.value) }))}
                      className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/40">Z Coordinate</label>
                    <input
                      type="number"
                      value={config.offsetZ}
                      onChange={e => setConfig(c => ({ ...c, offsetZ: Number(e.target.value) }))}
                      className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-white text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ALGORITHM & PARAMS */}
          {activeTab === 'algorithm' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-wider text-white/40 font-bold">
                  Select Generator Pattern
                </label>
                <select
                  value={config.algorithm}
                  onChange={e => setConfig(c => ({ ...c, algorithm: e.target.value as AlgorithmType }))}
                  className="w-full bg-[#182330] border border-white/15 rounded px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-[#f59e0b]"
                >
                  <option value="mandelbox_dusk">🌇 1. Mandelbox - City at Dusk (Box-Fold 3D Fractal)</option>
                  <option value="cyberpunk_city">🌃 2. Cyberpunk Mega-City (Grid Roads & Skybridges)</option>
                  <option value="torus_official">🌱 3. Torus 3D Simplex (Official Game)</option>
                  <option value="fbm_fractal">⛰️ 4. Multi-Octave Fractal (fBm)</option>
                  <option value="ridged_mountain">🏔️ 5. Ridged Multifractal (Canyons & Peaks)</option>
                  <option value="terraced_scifi">🛸 6. Sci-Fi Terraced Steppes</option>
                  <option value="density_3d">🕳️ 7. 3D Cavity & Overhangs (Arch / Caves)</option>
                  <option value="custom_code">💻 8. Custom Live Expression</option>
                </select>
              </div>

              {/* Algorithm-Specific Sliders */}
              <div className="space-y-3 pt-2 border-t border-white/10">
                {/* Mandelbox Dusk Parameters */}
                {config.algorithm === 'mandelbox_dusk' ? (
                  <>
                    {/* Mandelbox Scale */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Fractal Scale:</span>
                        <span className="font-bold text-amber-400">{config.mandelboxScale.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="-2.5"
                        max="-1.2"
                        step="0.05"
                        value={config.mandelboxScale}
                        onChange={e => setConfig(c => ({ ...c, mandelboxScale: Number(e.target.value) }))}
                        className="w-full accent-amber-500"
                      />
                    </div>

                    {/* Box Fold Limit */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Box Fold Limit (L):</span>
                        <span className="font-bold text-amber-400">{config.mandelboxFold.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.6"
                        max="1.6"
                        step="0.05"
                        value={config.mandelboxFold}
                        onChange={e => setConfig(c => ({ ...c, mandelboxFold: Number(e.target.value) }))}
                        className="w-full accent-amber-500"
                      />
                    </div>

                    {/* Sphere Min Radius */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Sphere Min Radius (r):</span>
                        <span className="font-bold text-rose-400">{config.mandelboxMinR.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.2"
                        max="0.9"
                        step="0.05"
                        value={config.mandelboxMinR}
                        onChange={e => setConfig(c => ({ ...c, mandelboxMinR: Number(e.target.value) }))}
                        className="w-full accent-rose-500"
                      />
                    </div>

                    {/* Spatial Zoom */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Spatial Pitch / Zoom:</span>
                        <span className="font-bold text-amber-300">{config.mandelboxZoom.toFixed(3)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.03"
                        max="0.15"
                        step="0.005"
                        value={config.mandelboxZoom}
                        onChange={e => setConfig(c => ({ ...c, mandelboxZoom: Number(e.target.value) }))}
                        className="w-full accent-amber-400"
                      />
                    </div>

                    {/* Solid Threshold */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Density / Solid Fill:</span>
                        <span className="font-bold text-purple-300">{config.mandelboxThreshold.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.08"
                        max="0.32"
                        step="0.01"
                        value={config.mandelboxThreshold}
                        onChange={e => setConfig(c => ({ ...c, mandelboxThreshold: Number(e.target.value) }))}
                        className="w-full accent-purple-400"
                      />
                    </div>

                    {/* Fractal Iterations */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Fractal Iterations:</span>
                        <span className="font-bold text-amber-400">{config.mandelboxIters}</span>
                      </div>
                      <input
                        type="range"
                        min="3"
                        max="7"
                        step="1"
                        value={config.mandelboxIters}
                        onChange={e => setConfig(c => ({ ...c, mandelboxIters: Number(e.target.value) }))}
                        className="w-full accent-amber-500"
                      />
                    </div>

                    {/* Fractal Offset Pan */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Fractal Pan Offset:</span>
                        <span className="font-bold text-amber-300">{config.mandelboxOffsetX.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="2.5"
                        step="0.05"
                        value={config.mandelboxOffsetX}
                        onChange={e =>
                          setConfig(c => ({
                            ...c,
                            mandelboxOffsetX: Number(e.target.value),
                            mandelboxOffsetZ: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-amber-400"
                      />
                    </div>
                  </>
                ) : config.algorithm === 'cyberpunk_city' ? (
                  <>
                    {/* City Block Size */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Block Pitch (Grid Pitch):</span>
                        <span className="font-bold text-[#00f0ff]">{config.cityBlockSize}m</span>
                      </div>
                      <input
                        type="range"
                        min="12"
                        max="32"
                        step="2"
                        value={config.cityBlockSize}
                        onChange={e => setConfig(c => ({ ...c, cityBlockSize: Number(e.target.value) }))}
                        className="w-full accent-[#00f0ff]"
                      />
                    </div>

                    {/* Street Width */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Street Canyon Width:</span>
                        <span className="font-bold text-[#00f0ff]">{config.streetWidth}m</span>
                      </div>
                      <input
                        type="range"
                        min="3"
                        max="8"
                        step="1"
                        value={config.streetWidth}
                        onChange={e => setConfig(c => ({ ...c, streetWidth: Number(e.target.value) }))}
                        className="w-full accent-[#00f0ff]"
                      />
                    </div>

                    {/* Building Max Height */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Skyscraper Max Height:</span>
                        <span className="font-bold text-[#f43f5e]">{config.buildingMaxHeight}m</span>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="80"
                        step="2"
                        value={config.buildingMaxHeight}
                        onChange={e => setConfig(c => ({ ...c, buildingMaxHeight: Number(e.target.value) }))}
                        className="w-full accent-[#f43f5e]"
                      />
                    </div>

                    {/* Skybridge Interval */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Skybridge Tier Interval:</span>
                        <span className="font-bold text-[#00f0ff]">Every {config.skybridgeInterval}m</span>
                      </div>
                      <input
                        type="range"
                        min="8"
                        max="24"
                        step="2"
                        value={config.skybridgeInterval}
                        onChange={e => setConfig(c => ({ ...c, skybridgeInterval: Number(e.target.value) }))}
                        className="w-full accent-[#00f0ff]"
                      />
                    </div>

                    {/* Window Illumination Density */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Window Illumination:</span>
                        <span className="font-bold text-yellow-400">{Math.round(config.windowDensity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="0.95"
                        step="0.05"
                        value={config.windowDensity}
                        onChange={e => setConfig(c => ({ ...c, windowDensity: Number(e.target.value) }))}
                        className="w-full accent-yellow-400"
                      />
                    </div>

                    {/* Neon Scheme Palette */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-white/60">Cyber Neon Mood:</span>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { id: 'neo_tokyo', label: 'Tokyo Cyan', col: '#00f0ff' },
                          { id: 'matrix', label: 'Matrix Lime', col: '#10b981' },
                          { id: 'outrun', label: 'Outrun Pink', col: '#f43f5e' },
                        ].map(item => (
                          <button
                            key={item.id}
                            onClick={() => setConfig(c => ({ ...c, neonTheme: item.id as any }))}
                            className={`py-1 px-1.5 rounded text-[10px] border flex items-center justify-center gap-1 ${config.neonTheme === item.id ? 'bg-white/10 border-white text-white font-bold' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}
                          >
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.col }} />
                            <span>{item.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Base Height */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Base Height (Y₀):</span>
                        <span className="font-bold text-white">{config.baseHeight}m</span>
                      </div>
                      <input
                        type="range"
                        min="4"
                        max="40"
                        value={config.baseHeight}
                        onChange={e => setConfig(c => ({ ...c, baseHeight: Number(e.target.value) }))}
                        className="w-full accent-[#70be51]"
                      />
                    </div>

                    {/* Broad Frequency */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Broad Frequency:</span>
                        <span className="font-bold text-white">{config.broadFreq.toFixed(3)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.005"
                        max="0.08"
                        step="0.001"
                        value={config.broadFreq}
                        onChange={e => setConfig(c => ({ ...c, broadFreq: Number(e.target.value) }))}
                        className="w-full accent-[#70be51]"
                      />
                    </div>

                    {/* Broad Amplitude */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Elevation Strength:</span>
                        <span className="font-bold text-white">{config.broadAmp.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="16"
                        step="0.2"
                        value={config.broadAmp}
                        onChange={e => setConfig(c => ({ ...c, broadAmp: Number(e.target.value) }))}
                        className="w-full accent-[#70be51]"
                      />
                    </div>
                  </>
                )}

                {/* Detail Frequency (Torus official) */}
                {config.algorithm === 'torus_official' && (
                  <>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Detail Frequency:</span>
                        <span className="font-bold text-white">{config.detailFreq.toFixed(3)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.01"
                        max="0.15"
                        step="0.005"
                        value={config.detailFreq}
                        onChange={e => setConfig(c => ({ ...c, detailFreq: Number(e.target.value) }))}
                        className="w-full accent-[#70be51]"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Detail Amplitude:</span>
                        <span className="font-bold text-white">{config.detailAmp.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="8"
                        step="0.2"
                        value={config.detailAmp}
                        onChange={e => setConfig(c => ({ ...c, detailAmp: Number(e.target.value) }))}
                        className="w-full accent-[#70be51]"
                      />
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-white/70">Spawn Pad Flattening:</span>
                      <input
                        type="checkbox"
                        checked={config.spawnFlatten}
                        onChange={e => setConfig(c => ({ ...c, spawnFlatten: e.target.checked }))}
                        className="accent-[#70be51] w-4 h-4 cursor-pointer"
                      />
                    </div>
                  </>
                )}

                {/* Fractal Octaves, Persistence, Lacunarity */}
                {(config.algorithm === 'fbm_fractal' || config.algorithm === 'ridged_mountain') && (
                  <>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Fractal Octaves:</span>
                        <span className="font-bold text-white">{config.octaves}</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="6"
                        step="1"
                        value={config.octaves}
                        onChange={e => setConfig(c => ({ ...c, octaves: Number(e.target.value) }))}
                        className="w-full accent-[#70be51]"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Persistence (Gain):</span>
                        <span className="font-bold text-white">{config.persistence.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="0.9"
                        step="0.05"
                        value={config.persistence}
                        onChange={e => setConfig(c => ({ ...c, persistence: Number(e.target.value) }))}
                        className="w-full accent-[#70be51]"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/60">Lacunarity:</span>
                        <span className="font-bold text-white">{config.lacunarity.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="1.5"
                        max="3.5"
                        step="0.1"
                        value={config.lacunarity}
                        onChange={e => setConfig(c => ({ ...c, lacunarity: Number(e.target.value) }))}
                        className="w-full accent-[#70be51]"
                      />
                    </div>
                  </>
                )}

                {/* 3D Density Strength */}
                {config.algorithm === 'density_3d' && (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-white/60">3D Density Cavity Strength:</span>
                      <span className="font-bold text-white">{config.densityStrength.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="3.0"
                      step="0.1"
                      value={config.densityStrength}
                      onChange={e => setConfig(c => ({ ...c, densityStrength: Number(e.target.value) }))}
                      className="w-full accent-[#70be51]"
                    />
                  </div>
                )}

                {/* Terraced Steps */}
                {config.algorithm === 'terraced_scifi' && (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-white/60">Terrace Step Height:</span>
                      <span className="font-bold text-white">{config.terraceSteps}m</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="10"
                      step="1"
                      value={config.terraceSteps}
                      onChange={e => setConfig(c => ({ ...c, terraceSteps: Number(e.target.value) }))}
                      className="w-full accent-[#70be51]"
                    />
                  </div>
                )}

                {/* Custom Expression Editor */}
                {config.algorithm === 'custom_code' && (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[10px] text-white/50">JavaScript Height Expression:</label>
                    <textarea
                      rows={5}
                      value={config.customCode}
                      onChange={e => setConfig(c => ({ ...c, customCode: e.target.value }))}
                      className="w-full bg-black/60 border border-white/20 rounded p-2 text-green-300 font-mono text-[11px] focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: VISUAL & SHADING */}
          {activeTab === 'shading' && (
            <div className="space-y-4">
              {/* Render Mode */}
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-wider text-white/40 font-bold">
                  Rendering Style
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['voxel', 'surface', 'wireframe'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setConfig(c => ({ ...c, renderMode: mode }))}
                      className={`py-2 rounded capitalize border flex items-center justify-center gap-1 ${config.renderMode === mode ? 'bg-[#70be51]/20 border-[#70be51] text-[#abdf9f] font-bold' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}
                    >
                      <Icon icon={mode === 'voxel' ? 'mdi:cube-outline' : mode === 'surface' ? 'mdi:terrain' : 'mdi:vector-square'} />
                      <span>{mode}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Theme */}
              <div className="space-y-1.5 pt-2 border-t border-white/10">
                <label className="text-[11px] uppercase tracking-wider text-white/40 font-bold">
                  Palette & Biome Theme
                </label>
                <div className="space-y-2">
                  {Object.entries(THEMES).map(([key, item]) => (
                    <button
                      key={key}
                      onClick={() => setConfig(c => ({ ...c, theme: key }))}
                      className={`w-full p-2 rounded border flex items-center justify-between text-left transition-all ${config.theme === key ? 'bg-white/10 border-[#70be51]' : 'bg-white/5 border-white/5 hover:border-white/20'}`}
                    >
                      <span className="font-semibold text-white">{item.name}</span>
                      <div className="flex gap-1">
                        <span className="w-3.5 h-3.5 rounded" style={{ backgroundColor: `#${item.surface.toString(16).padStart(6, '0')}` }} />
                        <span className="w-3.5 h-3.5 rounded" style={{ backgroundColor: `#${item.middle.toString(16).padStart(6, '0')}` }} />
                        <span className="w-3.5 h-3.5 rounded" style={{ backgroundColor: `#${item.deep.toString(16).padStart(6, '0')}` }} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CODE EXPORT */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="text-[11px] uppercase tracking-wider text-white/40 font-bold">
                Export to Game Code
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-white font-semibold flex items-center gap-1">
                    <Icon icon="mdi:language-typescript" className="text-blue-400 text-base" />
                    TerrainGenerator.ts
                  </span>
                  <button
                    onClick={() => copyToClipboard('ts')}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#3c8527] hover:bg-[#4ea833] text-white rounded text-[11px] transition-all"
                  >
                    <Icon icon={copiedCode === 'ts' ? 'mdi:check' : 'mdi:content-copy'} />
                    <span>{copiedCode === 'ts' ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="p-2.5 bg-black/60 border border-white/10 rounded text-[10px] text-green-300 overflow-x-auto max-h-40 select-all">
                  {generatedCode.ts}
                </pre>
              </div>

              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="flex justify-between items-center">
                  <span className="text-white font-semibold flex items-center gap-1">
                    <Icon icon="mdi:language-python" className="text-yellow-400 text-base" />
                    space_surface.py
                  </span>
                  <button
                    onClick={() => copyToClipboard('py')}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#3c8527] hover:bg-[#4ea833] text-white rounded text-[11px] transition-all"
                  >
                    <Icon icon={copiedCode === 'py' ? 'mdi:check' : 'mdi:content-copy'} />
                    <span>{copiedCode === 'py' ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="p-2.5 bg-black/60 border border-white/10 rounded text-[10px] text-yellow-200 overflow-x-auto max-h-40 select-all">
                  {generatedCode.py}
                </pre>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Bottom Right Floating Stats & 2D Heightmap */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-2.5 items-end">
        {/* Top-Down 2D Canvas */}
        <div className="bg-[#0f1722]/85 backdrop-blur-md p-2 border border-white/15 rounded-lg shadow-xl flex flex-col items-center gap-1.5">
          <div className="flex justify-between items-center w-full px-1 text-[10px] text-white/50">
            <span>2D Elevation Map</span>
            <span>{config.sizeX}×{config.sizeZ}</span>
          </div>
          <canvas
            ref={miniMapRef}
            className="w-28 h-28 bg-black/50 border border-white/10 rounded object-contain image-rendering-pixelated"
          />
        </div>

        {/* Real-time Metric Cards */}
        <div className="bg-[#0f1722]/90 backdrop-blur-md p-3.5 border border-white/15 rounded-lg shadow-xl w-64 text-[11px] space-y-2">
          <div className="flex justify-between items-center pb-1.5 border-b border-white/10">
            <span className="text-white/60">Live Metrics</span>
            <span className="text-green-400 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
              {stats.fps} FPS
            </span>
          </div>

          <div className="grid grid-cols-2 gap-y-1.5 text-[10px]">
            <span className="text-white/50">Block Columns:</span>
            <span className="text-right text-white font-bold">{stats.voxelCount.toLocaleString()}</span>

            <span className="text-white/50">Min / Max Y:</span>
            <span className="text-right text-white font-bold">{stats.minY}m / {stats.maxY}m</span>

            <span className="text-white/50">Average Elevation:</span>
            <span className="text-right text-white font-bold">{stats.avgY}m</span>

            <span className="text-white/50">Algorithm Latency:</span>
            <span className="text-right text-yellow-400 font-mono">{stats.calcTimeMs} ms</span>

            <span className="text-white/50">Mesh Latency:</span>
            <span className="text-right text-blue-400 font-mono">{stats.meshTimeMs} ms</span>
          </div>
        </div>
      </div>
    </div>
  );
}
