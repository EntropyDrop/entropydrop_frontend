import * as THREE from 'three';
import { createDuskSky } from './brutalistLook';

/** Low valley haze meets the far-field fog instead of exposing a dark crop edge. */
export function createCanyonSky() {
  const texture = createDuskSky(), canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!, horizon = canvas.height * 0.46;
  const haze = ctx.createLinearGradient(0, horizon, 0, canvas.height * 0.6);
  haze.addColorStop(0, 'rgba(108,121,137,0)');
  haze.addColorStop(0.5, 'rgba(108,121,137,0.8)');
  haze.addColorStop(1, 'rgba(108,121,137,1)');
  ctx.fillStyle = haze; ctx.fillRect(0, horizon, canvas.width, canvas.height - horizon);
  texture.needsUpdate = true;
  return texture;
}

/** A single normal material covers stone, industrial metal and the river.
 * Fine grain and dampness are evaluated in world coordinates, without a texture tile. */
export function createCanyonMaterial(wear: number, offsetX: number, offsetZ: number) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.83, metalness: 0.13, envMapIntensity: 0.7 });
  material.onBeforeCompile = shader => {
    shader.uniforms.canyonWear = { value: wear };
    shader.uniforms.canyonOrigin = { value: new THREE.Vector3(offsetX, 0, offsetZ) };
    shader.vertexShader = 'varying vec3 canyonPosition;\nuniform vec3 canyonOrigin;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      vec4 canyonWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        canyonWorld = instanceMatrix * canyonWorld;
      #endif
      canyonPosition = (modelMatrix * canyonWorld).xyz + canyonOrigin;
      #include <project_vertex>
    `);
    shader.fragmentShader = `
      varying vec3 canyonPosition;
      uniform float canyonWear;
      float canyonHash(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.x + p.y) * p.z);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float blueSurface = smoothstep(0.06, 0.12, diffuseColor.b - diffuseColor.r)
        * smoothstep(0.025, 0.055, diffuseColor.b - diffuseColor.g);
      float grain = canyonHash(floor(canyonPosition * 25.0));
      float runoff = canyonHash(floor(canyonPosition * vec3(1.5, 0.06, 1.5)));
      float weather = (grain - 0.5) * 0.11 - smoothstep(0.78, 0.98, runoff) * 0.13;
      diffuseColor.rgb *= 1.0 + weather * canyonWear * (1.0 - blueSurface);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.23, blueSurface);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', `
      #include <metalnessmap_fragment>
      metalnessFactor = mix(metalnessFactor, 0.35, blueSurface);
    `);
  };
  return material;
}
