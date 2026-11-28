import * as THREE from 'three';

/** Direction *towards* the crisp daytime sun (shared by sky panorama, key light and cameras). */
export const AEROGLASS_SUN = { x: -0.68, y: 0.36, z: -0.64 };

/** Daytime architectural PBR material for normal (opaque, materialId = 0) voxels.
 * Infers lush foliage, brushed titanium/silver metal, satin architectural concrete,
 * and stratified limestone cliffs smoothly from voxel RGB in world coordinates. */
export function createAeroglassNormalMaterial(offsetX: number, offsetZ: number) {
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.74,
    metalness: 0.08,
    envMapIntensity: 0.92,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.agOrigin = { value: new THREE.Vector3(offsetX, 0, offsetZ) };
    shader.vertexShader =
      'varying vec3 agWorldPos;\nvarying vec3 agWorldNormal;\nuniform vec3 agOrigin;\n' +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      vec4 agWorld = vec4(transformed, 1.0);
      vec3 agN = objectNormal;
      #ifdef USE_INSTANCING
        agWorld = instanceMatrix * agWorld;
        agN = mat3(instanceMatrix) * agN;
      #endif
      agWorldPos = (modelMatrix * agWorld).xyz + agOrigin;
      agWorldNormal = normalize(mat3(modelMatrix) * agN);
      #include <project_vertex>
      `,
    );
    shader.fragmentShader =
      `
      varying vec3 agWorldPos;
      varying vec3 agWorldNormal;
      float agHash(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      float agMax = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
      float agMin = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
      float agSat = agMax - agMin;
      float agFoliage = smoothstep(0.015, 0.075, diffuseColor.g - diffuseColor.r)
        * smoothstep(0.01, 0.06, diffuseColor.g - diffuseColor.b);
      float agWhite = smoothstep(0.50, 0.72, agMin) * (1.0 - smoothstep(0.05, 0.14, agSat));
      float agMetal = smoothstep(0.14, 0.36, agMin) * (1.0 - smoothstep(0.06, 0.15, agSat))
        * smoothstep(-0.005, 0.03, diffuseColor.b - diffuseColor.r) * (1.0 - agWhite) * (1.0 - agFoliage);
      float agGlassOpaque = smoothstep(0.04, 0.12, diffuseColor.b - diffuseColor.r) * (1.0 - agFoliage);

      float agLeaf = agHash(floor(agWorldPos * 3.8));
      float agGrain = agHash(floor(agWorldPos * 14.0));
      float agStrata = agHash(floor(agWorldPos * vec3(0.35, 1.6, 0.35)));
      float agPanel = agHash(floor(agWorldPos * vec3(0.5, 0.25, 0.5)));

      float agRock = (1.0 - agFoliage) * (1.0 - agWhite) * (1.0 - agMetal) * (1.0 - agGlassOpaque);
      diffuseColor.rgb *= 1.0
        + (agLeaf - 0.5) * 0.24 * agFoliage
        + (agGrain - 0.5) * 0.045 * agWhite
        + (agPanel - 0.5) * 0.08 * (agMetal + agGlassOpaque)
        + ((agStrata - 0.5) * 0.18 + (agGrain - 0.5) * 0.09) * agRock;
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.94, agFoliage);
      roughnessFactor = mix(roughnessFactor, 0.52, agWhite);
      roughnessFactor = mix(roughnessFactor, 0.26, agMetal);
      roughnessFactor = mix(roughnessFactor, 0.16, agGlassOpaque);
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <metalnessmap_fragment>',
      `
      #include <metalnessmap_fragment>
      metalnessFactor = mix(metalnessFactor, 0.0, agFoliage);
      metalnessFactor = mix(metalnessFactor, 0.05, agWhite);
      metalnessFactor = mix(metalnessFactor, 0.68, agMetal);
      metalnessFactor = mix(metalnessFactor, 0.40, agGlassOpaque);
      `,
    );
  };
  return material;
}

/** Space-compatible translucent glass material (materialId = 2..101, transparency = 1..100%).
 * Reads per-vertex opacity from attribute `aOpacity` (= (100 - transparency) / 100) and
 * adds crisp daytime Fresnel sky reflections without washing out interior details. */
export function createAeroglassTranslucentMaterial(offsetX: number, offsetZ: number) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.08,
    metalness: 0.14,
    envMapIntensity: 1.55,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  material.userData.voxelTranslucent = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.agGlassOrigin = { value: new THREE.Vector3(offsetX, 0, offsetZ) };
    shader.vertexShader =
      'attribute float aOpacity;\nvarying float vGlassOpacity;\nvarying vec3 vGlassWorldPos;\nuniform vec3 agGlassOrigin;\n' +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      vGlassOpacity = aOpacity;
      vec4 agGlassW = vec4(transformed, 1.0);
      vGlassWorldPos = (modelMatrix * agGlassW).xyz + agGlassOrigin;
      #include <project_vertex>
      `,
    );
    shader.fragmentShader =
      `
      varying float vGlassOpacity;
      varying vec3 vGlassWorldPos;
      ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      diffuseColor.a *= vGlassOpacity;
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `
      vec3 glassViewDir = normalize(vViewPosition);
      float glassNdotV = clamp(abs(dot(normal, glassViewDir)), 0.0, 1.0);
      float glassFresnel = pow(1.0 - glassNdotV, 3.0);
      float glassVisible = step(0.005, vGlassOpacity);
      // Subtle cool-sky rim reflection on curved glass tubes and biodomes, clamped below bloom threshold.
      outgoingLight += vec3(0.45, 0.68, 0.90) * glassFresnel * 0.24 * glassVisible;
      diffuseColor.a = clamp(diffuseColor.a + glassFresnel * 0.26 * glassVisible, 0.0, 0.88);
      #include <opaque_fragment>
      `,
    );
  };
  return material;
}

