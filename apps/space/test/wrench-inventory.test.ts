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

test('rebuilding a serialized child subtree remaps its root to the new root', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null);
  const original = makeContraptionWithChildren();

  const slot = original.serializeSubtree('arm');
  assert.equal(slot.blockCount, 2, 'arm and hand should contribute two blocks');
  assert.equal(slot.nodeCount, 2);
  assert.equal(slot.rootId, 'root');
  assert.equal('rootIds' in slot, false, 'inventory entities always have one explicit root');
  assert.deepEqual(slot.childEntities.map(child => child.id), ['hand']);

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
      childEntities: [
        { id: 'arm', parentId: 'root', collisionEnabled: false },
        { id: 'wing', parentId: 'root' }
      ]
    }
  );

  const slot = original.serializeSubtrees(['arm', 'wing']);

  assert.equal(slot.rootId, 'root');
  assert.equal('rootIds' in slot, false);
  assert.equal(slot.nodeCount, 3);
  assert.deepEqual(slot.childEntities.map(child => [child.id, child.parentId]), [
    ['arm', 'root'],
    ['wing', 'root']
  ]);
  const copy = manager.buildFromSlot(slot, new THREE.Vector3());
  assert.ok(copy);
  assert.equal(copy.getEntityNode('arm').parentId, 'root');
  assert.equal(copy.getEntityNode('wing').parentId, 'root');
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
    { bodyType: 'dynamic', friction: 0 }
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
    { bodyType: 'dynamic', friction: 0 }
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
    { bodyType: 'dynamic', friction: 0, restitution: 0 }
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
    { bodyType: 'dynamic', friction: 0, restitution: 0 }
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
