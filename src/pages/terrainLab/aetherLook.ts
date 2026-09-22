import * as THREE from 'three';
import { createConcreteMaterial } from './brutalistLook';

/** One opaque material for masonry, foliage and water. Instance colour selects
 * a smoother response for blue water; the other material is true emission. */
export function createAetherMaterial() {
  const material = createConcreteMaterial(0.48);
  material.roughness = 0.88;
  material.metalness = 0.02;
  const compile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      float waterMask = smoothstep(0.04, 0.22, diffuseColor.b - diffuseColor.r);
      roughnessFactor = mix(roughnessFactor, 0.3, waterMask);
    `);
  };
  return material;
}

/** Atmospheric backdrop only: cloud sea below the horizon, high cirrus above.
 * Cloud coordinates are projected onto a plane, so the lower hemisphere has
 * depth and perspective instead of looking like an upside-down sky. */
export function createAetherSky() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 1024;
  const ctx = canvas.getContext('2d')!, pixels = ctx.createImageData(canvas.width, canvas.height);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const hash = (x: number, z: number) => {
    let h = Math.imul(x ^ 9348571, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 16) ^ z, 0xc2b2ae35);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };
  const noise = (x: number, z: number) => {
    const ix = Math.floor(x), iz = Math.floor(z), dx = x - ix, dz = z - iz;
    const u = dx * dx * (3 - 2 * dx), v = dz * dz * (3 - 2 * dz);
    return mix(mix(hash(ix, iz), hash(ix + 1, iz), u), mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
  };
  const cloud = (x: number, z: number) => noise(x, z) * 0.58 + noise(x * 2.07 + 31, z * 2.07 - 13) * 0.28 + noise(x * 4.31, z * 4.31) * 0.14;
  const volume = (x: number, y: number, z: number) => {
    const iy = Math.floor(y), fy = y - iy, t = fy * fy * (3 - 2 * fy);
    return mix(noise(x + iy * 17, z + iy * 29), noise(x + (iy + 1) * 17, z + (iy + 1) * 29), t);
  };
  const density = (x: number, y: number, z: number) => {
    const puffs = volume(x * 0.027, y * 0.039, z * 0.027) * 0.72 + volume(x * 0.065 + 19, y * 0.08, z * 0.065 - 7) * 0.28;
    const edge = Math.abs(y + 8) / 40;
    return Math.max(0, (puffs - 0.44 - edge * edge * 0.28) * 0.3);
  };
  const sunDirection = new THREE.Vector3(-0.8, 0.08, -0.6).normalize();
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const theta = y / canvas.height * Math.PI, phi = x / canvas.width * Math.PI * 2;
    const dy = Math.cos(theta), dx = Math.sin(theta) * Math.cos(phi), dz = Math.sin(theta) * Math.sin(phi);
    const horizon = Math.exp(-Math.abs(dy) * 5), light = Math.max(0, dx * sunDirection.x + dz * sunDirection.z);
    const sky = [mix(77, 223 + light * 23, horizon), mix(87, 149 + light * 27, horizon), mix(126, 121 + light * 3, horizon)];
    const rgb = [...sky];
    if (dy < 0) {
      // Integrate a shallow cloud volume from front to back. The density field is
      // sampled in 3D; overhead light and a second sample provide self-shadowing.
      const start = 58 / -dy, end = Math.min(4500, 140 / -dy), step = (end - start) / 22;
      let transmission = 1;
      const accumulated = [0, 0, 0];
      for (let i = 0; i < 22 && transmission > 0.035 && step > 0; i++) {
        const t = start + (i + 0.5) * step, px = dx * t, py = 90 + dy * t, pz = dz * t;
        const mass = density(px, py, pz); if (mass < 0.001) continue;
        const shade = density(px - 12, py + 15, pz - 8);
        const sunlit = Math.max(0, Math.min(1, 0.1 + (py + 35) / 70 * 0.85 + (mass - shade) * 5 - shade * 9));
        const alpha = 1 - Math.exp(-mass * Math.min(18, step));
        const haze = Math.min(0.92, t / 2400);
        const lit = [mix(93, 249, sunlit), mix(90, 187, sunlit), mix(121, 154, sunlit)];
        for (let c = 0; c < 3; c++) accumulated[c] += mix(lit[c], sky[c], haze) * alpha * transmission;
        transmission *= 1 - alpha;
      }
      const horizonHaze = Math.exp(dy * 12);
      for (let c = 0; c < 3; c++) rgb[c] = start >= end ? sky[c]
        : accumulated[c] + mix([81, 85, 119][c], sky[c], horizonHaze) * transmission;
    } else {
      const cloudPlane = 1 / (dy + 0.12), px = dx * cloudPlane * 2, pz = dz * cloudPlane * 2;
      const mist = cloud(px, pz);
      const cover = Math.max(0, Math.min(0.8, (mist - 0.47) * 3.8));
      const rim = Math.max(0, 1 - Math.abs(mist - 0.54) * 12) * horizon;
      const shades = [75 + rim * 146, 69 + rim * 68, 99 + rim * 28];
      for (let c = 0; c < 3; c++) rgb[c] = mix(rgb[c], shades[c], cover);
      const angular = 1 - (dx * sunDirection.x + dy * sunDirection.y + dz * sunDirection.z);
      const sun = Math.exp(-angular * 2300) * 0.9 + Math.exp(-angular * 38) * 0.12;
      for (let c = 0; c < 3; c++) rgb[c] = mix(rgb[c], [255, 238, 186][c], Math.min(1, sun));
    }
    const i = (x + y * canvas.width) * 4;
    pixels.data[i] = rgb[0]; pixels.data[i + 1] = rgb[1]; pixels.data[i + 2] = rgb[2]; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
