import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/engine/voxel/World.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';
import { MicroVoxelLayer, MICRO_SIZE } from '../src/engine/voxel/MicroVoxelLayer.ts';
import { ContraptionManager } from '../src/engine/contraption/ContraptionManager.ts';

test('standard voxels retain arbitrary per-instance colors', () => {
  const world = new World(new THREE.Scene()) as any;
  world.setBlock(2, 20, 2, BlockTypes.COLOR_BLOCK, false, '#12abef' as any);
  assert.equal(world.getBlock(2, 20, 2), BlockTypes.COLOR_BLOCK);
  assert.equal(world.getBlockColor(2, 20, 2), 0x12abef);
});

test('spoon subdivision replaces one standard voxel with exactly 5x5x5 cells', () => {
  const world = new World(new THREE.Scene()) as any;
  world.setBlock(2, 20, 2, BlockTypes.COLOR_BLOCK, false, 0xff3366);
  assert.equal(world.subdivideBlock(2, 20, 2), 125);
  assert.equal(world.getBlock(2, 20, 2), BlockTypes.AIR);
  assert.equal(world.microVoxels.cells.size, 125);
  assert.equal(world.microVoxels.get(10, 100, 10), 0xff3366);

  const hit = world.raycastMicro(
    new THREE.Vector3(2.5, 20.5, 1),
    new THREE.Vector3(0, 0, 1),
    4
  );
  assert.equal(hit.hit, true);
  assert.equal(hit.kind, 'micro');
  assert.equal(hit.size, MICRO_SIZE);

  const axisHit = world.raycastMicro(
    new THREE.Vector3(1, 20, 2),
    new THREE.Vector3(1, 0, 0),
    4
  );
  assert.equal(axisHit.hit, true);
  assert.equal(axisHit.microPos.x, 10);
});

test('micro voxel edits rebuild only their dirty horizontal mesh chunk', () => {
  const layer = new MicroVoxelLayer() as any;
  layer.set(1, 10, 1, 0xff0000);
  layer.set(101, 10, 1, 0x00ff00);
  assert.equal(layer.updateMesh(), true);
  assert.equal(layer.meshChunks.size, 2);

  const nearKey = layer.mesh.userData.microChunkKey;
  const farEntry = [...layer.meshChunks.entries()].find(([key]) => key !== nearKey);
  const nearGeometry = layer.meshChunks.get(nearKey).geometry;
  const farGeometry = farEntry[1].geometry;
  layer.set(2, 10, 1, 0x0000ff);
  assert.equal(layer.updateMesh(), true);

  assert.notEqual(layer.meshChunks.get(nearKey).geometry, nearGeometry);
  assert.equal(layer.meshChunks.get(farEntry[0]).geometry, farGeometry);
});

test('micro voxel chunk replacement clears only the indexed target chunk', () => {
  const layer = new MicroVoxelLayer();
  layer.set(1, 10, 1, 0xff0000);
  layer.set(81, 10, 1, 0x00ff00);

  assert.equal(layer.clearChunk(0, 0), 1);
  assert.equal(layer.get(1, 10, 1), null);
  assert.equal(layer.get(81, 10, 1), 0x00ff00);
});

test('selected micro voxels become one programmable rigid body and can be restored', () => {
  const scene = new THREE.Scene();
  const world = new World(scene) as any;
  world.setBlock(3, 20, 3, BlockTypes.COLOR_BLOCK, false, 0x48dbfb);
  world.subdivideBlock(3, 20, 3);

  const manager = new ContraptionManager(scene, world, null, null);
  manager.setCornerA({ x: 3, y: 20, z: 3 });
  manager.setCornerB({ x: 3, y: 20, z: 3 });
  const contraption = manager.assembleSelection() as any;

  assert.ok(contraption);
  assert.equal(contraption.blocks.length, 125);
  assert.ok(contraption.blocks.every(block => block.size === MICRO_SIZE));
  assert.ok(Math.abs(contraption.voxelVolume - 1) < 1e-9);
  assert.equal(world.microVoxels.cells.size, 0);

  assert.equal(manager.disassembleContraption(contraption), true);
  assert.equal(world.microVoxels.cells.size, 125);
});

test('standard entities solidify without losing blocks above the legacy y=32 boundary', () => {
  const scene = new THREE.Scene();
  const world = new World(scene) as any;
  const manager = new ContraptionManager(scene, world, null, null);
  world.setBlock(3, 40, 3, BlockTypes.COLOR_BLOCK, false, 0x48dbfb);
  manager.setCornerA({ x: 3, y: 40, z: 3 });
  manager.setCornerB({ x: 3, y: 40, z: 3 });

  const contraption = manager.assembleSelection() as any;
  assert.ok(contraption);
  assert.equal(world.getBlock(3, 40, 3), BlockTypes.AIR);
  assert.equal(manager.disassembleContraption(contraption), true);
  assert.equal(world.getBlock(3, 40, 3), BlockTypes.COLOR_BLOCK);
  assert.equal(world.getBlockColor(3, 40, 3), 0x48dbfb);
});
