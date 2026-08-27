import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Contraption } from '../src/engine/contraption/Contraption.ts';
import { ContraptionManager } from '../src/engine/contraption/ContraptionManager.ts';
import { PlayerController, SpecialTool } from '../src/engine/controls/PlayerController.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';
import { World } from '../src/engine/voxel/World.ts';

/**
 * Delete removes a selected entity/component subtree, blocks from a two-point
 * world box or Shift single-cell selection, or an entity block selection.
 */

function makeController(overrides: any = {}) {
  const controller: any = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.SELECTOR;
  controller.selectedSubtree = null;
  controller.selectedBlockSelection = null;
  controller.selectorLevel = null;
  controller.selectorRange = null;
  controller.inventorySlots = new Array(8).fill(null);
  controller.selectedInventoryIndex = 0;
  controller.contraptions = overrides.manager || null;
  controller.world = overrides.world || null;
  controller.keys = {};
  controller.sound = { playBlockBreak() {} };
  const toasts: string[] = [];
  controller.ui = {
    showToast: m => toasts.push(m),
    renderInventoryBar() {},
    notifyContraptionStructureChanged() {}
  };
  Object.assign(controller, overrides);
  controller.__toasts = toasts;
  return controller;
}

/** Clear an area to AIR so lazy terrain generation cannot affect the test. */
function clearRegion(world: any, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) {
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        world.setBlock(x, y, z, BlockTypes.AIR, false);
      }
    }
  }
}

test('Delete removes blocks inside a world box, preserves outside blocks, and resets selection', () => {
  const scene = new THREE.Scene();
  const world = new World(scene) as any;
  clearRegion(world, 0, 0, 0, 5, 5, 5);
  world.setBlock(1, 1, 1, BlockTypes.COLOR_BLOCK, false, 0xff0000);
  world.setBlock(2, 1, 1, BlockTypes.COLOR_BLOCK, false, 0x00ff00);
  world.setBlock(1, 2, 1, BlockTypes.COLOR_BLOCK, false, 0x0000ff);
  world.setBlock(5, 5, 5, BlockTypes.COLOR_BLOCK, false, 0xaaaaaa); // Outside the box.
  const manager = new ContraptionManager(scene, {}, null, null);
  const controller = makeController({ manager, world });

  manager.setCornerA({ x: 1, y: 1, z: 1 });
  manager.setCornerB({ x: 3, y: 3, z: 3 });
  controller.deleteSelectionBlocks();

  assert.equal(world.getBlock(1, 1, 1), BlockTypes.AIR, 'the inside block should be deleted');
  assert.equal(world.getBlock(2, 1, 1), BlockTypes.AIR);
  assert.equal(world.getBlock(1, 2, 1), BlockTypes.AIR);
  assert.equal(world.getBlock(5, 5, 5), BlockTypes.COLOR_BLOCK, 'the outside block should remain');
  assert.equal(manager.selectionCornerA, null, 'selection should reset');
  assert.equal(manager.selectionCornerB, null);
  assert.ok(controller.__toasts.some(m => m.includes('Deleted 3 blocks')));
});

test('Delete also removes 5x5x5 microblocks inside a world box', () => {
  const scene = new THREE.Scene();
  const world = new World(scene) as any;
  clearRegion(world, 4, 10, 4, 4, 10, 5);
  world.setBlock(4, 10, 4, BlockTypes.COLOR_BLOCK, false, 0xaaaaaa);
  assert.equal(world.setMicroBlock(22, 50, 27, 0x123456), true, 'place a microblock in the adjacent cell');
  const manager = new ContraptionManager(scene, {}, null, null);
  const controller = makeController({ manager, world });

  manager.setCornerA({ x: 4, y: 10, z: 4 });
  manager.setCornerB({ x: 4, y: 10, z: 5 });
  controller.deleteSelectionBlocks();

  assert.equal(world.getBlock(4, 10, 4), BlockTypes.AIR);
  assert.equal(world.getMicroBlock(22, 50, 27), null, 'the microblock should be deleted');
  assert.ok(controller.__toasts.some(m => m.includes('1 blocks + 1 micro voxels')));
});

test('Delete removes only selected cells in Shift single-cell mode', () => {
  const scene = new THREE.Scene();
  const world = new World(scene) as any;
  clearRegion(world, 1, 1, 1, 1, 1, 1);
  clearRegion(world, 9, 9, 9, 9, 9, 9);
  world.setBlock(1, 1, 1, BlockTypes.COLOR_BLOCK, false, 0xabcdef);
  world.setBlock(9, 9, 9, BlockTypes.COLOR_BLOCK, false, 0x111111);
  const manager = new ContraptionManager(scene, {}, null, null);
  const controller = makeController({ manager, world });

  manager.toggleWorldGlueCell({ x: 1, y: 1, z: 1 });
  assert.equal(manager.hasValidSelection(), true);
  controller.deleteSelectionBlocks();

  assert.equal(world.getBlock(1, 1, 1), BlockTypes.AIR, 'the selected cell should be deleted');
  assert.equal(world.getBlock(9, 9, 9), BlockTypes.COLOR_BLOCK, 'the unselected cell should remain');
  assert.equal(manager.connectedSelection, null, 'single-cell selection should reset');
});

