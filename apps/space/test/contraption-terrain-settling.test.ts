import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BodyType, Contraption } from '../src/engine/contraption/Contraption.ts';
import { ContraptionPhysics } from '../src/engine/physics/ContraptionPhysics.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';

function makeFloorWorld() {
  return {
    getBlock: (_x, y, _z) => y <= 0 ? BlockTypes.COLOR_BLOCK : BlockTypes.AIR,
    raycast: () => ({ hit: false, distance: 0 }),
    raycastMicro: () => ({ hit: false, distance: 0 }),
    microVoxels: { get: () => null }
  };
}

function makeSingleBlockWorld() {
  return {
    getBlock: (x, y, z) => (x === 0 && y === 0 && z === 0)
      ? BlockTypes.COLOR_BLOCK
      : BlockTypes.AIR,
    raycast: (origin, direction, maxDistance) => {
      if (!(direction.y < -1e-8) || origin.y <= 1) return { hit: false };
      const distance = (1 - origin.y) / direction.y;
      if (!(distance >= 0 && distance <= maxDistance)) return { hit: false };
      const x = origin.x + direction.x * distance;
      const z = origin.z + direction.z * distance;
      return x >= -1e-8 && x <= 1 + 1e-8 && z >= -1e-8 && z <= 1 + 1e-8
        ? { hit: true, distance, normal: { x: 0, y: 1, z: 0 } }
        : { hit: false };
    },
    raycastMicro: () => ({ hit: false, distance: 0 }),
    microVoxels: { get: () => null }
  };
}

test('a block dropped from height settles on one terrain block without embedding', () => {
  const contraption = new Contraption(
    0,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(0, 20, 0),
    new THREE.Scene(),
    { bodyType: BodyType.DYNAMIC, restitution: 0.01 }
  );
  const physics = new ContraptionPhysics(makeSingleBlockWorld() as any);
  let minimumBottom = Infinity;

  for (let frame = 0; frame < 600; frame++) {
    physics.update(contraption, 1 / 60);
    minimumBottom = Math.min(minimumBottom, contraption.getCollisionWorldAABBs()[0].currentMinY);
  }

  assert.ok(minimumBottom > 0.98, `falling body must not embed into the terrain block, bottom=${minimumBottom}`);
  assert.ok(Math.abs(contraption.position.y - 1.5) < 0.02, `falling body should rest on the terrain block, y=${contraption.position.y}`);
  assert.ok(Math.abs(contraption.velocity.y) < 0.05, `resting vertical velocity should be near zero, vy=${contraption.velocity.y}`);
});

test('a tilted dynamic block topples onto a stable face under gravity', () => {
  const contraption = new Contraption(
    1,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(10, 5, 10),
    new THREE.Scene(),
    { bodyType: BodyType.DYNAMIC }
  );
  // Near-edge balance used to expose the worst slow-motion case: the block
  // could spend more than 20 seconds creeping away from this pose.
  contraption.quaternion.setFromEuler(new THREE.Euler(0.1, 0, 0.78));

  const physics = new ContraptionPhysics(makeFloorWorld() as any);
  const faceAlignment = () => Math.max(
    Math.abs(new THREE.Vector3(1, 0, 0).applyQuaternion(contraption.quaternion).y),
    Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(contraption.quaternion).y),
    Math.abs(new THREE.Vector3(0, 0, 1).applyQuaternion(contraption.quaternion).y)
  );

  let stableFrame = null;
  for (let frame = 0; frame < 600; frame++) {
    physics.update(contraption, 1 / 60);
    if (stableFrame === null && faceAlignment() > 0.995) stableFrame = frame + 1;
  }

  assert.ok(stableFrame !== null && stableFrame <= 240, `the block should topple within 4 seconds, frame=${stableFrame}`);
  assert.ok(faceAlignment() > 0.995, `one block face should settle parallel to the floor, alignment=${faceAlignment()}`);
  assert.ok(contraption.isOnGround, 'the settled block should remain supported by terrain');
  assert.ok(contraption.angularVelocity.length() < 0.03, 'the settled block should stop rotating');
});

