import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { NavigationSystem } from '../src/ui/NavigationSystem.ts';
import { TORUS_SIZE_X, TORUS_SIZE_Z } from '../src/engine/torus/TorusWorld.ts';

function createMockElement(tag = 'div'): any {
  const listeners: Record<string, Function[]> = {};
  const children: any[] = [];
  const classListSet = new Set<string>();

  const el: any = {
    tagName: tag.toUpperCase(),
    style: {},
    dataset: {},
    value: '',
    textContent: '',
    children,
    childNodes: children,
    classList: {
      add(c: string) { classListSet.add(c); },
      remove(c: string) { classListSet.delete(c); },
      toggle(c: string, force?: boolean) {
        if (force !== undefined) {
          if (force) classListSet.add(c);
          else classListSet.delete(c);
          return force;
        }
        if (classListSet.has(c)) { classListSet.delete(c); return false; }
        classListSet.add(c); return true;
      },
      contains(c: string) { return classListSet.has(c); }
    },
    appendChild(child: any) {
      children.push(child);
      return child;
    },
    addEventListener(evt: string, cb: Function) {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(cb);
    },
    dispatchEvent(evt: any) {
      const type = evt.type || 'click';
      (listeners[type] || []).forEach(cb => cb(evt));
    },
    click() {
      (listeners['click'] || []).forEach(cb => cb({ stopPropagation() {}, currentTarget: el, target: el }));
    },
    contains(target: any) {
      return target === el || children.some(c => c.contains?.(target));
    },
    querySelector(selector: string) {
      if (selector.startsWith('#')) {
        const id = selector.slice(1);
        if (el.id === id) return el;
        for (const child of children) {
          if (child.id === id) return child;
          const found = child.querySelector?.(selector);
          if (found) return found;
        }
      }
      return null;
    },
    set innerHTML(html: string) {
      const ids = ['nav-input-x', 'nav-input-y', 'nav-input-z', 'nav-start-btn'];
      children.length = 0;
      ids.forEach(id => {
        const child = createMockElement(id.startsWith('input') ? 'input' : 'button');
        child.id = id;
        if (id === 'nav-start-btn') child.textContent = 'START';
        children.push(child);
      });
    }
  };
  return el;
}

function setupMockDOM() {
  const windowListeners: Record<string, Function[]> = {};
  const mockDoc = {
    createElement: (tag: string) => createMockElement(tag),
    activeElement: null
  };
  (globalThis as any).document = mockDoc;
  (globalThis as any).window = {
    addEventListener: (evt: string, cb: Function) => {
      if (!windowListeners[evt]) windowListeners[evt] = [];
      windowListeners[evt].push(cb);
    },
    dispatchEvent: (evt: any) => {
      const type = evt.type || 'keydown';
      (windowListeners[type] || []).forEach(cb => cb(evt));
    }
  };

  return {
    cleanup() {
      (globalThis as any).document = undefined;
      (globalThis as any).window = undefined;
    },
    dispatchWindowEvent(type: string, data: any = {}) {
      (windowListeners[type] || []).forEach(cb => cb({ type, target: createMockElement('div'), ...data }));
    }
  };
}

function createMockPhysics(initialPos = { x: 8192, y: 20, z: 1024 }) {
  return {
    position: new THREE.Vector3(initialPos.x, initialPos.y, initialPos.z),
    velocity: new THREE.Vector3(0, 0, 0),
    isFlying: false,
    isOnGround: true,
  } as any;
}

function createMockController() {
  let lockRequested = false;
  return {
    yaw: 0.5,
    pitch: 0.2,
    isDriving: false,
    drivenContraption: null,
    get lockRequested() { return lockRequested; },
    requestLock() {
      lockRequested = true;
      return Promise.resolve(true);
    }
  } as any;
}

function createMockUI() {
  const toasts: string[] = [];
  return {
    toasts,
    showToast(msg: string) {
      toasts.push(msg);
    }
  } as any;
}

test('NavigationSystem renders simplified Auto Pilot DOM in English', () => {
  const dom = setupMockDOM();
  const parent = createMockElement('div');
  const physics = createMockPhysics();
  const controller = createMockController();
  const ui = createMockUI();

  const nav = new NavigationSystem(parent, physics, controller, ui);

  assert.ok(nav.container);
  assert.equal(nav.isNavigating, false);

  const startBtn = nav.container.querySelector('#nav-start-btn');
  assert.ok(startBtn);
  assert.equal(startBtn.textContent, 'START');
  dom.cleanup();
});

