import * as THREE from 'three';
import { BlockTypes } from '../voxel/BlockTypes.ts';
import { BodyType } from '../contraption/Contraption.ts';
import type { World } from '../voxel/World.ts';

const ENTITY_BROADPHASE_CELL_SIZE = 32;
const TERRAIN_SWEEP_THRESHOLD = 0.1;
const MIN_PHYSICS_SUBSTEPS = 2;
const MAX_PHYSICS_SUBSTEPS = 16;
const MAX_SUBSTEP_SURFACE_TRAVEL = 0.15;
const ENTITY_CONTACT_ITERATIONS = 10;
const EXACT_TERRAIN_CONTACT_SLOP = 0.005;
// A support manifold narrower than this is a point or line balance (unstable,
// must topple); any real face rest, down to a 0.2m micro voxel, spans more.
const SUPPORT_WIDTH_NARROW = 0.05;
const TERRAIN_FACE_NORMALS = [
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 0, 1)
];

export class ContraptionPhysics {
  private world: World;
  private gravity: THREE.Vector3;

  constructor(world) {
    this.world = world;
    this.gravity = new THREE.Vector3(0, -18.0, 0);
  }

  /**
   * Fast downward distance measurement to nearest solid voxel
   */
  getGroundDistance(worldPos, maxCheckDist = 40) {
    const down = new THREE.Vector3(0, -1, 0);
    const standardHit = this.world.raycast(worldPos, down, maxCheckDist);
    const microHit = this.world.raycastMicro(worldPos, down, maxCheckDist);
    const standardDistance = standardHit.hit ? standardHit.distance : maxCheckDist;
    const microDistance = microHit.hit ? microHit.distance : maxCheckDist;
    return Math.max(0, Math.min(standardDistance, microDistance));
  }

  /**
   * Step physics for a single contraption
   */
  update(contraption, dt) {
    if (!contraption || !(dt > 0)) return;
    contraption.groundDistance = this.getGroundDistance(contraption.position);
    contraption.syncKinematicBodies?.(dt);
    const bodies = contraption.getRigidBodies?.() || [];
    const dynamicBodies = bodies.filter(body => body.type === BodyType.DYNAMIC);
    if (dynamicBodies.length === 0) return;

    const frameInputs = new Map();
    for (const body of dynamicBodies) {
      frameInputs.set(body.id, {
        force: body.appliedForces.clone(),
        torque: body.appliedTorques.clone()
      });
      body.appliedForces.set(0, 0, 0);
      body.appliedTorques.set(0, 0, 0);
      body.isOnGround = false;
    }

    const radius = Math.max(0.5, Number(contraption.boundingRadius) || 0.5);
    let estimatedSurfaceTravel = 0;
    for (const body of dynamicBodies) {
      const input = frameInputs.get(body.id);
      const linearAcceleration = (input?.force?.length?.() || 0) / Math.max(0.1, body.mass || 0.1)
        + (body.id === 'root' && contraption.useGravity === false ? 0 : this.gravity.length());
      const angularAcceleration = (input?.torque?.length?.() || 0) * Math.max(0, body.inverseInertia || 0);
      const linearTravel = (body.velocity.length() + linearAcceleration * dt) * dt;
      const angularTravel = (body.angularVelocity.length() + angularAcceleration * dt) * radius * dt;
      estimatedSurfaceTravel = Math.max(estimatedSurfaceTravel, linearTravel + angularTravel);
    }
    const subSteps = Math.max(
      MIN_PHYSICS_SUBSTEPS,
      Math.min(MAX_PHYSICS_SUBSTEPS, Math.ceil(estimatedSurfaceTravel / MAX_SUBSTEP_SURFACE_TRAVEL))
    );
    const sdt = dt / subSteps;

    for (let step = 0; step < subSteps; step++) {
      const previous = new Map();
      for (const body of dynamicBodies) {
        previous.set(body.id, {
          position: body.position.clone(),
          quaternion: body.quaternion.clone()
        });
        const input = frameInputs.get(body.id);
        this.integrateBody(contraption, body, sdt, input.force, input.torque);
      }

      contraption.syncAllBodyTransforms?.();
      contraption.syncKinematicBodies?.(sdt, true);
      this.solveConstraints(contraption, sdt, 10);
      contraption.syncAllBodyTransforms?.();

      // Position-based constraint corrections become physical velocities.
      for (const body of dynamicBodies) {
        const before = previous.get(body.id);
        body.velocity.copy(body.position).sub(before.position).divideScalar(sdt);
        body.angularVelocity.copy(this.angularVelocityBetween(before.quaternion, body.quaternion, sdt));
        this.resolveTerrainCollisionBody(
          contraption,
          body,
          sdt,
          before
        );
      }
      contraption.syncAllBodyTransforms?.();
    }

    contraption.isOnGround = contraption.getRigidBody?.('root')?.isOnGround || false;
  }

  inverseMass(body) {
    return body?.type === BodyType.DYNAMIC && body.mass > 0 ? 1 / body.mass : 0;
  }

  angularVelocityBetween(previous, current, dt) {
    if (!(dt > 0)) return new THREE.Vector3();
    const delta = current.clone().multiply(previous.clone().invert()).normalize();
    if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
    const angle = 2 * Math.acos(Math.max(-1, Math.min(1, delta.w)));
    const sinHalf = Math.sqrt(Math.max(0, 1 - delta.w * delta.w));
    if (angle < 1e-8 || sinHalf < 1e-8) return new THREE.Vector3();
    return new THREE.Vector3(delta.x, delta.y, delta.z).divideScalar(sinHalf).multiplyScalar(angle / dt);
  }

  rotateBody(body, worldRotation) {
    if (body?.type !== BodyType.DYNAMIC) return;
    const angle = worldRotation.length();
    if (angle < 1e-10) return;
    const rotation = new THREE.Quaternion().setFromAxisAngle(worldRotation.clone().divideScalar(angle), angle);
    body.quaternion.premultiply(rotation).normalize();
  }

