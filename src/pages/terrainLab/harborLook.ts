import * as THREE from 'three';
import { createCanyonMaterial } from './canyonLook';

/** Porous warm limestone, patinated metal and a smoother river share one normal material. */
export function createHarborMaterial(wear: number, offsetX: number, offsetZ: number) {
  const material = createCanyonMaterial(wear, offsetX, offsetZ);
  material.roughness = 0.9;
  material.metalness = 0.045;
  material.envMapIntensity = 0.35;
  const compile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace('mix(roughnessFactor, 0.23, blueSurface)', 'mix(roughnessFactor, 0.32, blueSurface)')
      .replace('mix(metalnessFactor, 0.35, blueSurface)', 'mix(metalnessFactor, 0.05, blueSurface)');
  };
  return material;
}

/** Seamless spherical cloud field with backlit edges, low sun and valley haze. */
export function createHarborSky() {
  const canvas = document.createElement('canvas'); canvas.width = 1536; canvas.height = 768;
  const ctx = canvas.getContext('2d')!, pixels = ctx.createImageData(canvas.width, canvas.height);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const hash = (x: number, z: number) => {
    let h = Math.imul(x ^ 9813741, 0x85ebca6b); h = Math.imul(h ^ (h >>> 16) ^ z, 0xc2b2ae35);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };
  const noise = (x: number, z: number) => {
    const ix = Math.floor(x), iz = Math.floor(z), dx = x - ix, dz = z - iz;
    const u = dx * dx * (3 - 2 * dx), v = dz * dz * (3 - 2 * dz);
    return mix(mix(hash(ix, iz), hash(ix + 1, iz), u), mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
  };
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const theta = y / canvas.height * Math.PI, phi = x / canvas.width * Math.PI * 2;
    const dy = Math.cos(theta), dx = Math.sin(theta) * Math.cos(phi), dz = Math.sin(theta) * Math.sin(phi);
    const horizon = Math.exp(-Math.abs(dy) * 4.8), sunDot = dx * -0.3 + dy * 0.16 + dz * -0.94;
    const warm = Math.max(0, sunDot), rgb = [mix(55, 209 + warm * 29, horizon), mix(76, 161 + warm * 26, horizon), mix(95, 111 + warm * 23, horizon)];
    if (dy > -0.03) {
      const scale = 3.2 / (Math.max(0, dy) + 0.16), px = dx * scale, pz = dz * scale;
      let cloud = 0, amp = 0.54;
      for (let i = 0; i < 5; i++) { const f = 2.07 ** i; cloud += noise(px * f + i * 17, pz * f - i * 9) * amp; amp *= 0.48; }
      const cover = Math.max(0, Math.min(0.95, (cloud - 0.36) * 3.9)) * Math.max(0, Math.min(1, dy / 0.09));
      const edge = Math.max(0, 1 - Math.abs(cloud - 0.405) * 19) * (0.3 + warm * 0.7);
      const lit = [60 + edge * 162, 66 + edge * 116, 71 + edge * 65];
      for (let c = 0; c < 3; c++) rgb[c] = mix(rgb[c], lit[c], cover);
      const sun = Math.min(1, Math.exp(-(1 - Math.min(1, sunDot)) * 1600) + Math.exp(-(1 - sunDot) * 22) * 0.2);
      for (let c = 0; c < 3; c++) rgb[c] = mix(rgb[c], [255, 231, 167][c], sun);
    }
    const haze = Math.max(0, Math.min(1, (-dy + 0.065) * 8));
    for (let c = 0; c < 3; c++) pixels.data[(x + y * canvas.width) * 4 + c] = mix(rgb[c], [127, 133, 132][c], haze);
    pixels.data[(x + y * canvas.width) * 4 + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
