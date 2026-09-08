import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerController, SpecialTool } from '../src/engine/controls/PlayerController.ts';

/**
 * The shovel cursor keeps a 1x1x1 standard-cell outline over a 0.125 microblock because
 * the shovel removes every microblock in that standard cell.
 */

function makeController(tool) {
  const controller = Object.create(PlayerController.prototype);
  controller.activeTool = tool;
  controller.currentRaycast = { hit: false };
  return controller;
}

test('shovel focus on a microblock keeps a 1x1x1 standard-cell outline', () => {
  const controller = makeController(SpecialTool.SHOVEL);
  // Microcell (18,3,10) belongs to standard cell (2,0,1).
  controller.currentRaycast = { hit: true, kind: 'micro', microPos: { x: 18, y: 3, z: 10 }, size: 0.125 };
  const cursor = controller.getCursorHighlight();
  assert.deepEqual(cursor.pos, { x: 2, y: 0, z: 1 });
  assert.equal(cursor.size, 1, 'the outline must remain 1x1x1');
});

test('shovel focus on a standard block keeps a 1x1x1 outline', () => {
  const controller = makeController(SpecialTool.SHOVEL);
  controller.currentRaycast = { hit: true, kind: 'standard', hitPos: { x: 3, y: 4, z: 5 }, size: 1 };
  const cursor = controller.getCursorHighlight();
  assert.deepEqual(cursor.pos, { x: 3, y: 4, z: 5 });
  assert.equal(cursor.size, 1);
});

test('other tools keep a 0.2 outline when focused on a microblock', () => {
  const controller = makeController(SpecialTool.BRUSH);
  controller.currentRaycast = {
    hit: true,
    kind: 'micro',
    microPos: { x: 18, y: 3, z: 10 },
    hitPos: { x: 2.4, y: 0.6, z: 1.4 },
    size: 0.125
  };
  const cursor = controller.getCursorHighlight();
  assert.deepEqual(cursor.pos, { x: 2.4, y: 0.6, z: 1.4 });
  assert.equal(cursor.size, 0.125);
});

test('no hit produces no cursor', () => {
  const controller = makeController(SpecialTool.SHOVEL);
  controller.currentRaycast = { hit: false };
  assert.equal(controller.getCursorHighlight(), null);
});

test('a pointer action immediately re-picks and publishes the updated micro cursor', () => {
  const controller = makeController(SpecialTool.SPOON);
  const calls = [];
  controller.sceneRenderer = {
    setCursor(pos, size) {
      calls.push(['cursor', pos, size]);
    },
    setMicroCarvePreview(preview) {
      calls.push(['micro-preview', preview]);
    }
  };
  controller.updateAimRaycast = () => {
    controller.currentRaycast = {
      hit: true,
      kind: 'micro',
      microPos: { x: 13, y: 4, z: 8 },
      hitPos: { x: 2.6, y: 0.8, z: 1.6 },
      size: 0.125
    };
    controller.microCarvePreview = { cellOrigin: { x: 2, y: 0, z: 1 } };
    calls.push(['raycast']);
  };

  controller.refreshAimAfterPointerAction();

  assert.deepEqual(calls, [
    ['raycast'],
    ['cursor', { x: 2.6, y: 0.8, z: 1.6 }, 0.125],
    ['micro-preview', { cellOrigin: { x: 2, y: 0, z: 1 } }]
  ]);
});
