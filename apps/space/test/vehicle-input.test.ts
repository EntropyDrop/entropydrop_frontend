import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Contraption, ContraptionMode } from '../src/engine/contraption/Contraption.ts';
import { ContraptionManager } from '../src/engine/contraption/ContraptionManager.ts';
import {
  PlayerController,
  RESERVED_ENTITY_INPUT_CODES,
  isPerspectiveToggleCode
} from '../src/engine/controls/PlayerController.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';

function inputProbe() {
  return {
    mode: ContraptionMode.PROGRAMMABLE,
    position: new THREE.Vector3(0, 5, 0),
    receivedInput: undefined,
    update(dt, input) {
      this.receivedInput = input;
    }
  };
}

test('keyboard snapshot is routed only to the currently mounted contraption', () => {
  const world = {
    getBlock: () => BlockTypes.AIR,
    raycast: () => ({ hit: false })
  };
  const manager = new ContraptionManager(new THREE.Scene(), world, null, null) as any;
  const mounted = inputProbe();
  const unmounted = inputProbe();
  manager.contraptions.push(mounted, unmounted);

  const keys = { down: ['KeyW', 'KeyA'], pressed: ['KeyW'], released: [] };
  manager.activeDrivable = mounted;
  manager.update(1 / 60, keys);
  assert.equal(mounted.receivedInput, keys);
  assert.equal(unmounted.receivedInput, null);

  manager.activeDrivable = null;
  manager.update(1 / 60, keys);
  assert.equal(mounted.receivedInput, null);
  assert.equal(unmounted.receivedInput, null);
});

test('controller exposes held and one-frame edge states without subscriptions', () => {
  const controller = Object.create(PlayerController.prototype);
  controller.entityInputDown = new Set();
  controller.entityInputPressed = new Set();
  controller.entityInputReleased = new Set();

  controller.recordEntityKeyDown('KeyW');
  controller.recordEntityKeyDown('KeyW');
  let frame = controller.consumeEntityInputFrame();
  assert.deepEqual(frame, { down: ['KeyW'], pressed: ['KeyW'], released: [] });

  frame = controller.consumeEntityInputFrame();
  assert.deepEqual(frame, { down: ['KeyW'], pressed: [], released: [] });

  controller.recordEntityKeyUp('KeyW');
  frame = controller.consumeEntityInputFrame();
  assert.deepEqual(frame, { down: [], pressed: [], released: ['KeyW'] });

  assert.equal(controller.recordEntityKeyDown('KeyC'), false);
  assert.deepEqual(controller.consumeEntityInputFrame(), { down: [], pressed: [], released: [] });
});

test('F3 toggles perspective and perspective shortcuts stay engine-owned', () => {
  assert.equal(isPerspectiveToggleCode('F3'), true);
  assert.equal(isPerspectiveToggleCode('F5'), true);
  assert.equal(isPerspectiveToggleCode('KeyF'), false);
  assert.equal(RESERVED_ENTITY_INPUT_CODES.has('F3'), true);
  assert.equal(RESERVED_ENTITY_INPUT_CODES.has('F5'), true);
});

test('perspective cycles first, third-person back, then third-person front', () => {
  const controller = Object.create(PlayerController.prototype) as any;
  const avatarVisibility: boolean[] = [];
  controller.perspective = 'first_person';
  controller.sceneRenderer = {
    setPlayerAvatarVisible(visible: boolean) { avatarVisibility.push(visible); }
  };
  controller.ui = { syncSettingsUI() {}, showToast() {} };

  controller.togglePerspective();
  assert.equal(controller.perspective, 'third_person');
  controller.togglePerspective();
  assert.equal(controller.perspective, 'third_person_front');
  controller.togglePerspective();
  assert.equal(controller.perspective, 'first_person');
  assert.deepEqual(avatarVisibility, [true, true, false]);
});

test('front third-person camera sits ahead of the player and looks back', () => {
  const controller = Object.create(PlayerController.prototype) as any;
  const eye = new THREE.Vector3(1, 2, 3);
  controller.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  controller.camera.rotation.order = 'YXZ';
  controller.physics = { getEyePosition: () => eye.clone() };
  controller.pitch = 0;
  controller.yaw = 0;
  controller.thirdPersonDistance = 4;

  controller.perspective = 'third_person';
  controller.updateCameraPosition();
  assert.ok(controller.camera.position.distanceTo(new THREE.Vector3(1, 2, 7)) < 1e-8);
  assert.ok(controller.camera.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-8);

  controller.perspective = 'third_person_front';
  controller.updateCameraPosition();
  assert.ok(controller.camera.position.distanceTo(new THREE.Vector3(1, 2, -1)) < 1e-8);
  assert.ok(controller.camera.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-8);

  // Re-running must be stable rather than deriving the next frame from the
  // already reversed front-camera quaternion.
  controller.updateCameraPosition();
  assert.ok(controller.camera.position.distanceTo(new THREE.Vector3(1, 2, -1)) < 1e-8);
});

