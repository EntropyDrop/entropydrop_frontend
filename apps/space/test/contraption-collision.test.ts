import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BodyType, Contraption, ContraptionMode } from '../src/engine/contraption/Contraption.ts';
import { ContraptionManager } from '../src/engine/contraption/ContraptionManager.ts';
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
    { mode: ContraptionMode.PROGRAMMABLE, bodyType: BodyType.KINEMATIC }
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

test('a grounded entity is shoved by a sideways hit instead of acting as an immovable pillar', () => {
  const physics = makeFloorPhysics();
  // A loose block resting on the floor. Its centre is lower than the flyer's,
  // which previously froze it with infinite mass for any contact from above
  // - a flying block then stopped dead against a 10kg box as if it had hit a
  // mountain, while the same block hitting terrain blocks knocks them loose.
  const box = makeEntity(221, { x: 0, y: 1, z: 0 }, { restitution: 0, friction: 0.5 });
  const flyer = makeEntity(222, { x: -3, y: 1.3, z: 0 }, { restitution: 0, friction: 0 });
  flyer.useGravity = false;
  flyer.velocity.set(5, 0, 0);
  const boxStartX = box.position.x;

  for (let frame = 0; frame < 40; frame++) {
    box.update(1 / 60, null, {});
    flyer.update(1 / 60, null, {});
    physics.update(box, 1 / 60);
    physics.update(flyer, 1 / 60);
    physics.resolveContraptionPairs([box, flyer], 1 / 60);
  }

  assert.ok(
    box.position.x - boxStartX > 0.02,
    `a grounded entity must be knocked loose by a sideways hit, moved=${box.position.x - boxStartX}`
  );
  assert.ok(
    box.velocity.x > 0.1,
    `the grounded entity should share the impact momentum, vx=${box.velocity.x}`
  );
});

test('entity contacts resolve at terrain substep cadence and hold a stable rest', () => {
  const physics = makePhysics();
  const support = makeEntity(230, { x: 0, y: 0, z: 0 }, {
    bodyType: BodyType.KINEMATIC,
    restitution: 0,
    friction: 0.5
  });
  const falling = makeEntity(231, { x: 0, y: 20, z: 0 }, {
    restitution: 0.01,
    friction: 0.5
  });

  // Interleave entity-pair resolution with the physics substeps exactly like
  // ContraptionManager.update does. Under dt spikes (0.08s), the old
  // frame-end pair solver let a resting block sink ~86mm into its support
  // before a single pop corrected it; at substep cadence the sink stays at
  // substep scale, the same dip a terrain contact shows.
  let deepestSubstepSink = -Infinity;
  let minFrameEndSink = Infinity;
  let maxFrameEndSink = -Infinity;
  let maxRestingSpeed = 0;
  for (let frame = 0; frame < 360; frame++) {
    const dt = frame % 6 === 0 ? 0.08 : 1 / 60;
    falling.update(dt, null, {});
    support.update(dt, null, {});

    const frames = [];
    for (const entity of [falling, support]) {
      const frameState = physics.prepareContraptionFrame(entity, dt);
      if (frameState) frames.push(frameState);
    }
    let substeps = 1;
    for (const frameState of frames) substeps = Math.max(substeps, frameState.subSteps);
    for (let step = 0; step < substeps; step++) {
      for (const frameState of frames) {
        if (step < frameState.subSteps) physics.stepContraptionFrame(frameState);
      }
      if (frame > 150) {
        const fallingBox = falling.getCollisionWorldAABBs()[0];
        const supportBox = support.getCollisionWorldAABBs()[0];
        deepestSubstepSink = Math.max(
          deepestSubstepSink,
          supportBox.currentMaxY - fallingBox.currentMinY
        );
      }
      physics.resolveContraptionPairs([falling, support], dt / substeps);
    }
    for (const frameState of frames) physics.finishContraptionFrame(frameState);

    if (frame > 150) {
      const fallingBox = falling.getCollisionWorldAABBs()[0];
      const supportBox = support.getCollisionWorldAABBs()[0];
      const sink = supportBox.currentMaxY - fallingBox.currentMinY;
      minFrameEndSink = Math.min(minFrameEndSink, sink);
      maxFrameEndSink = Math.max(maxFrameEndSink, sink);
      maxRestingSpeed = Math.max(maxRestingSpeed, falling.velocity.length());
    }
  }

  assert.ok(
    deepestSubstepSink < 0.04,
    `substep-cadence contacts must stay shallow across dt spikes, sink=${deepestSubstepSink}`
  );
  assert.ok(
    minFrameEndSink >= -0.0005,
    `a resting entity must not be pushed out into a floating gap, sink=${minFrameEndSink}`
  );
  assert.ok(
    maxFrameEndSink <= 0.002,
    `a resting entity must hold its slop contact like on terrain, sink=${maxFrameEndSink}`
  );
  assert.ok(
    maxRestingSpeed < 0.05,
    `a resting entity must stay at rest between frames, speed=${maxRestingSpeed}`
  );
  assert.ok(
    Math.abs(falling.position.y - 1.5) < 0.01,
    `falling entity should rest on top of its support, y=${falling.position.y}`
  );
});

