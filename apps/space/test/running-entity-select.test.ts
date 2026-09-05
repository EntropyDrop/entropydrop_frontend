import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ActionDomain } from '@entropydrop/space-engine/actions/BasicActions.ts';
import { Contraption } from '@entropydrop/space-engine/contraption/Contraption.ts';
import { ContraptionManager } from '@entropydrop/space-engine/contraption/ContraptionManager.ts';
import { PlayerController, SpecialTool } from '../src/engine/controls/PlayerController.ts';
import { BlockTypes } from '@entropydrop/space-engine/voxel/BlockTypes.ts';

/**
 * Running entities can be selected only as a whole. Level switching and subregion
 * boxes are disabled, while stopped entities retain normal behavior.
 */

function makeEntityWithChildren() {
  const scene = new THREE.Scene();
  const contraption = new Contraption(
    1,
    [
      { localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK },
      { localX: 0, localY: 1, localZ: 0, block: BlockTypes.COLOR_BLOCK },
      { localX: 0, localY: 2, localZ: 0, block: BlockTypes.COLOR_BLOCK },
      { localX: 2, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }
    ],
    new THREE.Vector3(0, 10, 0),
    scene,
    {
      childEntities: [
        { id: 'arm', parentId: 'root', kind: 'child', pivot: [0.5, 0.5, 0.5], blockKeys: [['0', '1', '0']] },
        { id: 'hand', parentId: 'arm', kind: 'child', pivot: [0.5, 1.5, 0.5], blockKeys: [['0', '2', '0']] },
        { id: 'wing', parentId: 'root', kind: 'child', pivot: [1.5, 0.5, 0.5], blockKeys: [['2', '0', '0']] }
      ]
    }
  );
  return { contraption, scene };
}

function makeSelectorController(overrides: any = {}) {
  const controller: any = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.SELECTOR;
  controller.selectedSubtree = null;
  controller.selectedBlockSelection = null;
  controller.selectorLevel = null;
  controller.selectorRange = null;
  controller.inventorySlots = new Array(8).fill(null);
  controller.selectedInventoryIndex = 0;
  controller.contraptions = overrides.manager || null;
  controller.keys = {};
  const toasts: string[] = [];
  controller.ui = {
    showToast: m => toasts.push(m),
    renderInventoryBar() {}
  };
  Object.assign(controller, overrides);
  controller.__toasts = toasts;
  return controller;
}

function clickEntity(controller, contraption, entityId, cell, point, e = null) {
  controller.hoveredContraptionHit = { contraption, entityId, cell, point };
  controller.handleLeftClick(e);
}

test('clicking a running entity selects root and all descendants without box mode', () => {
  const { contraption } = makeEntityWithChildren();
  const controller = makeSelectorController();
  contraption.scriptStatus = 'running';

  // Clicking an arm block selects the whole entity rather than the arm level.
  clickEntity(controller, contraption, 'arm', { x: 0, y: 1, z: 0 }, new THREE.Vector3(0.5, 11.5, 0.5));

  assert.equal(controller.selectedSubtree.rootId, 'root', 'whole selection should be rooted at root');
  assert.deepEqual(
    [...controller.selectedSubtree.nodeIds].sort(),
    ['arm', 'hand', 'root', 'wing'],
    'selection should include every descendant'
  );
  assert.equal(controller.selectorRange, null, 'box mode should remain disabled');
  assert.equal(controller.selectorLevel, null, 'no component level should be locked');
  assert.ok(controller.__toasts.some(m => m.includes('whole entity selected')));
});

test('repeat and Shift-click on a running entity never switch level or enter box mode', () => {
  const { contraption } = makeEntityWithChildren();
  const controller = makeSelectorController();
  contraption.scriptStatus = 'running';

  clickEntity(controller, contraption, 'arm', { x: 0, y: 1, z: 0 }, new THREE.Vector3(0.5, 11.5, 0.5));
  // A second click would normally enter arm-level box mode.
  clickEntity(controller, contraption, 'arm', { x: 0, y: 1, z: 0 }, new THREE.Vector3(0.5, 11.5, 0.5));
  assert.equal(controller.selectorRange, null, 'box mode should remain disabled');
  assert.equal(controller.selectedSubtree.rootId, 'root');
  assert.equal(controller.selectedSubtree.nodeIds.size, 4);

  // Shift-clicking hand would normally switch levels.
  clickEntity(controller, contraption, 'hand', { x: 0, y: 2, z: 0 }, new THREE.Vector3(0.5, 12.5, 0.5), { shiftKey: true });
  assert.equal(controller.selectedSubtree.rootId, 'root', 'Shift-click should not switch level');
  assert.equal(controller.selectorRange, null);
});

test('whole selection replaces an in-progress box on a running entity', () => {
  const { contraption } = makeEntityWithChildren();
  const controller = makeSelectorController();
  contraption.scriptStatus = 'running';
  // Simulate arm-level box mode with point 1 already set.
  controller.selectedSubtree = { contraption, rootId: 'arm', nodeIds: new Set(['arm', 'hand']) };
  controller.selectorLevel = { contraption, nodeId: 'arm' };
  controller.selectorRange = {
    contraption,
    nodeId: 'arm',
    pointA: { x: 0, y: 0, z: 0 },
    pointB: null
  };

  clickEntity(controller, contraption, 'arm', { x: 0, y: 1, z: 0 }, new THREE.Vector3(0.5, 11.5, 0.5));

  assert.equal(controller.selectorRange, null, 'stale box progress should be discarded');
  assert.equal(controller.selectorLevel, null);
  assert.equal(controller.selectedSubtree.rootId, 'root', 'selection should switch to the whole entity');
});

