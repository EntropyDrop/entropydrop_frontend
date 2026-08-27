import * as THREE from 'three';
import { BlockTypes } from '../voxel/BlockTypes.ts';
import { BodyType } from '../contraption/Contraption.ts';
import type { World } from '../voxel/World.ts';

const ENTITY_BROADPHASE_CELL_SIZE = 32;

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

    const subSteps = 2;
    const sdt = dt / subSteps;
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
        this.resolveTerrainCollisionBody(contraption, body, sdt);
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
    const buckets = new Map<string, number[]>();
    const candidates = new Map<string, [number, number]>();
    for (let index = 0; index < colliders.length; index++) {
      const collider = colliders[index];
      const radius = Math.max(0.5, Number(collider.boundingRadius) || 0.5) + 0.5;
      const minX = Math.floor((collider.position.x - radius) / ENTITY_BROADPHASE_CELL_SIZE);
      const maxX = Math.floor((collider.position.x + radius) / ENTITY_BROADPHASE_CELL_SIZE);
      const minY = Math.floor((collider.position.y - radius) / ENTITY_BROADPHASE_CELL_SIZE);
      const maxY = Math.floor((collider.position.y + radius) / ENTITY_BROADPHASE_CELL_SIZE);
      const minZ = Math.floor((collider.position.z - radius) / ENTITY_BROADPHASE_CELL_SIZE);
      const maxZ = Math.floor((collider.position.z + radius) / ENTITY_BROADPHASE_CELL_SIZE);
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
    for (const [a, b] of candidates.values()) {
      if (!this.isDynamicCollider(colliders[a]) && !this.isDynamicCollider(colliders[b])) continue;
      this.resolveContraptionPair(colliders[a], colliders[b]);
    }
  }

  isDynamicCollider(contraption) {
    return !!contraption?.getRigidBodies?.().some(body => body.type === BodyType.DYNAMIC);
  }

  resolveContraptionPair(a, b) {
    if (a === b) return;

    // Fast rejection: loose bounding-sphere test only. Exact contact is
    // decided per collision cell (world AABB), because boundingRadius
    // overestimates flat/wide entities and would cause ghost bounces
    // (a falling aircraft "hitting" a platform 2m above its top face).
    const dist = a.position.distanceTo(b.position);
    if (dist > a.boundingRadius + b.boundingRadius + 0.5) return;

    const boxesA = a.getCollisionWorldAABBs?.() || [];
    const boxesB = b.getCollisionWorldAABBs?.() || [];
    let best = null;

    for (const ba of boxesA) {
      for (const bb of boxesB) {
        const bodyA = a.getRigidBody?.(ba.bodyId || ba.entityId || 'root');
        const bodyB = b.getRigidBody?.(bb.bodyId || bb.entityId || 'root');
        if (!bodyA || !bodyB || (bodyA.type !== BodyType.DYNAMIC && bodyB.type !== BodyType.DYNAMIC)) continue;
        const ox = Math.min(ba.maxX, bb.maxX) - Math.max(ba.minX, bb.minX);
        if (ox <= 0) continue;
        const oy = Math.min(ba.maxY, bb.maxY) - Math.max(ba.minY, bb.minY);
        if (oy <= 0) continue;
        const oz = Math.min(ba.maxZ, bb.maxZ) - Math.max(ba.minZ, bb.minZ);
        if (oz <= 0) continue;

        // Resolve along the axis of least penetration.
        const penetration = Math.min(ox, oy, oz);
        if (!best || penetration < best.penetration) {
          best = { axis: penetration === ox ? 'x' : penetration === oy ? 'y' : 'z', penetration, ba, bb, bodyA, bodyB };
        }
      }
    }
    if (!best) return;

    const { axis, penetration, ba, bb, bodyA, bodyB } = best;
    const minKey = `min${axis.toUpperCase()}`;
    const maxKey = `max${axis.toUpperCase()}`;
    const centerA = (ba[minKey] + ba[maxKey]) / 2;
    const centerB = (bb[minKey] + bb[maxKey]) / 2;
    const dir = centerB >= centerA ? 1 : -1;
    const normal = new THREE.Vector3(0, 0, 0);
    normal[axis] = dir;

    const invA = this.inverseMass(bodyA);
    const invB = this.inverseMass(bodyB);
    const totalInv = invA + invB;
    if (totalInv <= 0) return;

    const push = penetration * 0.9;
    bodyA.position.addScaledVector(normal, -push * invA / totalInv);
    bodyB.position.addScaledVector(normal, push * invB / totalInv);

    // Elastic impulse only while approaching along the contact normal.
    const relativeVelocity = bodyB.velocity.clone().sub(bodyA.velocity);
    const normalVelocity = relativeVelocity.dot(normal);
    if (normalVelocity < -0.05) {
      const restitution = Math.max(bodyA.restitution, bodyB.restitution);
      const impulse = -(1 + restitution) * normalVelocity / totalInv;
      bodyA.velocity.addScaledVector(normal, -impulse * invA);
      bodyB.velocity.addScaledVector(normal, impulse * invB);
    }

    a.syncAllBodyTransforms?.();
    b.syncAllBodyTransforms?.();
  }

  resolveTerrainCollisionBody(contraption, body, dt) {
    // A dynamic body's terrain contact includes every kinematic part rigidly
    // attached to it: after a child component is split off, the child's cells
    // still move with the body (scene-graph parent), so they must keep the
    // structure supported instead of silently losing that ground contact.
    const samplePoints = contraption.getCollisionSamplePoints(body.id, true);
    let totalNormal = new THREE.Vector3(0, 0, 0);
    let maxPenetration = 0;
    let collisionCount = 0;
    let avgHitPos = new THREE.Vector3(0, 0, 0);

    for (const pt of samplePoints) {
      const bx = Math.floor(pt.x);
      const by = Math.floor(pt.y);
      const bz = Math.floor(pt.z);

      const block = this.world.getBlock(bx, by, bz);
      let blockTopY = block !== BlockTypes.AIR ? by + 1.0 : null;
      if (blockTopY === null) {
        const mx = Math.floor(pt.x * 5);
        const my = Math.floor(pt.y * 5);
        const mz = Math.floor(pt.z * 5);
        if (((this.world as any).microVoxels?.get(mx, my, mz) ?? null) !== null) {
          blockTopY = (my + 1) / 5;
        }
      }

      if (blockTopY !== null) {
        const penY = blockTopY - pt.y;

        if (penY > 0 && penY < 1.2) {
          if (penY > maxPenetration) maxPenetration = penY;
          totalNormal.add(new THREE.Vector3(0, 1, 0));
          avgHitPos.add(pt);
          collisionCount++;
        }
      }
    }

    if (collisionCount > 0) {
      avgHitPos.divideScalar(collisionCount);
      totalNormal.normalize();

      // Lift out of penetration
      body.position.y += maxPenetration * 0.9;
      body.isOnGround = true;

      // Contact velocity
      const r = avgHitPos.clone().sub(body.position);
      const vContact = body.velocity.clone().add(body.angularVelocity.clone().cross(r));
      const normalVel = vContact.dot(totalNormal);

      if (normalVel < 0) {
        const restitution = Math.abs(normalVel) < 0.5 ? 0 : body.restitution;
        const impulseMag = -(1 + restitution) * normalVel * (body.mass * 0.6);
        const impulse = totalNormal.clone().multiplyScalar(impulseMag);

        body.velocity.addScaledVector(impulse, 1 / body.mass);

        // Surface friction
        const tangentVel = vContact.clone().sub(totalNormal.clone().multiplyScalar(normalVel));
        if (tangentVel.lengthSq() > 0.0001) {
          const tangentSpeed = tangentVel.length();
          const frictionDir = tangentVel.normalize().negate();
          const frictionMag = Math.min(tangentSpeed * body.mass, impulseMag * body.friction);
          body.velocity.addScaledVector(frictionDir, frictionMag / body.mass);
        }

        // Rotational torque from off-center collision
        const torque = r.clone().cross(impulse);
        body.angularVelocity.add(torque.multiplyScalar(body.inverseInertia));
        body.angularVelocity.multiplyScalar(0.85);

        // Settle tiny vibrations
        if (Math.abs(body.velocity.y) < 0.2) body.velocity.y = 0;
        if (body.velocity.lengthSq() < 0.01 && body.angularVelocity.lengthSq() < 0.02) {
          body.velocity.set(0, 0, 0);
          body.angularVelocity.set(0, 0, 0);
        }
      }
    } else {
      body.isOnGround = false;
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
