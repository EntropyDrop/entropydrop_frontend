import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/engine/voxel/World.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';
import { CHUNK_SIZE_Y } from '../src/engine/voxel/Chunk.ts';
import {
  TORUS_SIZE_X, TORUS_SIZE_Z, TORUS_R, TORUS_RHO, TORUS_GREF,
  TORUS_SPAWN_X, TORUS_SPAWN_Z,
  wrapX, wrapZ, wrapChunkX, wrapChunkZ,
  bendPoint, unbendPoint, bendDirection, unbendDirection, bendFrameQuaternion,
  hookSceneMaterials
} from '../src/engine/torus/TorusWorld.ts';

test('torus wrap: coordinates normalize into [0, size)', () => {
  assert.equal(wrapX(16384), 0);
  assert.equal(wrapX(-1), 16383);
  assert.equal(wrapZ(2048), 0);
  assert.equal(wrapZ(-1), 2047);
  assert.equal(wrapChunkX(1024), 0);
  assert.equal(wrapChunkX(-1), 1023);
  assert.equal(wrapChunkZ(128), 0);
  assert.equal(wrapChunkZ(-1), 127);
});

test('torus bend is geometrically continuous across wrapped seams', () => {
  const a = bendPoint(16383.9, 16, 100);
  const b = bendPoint(-0.1, 16, 100);
  assert.ok(a.distanceTo(b) < 1e-3, 'geometry should be continuous across the X seam');
  const c = bendPoint(100, 16, 2047.9);
  const d = bendPoint(100, 16, -0.1);
  assert.ok(c.distanceTo(d) < 1e-3, 'geometry should be continuous across the Z seam');
});

test('torus unbend is the inverse of bend throughout the world', () => {
  // The 1024x128 ring ratio keeps R large enough to avoid folding throughout y∈[0,255].
  for (const [x, y, z] of [[0, 16, 0], [8192, 16, 1024], [16383, 30, 2047], [100, 2, 64], [14208, 255, 1600]]) {
    const bent = bendPoint(x, y, z);
    const flat = unbendPoint(bent.x, bent.y, bent.z);
    assert.ok(Math.abs(flat.x - x) < 1e-4, `x ${x} -> ${flat.x}`);
    assert.ok(Math.abs(flat.y - y) < 1e-4, `y ${y} -> ${flat.y}`);
    assert.ok(Math.abs(flat.z - z) < 1e-4, `z ${z} -> ${flat.z}`);
  }
});

test('torus frame is orthonormal and direction conversion round-trips', () => {
  const x = TORUS_SPAWN_X, y = 18, z = TORUS_SPAWN_Z;
  const q = bendFrameQuaternion(x, y, z);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  // At the inner ring (φ=π), the surface normal points toward the hole center (+X).
  assert.ok(Math.abs(up.x - 1) < 1e-4 && Math.abs(up.y) < 1e-4 && Math.abs(up.z) < 1e-4,
    `inner-ring normal should be +X, got (${up.x.toFixed(3)}, ${up.y.toFixed(3)}, ${up.z.toFixed(3)})`);

  const flatDir = new THREE.Vector3(0, 0, -1);
  const bent = bendDirection(x, y, z, flatDir);
  const back = unbendDirection(x, y, z, bent);
  assert.ok(back.distanceTo(flatDir) < 1e-4, 'locally linearized direction conversion should be reversible');
});

test('torus world setBlock and getBlock wrap automatically', () => {
  const world = new World(new THREE.Scene()) as any;
  world.setBlock(-1, 10, -1, BlockTypes.COLOR_BLOCK, false, 0x48dbfb);
  assert.equal(world.getBlock(16383, 10, 2047), BlockTypes.COLOR_BLOCK);
  assert.equal(world.getBlock(-1, 10, -1), BlockTypes.COLOR_BLOCK);
  assert.equal(world.getBlockColor(-1, 10, -1), 0x48dbfb);
  // Equivalence: (-1,-1) ≡ (16383,2047), and (16384,2048) ≡ (0,0).
  assert.equal(world.getBlock(16384, 10, 2048), world.getBlock(0, 10, 0));
});

test('torus world raycastBent hits a known block', () => {
  const world = new World(new THREE.Scene()) as any;
  // Clear nearby terrain so procedural columns cannot occlude the known target.
  for (let x = 8; x <= 12; x++) {
    for (let z = 8; z <= 12; z++) {
      for (let y = 0; y <= 30; y++) world.setBlock(x, y, z, BlockTypes.AIR, false);
    }
  }
  world.setBlock(10, 5, 10, BlockTypes.COLOR_BLOCK, false, 0xff3366);

  const origin = bendPoint(10, 30, 10);
  const target = bendPoint(10, 5, 10);
  const dir = target.clone().sub(origin).normalize();
  const hit = world.raycastBent(origin, dir, 30);
  assert.equal(hit.hit, true);
  assert.equal(hit.kind, 'standard');
  assert.deepEqual(hit.hitPos, { x: 10, y: 5, z: 10 });
  assert.deepEqual(hit.normal, { x: 0, y: 1, z: 0 }, 'a top hit should point its normal toward air');
  assert.deepEqual(hit.placePos, { x: 10, y: 6, z: 10 }, 'placement should use the air side of the hit face');
  assert.equal(hit.color, 0xff3366);
  assert.ok(hit.entry && Math.abs(hit.entry.y - 6) < 1e-6, 'entry should lie on the hit block top face');
});

