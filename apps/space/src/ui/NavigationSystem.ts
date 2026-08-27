import { TORUS_SIZE_X, TORUS_SIZE_Z, wrapX, wrapZ } from '../engine/torus/TorusWorld.ts';
import type { PlayerPhysics } from '../engine/physics/PlayerPhysics.ts';
import type { PlayerController } from '../engine/controls/PlayerController.ts';
import type { UIManager } from './UIManager.ts';

export interface NavigationTarget {
  x: number;
  y: number;
  z: number;
}

export class NavigationSystem {
  container: HTMLElement;
  physics: PlayerPhysics;
  controller: PlayerController;
  ui: UIManager | null;

  isNavigating = false;
  target: NavigationTarget | null = null;
  cruiseSpeed = 40.0; // m/s cruise flight speed
  minSpeed = 6.0; // m/s near-arrival minimum speed
  decelDistance = 25.0; // meters at which deceleration begins
  arrivalThreshold = 0.6; // meters within target considered arrived

  // DOM Elements
  private inputX: HTMLInputElement | null = null;
  private inputY: HTMLInputElement | null = null;
  private inputZ: HTMLInputElement | null = null;
  private startBtn: HTMLButtonElement | null = null;

  constructor(
    parent: HTMLElement,
    physics: PlayerPhysics,
    controller: PlayerController,
    ui: UIManager | null = null
  ) {
    this.physics = physics;
    this.controller = controller;
    this.ui = ui;

    this.container = document.createElement('div');
    this.container.id = 'nav-system-container';
    this.container.className = 'nav-system-container';

    this.render();
    parent.appendChild(this.container);

    this.bindEvents();
  }

  private render() {
    this.container.innerHTML = `
      <div class="nav-badge">
        <span class="hud-badge-dot"></span>
        <span>AUTO PILOT</span>
      </div>
      <div class="nav-coord-inputs">
        <div class="nav-input-field">
          <span class="nav-coord-label">X</span>
          <input type="number" id="nav-input-x" class="nav-number-input" placeholder="0" step="any" />
        </div>
        <div class="nav-input-field">
          <span class="nav-coord-label">Y</span>
          <input type="number" id="nav-input-y" class="nav-number-input" placeholder="20" step="any" />
        </div>
        <div class="nav-input-field">
          <span class="nav-coord-label">Z</span>
          <input type="number" id="nav-input-z" class="nav-number-input" placeholder="0" step="any" />
        </div>
      </div>
      <button type="button" id="nav-start-btn" class="nav-action-btn start-btn">START</button>
    `;

    this.inputX = this.container.querySelector('#nav-input-x');
    this.inputY = this.container.querySelector('#nav-input-y');
    this.inputZ = this.container.querySelector('#nav-input-z');
    this.startBtn = this.container.querySelector('#nav-start-btn');
  }