/**
 * A corner- or edge-down block dropped onto another entity must break out of
 * the corner interlock and settle flat on a real face, instead of locking the
 * two bodies in a tip balance with a vertex resting on the other's top face or
 * edge (the fake COM-clamped contact point used to zero the gravity torque and
 * hold the balance forever).
 */
/**
 * A corner- or edge-down block dropped onto another entity must break out of
 * the corner interlock and settle flat on a real face, instead of locking the
 * two bodies in a tip balance with a vertex resting on the other's top face or
 * edge. The old fake COM-clamped contact point zeroed the gravity torque and
 * held that balance forever; a narrow support now carries the true contact
 * feature and the same toppling response terrain gets.
 */
test('a corner-down block dropped onto another entity escapes the corner interlock and settles flat', () => {
  const settle = (seed, euler, startCornerX) => {
    const physics = makeFloorPhysics();
    // Support rests exactly on the floor: bottom face y=1, top face y=2.
    const support = makeEntity(seed, { x: 0, y: 1, z: 0 }, {
      restitution: 0,
      friction: 0.7
    });
    const falling = makeEntity(seed + 1, { x: startCornerX, y: 6, z: 0 }, {
      restitution: 0,
      friction: 0.7
    });
    falling.quaternion.setFromEuler(euler);

    for (let frame = 0; frame < 600; frame++) {
      support.update(1 / 60, null, {});
      falling.update(1 / 60, null, {});
      const frames = [
        physics.prepareContraptionFrame(support, 1 / 60),
        physics.prepareContraptionFrame(falling, 1 / 60)
      ].filter(Boolean);
      let substeps = 1;
      for (const state of frames) substeps = Math.max(substeps, state.subSteps);
      for (let step = 0; step < substeps; step++) {
        for (const state of frames) {
          if (step < state.subSteps) physics.stepContraptionFrame(state);
        }
        physics.resolveContraptionPairs([support, falling], 1 / 60 / substeps);
      }
      for (const state of frames) physics.finishContraptionFrame(state);
    }

    // Flat on any face: at least one body face normal points vertically.
    const flatOnFace = Math.max(
      Math.abs(new THREE.Vector3(1, 0, 0).applyQuaternion(falling.quaternion).y),
      Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(falling.quaternion).y),
      Math.abs(new THREE.Vector3(0, 0, 1).applyQuaternion(falling.quaternion).y)
    );
    let deepestOverlap = 0;
    for (const boxA of falling.getCollisionWorldAABBs()) {
      for (const boxB of support.getCollisionWorldAABBs()) {
        const contact = physics.orientedBoxPairContact(boxA, boxB);
        if (contact) deepestOverlap = Math.max(deepestOverlap, contact.penetration);
      }
    }
    const motion = Math.max(
      falling.velocity.length(),
      falling.angularVelocity.length(),
      support.velocity.length(),
      support.angularVelocity.length()
    );
    return { flatOnFace, deepestOverlap, motion, falling };
  };

  // Main diagonal pointing down, off-centre: the vertex used to wedge onto
  // the support's top edge and balance there forever.
  const offCenter = settle(300, new THREE.Euler(Math.PI / 4, 0, Math.PI / 4), 0.3);
  assert.ok(
    offCenter.flatOnFace > 0.95 && offCenter.falling.position.y < 2.6,
    `the corner-down block must land flat, not balance on its vertex, faceAlignment=${offCenter.flatOnFace}, y=${offCenter.falling.position.y}`
  );
  assert.ok(
    offCenter.deepestOverlap < 0.01,
    `the settled pair must hold at contact slop, overlap=${offCenter.deepestOverlap}`
  );
  assert.ok(
    offCenter.motion < 0.05,
    `the settled pair must be at rest, motion=${offCenter.motion}`
  );

  // Main diagonal pointing down exactly over the support centre: a perfectly
  // symmetric tip balance with the gravity torque about the vertex at zero -
  // only the narrow-support toppling response can break it.
  const symmetric = settle(302, new THREE.Euler(Math.PI / 4, 0, Math.PI / 4), 0);
  assert.ok(
    symmetric.flatOnFace > 0.95 && symmetric.falling.position.y < 2.6,
    `a symmetric corner balance must topple, faceAlignment=${symmetric.flatOnFace}, y=${symmetric.falling.position.y}`
  );
  assert.ok(
    symmetric.deepestOverlap < 0.01 && symmetric.motion < 0.05,
    `the symmetric case must settle, overlap=${symmetric.deepestOverlap}, motion=${symmetric.motion}`
  );

  // Edge down: a line balance against the support's face must roll off too.
  const edgeDown = settle(304, new THREE.Euler(0, 0, Math.PI / 4), 0.2);
  assert.ok(
    edgeDown.flatOnFace > 0.95 && edgeDown.falling.position.y < 2.6,
    `an edge-down block must settle flat, faceAlignment=${edgeDown.flatOnFace}, y=${edgeDown.falling.position.y}`
  );
  assert.ok(
    edgeDown.deepestOverlap < 0.01 && edgeDown.motion < 0.05,
    `the edge-down case must settle, overlap=${edgeDown.deepestOverlap}, motion=${edgeDown.motion}`
  );
});

