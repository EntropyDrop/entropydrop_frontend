import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ActionDomain, executeBasicAction } from '../src/engine/actions/BasicActions.ts';
import { BodyType, Contraption } from '../src/engine/contraption/Contraption.ts';
import { ContraptionPhysics } from '../src/engine/physics/ContraptionPhysics.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';

const block = (x) => ({
  localX: x,
  localY: 0,
  localZ: 0,
  size: 1,
  block: BlockTypes.COLOR_BLOCK,
  color: 0xf2a93b
});

function makePhysics() {
  return new ContraptionPhysics({
    raycast: () => ({ hit: false }),
    raycastMicro: () => ({ hit: false }),
    getBlock: () => BlockTypes.AIR
  });
}

test('body type, mass and restitution use the shared physics action API', () => {
  const contraption = new Contraption(
    1,
    [block(0), block(1)],
    new THREE.Vector3(),
    new THREE.Scene(),
    {
      bodyType: BodyType.KINEMATIC,
      childEntities: [{
        id: 'payload',
        parentId: 'root',
        pivot: [1.5, 0.5, 0.5],
        bodyType: BodyType.DYNAMIC,
        blockKeys: [[1, 0, 0]]
      }]
    }
  ) as any;

  const payload = contraption.getChildScriptApi('payload');
  assert.equal(contraption.scriptApi.body.getMass(), 10, 'one root-owned block should weigh 10 kg');
  assert.equal(payload.body.getMass(), 10, 'one child-owned block should weigh 10 kg');
  assert.deepEqual(contraption.scriptApi.body.getMaterial(), { restitution: 0.1, friction: 0.7 });

  const payloadBody = contraption.getRigidBody('payload');
  const defaultInverseInertia = payloadBody.inverseInertia;
  assert.deepEqual(payload.body.setMass(40), { ok: true, mass: 40, reason: 'updated' });
  assert.equal(payload.body.getMass(), 40);
  assert.ok(
    Math.abs(payloadBody.inverseInertia - defaultInverseInertia / 4) < 1e-12,
    'inertia should scale with an explicit mass change'
  );
  assert.deepEqual(payload.body.setMass(0), { ok: false, mass: 40, reason: 'invalid_mass' });

  const materialResult = payload.body.setMaterial({ restitution: 0.72, friction: 0.35 });
  assert.equal(materialResult.ok, true);
  assert.deepEqual(payload.body.getMaterial(), { restitution: 0.72, friction: 0.35 });

  const typeResult = executeBasicAction({ contraption }, {
    domain: ActionDomain.PHYSICS,
    action: 'set-body-type',
    target: { contraption },
    nodeId: 'payload',
    bodyType: BodyType.KINEMATIC
  });
  assert.equal(typeResult.ok, true);
  assert.equal(payload.body.getType(), BodyType.KINEMATIC);
  assert.equal(payload.body.applyForce([10, 0, 0]), false, 'kinematic bodies ignore forces');

  payload.body.setType(BodyType.DYNAMIC);
  assert.equal(payload.body.applyForce([10, 0, 0]), true, 'dynamic bodies accept forces');

  // Default root mass follows owned block count, while an explicit child mass
  // remains stable through the same hierarchy rebuild.
  contraption.blocks.push(block(2));
  contraption.rebuildAfterBlockChange();
  assert.equal(contraption.scriptApi.body.getMass(), 20);
  assert.equal(contraption.getChildScriptApi('payload').body.getMass(), 40);
  assert.deepEqual(contraption.scriptApi.body.setMass(55), { ok: true, mass: 55, reason: 'updated' });
  contraption.blocks.push(block(3));
  contraption.rebuildAfterBlockChange();
  assert.equal(contraption.scriptApi.body.getMass(), 55, 'manual root mass should survive rebuilding');

  const slot = contraption.serializeSubtree('root');
  assert.equal('fixed' in slot, false, 'new serialization must not write the removed fixed flag');
  assert.equal(slot.bodyType, BodyType.KINEMATIC);
  assert.equal(slot.mass, 55, 'manual root mass should serialize');
  assert.equal(slot.childEntities.find(def => def.id === 'payload').bodyType, BodyType.DYNAMIC);
  assert.equal(slot.childEntities.find(def => def.id === 'payload').mass, 40, 'manual child mass should serialize');
});

