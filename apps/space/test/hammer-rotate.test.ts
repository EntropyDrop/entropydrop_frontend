import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerController, SpecialTool } from '../src/engine/controls/PlayerController.ts';

function makeTestController() {
  const controller: any = Object.create(PlayerController.prototype);
  const items = [
    {
      id: 'test_bs_1',
      name: 'Line 3x1',
      kind: 'blockset',
      blocks: [
        { dx: 0, dy: 0, dz: 0, size: 1, color: '#f2a93b' },
        { dx: 1, dy: 0, dz: 0, size: 1, color: '#f2a93b' },
        { dx: 2, dy: 0, dz: 0, size: 1, color: '#f2a93b' }
      ],
      blockCount: 3
    }
  ];
  controller.inventories = {
    blockset: { selected: 0, items },
    entity: { selected: 0, items: [] },
    colorset: { selected: 0, items: [] }
  };
  controller.activeInventoryCategory = 'blockset';
  controller.selectedInventoryIndex = 0;
  controller.activeTool = SpecialTool.HAMMER;
  controller.sound = { playWrenchClick() {} };
  controller.ui = { showToast() {}, syncInventoryState() {} };
  controller.updateInventoryPlacementPreview = () => {};
  return controller;
}

test('rotateBlocksY90 rotates standard blocks by 90 degrees and preserves integer grid and shape', () => {
  const controller = makeTestController();
  const blocks = [
    { dx: 0, dy: 0, dz: 0, size: 1, color: '#fff' },
    { dx: 1, dy: 0, dz: 0, size: 1, color: '#fff' },
    { dx: 2, dy: 0, dz: 0, size: 1, color: '#fff' }
  ];

  // 1st 90° rotation: from X-aligned (0..2, 0) to Z-aligned (1, -1..1)
  const rot1 = controller.rotateBlocksY90(blocks, 1);
  assert.equal(rot1.length, 3);
  rot1.forEach((b: any) => {
    assert.equal(Number.isInteger(b.dx), true);
    assert.equal(Number.isInteger(b.dz), true);
    assert.equal(b.dy, 0);
  });
  // Span along X is 0, span along Z is 2
  const zVals1 = rot1.map((b: any) => b.dz).sort((a: number, b: number) => a - b);
  assert.deepEqual(zVals1, [-1, 0, 1]);

  // 4 full rotations should return to original positions
  const rot2 = controller.rotateBlocksY90(rot1, 1);
  const rot3 = controller.rotateBlocksY90(rot2, 1);
  const rot4 = controller.rotateBlocksY90(rot3, 1);

  const origX = blocks.map(b => b.dx).sort();
  const finalX = rot4.map((b: any) => b.dx).sort();
  const origZ = blocks.map(b => b.dz).sort();
  const finalZ = rot4.map((b: any) => b.dz).sort();

  assert.deepEqual(finalX, origX);
  assert.deepEqual(finalZ, origZ);
});

test('rotateBlocksY90 rotates micro blocks and keeps exact 0.2 scale alignment', () => {
  const controller = makeTestController();
  const microBlocks = [
    { dx: 0, dy: 0, dz: 0, size: 0.2, color: '#fff' },
    { dx: 0.2, dy: 0, dz: 0, size: 0.2, color: '#fff' },
    { dx: 0.4, dy: 0, dz: 0, size: 0.2, color: '#fff' }
  ];

  const rot1 = controller.rotateBlocksY90(microBlocks, 1);
  rot1.forEach((b: any) => {
    // Must be exact multiple of 0.2
    assert.equal(Math.abs(Math.round(b.dx * 5) - b.dx * 5) < 1e-6, true);
    assert.equal(Math.abs(Math.round(b.dz * 5) - b.dz * 5) < 1e-6, true);
  });
});

test('Hammer right-click rotates the active inventory item 90 degrees', () => {
  const controller = makeTestController();
  const slot = controller.inventories.blockset.items[0];
  assert.equal(slot.blocks[0].dx, 0);
  assert.equal(slot.blocks[2].dx, 2);

  // Right click with Hammer
  controller.handleRightClick(null);

  // Blocks should now be rotated along Z
  const zVals = slot.blocks.map((b: any) => b.dz).sort((a: number, b: number) => a - b);
  assert.deepEqual(zVals, [-1, 0, 1]);
});
