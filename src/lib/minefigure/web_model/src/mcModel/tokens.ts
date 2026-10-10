import * as THREE from 'three';
import type { ColorRGBA, MaterialToken } from '../types/index.js';

export const PLACEHOLDER_COLOR: ColorRGBA = [0.5, 1.0, 1.0, 1.0]; // SURFACE_PLACEHOLDER_COLOR
export const WHITE: ColorRGBA = [1, 1, 1, 1];
// Socket walls and split faces have no stickers and expose the white print.
export const CUT_SURFACE_COLOR: ColorRGBA = WHITE;

// Visual colors for the cutter overlay (wireframe) per cutter kind.
export const CUTTER_COLORS = {
  split: '#f59e0b', // 拆分平面 (limb halves)
  joint: '#a78bfa', // 关节孔
  connector: '#34d399', // 连接孔 (shoulder / hip)
  neck: '#60a5fa', // 颈部孔
} as const;

// face config index -> three.js BoxGeometry face group index.
// three.js BoxGeometry triangle order: +x, -x, +y, -y, +z, -z (groups 0..5).
// mc_model.py face configs (by constant coordinate):
//   0:+X  1:+Y  2:-Y  3:+Z  4:-Z  5:-X
export const FACE_GROUPS = [0, 2, 3, 4, 5, 1] as const;

export const CUT_TOKEN: MaterialToken = { color: CUT_SURFACE_COLOR, opacity: 1 };

/** Registry mapping skin colors to lightweight material tokens (no THREE.Material). */
export class TokenRegistry {
  private map: Map<string, number>;
  public tokens: MaterialToken[];

  constructor() {
    this.map = new Map();
    this.tokens = [CUT_TOKEN]; // slot 0 reserved for cut walls
  }

  get(
    rOrColor: number | ColorRGBA | number[] | Float32Array,
    g?: number,
    b?: number,
    a = 1.0,
    opacity = 1.0
  ): number {
    let r: number;
    let gg: number;
    let bb: number;
    let aa: number;

    if (typeof rOrColor === 'number') {
      r = rOrColor;
      gg = g ?? 0;
      bb = b ?? 0;
      aa = a;
    } else {
      r = rOrColor[0] ?? 0;
      gg = rOrColor[1] ?? 0;
      bb = rOrColor[2] ?? 0;
      aa = rOrColor[3] ?? 1.0;
    }

    const ir = Math.round(r * 255);
    const ig = Math.round(gg * 255);
    const ib = Math.round(bb * 255);
    const ia = Math.round(aa * 255);
    const iop = Math.round(opacity * 100);
    // Keep all channels and opacity distinct. Mixing the packed channels with
    // bitwise OR erased color bits and made unrelated texels share a token.
    const key = `${ir},${ig},${ib},${ia},${iop}`;
    let idx = this.map.get(key);
    if (idx === undefined) {
      idx = this.tokens.length;
      this.tokens.push({ color: [r, gg, bb, aa], opacity });
      this.map.set(key, idx);
    }
    return idx;
  }
}

export const _unitCube = (() => {
  const geom = new THREE.BoxGeometry(1, 1, 1);
  geom.computeVertexNormals();
  return geom;
})();

export const _faceGroupMap = new WeakMap<THREE.BufferGeometry, Map<number, THREE.BufferGeometry>>();