test('torus world raycastMicroBent hits a known microcell', () => {
  const world = new World(new THREE.Scene()) as any;
  for (let x = 8; x <= 12; x++) {
    for (let z = 8; z <= 12; z++) {
      for (let y = 0; y <= 30; y++) world.setBlock(x, y, z, BlockTypes.AIR, false);
    }
  }
  world.setMicroBlock(50, 25, 50, 0x12abef);
  const origin = bendPoint(10, 30, 10);
  const target = bendPoint(10, 5, 10);
  const dir = target.clone().sub(origin).normalize();
  const hit = world.raycastMicroBent(origin, dir, 30);
  assert.equal(hit.hit, true);
  assert.equal(hit.kind, 'micro');
  assert.equal(hit.color, 0x12abef);
  assert.ok(hit.microPos.x >= 48 && hit.microPos.x <= 52, 'hit should be near microcell x=50');
  assert.ok(hit.microPos.y >= 23 && hit.microPos.y <= 27, 'hit should be near microcell y=25');
  assert.ok(hit.hitPos.x >= 9.6 && hit.hitPos.x <= 10.4, 'hitPos should use world units rather than integer microcells');
  assert.deepEqual(hit.normal, { x: 0, y: 1, z: 0 }, 'microcell top-face normal should point toward air');
});

test('bent micro ray returns the exact rendered face point near an edge', () => {
  const world = new World(new THREE.Scene()) as any;
  const mx = TORUS_SPAWN_X * 5;
  const my = 80 * 5;
  const mz = (TORUS_SPAWN_Z + 6.4) * 5;
  world.setMicroBlock(mx, my, mz, 0xff44aa);

  const visibleTarget = new THREE.Vector3(mx / 5 + 0.1, my / 5 + 0.01, mz / 5);
  const eyeFlat = new THREE.Vector3(visibleTarget.x, visibleTarget.y, TORUS_SPAWN_Z);
  const eyeBent = bendPoint(eyeFlat.x, eyeFlat.y, eyeFlat.z);
  const targetBent = bendPoint(visibleTarget.x, visibleTarget.y, visibleTarget.z);
  const hit = world.raycastMicroBent(
    eyeBent,
    targetBent.clone().sub(eyeBent).normalize(),
    8
  );

  assert.equal(hit.hit, true);
  assert.deepEqual(hit.microPos, { x: mx, y: my, z: mz });
  assert.deepEqual(hit.normal, { x: 0, y: 0, z: -1 });
  const entry = new THREE.Vector3(hit.entry.x, hit.entry.y, hit.entry.z);
  assert.ok(entry.distanceTo(visibleTarget) < 1e-4, 'entry should coincide with the GPU-bent face under the crosshair');
});

test('torus constants preserve R/r=8 for the scaled 1024x128 chunk world', () => {
  assert.equal(TORUS_SIZE_X, 16384);
  assert.equal(TORUS_SIZE_Z, 2048);
  assert.ok(Math.abs(TORUS_R / TORUS_RHO - 8) < 1e-9, 'R:r should equal the 8:1 aspect ratio');
  assert.equal(TORUS_GREF, 16);
  assert.equal(CHUNK_SIZE_Y, 256);
  assert.ok(TORUS_RHO + (CHUNK_SIZE_Y - 1 - TORUS_GREF) < TORUS_R - 1, 'the full build height should not trigger fold protection');

  const atSpawn = bendPoint(TORUS_SPAWN_X, 16, TORUS_SPAWN_Z);
  const xEdge = atSpawn.distanceTo(bendPoint(TORUS_SPAWN_X + 1, 16, TORUS_SPAWN_Z));
  const zEdge = atSpawn.distanceTo(bendPoint(TORUS_SPAWN_X, 16, TORUS_SPAWN_Z + 1));
  assert.ok(xEdge > 0.874 && xEdge < 0.876, `inner-ring X edges should compress only 12.5%, got ${xEdge}`);
  assert.ok(Math.abs(zEdge - 1) < 0.001, `inner-ring Z edges should remain about one cell, got ${zEdge}`);
});