test('low restitution settles a long body without repeated launch bounces', () => {
  const blocks = [0, 1, 2].map(localX => ({
    localX,
    localY: 0,
    localZ: 0,
    block: BlockTypes.COLOR_BLOCK
  }));
  const contraption = new Contraption(
    2,
    blocks,
    new THREE.Vector3(10, 5, 10),
    new THREE.Scene(),
    { bodyType: BodyType.DYNAMIC, restitution: 0.01 }
  );
  contraption.quaternion.setFromEuler(new THREE.Euler(0.4, 0, 0.7));

  const physics = new ContraptionPhysics(makeFloorWorld() as any);
  let firstGroundHeight = null;
  let leftGroundCount = 0;
  let wasOnGround = false;
  let maxRiseAfterContact = 0;
  for (let frame = 0; frame < 600; frame++) {
    physics.update(contraption, 1 / 60);
    if (contraption.isOnGround && firstGroundHeight === null) firstGroundHeight = contraption.position.y;
    if (wasOnGround && !contraption.isOnGround) leftGroundCount++;
    if (firstGroundHeight !== null) {
      maxRiseAfterContact = Math.max(maxRiseAfterContact, contraption.position.y - firstGroundHeight);
    }
    wasOnGround = contraption.isOnGround;
  }

  assert.ok(leftGroundCount <= 1, `low restitution should not repeatedly leave the floor, count=${leftGroundCount}`);
  assert.ok(maxRiseAfterContact < 0.25, `settling must not inject launch energy, rise=${maxRiseAfterContact}`);
  assert.ok(contraption.isOnGround, 'the long body should finish on the floor');
  assert.ok(contraption.velocity.length() < 0.05, 'the long body should finish without linear bounce');
});

test('terrain wall collision resolves sideways without climbing or frame rewind', () => {
  const wallWorld = {
    getBlock: (x, y, _z) => (y <= 0 || (x === 12 && y <= 4))
      ? BlockTypes.COLOR_BLOCK
      : BlockTypes.AIR,
    raycast: () => ({ hit: false, distance: 0 }),
    raycastMicro: () => ({ hit: false, distance: 0 }),
    microVoxels: { get: () => null }
  };
  const contraption = new Contraption(
    3,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(10, 1, 10),
    new THREE.Scene(),
    { bodyType: BodyType.DYNAMIC, restitution: 0.01, friction: 0 }
  );
  contraption.velocity.x = 20;

  const physics = new ContraptionPhysics(wallWorld as any);
  let maxX = contraption.position.x;
  let maxY = contraption.position.y;
  let maxVerticalFrameStep = 0;
  let previousY = contraption.position.y;
  for (let frame = 0; frame < 180; frame++) {
    physics.update(contraption, 1 / 60);
    maxX = Math.max(maxX, contraption.position.x);
    maxY = Math.max(maxY, contraption.position.y);
    maxVerticalFrameStep = Math.max(maxVerticalFrameStep, Math.abs(contraption.position.y - previousY));
    previousY = contraption.position.y;
  }

  assert.ok(maxX < 11.55, `the body must not tunnel through the wall, maxX=${maxX}`);
  assert.ok(maxY < 2, `a side collision must not climb the wall, maxY=${maxY}`);
  assert.ok(maxVerticalFrameStep < 0.2, `collision correction must not jump between frame histories, step=${maxVerticalFrameStep}`);
  assert.ok(Math.abs(contraption.position.y - 1.5) < 0.02, 'the body should settle back on the floor');
});

