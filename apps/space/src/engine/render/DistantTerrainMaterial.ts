import * as THREE from 'three';

/**
 * Distant torus terrain: baked-albedo LOD shell.
 *
 * Performance model (远处低像素 / 极远处贴图):
 *  - The whole-ring shell is one pre-bent mesh; its surface detail is baked ONCE
 *    as a seamless 1024×256 sRGB albedo texture (exactly 1 MiB RGBA) instead of
 *    being re-derived per pixel, per frame. A shared immutable build artifact
 *    supplies it for the default world; local baking is the safe fallback. The GPU mip chain gives
 *    automatic "lower pixel resolution with distance" for free.
 *  - Per pixel the fragment shader only does: distance discard, a blend toward
 *    the exact chunk surface color in the near band (so the shell reads as the
 *    same planet as the rendered voxel blocks), one cheap 4 m grid line
 *    (fwidth-antialiased, fades out with distance), aerial perspective for the
 *    far ring, and a silhouette rim glow.
 *  - Player edits override the baked albedo through the terrainEditMask vertex
 *    attribute exactly as before.
 */

const TAU = Math.PI * 2;

// Standard sRGB -> linear transfer (inverse of the sRGB encoding). The chunk
// blocks store their colors as linear vertex colors (THREE setHex), so the
// baked shell albedo must be linearized the same way for the near band to
// match the rendered voxel surface exactly.
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function toLinear(rgb: [number, number, number]): [number, number, number] {
  return [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
}

// sRGB block palette (hex / 255), linearized once for the bake.
const DRY_GRASS = toLinear([0.395, 0.510, 0.335]);
const LUSH_GRASS = toLinear([0.4431, 0.5608, 0.3804]); // 0x718f61 terrain surface block.
const SOIL = toLinear([0.5020, 0.4200, 0.3608]);       // 0x806b5c middle block.
const ROCK = toLinear([0.4000, 0.4392, 0.4902]);       // 0x66707d deep rock block.

function fract(v: number): number {
  return v - Math.floor(v);
}

/** GLSL `terrainWave`: periodic at both closed torus directions (integer freq). */
function terrainWave(uvX: number, uvY: number, freqX: number, freqY: number, phase: number): number {
  return Math.sin(TAU * (uvX * freqX + uvY * freqY) + phase) * 0.5 + 0.5;
}

/** GLSL `terrainBlockHash` port (deterministic per world cell). */
function terrainBlockHashJS(cellX: number, cellY: number, cellSize: number): number {
  let px = (cellX + cellSize * 0.071) * 0.1031;
  let py = (cellY + cellSize * 0.113) * 0.1030;
  px = fract(px);
  py = fract(py);
  const d = px * py + py * px + 33.33;
  px += d;
  py += d;
  return fract((px + py) * px);
}

function smoothstepJS(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mixJS(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Pure albedo field for one (uvX, uvY) of the distant shell, given the local
 * terrain height and toroidal distance to the spawn pad. Mirrors the original
 * in-shader procedural stack: macro/medium waves, soil/rock masks from real
 * elevation, a per-texel hash, gentle posterization and spawn clearing.
 * Integer wave frequencies + mod-ed cell indices make the field exactly
 * periodic at U/V = 0/1, so the baked texture is seamless around both closed
 * directions of the torus.
 */
export function distantTerrainAlbedoAt(
  uvX: number,
  uvY: number,
  height: number,
  spawnDistance: number,
  blockCellsX: number,
  blockCellsY: number
): [number, number, number] {
  // Macro / medium waves.
  const macro = Math.min(1, Math.max(0,
    terrainWave(uvX, uvY, 13, 2, 0.7) * 0.45
    + terrainWave(uvX, uvY, 29, -4, 2.1) * 0.32
    + terrainWave(uvX, uvY, 47, 6, 4.3) * 0.23
  ));
  const medium = Math.min(1, Math.max(0,
    terrainWave(uvX, uvY, 83, 11, 1.4) * 0.58
    + terrainWave(uvX, uvY, 137, -17, 3.2) * 0.42
  ));

  // Elevation-driven masks from the real terrain height.
  const elevation = smoothstepJS(16.0, 20.5, height);
  const soilMask = smoothstepJS(0.46, 0.78, (1 - macro) * 0.68 + medium * 0.32);
  const rockMask = smoothstepJS(0.58, 0.88, elevation * 0.62 + Math.abs(medium - 0.5) * 0.92);

  let r = mixJS(LUSH_GRASS[0], DRY_GRASS[0], macro * 0.45);
  let g = mixJS(LUSH_GRASS[1], DRY_GRASS[1], macro * 0.45);
  let b = mixJS(LUSH_GRASS[2], DRY_GRASS[2], macro * 0.45);
  r = mixJS(r, SOIL[0], soilMask * 0.55);
  g = mixJS(g, SOIL[1], soilMask * 0.55);
  b = mixJS(b, SOIL[2], soilMask * 0.55);
  r = mixJS(r, ROCK[0], rockMask * 0.70);
  g = mixJS(g, ROCK[1], rockMask * 0.70);
  b = mixJS(b, ROCK[2], rockMask * 0.70);

  // Micro-contrast from the medium wave.
  const micro = 1 + (medium - 0.5) * 0.08;
  r *= micro;
  g *= micro;
  b *= micro;

  // One deterministic variation sample per albedo texel. The `4` is retained
  // as the original hash salt; it is not the texture's world-space resolution.
  const cellX = Math.floor(uvX * blockCellsX) % blockCellsX;
  const cellY = Math.floor(uvY * blockCellsY) % blockCellsY;
  const blockHash = terrainBlockHashJS(cellX, cellY, 4.0);
  const blockScale = 1 + (blockHash - 0.5) * 0.16;
  r *= blockScale;
  g *= blockScale;
  b *= blockScale;

  // Gentle posterization keeps the voxel-palette feel without hard banding.
  const levels = 16;
  const quantBlend = 0.4;
  r = mixJS(r, Math.floor(r * levels + 0.5) / levels, quantBlend);
  g = mixJS(g, Math.floor(g * levels + 0.5) / levels, quantBlend);
  b = mixJS(b, Math.floor(b * levels + 0.5) / levels, quantBlend);

  // Spawn pad: the chunk terrain there is a flat grass disc; clear variation.
  const padClear = 1 - smoothstepJS(10, 32, spawnDistance);
  r = mixJS(r, LUSH_GRASS[0], padClear);
  g = mixJS(g, LUSH_GRASS[1], padClear);
  b = mixJS(b, LUSH_GRASS[2], padClear);

  return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b))];
}