test('a face-down block dropped onto another entity still rests without rocking', () => {
  const physics = makeFloorPhysics();
  // Support on the floor (bottom face y=1, top face y=2); the falling block
  // lands 0.15 off the support's centre, face on face.
  const support = makeEntity(310, { x: 0, y: 1, z: 0 }, {
    restitution: 0,
    friction: 0.7
  });
  const falling = makeEntity(311, { x: 0.15, y: 6, z: 0 }, {
    restitution: 0,
    friction: 0.7
  });

  for (let frame = 0; frame < 600; frame++) {
    support.update(1 / 60, null, {});
    falling.update(1 / 60, null, {});
    const frames = [
      physics.prepareContraptionFrame(support, 1 / 60),
      physics.prepareContraptionFrame(falling, 1 / 60)
    ].filter(Boolean);
    let substeps = 1;
    for (const state of frames) substeps = Math.max(substeps, state.subSteps);
    for (let step = 0; step < substeps; step++) {
      for (const state of frames) {
        if (step < state.subSteps) physics.stepContraptionFrame(state);
      }
      physics.resolveContraptionPairs([support, falling], 1 / 60 / substeps);
    }
    for (const state of frames) physics.finishContraptionFrame(state);
  }

  const upY = Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(falling.quaternion).y);
  const motion = Math.max(
    falling.velocity.length(),
    falling.angularVelocity.length(),
    support.velocity.length(),
    support.angularVelocity.length()
  );
  assert.ok(
    upY > 0.995,
    `a face-on-face rest must not receive a toppling kick, upY=${upY}`
  );
  assert.ok(
    Math.abs(falling.position.x - 0.65) < 0.05,
    `the off-center face rest must keep its offset, x=${falling.position.x}`
  );
  assert.ok(
    Math.abs(falling.position.y - 2.5) < 0.02,
    `the face rest must sit on top of the support, y=${falling.position.y}`
  );
  assert.ok(
    motion < 0.05,
    `the face rest must stay at rest, motion=${motion}`
  );
});

