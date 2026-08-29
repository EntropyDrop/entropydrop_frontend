import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/engine/voxel/World.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';
import {
  WorldEditPersistence,
  worldEditStorageKey,
  type WorldEditStorage,
} from '../src/engine/voxel/WorldEditPersistence.ts';

class MemoryStorage implements WorldEditStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

class DeferredDurableStorage extends MemoryStorage {
  waitStarted = false;
  private releaseDurability: (() => void) | null = null;
  private readonly durable = new Promise<void>(resolve => {
    this.releaseDurability = resolve;
  });

  async whenIdle() {
    this.waitStarted = true;
    await this.durable;
  }

  release() {
    this.releaseDurability?.();
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for asynchronous world-edit sync');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

test('standard and micro terrain edits survive constructing a fresh world after refresh', () => {
  const storage = new MemoryStorage();
  const persistence = { worldId: 'refresh-test-world', storage };
  const first = new World(new THREE.Scene(), 1337, null, persistence) as any;

  // Added/recolored cells and AIR tombstones over generated terrain must both
  // survive. Without the tombstone, the y=0 block would regenerate on refresh.
  assert.equal(first.setBlock(40, 80, 48, BlockTypes.COLOR_BLOCK, false, 0x123456), true);
  assert.equal(first.setBlock(41, 0, 48, BlockTypes.AIR, false), true);

  // Persist standalone micro cells as well as the 125-cell subdivision path.
  assert.equal(first.setMicroBlock(42 * 5 + 1, 80 * 5 + 2, 48 * 5 + 3, 0xabcdef, 'tip'), true);
  assert.equal(first.setBlock(43, 80, 48, BlockTypes.COLOR_BLOCK, false, 0x55aa33), true);
  assert.equal(first.subdivideBlock(43, 80, 48), 125);
  assert.equal(first.removeMicroBlock(43 * 5 + 4, 80 * 5 + 4, 48 * 5 + 4), true);
  assert.equal(first.flushPersistedEdits(), true);

  const second = new World(new THREE.Scene(), 1337, null, persistence) as any;
  second.getOrCreateChunk(2, 3);

  assert.equal(second.getBlock(40, 80, 48), BlockTypes.COLOR_BLOCK);
  assert.equal(second.getBlockColor(40, 80, 48), 0x123456);
  assert.equal(second.getBlock(41, 0, 48), BlockTypes.AIR);
  assert.deepEqual(
    second.getMicroBlock(42 * 5 + 1, 80 * 5 + 2, 48 * 5 + 3),
    { block: BlockTypes.COLOR_BLOCK, color: 0xabcdef }
  );
  assert.equal(second.microVoxels.parts.get(`${42 * 5 + 1},${80 * 5 + 2},${48 * 5 + 3}`), 'tip');
  assert.equal(second.getBlock(43, 80, 48), BlockTypes.AIR);
  assert.equal(second.getMicroBlock(43 * 5, 80 * 5, 48 * 5)?.color, 0x55aa33);
  assert.equal(second.getMicroBlock(43 * 5 + 4, 80 * 5 + 4, 48 * 5 + 4), null);
});

test('world edit storage is isolated by world id and solid cells remove stale micro entries', () => {
  const storage = new MemoryStorage();
  const first = new WorldEditPersistence({ worldId: 'world-a', storage });
  first.recordMicro(51, 101, 151, 0xabcdef);
  first.recordStandard(10, 20, 30, BlockTypes.COLOR_BLOCK, 0x123456);
  assert.equal(first.flush(), true);

  const payload = JSON.parse(storage.getItem(worldEditStorageKey('world-a'))!);
  assert.deepEqual(payload.standard, [[10, 20, 30, BlockTypes.COLOR_BLOCK, 0x123456]]);
  assert.deepEqual(payload.micro, [], 'solid standard edit must clear micro cells in its parent cell');

  const otherWorld = new WorldEditPersistence({ worldId: 'world-b', storage });
  assert.deepEqual([...otherWorld.getStandardEditsForChunk(0, 1)], []);
  assert.deepEqual([...otherWorld.getMicroEdits()], []);
});

test('remote terrain mutations are split into stable batches of at most 256 operations', async () => {
  const storage = new MemoryStorage();
  const sent: { batchId: string; mutations: any[] }[] = [];
  const persistence = new WorldEditPersistence({
    worldId: 'remote-batch-world',
    storage,
    saveDelayMs: 0,
    remote: {
      chunks: [],
      async sendBatch(batchId, mutations) {
        sent.push({ batchId, mutations: structuredClone(mutations) });
      }
    }
  });

  for (let index = 0; index < 257; index++) {
    persistence.recordStandard(index, 80, 10, BlockTypes.COLOR_BLOCK, index);
  }
  await waitFor(() => sent.length === 2);

  assert.deepEqual(sent.map(batch => batch.mutations.length), [256, 1]);
  assert.equal(new Set(sent.map(batch => batch.batchId)).size, 2);
  const cached = JSON.parse(storage.getItem(worldEditStorageKey('remote-batch-world'))!);
  assert.deepEqual(cached.pendingBatches, []);
});

test('remote terrain outbox waits for IndexedDB durability before transmission', async () => {
  const storage = new DeferredDurableStorage();
  const sent: any[] = [];
  const persistence = new WorldEditPersistence({
    worldId: 'durable-outbox-world',
    storage,
    saveDelayMs: 0,
    remote: {
      chunks: [],
      async sendBatch(batchId, mutations) {
        sent.push({ batchId, mutations });
      }
    }
  });

  persistence.recordStandard(10, 80, 10, BlockTypes.COLOR_BLOCK, 0x123456);
  await waitFor(() => storage.waitStarted);
  assert.equal(sent.length, 0, 'network send must wait until the IndexedDB transaction commits');
  persistence.recordStandard(11, 80, 10, BlockTypes.COLOR_BLOCK, 0x654321);

  storage.release();
  await waitFor(() => sent.length === 2);
  assert.equal(sent[0].mutations[0].kind, 'set_standard');
  assert.deepEqual(sent.map(batch => batch.mutations.length), [1, 1]);
  assert.equal(new Set(sent.map(batch => batch.batchId)).size, 2);
});

test('legacy browser-local edits are replayed over the server snapshot and uploaded once', async () => {
  const storage = new MemoryStorage();
  const worldId = 'legacy-upload-world';
  storage.setItem(`space.world-edits.v1.${encodeURIComponent(worldId)}`, JSON.stringify({
    version: 1,
    worldId,
    standard: [[10, 80, 20, BlockTypes.COLOR_BLOCK, 0x123456]],
    micro: [[56, 401, 106, 0xabcdef]],
    savedAt: Date.now()
  }));
  const sent: any[] = [];

  const persistence = new WorldEditPersistence({
    worldId,
    storage,
    saveDelayMs: 0,
    remote: {
      chunks: [{
        chunk_x: 0,
        chunk_z: 1,
        revision: 1,
        standard: [[9, 80, 20, BlockTypes.COLOR_BLOCK, 0x999999]],
        micro: []
      }],
      async sendBatch(batchId, mutations) {
        sent.push({ batchId, mutations: structuredClone(mutations) });
      }
    }
  });
  await waitFor(() => sent.length === 1);

  assert.equal([...persistence.getStandardEditsForChunk(0, 1)].length, 2);
  assert.deepEqual(sent[0].mutations.map(item => item.kind), ['set_standard', 'set_micro']);
  assert.equal(storage.getItem(`space.world-edits.v1.${encodeURIComponent(worldId)}`), null);
});
