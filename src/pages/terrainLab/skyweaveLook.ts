import * as THREE from 'three';
import { SKYWEAVE_SUN } from './skyweaveInterchange';

/** Daytime PBR material for normal (opaque, materialId = 0) Skyweave voxels.
 * Infers foliage, rough asphalt, painted lane lines, satin concrete, brushed titanium and
 * stratified limestone from the voxel's linear RGB, with world-space micro variation. */
export function createSkyweaveNormalMaterial(offsetX: number, offsetZ: number) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.74, metalness: 0.06, envMapIntensity: 0.9 });
  material.onBeforeCompile = shader => {
    shader.uniforms.swOrigin = { value: new THREE.Vector3(offsetX, 0, offsetZ) };
    shader.vertexShader =
      'varying vec3 swWorldPos;\nuniform vec3 swOrigin;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      vec4 swWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        swWorld = instanceMatrix * swWorld;
      #endif
      swWorldPos = (modelMatrix * swWorld).xyz + swOrigin;
      #include <project_vertex>
      `,
    );
    shader.fragmentShader =
      `
      varying vec3 swWorldPos;
      float swHash(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      float swMax = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
      float swMin = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
      float swSat = swMax - swMin;
      float swFoliage = smoothstep(0.015, 0.075, diffuseColor.g - diffuseColor.r)
        * smoothstep(0.01, 0.06, diffuseColor.g - diffuseColor.b);
      float swAsphalt = (1.0 - smoothstep(0.05, 0.1, swMax)) * (1.0 - smoothstep(0.012, 0.03, swSat));
      float swWhite = smoothstep(0.5, 0.7, swMin) * (1.0 - smoothstep(0.05, 0.13, swSat));
      float swMetal = smoothstep(0.3, 0.42, swMin) * (1.0 - smoothstep(0.14, 0.22, swSat))
        * smoothstep(0.09, 0.13, diffuseColor.b - diffuseColor.r) * (1.0 - swWhite) * (1.0 - swFoliage);
      float swGlass = smoothstep(0.06, 0.14, diffuseColor.b - diffuseColor.r) * (1.0 - smoothstep(0.25, 0.4, swMin)) * (1.0 - swFoliage);
      float swLeaf = swHash(floor(swWorldPos * 3.8));
      float swGrain = swHash(floor(swWorldPos * 14.0));
      float swStrata = swHash(floor(swWorldPos * vec3(0.35, 1.6, 0.35)));
      float swPanel = swHash(floor(swWorldPos * vec3(0.5, 0.25, 0.5)));
      float swPatch = swHash(floor(swWorldPos * vec3(0.18, 1.0, 0.18)));
      float swRock = (1.0 - swFoliage) * (1.0 - swWhite) * (1.0 - swMetal) * (1.0 - swGlass) * (1.0 - swAsphalt);
      diffuseColor.rgb *= 1.0
        + (swLeaf - 0.5) * 0.24 * swFoliage
        + ((swGrain - 0.5) * 0.12 + (swPatch - 0.5) * 0.1) * swAsphalt
        + (swGrain - 0.5) * 0.04 * swWhite
        + (swPanel - 0.5) * 0.08 * (swMetal + swGlass)
        + ((swStrata - 0.5) * 0.16 + (swGrain - 0.5) * 0.08) * swRock;
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.94, swFoliage);
      roughnessFactor = mix(roughnessFactor, 0.9, swAsphalt);
      roughnessFactor = mix(roughnessFactor, 0.5, swWhite);
      roughnessFactor = mix(roughnessFactor, 0.26, swMetal);
      roughnessFactor = mix(roughnessFactor, 0.16, swGlass);
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <metalnessmap_fragment>',
      `
      #include <metalnessmap_fragment>
      metalnessFactor = mix(metalnessFactor, 0.0, swFoliage + swAsphalt);
      metalnessFactor = mix(metalnessFactor, 0.05, swWhite);
      metalnessFactor = mix(metalnessFactor, 0.66, swMetal);
      metalnessFactor = mix(metalnessFactor, 0.4, swGlass);
      `,
    );
  };
  return material;
}