test('the manager resolves entity collisions at substep cadence end to end', () => {
  const scene = new THREE.Scene();
  const world = {
    activeChunkKeys: new Set(['0,0']),
    worldToChunkCoords: (x, z) => ({ cx: Math.floor(x / 16), cz: Math.floor(z / 16) }),
    getBlock: (_x, y, _z) => (y <= 0 ? BlockTypes.COLOR_BLOCK : BlockTypes.AIR),
    microVoxels: { get: () => null },
    raycast: () => ({ hit: false }),
    raycastMicro: () => ({ hit: false })
  } as any;
  const manager = new ContraptionManager(scene, world, null, null) as any;
  manager.setPhysics(new ContraptionPhysics(world));

  // A loose block on the floor plus a faster, slightly higher flying block.
  // Both stay inside the streamed chunk; the pair must exchange momentum the
  // way terrain blocks do instead of freezing the grounded block.
  const box = new Contraption(
    240,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(3.5, 1.0, 0),
    scene,
    { mode: ContraptionMode.FREE_PHYSICS, restitution: 0, friction: 0.5 }
  ) as any;
  const flyer = new Contraption(
    241,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(1.5, 1.3, 0),
    scene,
    { mode: ContraptionMode.FREE_PHYSICS, restitution: 0, friction: 0 }
  ) as any;
  flyer.useGravity = false;
  flyer.velocity.set(5, 0, 0);
  manager.registerContraption(box);
  manager.registerContraption(flyer);

  const boxStartX = box.position.x;
  for (let frame = 0; frame < 60; frame++) {
    manager.update(1 / 60, null);
  }

  assert.equal(manager.contraptions.length, 2, 'both entities must stay in the active window');
  assert.ok(
    box.position.x - boxStartX > 0.02,
    `the manager path must shove the grounded entity, moved=${box.position.x - boxStartX}`
  );
  assert.ok(
    flyer.velocity.x < 4,
    `the flyer must lose speed in the collision, vx=${flyer.velocity.x}`
  );
});

test('a 10m x 1m assembled entity collides and blocks another entity at its tip', () => {
  const scene = new THREE.Scene();
  const world = {
    activeChunkKeys: new Set(['0,0']),
    worldToChunkCoords: (x, z) => ({ cx: Math.floor(x / 16), cz: Math.floor(z / 16) }),
    getBlock: (_x, y, _z) => (y <= 0 ? BlockTypes.COLOR_BLOCK : BlockTypes.AIR),
    microVoxels: { get: () => null },
    raycast: () => ({ hit: false }),
    raycastMicro: () => ({ hit: false })
  } as any;
  const manager = new ContraptionManager(scene, world, null, null) as any;
  manager.setPhysics(new ContraptionPhysics(world));

  const blocks10m = [];
  for (let x = 0; x < 10; x++) {
    blocks10m.push({ localX: x, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK });
  }

  // 10m x 1m wall placed along X from x=0 to x=10 at y=1.
  const wall10m = new Contraption(
    301,
    blocks10m,
    new THREE.Vector3(0, 1, 0),
    scene,
    { mode: ContraptionMode.FREE_PHYSICS, bodyType: BodyType.KINEMATIC }
  ) as any;

  // Small 1m entity flying towards the tip (x=9) of the 10m wall.
  const flyer = new Contraption(
    302,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(9.5, 3, 0.5),
    scene,
    { mode: ContraptionMode.FREE_PHYSICS, bodyType: BodyType.DYNAMIC }
  ) as any;
  flyer.velocity.set(0, -5, 0); // Falling downward onto the 10m wall tip

  manager.registerContraption(wall10m);
  manager.registerContraption(flyer);

  for (let frame = 0; frame < 60; frame++) {
    manager.update(1 / 60, null);
  }

  assert.ok(
    flyer.position.y > 1.5,
    `flyer must land and stay on the 10m wall tip instead of falling through, posY=${flyer.position.y}`
  );
});
