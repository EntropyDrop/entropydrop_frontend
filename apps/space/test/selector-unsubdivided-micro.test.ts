import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Contraption } from '@entropydrop/space-engine/contraption/Contraption.ts';
import { ContraptionManager } from '@entropydrop/space-engine/contraption/ContraptionManager.ts';
import { PlayerController, SpecialTool } from '../src/engine/controls/PlayerController.ts';
import { BlockTypes } from '@entropydrop/space-engine/voxel/BlockTypes.ts';
import { World } from '@entropydrop/space-engine/voxel/World.ts';
import { ActionDomain, executeBasicAction } from '@entropydrop/space-engine/actions/BasicActions.ts';

function createController(overrides: any = {}) {
  const scene = new THREE.Scene();
  const world = new World(scene) as any;
  const manager = new ContraptionManager(scene, world, null, null) as any;
  const controller: any = Object.create(PlayerController.prototype);
  controller._activeTool = SpecialTool.SELECTOR;
  controller.selectedSubtree = null;
  controller.selectedBlockSelection = null;
  controller.selectorLevel = null;
  controller.selectorRange = null;
  controller.boxSelectionPreview = null;
  controller.focusBlockPreview = null;
  controller.selectorMicroMode = true;
  controller.inventorySlots = new Array(9).fill(null);
  controller.selectedInventoryIndex = 0;
  controller.contraptions = manager;
  controller.world = world;
  controller.keys = {};
  controller.sound = { playBlockBreak() {}, playBlockPlace() {}, playWrenchClick() {}, playAssemblyClack() {}, playSteamHiss() {} };
  controller.particles = { emitBlockBreak() {}, emitSteamPuff() {} };
  manager.selectionHost = controller;

  const toasts: string[] = [];
  controller.ui = {
    showToast: (m: string) => toasts.push(m),
    renderInventoryBar() {},
    updateToolPanelMode() {},
    renderHotbar() {}
  };
  Object.assign(controller, overrides);
  return { controller, manager, world, scene, toasts };
}

test('micro 2-point box on unsubdivided standard block selects micro cells without mutating the world during selection', () => {
  const { controller, manager, world } = createController();
  // Place standard block at (2, 5, 2)
  world.setBlock(2, 5, 2, BlockTypes.COLOR_BLOCK, false, 0xff0000);
  assert.equal(world.getBlock(2, 5, 2), BlockTypes.COLOR_BLOCK);
  assert.equal(world.microVoxels.cells.size, 0, 'no micro voxels before selection');

  // Select micro region inside (2, 5, 2): from micro (10, 25, 10) to (12, 29, 14)
  // X: 10..12 (3 cells), Y: 25..29 (5 cells), Z: 10..14 (5 cells) => 3 * 5 * 5 = 75 micro cells
  manager.setCornerA({ x: 2.0, y: 5.0, z: 2.0 }, { micro: true });
  manager.setCornerB({ x: 2.59, y: 5.99, z: 2.99 }, { micro: true });

  assert.equal(manager.hasValidSelection(), true);
  assert.equal(manager.microSelection?.length, 75, 'selects 75 micro cells from the unsubdivided standard block');

  // Verify the world has NOT been converted or mutated yet
  assert.equal(world.getBlock(2, 5, 2), BlockTypes.COLOR_BLOCK, 'standard block must still exist');
  assert.equal(world.microVoxels.cells.size, 0, 'world must NOT be converted to micro voxels until an operation occurs');
});

test('assembling a micro selection over an unsubdivided standard block extracts only the selected micro voxels and leaves the rest in the world', () => {
  const { controller, manager, world } = createController();
  // Place standard block at (2, 5, 2) with red color 0xff0000
  world.setBlock(2, 5, 2, BlockTypes.COLOR_BLOCK, false, 0xff0000);

  // Select 75 micro cells (3x5x5) out of the 125 micro cells
  manager.setCornerA({ x: 2.0, y: 5.0, z: 2.0 }, { micro: true });
  manager.setCornerB({ x: 2.59, y: 5.99, z: 2.99 }, { micro: true });
  assert.equal(manager.microSelection?.length, 75);

  // Perform Assemble (G)
  const result = executeBasicAction({ manager, world, selectionHost: controller }, {
    domain: ActionDomain.SELECTION,
    action: 'assemble'
  });

  const entity = result.entity;
  assert.ok(entity, 'assembly succeeded');
  assert.equal(entity.blocks.length, 75, 'assembled entity contains exactly the 75 selected micro blocks');
  assert.deepEqual(entity.blocks[0].size, 0.2, 'entity blocks are 0.2m micro blocks');
  assert.equal(entity.blocks[0].color, 0xff0000, 'entity blocks retain the original block color');

  // Verify world state after operation:
  // The standard block at (2, 5, 2) is now AIR because it was subdivided
  assert.equal(world.getBlock(2, 5, 2), BlockTypes.AIR, 'standard block is cleared after subdivision');
  // The unselected 50 micro cells (125 - 75 = 50) remain in the world as micro voxels!
  assert.equal(world.microVoxels.cells.size, 50, 'remaining 50 unselected micro voxels stay in the world');
});

test('deleting a micro selection over an unsubdivided standard block carves the selected micro cells and preserves the rest', () => {
  const { controller, manager, world } = createController();
  // Place standard block at (3, 4, 5) with blue color 0x0000ff
  world.setBlock(3, 4, 5, BlockTypes.COLOR_BLOCK, false, 0x0000ff);

  // Select 1 micro cell at (15, 20, 25) (which is corner of (3, 4, 5))
  manager.toggleMicroCell({ x: 3.0, y: 4.0, z: 5.0 }); // (15, 20, 25)
  assert.equal(manager.microSelection?.length, 1);

  // Perform Delete
  controller.deleteSelectionBlocks();

  // Verify world state:
  // Standard block is now subdivided
  assert.equal(world.getBlock(3, 4, 5), BlockTypes.AIR);
  // 124 micro voxels remain in the world
  assert.equal(world.microVoxels.cells.size, 124, '124 micro voxels remain after deleting 1 micro voxel');
  assert.equal(world.getMicroBlock(15, 20, 25), null, 'deleted micro cell is empty');
  assert.notEqual(world.getMicroBlock(16, 20, 25), null, 'adjacent micro cell exists');
});

test('copying a micro selection over an unsubdivided standard block samples 0.2m micro blocks without modifying the world', () => {
  const { controller, manager, world } = createController();
  // Place standard block at (1, 2, 3) with green color 0x00ff00
  world.setBlock(1, 2, 3, BlockTypes.COLOR_BLOCK, false, 0x00ff00);

  // Select 8 micro cells (2x2x2) inside the standard block
  manager.setCornerA({ x: 1.0, y: 2.0, z: 3.0 }, { micro: true });
  manager.setCornerB({ x: 1.39, y: 2.39, z: 3.39 }, { micro: true }); // (5, 10, 15) to (6, 11, 16) => 2x2x2 = 8 cells
  assert.equal(manager.microSelection?.length, 8);

  const sampled = controller.sampleWorldSelectionAsBlockSet();
  assert.equal(sampled.length, 8, 'sampled 8 micro blocks');
  assert.equal(sampled[0].size, 0.2);
  assert.equal(sampled[0].color, 0x00ff00);

  // Verify the world is completely untouched by the copy operation
  assert.equal(world.getBlock(1, 2, 3), BlockTypes.COLOR_BLOCK, 'standard block remains intact');
  assert.equal(world.microVoxels.cells.size, 0, 'no micro voxels generated during copy');
});