test('automatic mass is omitted from serialization so copied bodies keep following block count', () => {
  const contraption = new Contraption(
    2,
    [block(0), block(1), block(2)],
    new THREE.Vector3(),
    new THREE.Scene()
  ) as any;
  assert.equal(contraption.mass, 30);
  assert.equal(contraption.restitution, 0.1);
  assert.equal('mass' in contraption.serializeSubtree('root'), false);
});

test('legacy fixed input migrates to kinematic without exposing fixed runtime state', () => {
  const legacy = new Contraption(
    10,
    [block(0)],
    new THREE.Vector3(),
    new THREE.Scene(),
    { fixed: true }
  ) as any;
  assert.equal(legacy.bodyType, BodyType.KINEMATIC);
  assert.equal(legacy.fixed, undefined);
  assert.equal(legacy.scriptApi.setFixed, undefined);
  assert.equal('fixed' in legacy.serializeSubtree('root'), false);
});

test('constraint API supports a named world anchor and structured lifecycle results', () => {
  const contraption = new Contraption(
    11,
    [block(0)],
    new THREE.Vector3(4, 8, 4),
    new THREE.Scene(),
    { bodyType: BodyType.DYNAMIC }
  ) as any;

  const created = contraption.scriptApi.constraints.create({
    type: 'hinge',
    other: 'world',
    axisA: [0, 0, 1],
    axisB: [0, 0, 1],
    stiffness: 2,
    collideConnected: true
  });
  assert.deepEqual(created, { ok: true, id: 'hinge_world_root', reason: 'created' });

  const [definition] = contraption.scriptApi.constraints.all();
  assert.equal(definition.id, created.id);
  assert.equal(definition.bodyA, 'world');
  assert.equal(definition.bodyB, 'root');
  assert.equal(definition.stiffness, 1, 'stiffness should clamp to [0,1]');
  assert.equal(definition.collideConnected, true);
  assert.equal(contraption.scriptApi.constraints.remove(created.id), true);
  assert.equal(contraption.scriptApi.constraints.remove(created.id), false);
});

test('point constraint keeps a dynamic child attached to a kinematic parent', () => {
  const contraption = new Contraption(
    2,
    [block(0), block(1)],
    new THREE.Vector3(0, 8, 0),
    new THREE.Scene(),
    {
      bodyType: BodyType.KINEMATIC,
      childEntities: [{
        id: 'payload',
        parentId: 'root',
        pivot: [1.5, 0.5, 0.5],
        bodyType: BodyType.DYNAMIC,
        blockKeys: [[1, 0, 0]]
      }],
      constraints: [{ id: 'payload_point', type: 'point', bodyA: 'root', bodyB: 'payload' }]
    }
  ) as any;
  const physics = makePhysics();

  for (let frame = 0; frame < 120; frame++) {
    contraption.update(1 / 60, null, { gravity: [0, -18, 0], world: null });
    physics.update(contraption, 1 / 60);
  }

  const constraint = contraption.getConstraints('payload')[0];
  const anchorA = physics.bodyAnchorWorld(contraption.getRigidBody('root'), constraint.anchorA);
  const anchorB = physics.bodyAnchorWorld(contraption.getRigidBody('payload'), constraint.anchorB);
  assert.ok(anchorA.distanceTo(anchorB) < 0.02);
});

test('hinge angle limits constrain rotation around the free axis', () => {
  const contraption = new Contraption(
    3,
    [block(0), block(1)],
    new THREE.Vector3(0, 8, 0),
    new THREE.Scene(),
    {
      bodyType: BodyType.KINEMATIC,
      childEntities: [{
        id: 'door',
        parentId: 'root',
        pivot: [1.5, 0.5, 0.5],
        bodyType: BodyType.DYNAMIC,
        blockKeys: [[1, 0, 0]]
      }],
      constraints: [{
        id: 'door_hinge',
        type: 'hinge',
        bodyA: 'root',
        bodyB: 'door',
        axisA: [0, 0, 1],
        axisB: [0, 0, 1],
        limits: { min: -0.2, max: 0.2 }
      }]
    }
  ) as any;
  const physics = makePhysics();
  const body = contraption.getRigidBody('door');
  body.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.8);
  contraption.syncAllBodyTransforms();

  contraption.update(1 / 60, null, { gravity: [0, -18, 0], world: null });
  physics.update(contraption, 1 / 60);

  const rootQ = contraption.getRigidBody('root').quaternion;
  const relative = rootQ.clone().invert().multiply(body.quaternion);
  const angle = new THREE.Euler().setFromQuaternion(relative, 'XYZ').z;
  assert.ok(Math.abs(angle) <= 0.22, `hinge angle should be limited, got ${angle}`);
});
