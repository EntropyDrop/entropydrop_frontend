import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ContraptionManager, worldEntitiesStorageKey } from '../src/engine/contraption/ContraptionManager.ts';
import { ContraptionMode } from '../src/engine/contraption/Contraption.ts';
import { ContraptionPhysics } from '../src/engine/physics/ContraptionPhysics.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';

class MockStorage {
  store = new Map<string, string>();
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

test('contraption manager saves assembled entity and restores it after simulated reload', () => {
  const storage = new MockStorage();
  const worldId = 'test-world-persist-1';

  const scene = new THREE.Scene();
  const managerA = new ContraptionManager(scene, null, null, null);
  managerA.setWorldId(worldId);

  // Directly build an entity in managerA
  const slot = {
    rootId: 'root',
    mode: ContraptionMode.PROGRAMMABLE,
    blocks: [
      { localX: 0, localY: 0, localZ: 0, size: 1, color: 0xff0000, block: BlockTypes.COLOR_BLOCK, entityId: 'root' },
      { localX: 1, localY: 0, localZ: 0, size: 0.2, color: 0x00ff00, block: BlockTypes.COLOR_BLOCK, entityId: 'root' }
    ],
    childEntities: [],
    scripts: [{ id: 'root', code: 'self.color = 0x123456;' }],
    enabled: [{ id: 'root', enabled: true }],
    constraints: []
  };

  const pos = new THREE.Vector3(100, 15, 200);
  const created = managerA.buildFromSlot(slot, pos, null, false);
  assert.ok(created);
  assert.equal(managerA.contraptions.length, 1);

  created.setNodeBodyMass('root', 987_654.5);
  created.setNodeBodyMaterial('root', { restitution: 0.013, friction: 0.27 });
  created.useGravity = false;
  created.quaternion.setFromEuler(new THREE.Euler(0.21, -0.37, 0.09));
  created.velocity.set(4.5, -2.25, 1.125);
  created.angularVelocity.set(-0.4, 0.8, 0.2);
  const createdBody = created.getRigidBody('root');
  createdBody.linearDamping = 0.876;
  createdBody.angularDamping = 0.654;
  created.linearDamping = createdBody.linearDamping;
  created.angularDamping = createdBody.angularDamping;
  createdBody.previousKinematicPosition.set(99, 14, 199);
  createdBody.previousKinematicQuaternion.setFromEuler(new THREE.Euler(0.1, 0.2, 0.3));
  createdBody.isOnGround = true;
  created.isOnGround = true;
  created.groundDistance = 0.125;

  // Save to storage
  const saved = managerA.saveEntitiesToStorage(storage as any);
  assert.equal(saved, true);

  const raw = storage.getItem(worldEntitiesStorageKey(worldId));
  assert.ok(raw);
  const parsed = JSON.parse(raw);
  assert.equal(parsed.entities.length, 1);
  assert.equal(parsed.worldId, worldId);
  assert.equal(parsed.entities[0].bodies[0].mass, 987_654.5);
  assert.equal(parsed.entities[0].bodies[0].linearDamping, 0.876);
  assert.equal(parsed.entities[0].bodies[0].angularDamping, 0.654);

  // Now create managerB (simulating page reload)
  const sceneB = new THREE.Scene();
  const managerB = new ContraptionManager(sceneB, null, null, null);
  managerB.setWorldId(worldId);

  assert.equal(managerB.contraptions.length, 0);
  const loadedCount = managerB.loadEntitiesFromStorage(storage as any);
  assert.equal(loadedCount, 1);
  assert.equal(managerB.contraptions.length, 1);

  const restored = managerB.contraptions[0];
  assert.equal(restored.publicId, created.publicId);
  assert.equal(restored.blocks.length, 2);
  assert.equal(restored.position.x, created.position.x);
  assert.equal(restored.position.y, created.position.y);
  assert.equal(restored.position.z, created.position.z);
  assert.equal(restored.getNodeScript('root'), 'self.color = 0x123456;');
  assert.ok(Math.abs(restored.quaternion.dot(created.quaternion)) > 1 - 1e-12);
  assert.deepEqual(restored.velocity.toArray(), created.velocity.toArray());
  assert.deepEqual(restored.angularVelocity.toArray(), created.angularVelocity.toArray());
  assert.equal(restored.useGravity, false);
  assert.equal(restored.isOnGround, true);
  assert.equal(restored.groundDistance, 0.125);

  const restoredBody = restored.getRigidBody('root');
  assert.equal(restoredBody.type, createdBody.type);
  assert.equal(restoredBody.mass, createdBody.mass);
  assert.equal(restoredBody.inverseInertia, createdBody.inverseInertia);
  assert.equal(restoredBody.restitution, createdBody.restitution);
  assert.equal(restoredBody.friction, createdBody.friction);
  assert.equal(restoredBody.linearDamping, createdBody.linearDamping);
  assert.equal(restoredBody.angularDamping, createdBody.angularDamping);
  assert.deepEqual(restoredBody.centerOfMassLocal.toArray(), createdBody.centerOfMassLocal.toArray());
  assert.deepEqual(restoredBody.previousKinematicPosition.toArray(), createdBody.previousKinematicPosition.toArray());
  assert.ok(Math.abs(restoredBody.previousKinematicQuaternion.dot(createdBody.previousKinematicQuaternion)) > 1 - 1e-12);
  assert.equal(restoredBody.isOnGround, true);

  const airWorld = {
    getBlock: () => BlockTypes.AIR,
    raycast: () => ({ hit: false, distance: 0 }),
    raycastMicro: () => ({ hit: false, distance: 0 }),
    microVoxels: { get: () => null }
  };
  new ContraptionPhysics(airWorld as any).update(created, 1 / 60);
  new ContraptionPhysics(airWorld as any).update(restored, 1 / 60);
  assert.ok(restored.position.distanceTo(created.position) < 1e-12, 'the first post-refresh physics step must not change the trajectory');
  assert.deepEqual(restored.velocity.toArray(), created.velocity.toArray());
  assert.ok(Math.abs(restored.quaternion.dot(created.quaternion)) > 1 - 1e-12);
  assert.deepEqual(restored.angularVelocity.toArray(), created.angularVelocity.toArray());
});

test('refresh persistence restores dynamic child body parameters and motion', () => {
  const storage = new MockStorage();
  const worldId = 'test-world-persist-child-body';
  const manager = new ContraptionManager(new THREE.Scene(), null, null, null);
  manager.setWorldId(worldId);
  const entity = manager.buildFromSlot({
    rootId: 'root',
    mode: ContraptionMode.PROGRAMMABLE,
    bodyType: 'kinematic',
    blocks: [
      { localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK, entityId: 'root' },
      { localX: 2, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK, entityId: 'arm' }
    ],
    childEntities: [{
      id: 'arm',
      parentId: 'root',
      kind: 'child',
      pivot: [2.5, 0.5, 0.5],
      blockKeys: [['2', '0', '0']],
      bodyType: 'dynamic'
    }],
    scripts: [],
    enabled: [],
    constraints: []
  }, new THREE.Vector3(10, 5, 10), null, false);
  assert.ok(entity);

  entity.setNodeBodyMass('arm', 4321);
  entity.setNodeBodyMaterial('arm', { restitution: 0.041, friction: 0.19 });
  const childBody = entity.getRigidBody('arm');
  childBody.linearDamping = 0.81;
  childBody.angularDamping = 0.62;
  childBody.position.set(14, 8, 13);
  childBody.quaternion.setFromEuler(new THREE.Euler(-0.2, 0.3, 0.4));
  childBody.velocity.set(3, 2, 1);
  childBody.angularVelocity.set(0.7, -0.6, 0.5);
  entity.syncAllBodyTransforms();

  assert.equal(manager.saveEntitiesToStorage(storage as any), true);
  const reloaded = new ContraptionManager(new THREE.Scene(), null, null, null);
  reloaded.setWorldId(worldId);
  assert.equal(reloaded.loadEntitiesFromStorage(storage as any), 1);

  const restoredBody = reloaded.contraptions[0].getRigidBody('arm');
  assert.equal(restoredBody.type, childBody.type);
  assert.equal(restoredBody.mass, childBody.mass);
  assert.equal(restoredBody.inverseInertia, childBody.inverseInertia);
  assert.equal(restoredBody.restitution, childBody.restitution);
  assert.equal(restoredBody.friction, childBody.friction);
  assert.equal(restoredBody.linearDamping, childBody.linearDamping);
  assert.equal(restoredBody.angularDamping, childBody.angularDamping);
  assert.deepEqual(restoredBody.position.toArray(), childBody.position.toArray());
  assert.ok(Math.abs(restoredBody.quaternion.dot(childBody.quaternion)) > 1 - 1e-12);
  assert.deepEqual(restoredBody.velocity.toArray(), childBody.velocity.toArray());
  assert.deepEqual(restoredBody.angularVelocity.toArray(), childBody.angularVelocity.toArray());
});

test('disassembling or removing contraption updates storage so it stays removed after reload', () => {
  const storage = new MockStorage();
  const worldId = 'test-world-persist-2';

  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, null, null, null);
  manager.setWorldId(worldId);

  const slot = {
    rootId: 'root',
    mode: ContraptionMode.PROGRAMMABLE,
    blocks: [
      { localX: 0, localY: 0, localZ: 0, size: 1, color: 0xff0000, block: BlockTypes.COLOR_BLOCK, entityId: 'root' }
    ],
    childEntities: [],
    scripts: [],
    enabled: [],
    constraints: []
  };

  const created = manager.buildFromSlot(slot, new THREE.Vector3(50, 10, 50), null, true);
  assert.ok(created);

  // Remove the entity
  manager.removeContraption(created);
  assert.equal(manager.contraptions.length, 0);

  // Recreate manager to simulate refresh
  const managerReloaded = new ContraptionManager(new THREE.Scene(), null, null, null);
  managerReloaded.setWorldId(worldId);
  const loadedCount = managerReloaded.loadEntitiesFromStorage(storage as any);

  assert.equal(loadedCount, 0);
  assert.equal(managerReloaded.contraptions.length, 0);
});
