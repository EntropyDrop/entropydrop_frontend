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