function linearToSrgbByte(v: number): number {
  const c = Math.max(0, Math.min(1, v));
  const out = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(out * 255);
}

/**
 * Bake the seamless distant-terrain albedo into an RGBA sRGB DataTexture.
 * `heightAt(wx, wz)` should return the world terrain height (metres).
 * The default 1024x256 RGBA base level is exactly 1 MiB. Across this world's
 * 16384x2048 m wrap that is about 16x8 m per texel; nearby 4 m grid lines stay
 * shader-rendered, while mipmapping deliberately removes them in the distance.
 */
export function bakeDistantTerrainTexture(
  heightAt: (wx: number, wz: number) => number,
  worldSizeX: number,
  worldSizeZ: number,
  resolutionX = 1024,
  resolutionY = 256,
  spawn: { x: number; z: number } = { x: worldSizeX / 2, z: worldSizeZ / 2 }
): THREE.DataTexture {
  const data = new Uint8Array(resolutionX * resolutionY * 4);

  for (let ty = 0; ty < resolutionY; ty++) {
    const uvY = (ty + 0.5) / resolutionY;
    const wz = uvY * worldSizeZ;
    const dz = Math.min(Math.abs(uvY * worldSizeZ - spawn.z), worldSizeZ - Math.abs(uvY * worldSizeZ - spawn.z));
    for (let tx = 0; tx < resolutionX; tx++) {
      const uvX = (tx + 0.5) / resolutionX;
      const wx = uvX * worldSizeX;
      const height = heightAt(wx, wz);
      const dx = Math.min(Math.abs(wx - spawn.x), worldSizeX - Math.abs(wx - spawn.x));
      const spawnDistance = Math.hypot(dx, dz);
      const [r, g, b] = distantTerrainAlbedoAt(
        uvX, uvY, height, spawnDistance, resolutionX, resolutionY
      );
      const i = (ty * resolutionX + tx) * 4;
      data[i] = linearToSrgbByte(r);
      data[i + 1] = linearToSrgbByte(g);
      data[i + 2] = linearToSrgbByte(b);
      data[i + 3] = 255;
    }
  }

  return createDistantTerrainTexture(data, resolutionX, resolutionY);
}

