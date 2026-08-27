import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PlayerController, SpecialTool } from '../src/engine/controls/PlayerController.ts';

/**
 * Brush and eyedropper merge: left-click paints and right-click samples.
 */

function makeController(overrides = {}) {
  const controller = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.BRUSH;
  controller.hoveredContraptionHit = null;
  controller.currentRaycast = { hit: false };
  controller.sound = { playWrenchClick() {} };
  controller.ui = { setBuildColor() {}, showToast() {} };
  Object.assign(controller, overrides);
  return controller;
}

test('brush right-click samples color', () => {
  let sampled = false;
  const controller = makeController({
    sampleTargetedColor: () => { sampled = true; }
  });
  controller.handleRightClick(null);
  assert.equal(sampled, true, 'brush right-click must sample color');
});

test('brush left-click paints', () => {
  let painted = false;
  const controller = makeController({
    paintTargetedBlock: () => { painted = true; }
  });
  controller.handleLeftClick();
  assert.equal(painted, true, 'brush left-click must paint');
});

test('sampling updates the current color', () => {
  const picked = [];
  const controller = makeController({
    currentRaycast: { hit: true, color: 0x2ed573 },
    ui: {
      setBuildColor: color => picked.push(color),
      showToast() {}
    },
    sampleTargetedColor() {
      if (this.currentRaycast && this.currentRaycast.hit && this.currentRaycast.color !== undefined) {
        this.ui.setBuildColor(this.currentRaycast.color);
      }
    }
  });
  controller.handleRightClick(null);
  assert.deepEqual(picked, [0x2ed573], 'right-click sampling should make the target color current');
});

test('the six-tool hotbar includes Wrench and Hammer but no Pipette', () => {
  // UIManager removed Pipette from hotbarSlots; keep the SpecialTool constant for compatibility.
  assert.equal(SpecialTool.PIPETTE, 'pipette');
  const source = readFileSync(new URL('../src/ui/UIManager.ts', import.meta.url), 'utf8');
  const hotbarDefinition = source.slice(source.indexOf('this.hotbarSlots = ['), source.indexOf('this.selectedHotbarIndex'));
  assert.match(hotbarDefinition, /SpecialTool\.WRENCH/);
  assert.match(hotbarDefinition, /SpecialTool\.HAMMER/);
  assert.match(hotbarDefinition, /SpecialTool\.SELECTOR/);
  assert.doesNotMatch(hotbarDefinition, /SpecialTool\.PIPETTE/);
  assert.match(source, /const showInventory = slot\?\.value === SpecialTool\.HAMMER/);
});
