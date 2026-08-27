import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BodyType, Contraption, ContraptionMode } from '../src/engine/contraption/Contraption.ts';
import { ContraptionPhysics } from '../src/engine/physics/ContraptionPhysics.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';

/**
 * Entity collision covers dynamic/dynamic bounce, dynamic/kinematic collision,
 * mass-weighted separation, and zero-inverse-mass body pairs.
 */

function makePhysics() {
  return new ContraptionPhysics({
    raycast: () => ({ hit: false }),
    raycastMicro: () => ({ hit: false }),
    getBlock: () => BlockTypes.AIR
  });
}

function makeEntity(id, position, options = {}) {
  return new Contraption(
    id,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(position.x, position.y, position.z),
    new THREE.Scene(),
    { mode: ContraptionMode.FREE_PHYSICS, ...options }
  );
}

test('two approaching dynamic entities separate and bounce after collision', () => {
  const physics = makePhysics();
  const a = makeEntity(1, { x: 0, y: 10, z: 0 });
  const b = makeEntity(2, { x: 0.8, y: 10, z: 0 });
  assert.ok(0.8 < 1.0, 'test setup: two one-block entities initially overlap');

  a.velocity.set(2, 0, 0);
  b.velocity.set(-2, 0, 0);
  physics.resolveContraptionPairs([a, b]);

  const dist = a.position.distanceTo(b.position);
  assert.ok(dist > 0.8 + 1e-6, 'collision must push the entities apart');
  const normal = b.position.clone().sub(a.position).normalize();
  const relativeNormalVelocity = a.velocity.clone().sub(b.velocity).dot(normal);
  assert.ok(relativeNormalVelocity <= 1e-6, 'post-collision relative normal velocity must not approach');
});

test('a dynamic entity bounces off a kinematic entity while the kinematic entity stays still', () => {
  const physics = makePhysics();
  const kinematicEntity = makeEntity(10, { x: 2, y: 10, z: 0 }, { bodyType: BodyType.KINEMATIC });
  const mover = makeEntity(11, { x: 1.6, y: 10, z: 0 });
  const kinematicStart = kinematicEntity.position.clone();

  mover.velocity.set(3, 0, 0);
  physics.resolveContraptionPairs([mover, kinematicEntity]);

  assert.ok(mover.velocity.x < 0, 'the dynamic entity must bounce');
  assert.ok(mover.position.x < kinematicEntity.position.x, 'the dynamic entity should move outside the kinematic entity');
  assert.ok(kinematicEntity.position.distanceTo(kinematicStart) < 1e-6, 'the kinematic position should not change');
});

test('restitution controls the rebound speed of a dynamic body', () => {
  const physics = makePhysics();
  const collideAt = (restitution) => {
    const mover = makeEntity(`mover_${restitution}`, { x: 0, y: 10, z: 0 }, { restitution });
    const wall = makeEntity(`wall_${restitution}`, { x: 0.8, y: 10, z: 0 }, {
      bodyType: BodyType.KINEMATIC,
      restitution: 0
    });
    mover.velocity.set(2, 0, 0);
    physics.resolveContraptionPairs([mover, wall]);
    return mover.velocity.x;
  };

  const inelasticVelocity = collideAt(0);
  const elasticVelocity = collideAt(1);
  assert.ok(Math.abs(inelasticVelocity) < 1e-6, `zero restitution should stop normal rebound, got ${inelasticVelocity}`);
  assert.ok(elasticVelocity < -1.9, `full restitution should reverse nearly all normal speed, got ${elasticVelocity}`);
});

test('collision resolution changes no state when entities do not overlap', () => {
  const physics = makePhysics();
  const a = makeEntity(20, { x: 0, y: 10, z: 0 });
  const b = makeEntity(21, { x: 30, y: 10, z: 0 });
  const posA = a.position.clone();
  a.velocity.set(1, 0, 0);
  b.velocity.set(1, 0, 0);
  const velA = a.velocity.clone();

  physics.resolveContraptionPairs([a, b]);

  assert.ok(a.position.distanceTo(posA) < 1e-6, 'position should not change without overlap');
  assert.ok(a.velocity.distanceTo(velA) < 1e-6, 'velocity should not change without overlap');
});

test('mass-weighted separation moves the lighter entity farther', () => {
  const physics = makePhysics();
  const heavy = makeEntity(30, { x: 0, y: 10, z: 0 });
  const light = makeEntity(31, { x: 0.8, y: 10, z: 0 });
  // Increase the heavy entity's mass.
  heavy.mass = 100;

  physics.resolveContraptionPairs([heavy, light]);

  const heavyShift = heavy.position.x - 0;
  const lightShift = light.position.x - 0.8;
  assert.ok(lightShift > heavyShift, 'the lighter entity should move farther');
  assert.ok(light.position.x - heavy.position.x > 0.8, 'entities must separate');
});

test('a kinematic body pushes a dynamic body without being displaced', () => {
  const physics = makePhysics();
  const kinematic = new Contraption(
    40,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(0.8, 10, 0),
    new THREE.Scene(),
    { mode: ContraptionMode.BEARING, bodyType: BodyType.KINEMATIC }
  );
  const mover = makeEntity(41, { x: 0, y: 10, z: 0 });
  const start = mover.position.clone();
  mover.velocity.set(2, 0, 0);

  physics.resolveContraptionPairs([mover, kinematic]);

  assert.ok(mover.position.distanceTo(start) > 1e-6, 'a kinematic entity should separate the dynamic mover');
  assert.deepEqual(kinematic.position.toArray(), [1.3, 10.5, 0.5], 'kinematic pose should not be corrected');
});

test('kinematic entities do not resolve against each other', () => {
  const physics = makePhysics();
  const s1 = makeEntity(50, { x: 0, y: 10, z: 0 }, { bodyType: BodyType.KINEMATIC });
  const s2 = makeEntity(51, { x: 1.0, y: 10, z: 0 }, { bodyType: BodyType.KINEMATIC });
  const p1 = s1.position.clone();
  const p2 = s2.position.clone();

  physics.resolveContraptionPairs([s1, s2]);

  assert.ok(s1.position.distanceTo(p1) < 1e-6 && s2.position.distanceTo(p2) < 1e-6, 'kinematic/kinematic collision should not resolve');
});

test('entity broadphase skips narrow-phase work for spatially separated bodies', () => {
  const physics = makePhysics() as any;
  const entities = Array.from({ length: 40 }, (_, index) => (
    makeEntity(100 + index, { x: index * 128, y: 10, z: 0 })
  ));
  let narrowPhaseCalls = 0;
  physics.resolveContraptionPair = () => { narrowPhaseCalls++; };

  physics.resolveContraptionPairs(entities);
  assert.equal(narrowPhaseCalls, 0, 'separated entities should never enter narrow phase');

  const nearby = makeEntity(999, { x: 0.5, y: 10, z: 0 });
  physics.resolveContraptionPairs([entities[0], nearby]);
  assert.equal(narrowPhaseCalls, 1, 'nearby entities should remain collision candidates');
});
