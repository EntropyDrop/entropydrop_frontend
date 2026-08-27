import { TORUS_SIZE_X, TORUS_SIZE_Z, wrapX, wrapZ } from '../engine/torus/TorusWorld.ts';
import type { PlayerPhysics } from '../engine/physics/PlayerPhysics.ts';
import type { PlayerController } from '../engine/controls/PlayerController.ts';
import type { UIManager } from './UIManager.ts';

export interface NavigationTarget {
  x: number;
  y: number;
  z: number;
}

export interface NavigationState {
  isNavigating: boolean;
  target: NavigationTarget | null;
  distanceRemaining: number;
  currentSpeed: number;
  etaSeconds: number;
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
  decelDistance = 30.0; // meters at which deceleration begins
  arrivalThreshold = 0.6; // meters within target considered arrived

  isCollapsed = false;

  // DOM Elements
  private statusBadge: HTMLElement | null = null;
  private activeInfoEl: HTMLElement | null = null;
  private inputFormEl: HTMLElement | null = null;
  private inputX: HTMLInputElement | null = null;
  private inputY: HTMLInputElement | null = null;
  private inputZ: HTMLInputElement | null = null;
  private destCoordsEl: HTMLElement | null = null;
  private metricDistEl: HTMLElement | null = null;
  private metricSpeedEl: HTMLElement | null = null;
  private metricEtaEl: HTMLElement | null = null;
  private toggleBtn: HTMLElement | null = null;

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
      <div class="nav-header">
        <div class="nav-title-row">
          <span class="nav-icon">🧭</span>
          <span class="nav-title">NAV SYSTEM</span>
          <span id="nav-status-badge" class="nav-status-badge ready">READY</span>
        </div>
        <button type="button" id="nav-toggle-btn" class="nav-toggle-btn" title="Toggle Navigation Panel (折叠/展开)">−</button>
      </div>

      <div id="nav-body" class="nav-body">
        <!-- Active Flight Nav HUD -->
        <div id="nav-active-info" class="nav-active-info" style="display: none;">
          <div class="nav-dest-row">
            <span class="nav-dest-tag">TARGET</span>
            <span id="nav-dest-coords" class="nav-dest-coords">X: 0 | Y: 0 | Z: 0</span>
          </div>
          <div class="nav-metrics-grid">
            <div class="nav-metric-card">
              <span class="nav-metric-label">DISTANCE</span>
              <span id="nav-metric-dist" class="nav-metric-val">0 m</span>
            </div>
            <div class="nav-metric-card">
              <span class="nav-metric-label">SPEED</span>
              <span id="nav-metric-speed" class="nav-metric-val">40 m/s</span>
            </div>
            <div class="nav-metric-card">
              <span class="nav-metric-label">ETA</span>
              <span id="nav-metric-eta" class="nav-metric-val">0s</span>
            </div>
          </div>
          <div class="nav-hint-row">
            <span class="nav-hint-pulse">●</span>
            <span class="nav-hint-text">按任意键退出导航模式</span>
          </div>
          <button type="button" id="nav-stop-btn" class="nav-action-btn stop-btn">⏹ 退出导航 (Cancel)</button>
        </div>

        <!-- Coordinates Input Form -->
        <form id="nav-input-form" class="nav-input-form" onsubmit="return false;">
          <div class="nav-coord-inputs">
            <div class="nav-input-field">
              <span class="nav-coord-label">X</span>
              <input type="number" id="nav-input-x" class="nav-number-input" placeholder="8192" step="any" required />
            </div>
            <div class="nav-input-field">
              <span class="nav-coord-label">Y</span>
              <input type="number" id="nav-input-y" class="nav-number-input" placeholder="20" step="any" required />
            </div>
            <div class="nav-input-field">
              <span class="nav-coord-label">Z</span>
              <input type="number" id="nav-input-z" class="nav-number-input" placeholder="1024" step="any" required />
            </div>
          </div>

          <div class="nav-presets-row">
            <button type="button" class="nav-preset-chip" data-x="8192" data-y="20" data-z="1024" title="Spawn Pad (8192, 20, 1024)">Spawn</button>
            <button type="button" class="nav-preset-chip" data-x="0" data-y="20" data-z="0" title="Origin (0, 20, 0)">Origin</button>
            <button type="button" id="nav-fill-current-btn" class="nav-preset-chip fill-curr" title="获取当前角色坐标">Current</button>
          </div>

