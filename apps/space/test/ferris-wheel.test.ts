import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLUEPRINTS } from '../src/engine/contraption/Blueprints.ts';
import { BodyType, Contraption } from '../src/engine/contraption/Contraption.ts';
import { ContraptionPhysics } from '../src/engine/physics/ContraptionPhysics.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';

test('ferris wheel uses kinematic drive and dynamic hinge cabins', () => {
  const blueprint = BLUEPRINTS.find(item => item.id === 'ferris_wheel');
  assert.ok(blueprint);

  const minX = Math.min(...blueprint.blocks.map(block => Math.floor(block.dx)));
  const minY = Math.min(...blueprint.blocks.map(block => Math.floor(block.dy)));
  const minZ = Math.min(...blueprint.blocks.map(block => Math.floor(block.dz)));
  const blocks = blueprint.blocks.map(block => ({
    localX: block.dx - minX,
    localY: block.dy - minY,
    localZ: block.dz - minZ,
    size: (block as any).size || 1,
    block: block.block,
    color: block.color
  }));
  const contraption = new Contraption(
    100,
    blocks,
    new THREE.Vector3(),
    new THREE.Scene(),
    { mode: blueprint.defaultMode, ...blueprint.defaultOptions }
  ) as any;

  const wheel = contraption.getEntityNode('wheel');
  const cabins = [...contraption.entityNodes.values()].filter(node => node.parentId === 'wheel');
  assert.equal(contraption.bodyType, BodyType.KINEMATIC);
  assert.equal(contraption.getNodeBodyType('wheel'), BodyType.KINEMATIC);
  assert.equal(cabins.length, 8);
  assert.ok(cabins.every(node => contraption.getNodeBodyType(node.id) === BodyType.DYNAMIC));
  assert.ok(cabins.every(node => contraption.blocks.some(block => block.entityId === node.id)));
  assert.equal(contraption.getConstraints().length, 8);
  assert.ok(contraption.getConstraints().every(constraint => constraint.type === 'hinge'));

  const cabin = contraption.getEntityNode('cabin_right');
  const cabinBody = contraption.getRigidBody(cabin.id);
  const startPosition = cabinBody.position.clone();
  const startRotation = contraption.getEntityNodeWorldQuaternion(cabin.id);
  const physics = new ContraptionPhysics({
    raycast: () => ({ hit: false }),
    raycastMicro: () => ({ hit: false }),
    getBlock: () => BlockTypes.AIR
  });

  for (let frame = 0; frame < 180; frame++) {
    contraption.update(1 / 60, null, { gravity: [0, -18, 0], world: null });
    physics.update(contraption, 1 / 60);
  }
  contraption.rootGroup.updateMatrixWorld(true);

  const endPosition = cabinBody.position.clone();
  const endRotation = contraption.getEntityNodeWorldQuaternion(cabin.id);
  const hinge = contraption.getConstraints(cabin.id)[0];
  const wheelBody = contraption.getRigidBody('wheel');
  const anchorA = physics.bodyAnchorWorld(wheelBody, hinge.anchorA);
  const anchorB = physics.bodyAnchorWorld(cabinBody, hinge.anchorB);
  const cabinUp = new THREE.Vector3(0, 1, 0).applyQuaternion(endRotation);
  assert.equal(wheel.localQuaternion.equals(new THREE.Quaternion()), false, 'wheel should rotate relative to the frame');
  assert.ok(startPosition.distanceTo(endPosition) > 1, 'dynamic cabin should orbit as the hinge anchor moves');
  assert.ok(anchorA.distanceTo(anchorB) < 0.08, 'hinge anchors should remain together');
  assert.ok(cabinUp.y > 0.8, 'gravity should keep the dynamic cabin mostly upright');
  assert.ok(startRotation.angleTo(endRotation) > 0.001, 'the cabin orientation should be solved physically, not frozen by counter-spin code');
});