test('Delete removes selected entity-component blocks and preserves the rest', () => {
  const scene = new THREE.Scene();
  const contraption = new Contraption(
    1,
    [
      { localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK, color: 0x111111, entityId: 'root' },
      { localX: 1, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK, color: 0x222222, entityId: 'root' },
      { localX: 0, localY: 1, localZ: 0, block: BlockTypes.COLOR_BLOCK, color: 0x333333, entityId: 'root' }
    ],
    new THREE.Vector3(0, 10, 0),
    scene
  );
  const manager = new ContraptionManager(scene, {}, null, null);
  manager.contraptions.push(contraption);
  const controller = makeController({ manager });

  const target = contraption.blocks.find(b => b.localX === 1);
  controller.selectedBlockSelection = { contraption, nodeId: 'root', blocks: [target] };
  controller.selectorLevel = { contraption, nodeId: 'root' };
  contraption.highlightBlocks([target]);

  controller.deleteSelectionBlocks();

  assert.equal(contraption.blocks.length, 2, 'two blocks should remain');
  assert.equal(contraption.blocks.some(b => b.localX === 1), false, 'the selected block should be removed');
  assert.equal(contraption.blocks.some(b => b.localX === 0 && b.localY === 0), true, 'other blocks should remain');
  assert.equal(controller.selectedBlockSelection, null, 'block selection should reset');
  assert.equal(controller.selectorLevel, null);
  assert.equal(contraption.subtreeHighlightBoxes.length, 0, 'selection highlights should clear');
  assert.ok(controller.__toasts.some(m => m.includes('Deleted 1 blocks from [root]')));
});

test('deleting every selected component block removes the empty component', () => {
  const scene = new THREE.Scene();
  const contraption = new Contraption(
    1,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK, color: 0x111111, entityId: 'root' }],
    new THREE.Vector3(0, 10, 0),
    scene
  );
  const manager = new ContraptionManager(scene, {}, null, null);
  manager.contraptions.push(contraption);
  const controller = makeController({ manager });

  controller.selectedBlockSelection = { contraption, nodeId: 'root', blocks: contraption.blocks };
  controller.deleteSelectionBlocks();

  assert.equal(contraption.blocks.length, 0);
  assert.equal(manager.contraptions.includes(contraption), false, 'the empty component should leave the entity list');
});

test('Delete removes the selected root entity through the shared selection API', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null) as any;
  const contraption = manager.registerContraption(new Contraption(
    41,
    [
      { localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK, color: 0x111111, entityId: 'root' },
      { localX: 1, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK, color: 0x222222, entityId: 'root' }
    ],
    new THREE.Vector3(0, 10, 0),
    scene
  )) as any;
  const controller = makeController({ manager });
  let dispatched = 0;
  const baseDispatch = controller.performBasicAction.bind(controller);
  controller.performBasicAction = command => {
    if (command.domain === 'selection' && command.action === 'delete') dispatched++;
    return baseDispatch(command);
  };

  controller.startSubtreeSelection(contraption, 'root');
  assert.equal(controller.selectedSubtree.contraption, contraption);
  controller.deleteSelectionBlocks();

  assert.equal(dispatched, 1, 'keyboard deletion should dispatch the canonical selection command once');
  assert.equal(manager.contraptions.includes(contraption), false);
  assert.equal(controller.selectedSubtree, null);
  assert.equal(controller.selectorLevel, null);
  assert.equal(controller.selectorRange, null);
  assert.ok(controller.__toasts.some(message => message.includes('Deleted entity')));
});

test('Delete with no selection reports a message without crashing', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null);
  const controller = makeController({ manager });
  controller.deleteSelectionBlocks();
  assert.ok(controller.__toasts.some(m => m.includes('Nothing selected')));
});

test('Delete reports an empty world-box selection', () => {
  const scene = new THREE.Scene();
  const world = new World(scene) as any;
  clearRegion(world, 0, 0, 0, 3, 3, 3);
  const manager = new ContraptionManager(scene, {}, null, null);
  const controller = makeController({ manager, world });

  manager.setCornerA({ x: 0, y: 0, z: 0 });
  manager.setCornerB({ x: 3, y: 3, z: 3 });
  controller.deleteSelectionBlocks();
  assert.ok(controller.__toasts.some(m => m.includes('empty')), 'the toast should report no blocks');
  assert.equal(manager.selectionCornerA, null, 'selection should still reset');
});
