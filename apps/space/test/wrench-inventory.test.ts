import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Contraption, ContraptionMode } from '../src/engine/contraption/Contraption.ts';
import { ContraptionManager } from '../src/engine/contraption/ContraptionManager.ts';
import { PlayerController, SpecialTool } from '../src/engine/controls/PlayerController.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';

/**
 * Selector copies entity/component selections; Hammer builds inventory items;
 * Wrench starts or stops pointed entities.
 */

function makeContraptionWithChildren() {
  const scene = new THREE.Scene();
  const contraption = new Contraption(
    1,
    [
      { localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK },
      { localX: 0, localY: 1, localZ: 0, block: BlockTypes.COLOR_BLOCK },
      { localX: 2, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }
    ],
    new THREE.Vector3(10, 20, 10),
    scene,
    {
      childEntities: [
        { id: 'arm', parentId: 'root', kind: 'child', pivot: [0.5, 0.5, 0.5], blockKeys: [['0', '1', '0']] },
        { id: 'hand', parentId: 'arm', kind: 'child', pivot: [0.5, 1.5, 0.5], blockKeys: [['2', '0', '0']] }
      ]
    }
  );
  contraption.setNodeScript('root', 'self.applyForce([0, 100, 0]);');
  contraption.setNodeScript('arm', 'self.setLocalSpin([0, 1, 0], 60);');
  contraption.setNodeScriptEnabled('arm', false);
  return contraption;
}

test('serializing the root subtree rebuilds identical structure, scripts, and toggles', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null);
  const original = makeContraptionWithChildren();

  const slot = original.serializeSubtree('root');
  assert.equal(slot.blockCount, 3);
  assert.equal(slot.nodeCount, 3);
  assert.equal(slot.scripts.length, 2);
  assert.equal(slot.enabled.length, 3);
  assert.equal(slot.mode, ContraptionMode.FREE_PHYSICS);

  const copy = manager.buildFromSlot(slot, new THREE.Vector3(30, 40, 30));
  assert.ok(copy);
  assert.notEqual(copy.publicId, original.publicId, 'an inventory-built entity must receive a fresh random id');
  assert.equal(copy.blocks.length, 3, 'block count should match');
  assert.equal(copy.getEntityNode('arm').parentId, 'root');
  assert.equal(copy.getEntityNode('hand').parentId, 'arm', 'component hierarchy should remain');
  assert.equal(copy.getNodeScript('arm'), 'self.setLocalSpin([0, 1, 0], 60);', 'script code should match');
  assert.equal(copy.isNodeScriptEnabled('arm'), false, 'enabled state should match');
  assert.equal(copy.isNodeScriptEnabled('hand'), true);
  // The source entity remains unchanged.
  assert.equal(original.blocks.length, 3);
  assert.equal(manager.contraptions.includes(copy), true, 'the new entity should be registered');
});

test('rebuilding a serialized child subtree remaps its root to the new root', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null);
  const original = makeContraptionWithChildren();

  const slot = original.serializeSubtree('arm');
  assert.equal(slot.blockCount, 2, 'arm and hand should contribute two blocks');
  assert.equal(slot.nodeCount, 2);
  assert.equal(slot.rootId, 'arm');

  const copy = manager.buildFromSlot(slot, new THREE.Vector3(0, 0, 0));
  assert.ok(copy);
  assert.equal(copy.blocks.length, 2);
  const armBlocks = copy.blocks.filter(b => b.entityId === 'root');
  assert.equal(armBlocks.length, 1, 'the original arm block should belong to the new root');
  const handBlocks = copy.blocks.filter(b => b.entityId === 'hand');
  assert.equal(handBlocks.length, 1, 'the hand component should remain');
  assert.equal(copy.getEntityNode('hand').parentId, 'root', 'hand should attach to the new root');
  assert.equal(copy.getNodeScript('root'), 'self.setLocalSpin([0, 1, 0], 60);', 'arm script should map to root');
  assert.equal(copy.isNodeScriptEnabled('root'), false, 'arm enabled state should map to root');
});

test('recursive selection collects a component and all descendants', () => {
  const controller = Object.create(PlayerController.prototype);
  const contraption = makeContraptionWithChildren();

  const armSubtree = controller.collectSubtreeIds(contraption, 'arm');
  assert.deepEqual([...armSubtree].sort(), ['arm', 'hand']);

  const rootSubtree = controller.collectSubtreeIds(contraption, 'root');
  assert.deepEqual([...rootSubtree].sort(), ['arm', 'hand', 'root']);
});