test('a stopped entity still allows arm-subtree selection and box mode', () => {
  const { contraption } = makeEntityWithChildren();
  const controller = makeSelectorController();
  contraption.stopAllNodeScripts();
  clickEntity(controller, contraption, 'arm', { x: 0, y: 1, z: 0 }, new THREE.Vector3(0.5, 11.5, 0.5));
  assert.equal(controller.selectedSubtree.rootId, 'arm', 'level selection should work normally');
  assert.ok(controller.selectorRange, 'box mode should activate');
  assert.equal(controller.selectorRange.nodeId, 'arm');
});

test('shared selection API rejects entity internals until stopped but keeps whole-root selection', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null) as any;
  const { contraption } = makeEntityWithChildren();
  manager.registerContraption(contraption);
  contraption.scriptStatus = 'running';

  const childResult = manager.scriptSelectionApi.entity(contraption.publicId, 'arm');
  assert.deepEqual(childResult, { ok: false, selected: 0, reason: 'entity_not_stopped' });

  const boxResult = manager.scriptSelectionApi.entityBox(
    contraption.publicId,
    'arm',
    [-1, -1, -1],
    [1, 1, 1]
  );
  assert.equal(boxResult.ok, false);
  assert.equal(boxResult.reason, 'entity_not_stopped');

  const rootResult = manager.scriptSelectionApi.entity(contraption.publicId, 'root');
  assert.equal(rootResult.ok, true, 'whole-root selection must remain available while running');
  assert.equal(manager.entitySelection.rootId, 'root');

  contraption.stopAllNodeScripts();
  const stoppedBox = manager.scriptSelectionApi.entityBox(
    contraption.publicId,
    'arm',
    [-1, -1, -1],
    [1, 1, 1]
  );
  assert.equal(stoppedBox.ok, true);
  assert.ok(stoppedBox.selected > 0);
});

test('starting an entity invalidates an internal selection and stale destructive calls are gated', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null) as any;
  const { contraption } = makeEntityWithChildren();
  manager.registerContraption(contraption);
  contraption.setScript('self.state.ticks = (self.state.ticks || 0) + 1;');
  contraption.stopAllNodeScripts();

  const selected = manager.scriptSelectionApi.entityBox(
    contraption.publicId,
    'arm',
    [-1, -1, -1],
    [1, 1, 1]
  );
  assert.equal(selected.ok, true);
  assert.equal(manager.entitySelection.kind, 'entity-blocks');
  manager.selectionHost = {
    selectedBlockSelection: { contraption, nodeId: 'arm', blocks: [...manager.entitySelection.blocks] },
    selectedSubtree: { contraption, rootId: 'arm', nodeIds: new Set(['arm', 'hand']) },
    selectorLevel: { contraption, nodeId: 'arm' },
    selectorRange: { contraption, nodeId: 'arm', pointA: null, pointB: null }
  };

  const started = manager.performBasicAction({
    domain: ActionDomain.ENTITY,
    action: 'start-scripts',
    target: { contraption }
  });
  assert.equal(started.ok, true);
  assert.equal(manager.entitySelection, null, 'starting must clear construction-grid selections');
  assert.equal(manager.selectionHost.selectedBlockSelection, null, 'UI-side internal selection must clear too');
  assert.equal(manager.selectionHost.selectedSubtree, null);
  assert.equal(manager.selectionHost.selectorLevel, null);
  assert.equal(manager.selectionHost.selectorRange, null);

  const armBlocks = contraption.blocks.filter(block => (block.entityId || 'root') === 'arm');
  manager.entitySelection = { kind: 'entity-blocks', contraption, nodeId: 'arm', blocks: armBlocks };
  const before = contraption.blocks.length;
  const deleted = manager.scriptSelectionApi.delete();
  assert.equal(deleted.ok, false);
  assert.equal(deleted.reason, 'entity_not_stopped');
  assert.equal(contraption.blocks.length, before);
  assert.equal(manager.entitySelection, null, 'a rejected stale selection is discarded');
});

test('clicking a running entity completes an active world box instead of selecting the entity', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null);
  const { contraption } = makeEntityWithChildren();
  manager.contraptions.push(contraption);
  const controller = makeSelectorController({ manager });
  contraption.scriptStatus = 'running';

  // First world click sets cornerA.
  controller.currentRaycast = { hit: true, hitPos: { x: 0, y: 10, z: 0 } };
  controller.handleLeftClick();
  assert.ok(manager.selectionCornerA, 'point 1 should be set');

  // The second click on a running entity confirms the world box.
  clickEntity(controller, contraption, 'root', { x: 0, y: 0, z: 0 }, new THREE.Vector3(0.8, 10.8, 0.7));
  assert.deepEqual(manager.selectionCornerB, { x: 0, y: 10, z: 0 }, 'entity click should confirm the box');
  assert.equal(controller.selectedSubtree, null, 'whole-entity selection should not activate');
  assert.ok(controller.__toasts.some(m => m.includes('[2/2]')), 'toast should report box completion');
});

test('R copies a whole running entity into an entity slot', () => {
  const { contraption } = makeEntityWithChildren();
  const controller = makeSelectorController();
  contraption.scriptStatus = 'running';
  clickEntity(controller, contraption, 'arm', { x: 0, y: 1, z: 0 }, new THREE.Vector3(0.5, 11.5, 0.5));

  controller.copySelectionToInventory(); // R-key path.
  const slot = controller.inventorySlots[0];
  assert.ok(slot, 'whole entity should be copied into the slot');
  assert.equal(slot.blockCount, 4, 'the slot should include every entity block');
  assert.notEqual(slot.kind, 'blockset', 'R should remain entity copy');
});
