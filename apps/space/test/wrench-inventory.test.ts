import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Contraption } from '../src/engine/contraption/Contraption.ts';
import { ContraptionManager } from '../src/engine/contraption/ContraptionManager.ts';
import {
  PlayerController,
  SpecialTool
} from '../src/engine/controls/PlayerController.ts';
import { ContraptionPhysics } from '../src/engine/physics/ContraptionPhysics.ts';
import { SceneRenderer } from '../src/engine/render/SceneRenderer.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';
import {
  bendPoint,
  unbendDirection,
  TORUS_SPAWN_X,
  TORUS_SPAWN_Z
} from '../src/engine/torus/TorusWorld.ts';

/**
 * Selector copies entity/component selections; Hammer builds inventory items;
 * Wrench grabs dynamic bodies and starts or stops pointed entities.
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
      rootComponentId: 'root',
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

test('rebuilding a serialized child subtree preserves its component id as the new root', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null);
  const original = makeContraptionWithChildren();

  const slot = original.serializeSubtree('arm');
  assert.equal(slot.blockCount, 2, 'arm and hand should contribute two blocks');
  assert.equal(slot.nodeCount, 2);
  assert.equal(slot.rootComponentId, 'arm', 'the independent subtree keeps its original root id');
  assert.deepEqual(slot.childEntities.map(child => child.id), ['hand']);

  const copy = manager.buildFromSlot(slot, new THREE.Vector3(0, 0, 0));
  assert.ok(copy);
  assert.equal(copy.blocks.length, 2);
  const armBlocks = copy.blocks.filter(b => b.entityId === 'arm');
  assert.equal(armBlocks.length, 1, 'the original arm block should remain owned by arm');
  const handBlocks = copy.blocks.filter(b => b.entityId === 'hand');
  assert.equal(handBlocks.length, 1, 'the hand component should remain');
  assert.equal(copy.getEntityNode('hand').parentId, 'arm', 'hand should attach to the preserved subtree root');
  assert.equal(copy.getNodeScript('arm'), 'self.setLocalSpin([0, 1, 0], 60);', 'arm script should keep its id');
  assert.equal(copy.isNodeScriptEnabled('arm'), false, 'arm enabled state should keep its id');
});

test('serializing several subtrees attaches them below one explicit root', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null);
  const original = new Contraption(
    2,
    [
      { localX: 1, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK, entityId: 'arm' },
      { localX: -1, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK, entityId: 'wing' }
    ],
    new THREE.Vector3(),
    scene,
    {
      rootComponentId: 'root',
      childEntities: [
        { id: 'arm', parentId: 'root', collisionEnabled: false },
        { id: 'wing', parentId: 'root' }
      ]
    }
  );

  const slot = original.serializeSubtrees(['arm', 'wing']);

  assert.equal(slot.rootComponentId, 'selection', 'the merged selection has one explicit synthetic root');
  assert.equal(slot.nodeCount, 3);
  assert.deepEqual(slot.childEntities.map(child => [child.id, child.parentId]), [
    ['arm', 'selection'],
    ['wing', 'selection']
  ]);
  const copy = manager.buildFromSlot(slot, new THREE.Vector3());
  assert.ok(copy);
  assert.equal(copy.getEntityNode('arm').parentId, 'selection');
  assert.equal(copy.getEntityNode('wing').parentId, 'selection');
  assert.equal(copy.isNodeCollisionEnabled('arm'), false);
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
  entity.childDefinitions.get('arm').collisionEnabled = false;
  assert.equal(entity.isNodeCollisionEnabled('arm'), false);
  controller.handleRightClick();
  assert.equal(entity.isNodeScriptEnabled('root'), false);
  assert.equal(entity.isNodeScriptEnabled('arm'), false);
  assert.equal(entity.getComponentState('root').preserved, undefined, 'stop must reset state');
  assert.equal(entity.scriptStatus, 'stopped', 'right click stops running entity');
  assert.equal(entity.isNodeCollisionEnabled('arm'), false,
    'Stop restores the authored collision default instead of forcing every component on');

  controller.handleRightClick();
  assert.equal(entity.isNodeScriptEnabled('root'), true);
  assert.equal(entity.isNodeScriptEnabled('arm'), true);
  assert.equal(entity.scriptStatus, 'running', 'right click restarts stopped entity');
});

test('Wrench hold grabs the exact dynamic-body point and releases cleanly', () => {
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

  assert.ok(controller.wrenchGrab, 'wrench left-click must initiate a point grab');
  assert.equal(controller.wrenchGrab.contraption, entity);
  assert.equal(controller.wrenchGrab.bodyId, 'root');
  assert.equal(controller.wrenchGrab.targetDistance, 5);

  controller.camera.position.set(0, 5, 0);
  controller.update(1 / 60);

  assert.ok(entity.velocity.length() > 0, 'grab must immediately constrain the body toward the locked point');
  assert.equal(entity.appliedForces.length(), 0, 'grab strength must not depend on finite force or body mass');

  assert.equal(controller.releaseWrenchGrab(), true);
  assert.equal(controller.wrenchGrab, null);
});

test('Wrench cannot inject motion into an entity while Stop has disabled physics', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null);
  const entity = makeContraptionWithChildren();
  manager.registerContraption(entity);
  entity.stopAllNodeScripts();

  const controller = Object.create(PlayerController.prototype) as any;
  controller.activeTool = SpecialTool.WRENCH;
  controller.contraptions = manager;
  controller.hoveredContraption = entity;
  controller.hoveredContraptionHit = {
    contraption: entity,
    entityId: 'root',
    point: entity.position.clone()
  };
  controller.physics = { getEyePosition: () => new THREE.Vector3() };
  controller.ui = { showToast() {} };

  assert.equal(controller.startWrenchGrab(), false);
  assert.equal(controller.wrenchGrab, undefined);
  assert.deepEqual(entity.velocity.toArray(), [0, 0, 0]);
});

test('component pivot updates preserve rotated component and descendant voxel positions', () => {
  const entity = makeContraptionWithChildren();
  entity.stopAllNodeScripts();
  entity.quaternion.setFromEuler(new THREE.Euler(0.15, 0.6, -0.1));
  const arm = entity.getEntityNode('arm');
  arm.localQuaternion.setFromEuler(new THREE.Euler(0.2, -0.35, 0.1));
  arm.group.quaternion.copy(arm.localQuaternion);
  entity.updateTransform();

  const before = entity.blocks.map(block => entity.getBlockWorldCenter(block));
  const result = entity.setComponentPivot('arm', [1.35, 0.8, -0.25], {
    requireStopped: true,
    allowDynamic: true
  });

  assert.equal(result.ok, true);
  assert.deepEqual(entity.getEntityNode('arm').pivotLocal.toArray(), [1.35, 0.8, -0.25]);
  for (let index = 0; index < entity.blocks.length; index++) {
    assert.ok(
      entity.getBlockWorldCenter(entity.blocks[index]).distanceTo(before[index]) < 1e-7,
      `block ${index} should stay fixed while the arm pivot moves`
    );
  }
});

test('a stopped dynamic root pivot can move without moving its subtree', () => {
  const entity = makeContraptionWithChildren();
  entity.stopAllNodeScripts();
  entity.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 3);
  entity.updateTransform();
  const before = entity.blocks.map(block => entity.getBlockWorldCenter(block));
  const oldPivot = entity.getEntityNode('root').pivotLocal.clone();
  const nextPivot = oldPivot.clone().add(new THREE.Vector3(0.75, -0.2, 0.4));

  const result = entity.setComponentPivot('root', nextPivot, {
    requireStopped: true,
    allowDynamic: true
  });

  assert.equal(result.ok, true);
  assert.ok(entity.getEntityNode('root').pivotLocal.distanceTo(nextPivot) < 1e-9);
  for (let index = 0; index < entity.blocks.length; index++) {
    assert.ok(
      entity.getBlockWorldCenter(entity.blocks[index]).distanceTo(before[index]) < 1e-7,
      `block ${index} should stay fixed while the root pivot moves`
    );
  }
});

test('pivot reset returns root and child pivots to their default centers without moving voxels', () => {
  const entity = makeContraptionWithChildren();
  entity.stopAllNodeScripts();
  entity.quaternion.setFromEuler(new THREE.Euler(0.2, -0.45, 0.1));
  entity.updateTransform();
  const before = entity.blocks.map(block => entity.getBlockWorldCenter(block));

  assert.equal(entity.setComponentPivot('root', [2.1, -0.4, 1.7], {
    requireStopped: true,
    allowDynamic: true
  }).ok, true);
  assert.equal(entity.setComponentPivot('arm', [1.8, 0.2, -0.6], {
    requireStopped: true,
    allowDynamic: true
  }).ok, true);

  const rootResult = entity.resetComponentPivot('root', {
    requireStopped: true,
    allowDynamic: true
  });
  const armResult = entity.resetComponentPivot('arm', {
    requireStopped: true,
    allowDynamic: true
  });

  assert.equal(rootResult.ok, true);
  assert.equal(armResult.ok, true);
  assert.ok(entity.getEntityNode('root').pivotLocal.distanceTo(entity.localCenter) < 1e-9);
  assert.equal(entity.rootPivotOverride, null, 'root reset should restore automatic/default pivot semantics');
  assert.deepEqual(entity.getEntityNode('arm').pivotLocal.toArray(), [0.5, 1.5, 0.5]);
  for (let index = 0; index < entity.blocks.length; index++) {
    assert.ok(
      entity.getBlockWorldCenter(entity.blocks[index]).distanceTo(before[index]) < 1e-7,
      `block ${index} should stay fixed while pivots reset`
    );
  }
});

test('Wrench pivot gizmo is a fixed, non-interactive XYZ display', () => {
  const renderer: any = Object.create(SceneRenderer.prototype);
  renderer.scene = new THREE.Scene();
  renderer.setupWrenchPivotGizmo();
  assert.equal(renderer.wrenchPivotArrows.size, 3);

  renderer.setWrenchPivotGizmo(
    new THREE.Vector3(1, 2, 3),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.4),
    2
  );
  assert.equal(renderer.wrenchPivotGizmo.visible, true);
  assert.deepEqual(renderer.wrenchPivotGizmo.position.toArray(), [1, 2, 3]);
  assert.deepEqual(renderer.wrenchPivotGizmo.scale.toArray(), [2, 2, 2]);
  assert.equal(renderer.wrenchPivotArrows.get('x').line.material.color.getHex(), 0xff3b30);
  assert.equal(renderer.wrenchPivotArrows.get('y').line.material.color.getHex(), 0x34c759);
  assert.equal(renderer.wrenchPivotArrows.get('z').line.material.color.getHex(), 0x248aff);
  assert.equal(renderer.wrenchPivotOrigin.material.color.getHex(), 0xffffff);
  assert.equal(renderer.wrenchPivotOrigin.scale.x, 1);

  renderer.clearWrenchPivotGizmo();
  assert.equal(renderer.wrenchPivotGizmo.visible, false);
});

test('Wrench displays the pointed component pivot but left-click still starts a grab', () => {
  const entity = makeContraptionWithChildren();
  entity.stopAllNodeScripts();
  entity.setComponentPivot('arm', [1.8, 0.2, -0.6], {
    requireStopped: true,
    allowDynamic: true
  });
  const node = entity.getEntityNode('arm');
  const originalPivot = node.pivotLocal.clone();
  const pivotWorld = entity.getEntityNodeWorldPosition('arm');
  const gizmoCalls: any[][] = [];
  let grabs = 0;
  const controller: any = Object.create(PlayerController.prototype);
  Object.assign(controller, {
    _activeTool: SpecialTool.WRENCH,
    contraptions: { contraptions: [entity] },
    physics: { getEyePosition: () => pivotWorld.clone().add(new THREE.Vector3(0, 0, 4)) },
    sceneRenderer: {
      setWrenchPivotGizmo(...args) { gizmoCalls.push(args); },
      setWrenchTether() {}
    },
    wrenchGrab: null,
    wrenchPivotTarget: null,
    startWrenchGrab() { grabs++; }
  });

  const displayed = controller.updateWrenchPivotGizmo({ contraption: entity, entityId: 'arm' });
  assert.equal(displayed.nodeId, 'arm');
  assert.equal(gizmoCalls.length, 1);
  assert.equal(gizmoCalls[0].length, 3, 'display has no hover or active handle state');
  controller.handleLeftClick();

  assert.equal(grabs, 1);
  assert.ok(node.pivotLocal.distanceTo(originalPivot) < 1e-9);
});

test('Wrench grab does not push a target that is closer than 1.5 metres', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null);
  const entity = makeContraptionWithChildren();
  manager.registerContraption(entity);

  const hitPoint = entity.position.clone();
  const eye = hitPoint.clone().add(new THREE.Vector3(0, 0, -0.75));
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(eye);
  camera.lookAt(hitPoint);

  const controller = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.WRENCH;
  controller.contraptions = manager;
  controller.hoveredContraption = entity;
  controller.hoveredContraptionHit = { contraption: entity, entityId: 'root', point: hitPoint };
  controller.sound = { playWrenchClick() {} };
  controller.ui = { showToast() {} };
  controller.camera = camera;
  controller.physics = {
    update() {},
    getEyePosition() { return eye.clone(); },
    position: eye,
    velocity: new THREE.Vector3()
  };
  controller.updateCameraPosition = () => {};

  controller.handleLeftClick();
  assert.ok(Math.abs(controller.wrenchGrab.targetDistance - 0.75) < 1e-9);

  controller.update(1 / 60);
  assert.ok(entity.velocity.length() < 1e-9, 'grabbing a close stationary point must not kick it away');
});

test('Wrench grab follows the bent aiming ray without an initial sideways push', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null);
  const entity = makeContraptionWithChildren();
  manager.registerContraption(entity);

  const eye = new THREE.Vector3(TORUS_SPAWN_X, 18, TORUS_SPAWN_Z);
  const hitPoint = eye.clone().add(new THREE.Vector3(4, 0, 6));
  entity.position.copy(hitPoint);
  entity.updateTransform();

  const eyeBent = bendPoint(eye.x, eye.y, eye.z);
  const hitBent = bendPoint(hitPoint.x, hitPoint.y, hitPoint.z);
  const bentDirection = hitBent.clone().sub(eyeBent).normalize();
  const flatDirection = unbendDirection(
    eye.x,
    eye.y,
    eye.z,
    bentDirection,
    new THREE.Vector3()
  ).normalize();
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(eye);
  camera.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), flatDirection);

  const controller = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.WRENCH;
  controller.contraptions = manager;
  controller.hoveredContraption = entity;
  controller.hoveredContraptionHit = {
    contraption: entity,
    entityId: 'root',
    point: hitPoint,
    distance: eyeBent.distanceTo(hitBent)
  };
  controller.sound = { playWrenchClick() {} };
  controller.ui = { showToast() {} };
  controller.camera = camera;
  controller.physics = {
    update() {},
    getEyePosition() { return eye.clone(); },
    position: eye,
    velocity: new THREE.Vector3()
  };
  controller.updateCameraPosition = () => {};

  controller.handleLeftClick();
  controller.update(1 / 60);

  assert.ok(entity.velocity.length() < 1e-6, 'an unchanged bent-space grab target must remain stationary');
});

test('Wrench grab holds a stationary target without pushing and follows player motion', () => {
  const scene = new THREE.Scene();
  const world = {
    getBlock: () => BlockTypes.AIR,
    raycast: () => ({ hit: false, distance: 0 }),
    raycastMicro: () => ({ hit: false, distance: 0 }),
    microVoxels: { get: () => null }
  };
  const manager = new ContraptionManager(scene, world, null, null);
  const entityPhysics = new ContraptionPhysics(world as any);
  manager.setPhysics(entityPhysics);
  const entity = new Contraption(
    2,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(0, 0, -5),
    scene,
    { rootComponentId: 'root', bodyType: 'dynamic', friction: 0 }
  );
  entity.useGravity = false;
  manager.registerContraption(entity);

  const eye = new THREE.Vector3(0, 0, 0);
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(eye);
  camera.lookAt(entity.position);
  const controller = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.WRENCH;
  controller.contraptions = manager;
  controller.hoveredContraption = entity;
  controller.hoveredContraptionHit = {
    contraption: entity,
    entityId: 'root',
    point: entity.position.clone()
  };
  controller.sound = { playWrenchClick() {} };
  controller.ui = { showToast() {} };
  controller.camera = camera;
  controller.physics = {
    update() {},
    getEyePosition() { return eye.clone(); },
    position: eye,
    velocity: new THREE.Vector3()
  };
  controller.updateCameraPosition = () => {};
  controller.handleLeftClick();

  const originalPosition = entity.position.clone();
  for (let frame = 0; frame < 120; frame++) {
    controller.update(1 / 60);
    entityPhysics.update(entity, 1 / 60);
  }
  assert.ok(entity.position.distanceTo(originalPosition) < 0.01, 'an unchanged grab target must not push the body away');

  eye.x = 2;
  for (let frame = 0; frame < 90; frame++) {
    controller.update(1 / 60);
    entityPhysics.update(entity, 1 / 60);
  }
  assert.ok(entity.position.x > 1.5, `the grabbed point must follow player motion, x=${entity.position.x}`);
  assert.ok(Math.abs(entity.position.z - originalPosition.z) < 0.2, 'following sideways must not become a forward push');
});

test('Wrench grab approaches a moved target without rapid overshoot oscillation', () => {
  const scene = new THREE.Scene();
  const world = {
    getBlock: () => BlockTypes.AIR,
    raycast: () => ({ hit: false, distance: 0 }),
    raycastMicro: () => ({ hit: false, distance: 0 }),
    microVoxels: { get: () => null }
  };
  const manager = new ContraptionManager(scene, world, null, null);
  const entityPhysics = new ContraptionPhysics(world as any);
  manager.setPhysics(entityPhysics);
  const entity = new Contraption(
    22,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(0, 0, -5),
    scene,
    { rootComponentId: 'root', bodyType: 'dynamic', friction: 0 }
  );
  entity.useGravity = false;
  manager.registerContraption(entity);

  const eye = new THREE.Vector3(0, 0, 0);
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(eye);
  camera.lookAt(entity.position);
  const controller: any = Object.create(PlayerController.prototype);
  Object.assign(controller, {
    activeTool: SpecialTool.WRENCH,
    contraptions: manager,
    hoveredContraption: entity,
    hoveredContraptionHit: {
      contraption: entity,
      entityId: 'root',
      point: entity.position.clone()
    },
    sound: { playWrenchClick() {} },
    ui: { showToast() {} },
    camera,
    physics: {
      update() {},
      getEyePosition() { return eye.clone(); },
      position: eye,
      velocity: new THREE.Vector3()
    },
    updateCameraPosition() {}
  });
  controller.handleLeftClick();
  eye.x = 4;

  let peakSpeed = 0;
  let previousSign = 1;
  let crossings = 0;
  for (let frame = 0; frame < 100; frame++) {
    controller.update(1 / 20);
    entityPhysics.update(entity, 1 / 20);
    peakSpeed = Math.max(peakSpeed, entity.velocity.length());
    const anchor = entity.entityLocalToWorld('root', controller.wrenchGrab.localPoint.clone());
    const error = controller.wrenchGrab.lastTargetPosition.x - anchor.x;
    const sign = Math.abs(error) < 0.01 ? previousSign : Math.sign(error);
    if (sign !== previousSign) crossings++;
    previousSign = sign;
  }

  const finalAnchor = entity.entityLocalToWorld('root', controller.wrenchGrab.localPoint.clone());
  assert.ok(peakSpeed <= 14.01, `grab speed should be bounded, peak=${peakSpeed}`);
  assert.ok(crossings <= 1, `grab should not repeatedly cross the target, crossings=${crossings}`);
  assert.ok(
    finalAnchor.distanceTo(controller.wrenchGrab.lastTargetPosition) < 0.03,
    'grabbed point should settle at the moved target'
  );
});

test('Wrench grab compensates entity gravity without vertical snapping', () => {
  const scene = new THREE.Scene();
  const world = {
    getBlock: () => BlockTypes.AIR,
    raycast: () => ({ hit: false, distance: 0 }),
    raycastMicro: () => ({ hit: false, distance: 0 }),
    microVoxels: { get: () => null }
  };
  const manager = new ContraptionManager(scene, world, null, null);
  const entityPhysics = new ContraptionPhysics(world as any);
  manager.setPhysics(entityPhysics);
  const entity = new Contraption(
    23,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(0, 4, -5),
    scene,
    { rootComponentId: 'root', bodyType: 'dynamic', friction: 0 }
  );
  manager.registerContraption(entity);

  const eye = new THREE.Vector3(0, 5, 0);
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(eye);
  camera.lookAt(entity.position);
  const controller: any = Object.create(PlayerController.prototype);
  Object.assign(controller, {
    activeTool: SpecialTool.WRENCH,
    contraptions: manager,
    hoveredContraption: entity,
    hoveredContraptionHit: {
      contraption: entity,
      entityId: 'root',
      point: entity.position.clone()
    },
    sound: { playWrenchClick() {} },
    ui: { showToast() {} },
    camera,
    physics: {
      update() {},
      getEyePosition() { return eye.clone(); },
      position: eye,
      velocity: new THREE.Vector3()
    },
    updateCameraPosition() {}
  });
  controller.handleLeftClick();
  const initialAnchor = entity.entityLocalToWorld('root', controller.wrenchGrab.localPoint.clone());
  let minY = initialAnchor.y;
  let maxY = initialAnchor.y;

  for (let frame = 0; frame < 120; frame++) {
    controller.update(1 / 20);
    entityPhysics.update(entity, 1 / 20);
    const anchor = entity.entityLocalToWorld('root', controller.wrenchGrab.localPoint.clone());
    minY = Math.min(minY, anchor.y);
    maxY = Math.max(maxY, anchor.y);
  }

  const finalAnchor = entity.entityLocalToWorld('root', controller.wrenchGrab.localPoint.clone());
  assert.ok(maxY - minY < 0.08, `held body should not bounce vertically, range=${maxY - minY}`);
  const finalDrift = finalAnchor.distanceTo(initialAnchor);
  assert.ok(finalDrift < 0.04, `gravity-compensated grab should hold its point, drift=${finalDrift}`);
});

test('Wrench grab is mass independent for extremely heavy entities', () => {
  const scene = new THREE.Scene();
  const world = {
    getBlock: () => BlockTypes.AIR,
    raycast: () => ({ hit: false, distance: 0 }),
    raycastMicro: () => ({ hit: false, distance: 0 }),
    microVoxels: { get: () => null }
  };
  const manager = new ContraptionManager(scene, world, null, null);
  const entityPhysics = new ContraptionPhysics(world as any);
  manager.setPhysics(entityPhysics);
  const entity = new Contraption(
    3,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(0, 0, -5),
    scene,
    { rootComponentId: 'root', bodyType: 'dynamic', friction: 0 }
  );
  entity.useGravity = false;
  entity.setNodeBodyMass('root', 1_000_000_000);
  manager.registerContraption(entity);

  const eye = new THREE.Vector3(0, 0, 0);
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(eye);
  camera.lookAt(entity.position);
  const controller = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.WRENCH;
  controller.contraptions = manager;
  controller.hoveredContraption = entity;
  controller.hoveredContraptionHit = {
    contraption: entity,
    entityId: 'root',
    point: entity.position.clone()
  };
  controller.sound = { playWrenchClick() {} };
  controller.ui = { showToast() {} };
  controller.camera = camera;
  controller.physics = {
    update() {},
    getEyePosition() { return eye.clone(); },
    position: eye,
    velocity: new THREE.Vector3()
  };
  controller.updateCameraPosition = () => {};
  controller.handleLeftClick();

  eye.x = 3;
  for (let frame = 0; frame < 45; frame++) {
    controller.update(1 / 60);
    entityPhysics.update(entity, 1 / 60);
  }

  assert.equal(entity.getNodeBodyMass('root'), 1_000_000_000);
  assert.ok(entity.position.x > 2.5, `a billion-kilogram entity must follow the grab target, x=${entity.position.x}`);
});

test('Wrench cannot repeatedly drive a grabbed entity through terrain', () => {
  const wallX = 3;
  const world = {
    getBlock: (x) => x === wallX ? BlockTypes.COLOR_BLOCK : BlockTypes.AIR,
    raycast: (origin, direction, maxDistance) => {
      if (!(direction.x > 0) || origin.x >= wallX) return { hit: false };
      const distance = (wallX - origin.x) / direction.x;
      return distance <= maxDistance
        ? { hit: true, distance, normal: { x: -1, y: 0, z: 0 } }
        : { hit: false };
    },
    raycastMicro: () => ({ hit: false }),
    microVoxels: { get: () => null }
  };
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, world, null, null);
  const entityPhysics = new ContraptionPhysics(world as any);
  manager.setPhysics(entityPhysics);
  const entity = new Contraption(
    4,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(0, 0, -5),
    scene,
    { rootComponentId: 'root', bodyType: 'dynamic', friction: 0, restitution: 0 }
  );
  entity.useGravity = false;
  manager.registerContraption(entity);

  const eye = new THREE.Vector3(0, 0, 0);
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(eye);
  camera.lookAt(entity.position);
  const controller = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.WRENCH;
  controller.contraptions = manager;
  controller.hoveredContraption = entity;
  controller.hoveredContraptionHit = {
    contraption: entity,
    entityId: 'root',
    point: entity.position.clone()
  };
  controller.sound = { playWrenchClick() {} };
  controller.ui = { showToast() {} };
  controller.camera = camera;
  controller.physics = {
    update() {},
    getEyePosition() { return eye.clone(); },
    position: eye,
    velocity: new THREE.Vector3()
  };
  controller.updateCameraPosition = () => {};
  controller.handleLeftClick();

  eye.x = 8;
  let maxX = entity.position.x;
  for (let frame = 0; frame < 120; frame++) {
    controller.update(1 / 60);
    entityPhysics.update(entity, 1 / 60);
    maxX = Math.max(maxX, entity.position.x);
  }

  assert.ok(maxX < 2.51, `the held body must remain on the near side of the wall, maxX=${maxX}`);
});

test('Wrench cannot drive a grabbed entity through another entity', () => {
  const world = {
    getBlock: () => BlockTypes.AIR,
    raycast: () => ({ hit: false }),
    raycastMicro: () => ({ hit: false }),
    microVoxels: { get: () => null }
  };
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, world, null, null);
  const entityPhysics = new ContraptionPhysics(world as any);
  manager.setPhysics(entityPhysics);
  const grabbed = new Contraption(
    5,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(0, 0, -5),
    scene,
    { rootComponentId: 'root', bodyType: 'dynamic', friction: 0, restitution: 0 }
  );
  grabbed.useGravity = false;
  const obstacle = new Contraption(
    6,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(3, 0, -5),
    scene,
    { bodyType: 'kinematic', friction: 0, restitution: 0 }
  );
  manager.registerContraption(grabbed);
  manager.registerContraption(obstacle);

  const eye = new THREE.Vector3(0, 0, 0);
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(eye);
  camera.lookAt(grabbed.position);
  const controller = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.WRENCH;
  controller.contraptions = manager;
  controller.hoveredContraption = grabbed;
  controller.hoveredContraptionHit = {
    contraption: grabbed,
    entityId: 'root',
    point: grabbed.position.clone()
  };
  controller.sound = { playWrenchClick() {} };
  controller.ui = { showToast() {} };
  controller.camera = camera;
  controller.physics = {
    update() {},
    getEyePosition() { return eye.clone(); },
    position: eye,
    velocity: new THREE.Vector3()
  };
  controller.updateCameraPosition = () => {};
  controller.handleLeftClick();

  eye.x = 8;
  let maxX = grabbed.position.x;
  for (let frame = 0; frame < 120; frame++) {
    controller.update(1 / 60);
    manager.update(1 / 60, null);
    maxX = Math.max(maxX, grabbed.position.x);
  }

  assert.ok(maxX < 2.51, `the held body must not pass through the other entity, maxX=${maxX}`);
  assert.equal(obstacle.position.x, 3.5, 'a kinematic obstacle must remain fixed');
});

test('Wrench can pull apart rotated entity boxes whose broadphase bounds overlap', () => {
  const world = {
    getBlock: () => BlockTypes.AIR,
    raycast: () => ({ hit: false }),
    raycastMicro: () => ({ hit: false }),
    microVoxels: { get: () => null }
  };
  const physics = new ContraptionPhysics(world as any);
  const scene = new THREE.Scene();
  const grabbed = new Contraption(
    7,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(0, 10, 0),
    scene,
    { rootComponentId: 'root', bodyType: 'dynamic', friction: 0, restitution: 0 }
  );
  const obstacle = new Contraption(
    8,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(-0.6, 9.4, -0.3),
    scene,
    { bodyType: 'kinematic', friction: 0, restitution: 0 }
  );
  obstacle.quaternion.setFromEuler(new THREE.Euler(0, 0, 0.9));
  obstacle.updateTransform();

  // Settle the initial overlap to the normal one-millimetre contact slop. The
  // rotated obstacle's world AABB still contains empty corners around that
  // contact, which used to make the wrench preflight return zero velocity.
  physics.resolveContraptionPairs([grabbed, obstacle]);
  const outwardVelocity = grabbed.position.clone()
    .sub(obstacle.position)
    .normalize()
    .multiplyScalar(10);
  const constrained = physics.constrainWrenchVelocity(
    grabbed,
    grabbed.getRigidBody('root'),
    outwardVelocity,
    1 / 60,
    [grabbed, obstacle]
  );

  assert.ok(
    constrained.velocity.dot(outwardVelocity) > outwardVelocity.lengthSq() * 0.99,
    `a separating wrench drive must survive rotated-box preflight, velocity=${constrained.velocity.toArray()}`
  );
});

test('Wrench resolves a grabbed kinematic child to its nearest dynamic body', () => {
  const entity = makeContraptionWithChildren();
  const controller = Object.create(PlayerController.prototype);

  assert.equal(controller.getWrenchGrabBodyId(entity, 'hand'), 'root');
  entity.setNodeBodyType('arm', 'dynamic');
  assert.equal(controller.getWrenchGrabBodyId(entity, 'hand'), 'arm');
  assert.equal(controller.getWrenchGrabBodyId(entity, 'arm'), 'arm');
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

test('handleWheel does not switch tools/hotbar, but cycles Hammer inventory or Brush palette', () => {
  let cycledColors: number[] = [];
  let cycledHotbars: number[] = [];
  const mockUi = {
    showToast() {},
    renderInventoryBar() {},
    cycleColor(dir: number) { cycledColors.push(dir); },
    cycleHotbar(dir: number) { cycledHotbars.push(dir); }
  };

  const controller = Object.create(PlayerController.prototype);
  controller.isLocked = true;
  controller.inventorySlots = new Array(8).fill(null);
  controller.selectedInventoryIndex = 0;
  controller.ui = mockUi;
  controller.handleWheel = PlayerController.prototype.handleWheel.bind(controller);
  controller.cycleInventorySlot = PlayerController.prototype.cycleInventorySlot.bind(controller);

  // 1. SELECTOR tool: wheel does nothing (no hotbar cycling, no color cycling)
  controller.activeTool = SpecialTool.SELECTOR;
  controller.handleWheel({ deltaY: 100 });
  assert.equal(controller.activeTool, SpecialTool.SELECTOR);
  assert.equal(cycledHotbars.length, 0, 'must not cycle hotbar on wheel');
  assert.equal(cycledColors.length, 0);

  // 2. HAMMER tool: wheel cycles inventory slot
  controller.activeTool = SpecialTool.HAMMER;
  controller.handleWheel({ deltaY: 100 });
  assert.equal(controller.selectedInventoryIndex, 1);
  controller.handleWheel({ deltaY: -100 });
  assert.equal(controller.selectedInventoryIndex, 0);
  assert.equal(cycledHotbars.length, 0, 'must not cycle hotbar on Hammer wheel');

  // 3. BRUSH tool: wheel cycles palette colors
  controller.activeTool = SpecialTool.BRUSH;
  controller.handleWheel({ deltaY: 100 });
  assert.deepEqual(cycledColors, [1]);
  controller.handleWheel({ deltaY: -100 });
  assert.deepEqual(cycledColors, [1, -1]);
  assert.equal(cycledHotbars.length, 0, 'must not cycle hotbar on Brush wheel');

  // 4. Shift+Wheel on non-Hammer tool cycles palette colors
  controller.activeTool = SpecialTool.WRENCH;
  controller.handleWheel({ deltaY: 100, shiftKey: true });
  assert.deepEqual(cycledColors, [1, -1, 1]);
  assert.equal(cycledHotbars.length, 0, 'must not cycle hotbar on Shift+Wheel');

  // 5. When not pointer locked, wheel does nothing
  controller.isLocked = false;
  controller.activeTool = SpecialTool.HAMMER;
  controller.handleWheel({ deltaY: 100 });
  assert.equal(controller.selectedInventoryIndex, 0, 'must not cycle when not locked');
});