test('selector copy switches to Hammer and Hammer left-click builds a new entity', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null);
  const original = makeContraptionWithChildren();
  manager.contraptions.push(original);
  // Running entities allow only whole selection; stop scripts before selecting a subregion.
  original.stopAllNodeScripts();
  assert.equal(original.scriptStatus, 'stopped');

  const controller = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.SELECTOR;
  controller.contraptions = manager;
  controller.inventorySlots = new Array(8).fill(null);
  controller.selectedInventoryIndex = 0;
  controller.selectedSubtree = null;
  controller.keys = {};
  controller.sound = { playBlockPlace() {} };
  controller.ui = { showToast() {}, renderInventoryBar() {} };
  controller.hoveredContraptionHit = {
    contraption: original,
    entityId: 'hand',
    cell: { x: 2, y: 0, z: 0 }
  };

  // 1. Left-click the hand subtree.
  controller.handleLeftClick();
  assert.equal(controller.selectedSubtree.rootId, 'hand');
  assert.deepEqual([...controller.selectedSubtree.nodeIds].sort(), ['hand']);

  // 2. Copy with R to slot 0.
  controller.copySelectionToInventory();
  assert.ok(controller.inventorySlots[0]);
  assert.equal(controller.inventorySlots[0].blockCount, 1);
  assert.equal(controller.activeTool, SpecialTool.HAMMER, 'successful copy should switch to Hammer');

  // 3. Build with Hammer left-click.
  controller.currentRaycast = {
    hit: true,
    hitPos: { x: 5, y: 6, z: 7 },
    normal: { x: 0, y: 1, z: 0 }
  };
  const before = manager.contraptions.length;
  controller.handleLeftClick();
  assert.equal(manager.contraptions.length, before + 1, 'Hammer build should create a new entity');
  const pasted = manager.contraptions[manager.contraptions.length - 1];
  assert.equal(pasted.blocks.length, 1);
  // Entity position equals placement origin plus localCenter; the collider bottom is one cell beyond the hit face.
  const pastedBox = pasted.getCollisionWorldAABBs()[0];
  assert.ok(Math.abs(pastedBox.minY - 7) < 1e-6, 'paste position should be one cell beyond the hit face at y=7');
});

test('pasting an empty slot reports a message and creates no entity', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null);
  const controller = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.HAMMER;
  controller.contraptions = manager;
  controller.inventorySlots = new Array(8).fill(null);
  controller.selectedInventoryIndex = 0;
  const toasts = [];
  controller.ui = { showToast: m => toasts.push(m) };
  controller.currentRaycast = { hit: true, hitPos: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } };

  controller.handleLeftClick();
  assert.equal(manager.contraptions.length, 0);
  assert.ok(toasts.some(m => m.includes('empty')));
});

test('Selector right-click never builds inventory contents', () => {
  const controller = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.SELECTOR;
  let built = 0;
  controller.pasteInventorySlot = () => { built++; };

  controller.handleRightClick();

  assert.equal(built, 0);
});

test('Wrench right-click toggles start and stop through the shared action API', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null);
  const entity = makeContraptionWithChildren();
  manager.registerContraption(entity);
  assert.equal(entity.scriptStatus, 'running');

  const controller = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.WRENCH;
  controller.contraptions = manager;
  controller.world = {};
  controller.hoveredContraption = entity;
  controller.hoveredContraptionHit = { contraption: entity, entityId: 'root' };
  controller.sound = { playWrenchClick() {} };
  controller.ui = { showToast() {} };
  controller.performBasicAction = PlayerController.prototype.performBasicAction.bind(controller);

  entity.getComponentState('root').preserved = 42;
  controller.handleRightClick();
  assert.equal(entity.isNodeScriptEnabled('root'), false);
  assert.equal(entity.isNodeScriptEnabled('arm'), false);
  assert.equal(entity.getComponentState('root').preserved, undefined, 'stop must reset state');
  assert.equal(entity.scriptStatus, 'stopped', 'right click stops running entity');

  controller.handleRightClick();
  assert.equal(entity.isNodeScriptEnabled('root'), true);
  assert.equal(entity.isNodeScriptEnabled('arm'), true);
  assert.equal(entity.scriptStatus, 'running', 'right click restarts stopped entity');
});

