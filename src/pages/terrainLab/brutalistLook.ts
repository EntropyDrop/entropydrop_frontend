import * as THREE from 'three';

/** World-space aggregate and runoff: no small repeating texture tile. */
export function createConcreteMaterial(weathering: number) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.94, metalness: 0.035 });
  material.onBeforeCompile = shader => {
    shader.uniforms.concreteWeathering = { value: weathering };
    shader.vertexShader = 'varying vec3 concretePosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      vec4 concreteWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        concreteWorld = instanceMatrix * concreteWorld;
      #endif
      concretePosition = (modelMatrix * concreteWorld).xyz;
      #include <project_vertex>
    `);
    shader.fragmentShader = `
      varying vec3 concretePosition;
      uniform float concreteWeathering;
      float concreteHash(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float concreteNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(concreteHash(i), concreteHash(i + vec3(1,0,0)), f.x),
          mix(concreteHash(i + vec3(0,1,0)), concreteHash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(concreteHash(i + vec3(0,0,1)), concreteHash(i + vec3(1,0,1)), f.x),
          mix(concreteHash(i + vec3(0,1,1)), concreteHash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float grain = concreteNoise(concretePosition * 10.5);
      float runoff = concreteNoise(concretePosition * vec3(1.7, 0.055, 1.7));
      float patches = concreteNoise(concretePosition * 0.27);
      float patina = (grain - 0.5) * 0.2 - smoothstep(0.5, 0.82, runoff) * 0.24 + (patches - 0.5) * 0.19;
      diffuseColor.rgb *= 1.0 + patina * concreteWeathering;
    `);
  };
  return material;
}

/** A seamless cloud panorama, generated once and used only as the atmosphere. */
export function createDuskSky() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(canvas.width, canvas.height);
  const hash = (x: number, y: number) => {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const noise = (x: number, y: number, period: number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = ((ix % period) + period) % period, b = (a + 1) % period;
    return mix(mix(hash(a, iy), hash(b, iy), u), mix(hash(a, iy + 1), hash(b, iy + 1), u), v);
  };
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const u = x / canvas.width, v = y / canvas.height;
    const horizon = Math.exp(-Math.pow((v - 0.5) / 0.055, 2));
    const warm = 0.4 + 0.6 * Math.pow((Math.cos((u - 0.14) * Math.PI * 2) + 1) / 2, 3);
    let cloud = 0, amplitude = 0.55;
    for (let octave = 0; octave < 6; octave++) {
      const frequency = 16 * 2 ** octave;
      cloud += noise(u * frequency + octave * 2, v * frequency * 3 + 19, frequency) * amplitude;
      amplitude *= 0.5;
    }
    const cover = Math.min(0.92, Math.max(0, (cloud - 0.36) * 2.7)) * (v < 0.55 ? 1 : Math.max(0, (0.7 - v) / 0.15));
    const silver = Math.max(0, 1 - Math.abs(cloud - 0.45) * 14) * horizon * warm;
    const sky = [mix(25, 180 * warm + 42, horizon), mix(36, 106 * warm + 36, horizon), mix(58, 89 + 30 * warm, horizon)];
    const storm = [34 + silver * 64, 40 + silver * 41, 53 + silver * 30];
    const i = (x + y * canvas.width) * 4;
    for (let channel = 0; channel < 3; channel++) pixels.data[i + channel] = mix(sky[channel], storm[channel], cover);
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