  private bindEvents() {
    // Start / Stop Toggle
    this.startBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.isNavigating) {
        this.stopNavigation('cancelled');
      } else {
        this.handleStartFromInputs();
      }
    });

    // Enter key in input fields starts navigation
    [this.inputX, this.inputY, this.inputZ].forEach(input => {
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleStartFromInputs();
        }
      });
    });

    // Press any key to exit navigation mode
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (!this.isNavigating) return;

        // Ignore key events originating from editable inputs
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }

        // Any user key press interrupts navigation immediately
        this.stopNavigation('cancelled');
      }, true);
    }
  }

  handleStartFromInputs() {
    const rawX = parseFloat(this.inputX?.value || '');
    const rawY = parseFloat(this.inputY?.value || '');
    const rawZ = parseFloat(this.inputZ?.value || '');

    if (isNaN(rawX) || isNaN(rawZ)) {
      this.ui?.showToast('Please enter valid coordinates (X, Z)');
      return;
    }

    const targetX = wrapX(rawX);
    const targetZ = wrapZ(rawZ);
    // If Y is unspecified or invalid, default to a safe flight altitude (at least 20m or current Y)
    const targetY = !isNaN(rawY) ? Math.max(0, Math.min(256, rawY)) : Math.max(20, this.physics.position.y);

    this.startNavigation(targetX, targetY, targetZ);
  }

  startNavigation(targetX: number, targetY: number, targetZ: number) {
    this.target = { x: targetX, y: targetY, z: targetZ };
    this.isNavigating = true;

    // Automatically switch to flight mode
    this.physics.isFlying = true;
    this.physics.velocity.set(0, 0, 0);

    // Update UI Elements
    this.updateUIState();

    // Blur active input so pointer lock / game can focus and allow 3D view rotation
    if (typeof document !== 'undefined' && typeof (document.activeElement as any)?.blur === 'function') {
      (document.activeElement as any).blur();
    }
    void this.controller?.requestLock?.();

    this.ui?.showToast(`Auto Pilot Engaged: (${targetX.toFixed(0)}, ${targetY.toFixed(0)}, ${targetZ.toFixed(0)})`);
  }

  stopNavigation(reason: 'arrived' | 'cancelled' = 'cancelled') {
    if (!this.isNavigating && !this.target) return;

    this.isNavigating = false;
    this.target = null;
    this.physics.velocity.set(0, 0, 0);

    this.updateUIState();

    if (reason === 'arrived') {
      this.ui?.showToast('Target Reached');
    } else if (reason === 'cancelled') {
      this.ui?.showToast('Auto Pilot Disengaged');
    }
  }

  update(dt: number) {
    if (!this.isNavigating || !this.target) return;

    const clampedDt = Math.min(dt, 0.1);

    // 1. Calculate toroidal displacement vector from current position to target
    let dx = wrapX(this.target.x) - wrapX(this.physics.position.x);
    if (dx > TORUS_SIZE_X / 2) dx -= TORUS_SIZE_X;
    else if (dx < -TORUS_SIZE_X / 2) dx += TORUS_SIZE_X;

    let dz = wrapZ(this.target.z) - wrapZ(this.physics.position.z);
    if (dz > TORUS_SIZE_Z / 2) dz -= TORUS_SIZE_Z;
    else if (dz < -TORUS_SIZE_Z / 2) dz += TORUS_SIZE_Z;

    let dy = this.target.y - this.physics.position.y;

    const distTotal = Math.hypot(dx, dy, dz);

    // 2. Check Arrival
    if (distTotal <= this.arrivalThreshold) {
      this.physics.position.x = wrapX(this.target.x);
      this.physics.position.y = this.target.y;
      this.physics.position.z = wrapZ(this.target.z);
      this.stopNavigation('arrived');
      return;
    }

    // 3. Smooth Speed calculation with ease-out on approach
    let speed = this.cruiseSpeed;
    if (distTotal < this.decelDistance) {
      const t = distTotal / this.decelDistance;
      speed = Math.max(this.minSpeed, this.cruiseSpeed * Math.sqrt(t));
    }

    // 4. Advance position along flight trajectory (player is free to rotate camera view via mouse)
    const step = Math.min(distTotal, speed * clampedDt);
    const dirX = dx / distTotal;
    const dirY = dy / distTotal;
    const dirZ = dz / distTotal;

    this.physics.position.x = wrapX(this.physics.position.x + dirX * step);
    this.physics.position.y += dirY * step;
    this.physics.position.z = wrapZ(this.physics.position.z + dirZ * step);
  }

  private updateUIState() {
    if (this.isNavigating) {
      this.container.classList.add('navigating');
      if (this.startBtn) {
        this.startBtn.className = 'nav-action-btn stop-btn';
        this.startBtn.textContent = 'STOP';
      }
    } else {
      this.container.classList.remove('navigating');
      if (this.startBtn) {
        this.startBtn.className = 'nav-action-btn start-btn';
        this.startBtn.textContent = 'START';
      }
    }
  }
}
