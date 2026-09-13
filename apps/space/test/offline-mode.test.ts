import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SpaceUiStore } from '../src/ui/react/store/SpaceUiStore.ts';


test('Space UI shows queue position and can cancel while remaining offline', async () => {
  const store = new SpaceUiStore();
  let cancelled = 0;
  store.setSessionState('offline', 12, async () => {
    cancelled += 1;
    store.setSessionState('offline', null, null);
  });

  assert.equal(store.getSnapshot().sessionMode, 'offline');
  assert.equal(store.getSnapshot().queuePosition, 12);
  await store.cancelSpaceQueue();
  assert.equal(cancelled, 1);
  assert.equal(store.getSnapshot().sessionMode, 'offline');
  assert.equal(store.getSnapshot().queuePosition, null);
});

test('a completed queue waits for the player to choose online or offline Space', async () => {
  const store = new SpaceUiStore();
  let enteredOnline = 0;
  let stayedOffline = 0;
  store.setSessionState(
    'offline',
    null,
    async () => {
      stayedOffline += 1;
      store.setSessionState('offline');
    },
    true,
    () => {
      enteredOnline += 1;
    }
  );

  assert.equal(store.getSnapshot().onlineReady, true);
  assert.equal(enteredOnline, 0);

  store.enterOnlineSpace();
  assert.equal(enteredOnline, 1);

  await store.cancelSpaceQueue();
  assert.equal(stayedOffline, 1);
  assert.equal(store.getSnapshot().sessionMode, 'offline');
  assert.equal(store.getSnapshot().onlineReady, false);
});

test('Space UI keeps skin setup guidance available in settings', () => {
  const store = new SpaceUiStore();
  assert.equal(store.getSnapshot().skinWarning, null);

  store.setSkinWarning('Default skin is in use.');
  assert.equal(store.getSnapshot().skinWarning, 'Default skin is in use.');
});


test('both Space welcome surfaces expose a direct offline entry', () => {
  const appHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const welcomeSource = readFileSync(
    new URL('../../../src/pages/SpacePage.tsx', import.meta.url),
    'utf8'
  );

  assert.match(appHtml, /\?mode=offline/);
  assert.match(welcomeSource, /offlineSpaceAppUrl/);
  assert.match(welcomeSource, /data\.offlineCta/);
});

test('main.ts ensures offline mode disables terrain persistence while keeping entity and backpack persistence', () => {
  const mainSource = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

  // Terrain edits must not be persisted in offline mode
  assert.match(mainSource, /session\.mode === 'offline'[\s\S]*?removeItem[\s\S]*?worldEditStorageKey/);
  assert.match(mainSource, /storage:\s*session\.mode === 'online'\s*\?\s*persistentStorage\s*:\s*null/);

  // Entities must be persisted in offline mode so they remain visible across page refresh
  assert.match(mainSource, /this\.contraptionManager\.setEntityPersistenceMode\(\s*session\.mode === 'online'\s*\?\s*'remote'\s*:\s*'browser'\s*\)/);
  assert.match(mainSource, /this\.contraptionManager\.loadEntitiesFromStorage\(\)/);

  // Suspension/unload must persist entities in offline mode
  assert.match(mainSource, /this\.contraptionManager\?\.saveEntitiesToStorage\?\.\(\)/);

  // Backpack must retain persistentStorage in both online and offline modes
  assert.match(mainSource, /new PlayerController\([\s\S]*?persistentStorage\s*\)/);
});

test('offline entity persistence survives refresh: entities saved in browser mode reload successfully', async () => {
  const { ContraptionManager, worldEntitiesStorageKey } = await import('@entropydrop/space-engine/contraption/ContraptionManager.ts');
  const { BlockTypes } = await import('@entropydrop/space-engine/voxel/BlockTypes.ts');
  const THREE = await import('three');
  const worldId = 'offline-sandbox-v1';
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
  };

  const scene = new THREE.Scene();
  const manager1 = new ContraptionManager(scene, null, null, null, mockStorage as any);
  manager1.setWorldId(worldId);
  manager1.setEntityPersistenceMode('browser');

  const slot = {
    rootComponentId: 'root',
    name: 'test-vehicle',
    blocks: [{
      localX: 0,
      localY: 0,
      localZ: 0,
      size: 1,
      color: 0x336699,
      block: BlockTypes.COLOR_BLOCK,
      entityId: 'root'
    }],
    childEntities: [],
    scripts: []
  };

  const pos = new THREE.Vector3(10, 20, 30);
  const created = manager1.buildFromSlot(slot, pos, null, true);
  assert.ok(created);
  assert.equal(manager1.contraptions.length, 1);
  assert.equal(store.has(worldEntitiesStorageKey(worldId)), true);

  // Simulate page refresh: a new game instance starts up
  const manager2 = new ContraptionManager(new THREE.Scene(), null, null, null, mockStorage as any);
  manager2.setWorldId(worldId);
  manager2.setEntityPersistenceMode('browser');
  const loadedCount = manager2.loadEntitiesFromStorage();

  assert.equal(loadedCount, 1);
  assert.equal(manager2.contraptions.length, 1);
  assert.equal(manager2.contraptions[0].position.x, manager1.contraptions[0].position.x);
  assert.equal(manager2.contraptions[0].position.y, manager1.contraptions[0].position.y);
  assert.equal(manager2.contraptions[0].position.z, manager1.contraptions[0].position.z);
});

test('WorldEditPersistence with storage null does not persist terrain edits', async () => {
  const { WorldEditPersistence } = await import('@entropydrop/space-engine/voxel/WorldEditPersistence.ts');
  const worldId = 'offline-sandbox-v1';
  const persistence = new WorldEditPersistence({
    worldId,
    storage: null,
  });

  persistence.recordStandard(10, 20, 30, 1, 0xff0000);
  persistence.recordMicro(80, 160, 240, 0x00ff00);
  const flushed = persistence.flush();
  assert.equal(flushed, false);
});

test('ContraptionManager in none mode does not persist or load entities and purges storage', async () => {
  const { ContraptionManager, worldEntitiesStorageKey } = await import('@entropydrop/space-engine/contraption/ContraptionManager.ts');
  const worldId = 'offline-sandbox-v1';
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
  };

  // Pre-seed legacy offline entity data
  store.set(worldEntitiesStorageKey(worldId), JSON.stringify({
    type: 'space-entities',
    version: 4,
    worldId,
    entities: [{ publicId: 'test-car', slot: { blocks: [] } }]
  }));

  const manager = new ContraptionManager(null, null, null, null, mockStorage as any);
  manager.setWorldId(worldId);

  // Setting mode to 'none' must purge existing offline storage
  manager.setEntityPersistenceMode('none');
  assert.equal(store.has(worldEntitiesStorageKey(worldId)), false);

  // Saving must be a no-op
  const saved = manager.saveEntitiesToStorage();
  assert.equal(saved, false);
  assert.equal(store.has(worldEntitiesStorageKey(worldId)), false);

  // Loading must return 0
  const loaded = manager.loadEntitiesFromStorage();
  assert.equal(loaded, 0);
});

