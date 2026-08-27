import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLUEPRINTS, spawnBlueprintInWorld } from '../src/engine/contraption/Blueprints.ts';
import { Contraption } from '../src/engine/contraption/Contraption.ts';
import { ContraptionManager } from '../src/engine/contraption/ContraptionManager.ts';
import { ContraptionPhysics } from '../src/engine/physics/ContraptionPhysics.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';
import { World } from '../src/engine/voxel/World.ts';

test('micro voxels keep their own 0.2-unit collision boxes', () => {
  const contraption = new Contraption(
    7,
    [
      { localX: 0.2, localY: 0.4, localZ: 0.6, size: 0.2, block: BlockTypes.COLOR_BLOCK },
      { localX: 0.8, localY: 0.8, localZ: 0.2, size: 0.2, block: BlockTypes.COLOR_BLOCK },
      { localX: 1.2, localY: 0.2, localZ: 0.2, size: 0.2, block: BlockTypes.COLOR_BLOCK }
    ],
    new THREE.Vector3(),
    new THREE.Scene()
  ) as any;

  // Each micro voxel is its own collision box; nothing inflates to 1x1.
  assert.equal(contraption.collisionCellCount, 3);
  const size = contraption.size.toArray();
  assert.ok(Math.abs(size[0] - 1.2) < 1e-9 && Math.abs(size[1] - 0.8) < 1e-9 && Math.abs(size[2] - 0.6) < 1e-9,
    `micro-only bounds must stay at 0.2 resolution, got ${size}`);
  // Micro cells that actually hold a voxel report it...
  assert.equal(contraption.getLocalBlock(0.3, 0.5, 0.7), BlockTypes.COLOR_BLOCK);
  assert.equal(contraption.getLocalBlock(1.3, 0.3, 0.3), BlockTypes.COLOR_BLOCK);
  // ...and empty micro cells no longer inherit the parent cell.
  assert.equal(contraption.getLocalBlock(0.95, 0.05, 0.95), 0);
  assert.equal(contraption.getCollisionSamplePoints().length, 27);
  const boxes = contraption.getCollisionWorldAABBs()
    .map(box => JSON.stringify([box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ]))
    .sort();
  const near = (actual, expected) =>
    actual.every((value, i) => Math.abs(value - expected[i]) < 1e-9);
  assert.ok(near(JSON.parse(boxes[0]), [0.2, 0.4, 0.6, 0.4, 0.6, 0.8]), `box 0: ${boxes[0]}`);
  assert.ok(near(JSON.parse(boxes[1]), [0.8, 0.8, 0.2, 1.0, 1.0, 0.4]), `box 1: ${boxes[1]}`);
  assert.ok(near(JSON.parse(boxes[2]), [1.2, 0.2, 0.2, 1.4, 0.4, 0.4]), `box 2: ${boxes[2]}`);
});

test('quadcopter uses four plain child propellers: spin + per-component thrust', () => {
  const blueprint = BLUEPRINTS.find(item => item.id === 'smart_drone');
  const microBlocks = blueprint.blocks.filter((block: any) => block.size === 0.2);
  const childDefs = blueprint.defaultOptions.childEntities;

  assert.equal(microBlocks.length, 44);
  assert.equal(childDefs.length, 4, 'four propellers are ordinary child components assigned by blockKeys');
  assert.deepEqual(childDefs.map(d => d.id).sort(), ['rotor_ne', 'rotor_nw', 'rotor_se', 'rotor_sw']);
  assert.equal(childDefs.every((d: any) => d.kind === undefined || d.kind === 'child'), true, 'no special rotor type exists');
  // The script uses setLocalSpin for rotation, applyThrust for lift, and applyTorque for yaw.
  assert.ok(blueprint.defaultOptions.scriptCode.includes('.setLocalSpin('), 'propeller spin');
  assert.ok(blueprint.defaultOptions.scriptCode.includes('.applyThrust('), 'component lift');
  assert.equal((blueprint.defaultOptions.scriptCode.match(/self\.setRotorThrust/g) || []).length, 0, 'the rotor subsystem was removed');
  assert.equal(blueprint.defaultOptions.scriptCode.includes('self.applyTorque('), true);

  const scene = new THREE.Scene();
  const world = new World(scene) as any;
  const origin = { x: 10, y: 20, z: 10 };
  // Clear the placement area because torus terrain can occupy microblock parent cells up to y=30.
  for (let x = origin.x - 4; x <= origin.x + 4; x++) {
    for (let y = origin.y - 1; y <= origin.y + 5; y++) {
      for (let z = origin.z - 4; z <= origin.z + 4; z++) {
        world.setBlock(x, y, z, BlockTypes.AIR, false);
      }
    }
  }
  spawnBlueprintInWorld(blueprint, world, origin.x, origin.y, origin.z);
  assert.equal(world.microVoxels.cells.size, 44);
  assert.equal(world.microVoxels.parts.size, 0, 'microblocks no longer carry part metadata');

  const xs = blueprint.blocks.map(block => Math.floor(block.dx));
  const ys = blueprint.blocks.map(block => Math.floor(block.dy));
  const zs = blueprint.blocks.map(block => Math.floor(block.dz));
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
  assert.equal(contraption.entityNodes.size, 5, 'root plus four propeller child components');
  assert.equal(contraption.blocks.filter(b => (b.entityId || 'root') === 'rotor_nw').length, 11);
  // 14 standard blocks + 44 micro blocks = one collision box per voxel.
  assert.equal(contraption.collisionCellCount, 58);
  assert.equal(contraption.getCollisionSamplePoints().length, 58 * 9);

  // Level hover: each propeller supplies one quarter of lift and spins.
  contraption.groundDistance = 4.5;
  contraption.update(1 / 60, {}, { gravity: [0, -18, 0], world: null });
  assert.ok(contraption.appliedForces.y > contraption.mass * 17, 'total lift should approximately counter gravity');
  const propNodes = ['rotor_nw', 'rotor_ne', 'rotor_sw', 'rotor_se'].map(id => contraption.getEntityNode(id));
  assert.ok(propNodes.every(node => node.localAngularVelocity.length() > 0), 'all four propellers should spin');

  // A pitch disturbance creates restoring torque through front/rear differential lift.
  contraption.appliedForces.set(0, 0, 0);
  contraption.appliedTorques.set(0, 0, 0);
  contraption.quaternion.setFromEuler(new THREE.Euler(0.15, 0, 0, 'YXZ'));
  contraption.update(1 / 60, {}, { gravity: [0, -18, 0], world: null });
  assert.ok(contraption.appliedTorques.x < 0, 'positive pitch should produce negative restoring torque');

  // Propeller orientation should continue changing frame by frame.
  const before = propNodes.map(node => node.localQuaternion.clone());
  contraption.update(1 / 60, {}, { gravity: [0, -18, 0], world: null });
  propNodes.forEach((node, index) => {
    assert.equal(node.localQuaternion.equals(before[index]), false, 'propellers should keep rotating');
  });

  // Restore grid alignment before testing lossless voxel disassembly.
  contraption.quaternion.identity();
  assert.equal(manager.disassembleContraption(contraption), true);
  assert.equal(world.microVoxels.cells.size, 44);
  assert.equal(world.microVoxels.parts.size, 0);
});

