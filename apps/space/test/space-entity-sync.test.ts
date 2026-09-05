import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpaceEntitySync } from '../src/engine/network/SpaceEntitySync.ts';


const definition = Uint8Array.from([8, 4, 26, 0]);
const definitionDigest = '0caed08c0cdfe078464c77fbc4032b985d9757db85e8fac65733d57ee7fb5917';

function record() {
  return {
    id: '3cd7daba-d196-44e8-a433-cf139258f617',
    world_id: 'world-1',
    owner_user_id: 'owner-1',
    name: 'Walker',
    schema_version: 5,
    definition_digest: definitionDigest,
    definition_size_bytes: definition.byteLength,
    definition_url: '/definition',
    snapshot_digest: null,
    snapshot_size_bytes: 0,
    snapshot_url: null,
    position: { x_cm: 100, y_cm: 3200, z_cm: 200 },
    yaw_quarter_turns: 1,
    desired_run_state: 'running',
    revision: 1,
    can_control: true,
    can_edit: false,
    created_at: '2026-09-03T00:00:00+00:00',
    updated_at: '2026-09-03T00:00:00+00:00',
  };
}

function harness(currentUserId: string, overrides: Record<string, unknown> = {}) {
  const actions: string[] = [];
  const created: any[] = [];
  const manager: any = {
    contraptions: created,
    findActiveContraptionByPublicId: () => null,
    updateDormantServerEntity: () => false,
    buildFromSlot(_slot, origin) {
      let running = true;
      const entity: any = {
        publicId: 'temporary',
        position: origin.clone().add(new THREE.Vector3(1, 0, 0)),
        quaternion: new THREE.Quaternion(),
        localCenter: new THREE.Vector3(1, 0, 0),
        originWorldPos: origin.clone(),
        isPhysicsSimulationEnabled: () => running,
        updateTransform() {},
        setRunning(value: boolean) { running = value; },
        setPhysicsSimulationEnabled(value: boolean) { running = value; },
      };
      created.push(entity);
      return entity;
    },
    performBasicAction(command) {
      const running = command.action === 'start-scripts';
      command.target.contraption.setRunning(running);
      actions.push(command.action);
      return { ok: true };
    },
  };
  const fetchImpl = async (url: string | URL | Request, options: RequestInit = {}) => {
    if (String(url).includes('/definition?digest=')) return new Response(definition, { status: 200 });
    if (String(url).endsWith('/execution-leases')) {
      assert.notEqual(overrides.execution_mode, 'hosted', 'hosted entities never request browser leases');
      const request = JSON.parse(String(options.body));
      return new Response(JSON.stringify({
        instance_id: request.instance_id,
        lease_seconds: 8,
        items: [{
          entity_id: record().id,
          granted: true,
          execution_epoch: 1,
          lease_expires_at: new Date(Date.now() + 8_000).toISOString(),
        }],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ items: [{ ...record(), ...overrides }], truncated: false, limit: 256 }), { status: 200 });
  };
  const sync = new SpaceEntitySync({
    apiOrigin: 'https://api.example.test',
    token: 'token',
    worldId: 'world-1',
    currentUserId,
    controller: { parseInventoryImport: () => ({ ok: true, item: { blocks: [{}] } }) },
    contraptions: manager,
    world: { renderDistance: 8 },
    getPlayerPosition: () => ({ x: 1, z: 2 }),
    fetchImpl: fetchImpl as typeof fetch,
  });
  return { sync, created, actions };
}

test('the owner lease runs one browser entity at its exact quarter-turn construction origin', async () => {
  const { sync, created, actions } = harness('owner-1');

  await sync.poll();

  assert.equal(created.length, 1);
  assert.equal(created[0].publicId, record().id);
  assert.equal(created[0].serverExecutesLocally, true);
  assert.equal(created[0].isPhysicsSimulationEnabled(), true);
  assert.deepEqual(actions, []);
  assert.ok(created[0].originWorldPos.distanceTo(new THREE.Vector3(1, 32, 2)) < 1e-12);
  assert.ok(created[0].position.distanceTo(new THREE.Vector3(1, 32, 1)) < 1e-12);
});

test('a non-owner browser keeps the shared entity in stopped collision state', async () => {
  const { sync, created, actions } = harness('observer-1');

  await sync.poll();

  assert.equal(created[0].serverExecutesLocally, false);
  assert.equal(created[0].isPhysicsSimulationEnabled(), false);
  assert.deepEqual(actions, ['stop-scripts']);
});

test('hosted entities preserve the server pose without browser execution or global Stop', async () => {
  const { sync, created, actions } = harness('owner-1', { execution_mode: 'hosted', hosting_enabled: true });
  await sync.poll();
  const entity = created[0];
  assert.equal(entity.serverExecutesLocally, false);
  assert.equal(entity.serverExecutionMode, 'hosted');
  assert.equal(entity.serverHostingEnabled, true);
  assert.equal(entity.isPhysicsSimulationEnabled(), false);
  assert.deepEqual(actions, [], 'global Stop would erase the saved runtime pose');
  assert.ok(entity.position.distanceTo(new THREE.Vector3(1, 32, 1)) < 1e-12);
});
