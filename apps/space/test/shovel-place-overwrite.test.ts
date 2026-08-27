import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/engine/voxel/World.ts';
import { PlayerController, SpecialTool } from '../src/engine/controls/PlayerController.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';

/**
 * Shovel placement never overwrites a subdivided standard cell. A focused microblock
 * targets the adjacent standard cell along the hit normal; subdivided targets reject placement.
 */

function makeShovelController(overrides = {}) {
  const controller = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.SHOVEL;
  controller.hoveredContraptionHit = null;
  controller.currentRaycast = { hit: false };
  controller.canPlaceStandardAt = () => true;
  controller.selectedColor = 0xff0000;
  controller.sound = { playBlockPlace() {} };
  controller.ui = { showToast() {}, notifyContraptionStructureChanged() {} };
  Object.assign(controller, overrides);
  return controller;
}

test('world placement beside a focused microblock targets the adjacent standard cell', () => {
  let placed = null;
  const controller = makeShovelController({
    // Focused microcell (12,3,7) belongs to standard cell (2,0,1), hit on +X.
    currentRaycast: {
      hit: true,
      kind: 'micro',
      microPos: { x: 12, y: 3, z: 7 },
      normal: { x: 1, y: 0, z: 0 }
    },
    world: {
      hasMicroInStandardCell: () => false,
      setBlock: (wx, wy, wz, blockType, updateMesh, color) => {
        placed = { wx, wy, wz, blockType, color };
      }
    }
  });
  controller.handleRightClick(null);
  assert.ok(placed, 'placement should occur in the adjacent cell');
  assert.deepEqual([placed.wx, placed.wy, placed.wz], [3, 0, 1], 'target should be the +X neighbor of (2,0,1)');
  assert.equal(placed.blockType, BlockTypes.COLOR_BLOCK);
  assert.equal(placed.color, 0xff0000);
});

test('world placement rejects a subdivided target cell', () => {
  let placed = false;
  const controller = makeShovelController({
    currentRaycast: {
      hit: true,
      kind: 'micro',
      microPos: { x: 12, y: 3, z: 7 },
      normal: { x: 0, y: 1, z: 0 }
    },
    world: {
      hasMicroInStandardCell: () => true,
      setBlock: () => { placed = true; }
    }
  });
  controller.handleRightClick(null);
  assert.equal(placed, false, 'placement must not overwrite a subdivided target');
});

test('world placement beside a standard block still targets the adjacent cell', () => {
  let placed = null;
  const controller = makeShovelController({
    currentRaycast: { hit: true, kind: 'standard', placePos: { x: 5, y: 6, z: 7 } },
    world: {
      hasMicroInStandardCell: () => false,
      setBlock: (wx, wy, wz) => { placed = { wx, wy, wz }; }
    }
  });
  controller.handleRightClick(null);
  assert.deepEqual([placed.wx, placed.wy, placed.wz], [5, 6, 7]);
});

test('entity placement beside a focused microblock preserves the subdivided cell', () => {
  const microBlock = { localX: 0.4, localY: 0.2, localZ: 0.2, size: 0.2, block: BlockTypes.COLOR_BLOCK };
  const contraption = { blocks: [microBlock], rebuildAfterBlockChange() {} };
  let rebuilt = 0;
  contraption.rebuildAfterBlockChange = () => { rebuilt++; };
  const controller = makeShovelController({
    hoveredContraptionHit: {
      contraption,
      entityId: 'root',
      // Focused microblock (0.4,0.2,0.2) is in standard cell (0,0,0), hit on +X.
      cell: { x: 0, y: 0, z: 0 },
      normal: { x: 1, y: 0, z: 0 },
      kind: 'micro'
    }
  });
  controller.handleRightClick(null);
  assert.ok(contraption.blocks.includes(microBlock), 'the source microblock must remain unchanged');
  const placed = contraption.blocks.find(b => b.size === 1 && b.localX === 1 && b.localY === 0 && b.localZ === 0) as any;
  assert.ok(placed, 'a standard block should be placed in the +X neighbor (1,0,0)');
  assert.equal(placed.color, 0xff0000);
  assert.equal(rebuilt, 1, 'placement should trigger one rebuild');
});

test('entity placement rejects a subdivided target cell', () => {
  const microBlock = { localX: 0.4, localY: 0.2, localZ: 0.2, size: 0.2, block: BlockTypes.COLOR_BLOCK };
  const microInTarget = { localX: 1.4, localY: 0.2, localZ: 0.2, size: 0.2, block: BlockTypes.COLOR_BLOCK };
  const contraption = { blocks: [microBlock, microInTarget], rebuildAfterBlockChange() {} };
  let rebuilt = 0;
  contraption.rebuildAfterBlockChange = () => { rebuilt++; };
  const controller = makeShovelController({
    hoveredContraptionHit: {
      contraption,
      entityId: 'root',
      cell: { x: 0, y: 0, z: 0 },
      normal: { x: 1, y: 0, z: 0 }, // Adjacent cell (1,0,0) is also subdivided.
      kind: 'micro'
    }
  });
  controller.handleRightClick(null);
  assert.equal(rebuilt, 0, 'rejected placement must not rebuild');
  assert.equal(contraption.blocks.length, 2, 'both subdivided cells must remain unchanged');
  assert.ok(contraption.blocks.includes(microBlock));
  assert.ok(contraption.blocks.includes(microInTarget));
});

test('entity placement beside a standard block still targets the adjacent cell', () => {
  const contraption = { blocks: [], rebuildAfterBlockChange() {} };
  const controller = makeShovelController({
    hoveredContraptionHit: {
      contraption,
      entityId: 'root',
      kind: 'standard',
      placeCell: { x: 3, y: 0, z: 0 }
    }
  });
  controller.handleRightClick(null);
  assert.equal(contraption.blocks.length, 1);
  assert.equal(contraption.blocks[0].size, 1);
  assert.deepEqual(
    [contraption.blocks[0].localX, contraption.blocks[0].localY, contraption.blocks[0].localZ],
    [3, 0, 0]
  );
});

test('World.hasMicroInStandardCell detects microblocks in a standard cell', () => {
  const world = new World(new THREE.Scene());
  assert.equal(world.hasMicroInStandardCell(1, 2, 3), false);
  assert.equal(world.setMicroBlock(7, 11, 16), true); // Belongs to standard cell (1,2,3).
  assert.equal(world.hasMicroInStandardCell(1, 2, 3), true);
  assert.equal(world.hasMicroInStandardCell(0, 2, 3), false);
});