test('quadrotor motor mixer recovers from a pitch and roll disturbance', () => {
  const blueprint = BLUEPRINTS.find(item => item.id === 'smart_drone');
  const xs = blueprint.blocks.map((block: any) => Math.floor(block.dx));
  const ys = blueprint.blocks.map((block: any) => Math.floor(block.dy));
  const zs = blueprint.blocks.map((block: any) => Math.floor(block.dz));
  const minX = Math.min(...xs), minY = Math.min(...ys), minZ = Math.min(...zs);
  // Match assembleSelection by translating blueprint coordinates into entity-local space.
  const blocks = blueprint.blocks.map((block: any) => ({
    localX: block.dx - minX,
    localY: block.dy - minY,
    localZ: block.dz - minZ,
    size: block.size || 1,
    block: block.block,
    color: block.color
  }));
  const contraption = new Contraption(
    8,
    blocks,
    new THREE.Vector3(0, 3.5, 0),
    new THREE.Scene(),
    { mode: blueprint.defaultMode, ...blueprint.defaultOptions }
  ) as any;
  contraption.groundDistance = 4.5;
  contraption.quaternion.setFromEuler(new THREE.Euler(0.25, 0, -0.18, 'YXZ'));

  const physics = new ContraptionPhysics({
    getBlock: () => BlockTypes.AIR,
    raycast: point => ({ hit: true, distance: Math.max(0, point.y) }),
    raycastMicro: () => ({ hit: false })
  });

  for (let frame = 0; frame < 360; frame++) {
    contraption.update(1 / 60, {}, { gravity: [0, -18, 0], world: null });
    physics.update(contraption, 1 / 60);
  }

  const attitude = new THREE.Euler().setFromQuaternion(contraption.quaternion, 'YXZ');
  assert.ok(Math.abs(attitude.x) < 0.01);
  assert.ok(Math.abs(attitude.z) < 0.01);
  assert.ok(Math.abs(contraption.position.y - 4.5) < 0.05);
  assert.ok(Math.abs(contraption.velocity.y) < 0.05, 'hover should maintain stable vertical velocity');
});

test('driving input W pitches the quadcopter down and moves forward', () => {
  const blueprint = BLUEPRINTS.find(item => item.id === 'smart_drone');
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
  const contraption = new Contraption(
    9,
    blocks,
    new THREE.Vector3(0, 3.5, 0),
    new THREE.Scene(),
    { mode: blueprint.defaultMode, ...blueprint.defaultOptions }
  ) as any;
  contraption.groundDistance = 4.5;

  const physics = new ContraptionPhysics({
    getBlock: () => BlockTypes.AIR,
    raycast: point => ({ hit: true, distance: Math.max(0, point.y) }),
    raycastMicro: () => ({ hit: false })
  });

  const input = { down: new Set(['KeyW']), pressed: new Set(), released: new Set() };
  for (let frame = 0; frame < 300; frame++) {
    contraption.update(1 / 60, input, { gravity: [0, -18, 0], world: null });
    physics.update(contraption, 1 / 60);
  }

  const attitude = new THREE.Euler().setFromQuaternion(contraption.quaternion, 'YXZ');
  assert.ok(attitude.x < -0.08, `W should pitch the quadcopter down: pitch=${attitude.x.toFixed(3)}`);
  assert.ok(contraption.velocity.z < -0.5, `tilted lift should drive forward: vel.z=${contraption.velocity.z.toFixed(2)}`);
  assert.ok(contraption.position.z < 0, `position should move forward: pos.z=${contraption.position.z.toFixed(1)}`);
});