test('NavigationSystem switches to flight mode and requests pointer lock on start', () => {
  const dom = setupMockDOM();
  const parent = createMockElement('div');
  const physics = createMockPhysics({ x: 8192, y: 20, z: 1024 });
  const controller = createMockController();
  const ui = createMockUI();

  const nav = new NavigationSystem(parent, physics, controller, ui);

  nav.startNavigation(8300, 30, 1100);

  assert.equal(nav.isNavigating, true);
  assert.deepEqual(nav.target, { x: 8300, y: 30, z: 1100 });
  assert.equal(physics.isFlying, true);
  assert.equal(controller.lockRequested, true);

  const startBtn = nav.container.querySelector('#nav-start-btn');
  assert.equal(startBtn.textContent, 'STOP');
  assert.ok(ui.toasts.some((t: string) => t.includes('Auto Pilot Engaged')));
  dom.cleanup();
});

test('NavigationSystem advances position while preserving camera rotation freedom', () => {
  const dom = setupMockDOM();
  const parent = createMockElement('div');
  const physics = createMockPhysics({ x: 16380, y: 20, z: 1000 });
  const controller = createMockController();
  controller.yaw = 1.234; // Player looking in arbitrary direction
  const ui = createMockUI();

  const nav = new NavigationSystem(parent, physics, controller, ui);
  nav.startNavigation(10, 20, 1000);

  nav.update(0.1);

  assert.equal(nav.isNavigating, true);
  // Toroidal wrap progress
  assert.ok(physics.position.x > 16380 || physics.position.x < 100);
  // Camera yaw is NOT overridden, player is free to look around
  assert.equal(controller.yaw, 1.234);
  dom.cleanup();
});

test('NavigationSystem stops and snaps to target upon arrival with Target Reached toast', () => {
  const dom = setupMockDOM();
  const parent = createMockElement('div');
  const physics = createMockPhysics({ x: 8192, y: 20, z: 1024 });
  const controller = createMockController();
  const ui = createMockUI();

  const nav = new NavigationSystem(parent, physics, controller, ui);
  nav.startNavigation(8192.3, 20, 1024.2);

  // Step to reach destination (< 0.6m)
  nav.update(0.1);

  assert.equal(nav.isNavigating, false);
  assert.equal(nav.target, null);
  assert.ok(Math.abs(physics.position.x - 8192.3) < 0.001);
  assert.ok(Math.abs(physics.position.y - 20) < 0.001);
  assert.ok(Math.abs(physics.position.z - 1024.2) < 0.001);
  assert.ok(ui.toasts.some((t: string) => t.includes('Target Reached')));
  dom.cleanup();
});

test('NavigationSystem cancels on key press with Auto Pilot Disengaged toast', () => {
  const dom = setupMockDOM();
  const parent = createMockElement('div');
  const physics = createMockPhysics({ x: 8192, y: 20, z: 1024 });
  const controller = createMockController();
  const ui = createMockUI();

  const nav = new NavigationSystem(parent, physics, controller, ui);
  nav.startNavigation(8500, 20, 1200);
  assert.equal(nav.isNavigating, true);

  // User presses a key
  dom.dispatchWindowEvent('keydown', { code: 'KeyW', key: 'w' });

  assert.equal(nav.isNavigating, false);
  assert.equal(nav.target, null);
  assert.ok(ui.toasts.some((t: string) => t.includes('Auto Pilot Disengaged')));
  dom.cleanup();
});

test('NavigationSystem startNavigation syncs coordinates to input elements', () => {
  const dom = setupMockDOM();
  const parent = createMockElement('div');
  const physics = createMockPhysics({ x: 100, y: 20, z: 200 });
  const controller = createMockController();
  const ui = createMockUI();

  const nav = new NavigationSystem(parent, physics, controller, ui);
  nav.startNavigation(500, 65, 800);

  const inputX = parent.querySelector('#nav-input-x');
  const inputY = parent.querySelector('#nav-input-y');
  const inputZ = parent.querySelector('#nav-input-z');

  assert.equal(inputX?.value, '500');
  assert.equal(inputY?.value, '65');
  assert.equal(inputZ?.value, '800');
  dom.cleanup();
});
