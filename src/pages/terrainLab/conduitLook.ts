import * as THREE from 'three';
import { CONDUIT_SUN } from './sunsetConduit';

/** One normal PBR material for the Sunset Conduit city. Surface classes are read
 * from each cube's RGB: blue-dominant glass becomes a mirror-smooth curtain wall
 * with 1m mullions, cool neutrals become polished chrome, green stays matte
 * foliage, and warm whites / asphalt keep a satin or rough finish. */
export function createConduitMaterial(offsetX: number, offsetZ: number) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.06, envMapIntensity: 1.6 });
  material.onBeforeCompile = shader => {
    shader.uniforms.conduitOrigin = { value: new THREE.Vector3(offsetX, 0, offsetZ) };
    shader.vertexShader = 'varying vec3 conduitPos;\nvarying vec3 conduitNormal;\nuniform vec3 conduitOrigin;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      vec4 conduitWorld = vec4(transformed, 1.0);
      vec3 conduitN = objectNormal;
      #ifdef USE_INSTANCING
        conduitWorld = instanceMatrix * conduitWorld;
        conduitN = mat3(instanceMatrix) * conduitN;
      #endif
      conduitPos = (modelMatrix * conduitWorld).xyz + conduitOrigin;
      conduitNormal = normalize(mat3(modelMatrix) * conduitN);
      #include <project_vertex>
      `,
    );
    shader.fragmentShader = `
      varying vec3 conduitPos;
      varying vec3 conduitNormal;
      float conduitHash(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      float cMax = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
      float cMin = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
      float cSat = cMax - cMin;
      float cFoliage = smoothstep(0.02, 0.08, diffuseColor.g - diffuseColor.r) * smoothstep(0.01, 0.06, diffuseColor.g - diffuseColor.b);
      float cGlass = smoothstep(0.03, 0.09, diffuseColor.b - diffuseColor.r) * (1.0 - cFoliage);
      float cChrome = smoothstep(0.42, 0.62, cMin) * (1.0 - smoothstep(0.08, 0.16, cSat)) * step(diffuseColor.r - 0.005, diffuseColor.b) * (1.0 - cGlass);
      vec3 cN = normalize(conduitNormal);
      // Curtain-wall mullions: thin bright frames at every 1m cube seam, floor lines every 2m.
      float cSide = 1.0 - step(0.5, abs(cN.y));
      float cU = abs(cN.x) > 0.5 ? conduitPos.z : conduitPos.x;
      float cEdgeU = min(fract(cU), 1.0 - fract(cU));
      float cEdgeV = min(fract(conduitPos.y * 0.5), 1.0 - fract(conduitPos.y * 0.5));
      float cMullion = cSide * max(1.0 - smoothstep(0.025, 0.06, cEdgeU), 1.0 - smoothstep(0.012, 0.03, cEdgeV));
      float cPanel = conduitHash(floor(conduitPos * vec3(1.0, 0.5, 1.0)) + 0.37);
      float cGrain = conduitHash(floor(conduitPos * 16.0));
      float cLeaf = conduitHash(floor(conduitPos * 5.0));
      diffuseColor.rgb *= 1.0 + (cPanel - 0.5) * 0.12 * cGlass + (cLeaf - 0.5) * 0.24 * cFoliage
        + (cGrain - 0.5) * 0.06 * (1.0 - cGlass - cFoliage);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.66, 0.71), cMullion * cGlass * 0.55);
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_maps>',
      `
      #include <lights_fragment_maps>
      // Keep the sunset sky as a reflection, but damp its diffuse wash so shaded
      // façades stay deep twilight blue instead of turning uniformly lilac.
      iblIrradiance *= mix(0.42, 0.7, cFoliage);
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.07 + cPanel * 0.05, cGlass);
      roughnessFactor = mix(roughnessFactor, 0.16, cChrome);
      roughnessFactor = mix(roughnessFactor, 0.94, cFoliage);
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <metalnessmap_fragment>',
      `
      #include <metalnessmap_fragment>
      metalnessFactor = mix(metalnessFactor, 0.42, cGlass);
      metalnessFactor = mix(metalnessFactor, 0.85, cChrome);
      metalnessFactor = mix(metalnessFactor, 0.0, cFoliage);
      `,
    );
  };
  return material;
}

/** Equirectangular sunset panorama (Three.js equirect convention): molten
 * apricot horizon around the setting sun, rose-magenta mid sky, indigo zenith,
 * long stratus streaks lit from below and a violet city haze under the horizon. */
export function createConduitSky() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(canvas.width, canvas.height);
  const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const hash = (x: number, z: number) => {
    let h = Math.imul(x ^ 0x5bd1e995, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 15) ^ z, 0xc2b2ae35);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };
  const noise = (x: number, z: number) => {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    return mix(mix(hash(ix, iz), hash(ix + 1, iz), u), mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
  };
  const sl = Math.hypot(CONDUIT_SUN.x, CONDUIT_SUN.y, CONDUIT_SUN.z);
  const sun = { x: CONDUIT_SUN.x / sl, y: CONDUIT_SUN.y / sl, z: CONDUIT_SUN.z / sl };
  const hl = Math.hypot(sun.x, sun.z), shx = sun.x / hl, shz = sun.z / hl;

  for (let py = 0; py < canvas.height; py++) {
    const elev = (0.5 - (py + 0.5) / canvas.height) * Math.PI, dy = Math.sin(elev), ch = Math.cos(elev);
    for (let px = 0; px < canvas.width; px++) {
      const phi = ((px + 0.5) / canvas.width - 0.5) * Math.PI * 2;
      const dx = ch * Math.cos(phi), dz = ch * Math.sin(phi);
      const az = clamp((dx * shx + dz * shz + 1) / 2), warm = az ** 2.2, sunDot = dx * sun.x + dy * sun.y + dz * sun.z;
      const up = Math.max(0, dy);
      // Vertical gradient: horizon glow -> rose band -> violet -> indigo zenith.
      const horizon = Math.exp(-up / (0.07 + warm * 0.08));
      const rose = Math.exp(-(((up - 0.16) / 0.17) ** 2));
      const zen = smoothstep(0.18, 0.85, up);
      let r = mix(mix(84, 150, warm), 20, zen), g = mix(mix(90, 98, warm), 36, zen), b = mix(mix(142, 128, warm), 92, zen);
      r = mix(r, 214 + warm * 36, rose * (0.12 + warm * 0.78)); g = mix(g, 112 + warm * 34, rose * (0.12 + warm * 0.78)); b = mix(b, 128 - warm * 36, rose * (0.12 + warm * 0.78));
      r = mix(r, 255, horizon * (0.55 + warm * 0.45)); g = mix(g, 146 + warm * 60, horizon * (0.55 + warm * 0.45)); b = mix(b, 112 - warm * 40, horizon * (0.55 + warm * 0.45));
      if (dy > -0.02) {
        // Long stratus streaks: stretched along the horizon, lit warm from beneath.
        const scale = 1.8 / (up + 0.1);
        const cx = dx * scale, cz = dz * scale;
        let n = 0, amp = 0.55;
        for (let k = 0; k < 5; k++) { const f = 2 ** k; n += noise(cx * f * 0.55 + k * 13.1, cz * f * 0.55 - k * 7.7) * amp; amp *= 0.5; }
        const streak = noise(cx * 0.35 + 40, cz * 2.6 - 11) * 0.6 + n * 0.55;
        const cover = clamp((streak - 0.5) * 3.2) * clamp((up + 0.02) / 0.06) * (1 - zen * 0.6) * 0.85;
        const lit = 0.35 + warm * 0.65;
        r = mix(r, mix(70, 255, lit) * (0.75 + horizon * 0.25), cover);
        g = mix(g, mix(52, 128, lit), cover);
        b = mix(b, mix(92, 96, lit), cover);
        const halo = Math.max(0, sunDot) ** 12 * 0.55, core = Math.max(0, sunDot) ** 300, disc = sunDot > 0.9994 ? 1 : 0;
        r += halo * 110 + core * 120 + disc * 255; g += halo * 70 + core * 110 + disc * 240; b += halo * 20 + core * 60 + disc * 200;
      }
      const haze = clamp((-dy + 0.01) * 9);
      r = mix(r, 92 + warm * 40, haze); g = mix(g, 68 + warm * 18, haze); b = mix(b, 98, haze);
      const i = (px + py * canvas.width) * 4;
      img.data[i] = clamp(r, 0, 255); img.data[i + 1] = clamp(g, 0, 255); img.data[i + 2] = clamp(b, 0, 255); img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function smoothstep(a: number, b: number, v: number) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