test('terrain collision sweeps across a standard wall during a stalled frame', () => {
  const wallX = 12;
  const wallWorld = {
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
  // 25m/s ends a sub-step deep inside the wall; 60m/s skips the whole voxel.
  // Both must use the entry face instead of choosing the nearer exit face.
  for (const speed of [25, 60]) {
    const contraption = new Contraption(
      5,
      [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
      new THREE.Vector3(10, 1, 10),
      new THREE.Scene(),
      { bodyType: BodyType.DYNAMIC, restitution: 0.01, friction: 0 }
    );
    contraption.useGravity = false;
    contraption.velocity.x = speed;

    new ContraptionPhysics(wallWorld as any).update(contraption, 0.08);

    assert.ok(contraption.position.x < 11.55, `the body must stop at the swept wall at ${speed}m/s, x=${contraption.position.x}`);
    assert.ok(contraption.velocity.x < 1, `the wall must cancel ${speed}m/s approaching velocity, vx=${contraption.velocity.x}`);
  }
});

test('terrain collision sweeps across a 0.2m micro wall', () => {
  const wallX = 12;
  const wallMicroX = wallX * 5;
  const wallWorld = {
    getBlock: () => BlockTypes.AIR,
    getMicroBlock: (mx) => mx === wallMicroX ? { block: BlockTypes.COLOR_BLOCK } : null,
    raycast: () => ({ hit: false }),
    raycastMicro: (origin, direction, maxDistance) => {
      if (!(direction.x > 0) || origin.x >= wallX) return { hit: false };
      const distance = (wallX - origin.x) / direction.x;
      return distance <= maxDistance
        ? { hit: true, distance, normal: { x: -1, y: 0, z: 0 } }
        : { hit: false };
    },
    microVoxels: { get: () => null }
  };
  const contraption = new Contraption(
    6,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(10, 1, 10),
    new THREE.Scene(),
    { bodyType: BodyType.DYNAMIC, restitution: 0.01, friction: 0 }
  );
  contraption.useGravity = false;
  contraption.velocity.x = 20;

  new ContraptionPhysics(wallWorld as any).update(contraption, 0.08);

  assert.ok(contraption.position.x < 11.55, `the body must not skip the micro wall, x=${contraption.position.x}`);
  assert.ok(contraption.velocity.x <= 0, `the micro wall must cancel approaching velocity, vx=${contraption.velocity.x}`);
});

test('persistent high force cannot push a dynamic body through terrain', () => {
  const wallX = 12;
  const wallWorld = {
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
  const contraption = new Contraption(
    7,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(10, 1, 10),
    new THREE.Scene(),
    { bodyType: BodyType.DYNAMIC, restitution: 0, friction: 0 }
  );
  contraption.useGravity = false;
  const physics = new ContraptionPhysics(wallWorld as any);
  let maxX = contraption.position.x;
  for (let frame = 0; frame < 120; frame++) {
    contraption.appliedForces.set(1_000_000, 0, 0);
    physics.update(contraption, 1 / 60);
    maxX = Math.max(maxX, contraption.position.x);
  }

  assert.ok(maxX < 11.51, `continuous force must not tunnel through the wall, maxX=${maxX}`);
});

test('fast rotation increases physics substeps to keep swept arcs collision-safe', () => {
  const contraption = new Contraption(
    8,
    [0, 1, 2, 3].map(localX => ({
      localX,
      localY: 0,
      localZ: 0,
      block: BlockTypes.COLOR_BLOCK
    })),
    new THREE.Vector3(10, 8, 10),
    new THREE.Scene(),
    { bodyType: BodyType.DYNAMIC }
  );
  contraption.useGravity = false;
  contraption.angularVelocity.set(0, 80, 0);
  const physics = new ContraptionPhysics({
    getBlock: () => BlockTypes.AIR,
    raycast: () => ({ hit: false }),
    raycastMicro: () => ({ hit: false }),
    microVoxels: { get: () => null }
  } as any) as any;
  const resolveTerrainCollisionBody = physics.resolveTerrainCollisionBody.bind(physics);
  let collisionSubsteps = 0;
  physics.resolveTerrainCollisionBody = (...args) => {
    collisionSubsteps++;
    return resolveTerrainCollisionBody(...args);
  };

  physics.update(contraption, 0.08);

  assert.ok(collisionSubsteps > 2, `fast angular motion must use more than the fixed two substeps, count=${collisionSubsteps}`);
  assert.ok(collisionSubsteps <= 16, `adaptive substeps must remain bounded, count=${collisionSubsteps}`);
});

test('resting terrain contact remains stable across physics frames', () => {
  const contraption = new Contraption(
    4,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(10, 1, 10),
    new THREE.Scene(),
    { bodyType: BodyType.DYNAMIC, restitution: 0.01 }
  );
  const physics = new ContraptionPhysics(makeFloorWorld() as any);
  for (let frame = 0; frame < 180; frame++) physics.update(contraption, 1 / 60);

  let minY = Infinity;
  let maxY = -Infinity;
  for (let frame = 0; frame < 180; frame++) {
    physics.update(contraption, 1 / 60);
    assert.ok(contraption.isOnGround, `grounded state must not flicker at frame ${frame}`);
    minY = Math.min(minY, contraption.position.y);
    maxY = Math.max(maxY, contraption.position.y);
  }
  assert.ok(maxY - minY < 0.01, `resting pose should not jitter, range=${maxY - minY}`);
});