          <button type="button" id="nav-start-btn" class="nav-action-btn start-btn">▶ 开启自动飞行导航 (Navigate)</button>
        </form>
      </div>
    `;

    this.statusBadge = this.container.querySelector('#nav-status-badge');
    this.activeInfoEl = this.container.querySelector('#nav-active-info');
    this.inputFormEl = this.container.querySelector('#nav-input-form');
    this.inputX = this.container.querySelector('#nav-input-x');
    this.inputY = this.container.querySelector('#nav-input-y');
    this.inputZ = this.container.querySelector('#nav-input-z');
    this.destCoordsEl = this.container.querySelector('#nav-dest-coords');
    this.metricDistEl = this.container.querySelector('#nav-metric-dist');
    this.metricSpeedEl = this.container.querySelector('#nav-metric-speed');
    this.metricEtaEl = this.container.querySelector('#nav-metric-eta');
    this.toggleBtn = this.container.querySelector('#nav-toggle-btn');
  }

  private bindEvents() {
    // Collapse / Expand toggle
    this.toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleCollapse();
    });

    // Preset chips
    this.container.querySelectorAll('.nav-preset-chip[data-x]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLElement;
        const x = btn.dataset.x;
        const y = btn.dataset.y;
        const z = btn.dataset.z;
        if (x && this.inputX) this.inputX.value = x;
        if (y && this.inputY) this.inputY.value = y;
        if (z && this.inputZ) this.inputZ.value = z;
      });
    });

    // Fill current position
    this.container.querySelector('#nav-fill-current-btn')?.addEventListener('click', () => {
      if (this.inputX) this.inputX.value = this.physics.position.x.toFixed(1);
      if (this.inputY) this.inputY.value = this.physics.position.y.toFixed(1);
      if (this.inputZ) this.inputZ.value = this.physics.position.z.toFixed(1);
    });

    // Start navigation button
    this.container.querySelector('#nav-start-btn')?.addEventListener('click', () => {
      this.handleStartFromInputs();
    });

    // Stop navigation button
    this.container.querySelector('#nav-stop-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.stopNavigation('cancelled');
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

    // "按任意键退出导航模式" (Press any key to exit navigation mode)
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

      // Clicking / PointerDown outside while navigating also cancels
      window.addEventListener('pointerdown', (e) => {
        if (!this.isNavigating) return;
        if (this.container && this.container.contains && this.container.contains(e.target as Node)) return;
        this.stopNavigation('cancelled');
      }, true);
    }
  }

  toggleCollapse(force?: boolean) {
    this.isCollapsed = force !== undefined ? force : !this.isCollapsed;
    this.container.classList.toggle('collapsed', this.isCollapsed);
    if (this.toggleBtn) {
      this.toggleBtn.textContent = this.isCollapsed ? '+' : '−';
    }
  }

  handleStartFromInputs() {
    const rawX = parseFloat(this.inputX?.value || '');
    const rawY = parseFloat(this.inputY?.value || '');
    const rawZ = parseFloat(this.inputZ?.value || '');

    if (isNaN(rawX) || isNaN(rawZ)) {
      this.ui?.showToast('⚠️ 请输入有效的目标坐标 (X, Z)');
      return;
    }

    const targetX = wrapX(rawX);
    const targetZ = wrapZ(rawZ);
    // If Y is unspecified or invalid, default to a safe flight altitude (at least 20m or current Y)
    const targetY = !isNaN(rawY) ? Math.max(0, Math.min(256, rawY)) : Math.max(20, this.physics.position.y);

    this.startNavigation(targetX, targetY, targetZ);
    // Blur any active input so pointer lock / game can focus
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  startNavigation(targetX: number, targetY: number, targetZ: number) {
    this.target = { x: targetX, y: targetY, z: targetZ };
    this.isNavigating = true;

    // Automatically switch to flight mode
    this.physics.isFlying = true;
    this.physics.velocity.set(0, 0, 0);

    // Expand panel if collapsed so HUD is visible
    if (this.isCollapsed) {
      this.toggleCollapse(false);
    }

    // Update UI Elements
    this.updateUIState();

    this.ui?.showToast(`🚀 导航已启动：前往 (${targetX.toFixed(1)}, ${targetY.toFixed(1)}, ${targetZ.toFixed(1)})`);
  }

  stopNavigation(reason: 'arrived' | 'cancelled' = 'cancelled') {
    if (!this.isNavigating && !this.target) return;

    this.isNavigating = false;
    this.target = null;
    this.physics.velocity.set(0, 0, 0);

    this.updateUIState();

    if (reason === 'arrived') {
      this.ui?.showToast('🎯 已到达导航目标点！');
    } else if (reason === 'cancelled') {
      this.ui?.showToast('⏹ 自动飞行导航已退出');
    }
  }

  update(dt: number) {
    if (!this.isNavigating || !this.target) return;

    // Clamp dt to avoid huge jumps on frame drops
    const clampedDt = Math.min(dt, 0.1);

    // 1. Calculate toroidal displacement vector from current position to target
    let dx = wrapX(this.target.x) - wrapX(this.physics.position.x);
    if (dx > TORUS_SIZE_X / 2) dx -= TORUS_SIZE_X;
    else if (dx < -TORUS_SIZE_X / 2) dx += TORUS_SIZE_X;

    let dz = wrapZ(this.target.z) - wrapZ(this.physics.position.z);
    if (dz > TORUS_SIZE_Z / 2) dz -= TORUS_SIZE_Z;
    else if (dz < -TORUS_SIZE_Z / 2) dz += TORUS_SIZE_Z;

    let dy = this.target.y - this.physics.position.y;

    const distXZ = Math.hypot(dx, dz);
    const distTotal = Math.hypot(dx, dy, dz);

    // 2. Check Arrival
    if (distTotal <= this.arrivalThreshold) {
      this.physics.position.x = wrapX(this.target.x);
      this.physics.position.y = this.target.y;
      this.physics.position.z = wrapZ(this.target.z);
      this.stopNavigation('arrived');
      return;
    }

    // 3. Smooth Camera/Player Yaw alignment towards destination
    if (distXZ > 0.5) {
      const targetYaw = Math.atan2(-dx, -dz);
      let yawDiff = targetYaw - this.controller.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      this.controller.yaw += yawDiff * Math.min(1.0, clampedDt * 5.0);
    }

    // 4. Calculate Speed with smooth ease-out on approach
    let speed = this.cruiseSpeed;
    if (distTotal < this.decelDistance) {
      const t = distTotal / this.decelDistance;
      speed = Math.max(this.minSpeed, this.cruiseSpeed * Math.sqrt(t));
    }

    // 5. Advance position along unit trajectory
    const step = Math.min(distTotal, speed * clampedDt);
    const dirX = dx / distTotal;
    const dirY = dy / distTotal;
    const dirZ = dz / distTotal;

    this.physics.position.x = wrapX(this.physics.position.x + dirX * step);
    this.physics.position.y += dirY * step;
    this.physics.position.z = wrapZ(this.physics.position.z + dirZ * step);

    // 6. Update HUD Metrics
    const etaSeconds = Math.ceil(distTotal / Math.max(1, speed));
    if (this.metricDistEl) {
      this.metricDistEl.textContent = distTotal >= 1000 ? `${(distTotal / 1000).toFixed(1)} km` : `${Math.round(distTotal)} m`;
    }
    if (this.metricSpeedEl) {
      this.metricSpeedEl.textContent = `${Math.round(speed)} m/s`;
    }
    if (this.metricEtaEl) {
      this.metricEtaEl.textContent = `${etaSeconds}s`;
    }
  }

  private updateUIState() {
    if (this.isNavigating && this.target) {
      this.container.classList.add('navigating');
      if (this.statusBadge) {
        this.statusBadge.className = 'nav-status-badge active';
        this.statusBadge.textContent = 'AUTO-PILOT';
      }
      if (this.inputFormEl) this.inputFormEl.style.display = 'none';
      if (this.activeInfoEl) this.activeInfoEl.style.display = 'flex';
      if (this.destCoordsEl) {
        this.destCoordsEl.textContent = `X: ${this.target.x.toFixed(0)} | Y: ${this.target.y.toFixed(0)} | Z: ${this.target.z.toFixed(0)}`;
      }
    } else {
      this.container.classList.remove('navigating');
      if (this.statusBadge) {
        this.statusBadge.className = 'nav-status-badge ready';
        this.statusBadge.textContent = 'READY';
      }
      if (this.inputFormEl) this.inputFormEl.style.display = 'flex';
      if (this.activeInfoEl) this.activeInfoEl.style.display = 'none';
    }
  }
}
