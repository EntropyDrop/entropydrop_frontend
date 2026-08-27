import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ContraptionManager, worldEntitiesStorageKey } from '../src/engine/contraption/ContraptionManager.ts';
import { ContraptionMode } from '../src/engine/contraption/Contraption.ts';
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

  // Save to storage
  const saved = managerA.saveEntitiesToStorage(storage as any);
  assert.equal(saved, true);

  const raw = storage.getItem(worldEntitiesStorageKey(worldId));
  assert.ok(raw);
  const parsed = JSON.parse(raw);
  assert.equal(parsed.entities.length, 1);
  assert.equal(parsed.worldId, worldId);

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