export function createDistantTerrainTexture(
  data: Uint8Array,
  resolutionX: number,
  resolutionY: number
): THREE.DataTexture {
  if (data.byteLength !== resolutionX * resolutionY * 4) {
    throw new Error('distant terrain texture byte length does not match its dimensions');
  }
  const texture = new THREE.DataTexture(data, resolutionX, resolutionY, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// Shader
// ---------------------------------------------------------------------------
const DISTANT_TERRAIN_VERTEX = `
attribute vec2 terrainUv;
attribute float terrainHeight;
attribute float terrainEditMask;
varying vec2 vTerrainUv;
varying float vTerrainEditMask;
varying vec3 vTorusLodWorldPosition;
`;

// Injected at the fragment's global scope (before main). The screen-space 4 m
// grid line (fwidth-antialiased) stays in the shader; coarser 16/64/256 m tiers
// are no longer needed because the baked texture's mip chain coarsens with
// distance automatically.
const DISTANT_TERRAIN_FRAGMENT = `
uniform vec2 uTerrainWorldSize;
uniform sampler2D uTerrainAlbedo;
uniform vec3 uChunkSurfaceColor;
uniform float uLodDiscardRadius;
uniform float uNearRadius;
uniform float uNearEndRadius;
uniform float uAtmoStart;
uniform float uAtmoEnd;
uniform float uAtmoStrength;
uniform vec3 uAtmosphereColor;
uniform vec3 uFarGlowColor;

varying vec2 vTerrainUv;
varying float vTerrainEditMask;
varying vec3 vTorusLodWorldPosition;

float terrainBlockEdge( vec2 flatPosition, float cellSize ) {
	vec2 gridPosition = flatPosition / cellSize;
	vec2 inCell = fract( gridPosition );
	vec2 toEdge = min( inCell, 1.0 - inCell );
	float pixelWidth = max( fwidth( gridPosition.x ), fwidth( gridPosition.y ) );
	return 1.0 - smoothstep( 0.0, max( 0.025, pixelWidth * 1.15 ), min( toEdge.x, toEdge.y ) );
}
`;

const DISTANT_TERRAIN_COLOR = `
#include <color_fragment>

float terrainViewDistance = distance( vTorusLodWorldPosition, cameraPosition );
if ( terrainViewDistance < uLodDiscardRadius ) discard;

// Baked albedo (1024x256, seamless around both torus directions). Mipmapping
// provides the distance-dependent "low pixel" detail for free.
vec3 terrainBaked = texture2D( uTerrainAlbedo, vTerrainUv ).rgb;

// Near band: read exactly like the rendered voxel blocks (flat surface color,
// no painted variation) so the chunk/shell seam is invisible.
float terrainNearMatch = 1.0 - smoothstep( uNearRadius, uNearEndRadius, terrainViewDistance );
vec3 terrainAlbedo = mix( terrainBaked, uChunkSurfaceColor, terrainNearMatch );

// 4 m block grid, screen-antialiased, fading out as the bakes mips take over.
vec2 terrainFlatPosition = vTerrainUv * uTerrainWorldSize;
float terrainGridEdge = terrainBlockEdge( terrainFlatPosition, 4.0 );
float terrainGridFade = 1.0 - smoothstep( 300.0, 900.0, terrainViewDistance );
terrainAlbedo *= 1.0 - terrainGridEdge * 0.10 * terrainGridFade;

// Aerial perspective for the far torus ring: lift toward a bright haze instead
// of darkening toward space, so the opposite side of the donut reads as a
// hazy planet rather than a muddy band.
float terrainAtmosphere = smoothstep( uAtmoStart, uAtmoEnd, terrainViewDistance ) * uAtmoStrength;
terrainAlbedo = mix( terrainAlbedo, uAtmosphereColor, terrainAtmosphere );

// Player-built colors remain recognizable; generated terrain uses the palette.
diffuseColor.rgb = mix( terrainAlbedo, diffuseColor.rgb, clamp( vTerrainEditMask, 0.0, 1.0 ) );
`;

const DISTANT_TERRAIN_ROUGHNESS = `
#include <roughnessmap_fragment>
roughnessFactor = mix( 0.9, roughnessFactor, clamp( vTerrainEditMask, 0.0, 1.0 ) );
`;

// Additive atmospheric fill for the far ring, strongest at its silhouette.
// Injected after lighting (opaque_fragment) so it survives shadow-side shading,
// and before fog_fragment so it still blends into the sky with distance.
const DISTANT_TERRAIN_OPQUE = `
#include <opaque_fragment>
{
	vec3 terrainViewVector = normalize( vViewPosition );
	float terrainRim = pow( 1.0 - saturate( dot( normalize( normal ), terrainViewVector ) ), 2.5 );
	gl_FragColor.rgb += uFarGlowColor * terrainAtmosphere * ( 0.35 + 0.85 * terrainRim );
}
`;

const detailedMaterials = new WeakSet<THREE.Material>();

export function applyDistantTerrainMaterial(
  material: THREE.MeshStandardMaterial,
  worldSizeX: number,
  worldSizeZ: number,
  initialRenderDistance: number = 12,
  bakedAlbedo: THREE.Texture | null = null
) {
  if (!material || detailedMaterials.has(material)) return material;
  detailedMaterials.add(material);
  const previousOnBeforeCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey;

  material.onBeforeCompile = (shader, renderer) => {
    if (typeof previousOnBeforeCompile === 'function') {
      previousOnBeforeCompile.call(material, shader, renderer);
    }
    const r = initialRenderDistance || 12;
    shader.uniforms.uTerrainWorldSize = {
      value: new THREE.Vector2(worldSizeX, worldSizeZ)
    };
    shader.uniforms.uTerrainAlbedo = {
      value: bakedAlbedo ?? null
    };
    shader.uniforms.uChunkSurfaceColor = {
      value: new THREE.Color(0x718f61)
    };
    shader.uniforms.uLodDiscardRadius = {
      value: Math.max(48.0, (r - 0.75) * 16.0)
    };
    shader.uniforms.uNearRadius = {
      value: Math.max(150.0, (r - 0.75) * 16.0)
    };
    shader.uniforms.uNearEndRadius = {
      value: Math.max(400.0, r * 16.0 * 2.6)
    };
    shader.uniforms.uAtmoStart = {
      value: Math.max(900.0, r * 16.0 * 5.0)
    };
    shader.uniforms.uAtmoEnd = {
      value: Math.max(2600.0, r * 16.0 * 18.0)
    };
    shader.uniforms.uAtmoStrength = {
      value: 0.45
    };
    shader.uniforms.uAtmosphereColor = {
      value: new THREE.Color(0.30, 0.52, 0.68)
    };
    shader.uniforms.uFarGlowColor = {
      value: new THREE.Color(0.08, 0.13, 0.16)
    };
    material.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + DISTANT_TERRAIN_VERTEX)
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvTerrainUv = terrainUv;\nvTerrainEditMask = terrainEditMask;\nvTorusLodWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DISTANT_TERRAIN_FRAGMENT)
      .replace('#include <color_fragment>', DISTANT_TERRAIN_COLOR)
      .replace('#include <roughnessmap_fragment>', DISTANT_TERRAIN_ROUGHNESS)
      .replace('#include <opaque_fragment>', DISTANT_TERRAIN_OPQUE);
  };

  material.customProgramCacheKey = () => {
    const prior = typeof previousCacheKey === 'function'
      ? previousCacheKey.call(material)
      : '';
    return `${prior}|distant-terrain-baked-v4`;
  };
  material.dithering = true;
  material.needsUpdate = true;
  return material;
}

/** Exported for tests / tooling. */
export const DISTANT_TERRAIN_UNIFORM_NAMES = [
  'uTerrainWorldSize',
  'uTerrainAlbedo',
  'uChunkSurfaceColor',
  'uLodDiscardRadius',
  'uNearRadius',
  'uNearEndRadius',
  'uAtmoStart',
  'uAtmoEnd',
  'uAtmoStrength',
  'uAtmosphereColor',
  'uFarGlowColor'
];