test('torus rendering starts with no synthetic far terrain and preserves near-field culling contracts', () => {
  const world = new World(new THREE.Scene()) as any;
  assert.equal(world.distantSurface.mesh.userData.distantSurfaceZones, true);
  assert.equal(world.distantSurface.mesh.visible, false);
  assert.equal(world.distantSurface.loadedZones.size, 0);
  assert.equal(world.distantSurface.mesh.geometry.instanceCount, 0,
    'unvisited terrain must not be replaced with synthetic geometry');

  world.updateChunksAround(TORUS_SPAWN_X, TORUS_SPAWN_Z);
  const expectedChunkCount = (2 * world.renderDistance + 1) ** 2;
  assert.ok(world.chunks.size > 0 && world.chunks.size <= 6,
    'the first streaming frame should allocate only the nearest bounded chunk batch');
  assert.equal(world.activeChunkKeys.size, expectedChunkCount,
    'the full configured window should be tracked while allocation proceeds');
  const meshed = [...world.chunks.values()].filter((chunk: any) => chunk.mesh);
  assert.equal(meshed.length, 1, 'only one expensive chunk mesh should build per frame');
  const detailMask = world.distantSurface.detailMaskTexture.image.data as Uint8Array;
  for (const chunk of meshed) {
    const maskIndex = chunk.cz * (TORUS_SIZE_X / 16) + chunk.cx;
    assert.equal(detailMask[maskIndex], 255,
      'far terrain must be hidden only after the detailed chunk mesh is ready');
    chunk.mesh.traverse((child) => {
      if (!child.isMesh) return;
      assert.equal(child.frustumCulled, false, 'child meshes must not be culled again by flat bounding spheres');
      if (child.castShadow) {
        assert.ok(child.customDepthMaterial, 'new chunks need torus depth material before attachment to prevent edit flicker');
      }
    });
  }

  world.setMicroBlock(TORUS_SPAWN_X * 5, 20 * 5, TORUS_SPAWN_Z * 5, 0x48dbfb);
  world.updateChunksAround(TORUS_SPAWN_X, TORUS_SPAWN_Z);
  assert.ok(world.microVoxels.mesh, 'microvoxel mesh should rebuild in the edit frame');
  assert.equal(world.microVoxels.mesh.frustumCulled, false, 'new microvoxel mesh should use torus culling immediately');
  assert.ok(world.microVoxels.mesh.customDepthMaterial, 'new microvoxel mesh should get torus depth material immediately');
});

test('chunk streaming evicts procedural arrays but retains authored edits', () => {
  const world = new World(new THREE.Scene()) as any;
  world.setRenderDistance(3);
  world.updateChunksAround(TORUS_SPAWN_X, TORUS_SPAWN_Z);

  const center = world.worldToChunkCoords(TORUS_SPAWN_X, TORUS_SPAWN_Z);
  const editedKey = `${center.cx},${center.cz}`;
  const uneditedKey = `${center.cx + 1},${center.cz}`;
  const detailMask = world.distantSurface.detailMaskTexture.image.data as Uint8Array;
  const centerMaskIndex = center.cz * (TORUS_SIZE_X / 16) + center.cx;
  assert.equal(detailMask[centerMaskIndex], 255, 'the initial detailed chunk should own its pixels');
  assert.equal(world.setBlock(TORUS_SPAWN_X, 255, TORUS_SPAWN_Z, BlockTypes.COLOR_BLOCK), true);
  assert.equal(world.setBlock(TORUS_SPAWN_X, 256, TORUS_SPAWN_Z, BlockTypes.COLOR_BLOCK), false);
  assert.equal(world.chunks.get(editedKey).hasUserEdits, true);

  world.updateChunksAround(TORUS_SPAWN_X + 10 * 16, TORUS_SPAWN_Z);
  assert.equal(detailMask[centerMaskIndex], 0,
    'far terrain must resume before an old detailed chunk leaves the active window');
  assert.equal(world.chunks.has(editedKey), true, 'authored chunks must remain available for persistence/re-entry');
  assert.equal(world.chunks.has(uneditedKey), false, 'procedural chunks should be regenerated instead of retained');
  assert.ok(world.chunks.size <= world.activeChunkKeys.size + 1,
    'progressive streaming may leave active chunks pending without retaining inactive procedural chunks');
  for (const chunk of world.dirtyChunks) {
    assert.equal(world.activeChunkKeys.has(`${chunk.cx},${chunk.cz}`), true, 'inactive chunks must leave the rebuild queue');
  }
});

test('torus rendering avoids flat-space culling for runtime selections and entities', () => {
  const scene = new THREE.Scene();
  const selection = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial()
  );
  const entity = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  const distant = new THREE.Mesh(new THREE.TorusGeometry(), new THREE.MeshBasicMaterial());
  distant.userData.torusPreBent = true;
  scene.add(selection, entity, distant);

  hookSceneMaterials(scene);

  assert.equal(selection.frustumCulled, false, 'GPU-bent selection wireframes must not use flat bounding spheres');
  assert.equal(entity.frustumCulled, false, 'GPU-bent entity meshes must not use flat bounding spheres');
  assert.equal(distant.frustumCulled, true, 'prebent LOD can use native bent-space culling');
});
