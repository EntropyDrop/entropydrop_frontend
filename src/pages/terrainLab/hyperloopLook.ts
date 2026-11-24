import * as THREE from 'three';
import { HYPERLOOP_SUN } from './verdantHyperloop';

/** Single normal PBR material covering reflective glass skyscrapers, brushed chrome
 * transit tubes, lush matte sky-garden foliage and urban stone/asphalt.
 * Surface class is inferred smoothly from voxel RGB in world coordinates. */
export function createHyperloopMaterial(offsetX: number, offsetZ: number) {
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.74,
    metalness: 0.14,
    envMapIntensity: 1.75,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.loopOrigin = { value: new THREE.Vector3(offsetX, 0, offsetZ) };
    shader.vertexShader = 'varying vec3 loopWorldPos;\nuniform vec3 loopOrigin;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      vec4 loopWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        loopWorld = instanceMatrix * loopWorld;
      #endif
      loopWorldPos = (modelMatrix * loopWorld).xyz + loopOrigin;
      #include <project_vertex>
      `,
    );
    shader.fragmentShader =
      `
      varying vec3 loopWorldPos;
      float loopHash(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      float loopMaxC = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
      float loopMinC = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
      float loopSat = loopMaxC - loopMinC;
      float loopGlass = smoothstep(0.03, 0.11, diffuseColor.b - diffuseColor.r)
        * smoothstep(0.01, 0.07, diffuseColor.b - diffuseColor.g);
      float loopFoliage = smoothstep(0.03, 0.10, diffuseColor.g - diffuseColor.r)
        * smoothstep(0.02, 0.09, diffuseColor.g - diffuseColor.b);
      float loopChrome = smoothstep(0.56, 0.78, loopMinC) * (1.0 - smoothstep(0.05, 0.16, loopSat));
      float loopGrain = loopHash(floor(loopWorldPos * 18.0));
      float loopPanel = loopHash(floor(loopWorldPos * vec3(0.5, 0.25, 0.5)));
      float loopLeaf = loopHash(floor(loopWorldPos * 6.0));
      // Subtle curtain-wall panel tint on glass, rich dappled organic foliage, crisp concrete grain.
      diffuseColor.rgb *= 1.0
        + (loopPanel - 0.5) * 0.08 * loopGlass
        + (loopLeaf - 0.5) * 0.16 * loopFoliage
        + (loopGrain - 0.5) * 0.05 * (1.0 - loopGlass - loopFoliage);
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.14, loopGlass);
      roughnessFactor = mix(roughnessFactor, 0.22, loopChrome);
      roughnessFactor = mix(roughnessFactor, 0.92, loopFoliage);
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <metalnessmap_fragment>',
      `
      #include <metalnessmap_fragment>
      metalnessFactor = mix(metalnessFactor, 0.46, loopGlass);
      metalnessFactor = mix(metalnessFactor, 0.64, loopChrome);
      metalnessFactor = mix(metalnessFactor, 0.02, loopFoliage);
      `,
    );
  };
  return material;
}

/** Seamless golden-hour sunset & twilight equirectangular panorama:
 * radiant warm apricot-gold horizon behind the skyline, coral-rose mid-sky,
 * deep indigo-violet twilight zenith and backlit dusk clouds. */
export function createHyperloopSky() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(canvas.width, canvas.height);

  const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const hash = (x: number, z: number) => {
    let h = Math.imul(x ^ 4729183, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 16) ^ z, 0xc2b2ae35);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };
  const noise = (x: number, z: number) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const dx = x - ix;
    const dz = z - iz;
    const u = dx * dx * (3 - 2 * dx);
    const v = dz * dz * (3 - 2 * dz);
    return mix(mix(hash(ix, iz), hash(ix + 1, iz), u), mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
  };

  const sunLen = Math.hypot(HYPERLOOP_SUN.x, HYPERLOOP_SUN.y, HYPERLOOP_SUN.z) || 1;
  const sx = HYPERLOOP_SUN.x / sunLen;
  const sy = HYPERLOOP_SUN.y / sunLen;
  const sz = HYPERLOOP_SUN.z / sunLen;

  for (let y = 0; y < canvas.height; y++) {
    const theta = (y / canvas.height) * Math.PI;
    const dy = Math.cos(theta);
    const sinT = Math.sin(theta);
    for (let x = 0; x < canvas.width; x++) {
      const phi = (x / canvas.width) * Math.PI * 2;
      const dx = sinT * Math.cos(phi);
      const dz = sinT * Math.sin(phi);

      const sunDot = dx * sx + dy * sy + dz * sz;
      const warmAz = Math.pow(clamp((dx * sx + dz * sz + 1) * 0.5), 1.55);
      const horizon = Math.exp(-Math.pow(Math.max(0, dy) / 0.25, 1.3));
      const midBand = Math.exp(-Math.pow((dy - 0.19) / 0.22, 2));

      // Deep twilight indigo zenith -> dusty coral-rose mid-sky -> glowing golden-orange horizon.
      const zenith = [24, 34, 78];
      const rose = [160 + warmAz * 62, 82 + warmAz * 36, 118 + warmAz * 10];
      const glow = [218 + warmAz * 37, 118 + warmAz * 72, 84 + warmAz * 38];
      const rgb = [
        mix(mix(zenith[0], rose[0], midBand * 0.76), glow[0], horizon),
        mix(mix(zenith[1], rose[1], midBand * 0.76), glow[1], horizon),
        mix(mix(zenith[2], rose[2], midBand * 0.76), glow[2], horizon),
      ];

      if (dy > -0.04) {
        const scale = 2.5 / (Math.max(0, dy) + 0.14);
        const px = dx * scale;
        const pz = dz * scale;
        let cloud = 0;
        let amp = 0.54;
        for (let k = 0; k < 5; k++) {
          const f = 2.04 ** k;
          cloud += noise(px * f + k * 19.3, pz * f - k * 11.7) * amp;
          amp *= 0.49;
        }
        const cover = clamp((cloud - 0.42) * 3.0) * clamp((dy + 0.02) / 0.12) * 0.82;
        const rim = clamp(1 - Math.abs(cloud - 0.46) * 14) * (0.38 + warmAz * 0.62);
        const cloudCol = [
          54 + warmAz * 62 + rim * 150,
          46 + warmAz * 38 + rim * 96,
          80 + warmAz * 16 + rim * 38,
        ];
        for (let c = 0; c < 3; c++) rgb[c] = mix(rgb[c], cloudCol[c], cover);

        const halo = Math.pow(Math.max(0, sunDot), 9) * 0.46;
        const core = Math.pow(Math.max(0, sunDot), 240) * 0.85;
        const disc = Math.exp(-(1 - Math.min(1, sunDot)) * 2000) * 0.9;
        rgb[0] = clamp(rgb[0] + halo * 124 + core * 110 + disc * 115, 0, 255);
        rgb[1] = clamp(rgb[1] + halo * 76 + core * 92 + disc * 100, 0, 255);
        rgb[2] = clamp(rgb[2] + halo * 24 + core * 44 + disc * 65, 0, 255);
      }

      // Below-horizon twilight atmospheric city haze seamlessly meeting scene FogExp2.
      const lowerHaze = clamp((-dy + 0.04) * 7.5);
      const hazeCol = [76 + warmAz * 26, 62 + warmAz * 16, 94];
      const idx = (x + y * canvas.width) * 4;
      for (let c = 0; c < 3; c++) {
        pixels.data[idx + c] = Math.round(clamp(mix(rgb[c], hazeCol[c], lowerHaze), 0, 255));
      }
      pixels.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
