import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLUEPRINTS, spawnBlueprintInWorld } from '../src/engine/contraption/Blueprints.ts';
import { Contraption } from '../src/engine/contraption/Contraption.ts';
import { ContraptionManager } from '../src/engine/contraption/ContraptionManager.ts';
import { ContraptionPhysics } from '../src/engine/physics/ContraptionPhysics.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';
import { World } from '../src/engine/voxel/World.ts';

/**
 * Helicopter blueprint: dynamic skid hull, virtual main-rotor lift,
 * cyclic pitch/roll/yaw torques, and kinematic main/tail rotor children.
 */

function heliBlueprint() {
  const blueprint = BLUEPRINTS.find(item => item.id === 'helicopter');
  assert.ok(blueprint, 'the helicopter blueprint exists');
  return blueprint;
}

/** Build the entity directly from blueprint blocks (entity-local space). */
function buildHelicopterEntity(id: number) {
  const blueprint = heliBlueprint();
  const xs = blueprint.blocks.map((block: any) => Math.floor(block.dx));
  const ys = blueprint.blocks.map((block: any) => Math.floor(block.dy));
  const zs = blueprint.blocks.map((block: any) => Math.floor(block.dz));
  const minX = Math.min(...xs), minY = Math.min(...ys), minZ = Math.min(...zs);
  const blocks = blueprint.blocks.map((block: any) => ({
    localX: block.dx - minX,
    localY: block.dy - minY,
    localZ: block.dz - minZ,
    size: block.size || 1,
    block: block.block,
    color: block.color
  }));
  return new Contraption(
    id,
    blocks,
    new THREE.Vector3(0, 3.5, 0),
    new THREE.Scene(),
    { mode: blueprint.defaultMode, ...blueprint.defaultOptions }
  ) as any;
}

function airPhysics() {
  return new ContraptionPhysics({
    getBlock: () => BlockTypes.AIR,
    raycast: point => ({ hit: true, distance: Math.max(0, point.y) }),
    raycastMicro: () => ({ hit: false })
  });
}

test('helicopter blueprint is a dynamic hull with spinning main and tail rotor children', () => {
  const blueprint = heliBlueprint();
  const microBlocks = blueprint.blocks.filter((block: any) => block.size === 0.2);
  const childDefs = blueprint.defaultOptions.childEntities;
  assert.equal(blueprint.blocks.length, 35, '20 hull blocks + 15 rotor micros');
  assert.equal(microBlocks.length, 15, '10 main rotor micros + 5 tail rotor micros');
  assert.deepEqual(childDefs.map((d: any) => d.id).sort(), ['main_rotor', 'tail_rotor']);

  const scene = new THREE.Scene();
  const world = new World(scene) as any;
  const origin = { x: 10, y: 20, z: 10 };
  // Clear the placement area: torus terrain can occupy cells up to y=30.
  for (let x = origin.x - 3; x <= origin.x + 3; x++) {
    for (let y = origin.y - 1; y <= origin.y + 5; y++) {
      for (let z = origin.z - 3; z <= origin.z + 8; z++) {
        world.setBlock(x, y, z, BlockTypes.AIR, false);
      }
    }
  }
  spawnBlueprintInWorld(blueprint, world, origin.x, origin.y, origin.z);
  assert.equal(world.microVoxels.cells.size, 15);

  const xs = blueprint.blocks.map((block: any) => Math.floor(block.dx));
  const ys = blueprint.blocks.map((block: any) => Math.floor(block.dy));
  const zs = blueprint.blocks.map((block: any) => Math.floor(block.dz));
  const bounds = {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
    minZ: Math.min(...zs), maxZ: Math.max(...zs)
  };
  const manager = new ContraptionManager(scene, world, null, null);
  manager.setCornerA({ x: origin.x + bounds.minX, y: origin.y + bounds.minY, z: origin.z + bounds.minZ });
  manager.setCornerB({ x: origin.x + bounds.maxX, y: origin.y + bounds.maxY, z: origin.z + bounds.maxZ });
  const contraption = manager.assembleSelection(blueprint.defaultMode, blueprint.defaultOptions) as any;

  assert.ok(contraption);
  assert.equal(contraption.entityNodes.size, 3, 'root plus main and tail rotor children');
  assert.equal(contraption.bodyType, 'dynamic', 'the hull is a dynamic root so forces and torques apply');
  assert.equal(contraption.blocks.filter((b: any) => (b.entityId || 'root') === 'main_rotor').length, 10);
  assert.equal(contraption.blocks.filter((b: any) => (b.entityId || 'root') === 'tail_rotor').length, 5);
  assert.equal(contraption.blocks.filter((b: any) => (b.entityId || 'root') === 'root').length, 20);

  // A level hover commands both rotors to spin and lifts the hull.
  contraption.groundDistance = 4.0;
  contraption.update(1 / 60, {}, { gravity: [0, -18, 0], world: null });
  const mainNode = contraption.getEntityNode('main_rotor');
  const tailNode = contraption.getEntityNode('tail_rotor');
  assert.ok(mainNode.localAngularVelocity.length() > 0, 'the main rotor spins');
  assert.ok(tailNode.localAngularVelocity.length() > 0, 'the tail rotor spins');
  assert.ok(contraption.appliedForces.y > contraption.mass * 17, 'lift should approximately counter gravity');
  assert.ok(contraption.appliedForces.x === 0 && contraption.appliedForces.z === 0, 'hover lift has no lateral component');
});

