import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlayerController, SpecialTool } from '../src/engine/controls/PlayerController.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';

/**
 * Direct spoon carving subdivides a standard block into 5x5x5 and immediately removes
 * the microcell under the crosshair, without a separate conversion step.
 */

function makeSpoonController(overrides = {}) {
  const controller = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.SPOON;
  controller.hoveredContraptionHit = null;
  controller.currentRaycast = { hit: false };
  controller.selectedColor = 0xff0000;
  controller.particles = { emitBlockBreak() {} };
  controller.sound = { playBlockBreak() {} };
  controller.ui = { showToast() {}, notifyContraptionStructureChanged() {} };
  Object.assign(controller, overrides);
  return controller;
}

test('world: clicking a standard block subdivides it and removes the hit microcell', () => {
  let subdivided = 0;
  let removed = null;
  const controller = makeSpoonController({
    currentRaycast: {
      hit: true,
      kind: 'standard',
      hitPos: { x: 2, y: 2, z: 2 },
      distance: 5,
      normal: { x: 0, y: 0, z: -1 },
      color: 0xffffff,
      // Torus raycasts provide the hit-face entry point directly.
      entry: { x: 2.4, y: 2.3, z: 2.1 }
    },
    physics: {
      // The ray enters cell (2,2,2) from +Z at (2.4,2.3,2.1).
      getEyePosition: () => new THREE.Vector3(2.4, 2.3, 7.1)
    },
    camera: { quaternion: new THREE.Quaternion() },
    world: {
      subdivideBlock: (wx, wy, wz) => {
        subdivided++;
        assert.deepEqual([wx, wy, wz], [2, 2, 2]);
        return 125;
      },
      removeMicroBlock: (mx, my, mz) => {
        removed = { mx, my, mz };
        return true;
      }
    }
  });
  controller.handleLeftClick();
  assert.equal(subdivided, 1, 'the whole standard cell should subdivide');
  assert.ok(removed, 'one microcell should be removed immediately');
  // Entry (2.4,2.3,2.1) maps to microcell (12,11,10), inside [10..14].
  assert.deepEqual(removed, { mx: 12, my: 11, mz: 10 });
});

test('world: a boundary entry point clamps the removed microcell inside the hit cell', () => {
  let removed = null;
  const controller = makeSpoonController({
    currentRaycast: {
      hit: true,
      kind: 'standard',
      hitPos: { x: 0, y: 0, z: 0 },
      distance: 1,
      normal: { x: 0, y: 0, z: -1 },
      color: 0xffffff,
      entry: { x: 0.1, y: 0.1, z: 0.01 }
    },
    physics: {
      // Entry lies extremely close to the z=0 boundary, exercising floating-point error.
      getEyePosition: () => new THREE.Vector3(0.1, 0.1, 1.01)
    },
    camera: { quaternion: new THREE.Quaternion() },
    world: {
      subdivideBlock: () => 125,
      removeMicroBlock: (mx, my, mz) => { removed = { mx, my, mz }; return true; }
    }
  });
  controller.handleLeftClick();
  assert.ok(removed);
  assert.ok(removed.mx >= 0 && removed.mx <= 4, 'mx must stay inside [0..4]');
  assert.ok(removed.my >= 0 && removed.my <= 4);
  assert.ok(removed.mz >= 0 && removed.mz <= 4);
});

test('entity: clicking a standard block subdivides 125 cells and removes one', () => {
  const blocks = [
    { localX: 0, localY: 0, localZ: 0, size: 1, block: BlockTypes.COLOR_BLOCK, color: 0xffffff, entityId: 'root' }
  ];
  const contraption = { blocks, rebuildAfterBlockChange() {} };
  let rebuilt = 0;
  contraption.rebuildAfterBlockChange = () => { rebuilt++; };

  const controller = makeSpoonController({
    hoveredContraptionHit: {
      contraption,
      entityId: 'root',
      cell: { x: 0, y: 0, z: 0 },
      kind: 'standard',
      point: new THREE.Vector3(1.0, 0.2, 0.2),
      // +X hit: adjacent microcell x=1.0 maps back to hit microcell x=0.8 (ix=4).
      placeMicroPos: { localX: 1.0, localY: 0.2, localZ: 0.2 },
      normal: { x: 1, y: 0, z: 0 },
      color: 0xffffff
    }
  });
  controller.handleLeftClick();

  assert.equal(rebuilt, 1, 'the operation should rebuild once');
  assert.equal(contraption.blocks.length, 124, 'subdivide 125 cells and remove one');
  const carvedAway = contraption.blocks.some(b =>
    (b.size || 1) < 1 &&
    Math.abs(b.localX - 0.8) < 1e-3 &&
    Math.abs(b.localY - 0.2) < 1e-3 &&
    Math.abs(b.localZ - 0.2) < 1e-3
  );
  assert.equal(carvedAway, false, 'hit microcell (0.8,0.2,0.2) must be removed');
  const kept = contraption.blocks.filter(b => (b.size || 1) < 1 && Math.abs(b.localX - 0.0) < 1e-3);
  assert.equal(kept.length, 25, 'the other 25 microcells in the ix=0 plane should remain');
});

test('entity: a -X hit removes the opposite boundary microcell', () => {
  const blocks = [
    { localX: 0, localY: 0, localZ: 0, size: 1, block: BlockTypes.COLOR_BLOCK, color: 0xffffff, entityId: 'root' }
  ];
  const contraption = { blocks, rebuildAfterBlockChange() {} };
  const controller = makeSpoonController({
    hoveredContraptionHit: {
      contraption,
      entityId: 'root',
      cell: { x: 0, y: 0, z: 0 },
      kind: 'standard',
      point: new THREE.Vector3(0, 0.2, 0.2),
      // -X hit: adjacent x=-0.2 maps to hit microcell x=0 (ix=0).
      placeMicroPos: { localX: -0.2, localY: 0.2, localZ: 0.2 },
      normal: { x: -1, y: 0, z: 0 },
      color: 0xffffff
    }
  });
  controller.handleLeftClick();
  assert.equal(contraption.blocks.length, 124);
  const carvedAway = contraption.blocks.some(b =>
    (b.size || 1) < 1 &&
    Math.abs(b.localX - 0.0) < 1e-3 &&
    Math.abs(b.localY - 0.2) < 1e-3 &&
    Math.abs(b.localZ - 0.2) < 1e-3
  );
  assert.equal(carvedAway, false, 'hit microcell (0,0.2,0.2) must be removed');
});
