import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLUEPRINTS } from '../src/engine/contraption/Blueprints.ts';
import { Contraption } from '../src/engine/contraption/Contraption.ts';
import { ContraptionPhysics } from '../src/engine/physics/ContraptionPhysics.ts';
import { PlayerController } from '../src/engine/controls/PlayerController.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';

function roverBlueprint() {
  const blueprint = BLUEPRINTS.find(item => item.id === 'suspension_rover');
  assert.ok(blueprint, 'the suspension rover blueprint exists');
  return blueprint;
}

function buildRover(id = 31) {
  const blueprint = roverBlueprint();
  const minX = Math.min(...blueprint.blocks.map((block: any) => Math.floor(block.dx)));
  const minY = Math.min(...blueprint.blocks.map((block: any) => Math.floor(block.dy)));
  const minZ = Math.min(...blueprint.blocks.map((block: any) => Math.floor(block.dz)));
  const blocks = blueprint.blocks.map((block: any) => ({
    localX: block.dx - minX,
    localY: block.dy - minY,
    localZ: block.dz - minZ,
    size: block.size || 1,
    block: block.block,
    color: block.color
  }));
  const rover = new Contraption(
    id,
    blocks,
    new THREE.Vector3(),
    new THREE.Scene(),
    { mode: blueprint.defaultMode, ...blueprint.defaultOptions }
  ) as any;

  // Place the four mounts at static spring equilibrium over y=0. With k=55m
  // per wheel, gravity=18, compression is 18/(4*55) metres.
  const staticRayDistance = 1.2 + 0.8 - 18 / (4 * 55);
  rover.position.y = staticRayDistance - (2.2 - rover.localCenter.y);
  rover.updateTransform();
  return rover;
}

function planeRaycast(heightAt: (x: number, z: number) => number = () => 0) {
  return (origin: number[], direction: number[], maxDistance: number) => {
    const groundY = heightAt(origin[0], origin[2]);
    const distance = (groundY - origin[1]) / direction[1];
    if (!Number.isFinite(distance) || distance < 0 || distance > maxDistance) return null;
    return {
      block: BlockTypes.COLOR_BLOCK,
      color: 0x445566,
      normal: [0, 1, 0],
      position: [
        origin[0] + direction[0] * distance,
        groundY,
        origin[2] + direction[2] * distance
      ],
      distance
    };
  };
}

function runtimeContext(raycast = planeRaycast()) {
  return {
    gravity: [0, -18, 0],
    world: { entities: () => [], raycast }
  };
}

function airPhysics() {
  return new ContraptionPhysics({
    getBlock: () => BlockTypes.AIR,
    raycast: point => ({ hit: true, distance: Math.max(0, point.y) }),
    raycastMicro: () => ({ hit: false })
  });
}

test('off-road rover blueprint has four visual wheels and real raycast struts', () => {
  const blueprint = roverBlueprint();
  const wheels = blueprint.defaultOptions.childEntities;
  assert.equal(blueprint.blocks.length, 228);
  assert.equal(blueprint.blocks.filter((block: any) => block.size === 0.2).length, 208);
  assert.deepEqual(
    wheels.map((wheel: any) => wheel.id).sort(),
    ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']
  );
  assert.equal(wheels.every((wheel: any) => wheel.collisionEnabled === false), true);
  assert.match(blueprint.defaultOptions.scriptCode, /ctx\.world\.raycast/);
  assert.match(blueprint.defaultOptions.scriptCode, /self\.applyForceAt/);

  const rover = buildRover();
  assert.equal(rover.entityNodes.size, 5);
  assert.equal(rover.getCollisionWorldAABBs().length, 20, 'only the chassis collides');
  assert.equal(rover.getCollisionSamplePoints('root', true).length, 20 * 9);

  const controller = Object.create(PlayerController.prototype) as any;
  controller.inventoryItemName = () => 'Suspension Rover';
  const portable = controller.serializeInventoryItem('entity', {
    ...rover.serializeSubtree('root'),
    name: 'Suspension Rover'
  });
  assert.equal(
    portable.childEntities.every((wheel: any) => wheel.collisionEnabled === false),
    true,
    'copy/export must preserve visual-only wheel collision flags'
  );
  const parsed = controller.parseInventoryImport(JSON.stringify(portable), 'entity');
  assert.equal(parsed.ok, true);
  assert.equal(
    parsed.item.childEntities.every((wheel: any) => wheel.collisionEnabled === false),
    true,
    'import must preserve visual-only wheel collision flags'
  );
});

test('four suspension rays support the chassis and rough ground produces roll', () => {
  const rover = buildRover(32);
  rover.update(1 / 60, {}, runtimeContext());
  assert.equal(rover.getComponentState('root').contacts, 4);
  assert.ok(
    Math.abs(rover.appliedForces.y - rover.mass * 18) < rover.mass * 0.05,
    `static spring force should support gravity: ${rover.appliedForces.y}`
  );
  assert.ok(Math.abs(rover.appliedTorques.z) < 1e-6, 'level ground balances left and right struts');

  rover.appliedForces.set(0, 0, 0);
  rover.appliedTorques.set(0, 0, 0);
  rover.update(1 / 60, {}, runtimeContext(planeRaycast(x => x < rover.position.x ? 0.3 : 0)));
  assert.ok(rover.appliedTorques.z < 0, 'higher left terrain pushes the left side upward');
  assert.ok(
    rover.getEntityNode('wheel_fl').localPosition.y > rover.getEntityNode('wheel_fr').localPosition.y,
    'the left visual wheel follows its shorter compressed strut'
  );
});

test('mounted W input drives the suspended rover forward without hard wheel contacts', () => {
  const rover = buildRover(33);
  const physics = airPhysics();
  const input = { down: new Set(['KeyW']), pressed: new Set(), released: new Set() };
  const runtime = runtimeContext();

  for (let frame = 0; frame < 240; frame++) {
    rover.update(1 / 60, input, runtime);
    physics.update(rover, 1 / 60);
  }

  assert.equal(rover.scriptStatus, 'running');
  assert.equal(rover.getComponentState('root').contacts, 4);
  assert.ok(rover.velocity.z < -2.5, `W should drive toward body -Z: ${rover.velocity.z.toFixed(2)} m/s`);
  assert.ok(Math.abs(rover.position.y - 1.818) < 0.05, 'spring-damper suspension should hold ride height');
  assert.ok(Math.abs(rover.angularVelocity.x) < 0.03, 'symmetric drive should not create pitch chatter');
});
