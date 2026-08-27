import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/engine/voxel/World.ts';
import {
  applyDistantTerrainMaterial,
  bakeDistantTerrainTexture,
  distantTerrainAlbedoAt,
  DISTANT_TERRAIN_UNIFORM_NAMES
} from '../src/engine/render/DistantTerrainMaterial.ts';

test('distant torus shell keeps its pre-bent geometry and near-field cutoff', () => {
  const world = new World(new THREE.Scene()) as any;
  const geometry = world.distantSurface.geometry;
  assert.equal(world.distantLodSource, 'generated');
  assert.equal(world.distantTexture.image.width, 1024);
  assert.equal(world.distantTexture.image.height, 256);
  assert.equal(world.distantTexture.image.data.byteLength, 1024 * 256 * 4);
  const vertexCount = geometry.getAttribute('position').count;
  assert.equal(geometry.getAttribute('terrainUv').count, vertexCount);
  assert.equal(geometry.getAttribute('terrainHeight').count, vertexCount);
  assert.equal(geometry.getAttribute('terrainEditMask').count, vertexCount);

  const firstUv = new THREE.Vector2().fromBufferAttribute(geometry.getAttribute('terrainUv'), 0);
  const seamUv = new THREE.Vector2().fromBufferAttribute(
    geometry.getAttribute('terrainUv'),
    vertexCount - 1
  );
  assert.deepEqual(firstUv.toArray(), [0, 0]);
  assert.deepEqual(seamUv.toArray(), [1, 1]);

  const material = world.distantSurface.material;
  const shader: any = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>',
    fragmentShader: [
      '#include <common>',
      '#include <clipping_planes_fragment>',
      '#include <color_fragment>',
      '#include <roughnessmap_fragment>',
      '#include <opaque_fragment>'
    ].join('\n')
  };
  material.onBeforeCompile(shader, null as any);

  assert.deepEqual(shader.uniforms.uTerrainWorldSize.value.toArray(), [16384, 2048]);
  for (const name of DISTANT_TERRAIN_UNIFORM_NAMES) {
    assert.ok(shader.uniforms[name], `missing uniform ${name}`);
  }
  assert.equal(shader.uniforms.uTerrainAlbedo.value, world.distantTexture);
  assert.match(shader.vertexShader, /terrainUv/);
  // Baked albedo lookup + chunk-color near match + far glow, still with the
  // camera-distance discard that keeps chunks and shell from z-fighting.
  assert.match(shader.fragmentShader, /texture2D\( uTerrainAlbedo, vTerrainUv \)/);
  assert.match(shader.fragmentShader, /uChunkSurfaceColor/);
  assert.match(shader.fragmentShader, /terrainNearMatch/);
  assert.match(shader.fragmentShader, /uFarGlowColor/);
  assert.match(shader.fragmentShader, /distance\( vTorusLodWorldPosition, cameraPosition \)/);
  assert.match(shader.fragmentShader, /if \( terrainViewDistance < uLodDiscardRadius \) discard/);
  assert.ok(shader.uniforms.uLodDiscardRadius);
  assert.ok(shader.uniforms.uNearRadius);
  assert.match(material.customProgramCacheKey(), /torus-distant-surface-v1\|distant-terrain-baked-v4/);
});

test('applyDistantTerrainMaterial scales the near/atmosphere bands with render distance', () => {
  const material = new THREE.MeshStandardMaterial();
  applyDistantTerrainMaterial(material, 16384, 2048, 8, null as any);
  const shader: any = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: ['#include <common>', '#include <color_fragment>', '#include <opaque_fragment>'].join('\n')
  };
  material.onBeforeCompile(shader, null as any);

  const u = shader.uniforms;
  assert.equal(u.uLodDiscardRadius.value, (8 - 0.75) * 16);
  assert.ok(u.uNearEndRadius.value >= 400);
  assert.ok(u.uAtmoStart.value >= 900);
  assert.ok(u.uAtmoEnd.value > u.uAtmoStart.value);
  assert.match(material.customProgramCacheKey(), /distant-terrain-baked-v4/);
});

test('distant terrain albedo field is seamless across both torus wraps', () => {
  const resX = 512;
  const resY = 64;
  const samples = [
    { x: 0, y: 0.13 }, { x: 0.25, y: 0.5 }, { x: 0.71, y: 0.03 },
    { x: 0, y: 0.87 }, { x: 0.42, y: 0.0 }, { x: 0.99, y: 0.61 }
  ];
  const close = (a, b, eps, msg) => {
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(a[i] - b[i]) <= eps, `${msg} channel ${i}: ${a[i]} vs ${b[i]}`);
    }
  };
  // Integer wave frequencies make the field period-1 in both uv axes; allow a
  // float slack for sin argument reduction.
  for (const s of samples) {
    close(
      distantTerrainAlbedoAt(s.x, s.y, 17.3, 900, resX, resY),
      distantTerrainAlbedoAt(s.x + 1, s.y, 17.3, 900, resX, resY),
      1e-6, `X-seam mismatch at uv=(${s.x},${s.y})`
    );
    close(
      distantTerrainAlbedoAt(s.x, s.y, 17.3, 900, resX, resY),
      distantTerrainAlbedoAt(s.x, s.y + 1, 17.3, 900, resX, resY),
      1e-6, `Y-seam mismatch at uv=(${s.x},${s.y})`
    );
  }
});

test('baked distant texture is seamless-periodic, sRGB and matches the albedo field', () => {
  const resX = 128;
  const resY = 16;
  const texture = bakeDistantTerrainTexture(() => 16, 1024, 128, resX, resY, { x: 512, z: 64 });
  const data = texture.image.data;
  assert.equal(texture.image.width, resX);
  assert.equal(texture.image.height, resY);
  assert.equal(data.length, resX * resY * 4);
  assert.equal(texture.wrapS, THREE.RepeatWrapping);
  assert.equal(texture.wrapT, THREE.RepeatWrapping);
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace);

  // Every byte in range and fully opaque.
  for (let i = 0; i < data.length; i += 4) {
    assert.ok(data[i] >= 0 && data[i] <= 255);
    assert.equal(data[i + 3], 255);
  }

  // A texel must equal the pure albedo field at its centre uv.
  const tx = 10;
  const ty = 3;
  const uvX = (tx + 0.5) / resX;
  const uvY = (ty + 0.5) / resY;
  const [lr, lg, lb] = distantTerrainAlbedoAt(uvX, uvY, 16, 400, resX, resY);
  const toByte = (v: number) => {
    const c = Math.min(1, Math.max(0, v));
    return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
  };
  const i = (ty * resX + tx) * 4;
  assert.equal(data[i], toByte(lr));
  assert.equal(data[i + 1], toByte(lg));
  assert.equal(data[i + 2], toByte(lb));

  // Spawn pad texel is the exact chunk surface green: the sRGB bytes of
  // 0x718f61 (113, 143, 97), since the bake linearizes and re-encodes.
  // Texel (64, 8) centre = world (516, 68), 5.7 m from spawn (512, 64).
  const padI = (8 * resX + 64) * 4;
  assert.equal(data[padI], 113);
  assert.equal(data[padI + 1], 143);
  assert.equal(data[padI + 2], 97);
});