test('helicopter cyclic recovers from a pitch and roll disturbance', () => {
  const contraption = buildHelicopterEntity(21);
  contraption.groundDistance = 4.0;
  contraption.quaternion.setFromEuler(new THREE.Euler(0.25, 0, -0.18, 'YXZ'));
  const physics = airPhysics();

  for (let frame = 0; frame < 360; frame++) {
    contraption.update(1 / 60, {}, { gravity: [0, -18, 0], world: null });
    physics.update(contraption, 1 / 60);
  }

  const attitude = new THREE.Euler().setFromQuaternion(contraption.quaternion, 'YXZ');
  assert.ok(Math.abs(attitude.x) < 0.01, `pitch should recover to level: ${attitude.x.toFixed(3)}`);
  assert.ok(Math.abs(attitude.z) < 0.01, `roll should recover to level: ${attitude.z.toFixed(3)}`);
  assert.ok(Math.abs(contraption.position.y - 4.0) < 0.05, `hover should hold the target altitude: ${contraption.position.y.toFixed(2)}`);
  assert.ok(Math.abs(contraption.velocity.y) < 0.05, 'hover should maintain stable vertical velocity');
});

test('holding W pitches the helicopter down and flies it forward', () => {
  const contraption = buildHelicopterEntity(22);
  contraption.groundDistance = 4.0;
  const physics = airPhysics();
  const input = { down: new Set(['KeyW']), pressed: new Set(), released: new Set() };

  for (let frame = 0; frame < 300; frame++) {
    contraption.update(1 / 60, input, { gravity: [0, -18, 0], world: null });
    physics.update(contraption, 1 / 60);
  }

  const attitude = new THREE.Euler().setFromQuaternion(contraption.quaternion, 'YXZ');
  assert.ok(attitude.x < -0.08, `W should pitch the helicopter down: pitch=${attitude.x.toFixed(3)}`);
  assert.ok(contraption.velocity.z < -0.5, `tilted lift should drive forward: vel.z=${contraption.velocity.z.toFixed(2)}`);
  assert.ok(contraption.position.z < 0, `position should move forward: pos.z=${contraption.position.z.toFixed(1)}`);
});

test('the pedals yaw the hull and the tail rotor follows the demand', () => {
  const contraption = buildHelicopterEntity(23);
  contraption.groundDistance = 4.0;
  const physics = airPhysics();

  // Idle: the tail rotor spins at base speed and the heading holds.
  contraption.update(1 / 60, {}, { gravity: [0, -18, 0], world: null });
  const idleTailSpeed = contraption.getEntityNode('tail_rotor').localAngularVelocity.length();
  assert.ok(idleTailSpeed > 0, 'the tail rotor spins while hovering');

  const input = { down: new Set(['ArrowLeft']), pressed: new Set(), released: new Set() };
  for (let frame = 0; frame < 240; frame++) {
    contraption.update(1 / 60, input, { gravity: [0, -18, 0], world: null });
    physics.update(contraption, 1 / 60);
  }

  assert.ok(contraption.angularVelocity.y > 0.3, 'ArrowLeft should yaw the nose left');
  const attitude = new THREE.Euler().setFromQuaternion(contraption.quaternion, 'YXZ');
  assert.ok(attitude.y > 0.5, `the heading should have turned: yaw=${attitude.y.toFixed(2)}`);
  assert.ok(
    Math.abs(attitude.x) < 0.05 && Math.abs(attitude.z) < 0.05,
    'yawing must not disturb the level attitude'
  );
});