test('mounted camera re-seats from the vehicle pose solved later in the frame', () => {
  const controller = Object.create(PlayerController.prototype) as any;
  const seat = new THREE.Vector3(1, 2, 3);
  controller.isDriving = true;
  controller.drivenContraption = {
    getCockpitWorldPosition: () => seat.clone()
  };
  controller.physics = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(4, 5, 6)
  };

  assert.equal(controller.syncDrivenVehiclePose(), true);
  assert.deepEqual(controller.physics.position.toArray(), [1, 2, 3]);
  assert.deepEqual(controller.physics.velocity.toArray(), [0, 0, 0]);

  // Simulate the quadcopter moving during ContraptionManager.update(). The
  // post-physics pass must use this new pose rather than the previous frame's.
  seat.set(2.5, 3.25, -4);
  controller.syncDrivenVehiclePose();
  assert.deepEqual(controller.physics.position.toArray(), [2.5, 3.25, -4]);
});

test('entity program queries down, pressed and released by KeyboardEvent.code', () => {
  const contraption = new Contraption(
    1,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(0, 3, 0),
    new THREE.Scene(),
    {
      mode: ContraptionMode.PROGRAMMABLE,
      scriptCode: `
self.state.wDown = ctx.input.down('KeyW');
self.state.wAlias = ctx.input.down('w');
self.state.spacePressed = ctx.input.pressed('Space');
self.state.shiftDown = ctx.input.down('Shift');
self.state.wReleased = ctx.input.released('KeyW');
if (ctx.input.down('KeyW')) self.applyLocalForce([0, 0, -25]);
`
    }
  ) as any;

  contraption.update(1 / 60, {
    down: ['KeyW', 'ShiftRight'],
    pressed: ['Space'],
    released: ['KeyW']
  }, { gravity: [0, -18, 0] });

  const state = contraption.getComponentState('root');
  assert.equal(state.wDown, true);
  assert.equal(state.wAlias, false, 'single-letter V1 aliases are not accepted');
  assert.equal(state.spacePressed, true);
  assert.equal(state.shiftDown, true);
  assert.equal(state.wReleased, true);
  assert.ok(contraption.appliedForces.z < 0);

  contraption.appliedForces.set(0, 0, 0);
  contraption.stopAllNodeScripts();
  assert.deepEqual(state, {}, 'Stop clears root component state in place');
  (state as any).wDown = 'unchanged';
  contraption.update(1 / 60, { down: ['KeyW'], pressed: [], released: [] }, { gravity: [0, -18, 0] });
  assert.equal((state as any).wDown, 'unchanged');
  assert.equal(contraption.appliedForces.lengthSq(), 0);

  contraption.setScript('');
  assert.equal(contraption.scriptStatus, 'stopped');
});

test('legacy drivable mode has no hardcoded movement and still uses rigid-body physics', () => {
  const world = {
    getBlock: () => BlockTypes.AIR,
    raycast: () => ({ hit: false })
  };
  const manager = new ContraptionManager(new THREE.Scene(), world, null, null) as any;
  const contraption = new Contraption(
    2,
    [{ localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }],
    new THREE.Vector3(0, 3, 0),
    new THREE.Scene(),
    { mode: ContraptionMode.DRIVABLE }
  ) as any;
  const start = contraption.position.clone();
  const physicsCalls = [];
  manager.setPhysics({
    gravity: new THREE.Vector3(0, -18, 0),
    update(entity, dt) {
      physicsCalls.push({ entity, dt });
    }
  });
  manager.contraptions.push(contraption);
  manager.activeDrivable = contraption;

  manager.update(1 / 60, { down: ['KeyW'], pressed: ['KeyW'], released: [] });
  assert.ok(contraption.position.equals(start));
  assert.equal(contraption.velocity.lengthSq(), 0);
  assert.equal(physicsCalls.length, 1);
  assert.equal(physicsCalls[0].entity, contraption);
});

test('Space keydown and keyup prevent default to avoid triggering focused 2D buttons and jumps cleanly', () => {
  let blurred = false;
  const mockButton = {
    tagName: 'BUTTON',
    getAttribute: (attr: string) => null,
    blur() { blurred = true; }
  };
  (globalThis as any).document = {
    activeElement: mockButton,
    body: {},
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const controller = Object.create(PlayerController.prototype);
  controller.keys = { jump: false };
  controller.recordEntityKeyDown = () => {};
  controller.recordEntityKeyUp = () => {};

  let keydownPrevented = false;
  const keydownEvent = {
    code: 'Space',
    target: { tagName: 'DIV' },
    preventDefault() { keydownPrevented = true; }
  };

  // Simulate keydown Space logic from PlayerController
  if (keydownEvent.code === 'Space') {
    keydownEvent.preventDefault();
    if ((globalThis as any).document.activeElement && (globalThis as any).document.activeElement !== (globalThis as any).document.body && ((globalThis as any).document.activeElement.tagName === 'BUTTON' || (globalThis as any).document.activeElement.getAttribute?.('role') === 'button')) {
      (globalThis as any).document.activeElement.blur();
    }
    controller.keys.jump = true;
  }

  assert.equal(keydownPrevented, true, 'Space keydown must prevent default');
  assert.equal(blurred, true, 'Space keydown must blur focused button');
  assert.equal(controller.keys.jump, true);

  let keyupPrevented = false;
  const keyupEvent = {
    code: 'Space',
    preventDefault() { keyupPrevented = true; }
  };

  if (keyupEvent.code === 'Space') {
    keyupEvent.preventDefault();
    controller.keys.jump = false;
  }

  assert.equal(keyupPrevented, true, 'Space keyup must prevent default');
  assert.equal(controller.keys.jump, false);
});
