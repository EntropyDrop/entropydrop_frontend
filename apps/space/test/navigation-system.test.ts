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
    querySelectorAll(selector: string) {
      const results: any[] = [];
      if (selector.includes('.nav-preset-chip')) {
        for (const child of children) {
          if (child.classList?.contains('nav-preset-chip')) results.push(child);
          if (child.querySelectorAll) results.push(...child.querySelectorAll(selector));
        }
      }
      return results;
    },
    set innerHTML(html: string) {
      // Create children elements matching IDs for testing
      const ids = [
        'nav-status-badge', 'nav-toggle-btn', 'nav-body', 'nav-active-info',
        'nav-dest-coords', 'nav-metric-dist', 'nav-metric-speed', 'nav-metric-eta',
        'nav-stop-btn', 'nav-input-form', 'nav-input-x', 'nav-input-y', 'nav-input-z',
        'nav-fill-current-btn', 'nav-start-btn'
      ];
      children.length = 0;
      ids.forEach(id => {
        const child = createMockElement(id.startsWith('input') ? 'input' : 'div');
        child.id = id;
        if (id === 'nav-status-badge') {
          child.textContent = 'READY';
        }
        children.push(child);
      });
      // Add preset chips
      const chip1 = createMockElement('button');
      chip1.classList.add('nav-preset-chip');
      chip1.dataset.x = '8192';
      chip1.dataset.y = '20';
      chip1.dataset.z = '1024';
      children.push(chip1);

      const chip2 = createMockElement('button');
      chip2.classList.add('nav-preset-chip');
      chip2.dataset.x = '0';
      chip2.dataset.y = '20';
      chip2.dataset.z = '0';
      children.push(chip2);
    }
  };
  return el;
}

function setupMockDOM() {
  const windowListeners: Record<string, Function[]> = {};
  const mockDoc = {
    createElement: (tag: string) => createMockElement(tag)
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
  return {
    yaw: 0,
    pitch: 0,
    isDriving: false,
    drivenContraption: null,
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

test('NavigationSystem renders DOM and initializes in ready state', () => {
  const dom = setupMockDOM();
  const parent = createMockElement('div');
  const physics = createMockPhysics();
  const controller = createMockController();
  const ui = createMockUI();

  const nav = new NavigationSystem(parent, physics, controller, ui);

  assert.ok(nav.container);
  assert.equal(nav.isNavigating, false);
  assert.equal(nav.container.classList.contains('navigating'), false);

  const badge = nav.container.querySelector('#nav-status-badge');
  assert.equal(badge?.textContent, 'READY');

  const startBtn = nav.container.querySelector('#nav-start-btn');
  assert.ok(startBtn);
  dom.cleanup();
});

test('NavigationSystem switches player to flight mode and sets target when navigation starts', () => {
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
  assert.equal(nav.container.classList.contains('navigating'), true);

  const badge = nav.container.querySelector('#nav-status-badge');
  assert.equal(badge?.textContent, 'AUTO-PILOT');
  assert.ok(ui.toasts.some((t: string) => t.includes('导航已启动')));
  dom.cleanup();
});

test('NavigationSystem advances player position along shortest toroidal path', () => {
  const dom = setupMockDOM();
  const parent = createMockElement('div');
  // Position near right edge of Torus X (16380)
  const physics = createMockPhysics({ x: 16380, y: 20, z: 1000 });
  const controller = createMockController();
  const ui = createMockUI();

  const nav = new NavigationSystem(parent, physics, controller, ui);
  // Target is just across the wrapped boundary at X = 10
  // Shortest toroidal path is forward by +14m, not backward by 16370m!
  nav.startNavigation(10, 20, 1000);

  nav.update(0.1); // 0.1s at cruise speed ~40m/s

  assert.equal(nav.isNavigating, true);
  // The player should move towards target across the wrap seam (around 16384/0)
  assert.ok(physics.position.x > 16380 || physics.position.x < 100);
  dom.cleanup();
});

test('NavigationSystem stops and snaps to target upon arrival', () => {
  const dom = setupMockDOM();
  const parent = createMockElement('div');
  const physics = createMockPhysics({ x: 8192, y: 20, z: 1024 });
  const controller = createMockController();
  const ui = createMockUI();

  const nav = new NavigationSystem(parent, physics, controller, ui);
  nav.startNavigation(8192.3, 20, 1024.2);

  // Small step to reach target (< 0.6m)
  nav.update(0.1);

  assert.equal(nav.isNavigating, false);
  assert.equal(nav.target, null);
  assert.ok(Math.abs(physics.position.x - 8192.3) < 0.001);
  assert.ok(Math.abs(physics.position.y - 20) < 0.001);
  assert.ok(Math.abs(physics.position.z - 1024.2) < 0.001);
  assert.ok(ui.toasts.some((t: string) => t.includes('已到达')));
  dom.cleanup();
});

test('NavigationSystem cancels navigation on stopNavigation or user key press', () => {
  const dom = setupMockDOM();
  const parent = createMockElement('div');
  const physics = createMockPhysics({ x: 8192, y: 20, z: 1024 });
  const controller = createMockController();
  const ui = createMockUI();

  const nav = new NavigationSystem(parent, physics, controller, ui);
  nav.startNavigation(8500, 20, 1200);
  assert.equal(nav.isNavigating, true);

  // User presses a key on window
  dom.dispatchWindowEvent('keydown', { code: 'KeyW', key: 'w' });

  assert.equal(nav.isNavigating, false);
  assert.equal(nav.target, null);
  assert.ok(ui.toasts.some((t: string) => t.includes('退出') || t.includes('取消')));
  dom.cleanup();
});

test('NavigationSystem presets populate input fields', () => {
  const dom = setupMockDOM();
  const parent = createMockElement('div');
  const physics = createMockPhysics({ x: 8192, y: 20, z: 1024 });
  const controller = createMockController();
  const ui = createMockUI();

  const nav = new NavigationSystem(parent, physics, controller, ui);

  const chips = nav.container.querySelectorAll('.nav-preset-chip');
  const spawnChip = chips.find((c: any) => c.dataset.x === '8192');
  spawnChip?.click();

  const inputX = nav.container.querySelector('#nav-input-x');
  const inputY = nav.container.querySelector('#nav-input-y');
  const inputZ = nav.container.querySelector('#nav-input-z');

  assert.equal(inputX.value, '8192');
  assert.equal(inputY.value, '20');
  assert.equal(inputZ.value, '1024');
  dom.cleanup();
});