/** Space-compatible 1..100% emissive material (materialId = 102..201).
 * Uses HDR instance colors scaled by emission / 50 (0.02..2.0) so billboards,
 * warm pod cabins and beacons shine vividly in bright daylight. */
export function createAeroglassEmissiveMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveIntensity: 1,
    toneMapped: false,
  });
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `
      #include <emissivemap_fragment>
      #ifdef USE_COLOR
        totalEmissiveRadiance *= vColor.rgb;
      #endif
      `,
    );
  };
  return material;
}

/** Crisp sunlit daytime azure sky panorama with defined sunlit white cumulus clouds,
 * warm golden solar glow and light airy azure horizon mist matching FogExp2. */
export function createAeroglassSky() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(canvas.width, canvas.height);

  const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const smoothstep = (a: number, b: number, v: number) => {
    const t = clamp((v - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
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

  const sl = Math.hypot(AEROGLASS_SUN.x, AEROGLASS_SUN.y, AEROGLASS_SUN.z) || 1;
  const sx = AEROGLASS_SUN.x / sl, sy = AEROGLASS_SUN.y / sl, sz = AEROGLASS_SUN.z / sl;
  const hl = Math.hypot(sx, sz) || 1, shx = sx / hl, shz = sz / hl;

  for (let py = 0; py < canvas.height; py++) {
    const elev = (0.5 - (py + 0.5) / canvas.height) * Math.PI;
    const dy = Math.sin(elev), ch = Math.cos(elev);
    for (let px = 0; px < canvas.width; px++) {
      const phi = ((px + 0.5) / canvas.width - 0.5) * Math.PI * 2;
      const dx = ch * Math.cos(phi), dz = ch * Math.sin(phi);
      const az = clamp((dx * shx + dz * shz + 1) * 0.5);
      const warm = az ** 2.0;
      const sunDot = dx * sx + dy * sy + dz * sz;
      const up = Math.max(0, dy);

      // Rich vibrant azure blue descending close to horizon + crisp warm sunlit horizon band.
      const zen = smoothstep(0.02, 0.48, up);
      const horizon = Math.exp(-up / (0.06 + warm * 0.04));
      let r = mix(142 + warm * 38, 44, zen);
      let g = mix(196 + warm * 18, 126, zen);
      let b = mix(238 + warm * 4, 214, zen);
      r = mix(r, 228 + warm * 24, horizon * 0.72);
      g = mix(g, 236 + warm * 14, horizon * 0.72);
      b = mix(b, 244 - warm * 10, horizon * 0.72);

      if (dy > -0.03) {
        // Defined sunlit cumulus banks floating above the skyline ridge.
        const scale = 2.4 / (up + 0.13);
        const cx = dx * scale, cz = dz * scale;
        let n = 0, amp = 0.54;
        for (let k = 0; k < 5; k++) {
          const f = 2.06 ** k;
          n += noise(cx * f * 0.62 + k * 17.1, cz * f * 0.62 - k * 11.3) * amp;
          amp *= 0.5;
        }
        const billow = noise(cx * 0.4 + 12, cz * 0.4 - 7) * 0.5 + n * 0.58;
        const lowBand = clamp((up + 0.02) / 0.08) * (1 - smoothstep(0.22, 0.62, up) * 0.8);
        const cover = clamp((billow - 0.51) * 3.4) * lowBand * 0.9;
        const crest = clamp((billow - 0.54) * 4.0 + warm * 0.45);
        const cr = mix(184 + warm * 26, 255, crest);
        const cg = mix(198 + warm * 20, 252, crest);
        const cb = mix(218 + warm * 6, 246, crest);
        r = mix(r, cr, cover);
        g = mix(g, cg, cover);
        b = mix(b, cb, cover);

        const halo = Math.max(0, sunDot) ** 12 * 0.32;
        const core = Math.max(0, sunDot) ** 180 * 0.7;
        const disc = Math.exp(-(1 - Math.min(1, sunDot)) * 1800) * 0.9;
        r += halo * 72 + core * 105 + disc * 140;
        g += halo * 64 + core * 96 + disc * 134;
        b += halo * 38 + core * 72 + disc * 115;
      }

      // Soft airy pale-blue distant haze below horizon matching FogExp2 (0xc8dff0).
      const haze = clamp((-dy + 0.01) * 7.5);
      r = mix(r, 200 + warm * 14, haze);
      g = mix(g, 223 + warm * 8, haze);
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
