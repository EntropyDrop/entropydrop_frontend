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

function makeFloorPhysics() {
  return new ContraptionPhysics({
    raycast: () => ({ hit: false }),
    raycastMicro: () => ({ hit: false }),
    getBlock: (_x, y, _z) => y <= 0 ? BlockTypes.COLOR_BLOCK : BlockTypes.AIR,
    microVoxels: { get: () => null }
  });
}

function makeRaisedTerrainBlockPhysics() {
  return new ContraptionPhysics({
    raycast: () => ({ hit: false }),
    raycastMicro: () => ({ hit: false }),
    getBlock: (x, y, z) => (
      y <= 0 || (x === 0 && y === 1 && z === 0)
        ? BlockTypes.COLOR_BLOCK
        : BlockTypes.AIR
    ),
    microVoxels: { get: () => null }
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

test('entity contact friction damps tangential motion like terrain contact', () => {
  const collideAt = friction => {
    const physics = makePhysics();
    const support = makeEntity(`friction_support_${friction}`, { x: 0, y: 0, z: 0 }, {
      bodyType: BodyType.KINEMATIC,
      restitution: 0,
      friction
    });
    const slider = makeEntity(`friction_slider_${friction}`, { x: 0, y: 0.8, z: 0 }, {
      restitution: 0,
      friction
    });
    slider.velocity.set(3, -1, 0);
    physics.resolveContraptionPairs([support, slider]);
    return Math.abs(slider.velocity.x);
  };

  const frictionlessSpeed = collideAt(0);
  const roughSpeed = collideAt(1);
  assert.ok(
    roughSpeed < frictionlessSpeed - 0.1,
    `rough entity contact should remove tangential speed, rough=${roughSpeed}, frictionless=${frictionlessSpeed}`
  );
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

test('continuous entity collision blocks a fast body that crosses an obstacle in one frame', () => {
  const physics = makePhysics();
  const projectile = makeEntity(200, { x: 0, y: 10, z: 0 }, {
    restitution: 0,
    friction: 0
  });
  const obstacle = makeEntity(201, { x: 5, y: 10, z: 0 }, {
    bodyType: BodyType.KINEMATIC,
    restitution: 0,
    friction: 0
  });
  projectile.useGravity = false;
  projectile.velocity.set(200, 0, 0);

  const dt = 0.08;
  projectile.update(dt, null, {});
  obstacle.update(dt, null, {});
  physics.update(projectile, dt);
  physics.update(obstacle, dt);
  physics.resolveContraptionPairs([projectile, obstacle]);

  assert.ok(
    projectile.position.x < obstacle.position.x,
    `the projectile must remain before the obstacle, projectile=${projectile.position.x}, obstacle=${obstacle.position.x}`
  );
  assert.ok(projectile.velocity.x <= 0.01, `the obstacle must cancel the approaching velocity, vx=${projectile.velocity.x}`);
});

test('continuous entity collision prevents two fast dynamic bodies from swapping sides', () => {
  const physics = makePhysics();
  const a = makeEntity(202, { x: 0, y: 10, z: 0 }, { restitution: 0.1, friction: 0 });
  const b = makeEntity(203, { x: 10, y: 10, z: 0 }, { restitution: 0.1, friction: 0 });
  a.useGravity = false;
  b.useGravity = false;
  a.velocity.set(200, 0, 0);
  b.velocity.set(-200, 0, 0);

  const dt = 0.08;
  a.update(dt, null, {});
  b.update(dt, null, {});
  physics.update(a, dt);
  physics.update(b, dt);
  physics.resolveContraptionPairs([a, b]);

  assert.ok(a.position.x < b.position.x, `fast bodies must not swap sides, a=${a.position.x}, b=${b.position.x}`);
  assert.ok(a.velocity.x <= b.velocity.x, `post-contact velocities must separate, avx=${a.velocity.x}, bvx=${b.velocity.x}`);
});

test('a block dropped from height settles on a kinematic entity without embedding', () => {
  const physics = makePhysics();
  const falling = makeEntity(204, { x: 0, y: 20, z: 0 }, {
    restitution: 0.01,
    friction: 0.5
  });
  const support = makeEntity(205, { x: 0, y: 0, z: 0 }, {
    bodyType: BodyType.KINEMATIC,
    restitution: 0,
    friction: 0.5
  });

  let maximumPenetration = 0;
  for (let frame = 0; frame < 600; frame++) {
    falling.update(1 / 60, null, {});
    support.update(1 / 60, null, {});
    physics.update(falling, 1 / 60);
    physics.update(support, 1 / 60);
    physics.resolveContraptionPairs([falling, support]);

    const fallingBox = falling.getCollisionWorldAABBs()[0];
    const supportBox = support.getCollisionWorldAABBs()[0];
    maximumPenetration = Math.max(
      maximumPenetration,
      supportBox.currentMaxY - fallingBox.currentMinY
    );
  }

  assert.ok(maximumPenetration < 0.02, `falling entity penetration must stay shallow, depth=${maximumPenetration}`);
  assert.ok(Math.abs(falling.position.y - 1.5) < 0.02, `falling entity should rest on top, y=${falling.position.y}`);
  assert.ok(Math.abs(falling.velocity.y) < 0.05, `resting vertical velocity should be near zero, vy=${falling.velocity.y}`);
});

test('a rotating block dropped onto a multi-block entity resolves every overlapping contact', () => {
  const physics = makePhysics();
  const falling = makeEntity(206, { x: 0, y: 20, z: 0 }, {
    restitution: 0.01,
    friction: 0.5
  });
  const support = new Contraption(
    207,
    [-1, 0, 1].flatMap(localX => [-1, 0, 1].map(localZ => ({
      localX,
      localY: 0,
      localZ,
      block: BlockTypes.COLOR_BLOCK
    }))),
    new THREE.Vector3(0, 0, 0),
    new THREE.Scene(),
    { mode: ContraptionMode.FREE_PHYSICS, bodyType: BodyType.KINEMATIC, restitution: 0 }
  );
  falling.quaternion.setFromEuler(new THREE.Euler(0.25, 0.15, 0.2));
  falling.angularVelocity.set(2, 1, 3);

  let maximumRemainingOverlap = 0;
  for (let frame = 0; frame < 360; frame++) {
    const dt = frame % 45 === 0 ? 0.08 : 1 / 60;
    falling.update(dt, null, {});
    support.update(dt, null, {});
    physics.update(falling, dt);
    physics.update(support, dt);
    physics.resolveContraptionPairs([falling, support]);

    const fallingBox = falling.getCollisionWorldAABBs()[0];
    for (const supportBox of support.getCollisionWorldAABBs()) {
      const overlap = Math.min(
        Math.min(fallingBox.currentMaxX, supportBox.currentMaxX) - Math.max(fallingBox.currentMinX, supportBox.currentMinX),
        Math.min(fallingBox.currentMaxY, supportBox.currentMaxY) - Math.max(fallingBox.currentMinY, supportBox.currentMinY),
        Math.min(fallingBox.currentMaxZ, supportBox.currentMaxZ) - Math.max(fallingBox.currentMinZ, supportBox.currentMinZ)
      );
      if (overlap > 0) maximumRemainingOverlap = Math.max(maximumRemainingOverlap, overlap);
    }
  }

  assert.ok(
    maximumRemainingOverlap < 0.02,
    `all entity contacts should be separated after each frame, overlap=${maximumRemainingOverlap}`
  );
});

test('a falling block cannot compress into a stack of dynamic blocks', () => {
  const physics = makePhysics();
  const support = makeEntity(208, { x: 0, y: 0, z: 0 }, {
    bodyType: BodyType.KINEMATIC,
    restitution: 0
  });
  const stack = [1, 2, 3, 4].map((y, index) => makeEntity(209 + index, { x: 0, y, z: 0 }, {
    restitution: 0.01,
    friction: 0.5
  }));
  const falling = makeEntity(213, { x: 0, y: 15, z: 0 }, {
    restitution: 0.01,
    friction: 0.5
  });
  const entities = [support, ...stack, falling];
  let maximumRemainingOverlap = 0;

  for (let frame = 0; frame < 600; frame++) {
    for (const entity of entities) entity.update(1 / 60, null, {});
    for (const entity of entities) physics.update(entity, 1 / 60);
    physics.resolveContraptionPairs(entities);

    const boxes = entities.map(entity => entity.getCollisionWorldAABBs()[0]);
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const overlap = Math.min(
          Math.min(boxes[a].currentMaxX, boxes[b].currentMaxX) - Math.max(boxes[a].currentMinX, boxes[b].currentMinX),
          Math.min(boxes[a].currentMaxY, boxes[b].currentMaxY) - Math.max(boxes[a].currentMinY, boxes[b].currentMinY),
          Math.min(boxes[a].currentMaxZ, boxes[b].currentMaxZ) - Math.max(boxes[a].currentMinZ, boxes[b].currentMinZ)
        );
        if (overlap > 0) maximumRemainingOverlap = Math.max(maximumRemainingOverlap, overlap);
      }
    }
  }

  assert.ok(
    maximumRemainingOverlap < 0.02,
    `iterative stacking contacts should prevent compression, overlap=${maximumRemainingOverlap}`
  );
});

test('an off-center dynamic block topples from another dynamic block', () => {
  const physics = makeFloorPhysics();
  const support = makeEntity(214, { x: 0, y: 1, z: 0 }, {
    restitution: 0,
    friction: 0.7
  });
  const upper = makeEntity(215, { x: 0.7, y: 2.02, z: 0 }, {
    restitution: 0,
    friction: 0.7
  });

  let minimumUpperY = upper.position.y;
  let maximumHorizontalSeparation = 0;
  let minimumUpAlignment = 1;
  for (let frame = 0; frame < 360; frame++) {
    physics.update(support, 1 / 60);
    physics.update(upper, 1 / 60);
    physics.resolveContraptionPairs([support, upper]);
    minimumUpperY = Math.min(minimumUpperY, upper.position.y);
    minimumUpAlignment = Math.min(
      minimumUpAlignment,
      Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(upper.quaternion).y)
    );
    maximumHorizontalSeparation = Math.max(
      maximumHorizontalSeparation,
      Math.abs(upper.position.x - support.position.x)
    );
  }

  assert.ok(
    minimumUpAlignment < 0.95,
    `the unsupported center of mass must make the upper block topple, alignment=${minimumUpAlignment}`
  );
  assert.ok(
    maximumHorizontalSeparation > 1.1 && minimumUpperY < 2.2,
    `the upper block must leave its support and fall, separation=${maximumHorizontalSeparation}, minY=${minimumUpperY}, support=${support.position.toArray()}, upper=${upper.position.toArray()}`
  );
});

test('a dynamic block stays stable while its center of mass remains over the support face', () => {
  const physics = makeFloorPhysics();
  const support = makeEntity(216, { x: 0, y: 1, z: 0 }, {
    restitution: 0,
    friction: 0.7
  });
  const upper = makeEntity(217, { x: 0.4, y: 2.02, z: 0 }, {
    restitution: 0,
    friction: 0.7
  });

  for (let frame = 0; frame < 360; frame++) {
    physics.update(support, 1 / 60);
    physics.update(upper, 1 / 60);
    physics.resolveContraptionPairs([support, upper]);
  }

  const upperUp = new THREE.Vector3(0, 1, 0).applyQuaternion(upper.quaternion);
  assert.ok(
    upperUp.y > 0.995,
    `a supported center of mass should not receive an artificial toppling torque, up.y=${upperUp.y}`
  );
  assert.ok(
    Math.abs((upper.position.x - support.position.x) - 0.4) < 0.05,
    `a stable partial overlap should retain its offset, separation=${upper.position.x - support.position.x}`
  );
});

test('an off-center block follows the same fall path from terrain and entity supports', () => {
  const terrainPhysics = makeRaisedTerrainBlockPhysics();
  const entityPhysics = makeFloorPhysics();
  const terrainUpper = makeEntity(218, { x: 0.7, y: 2.02, z: 0 }, {
    restitution: 0,
    friction: 0.7
  });
  const entitySupport = makeEntity(219, { x: 0, y: 1, z: 0 }, {
    restitution: 0,
    friction: 0.7
  });
  const entityUpper = makeEntity(220, { x: 0.7, y: 2.02, z: 0 }, {
    restitution: 0,
    friction: 0.7
  });
  let terrainToppleFrame = null;
  let entityToppleFrame = null;
  let terrainFallFrame = null;
  let entityFallFrame = null;
  for (let frame = 0; frame < 360; frame++) {
    terrainPhysics.update(terrainUpper, 1 / 60);
    entityPhysics.update(entitySupport, 1 / 60);
    entityPhysics.update(entityUpper, 1 / 60);
    entityPhysics.resolveContraptionPairs([entitySupport, entityUpper]);

    const terrainAlignment = Math.abs(
      new THREE.Vector3(0, 1, 0).applyQuaternion(terrainUpper.quaternion).y
    );
    const entityAlignment = Math.abs(
      new THREE.Vector3(0, 1, 0).applyQuaternion(entityUpper.quaternion).y
    );
    if (terrainToppleFrame === null && terrainAlignment < 0.95) terrainToppleFrame = frame;
    if (entityToppleFrame === null && entityAlignment < 0.95) entityToppleFrame = frame;
    if (terrainFallFrame === null && terrainUpper.position.y < 2.2) terrainFallFrame = frame;
    if (entityFallFrame === null && entityUpper.position.y < 2.2) entityFallFrame = frame;
  }

  assert.notEqual(terrainToppleFrame, null, 'terrain reference must topple');
  assert.notEqual(entityToppleFrame, null, 'entity-supported block must topple');
  assert.notEqual(terrainFallFrame, null, 'terrain reference must fall');
  assert.notEqual(entityFallFrame, null, 'entity-supported block must fall');
  assert.ok(
    Math.abs(entityToppleFrame - terrainToppleFrame) <= 90,
    `topple timing should stay comparable, terrain=${terrainToppleFrame}, entity=${entityToppleFrame}`
  );
  assert.ok(
    Math.abs(entityFallFrame - terrainFallFrame) <= 90,
    `fall timing should stay comparable, terrain=${terrainFallFrame}, entity=${entityFallFrame}`
  );
});
