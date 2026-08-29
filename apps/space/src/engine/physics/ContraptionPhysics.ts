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
    let remainingFaces = 0b111111;
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
      if (index < 0 || !(penetration > 0)) return null;
      remainingFaces &= ~(1 << index);
      const normal = TERRAIN_FACE_NORMALS[index];
      const outside = point.clone().addScaledVector(normal, penetration + 0.002);
      // Shared faces inside solid terrain are not collision surfaces. Looking
      // just outside the candidate face leaves only the actual exposed shell.
      if (this.terrainCellAtPoint(outside)) continue;
      return { normal, penetration };
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

  solveTerrainContact(body, normal, hitPosition, penetration, contactCount, dt) {
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

    // Perfect voxels can balance forever on a sampled corner. Mimic real
    // contact asymmetry only on narrow upward support manifolds; this adds no
    // linear energy and never turns a wall collision into auto-levelling.
    if (normal.y > 0.5 && contactCount <= 2) {
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
    const inverseCurrentQuaternion = shouldSweep ? body.quaternion.clone().invert() : null;

    for (let index = 0; index < samplePoints.length; index++) {
      const pt = samplePoints[index];
      const contact = this.terrainContactAtPoint(pt);
      const previousPoint = shouldSweep
        ? pt.clone()
          .sub(body.position)
          .applyQuaternion(inverseCurrentQuaternion)
          .applyQuaternion(previousPose.quaternion)
          .add(previousPose.position)
        : null;
      const sweptContact = previousPoint
        ? this.sweepTerrainContact(previousPoint, pt)
        : null;
      // A deeply embedded endpoint may be closer to the far side of a voxel
      // and therefore report its exit face. The sweep carries the actual entry
      // face and must win whenever the point travelled far enough to need CCD.
      const resolvedContact = sweptContact || contact;
      if (!resolvedContact) continue;
      const key = `${resolvedContact.normal.x},${resolvedContact.normal.y},${resolvedContact.normal.z}`;
      const group = contacts.get(key) || {
        normal: resolvedContact.normal,
        penetration: 0,
        hitPosition: new THREE.Vector3(),
        count: 0
      };
      group.penetration = Math.max(group.penetration, resolvedContact.penetration);
      group.hitPosition.add(sweptContact?.hitPosition || pt);
      group.count++;
      contacts.set(key, group);
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
        group.count,
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
