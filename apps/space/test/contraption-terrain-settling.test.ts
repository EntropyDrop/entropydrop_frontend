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
  contraption.quaternion.setFromEuler(new THREE.Euler(0.4, 0, 0.7));

  const physics = new ContraptionPhysics(makeFloorWorld() as any);
  for (let frame = 0; frame < 600; frame++) physics.update(contraption, 1 / 60);

  const worldUp = new THREE.Vector3(0, 1, 0);
  const faceAlignment = Math.max(
    Math.abs(new THREE.Vector3(1, 0, 0).applyQuaternion(contraption.quaternion).dot(worldUp)),
    Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(contraption.quaternion).dot(worldUp)),
    Math.abs(new THREE.Vector3(0, 0, 1).applyQuaternion(contraption.quaternion).dot(worldUp))
  );

  assert.ok(faceAlignment > 0.995, `one block face should settle parallel to the floor, alignment=${faceAlignment}`);
  assert.ok(contraption.isOnGround, 'the settled block should remain supported by terrain');
  assert.ok(contraption.angularVelocity.length() < 0.03, 'the settled block should stop rotating');
});
