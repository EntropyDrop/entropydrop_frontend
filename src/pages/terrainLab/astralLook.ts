import * as THREE from 'three';

/** World-space metal wear. The crop offset keeps scratches fixed while exploring. */
export function createFoundryMaterial(wear: number, offsetX: number, offsetZ: number) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.48, envMapIntensity: 0.75 });
  material.onBeforeCompile = shader => {
    shader.uniforms.forgeWear = { value: wear };
    shader.uniforms.forgeOrigin = { value: new THREE.Vector3(offsetX, 0, offsetZ) };
    shader.vertexShader = 'varying vec3 forgePosition;\nuniform vec3 forgeOrigin;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      vec4 forgeWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        forgeWorld = instanceMatrix * forgeWorld;
      #endif
      forgePosition = (modelMatrix * forgeWorld).xyz + forgeOrigin;
      #include <project_vertex>
    `);
    shader.fragmentShader = `
      varying vec3 forgePosition;
      uniform float forgeWear;
      float forgeHash(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.x + p.y) * p.z);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec3 panel = floor(forgePosition * vec3(0.5, 0.25, 0.5));
      float alloy = forgeHash(panel);
      float grain = forgeHash(floor(forgePosition * 45.0));
      float streak = forgeHash(floor(forgePosition * vec3(5.0, 0.07, 5.0)));
      float patina = smoothstep(0.77, 0.94, streak) * forgeWear;
      diffuseColor.rgb *= 0.97 + (alloy - 0.5) * 0.04 + (grain - 0.5) * 0.04 * forgeWear;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.75, 0.64, 0.50), patina * 0.45);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + (alloy - 0.5) * 0.17 + patina * 0.22, 0.32, 0.94);
    `);
  };
  return material;
}

/** Continuous spherical nebula, warm low sun and clustered stars. Cached by the scene. */
export function createAstralSky() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 1024;
  const ctx = canvas.getContext('2d')!, pixels = ctx.createImageData(canvas.width, canvas.height);
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const hash = (x: number, y: number, z: number) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const noise = (x: number, y: number, z: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const dx = x - ix, dy = y - iy, dz = z - iz;
    const u = dx * dx * (3 - 2 * dx), v = dy * dy * (3 - 2 * dy), w = dz * dz * (3 - 2 * dz);
    return mix(mix(mix(hash(ix, iy, iz), hash(ix + 1, iy, iz), u), mix(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), u), v),
      mix(mix(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), u), mix(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), u), v), w);
  };
  for (let y = 0; y < canvas.height; y++) {
    const latitude = (0.5 - y / canvas.height) * Math.PI, sy = Math.sin(latitude), cy = Math.cos(latitude);
    for (let x = 0; x < canvas.width; x++) {
      const longitude = x / canvas.width * Math.PI * 2;
      const sx = Math.cos(longitude) * cy, sz = Math.sin(longitude) * cy;
      const warp = noise(sx * 5 + 17, sy * 5 + 7, sz * 5 - 2);
      let cloud = 0, amp = 0.54;
      for (let k = 0; k < 6; k++) {
        const f = 18 * 2 ** k;
        cloud += noise(sx * f + warp * 5, sy * f + warp * 9 + 13, sz * f + warp * 7) * amp;
        amp *= 0.49;
      }
      const band = Math.exp(-Math.pow((sy + sx * 0.32 - sz * 0.17 - 0.38) / 0.36, 2));
      const wisps = Math.pow(clamp(1 - Math.abs(cloud - 0.56) * 24), 4) * band * clamp((warp - 0.35) * 3);
      const dust = Math.pow(clamp((cloud - 0.27) * 2.5), 1.6) * band;
      const hue = noise(sx * 3 - 5, sy * 3 + 2, sz * 3 + 11);
      const warm = Math.pow(clamp((sx * -0.5 + sz * 0.86 + 1) / 2), 4);
      const horizon = Math.exp(-Math.pow((sy - 0.015) / 0.21, 2));
      const sunDot = sx * -0.497 + sy * 0.115 + sz * 0.86;
      const halo = Math.pow(Math.max(0, sunDot), 70), sun = Math.pow(Math.max(0, sunDot), 3600);
      const below = clamp((sy + 0.2) / 0.25);
      const colors = [
        19 + horizon * (70 + warm * 113) + dust * (hue > 0.52 ? 94 : 28) + wisps * (hue > 0.52 ? 116 : 42) + halo * 95 + sun * 160,
        29 + horizon * (62 + warm * 75) + dust * 65 + wisps * (hue > 0.52 ? 91 : 119) + halo * 80 + sun * 150,
        48 + horizon * (56 + warm * 20) + dust * 116 + wisps * 137 + halo * 52 + sun * 120,
      ];
      const index = (x + y * canvas.width) * 4;
      for (let c = 0; c < 3; c++) pixels.data[index + c] = mix([83, 99, 119][c], colors[c], below);
      pixels.data[index + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  for (let i = 0; i < 1900; i++) {
    const u = hash(i, 0, 70), v = hash(i, 1, 70) * 0.45, brightness = hash(i, 2, 70);
    const x = u * canvas.width, y = v * canvas.height, radius = brightness > 0.992 ? 1.8 : brightness > 0.92 ? 0.9 : 0.4;
    ctx.fillStyle = `rgba(${brightness > 0.7 ? '255,218,166' : '170,220,255'},${0.15 + brightness * 0.65})`;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    if (radius > 1) {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, 7);
      gradient.addColorStop(0, 'rgba(110,220,255,0.6)'); gradient.addColorStop(1, 'rgba(110,150,255,0)');
      ctx.fillStyle = gradient; ctx.fillRect(x - 7, y - 7, 14, 14);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