  integrateBody(contraption, body, dt, frameForce, frameTorque) {
    const useGravity = body.id === 'root' ? contraption.useGravity !== false : true;
    if (useGravity) body.velocity.addScaledVector(this.gravity, dt);
    if (frameForce?.lengthSq() > 0.0001) {
      body.velocity.addScaledVector(frameForce, dt / body.mass);
    }
    if (frameTorque?.lengthSq() > 0.0001) {
      body.angularVelocity.addScaledVector(frameTorque, dt * body.inverseInertia);
    }
    body.velocity.multiplyScalar(Math.pow(body.linearDamping, dt * 60));
    body.angularVelocity.multiplyScalar(Math.pow(body.angularDamping, dt * 60));
    body.position.addScaledVector(body.velocity, dt);
    this.rotateBody(body, body.angularVelocity.clone().multiplyScalar(dt));
  }

  bodyAnchorWorld(body, localAnchor) {
    if (!body) return new THREE.Vector3().fromArray(localAnchor || [0, 0, 0]);
    return new THREE.Vector3().fromArray(localAnchor || [0, 0, 0])
      .applyQuaternion(body.quaternion)
      .add(body.position);
  }

  applyPointCorrection(body, impulse, lever) {
    const invMass = this.inverseMass(body);
    if (invMass <= 0) return;
    body.position.addScaledVector(impulse, invMass);
    this.rotateBody(body, lever.clone().cross(impulse).multiplyScalar(body.inverseInertia));
  }

  applyAngularPairCorrection(bodyA, bodyB, rotation) {
    const invA = bodyA?.type === BodyType.DYNAMIC ? bodyA.inverseInertia : 0;
    const invB = bodyB?.type === BodyType.DYNAMIC ? bodyB.inverseInertia : 0;
    const total = invA + invB;
    if (total <= 0 || rotation.lengthSq() < 1e-14) return;
    if (invA > 0) this.rotateBody(bodyA, rotation.clone().multiplyScalar(-invA / total));
    if (invB > 0) this.rotateBody(bodyB, rotation.clone().multiplyScalar(invB / total));
  }

  solvePointConstraint(bodyA, bodyB, constraint) {
    const anchorA = this.bodyAnchorWorld(bodyA, constraint.anchorA);
    const anchorB = this.bodyAnchorWorld(bodyB, constraint.anchorB);
    const error = anchorB.clone().sub(anchorA);
    const distance = error.length();
    if (distance < 1e-7) return;
    const normal = error.clone().divideScalar(distance);
    const leverA = bodyA ? anchorA.clone().sub(bodyA.position) : new THREE.Vector3();
    const leverB = anchorB.clone().sub(bodyB.position);
    const invA = this.inverseMass(bodyA);
    const invB = this.inverseMass(bodyB);
    const angularA = bodyA?.type === BodyType.DYNAMIC
      ? leverA.clone().cross(normal).lengthSq() * bodyA.inverseInertia
      : 0;
    const angularB = bodyB?.type === BodyType.DYNAMIC
      ? leverB.clone().cross(normal).lengthSq() * bodyB.inverseInertia
      : 0;
    const denominator = invA + invB + angularA + angularB;
    if (denominator <= 1e-10) return;
    const impulse = normal.multiplyScalar(distance * constraint.stiffness / denominator);
    this.applyPointCorrection(bodyA, impulse, leverA);
    this.applyPointCorrection(bodyB, impulse.clone().multiplyScalar(-1), leverB);
  }

  solveHingeOrientation(bodyA, bodyB, constraint, lockReference = false) {
    const axisA = new THREE.Vector3().fromArray(constraint.axisA).applyQuaternion(bodyA?.quaternion || new THREE.Quaternion()).normalize();
    const axisB = new THREE.Vector3().fromArray(constraint.axisB).applyQuaternion(bodyB.quaternion).normalize();
    const axisError = axisB.clone().cross(axisA).multiplyScalar(constraint.stiffness);
    this.applyAngularPairCorrection(bodyA, bodyB, axisError);

    const referenceA = new THREE.Vector3().fromArray(constraint.referenceA)
      .applyQuaternion(bodyA?.quaternion || new THREE.Quaternion());
    const referenceB = new THREE.Vector3().fromArray(constraint.referenceB).applyQuaternion(bodyB.quaternion);
    const hingeAxis = axisA.clone().add(axisB);
    if (hingeAxis.lengthSq() < 1e-9) hingeAxis.copy(axisA);
    hingeAxis.normalize();
    referenceA.addScaledVector(hingeAxis, -referenceA.dot(hingeAxis)).normalize();
    referenceB.addScaledVector(hingeAxis, -referenceB.dot(hingeAxis)).normalize();
    const angle = Math.atan2(
      hingeAxis.dot(referenceA.clone().cross(referenceB)),
      Math.max(-1, Math.min(1, referenceA.dot(referenceB)))
    );
    let targetAngle = angle;
    if (lockReference) targetAngle = 0;
    else if (constraint.limits) {
      targetAngle = Math.max(constraint.limits.min, Math.min(constraint.limits.max, angle));
    } else {
      return;
    }
    const correction = targetAngle - angle;
    if (Math.abs(correction) > 1e-7) {
      this.applyAngularPairCorrection(
        bodyA,
        bodyB,
        hingeAxis.multiplyScalar(correction * constraint.stiffness)
      );
    }
  }

  solveConstraints(contraption, dt, iterations = 8) {
    const constraints = contraption.constraintDefinitions?.values?.();
    if (!constraints) return;
    const list = [...constraints];
    for (let iteration = 0; iteration < iterations; iteration++) {
      for (const constraint of list) {
        const bodyA = constraint.bodyA === 'world' ? null : contraption.getRigidBody?.(constraint.bodyA);
        const bodyB = contraption.getRigidBody?.(constraint.bodyB);
        if (!bodyB || (constraint.bodyA !== 'world' && !bodyA)) continue;
        if (this.inverseMass(bodyA) + this.inverseMass(bodyB) <= 0) continue;
        this.solvePointConstraint(bodyA, bodyB, constraint);
        if (constraint.type === 'hinge') this.solveHingeOrientation(bodyA, bodyB, constraint, false);
        if (constraint.type === 'weld') this.solveHingeOrientation(bodyA, bodyB, constraint, true);
      }
    }
  }

