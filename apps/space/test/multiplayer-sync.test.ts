import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MultiplayerSync } from '../src/engine/network/MultiplayerSync.ts';
import { World } from '../src/engine/voxel/World.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';

test('MultiplayerSync polls heartbeat and dispatches player and terrain updates', async () => {
  let capturedUrl = '';
  let capturedBody: any = null;
  const mockPlayers = [
    {
      user_id: 'user_bob',
      username: 'Bob',
      player_entity_id: 'entity_bob',
      minecraft_skin_url: '/skin/bob.png',
      minecraft_skin_model: 'strong',
      x: 100,
      y: 64,
      z: 200,
      yaw: 1.5,
      is_self: false,
      updated_at: new Date().toISOString()
    }
  ];
  const mockChunks = [
    {
      chunk_x: 0,
      chunk_z: 0,
      revision: 5,
      standard: [[0, 64, 0, BlockTypes.COLOR_BLOCK, 0x123456]],
      micro: []
    }
  ];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    if (init?.body) {
      capturedBody = JSON.parse(String(init.body));
    }
    return new Response(JSON.stringify({
      world_id: 'world-123',
      players: mockPlayers,
      terrain_chunks: mockChunks,
      max_terrain_revision: 5
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    let receivedPlayers: any = null;
    let receivedChunks: any = null;

    const sync = new MultiplayerSync({
      apiOrigin: 'http://localhost:8000',
      token: 'jwt-test-token',
      worldId: 'world-123',
      currentUserId: 'user_alice',
      heartbeatIntervalMs: 50,
      onPlayersUpdate: (players) => {
        receivedPlayers = players;
      },
      onTerrainUpdate: (chunks) => {
        receivedChunks = chunks;
      }
    });

    sync.getPlayerPosition = () => ({
      x: 50,
      y: 64,
      z: 75,
      yaw: 0.5
    });

    sync.start();
    await new Promise(resolve => setTimeout(resolve, 80));
    sync.stop();

    assert.ok(capturedUrl.includes('/space/api/v2/worlds/world-123/heartbeat'));
    assert.equal(capturedBody.x_cm, 5000);
    assert.equal(capturedBody.y_cm, 6400);
    assert.equal(capturedBody.z_cm, 7500);
    assert.equal(capturedBody.yaw_q15, Math.round((0.5 / Math.PI) * 32767));
    assert.deepEqual(receivedPlayers, mockPlayers);
    assert.deepEqual(receivedChunks, mockChunks);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('MultiplayerSync normalizes large accumulated yaw angles without clamping', async () => {
  let capturedBody: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.body) {
      capturedBody = JSON.parse(String(init.body));
    }
    return new Response(JSON.stringify({
      world_id: 'world-123',
      players: [],
      terrain_chunks: [],
      max_terrain_revision: 0
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const sync = new MultiplayerSync({
      apiOrigin: 'http://localhost:8000',
      token: 'jwt-test-token',
      worldId: 'world-123',
      currentUserId: 'user_alice',
      heartbeatIntervalMs: 50
    });

    // 4 full turns + 0.5 rad (approx 25.63 rad)
    sync.getPlayerPosition = () => ({
      x: 10,
      y: 20,
      z: 30,
      yaw: Math.PI * 8 + 0.5
    });

    sync.start();
    await new Promise(resolve => setTimeout(resolve, 80));
    sync.stop();

    // Should normalize cleanly to 0.5 rad instead of clamping to 32767
    const expectedYawQ15 = Math.round((0.5 / Math.PI) * 32767);
    assert.equal(capturedBody.yaw_q15, expectedYawQ15);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('World.applyRemoteChunkUpdates updates loaded chunk blocks and microblocks in real time', () => {
  const scene = new THREE.Scene();
  const world = new World(scene, 12345);

  // Load chunk (0, 0)
  const chunk = world.getOrCreateChunk(0, 0);
  assert.ok(chunk);

  // Apply remote terrain update
  world.applyRemoteChunkUpdates([
    {
      chunk_x: 0,
      chunk_z: 0,
      revision: 1,
      standard: [
        [5, 40, 5, BlockTypes.COLOR_BLOCK, 0xff0000]
      ],
      micro: [
        [25, 200, 25, 0x00ff00, 'part_1']
      ]
    }
  ]);

  // Verify standard block edit is applied
  assert.equal(world.getBlock(5, 40, 5), BlockTypes.COLOR_BLOCK);
  assert.equal(world.getBlockColor(5, 40, 5), 0xff0000);

  // Verify microblock edit is applied
  const microColor = world.microVoxels.get(25, 200, 25);
  assert.equal(microColor, 0x00ff00);
  assert.equal(world.microVoxels.parts.get('25,200,25'), 'part_1');
});

test('remote chunk snapshots are cached without echoing them back as local mutations', async () => {
  const scene = new THREE.Scene();
  const sent: any[] = [];
  const world = new World(scene, 12345, null, {
    worldId: 'shared-world',
    storage: null,
    saveDelayMs: 0,
    remote: {
      chunks: [],
      async sendBatch(batchId, mutations) {
        sent.push({ batchId, mutations });
      }
    }
  });
  world.getOrCreateChunk(0, 0);

  world.applyRemoteChunkUpdates([{
    chunk_x: 0,
    chunk_z: 0,
    revision: 1,
    standard: [[5, 40, 5, BlockTypes.COLOR_BLOCK, 0x123456]],
    micro: [[30, 200, 25, 0x00ff00, 'remote']]
  }]);
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(sent.length, 0);
  assert.equal(world.getBlockColor(5, 40, 5), 0x123456);
  assert.equal(world.microVoxels.parts.get('30,200,25'), 'remote');
});