test('Wrench left-click and drag applies physical tether force at targeted entity', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null);
  const entity = makeContraptionWithChildren();
  manager.registerContraption(entity);

  const controller = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.WRENCH;
  controller.contraptions = manager;
  controller.world = {};
  controller.hoveredContraption = entity;
  controller.hoveredContraptionHit = { contraption: entity, entityId: 'root', point: new THREE.Vector3(0, 0, 5) };
  controller.sound = { playWrenchClick() {} };
  controller.ui = { showToast() {} };
  controller.camera = new THREE.PerspectiveCamera();
  controller.camera.position.set(0, 0, 0);
  controller.camera.rotation.set(0, 0, 0, 'YXZ');
  controller.physics = {
    update() {},
    getEyePosition() { return new THREE.Vector3(0, 0, 0); },
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3()
  };
  controller.updateCameraPosition = () => {};

  controller.handleLeftClick();

  assert.ok(controller.wrenchForceDrag, 'wrench left-click must initiate tether drag');
  assert.equal(controller.wrenchForceDrag.contraption, entity);
  assert.equal(controller.wrenchForceDrag.targetDistance, 5);

  controller.camera.position.set(0, 5, 0);
  controller.update(1 / 60);

  assert.ok(entity.appliedForces.length() > 0, 'force must be applied to entity during tether drag');
});

test('cycling inventory slots wraps around both directions', () => {
  const controller = Object.create(PlayerController.prototype);
  controller.inventorySlots = new Array(8).fill(null);
  controller.selectedInventoryIndex = 0;
  controller.ui = { showToast() {}, renderInventoryBar() {} };

  controller.cycleInventorySlot(1);
  assert.equal(controller.selectedInventoryIndex, 1);
  controller.cycleInventorySlot(1);
  assert.equal(controller.selectedInventoryIndex, 2);
  controller.cycleInventorySlot(-1);
  assert.equal(controller.selectedInventoryIndex, 1);
  controller.cycleInventorySlot(-1);
  assert.equal(controller.selectedInventoryIndex, 0);
});

test('Shift+click on entity micro-blocks toggles and multi-selects without selecting whole entity', () => {
  const scene = new THREE.Scene();
  const worldMock = {
    setBlock() {},
    setMicroBlock() {},
    worldToChunkCoords() { return { cx: 0, cz: 0 }; },
    getChunk() { return { isDirty: false }; },
    dirtyChunks: new Set()
  };
  const manager = new ContraptionManager(scene, worldMock, {}, null);
  const entity = makeContraptionWithChildren();
  entity.stopAllNodeScripts(); // stopped state
  manager.registerContraption(entity);

  const blockA = entity.blocks[0];
  const blockB = entity.blocks[1] || { localX: 1, localY: 0, localZ: 0, size: 0.2, color: 0xff0000, entityId: 'root' };
  if (!entity.blocks[1]) entity.blocks.push(blockB);

  const controller = Object.create(PlayerController.prototype);
  controller.contraptions = manager;
  controller.world = worldMock;
  controller.ui = { showToast() {} };
  controller.selectedSubtree = null;
  controller.selectedBlockSelection = null;
  controller.selectorLevel = null;
  controller.selectorRange = null;
  controller.performBasicAction = PlayerController.prototype.performBasicAction.bind(controller);
  controller.canEditEntityInternals = PlayerController.prototype.canEditEntityInternals.bind(controller);
  controller.selectorOnEntityClick = PlayerController.prototype.selectorOnEntityClick.bind(controller);

  // 1. Shift+click first block: adds blockA to selection
  controller.selectorOnEntityClick({
    contraption: entity,
    entityId: 'root',
    block: blockA,
    point: new THREE.Vector3(0, 0, 0)
  }, { shiftKey: true });

  assert.equal(controller.selectedSubtree, null, 'must not select entire subtree');
  assert.ok(controller.selectedBlockSelection, 'must create selectedBlockSelection');
  assert.equal(controller.selectedBlockSelection.blocks.length, 1);
  assert.equal(controller.selectedBlockSelection.blocks[0], blockA);

  // 2. Shift+click second block: appends blockB to selection (multi-select)
  controller.selectorOnEntityClick({
    contraption: entity,
    entityId: 'root',
    block: blockB,
    point: new THREE.Vector3(1, 0, 0)
  }, { shiftKey: true });

  assert.equal(controller.selectedBlockSelection.blocks.length, 2);
  assert.ok(controller.selectedBlockSelection.blocks.includes(blockA));
  assert.ok(controller.selectedBlockSelection.blocks.includes(blockB));

  // 3. Shift+click first block again: toggles blockA out of selection
  controller.selectorOnEntityClick({
    contraption: entity,
    entityId: 'root',
    block: blockA,
    point: new THREE.Vector3(0, 0, 0)
  }, { shiftKey: true });

  assert.equal(controller.selectedBlockSelection.blocks.length, 1);
  assert.equal(controller.selectedBlockSelection.blocks[0], blockB);
});
