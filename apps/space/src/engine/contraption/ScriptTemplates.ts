// Built-in programmable force script templates for Space.

export const SCRIPT_TEMPLATES = [
  {
    id: 'ferris_wheel',
    name: 'Ferris Wheel (Dynamic Hinge Cabins)',
    description: 'The kinematic wheel carries eight dynamic cabins through hinge constraints; gravity keeps each cabin hanging naturally.',
    code: `/**
 * Ferris wheel with constrained dynamic cabins
 *
 * The root and wheel are kinematic. Each cabin is a separate dynamic rigid
 * body connected to the wheel by a hinge declared in the blueprint. This
 * controller only drives the wheel; the physics solver moves the cabins.
 */
const wheel = self.child('wheel');
const wheelRpm = 4;
if (wheel) {
  wheel.setLocalSpin([0, 0, 1], wheelRpm);
}

if (ctx.tick % 60 === 0) {
  ctx.log('[Ferris wheel] wheel runs at 4 RPM; dynamic cabins hang on hinges');
}
`
  },
  {
    id: 'kinetic_windmill',
    name: 'Kinematic Building Windmill (Child Entity Spin)',
    description: 'The root entity stays kinematic while the blades child entity keeps spinning around its own local origin.',
    code: `/**
 * Recursive entity windmill
 * The root entity is kinematic; the code only controls the relative motion of
 * the blades child component.
 */
const blades = self.child('blades');
if (blades) {
  blades.setLocalSpin([0, 0, 1], 16);
}

if (ctx.tick % 120 === 0) {
  ctx.log('[Windmill] blades child entity spins at 16 RPM relative to the root building');
}
`
  },
  {
    id: 'quadrotor_flight_controller',
    name: 'Quadcopter Flight Controller (Per-Component Thrust)',
    description: 'Four propellers are plain child components: setLocalSpin provides spin, per-component applyThrust provides lift. Differential thrust mixing balances, holds altitude, tilts, and yaw is driven by direct torque.',
    defaultTargetHeight: 4.5,
    code: `/**
 * Real quadcopter flight controller: generic components + per-component thrust
 *
 * Rotor layout (nose points to -Z):
 *   NW   NE
 *    \\   /
 *    /   \\
 *   SW   SE
 *
 * Every propeller is an ordinary child component with no special type:
 * - setLocalSpin([0,1,0], rpm) provides visual rotation.
 * - applyThrust([0, thrust, 0]) provides lift along body +Y, independently of spin.
 * Differential lift at the mounting points produces pitch and roll torque;
 * applyTorque controls yaw directly because propeller reaction torque was removed.
 */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (v, amount) => [v[0] * amount, v[1] * amount, v[2] * amount];

// 1. Initialize target height and heading
if (self.state.targetHeight === undefined) {
  self.state.targetHeight = 4.5;
  self.state.targetYaw = ctx.rotation[1];
  self.state.filteredGroundDistance = ctx.groundDistance;
  self.state.commandPitch = 0;
  self.state.commandRoll = 0;
}

if (ctx.input.down('Space')) self.state.targetHeight += 2.0 * ctx.deltaTime;
if (ctx.input.down('Shift')) self.state.targetHeight = Math.max(1.5, self.state.targetHeight - 2.0 * ctx.deltaTime);
const yawInput = (ctx.input.down('ArrowLeft') ? 1 : 0) - (ctx.input.down('ArrowRight') ? 1 : 0);
self.state.targetYaw = wrapAngle(self.state.targetYaw + yawInput * 1.1 * ctx.deltaTime);

// 2. Height PD: filter voxel-height steps so flying over a one-block edge does
//    not turn into an instantaneous collective-thrust kick.
const groundBlend = 1 - Math.exp(-5.0 * ctx.deltaTime);
self.state.filteredGroundDistance += (ctx.groundDistance - self.state.filteredGroundDistance) * groundBlend;
const gravityAcceleration = Math.abs(ctx.gravity[1]);
const heightError = self.state.targetHeight - self.state.filteredGroundDistance;
let collectiveTarget = ctx.mass * gravityAcceleration
  + heightError * ctx.mass * 8.0
  - ctx.velocity[1] * ctx.mass * 5.0;

// When tilted, only the vertical thrust component supports the weight, so compensate for the cos loss.
const tiltCos = Math.max(0.55, Math.cos(ctx.rotation[0]) * Math.cos(ctx.rotation[2]));
collectiveTarget = clamp(collectiveTarget / tiltCos, 0, ctx.limits.maxForce * 0.90);
if (self.state.collective === undefined) self.state.collective = collectiveTarget;
const collectiveBlend = 1 - Math.exp(-12.0 * ctx.deltaTime);
self.state.collective += (collectiveTarget - self.state.collective) * collectiveBlend;
const collective = self.state.collective;

// 3. Attitude PD. Smooth stick steps and project the world angular velocity
//    onto the craft axes. Differential lift acts around those craft axes, so
//    damping it with raw world X/Z rates caused cross-axis fighting after yaw.
const maxTilt = 0.16;
const rawPitch = (ctx.input.down('KeyW') ? -maxTilt : 0) + (ctx.input.down('KeyS') ? maxTilt : 0);
const rawRoll = (ctx.input.down('KeyA') ? maxTilt : 0) + (ctx.input.down('KeyD') ? -maxTilt : 0);
const stickBlend = 1 - Math.exp(-10.0 * ctx.deltaTime);
self.state.commandPitch += (rawPitch - self.state.commandPitch) * stickBlend;
self.state.commandRoll += (rawRoll - self.state.commandRoll) * stickBlend;
const pitchAxis = self.localToWorldDirection([1, 0, 0]);
const yawAxis = self.localToWorldDirection([0, 1, 0]);
const rollAxis = self.localToWorldDirection([0, 0, 1]);
const pitchRate = dot(ctx.angularVelocity, pitchAxis);
const yawRate = dot(ctx.angularVelocity, yawAxis);
const rollRate = dot(ctx.angularVelocity, rollAxis);

const pitchMoment = clamp(
  (self.state.commandPitch - ctx.rotation[0]) * ctx.mass * 42.0 - pitchRate * ctx.mass * 14.0,
  -ctx.mass * 24.0,
  ctx.mass * 24.0
);
const rollMoment = clamp(
  (self.state.commandRoll - ctx.rotation[2]) * ctx.mass * 42.0 - rollRate * ctx.mass * 14.0,
  -ctx.mass * 24.0,
  ctx.mass * 24.0
);
const yawMoment = clamp(
  wrapAngle(self.state.targetYaw - ctx.rotation[1]) * ctx.mass * 1.2 - yawRate * ctx.mass * 0.8,
  -ctx.mass * 0.8,
  ctx.mass * 0.8
);

// 4. X-configuration mixing. Arm length is 3 m; pitch/roll come from the
//    lift difference between propellers at their mounting points.
const armLength = 3.0;
const base = collective / 4;
const pitchMix = pitchMoment / (4 * armLength);
const rollMix = rollMoment / (4 * armLength);
const maxMotorThrust = ctx.limits.maxForce * 0.42;
const motor = {
  nw: clamp(base + pitchMix - rollMix, 0, maxMotorThrust),
  ne: clamp(base + pitchMix + rollMix, 0, maxMotorThrust),
  sw: clamp(base - pitchMix - rollMix, 0, maxMotorThrust),
  se: clamp(base - pitchMix + rollMix, 0, maxMotorThrust)
};

// Keep total output headroom so the controller never trips the whole-craft clamp, which would break the motor differential mix.
const motorTotal = motor.nw + motor.ne + motor.sw + motor.se;
const motorScale = motorTotal > ctx.limits.maxForce * 0.96
  ? ctx.limits.maxForce * 0.96 / motorTotal
  : 1;

// 5. Drive the four propellers: spin (kinematic) + per-component lift (physics).
//    applyThrust acts at each propeller's mounting point → differential lift
//    produces pitch/roll; the force direction is chosen by code, decoupled
//    from the spin axis.
for (const name of ['nw', 'ne', 'sw', 'se']) {
  const prop = self.child('rotor_' + name);
  if (!prop) continue;
  const thrust = motor[name] * motorScale;
  const rpm = 120 + Math.sqrt(thrust / maxMotorThrust) * 480;
  prop.setLocalSpin([0, 1, 0], rpm);
  prop.applyThrust([0, thrust, 0]);
}

// 6. Yaw: propeller drag counter-torque is gone (spin and thrust decoupled),
//    so heading is controlled directly around the craft's current up axis.
self.applyTorque(scale(yawAxis, yawMoment));

// 7. Debug log: show the four independent motor outputs so the mixing can be observed.
if (ctx.tick % 60 === 0) {
  ctx.log(\`[Quadcopter] Height \${ctx.groundDistance.toFixed(2)}/\${self.state.targetHeight.toFixed(1)}m | Motor NW:\${motor.nw.toFixed(0)} NE:\${motor.ne.toFixed(0)} SW:\${motor.sw.toFixed(0)} SE:\${motor.se.toFixed(0)}N\`);
}
`
  },
  {
    id: 'raycast_offroad_rover',
    name: 'Raycast Suspension Off-Road Rover',
    description: 'Four independent wheel raycasts drive spring-damper suspension, tire grip, steering, braking, and wheel animation on one dynamic chassis.',
    code: `/**
 * Four-wheel off-road rover with raycast suspension.
 *
 * The chassis is the only dynamic rigid body. Each wheel casts from its
 * suspension mount along body -Y; hit distance minus tire radius is the
 * current strut length. Spring, damper, drive, and lateral tire forces are
 * applied at that mount, so bumps create real chassis pitch and roll.
 *
 * Controls: W/S drive, A/D steer, Space brake.
 */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (v, amount) => [v[0] * amount, v[1] * amount, v[2] * amount];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

const wheels = [
  { id: 'wheel_fl', anchor: [0.5, 2.2, 0.8], front: true },
  { id: 'wheel_fr', anchor: [3.5, 2.2, 0.8], front: true },
  { id: 'wheel_rl', anchor: [0.5, 2.2, 5.2], front: false },
  { id: 'wheel_rr', anchor: [3.5, 2.2, 5.2], front: false }
];
const restLength = 1.2;
const wheelRadius = 0.8;
const springStrength = ctx.mass * 55.0;
const damperStrength = ctx.mass * 7.5;
const maxSpringForce = ctx.mass * 16.0;

if (!self.state.initialized) {
  self.state.initialized = true;
  self.state.throttle = 0;
  self.state.steer = 0;
  self.state.wheelBase = {};
  self.setCockpitPosition([0, 1.0, -0.45]);
  self.setVehicle(true);
  for (const spec of wheels) {
    const wheel = self.child(spec.id);
    if (wheel) self.state.wheelBase[spec.id] = wheel.getLocalPosition();
  }
}

// Smooth keyboard steps before they reach the tire forces.
const rawThrottle = (ctx.input.down('KeyW') ? 1 : 0) - (ctx.input.down('KeyS') ? 1 : 0);
const rawSteer = (ctx.input.down('KeyA') ? 1 : 0) - (ctx.input.down('KeyD') ? 1 : 0);
const throttleBlend = 1 - Math.exp(-6.0 * ctx.deltaTime);
const steerBlend = 1 - Math.exp(-9.0 * ctx.deltaTime);
self.state.throttle += (rawThrottle - self.state.throttle) * throttleBlend;
self.state.steer += (rawSteer - self.state.steer) * steerBlend;

const pivot = self.getPivot();
const down = self.localToWorldDirection([0, -1, 0]);
const up = scale(down, -1);
const speed = Math.sqrt(dot(ctx.velocity, ctx.velocity));
const steerAngle = self.state.steer * 0.48 / (1 + speed * 0.045);
const brake = ctx.input.down('Space');
let contacts = 0;

for (const spec of wheels) {
  const localOffset = sub(spec.anchor, pivot);
  const worldOffset = self.localToWorldDirection(localOffset);
  const origin = add(ctx.position, worldOffset);
  const pointVelocity = add(ctx.velocity, cross(ctx.angularVelocity, worldOffset));
  const localSteer = spec.front ? steerAngle : 0;
  const forward = self.localToWorldDirection([
    -Math.sin(localSteer),
    0,
    -Math.cos(localSteer)
  ]);
  const side = self.localToWorldDirection([
    Math.cos(localSteer),
    0,
    -Math.sin(localSteer)
  ]);
  const longitudinalSpeed = dot(pointVelocity, forward);
  const lateralSpeed = dot(pointVelocity, side);
  const hit = ctx.world.raycast(origin, down, restLength + wheelRadius);
  let compression = 0;

  if (hit) {
    contacts++;
    const suspensionLength = clamp(hit.distance - wheelRadius, 0, restLength);
    compression = restLength - suspensionLength;
    const suspensionSpeed = dot(pointVelocity, up);
    const springForce = clamp(
      compression * springStrength - suspensionSpeed * damperStrength,
      0,
      maxSpringForce
    );

    // Four driven tires, speed-proportional lateral grip, and a stronger
    // longitudinal force while the brake is held.
    let longitudinalForce = self.state.throttle * ctx.mass * 1.8
      - longitudinalSpeed * ctx.mass * 0.22;
    if (brake) longitudinalForce += -longitudinalSpeed * ctx.mass * 2.4;
    longitudinalForce = clamp(longitudinalForce, -ctx.mass * 4.0, ctx.mass * 4.0);
    const lateralForce = clamp(
      -lateralSpeed * ctx.mass * 1.7,
      -ctx.mass * 4.5,
      ctx.mass * 4.5
    );
    const tireForce = add(
      scale(up, springForce),
      add(scale(forward, longitudinalForce), scale(side, lateralForce))
    );
    self.applyForceAt(tireForce, spec.anchor);
  }

  // Wheels are visual-only kinematic children. Their collision is disabled by
  // the blueprint; the raycasts are the tire contact model.
  const wheel = self.child(spec.id);
  const base = self.state.wheelBase[spec.id];
  if (wheel && base) {
    wheel.setLocalPosition([base[0], base[1] + compression, base[2]]);
    const rpm = clamp(-longitudinalSpeed * 60 / (Math.PI * 2 * wheelRadius), -360, 360);
    wheel.setLocalSpin([1, 0, 0], rpm);
  }
}

self.state.contacts = contacts;
if (ctx.tick % 120 === 0) {
  ctx.log(\`[Rover] contacts \${contacts}/4 | speed \${speed.toFixed(1)} m/s | steer \${(steerAngle * 57.3).toFixed(0)}°\`);
}
`
  },
  {
    id: 'helicopter_flight_controller',
    name: 'Helicopter Flight Controller (Cyclic + Tail Rotor)',
    description: 'Single main rotor on a dynamic hull: body-axis lift applied at the center of mass tilts with the ship for lean-and-go flight, root pitch/roll/yaw PD torques act as the cyclic and tail rotor, and kinematic main/tail rotor children spin with the throttle.',
    code: `/**
 * Helicopter flight controller: one main rotor + one tail rotor
 *
 * The hull is a dynamic root body:
 * - Lift is applied along body +Y at the center of mass (a "virtual main
 *   rotor"), so when the ship tilts the lift vector tilts with it and the
 *   helicopter flies forward/sideways like a real single-rotor machine.
 * - Pitch/roll/yaw PD torques act as the cyclic and the tail rotor.
 * - The main_rotor and tail_rotor child components are kinematic and only
 *   provide the visual spin through setLocalSpin.
 *
 * Controls (global keys):
 *   Space / Shift          climb / descend
 *   W / S                  nose down / nose up
 *   A / D                  roll left / roll right
 *   ArrowLeft / ArrowRight yaw left / yaw right
 */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// 1. Initialize target height.
if (self.state.targetHeight === undefined) {
  self.state.targetHeight = 4.0;
}

if (ctx.input.down('Space')) self.state.targetHeight += 2.0 * ctx.deltaTime;
if (ctx.input.down('Shift')) self.state.targetHeight = Math.max(0.2, self.state.targetHeight - 2.0 * ctx.deltaTime);

// 2. Altitude PD: total lift from the virtual main rotor.
const gravityAcceleration = Math.abs(ctx.gravity[1]);
const heightError = self.state.targetHeight - ctx.groundDistance;
let lift = ctx.mass * gravityAcceleration
  + heightError * ctx.mass * 7.0
  - ctx.velocity[1] * ctx.mass * 4.5;

// When tilted, only the world-vertical component of the body-axis lift
// supports the weight, so compensate for the cos loss.
const tiltCos = Math.max(0.55, Math.cos(ctx.rotation[0]) * Math.cos(ctx.rotation[2]));
lift = clamp(lift / tiltCos, 0, ctx.limits.maxForce * 0.90);
self.applyLocalForce([0, lift, 0]);

// 3. Yaw: the tail rotor tracks a commanded yaw rate; releasing the pedals
//    damps the heading back to a stop. The gain must beat the per-frame
//    angular damping, otherwise sustained turns stall at a crawl.
const yawRate = (ctx.input.down('ArrowLeft') ? 0.9 : 0) - (ctx.input.down('ArrowRight') ? 0.9 : 0);
const yawMoment = clamp(
  (yawRate - ctx.angularVelocity[1]) * ctx.mass * 40.0 - ctx.angularVelocity[1] * ctx.mass * 12.0,
  -ctx.mass * 24.0,
  ctx.mass * 24.0
);

// 4. Cyclic PD: W/S pitch, A/D roll; releasing returns to level flight.
const maxTilt = 0.14;
const targetPitch = (ctx.input.down('KeyW') ? -maxTilt : 0) + (ctx.input.down('KeyS') ? maxTilt : 0);
const targetRoll = (ctx.input.down('KeyA') ? maxTilt : 0) + (ctx.input.down('KeyD') ? -maxTilt : 0);
const pitchMoment = clamp(
  (targetPitch - ctx.rotation[0]) * ctx.mass * 30.0 - ctx.angularVelocity[0] * ctx.mass * 12.0,
  -ctx.mass * 20.0,
  ctx.mass * 20.0
);
const rollMoment = clamp(
  (targetRoll - ctx.rotation[2]) * ctx.mass * 30.0 - ctx.angularVelocity[2] * ctx.mass * 12.0,
  -ctx.mass * 20.0,
  ctx.mass * 20.0
);
self.applyTorque([pitchMoment, yawMoment, rollMoment]);

// 5. Rotor visuals: the main rotor tracks throttle, the tail rotor the yaw demand.
const throttle = lift / (ctx.limits.maxForce * 0.90);
const mainRotor = self.child('main_rotor');
if (mainRotor) mainRotor.setLocalSpin([0, 1, 0], 60 + throttle * 160);
const tailRotor = self.child('tail_rotor');
if (tailRotor) tailRotor.setLocalSpin([1, 0, 0], 90 + Math.abs(yawRate) * 130);

// 6. Debug log.
if (ctx.tick % 60 === 0) {
  ctx.log(\`[Helicopter] Height \${ctx.groundDistance.toFixed(2)}/\${self.state.targetHeight.toFixed(1)}m | Lift \${lift.toFixed(0)}N | Pitch \${(ctx.rotation[0] * 57.3).toFixed(0)}° Roll \${(ctx.rotation[2] * 57.3).toFixed(0)}° | Main \${Math.round(60 + throttle * 160)} RPM Tail \${Math.round(90 + Math.abs(yawRate) * 130)} RPM\`);
}
 `
  },
  {
    id: 'harmonic_oscillator',
    name: 'Sine-Wave Driven Pendulum / Oscillator',
    description: 'Uses the trigonometric function F = A * sin(ωt) to produce smooth periodic oscillating forces and swaying.',
    code: `/**
 * Sine-wave driven oscillator script
 *
 * Core idea:
 * Use the sine function sin(ωt) to periodically reverse the force direction over time
 */

const frequency = 2.5; // oscillation frequency (rad/s)
const amplitude = 35.0; // swing amplitude (N)

// Compute the current periodic torque
const wave = Math.sin(ctx.time * frequency);
const torqueY = wave * amplitude;

self.applyTorque([0, torqueY, 0]);

// Periodic vertical bobbing
const verticalWave = Math.cos(ctx.time * frequency * 0.5) * 8.0;
const baseLift = ctx.mass * 18.0;
self.applyForce([0, baseLift + verticalWave, 0]);

if (ctx.tick % 45 === 0) {
  ctx.log(\`[WAVE] [Sine wave] Wave value: \${wave.toFixed(2)} | Torque output: \${torqueY.toFixed(1)} N·m\`);
}
`
  },
  {
    id: 'orbit_ufo',
    name: 'Orbiting Anti-Gravity UFO',
    description: 'Automatically circles the spawn point on a 3D orbit while riding a pulsing anti-gravity buoyancy.',
    code: `/**
 * Orbiting anti-gravity UFO script
 *
 * Core idea:
 * 1. Lock the orbit center, compute centripetal and tangential forces
 * 2. Circle automatically while holding a constant altitude
 */

// Record the orbit center origin
if (!self.state.center) {
  self.state.center = [ctx.position[0], ctx.position[1], ctx.position[2]];
  self.state.orbitRadius = 12.0;
  self.state.orbitSpeed = 1.2;
}

const cx = self.state.center[0];
const cz = self.state.center[2];
const targetY = self.state.center[1] + 6.0;

// 1. Anti-gravity altitude hover
const lift = ctx.mass * 18.0 + (targetY - ctx.position[1]) * 20.0 - ctx.velocity[1] * 10.0;
self.applyForce([0, Math.max(0, lift), 0]);

// 2. Compute the current angle and apply centripetal and tangential orbit forces
const angle = ctx.time * self.state.orbitSpeed;
const targetPosX = cx + Math.cos(angle) * self.state.orbitRadius;
const targetPosZ = cz + Math.sin(angle) * self.state.orbitRadius;

const dirX = targetPosX - ctx.position[0];
const dirZ = targetPosZ - ctx.position[2];

self.applyForce([dirX * 15.0 - ctx.velocity[0] * 4.0, 0, dirZ * 15.0 - ctx.velocity[2] * 4.0]);

// 3. Spin effect
self.applyTorque([0, 10.0, 0]);
// (jet flame particles removed)
`
  }
];