  /**
   * Entity collision resolves body pairs. Kinematic bodies have zero inverse
   * mass but contribute their scripted contact velocity; at least one body in a
   * pair must be dynamic.
   */
  resolveContraptionPairs(contraptions) {
    const colliders = (contraptions || []).filter(c => c?.getRigidBodies?.().length > 0);
    const colliderBoxes = colliders.map(collider => collider.getCollisionWorldAABBs?.() || []);
    const buckets = new Map<string, number[]>();
    const candidates = new Map<string, [number, number]>();
    for (let index = 0; index < colliders.length; index++) {
      const collider = colliders[index];
      const boxes = colliderBoxes[index];
      const radius = Math.max(0.5, Number(collider.boundingRadius) || 0.5) + 0.5;
      const bounds = boxes.length > 0
        ? boxes.reduce((result, box) => ({
            minX: Math.min(result.minX, box.minX),
            minY: Math.min(result.minY, box.minY),
            minZ: Math.min(result.minZ, box.minZ),
            maxX: Math.max(result.maxX, box.maxX),
            maxY: Math.max(result.maxY, box.maxY),
            maxZ: Math.max(result.maxZ, box.maxZ)
          }), { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity })
        : {
            minX: collider.position.x - radius,
            minY: collider.position.y - radius,
            minZ: collider.position.z - radius,
            maxX: collider.position.x + radius,
            maxY: collider.position.y + radius,
            maxZ: collider.position.z + radius
          };
      const minX = Math.floor(bounds.minX / ENTITY_BROADPHASE_CELL_SIZE);
      const maxX = Math.floor(bounds.maxX / ENTITY_BROADPHASE_CELL_SIZE);
      const minY = Math.floor(bounds.minY / ENTITY_BROADPHASE_CELL_SIZE);
      const maxY = Math.floor(bounds.maxY / ENTITY_BROADPHASE_CELL_SIZE);
      const minZ = Math.floor(bounds.minZ / ENTITY_BROADPHASE_CELL_SIZE);
      const maxZ = Math.floor(bounds.maxZ / ENTITY_BROADPHASE_CELL_SIZE);
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          for (let z = minZ; z <= maxZ; z++) {
            const key = `${x},${y},${z}`;
            const bucket = buckets.get(key) || [];
            for (const other of bucket) {
              const a = Math.min(other, index);
              const b = Math.max(other, index);
              candidates.set(`${a},${b}`, [a, b]);
            }
            bucket.push(index);
            buckets.set(key, bucket);
          }
        }
      }
    }
    const dynamicCandidates = [...candidates.values()].filter(([a, b]) => (
      this.isDynamicCollider(colliders[a]) || this.isDynamicCollider(colliders[b])
    ));
    for (let iteration = 0; iteration < ENTITY_CONTACT_ITERATIONS; iteration++) {
      let resolvedContacts = 0;
      for (const [a, b] of dynamicCandidates) {
        // Every correction changes all world-space boxes on that body. Fresh
        // boxes let the solver propagate support through a stack instead of
        // leaving the next pair embedded until the following rendered frame.
        const boxesA = colliders[a].getCollisionWorldAABBs?.() || [];
        const boxesB = colliders[b].getCollisionWorldAABBs?.() || [];
        if (this.resolveContraptionPair(
          colliders[a],
          colliders[b],
          boxesA,
          boxesB,
          iteration === 0
        )) resolvedContacts++;
      }
      if (resolvedContacts === 0) break;
    }
  }

  isDynamicCollider(contraption) {
    return !!contraption?.getRigidBodies?.().some(body => body.type === BodyType.DYNAMIC);
  }

  sweptAabbContact(a, b) {
    const previousOverlap = ['x', 'y', 'z'].every(axis => (
      Math.min(a[`previousMax${axis.toUpperCase()}`], b[`previousMax${axis.toUpperCase()}`])
        - Math.max(a[`previousMin${axis.toUpperCase()}`], b[`previousMin${axis.toUpperCase()}`]) > 0
    ));
    if (previousOverlap) return null;

    const relativeDelta = new THREE.Vector3();
    for (const axis of ['x', 'y', 'z'] as const) {
      const centerA0 = (a[`previousMin${axis.toUpperCase()}`] + a[`previousMax${axis.toUpperCase()}`]) * 0.5;
      const centerA1 = (a[`currentMin${axis.toUpperCase()}`] + a[`currentMax${axis.toUpperCase()}`]) * 0.5;
      const centerB0 = (b[`previousMin${axis.toUpperCase()}`] + b[`previousMax${axis.toUpperCase()}`]) * 0.5;
      const centerB1 = (b[`currentMin${axis.toUpperCase()}`] + b[`currentMax${axis.toUpperCase()}`]) * 0.5;
      relativeDelta[axis] = (centerA1 - centerA0) - (centerB1 - centerB0);
    }
    if (relativeDelta.lengthSq() < 1e-12) return null;

    let entryTime = -Infinity;
    let exitTime = Infinity;
    let normal = null;
    for (const axis of ['x', 'y', 'z'] as const) {
      const delta = relativeDelta[axis];
      const aMin = a[`previousMin${axis.toUpperCase()}`];
      const aMax = a[`previousMax${axis.toUpperCase()}`];
      const bMin = b[`previousMin${axis.toUpperCase()}`];
      const bMax = b[`previousMax${axis.toUpperCase()}`];
      if (Math.abs(delta) < 1e-12) {
        if (aMax < bMin || aMin > bMax) return null;
        continue;
      }

      let entry;
      let exit;
      let direction;
      if (delta > 0) {
        entry = (bMin - aMax) / delta;
        exit = (bMax - aMin) / delta;
        direction = 1;
      } else {
        entry = (bMax - aMin) / delta;
        exit = (bMin - aMax) / delta;
        direction = -1;
      }
      if (entry > entryTime) {
        entryTime = entry;
        normal = new THREE.Vector3();
        normal[axis] = direction;
      }
      exitTime = Math.min(exitTime, exit);
      if (entryTime > exitTime) return null;
    }

    if (!normal || entryTime < 0 || entryTime > 1 || exitTime < 0) return null;
    return { time: entryTime, normal, relativeDelta };
  }

  applyEntityCollisionImpulse(bodyA, bodyB, normal, totalInv) {
    const relativeVelocity = bodyB.velocity.clone().sub(bodyA.velocity);
    const normalVelocity = relativeVelocity.dot(normal);
    if (normalVelocity >= -0.05) return;
    const restitution = Math.max(bodyA.restitution, bodyB.restitution);
    const impulse = -(1 + restitution) * normalVelocity / totalInv;
    bodyA.velocity.addScaledVector(normal, -impulse * this.inverseMass(bodyA));
    bodyB.velocity.addScaledVector(normal, impulse * this.inverseMass(bodyB));
  }

  resolveContraptionPair(a, b, boxesA = null, boxesB = null, allowSweep = true) {
    if (a === b) return false;

    boxesA ||= a.getCollisionWorldAABBs?.() || [];
    boxesB ||= b.getCollisionWorldAABBs?.() || [];
    let bestOverlap = null;
    let bestSweep = null;

    for (const ba of boxesA) {
      for (const bb of boxesB) {
        const bodyA = a.getRigidBody?.(ba.bodyId || ba.entityId || 'root');
        const bodyB = b.getRigidBody?.(bb.bodyId || bb.entityId || 'root');
        if (!bodyA || !bodyB || (bodyA.type !== BodyType.DYNAMIC && bodyB.type !== BodyType.DYNAMIC)) continue;

        const sweep = allowSweep ? this.sweptAabbContact(ba, bb) : null;
        if (sweep && (!bestSweep || sweep.time < bestSweep.time)) {
          bestSweep = { ...sweep, bodyA, bodyB };
        }

        const ox = Math.min(ba.currentMaxX, bb.currentMaxX) - Math.max(ba.currentMinX, bb.currentMinX);
        const oy = Math.min(ba.currentMaxY, bb.currentMaxY) - Math.max(ba.currentMinY, bb.currentMinY);
        const oz = Math.min(ba.currentMaxZ, bb.currentMaxZ) - Math.max(ba.currentMinZ, bb.currentMinZ);
        if (ox > 0 && oy > 0 && oz > 0) {
          const penetration = Math.min(ox, oy, oz);
          if (!bestOverlap || penetration < bestOverlap.penetration) {
            bestOverlap = {
              axis: penetration === ox ? 'x' : penetration === oy ? 'y' : 'z',
              penetration,
              ba,
              bb,
              bodyA,
              bodyB
            };
          }
        }
      }
    }

    if (bestSweep) {
      const { bodyA, bodyB, normal, relativeDelta, time } = bestSweep;
      const invA = this.inverseMass(bodyA);
      const invB = this.inverseMass(bodyB);
      const totalInv = invA + invB;
      if (totalInv <= 0) return false;
      const relativeDistance = Math.max(1e-9, relativeDelta.length());
      const rewindFraction = Math.min(1, Math.max(0, 1 - time + 0.001 / relativeDistance));
      bodyA.position.addScaledVector(relativeDelta, -rewindFraction * invA / totalInv);
      bodyB.position.addScaledVector(relativeDelta, rewindFraction * invB / totalInv);
      this.applyEntityCollisionImpulse(bodyA, bodyB, normal, totalInv);
      this.markEntitySupport(a, b, bodyA, bodyB, normal);
      a.syncAllBodyTransforms?.();
      b.syncAllBodyTransforms?.();
      return true;
    }

    if (!bestOverlap) return false;

    const { axis, penetration, ba, bb, bodyA, bodyB } = bestOverlap;
    const minKey = `currentMin${axis.toUpperCase()}`;
    const maxKey = `currentMax${axis.toUpperCase()}`;
    const centerA = (ba[minKey] + ba[maxKey]) / 2;
    const centerB = (bb[minKey] + bb[maxKey]) / 2;
    const dir = centerB >= centerA ? 1 : -1;
    const normal = new THREE.Vector3(0, 0, 0);
    normal[axis] = dir;

    const invA = this.inverseMass(bodyA);
    const invB = this.inverseMass(bodyB);
    const totalInv = invA + invB;
    if (totalInv <= 0) return false;

    const push = penetration + 0.001;
    bodyA.position.addScaledVector(normal, -push * invA / totalInv);
    bodyB.position.addScaledVector(normal, push * invB / totalInv);
    this.applyEntityCollisionImpulse(bodyA, bodyB, normal, totalInv);
    this.markEntitySupport(a, b, bodyA, bodyB, normal);

    a.syncAllBodyTransforms?.();
    b.syncAllBodyTransforms?.();
    return true;
  }

  markEntitySupport(a, b, bodyA, bodyB, normal) {
    if (normal.y < -0.5 && bodyA.type === BodyType.DYNAMIC) {
      bodyA.isOnGround = true;
      if (bodyA.id === 'root') a.isOnGround = true;
    }
    if (normal.y > 0.5 && bodyB.type === BodyType.DYNAMIC) {
      bodyB.isOnGround = true;
      if (bodyB.id === 'root') b.isOnGround = true;
    }
  }

  terrainCellAtPoint(point) {
    const bx = Math.floor(point.x);
    const by = Math.floor(point.y);
    const bz = Math.floor(point.z);
    if (this.world.getBlock(bx, by, bz) !== BlockTypes.AIR) {
      return { minX: bx, maxX: bx + 1, minY: by, maxY: by + 1, minZ: bz, maxZ: bz + 1 };
    }

    const mx = Math.floor(point.x * 5);
    const my = Math.floor(point.y * 5);
    const mz = Math.floor(point.z * 5);
    const micro = (this.world as any).getMicroBlock?.(mx, my, mz)
      ?? (this.world as any).microVoxels?.get(mx, my, mz)
      ?? null;
    if (micro === null || micro === undefined) return null;
    return {
      minX: mx / 5,
      maxX: (mx + 1) / 5,
      minY: my / 5,
      maxY: (my + 1) / 5,
      minZ: mz / 5,
      maxZ: (mz + 1) / 5
    };
  }

  /**
   * Exact oriented collision boxes for the cells carried by one rigid body.
   * Point probes are useful for contact manifolds and sweeps, but they cannot
   * detect the dual case where a terrain edge pierces the interior of a body
   * face. Keeping the OBBs here lets the terrain solver cover that topology
   * with a separating-axis test.
   */
  getBodyCollisionWorldOBBs(contraption, body) {
    if (!contraption || !body) return [];
    const attached = contraption.getAttachedNodeIds?.(body.id) || new Set([body.id]);
    const boxes = [];
    for (const cell of contraption.collisionEntries || []) {
      if (!attached.has(cell.entityId)) continue;
      const node = contraption.getEntityNode?.(cell.entityId) || contraption.getEntityNode?.('root');
      const quaternion = node?.group?.getWorldQuaternion?.(new THREE.Quaternion())
        || body.quaternion.clone();
      const axes = [
        new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion).normalize(),
        new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).normalize(),
        new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize()
      ];
      const size = cell.span * 0.2;
      const halfExtents = [size / 2, size / 2, size / 2];
      const center = contraption.entityLocalToWorld(cell.entityId, new THREE.Vector3(
        (cell.x + cell.span / 2) * 0.2,
        (cell.y + cell.span / 2) * 0.2,
        (cell.z + cell.span / 2) * 0.2
      ));
      const radiusX = halfExtents.reduce((sum, half, index) => sum + half * Math.abs(axes[index].x), 0);
      const radiusY = halfExtents.reduce((sum, half, index) => sum + half * Math.abs(axes[index].y), 0);
      const radiusZ = halfExtents.reduce((sum, half, index) => sum + half * Math.abs(axes[index].z), 0);
      boxes.push({
        center,
        axes,
        halfExtents,
        minX: center.x - radiusX,
        maxX: center.x + radiusX,
        minY: center.y - radiusY,
        maxY: center.y + radiusY,
        minZ: center.z - radiusZ,
        maxZ: center.z + radiusZ,
        cell,
        body
      });
    }
    return boxes;
  }

  orientedBoxAabbContact(obb, box) {
    const terrainCenter = new THREE.Vector3(
      (box.minX + box.maxX) / 2,
      (box.minY + box.maxY) / 2,
      (box.minZ + box.maxZ) / 2
    );
    const terrainHalf = new THREE.Vector3(
      (box.maxX - box.minX) / 2,
      (box.maxY - box.minY) / 2,
      (box.maxZ - box.minZ) / 2
    );
    const worldAxes = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1)
    ];
    const candidateAxes = [...obb.axes, ...worldAxes];
    for (const bodyAxis of obb.axes) {
      for (const terrainAxis of worldAxes) {
        const cross = new THREE.Vector3().crossVectors(bodyAxis, terrainAxis);
        if (cross.lengthSq() > 1e-10) candidateAxes.push(cross);
      }
    }

    const delta = obb.center.clone().sub(terrainCenter);
    let penetration = Infinity;
    let normal = null;
    for (const rawAxis of candidateAxes) {
      const axis = rawAxis.clone().normalize();
      const bodyRadius = obb.halfExtents.reduce((sum, half, index) => (
        sum + half * Math.abs(obb.axes[index].dot(axis))
      ), 0);
      const terrainRadius = terrainHalf.x * Math.abs(axis.x)
        + terrainHalf.y * Math.abs(axis.y)
        + terrainHalf.z * Math.abs(axis.z);
      const signedDistance = delta.dot(axis);
      const overlap = bodyRadius + terrainRadius - Math.abs(signedDistance);
      if (overlap <= 1e-7) return null;
      if (overlap < penetration) {
        penetration = overlap;
        normal = axis.multiplyScalar(signedDistance >= 0 ? 1 : -1);
      }
    }
    if (!normal || !Number.isFinite(penetration)) return null;

    // The terrain support feature is a face, edge, or vertex depending on the
    // separating normal. Its center is a much better angular-impulse lever arm
    // than an arbitrary OBB vertex, especially for face-edge contact.
    const hitPosition = terrainCenter.clone();
    for (const axis of ['x', 'y', 'z'] as const) {
      if (Math.abs(normal[axis]) > 1e-6) {
        hitPosition[axis] += terrainHalf[axis] * Math.sign(normal[axis]);
      }
    }
    return { normal, penetration, hitPosition };
  }

  terrainBoxesOverlapping(obb) {
    const boxes = [];
    for (let x = Math.floor(obb.minX); x <= Math.floor(obb.maxX); x++) {
      for (let y = Math.floor(obb.minY); y <= Math.floor(obb.maxY); y++) {
        for (let z = Math.floor(obb.minZ); z <= Math.floor(obb.maxZ); z++) {
          if (this.world.getBlock(x, y, z) === BlockTypes.AIR) continue;
          boxes.push({ minX: x, maxX: x + 1, minY: y, maxY: y + 1, minZ: z, maxZ: z + 1 });
        }
      }
    }

    const bounds = {
      minX: obb.minX,
      minY: obb.minY,
      minZ: obb.minZ,
      maxX: obb.maxX,
      maxY: obb.maxY,
      maxZ: obb.maxZ
    };
    const queriedMicro = this.world.getMicroBlocksInAABB?.(bounds);
    if (Array.isArray(queriedMicro)) {
      for (const cell of queriedMicro) {
        const size = Number(cell.size) || 0.2;
        boxes.push({
          minX: cell.x,
          maxX: cell.x + size,
          minY: cell.y,
          maxY: cell.y + size,
          minZ: cell.z,
          maxZ: cell.z + size
        });
      }
    } else if (typeof (this.world as any).getMicroBlock === 'function') {
      for (let mx = Math.floor(obb.minX * 5); mx <= Math.floor(obb.maxX * 5); mx++) {
        for (let my = Math.floor(obb.minY * 5); my <= Math.floor(obb.maxY * 5); my++) {
          for (let mz = Math.floor(obb.minZ * 5); mz <= Math.floor(obb.maxZ * 5); mz++) {
            const micro = (this.world as any).getMicroBlock(mx, my, mz);
            if (micro === null || micro === undefined) continue;
            boxes.push({
              minX: mx / 5,
              maxX: (mx + 1) / 5,
              minY: my / 5,
              maxY: (my + 1) / 5,
              minZ: mz / 5,
              maxZ: (mz + 1) / 5
            });
          }
        }
      }
    }
    return boxes;
  }

  exactTerrainContacts(contraption, body) {
    const contacts = [];
    for (const obb of this.getBodyCollisionWorldOBBs(contraption, body)) {
      for (const terrainBox of this.terrainBoxesOverlapping(obb)) {
        const contact = this.orientedBoxAabbContact(obb, terrainBox);
        if (!contact) continue;
        // A diagonal SAT normal selects a terrain edge or vertex. It is only a
        // real feature of the voxel union when every incident face selected by
        // that normal is exposed. Testing just beyond the diagonal corner is
        // insufficient: on a tiled floor that point is in the air even though
        // the horizontal face is an internal seam shared with its neighbour.
        const terrainCenter = new THREE.Vector3(
          (terrainBox.minX + terrainBox.maxX) / 2,
          (terrainBox.minY + terrainBox.maxY) / 2,
          (terrainBox.minZ + terrainBox.maxZ) / 2
        );
        let exposed = true;
        for (const axis of ['x', 'y', 'z'] as const) {
          if (Math.abs(contact.normal[axis]) <= 1e-6) continue;
          const facePoint = terrainCenter.clone();
          facePoint[axis] = contact.normal[axis] > 0
            ? terrainBox[`max${axis.toUpperCase()}`]
            : terrainBox[`min${axis.toUpperCase()}`];
          facePoint[axis] += Math.sign(contact.normal[axis]) * 0.002;
          if (this.terrainCellAtPoint(facePoint)) {
            exposed = false;
            break;
          }
        }
        if (!exposed) continue;
        contacts.push(contact);
      }
    }
    return contacts;
  }

  terrainContactAtPoint(point) {
    const cell = this.terrainCellAtPoint(point);
    if (!cell) return null;
    const penetrations = [
      point.x - cell.minX,
      cell.maxX - point.x,
      point.y - cell.minY,
      cell.maxY - point.y,
      point.z - cell.minZ,
      cell.maxZ - point.z
    ];
    // Rotated sample points land on voxel boundary planes all the time (a
    // 45-degree tilted block whose corner rides the seam between two floor
    // voxels is the classic case). floor() then snaps the point to one cell
    // where the shared face reports zero penetration. Those faces carry no
    // separation depth, but they must not abort the search: the point can sit
    // deep inside solid terrain while every face it touches is an interior
    // seam, and its only real way out is a face further away. Faces with
    // penetration > 0 but a solid cell on the far side are interior seams too.
    let remainingFaces = 0b111111;
    let fallbackIndex = -1;
    let fallbackPenetration = Infinity;
    while (remainingFaces) {
      let index = -1;
      let penetration = Infinity;
      for (let candidate = 0; candidate < TERRAIN_FACE_NORMALS.length; candidate++) {
        if (!(remainingFaces & (1 << candidate))) continue;
        if (penetrations[candidate] < penetration) {
          penetration = penetrations[candidate];
          index = candidate;
        }
      }
      if (index < 0) break;
      const normal = TERRAIN_FACE_NORMALS[index];
      const outside = point.clone().addScaledVector(normal, penetration + 0.002);
      // Shared faces inside solid terrain are not collision surfaces. Looking
      // just outside the candidate face leaves only the actual exposed shell.
      if (this.terrainCellAtPoint(outside)) {
        remainingFaces &= ~(1 << index);
        if (penetration > 0 && penetration < fallbackPenetration) {
          // Remember the shallowest seam in case every face is interior: a
          // body buried deep inside thick terrain must still receive a push,
          // otherwise it silently tunnels through the world.
          fallbackIndex = index;
          fallbackPenetration = penetration;
        }
        continue;
      }
      if (!(penetration > 0)) {
        // Exactly on an exposed shell face: touching, not overlapping.
        return null;
      }
      return { normal, penetration };
    }
    if (fallbackIndex >= 0) {
      return { normal: TERRAIN_FACE_NORMALS[fallbackIndex], penetration: fallbackPenetration };
    }
    return null;
  }

  sweepTerrainContact(start, end) {
    const movement = end.clone().sub(start);
    const distance = movement.length();
    if (distance < 1e-8) return null;
    const direction = movement.divideScalar(distance);
    const hits = [
      this.world.raycast?.(start, direction, distance + 0.002),
      this.world.raycastMicro?.(start, direction, distance + 0.002)
    ].filter(hit => hit?.hit
      && Number.isFinite(hit.distance)
      && hit.distance >= 0
      && hit.distance <= distance + 0.002);
    hits.sort((a, b) => a.distance - b.distance);

    for (const hit of hits) {
      const normal = new THREE.Vector3(
        Number(hit.normal?.x) || 0,
        Number(hit.normal?.y) || 0,
        Number(hit.normal?.z) || 0
      );
      if (normal.lengthSq() < 0.5) continue;
      normal.normalize();
      const approach = -direction.dot(normal);
      if (approach <= 1e-6) continue;
      const overtravel = Math.max(0, distance - hit.distance) * approach;
      if (overtravel <= 0) continue;
      return {
        normal,
        penetration: overtravel + 0.001,
        hitPosition: start.clone().addScaledVector(direction, hit.distance)
      };
    }
    return null;
  }

  /**
   * Limit an editor-style wrench drive before it overwrites collision response.
   * Ordinary CCD runs after integration, but a held wrench writes a new target
   * velocity every frame; without this preflight, the next frame can drive the
   * body back into (and eventually through) the same wall. Probe every collider
   * sample through this frame's requested displacement and stop at the earliest
   * terrain or entity entry face.
   */
  sweepPointAabb(start, direction, maxDistance, box) {
    const inside = start.x >= box.minX && start.x <= box.maxX
      && start.y >= box.minY && start.y <= box.maxY
      && start.z >= box.minZ && start.z <= box.maxZ;
    if (inside) {
      const faces = [
        { distance: start.x - box.minX, normal: new THREE.Vector3(-1, 0, 0) },
        { distance: box.maxX - start.x, normal: new THREE.Vector3(1, 0, 0) },
        { distance: start.y - box.minY, normal: new THREE.Vector3(0, -1, 0) },
        { distance: box.maxY - start.y, normal: new THREE.Vector3(0, 1, 0) },
        { distance: start.z - box.minZ, normal: new THREE.Vector3(0, 0, -1) },
        { distance: box.maxZ - start.z, normal: new THREE.Vector3(0, 0, 1) }
      ].sort((a, b) => a.distance - b.distance);
      return { distance: 0, normal: faces[0].normal };
    }

    let near = 0;
    let far = maxDistance;
    let normal = null;
    for (const axis of ['x', 'y', 'z'] as const) {
      const component = direction[axis];
      const min = box[`min${axis.toUpperCase()}`];
      const max = box[`max${axis.toUpperCase()}`];
      if (Math.abs(component) < 1e-10) {
        if (start[axis] < min || start[axis] > max) return null;
        continue;
      }
      let entry = (min - start[axis]) / component;
      let exit = (max - start[axis]) / component;
      let entrySign = -1;
      if (entry > exit) {
        [entry, exit] = [exit, entry];
        entrySign = 1;
      }
      if (entry > near) {
        near = entry;
        normal = new THREE.Vector3();
        normal[axis] = entrySign;
      }
      far = Math.min(far, exit);
      if (near > far) return null;
    }
    if (!normal || near < 0 || near > maxDistance) return null;
    return { distance: near, normal };
  }

  constrainWrenchVelocity(contraption, body, desiredVelocity, dt, contraptions = []) {
    const velocity = desiredVelocity?.clone?.() || new THREE.Vector3();
    const safeDt = Math.max(1 / 240, Math.min(0.08, Number(dt) || 0));
    const frameDistance = velocity.length() * safeDt;
    if (!body || frameDistance < 1e-8) return { velocity, normals: [] };

    const direction = velocity.clone().normalize();
    const probeDistance = frameDistance + 0.02;
    const samples = contraption.getCollisionSamplePoints?.(body.id, true) || [];
    const normals: THREE.Vector3[] = [];
    let allowedFraction = 1;

    for (const start of samples) {
      const end = start.clone().addScaledVector(direction, probeDistance);
      const contact = this.sweepTerrainContact(start, end);
      if (!contact || velocity.dot(contact.normal) >= -1e-8) continue;
      const hitDistance = contact.hitPosition
        ? start.distanceTo(contact.hitPosition)
        : 0;
      const allowedDistance = Math.max(0, hitDistance - 0.004);
      allowedFraction = Math.min(allowedFraction, allowedDistance / frameDistance);
      if (!normals.some(normal => normal.dot(contact.normal) > 0.999)) {
        normals.push(contact.normal.clone());
      }
    }

    for (const other of contraptions || []) {
      if (!other || other === contraption) continue;
      const broadphaseDistance = Math.max(0.5, Number(contraption.boundingRadius) || 0.5)
        + Math.max(0.5, Number(other.boundingRadius) || 0.5)
        + probeDistance;
      if (contraption.position.distanceToSquared(other.position) > broadphaseDistance * broadphaseDistance) continue;
      const boxes = other.getCollisionWorldAABBs?.() || [];
      for (const start of samples) {
        for (const box of boxes) {
          const contact = this.sweepPointAabb(start, direction, probeDistance, box);
          if (!contact || velocity.dot(contact.normal) >= -1e-8) continue;
          const allowedDistance = Math.max(0, contact.distance - 0.004);
          allowedFraction = Math.min(allowedFraction, allowedDistance / frameDistance);
          if (!normals.some(normal => normal.dot(contact.normal) > 0.999)) {
            normals.push(contact.normal.clone());
          }
        }
      }
    }

    if (allowedFraction < 1) velocity.multiplyScalar(Math.max(0, allowedFraction));
    return { velocity, normals };
  }

  /**
   * Width of the narrowest principal axis of a support point set projected
   * onto the contact plane. Points that span a single point or a line (corner
   * or edge balance) have width ~0; any real face support is at least as wide
   * as its cell.
   */
  supportWidth(points, normal) {
    if (!points || points.length <= 2) return 0;
    const tangent = new THREE.Vector3(1, 0, 0);
    if (Math.abs(normal.x) > 0.9) tangent.set(0, 1, 0);
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    tangent.crossVectors(bitangent, normal).normalize();
    let meanU = 0;
    let meanV = 0;
    for (const point of points) {
      meanU += point.dot(tangent);
      meanV += point.dot(bitangent);
    }
    meanU /= points.length;
    meanV /= points.length;
    let suu = 0;
    let svv = 0;
    let suv = 0;
    for (const point of points) {
      const du = point.dot(tangent) - meanU;
      const dv = point.dot(bitangent) - meanV;
      suu += du * du;
      svv += dv * dv;
      suv += du * dv;
    }
    const trace = suu + svv;
    const determinant = suu * svv - suv * suv;
    const discriminant = Math.max(0, trace * trace / 4 - determinant);
    const narrowEigenvalue = trace / 2 - Math.sqrt(discriminant);
    return 2 * Math.sqrt(Math.max(0, narrowEigenvalue));
  }

  solveTerrainContact(body, normal, hitPosition, penetration, contactPoints, dt) {
    body.position.addScaledVector(normal, Math.max(0, penetration - 0.001));
    if (normal.y > 0.5) body.isOnGround = true;

    const r = hitPosition.clone().sub(body.position);
    const contactVelocity = body.velocity.clone().add(body.angularVelocity.clone().cross(r));
    const normalVelocity = contactVelocity.dot(normal);
    if (normalVelocity >= 0) return;

    const restitution = Math.abs(normalVelocity) < 0.5 ? 0 : body.restitution;
    const inverseMass = 1 / body.mass;
    const normalLever = r.clone().cross(normal);
    const normalDenominator = inverseMass + normalLever.lengthSq() * body.inverseInertia;
    const normalImpulseMagnitude = normalDenominator > 1e-9
      ? -(1 + restitution) * normalVelocity / normalDenominator
      : 0;
    const normalImpulse = normal.clone().multiplyScalar(normalImpulseMagnitude);

    body.velocity.addScaledVector(normalImpulse, inverseMass);
    body.angularVelocity.addScaledVector(normalLever, normalImpulseMagnitude * body.inverseInertia);

    // Solve Coulomb friction after the support impulse. Its effective mass
    // includes the same contact lever arm, and the impulse is capped by μN.
    const postNormalVelocity = body.velocity.clone().add(body.angularVelocity.clone().cross(r));
    const tangentVelocity = postNormalVelocity
      .clone()
      .addScaledVector(normal, -postNormalVelocity.dot(normal));
    const tangentSpeed = tangentVelocity.length();
    if (tangentSpeed > 0.01 && normalImpulseMagnitude > 0) {
      const tangent = tangentVelocity.divideScalar(tangentSpeed);
      const tangentLever = r.clone().cross(tangent);
      const tangentDenominator = inverseMass + tangentLever.lengthSq() * body.inverseInertia;
      if (tangentDenominator > 1e-9) {
        const frictionImpulseMagnitude = Math.max(
          -normalImpulseMagnitude * body.friction,
          -tangentSpeed / tangentDenominator
        );
        body.velocity.addScaledVector(tangent, frictionImpulseMagnitude * inverseMass);
        body.angularVelocity.addScaledVector(
          tangentLever,
          frictionImpulseMagnitude * body.inverseInertia
        );
      }
    }

    // Perfect voxels can balance forever on a sampled corner or edge. Mimic
    // real contact asymmetry only on narrow upward support manifolds: a
    // support whose points span a point or a line has width ~0 and is
    // unstable, while any real face rest - including a 0.2m micro voxel face -
    // spans a visible area. This adds no linear energy and never turns a wall
    // collision into auto-levelling.
    if (normal.y > 0.5 && this.supportWidth(contactPoints, normal) < SUPPORT_WIDTH_NARROW) {
      const bodyAxes = [
        new THREE.Vector3(1, 0, 0).applyQuaternion(body.quaternion),
        new THREE.Vector3(0, 1, 0).applyQuaternion(body.quaternion),
        new THREE.Vector3(0, 0, 1).applyQuaternion(body.quaternion)
      ];
      let supportFace = bodyAxes[0];
      for (const axis of bodyAxes.slice(1)) {
        if (Math.abs(axis.dot(normal)) > Math.abs(supportFace.dot(normal))) supportFace = axis;
      }
      if (supportFace.dot(normal) < 0) supportFace.multiplyScalar(-1);
      const alignment = supportFace.dot(normal);
      if (alignment < 0.995) {
        const toppleAxis = supportFace.clone().cross(normal);
        const instability = toppleAxis.length();
        if (instability > 1e-6) {
          const acceleration = this.gravity.length() * 0.25 * instability;
          body.angularVelocity.addScaledVector(toppleAxis.divideScalar(instability), acceleration * dt);
        }
      }
    }

    const residualNormalVelocity = body.velocity.dot(normal);
    if (Math.abs(residualNormalVelocity) < 0.2) {
      body.velocity.addScaledVector(normal, -residualNormalVelocity);
    }
    if (body.velocity.lengthSq() < 0.01) body.velocity.set(0, 0, 0);
  }

  resolveTerrainCollisionBody(contraption, body, dt, previousPose = null) {
    // A dynamic body's terrain contact includes every kinematic part rigidly
    // attached to it: after a child component is split off, the child's cells
    // still move with the body (scene-graph parent), so they must keep the
    // structure supported instead of silently losing that ground contact.
    const samplePoints = contraption.getCollisionSamplePoints(body.id, true);
    const contacts = new Map();
    const translationDistance = previousPose
      ? body.position.distanceTo(previousPose.position)
      : 0;
    const rotationDistance = previousPose
      ? body.quaternion.angleTo(previousPose.quaternion) * Math.max(0.5, contraption.boundingRadius || 0)
      : 0;
    const shouldSweep = translationDistance + rotationDistance >= TERRAIN_SWEEP_THRESHOLD;
    const inverseCurrentQuaternion = previousPose ? body.quaternion.clone().invert() : null;

    const addContact = (resolvedContact, point) => {
      const key = [resolvedContact.normal.x, resolvedContact.normal.y, resolvedContact.normal.z]
        .map(value => value.toFixed(5))
        .join(',');
      const group = contacts.get(key) || {
        normal: resolvedContact.normal,
        penetration: 0,
        hitPosition: new THREE.Vector3(),
        points: [],
        count: 0
      };
      group.penetration = Math.max(group.penetration, resolvedContact.penetration);
      group.hitPosition.add(point);
      group.points.push(point);
      group.count++;
      contacts.set(key, group);
    };

    for (let index = 0; index < samplePoints.length; index++) {
      const pt = samplePoints[index];
      const previousPoint = previousPose
        ? pt.clone()
          .sub(body.position)
          .applyQuaternion(inverseCurrentQuaternion)
          .applyQuaternion(previousPose.quaternion)
          .add(previousPose.position)
        : null;
      const contact = this.terrainContactAtPoint(pt);
      let sweptContact = shouldSweep && previousPoint
        ? this.sweepTerrainContact(previousPoint, pt)
        : null;
      if (!sweptContact && contact && previousPoint) {
        // Below the sweep threshold the substep displacement can still carry a
        // rotated corner deep enough that its endpoint reports an exit face
        // (a wall seam) instead of the face it entered through. The sweep from
        // the previous position carries the actual entry face and is safe to
        // attempt: it returns null when the start point is already embedded.
        sweptContact = this.sweepTerrainContact(previousPoint, pt);
      }
      // A deeply embedded endpoint may be closer to the far side of a voxel
      // and therefore report its exit face. The sweep carries the actual entry
      // face and must win whenever the point travelled far enough to need CCD.
      const resolvedContact = sweptContact || contact;
      if (!resolvedContact) continue;
      addContact(resolvedContact, sweptContact?.hitPosition || pt);
    }

    // Sampling one body's surface cannot see the dual face-edge topology: a
    // terrain edge can enter the interior of an OBB face while every sampled
    // body point remains outside terrain. Exact SAT must augment even a
    // non-empty sampled manifold, because a few shallow point contacts do not
    // constrain a different edge that is already entering the face.
    const sampledNormals = [...contacts.values()].map(group => group.normal);
    for (const exactContact of this.exactTerrainContacts(contraption, body)) {
      if (exactContact.penetration <= EXACT_TERRAIN_CONTACT_SLOP) continue;
      const terrainFeatureDimensions = ['x', 'y', 'z'].filter(axis => (
        Math.abs(exactContact.normal[axis]) > 1e-6
      )).length;
      // A sampled face normal already gives the higher-quality manifold for a
      // normal terrain face. The exact supplement is needed alongside it only
      // for a terrain edge/vertex, or when the sampled points constrain an
      // unrelated direction (for example both Z faces while a top edge is
      // entering the body along Y).
      const constrainedBySamples = sampledNormals.some(normal => (
        normal.dot(exactContact.normal) > 0.999
      ));
      if (constrainedBySamples && terrainFeatureDimensions < 2) continue;
      addContact(exactContact, exactContact.hitPosition);
    }

    // Resolve independent exposed faces in one sub-step (for example floor +
    // wall at a corner). The ground flag is reset once per frame by update(),
    // so a contact found in any adaptive sub-step remains stable for that frame.
    const groups = [...contacts.values()].sort((a, b) => b.penetration - a.penetration);
    for (const group of groups) {
      group.hitPosition.divideScalar(group.count);
      this.solveTerrainContact(
        body,
        group.normal,
        group.hitPosition,
        group.penetration,
        group.points,
        dt
      );
    }
  }

  applyImpulse(contraption, impulse, worldPoint = null, nodeId = 'root') {
    const body = contraption.getRigidBody?.(nodeId);
    if (!body || body.type !== BodyType.DYNAMIC) return;
    body.velocity.addScaledVector(impulse, 1 / body.mass);

    if (worldPoint) {
      const r = worldPoint.clone().sub(body.position);
      const torque = r.cross(impulse);
      body.angularVelocity.add(torque.multiplyScalar(body.inverseInertia));
    }
  }
}