/** Bright morning azure sky with cumulus banks and a warm sun matching SKYWEAVE_SUN. */
export function createSkyweaveSky() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(canvas.width, canvas.height);
  const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const smoothstep = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const hash = (x: number, z: number) => {
    let h = Math.imul(x ^ 0x45d9f3b, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 15) ^ z, 0xc2b2ae35);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };
  const noise = (x: number, z: number) => {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    return mix(mix(hash(ix, iz), hash(ix + 1, iz), u), mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
  };
  const sl = Math.hypot(SKYWEAVE_SUN.x, SKYWEAVE_SUN.y, SKYWEAVE_SUN.z) || 1;
  const sx = SKYWEAVE_SUN.x / sl, sy = SKYWEAVE_SUN.y / sl, sz = SKYWEAVE_SUN.z / sl;
  const hl = Math.hypot(sx, sz) || 1, shx = sx / hl, shz = sz / hl;
  for (let py = 0; py < canvas.height; py++) {
    const elev = (0.5 - (py + 0.5) / canvas.height) * Math.PI;
    const dy = Math.sin(elev), ch = Math.cos(elev);
    for (let px = 0; px < canvas.width; px++) {
      const phi = ((px + 0.5) / canvas.width - 0.5) * Math.PI * 2;
      const dx = ch * Math.cos(phi), dz = ch * Math.sin(phi);
      const warm = clamp((dx * shx + dz * shz + 1) * 0.5) ** 2;
      const sunDot = dx * sx + dy * sy + dz * sz;
      const up = Math.max(0, dy);
      const zen = smoothstep(0.02, 0.5, up);
      const horizon = Math.exp(-up / (0.06 + warm * 0.04));
      let r = mix(150 + warm * 34, 52, zen);
      let g = mix(200 + warm * 16, 134, zen);
      let b = mix(240, 220, zen);
      r = mix(r, 230 + warm * 22, horizon * 0.7);
      g = mix(g, 238 + warm * 12, horizon * 0.7);
      b = mix(b, 246 - warm * 8, horizon * 0.7);
      if (dy > -0.03) {
        const scale = 2.4 / (up + 0.13);
        const cx = dx * scale, cz = dz * scale;
        let n = 0, amp = 0.54;
        for (let k = 0; k < 5; k++) {
          const f = 2.06 ** k;
          n += noise(cx * f * 0.62 + k * 17.1, cz * f * 0.62 - k * 11.3) * amp;
          amp *= 0.5;
        }
        const billow = noise(cx * 0.4 + 12, cz * 0.4 - 7) * 0.5 + n * 0.58;
        const band = clamp((up + 0.02) / 0.08) * (1 - smoothstep(0.24, 0.66, up) * 0.8);
        const cover = clamp((billow - 0.52) * 3.4) * band * 0.88;
        const crest = clamp((billow - 0.55) * 4 + warm * 0.45);
        r = mix(r, mix(186 + warm * 24, 255, crest), cover);
        g = mix(g, mix(200 + warm * 18, 252, crest), cover);
        b = mix(b, mix(220 + warm * 6, 247, crest), cover);
        const halo = Math.max(0, sunDot) ** 12 * 0.3;
        const core = Math.max(0, sunDot) ** 180 * 0.7;
        const disc = Math.exp(-(1 - Math.min(1, sunDot)) * 1800) * 0.9;
        r += halo * 70 + core * 105 + disc * 140;
        g += halo * 62 + core * 96 + disc * 134;
        b += halo * 36 + core * 72 + disc * 115;
      }
      const haze = clamp((-dy + 0.01) * 7.5);
      r = mix(r, 202 + warm * 12, haze);
      g = mix(g, 224 + warm * 6, haze);
      b = mix(b, 240, haze);
      const i = (px + py * canvas.width) * 4;
      img.data[i] = Math.round(clamp(r, 0, 255));
      img.data[i + 1] = Math.round(clamp(g, 0, 255));
      img.data[i + 2] = Math.round(clamp(b, 0, 255));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
