import * as THREE from 'three';
import { BlockTypes, colorToHex, normalizeColor, PRESET_COLORS } from '../voxel/BlockTypes.ts';
import {
  BodyType,
  ContraptionMode,
  isValidComponentId,
  MAX_ENTITY_BOUNDS,
  MAX_ENTITY_COMPONENTS
} from '../contraption/Contraption.ts';
import { ActionDomain, executeBasicAction } from '../actions/BasicActions.ts';
import {
  bendPoint, bendDirection,
  TORUS_GREF, TORUS_SPAWN_X, TORUS_SPAWN_Z,
  wrapMicroX, wrapMicroZ
} from '../torus/TorusWorld.ts';
import { calculatePreviewDragForce } from '../render/SceneRenderer.ts';
import type { SpaceStorage } from '../storage/BrowserStorage.ts';

// Global editor/game commands stay engine-owned and are not exposed to entity
// programs, avoiding collisions between scripts and C/V/tool shortcuts.
export const RESERVED_ENTITY_INPUT_CODES = new Set([
  'Escape',
  'Backspace', 'Delete',
  'F3', 'F5',
  'KeyC', 'KeyE', 'KeyF', 'KeyG', 'KeyR', 'KeyV',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
  'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'
]);

export function isPerspectiveToggleCode(code: string) {
  return code === 'F3' || code === 'F5';
}

export type PlayerPerspective = 'first_person' | 'third_person' | 'third_person_front';

const HEX_COLOR = /^#?[0-9a-f]{6}$/i;
const MAX_INVENTORY_NAME_LENGTH = 80;
const MICRO_DIVISIONS = 5;
const INVENTORY_STORAGE_KEY = 'space.backpack.v2';
const INVENTORY_STORAGE_VERSION = 2;
const INVENTORY_CATEGORIES = ['blockset', 'entity', 'colorset'];
const DEFAULT_COLOR_SET_NAME = 'Default palette';
export const MAX_INVENTORY_IMPORT_BYTES = 8 * 1024 * 1024;
export const MAX_INVENTORY_BLOCKS = 65_536;
export const MAX_INVENTORY_SCRIPT_BYTES = 64 * 1024;
export const MAX_INVENTORY_TOTAL_SCRIPT_BYTES = 512 * 1024;
const MAX_INVENTORY_CONSTRAINTS = 256;
const MAX_IMPORT_COORDINATE = MAX_ENTITY_BOUNDS * 2;
const MAX_PORTABLE_VECTOR_COMPONENT = 256;
const MAX_PORTABLE_BODY_MASS = 1e12;
const MAX_PORTABLE_CONSTRAINT_VALUE = 10_000;
export const BULK_EDIT_THRESHOLD = 256;
export const BULK_EDIT_MAX_OPERATIONS_PER_FRAME = 128;
export const BULK_EDIT_FRAME_BUDGET_MS = 5;

type BulkEditPhase = 'applying' | 'waiting' | 'syncing' | 'complete' | 'failed';
type BulkEditJob = {
  label: string;
  total: number;
  processed: number;
  changed: number;
  /** False for read-only preparation jobs such as copying or entity-slot mapping. */
  mutatesWorld?: boolean;
  detail?: string | ((job: BulkEditJob) => string);
  step: (index: number, job: BulkEditJob) => number | void;
  finish?: (job: BulkEditJob) => void;
};

export const SpecialTool = {
  SHOVEL: 'shovel',         // 1. Shovel (remove / place 1x1x1 standard blocks)
  SPOON: 'spoon',           // 2. Spoon (carve 5x5x5 micro voxels)
  BRUSH: 'brush',           // 3. Brush (repaint block colors)
  PIPETTE: 'pipette',       // Legacy alias; color sampling is part of Brush
  SELECTOR: 'selector',     // 4. Selector (world/component selection and copy)
  WRENCH: 'wrench',         // 6. Wrench (hold to grab, right start/stop)
  HAMMER: 'hammer',         // 5. Hammer (preview/place inventory items)
  SUPER_GLUE: 'selector'    // alias for backwards compatibility
};

export class PlayerController {
  // Reusable temporary vectors for torus-world aiming.
  static _bentEye = new THREE.Vector3();
  static _forwardFlat = new THREE.Vector3();
  static _forwardBent = new THREE.Vector3();

  // --- Injected engine dependencies ---
  camera: any;
  physics: any;
  world: any;
  sound: any;
  particles: any;
  contraptions: any;
  ui: any;

  // --- Pointer lock state ---
  isLocked: boolean;
  pointerLockDesired: boolean;
  mouseSensitivity: number;

  // --- Movement key states ---
  keys: {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    jump: boolean;
    crouch: boolean;
    sprint: boolean;
  };

  // --- Entity (program) keyboard input, sampled once by the engine ---
  entityInputDown: Set<string>;
  entityInputPressed: Set<string>;
  entityInputReleased: Set<string>;

  // --- Camera angles (Euler YXZ) ---
  pitch: number;
  yaw: number;

  // --- Selected item / cursor state ---
  _activeTool: string;
  get activeTool(): string {
    return this._activeTool;
  }
  set activeTool(tool: string) {
    const prev = this._activeTool;
    if (prev === tool) return;
    if ((prev === SpecialTool.SELECTOR || prev === SpecialTool.SUPER_GLUE) &&
        (tool !== SpecialTool.SELECTOR && tool !== SpecialTool.SUPER_GLUE)) {
      this.clearSelection();
    }
    if (prev === SpecialTool.WRENCH && tool !== SpecialTool.WRENCH) {
      this.releaseWrenchGrab();
    }
    this._activeTool = tool;
  }
  selectedBlock: number;
  selectedColor: number;
  currentRaycast: any;
  hoveredContraption: any;
  hoveredContraptionHit: any;
  wrenchGrab: any;
  microCarvePreview: any;
  focusBlockPreview: any;
  boxSelectionPreview: any;
  inventoryPlacementPreview: any;

  // --- Entity/component selector + inventory clipboard ---
  selectedSubtree: any;
  selectedBlockSelection: any;
  selectorLevel: any;
  selectorRange: any;
  selectorMicroMode: boolean;
  inventories: any;
  activeInventoryCategory: string;
  persistentStorage: SpaceStorage | null;
  bulkEditJob: BulkEditJob | null;

  // --- Camera / View Settings ---
  sceneRenderer: any;
  fov: number;
  perspective: PlayerPerspective;
  thirdPersonDistance: number;

  // --- Driving state ---
  isDriving: boolean;
  drivenContraption: any;

  constructor(
    camera,
    physics,
    world,
    soundManager,
    particleSystem,
    contraptionManager,
    uiBridge,
    persistentStorage: SpaceStorage | null = null
  ) {
    this.camera = camera;
    this.physics = physics;
    this.world = world;
    this.sound = soundManager;
    this.particles = particleSystem;
    this.contraptions = contraptionManager;
    this.ui = uiBridge;
    this.persistentStorage = persistentStorage;
    this.bulkEditJob = null;
    if (this.contraptions) this.contraptions.selectionHost = this;

    this.sceneRenderer = null;
    this.fov = 75;
    this.perspective = 'first_person';
    this.thirdPersonDistance = 4.0;

    this.isLocked = false;
    this.pointerLockDesired = false;
    this.mouseSensitivity = 0.0022;

    // Movement key states
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      crouch: false,
      sprint: false
    };

    // Sampled once by the engine. Entity scripts never add DOM listeners, so
    // stopping or deleting code automatically removes its keyboard behavior.
    this.entityInputDown = new Set();
    this.entityInputPressed = new Set();
    this.entityInputReleased = new Set();

    // Camera angles (Euler YXZ)
    this.pitch = 0;
    this.yaw = 0;

    // Selected Item
    this.activeTool = SpecialTool.SHOVEL;
    this.selectedBlock = BlockTypes.COLOR_BLOCK;
    this.selectedColor = 0xf2a93b;
    this.currentRaycast = { hit: false };
    this.hoveredContraption = null;
    this.hoveredContraptionHit = null;
    this.wrenchGrab = null;
    this.microCarvePreview = null;
    // Selector focus block guide: { cellOrigin, active } | null
    this.focusBlockPreview = null;
    // Selector box selection live preview: { pointA, cursor } | null
    this.boxSelectionPreview = null;
    // Hammer placement ghost: { slot, kind, position } | null
    this.inventoryPlacementPreview = null;
    // Entity/component selector + inventory clipboard
    this.selectedSubtree = null;          // { contraption, rootId, nodeIds: Set }
    this.selectedBlockSelection = null;   // { contraption, nodeId, blocks: [] }
    this.selectorLevel = null;            // Active box-selection level { contraption, nodeId } — decoupled from block selection
    this.selectorRange = null;            // { contraption, nodeId, pointA, pointB }
    // Selector Tab toggle: default selects standard 1 m blocks; true selects
    // 0.2 m micro cells (single toggles + boxes materialize to existing micro
    // voxels).
    this.selectorMicroMode = false;
    // The backpack holds three categories of at most 9 items each:
    // - blockset: plain voxel stamps (T copy, STL import), built with the Hammer
    // - entity: full component trees with scripts (R copy), built with the Hammer
    // - colorset: named sets of 9 palette colors, applied to the keyboard palette
    this.inventories = this.createEmptyInventories();
    this.activeInventoryCategory = 'blockset';
    this.loadInventoriesFromLocalStorage();
    // Driving State
    this.isDriving = false;
    this.drivenContraption = null;

    this.setupPointerLock();
    this.setupEventListeners();
  }

  setupPointerLock() {
    const domElement = document.body;

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === domElement;
      this.applyPointerLockState(locked);
      if (!locked) {
        this.pointerLockDesired = false;
        this.resetEntityInputState();
        this.releaseWrenchGrab();
      }

      // A pending request may finish after a modal has already called
      // unlock(). Never let that stale request hide the cursor again.
      if (locked && !this.pointerLockDesired && document.exitPointerLock) {
        try { document.exitPointerLock(); } catch (e) {}
      }
    });

    document.addEventListener('pointerlockerror', () => {
      this.pointerLockDesired = false;
      this.syncPointerLockState();
      console.warn('Pointer lock error');
    });
  }

  applyPointerLockState(locked) {
    this.isLocked = !!locked;
    if (this.ui) this.ui.setPointerLocked?.(this.isLocked);
    return this.isLocked;
  }

  syncPointerLockState() {
    return this.applyPointerLockState(typeof document !== 'undefined' && document.pointerLockElement === document.body);
  }

  requestLock() {
    this.pointerLockDesired = true;
    if (typeof document === 'undefined') {
      return Promise.resolve(false);
    }
    if (document.pointerLockElement === document.body) {
      this.syncPointerLockState();
      return Promise.resolve(true);
    }

    try {
      const request = document.body.requestPointerLock();
      if (request?.then) {
        return request.then(() => {
          if (!this.pointerLockDesired && document.pointerLockElement === document.body) {
            try { document.exitPointerLock?.(); } catch (e) {}
            return false;
          }
          return this.syncPointerLockState();
        }).catch(() => {
          this.pointerLockDesired = false;
          this.syncPointerLockState();
          return false;
        });
      }
    } catch (e) {
      this.pointerLockDesired = false;
      this.syncPointerLockState();
      return Promise.resolve(false);
    } finally {
      this.sound?.init();
    }

    // Legacy browsers report the result through pointerlockchange only.
    return Promise.resolve(typeof document !== 'undefined' && document.pointerLockElement === document.body);
  }

  unlock() {
    this.pointerLockDesired = false;
    this.resetEntityInputState();
    if (typeof document !== 'undefined' && document.exitPointerLock && document.pointerLockElement) {
      try { document.exitPointerLock(); } catch (e) {}
    } else {
      this.syncPointerLockState();
    }
  }

  setupEventListeners() {
    // Mouse Look
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;

      this.yaw -= e.movementX * this.mouseSensitivity;
      this.pitch -= e.movementY * this.mouseSensitivity;

      const maxPitch = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.releaseWrenchGrab();
    });

    // Mouse Clicks
    document.addEventListener('mousedown', (e) => {
      if (!this.isLocked) return;

      // Mouse movement and button events can arrive between animation frames.
      // Recast from the latest camera orientation and latest entity transforms
      // so a click never consumes the previous frame's hover result.
      this.updateAimRaycast();

      if (e.button === 0) {
        this.handleLeftClick(e);
      } else if (e.button === 2) {
        this.handleRightClick(e);
      } else if (e.button === 1) {
        // Middle Click: Sample color from targeted voxel if pointing at one
        if (this.currentRaycast && this.currentRaycast.hit && this.currentRaycast.color !== undefined && this.currentRaycast.color !== null) {
          if (this.ui) {
            this.ui.setBuildColor(this.currentRaycast.color);
          }
        } else {
          this.assembleSelection();
        }
      }
    });

    document.addEventListener('contextmenu', (e) => e.preventDefault());

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
      const eventTarget = e.target as HTMLElement;
      if (eventTarget && (eventTarget.tagName === 'INPUT' || eventTarget.tagName === 'SELECT' || eventTarget.tagName === 'TEXTAREA' || eventTarget.isContentEditable)) return;

      // Ensure any accidentally focused button or interactive 2D element is blurred
      if (document.activeElement && document.activeElement !== document.body && (document.activeElement.tagName === 'BUTTON' || document.activeElement.getAttribute('role') === 'button')) {
        (document.activeElement as HTMLElement).blur();
      }

      // Direct Shift + 1..9: picks palette color N, or the active backpack
      // category's slot N when the Hammer is the active tool.
      if (e.shiftKey && e.code.startsWith('Digit')) {
        const num = parseInt(e.code.replace('Digit', ''), 10);
        if (num >= 1 && num <= 9) {
          e.preventDefault();
          if (this.ui) {
            if (this.activeTool === SpecialTool.HAMMER) this.ui.selectInventorySlot(num - 1);
            else this.ui.selectPresetColor(num - 1);
          }
          return;
        }
      }

      // F3 is the primary perspective shortcut. Keep F5 as a compatibility
      // alias for existing users, but consume both before entity input so a
      // mounted script never receives a global camera command.
      if (isPerspectiveToggleCode(e.code)) {
        e.preventDefault();
        this.togglePerspective();
        return;
      }

      this.recordEntityKeyDown(e.code);

      switch (e.code) {
        case 'KeyW': this.keys.forward = true; break;
        case 'KeyS': this.keys.backward = true; break;
        case 'KeyA': this.keys.left = true; break;
        case 'KeyD': this.keys.right = true; break;
        case 'Space':
          e.preventDefault();
          this.keys.jump = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.crouch = true;
          this.keys.sprint = true;
          this.physics.isSprinting = true;
          break;

        case 'KeyR': // R key: unified smart copy selection (entity or world blocks)
          if (this.activeTool === SpecialTool.SELECTOR || this.activeTool === SpecialTool.SUPER_GLUE) {
            this.copySelectionSmart();
          }
          break;

        case 'Delete': // Del key: delete the selected entity/component or selected blocks
        case 'Backspace':
          this.deleteSelectionBlocks();
          break;

        case 'KeyC': // C key: open code editor / programmable terminal (always)
          this.openCodeEditorForTarget();
          break;

        case 'KeyG': // G key: create child from block selection (selector) / assemble selection
          if ((this.activeTool === SpecialTool.SELECTOR || this.activeTool === SpecialTool.SUPER_GLUE) &&
              this.selectedBlockSelection) {
            this.createChildFromSelectedBlocks();
          } else {
            this.assembleSelection();
          }
          break;

        case 'KeyV': // V key: Mount / Drive vehicle
          this.toggleDriveVehicle();
          break;

        case 'KeyF': // F key: Fly toggle
          this.physics.isFlying = !this.physics.isFlying;
          if (this.ui) this.ui.showToast(this.physics.isFlying ? 'FLY MODE ON' : 'FLY MODE OFF');
          break;

        case 'KeyE': // E key: Inventory Palette
          if (this.ui) this.ui.toggleInventoryModal();
          break;

        case 'KeyO': // O key: Global Settings Modal
          if (this.ui) this.ui.toggleGlobalSettingsModal();
          break;

        case 'Tab': // Tab: switch the hammer bar between block sets and entities,
          // or toggle the selector between standard (1 m) and micro (0.2 m) blocks.
          if (this.activeTool === SpecialTool.HAMMER) {
            e.preventDefault();
            this.toggleHammerCategory();
          } else if (this.activeTool === SpecialTool.SELECTOR || this.activeTool === SpecialTool.SUPER_GLUE) {
            e.preventDefault();
            this.toggleSelectorMicroMode();
          }
          break;

        case 'Digit1': this.setHotbarSlot(0); break;
        case 'Digit2': this.setHotbarSlot(1); break;
        case 'Digit3': this.setHotbarSlot(2); break;
        case 'Digit4': this.setHotbarSlot(3); break;
        case 'Digit5': this.setHotbarSlot(4); break;
        case 'Digit6': this.setHotbarSlot(5); break;
      }
    });

    document.addEventListener('keyup', (e) => {
      // Always release captured input, even if focus moved into the editor
      // after the matching keydown.
      this.recordEntityKeyUp(e.code);
      switch (e.code) {
        case 'KeyW': this.keys.forward = false; break;
        case 'KeyS': this.keys.backward = false; break;
        case 'KeyA': this.keys.left = false; break;
        case 'KeyD': this.keys.right = false; break;
        case 'Space':
          e.preventDefault();
          this.keys.jump = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.crouch = false;
          this.keys.sprint = false;
          this.physics.isSprinting = false;
          break;
      }
    });

    window.addEventListener('blur', () => {
      this.resetEntityInputState();
      this.releaseWrenchGrab();
    });

    document.addEventListener('wheel', (e) => {
      this.handleWheel(e);
    });
  }

  handleWheel(e: { deltaY: number; shiftKey?: boolean }) {
    if (!this.isLocked) return;
    if (this.ui) {
      if (this.activeTool === SpecialTool.HAMMER) {
        // Wheel cycles the active backpack category's slots when the Hammer is active.
        this.cycleInventorySlot(e.deltaY > 0 ? 1 : -1);
      } else if (this.activeTool === SpecialTool.BRUSH || e.shiftKey) {
        // Wheel with Brush (or Shift+Wheel) cycles palette colors.
        this.ui.cycleColor(e.deltaY > 0 ? 1 : -1);
      }
    }
  }

  setHotbarSlot(index) {
    if (this.ui) {
      this.ui.selectHotbarSlot(index);
    }
  }

  /** Switch tools from an interaction flow such as a successful selection copy. */
  activateTool(tool) {
    if (this.wrenchGrab) this.releaseWrenchGrab();
    this.activeTool = tool;
    if (this.ui?.selectTool) this.ui.selectTool(tool);
    else this.ui?.updateToolPanelMode?.();
    return this.activeTool;
  }

  /** Canonical command entry shared with entity programs and editor buttons. */
  performBasicAction(command) {
    return executeBasicAction(
      { world: this.world, manager: this.contraptions, selectionHost: this },
      { actor: { source: 'player' }, ...command }
    );
  }

  clearSelection() {
    this.selectedSubtree?.contraption?.clearSubtreeHighlight?.();
    this.selectedBlockSelection?.contraption?.clearSubtreeHighlight?.();
    const result = this.performBasicAction({ domain: ActionDomain.SELECTION, action: 'clear' });
    this.selectedSubtree = null;
    this.selectedBlockSelection = null;
    this.selectorLevel = null;
    this.selectorRange = null;
    this.boxSelectionPreview = null;
    this.focusBlockPreview = null;
    this.sceneRenderer?.clearBoxSelectionPreview?.();
    this.sceneRenderer?.clearFocusBlockGuide?.();
    if (this.sceneRenderer && this.contraptions) {
      this.sceneRenderer.updateSelectionHologram(null, null, null);
    }
    return result;
  }

  recordEntityKeyDown(code) {
    if (!code || RESERVED_ENTITY_INPUT_CODES.has(code)) return false;
    if (!this.entityInputDown.has(code)) {
      this.entityInputPressed.add(code);
    }
    this.entityInputDown.add(code);
    return true;
  }

  recordEntityKeyUp(code) {
    if (!code || RESERVED_ENTITY_INPUT_CODES.has(code)) return false;
    if (this.entityInputDown.delete(code)) {
      this.entityInputReleased.add(code);
    }
    return true;
  }

  consumeEntityInputFrame() {
    const frame = Object.freeze({
      down: Object.freeze([...this.entityInputDown]),
      pressed: Object.freeze([...this.entityInputPressed]),
      released: Object.freeze([...this.entityInputReleased])
    });
    this.entityInputPressed.clear();
    this.entityInputReleased.clear();
    return frame;
  }

  resetEntityInputState() {
    this.entityInputDown?.clear();
    this.entityInputPressed?.clear();
    this.entityInputReleased?.clear();
  }

  openCodeEditorForTarget() {
    const target = this.hoveredContraption;
    if (!target || !this.contraptions.contraptions.includes(target)) {
      if (this.ui) this.ui.showToast(`Point directly at an assembled entity to program it.`);
      return false;
    }

    this.contraptions.activeProgrammingContraption = target;
    if (this.ui) this.ui.openCodeEditor(target);
    return true;
  }

  handleLeftClick(e = null) {
    if (this.bulkEditJob) {
      this.ui?.showToast?.(`Please wait for ${this.bulkEditJob.label.toLowerCase()} to finish`);
      return false;
    }
    // Hammer owns inventory construction. Selection never places inventory
    // contents, so copying and building remain distinct tool modes.
    if (this.activeTool === SpecialTool.HAMMER) {
      this.pasteInventorySlot();
      return;
    }

    // Wrench owns charged point grabbing while the left button is held.
    if (this.activeTool === SpecialTool.WRENCH) {
      this.startWrenchGrab();
      return;
    }

    // 1. Shovel -> remove one standard 1x1x1 cell or entity block. If pointing at
    // micro-geometry, remove the micro cells contained in that standard cell.
    if (this.activeTool === SpecialTool.SHOVEL) {
      if (this.hoveredContraptionHit) {
        const hit = this.hoveredContraptionHit;
        const c = hit.contraption;
        const targetNodeId = hit.entityId || 'root';
        const hitCell = hit.cell;

        if (hit.kind === 'micro') {
          const result = this.performBasicAction({
            domain: ActionDomain.ENTITY,
            action: 'clear-cell',
            target: { contraption: c },
            nodeId: targetNodeId,
            cell: hitCell,
            microOnly: true
          });
          if (result.empty) {
            if (this.ui) this.ui.showToast(`Entity #${c.id} fully dismantled`);
          } else if (result.ok) {
            this.ui?.notifyContraptionStructureChanged(c);
            if (this.ui) {
              this.ui.showToast(`Shovel removed ${result.removed} micro voxels (1 standard cell) from [${targetNodeId}]`);
            }
          }
        } else {
          const result = this.performBasicAction({
            domain: ActionDomain.ENTITY,
            action: 'remove-standard',
            target: { contraption: c },
            nodeId: targetNodeId,
            cell: hitCell
          });
          if (result.empty) {
            if (this.ui) this.ui.showToast(`Entity #${c.id} fully dismantled`);
          } else if (result.ok) {
            this.ui?.notifyContraptionStructureChanged(c);
            if (this.ui) {
              this.ui.showToast(`Shovel removed 1 standard block from [${targetNodeId}]`);
            }
          }
        }
        this.particles.emitBlockBreak(hit.point, hit.color || this.selectedColor, 12);
        this.sound.playBlockBreak();
        return;
      }

      if (!this.currentRaycast.hit) return;
      if (this.currentRaycast.kind === 'micro') {
        const mp = this.currentRaycast.microPos;
        const wx = Math.floor(mp.x / 5);
        const wy = Math.floor(mp.y / 5);
        const wz = Math.floor(mp.z / 5);
        const result = this.performBasicAction({
          domain: ActionDomain.WORLD,
          action: 'clear-cell',
          cell: { x: wx, y: wy, z: wz },
          microOnly: true
        });
        if (result.removed && this.ui) this.ui.showToast(`Shovel removed ${result.removed} micro voxels (1 standard cell)`);
      } else {
        const hp = this.currentRaycast.hitPos;
        this.performBasicAction({ domain: ActionDomain.WORLD, action: 'remove-standard', cell: hp });
        this.particles.emitBlockBreak(hp, this.currentRaycast.color || this.selectedColor, 12);
      }
      this.sound.playBlockBreak();
      return;
    }

    // 2. Spoon -> subdivide a standard block, then edit individual micro cells.
    if (this.activeTool === SpecialTool.SPOON) {
      if (this.hoveredContraptionHit) {
        const hit = this.hoveredContraptionHit;
        const c = hit.contraption;
        const targetNodeId = hit.entityId || 'root';
        const hitCell = hit.cell;

        if (hit.kind === 'micro' && hit.block) {
          const result = this.performBasicAction({
            domain: ActionDomain.ENTITY,
            action: 'remove-micro',
            target: { contraption: c },
            nodeId: targetNodeId,
            micro: [
              Math.round(hit.block.localX * 5),
              Math.round(hit.block.localY * 5),
              Math.round(hit.block.localZ * 5)
            ]
          });
          if (result.empty) {
            if (this.ui) this.ui.showToast(`Entity #${c.id} fully micro-carved away`);
          } else if (result.ok) {
            this.ui?.notifyContraptionStructureChanged(c);
            if (this.ui) {
              this.ui.showToast(`Spoon removed 1 micro voxel from [${targetNodeId}]`);
            }
          }
        } else {
          const carved = [
            Math.round((hit.placeMicroPos.localX - hit.normal.x * 0.2) * 5),
            Math.round((hit.placeMicroPos.localY - hit.normal.y * 0.2) * 5),
            Math.round((hit.placeMicroPos.localZ - hit.normal.z * 0.2) * 5)
          ];
          const result = this.performBasicAction({
            domain: ActionDomain.ENTITY,
            action: 'subdivide-standard',
            target: { contraption: c },
            nodeId: targetNodeId,
            cell: hitCell,
            micro: carved
          });
          if (result.ok) {
            this.ui?.notifyContraptionStructureChanged(c);
            if (this.ui) {
              this.ui.showToast(`Carved 1 micro voxel out of a subdivided block on [${targetNodeId}] (124 left)`);
            }
          }
        }
        this.particles.emitBlockBreak(hit.point, hit.color || this.selectedColor, 4);
        this.sound.playBlockBreak();
        return;
      }

      if (!this.currentRaycast.hit) return;
      if (this.currentRaycast.kind === 'micro') {
        const mp = this.currentRaycast.microPos;
        this.performBasicAction({ domain: ActionDomain.WORLD, action: 'remove-micro', micro: mp });
        this.particles.emitBlockBreak(this.currentRaycast.hitPos, this.currentRaycast.color, 4);
      } else {
        const hp = this.currentRaycast.hitPos;
        let carveMicro = null;
        // Direct carve uses the exact rendered entry point, clamped to the hit standard cell.
        {
          // Direct carve: immediately remove the micro cell under the crosshair (ray entry
          // point converted to 5× micro-coordinates).
          const normal = this.currentRaycast.normal;
          const entry = this.currentRaycast.entry
            ? new THREE.Vector3(this.currentRaycast.entry.x, this.currentRaycast.entry.y, this.currentRaycast.entry.z)
            : this.physics.getEyePosition();
          const clamp = (value, base) => Math.max(base * 5, Math.min(base * 5 + 4, value));
          carveMicro = [
            clamp(Math.floor((entry.x + normal.x * 0.02) * 5), hp.x),
            clamp(Math.floor((entry.y + normal.y * 0.02) * 5), hp.y),
            clamp(Math.floor((entry.z + normal.z * 0.02) * 5), hp.z)
          ];
        }
        const result = this.performBasicAction({
          domain: ActionDomain.WORLD,
          action: 'subdivide-standard',
          cell: hp,
          micro: carveMicro
        });
        if (result.ok) {
          if (this.ui) this.ui.showToast(`Carved 1 micro voxel out of ${result.subdivided} (124 left)`);
        }
      }
      this.sound.playBlockBreak();
      return;
    }

    // 3. Brush -> Paint / Override block color directly
    if (this.activeTool === SpecialTool.BRUSH) {
      this.paintTargetedBlock();
      return;
    }

    // 4. Pipette -> Pick / Sample block color directly
    if (this.activeTool === SpecialTool.PIPETTE) {
      this.sampleTargetedColor();
      return;
    }

    // 5. Tool: Selector — entity/component level selection, 2-point block box,
    //    and R/T copy. Inventory construction belongs exclusively to Hammer.
    if (this.activeTool === SpecialTool.SELECTOR || this.activeTool === SpecialTool.SUPER_GLUE) {
      const isMultiSelect = !!(e?.shiftKey || this.keys.crouch);

      if (this.hoveredContraptionHit) {
        // Entity/component hit:
        //   First click  → select that component level (auto-highlights its subtree, not its parent).
        //   Second click → advance the 2-point box selection for that level's own blocks only.
        //   Shift+click  → multi-select / toggle individual blocks or micro-blocks.
        this.selectorOnEntityClick(this.hoveredContraptionHit, e);
        return;
      }

      const worldPoint = this.currentRaycast && this.currentRaycast.hit
        ? new THREE.Vector3(this.currentRaycast.hitPos.x, this.currentRaycast.hitPos.y, this.currentRaycast.hitPos.z)
        : null;
      // Micro selection mode (Tab) targets the 0.2 m cell under the crosshair
      // instead of the whole standard cell.
      const microCell = this.selectorMicroMode ? this.selectorMicroCellFromRaycast() : null;
      const targetPoint = microCell
        ? new THREE.Vector3(microCell.x / 5, microCell.y / 5, microCell.z / 5)
        : worldPoint;

      // Shift + world click: exit entity box-selection level, enter world single-cell mode.
      if (isMultiSelect && worldPoint) {
        if (this.selectedSubtree) {
          this.selectedSubtree.contraption.clearSubtreeHighlight();
          this.selectedSubtree = null;
        }
        if (this.selectedBlockSelection) {
          this.selectedBlockSelection.contraption.clearSubtreeHighlight();
        }
        this.selectedBlockSelection = null;
        this.selectorLevel = null;
        this.selectorRange = null;
        const info = this.performBasicAction({
          domain: ActionDomain.SELECTION,
          action: 'toggle-cell',
          point: targetPoint,
          micro: this.selectorMicroMode === true
        }).selection;
        if (this.ui) {
          this.ui.showToast(info?.rejected
            ? `Selector single mode · ${info.count} cells · that cell lies outside the 64×64×64 limit`
            : this.selectorMicroMode
              ? `Selector micro mode · ${info.count} micro cells · Shift+click toggles 0.2 m cells; Tab back to standard`
              : `Selector single mode · ${info.count} cells · Shift+click toggles; plain click restarts 2-point box`);
        }
        return;
      }

      // Entity box-selection progress (world click): corner 1 / corner 2 are anchored to the
      // target node's local frame so the range follows component rotation/translation — preventing
      // false "No blocks" misses when the component moves between clicks. In micro mode the
      // corner snaps to the 0.2 m surface cell under the crosshair (targetPoint) exactly like
      // the world 2-point box; using the whole standard cell (worldPoint) would drop up to a
      // 1 m layer of 0.2 m blocks from the range at the aimed face.
      if (this.selectorRange && this.selectorRange.pointA && !this.selectorRange.pointB && worldPoint) {
        this.selectorRange.pointB = this.rangePointToLocal(this.selectorRange, targetPoint);
        this.resolveBlockRangeSelection(this.selectorRange);
        return;
      }
      if (this.selectorRange && !this.selectorRange.pointA && worldPoint) {
        this.selectorRange.pointA = this.rangePointToLocal(this.selectorRange, targetPoint);
        if (this.ui) {
          this.ui.showToast(`Level [${this.selectorRange.nodeId}] box [1/2]: pick the opposite corner (own blocks only)`);
        }
        return;
      }

      // World hit (no active entity box-selection): clear entity/component state and enter
      // world 2-point box mode. Previously this would unconditionally re-enter "re-box entity
      // level", causing selectorLevel to persist after G-assembly so clicks outside the entity
      // could never start a world selection. Now: world click = world box; entity click = re-box
      // entity level. A click that hits nothing (sky) intentionally leaves the current entity
      // selection untouched — missing a shot must not cancel an in-progress 2-point box.
      if (worldPoint) {
        if (this.selectedSubtree) {
          this.selectedSubtree.contraption.clearSubtreeHighlight();
          this.selectedSubtree = null;
        }
        if (this.selectedBlockSelection) {
          this.selectedBlockSelection.contraption.clearSubtreeHighlight();
        }
        this.selectedBlockSelection = null;
        this.selectorLevel = null;
        this.selectorRange = null;

        const hp = worldPoint;
        if (isMultiSelect) {
          const info = this.performBasicAction({
            domain: ActionDomain.SELECTION,
            action: 'toggle-cell',
            point: targetPoint,
            micro: this.selectorMicroMode === true
          }).selection;
          if (this.ui) {
            this.ui.showToast(info?.rejected
              ? `Selector single mode · ${info.count} cells · that cell lies outside the 64×64×64 limit`
              : this.selectorMicroMode
                ? `Selector micro mode · ${info.count} micro cells · Shift+click toggles 0.2 m cells; Tab back to standard`
                : `Selector single mode · ${info.count} cells · Shift+click toggles; plain click restarts 2-point box`);
          }
        } else {
          // 2-point world box: cornerA then cornerB define the diagonal AABB.
          // In micro mode the confirmed box materializes into the existing
          // micro voxels it contains; a plain click on the completed set clears it.
          if (this.selectorMicroMode && Array.isArray(this.contraptions?.microSelection)) {
            this.clearSelection();
            if (this.ui) this.ui.showToast('Selector selection cleared');
          } else if (this.contraptions.selectionCornerA === null) {
            this.performBasicAction({
              domain: ActionDomain.SELECTION,
              action: 'corner-a',
              point: targetPoint,
              micro: this.selectorMicroMode === true
            });
            if (this.ui) {
              this.ui.showToast(this.selectorMicroMode
                ? `Selector [1/2] picked micro corner (cell ${microCell.x}, ${microCell.y}, ${microCell.z}), pick the opposite corner`
                : `Selector [1/2] picked corner (${Math.floor(hp.x)}, ${Math.floor(hp.y)}, ${Math.floor(hp.z)}), pick the opposite corner`);
            }
          } else if (this.contraptions.selectionCornerB === null) {
            const cornerResult = this.performBasicAction({
              domain: ActionDomain.SELECTION,
              action: 'corner-b',
              point: targetPoint,
              micro: this.selectorMicroMode === true
            });
            if (this.selectorMicroMode) {
              const info = this.contraptions.getWorldGlueSelectionInfo?.();
              const count = info?.count ?? 0;
              const clampedNote = cornerResult?.clamped ? ' · clamped to the 64×64×64 limit' : '';
              if (this.ui) {
                this.ui.showToast(`Selector [2/2] micro box set! (${count} micro voxels)${clampedNote} · G assemble · R copy · Del delete`);
              }
            } else {
              const bounds = this.contraptions.getSelectionBounds();
              const sx = bounds ? bounds.maxX - bounds.minX + 1 : 1;
              const sy = bounds ? bounds.maxY - bounds.minY + 1 : 1;
              const sz = bounds ? bounds.maxZ - bounds.minZ + 1 : 1;
              const totalBlocks = this.contraptions.getSelectionBlockCount();
              const clampedNote = cornerResult?.clamped ? ' · clamped to the 64×64×64 limit' : '';
              if (this.ui) {
                this.ui.showToast(`Selector [2/2] box set! (${sx}x${sy}x${sz}, ${totalBlocks} blocks)${clampedNote} · G assemble · R copy · Del delete`);
              }
            }
          } else {
            // Box already complete — next plain click clears it and resets to idle.
            this.clearSelection();
            if (this.ui) this.ui.showToast('Selector selection cleared');
          }
        }
      }
      return;
    }
  }

  /**
   * Handle a Selector left-click on an entity/component.
   *
   * Interaction states for entities whose scripts are not running:
   * - **First click**: select the hit component level; auto-recursively highlight it and all
   *   descendants (never the parent). Press R to copy the subtree.
   * - **Second click on the same entity** (any surface): advance the 2-point box selection for
   *   that level's *own* blocks only (child-component blocks are excluded). Any point on the
   *   entity surface is valid — the hit does not need to land exactly on the target component,
   *   making it easy to box-select small components.
   * - **Click after box is complete**: restart box-selection (same level; this click becomes the
   *   new first corner).
   * - **Shift+click**: immediately switch / re-select the component level without entering box
   *   mode.
   *
   * Only stopped entities expose their construction grid. Running, paused, and
   * errored entities allow whole-entity selection only; box mode and Shift-click
   * level switching remain disabled.
   */
  selectorOnEntityClick(hit, e = null) {
    const contraption = hit.contraption;
    const hitNodeId = hit.entityId || 'root';
    const shiftHeld = !!(e?.shiftKey || this.keys?.crouch);

    // World 2-point box in progress (cornerA set, cornerB not yet set): clicking an entity
    // also confirms cornerB — consistent with the "second click finalises the box" UX.
    if (this.contraptions && this.contraptions.selectionCornerA !== null && this.contraptions.selectionCornerB === null) {
      const cornerResult = this.performBasicAction({
        domain: ActionDomain.SELECTION,
        action: 'corner-b',
        point: hit.point,
        micro: this.selectorMicroMode === true
      });
      if (this.selectorMicroMode) {
        const info = this.contraptions.getWorldGlueSelectionInfo?.();
        const clampedNote = cornerResult?.clamped ? ' · clamped to the 64×64×64 limit' : '';
        if (this.ui) {
          this.ui.showToast(`Selector [2/2] micro box set! (${info?.count ?? 0} micro voxels)${clampedNote} · press G to assemble`);
        }
        return;
      }
      const bounds = this.contraptions.getSelectionBounds();
      const sx = bounds ? bounds.maxX - bounds.minX + 1 : 1;
      const sy = bounds ? bounds.maxY - bounds.minY + 1 : 1;
      const sz = bounds ? bounds.maxZ - bounds.minZ + 1 : 1;
      const totalBlocks = this.contraptions.getSelectionBlockCount();
      const clampedNote = cornerResult?.clamped ? ' · clamped to the 64×64×64 limit' : '';
      if (this.ui) {
        this.ui.showToast(`Selector [2/2] box set! (${sx}x${sy}x${sz}, ${totalBlocks} blocks)${clampedNote} · press G to assemble`);
      }
      return;
    }

    // Non-stopped entities allow only whole-entity selection, never their internals.
    if (!this.canEditEntityInternals(contraption)) {
      this.startSubtreeSelection(contraption, 'root', { wholeOnly: true });
      return;
    }

    // Shift+click: multi-select / toggle individual block or micro-block.
    if (shiftHeld) {
      if (this.selectedSubtree) {
        this.selectedSubtree.contraption.clearSubtreeHighlight();
        this.selectedSubtree = null;
      }
      const hitBlock = hit.block;
      if (!hitBlock) {
        this.startSubtreeSelection(contraption, hitNodeId);
        return;
      }
      const result = this.performBasicAction({
        domain: ActionDomain.SELECTION,
        action: 'toggle-entity-block',
        target: { contraption },
        nodeId: hitNodeId,
        block: hitBlock
      });
      if (result.ok && result.selection) {
        this.selectedBlockSelection = {
          contraption,
          nodeId: hitNodeId,
          blocks: result.selection.blocks
        };
        this.selectorLevel = { contraption, nodeId: hitNodeId };
        this.selectorRange = null;
        const count = result.selection.blocks.length;
        const isMicro = (hitBlock.size || 1) < 1;
        const kindLabel = isMicro ? 'micro blocks' : 'blocks';
        if (this.ui) {
          this.ui.showToast(`Multi-selected ${count} ${kindLabel} of [${hitNodeId}] · Shift+click to toggle more · R copy · G create child`);
        }
      } else {
        this.selectedBlockSelection = null;
        this.selectorLevel = { contraption, nodeId: hitNodeId };
        this.selectorRange = null;
        if (this.ui) {
          this.ui.showToast(`Entity block selection cleared · Shift+click to select blocks`);
        }
      }
      return;
    }

    // Box-selection in progress for this contraption: plain clicks sequentially set corner 1
    // then corner 2 (any surface point on the entity is accepted).
    if (this.selectorRange && this.selectorRange.contraption === contraption) {
      if (!this.selectorRange.pointA) {
        this.selectorRange.pointA = this.rangePointToLocal(this.selectorRange, hit.point);
        if (this.ui) {
          this.ui.showToast(`Level [${this.selectorRange.nodeId}] box [1/2]: pick the opposite corner (own blocks only, children excluded)`);
        }
        return;
      }
      this.selectorRange.pointB = this.rangePointToLocal(this.selectorRange, hit.point);
      this.resolveBlockRangeSelection(this.selectorRange);
      return;
    }

    // A level is already active: clicking anywhere on the contraption restarts box-selection
    // (waiting for corner 1).
    if (this.selectorLevel && this.selectorLevel.contraption === contraption) {
      // Cancel previous block selection: clear orange highlight and any lingering world-selection
      // state to prevent mixed stale UI.
      this.performBasicAction({ domain: ActionDomain.SELECTION, action: 'clear' });
      if (this.selectedBlockSelection) {
        this.selectedBlockSelection.contraption.clearSubtreeHighlight();
      }
      this.selectedBlockSelection = null;
      this.selectorRange = {
        contraption,
        nodeId: this.selectorLevel.nodeId,
        pointA: null,
        pointB: null
      };
      if (this.ui) {
        this.ui.showToast(`Re-boxing level [${this.selectorLevel.nodeId}] — click anywhere to set the first corner · Shift+click a component to switch level`);
      }
      return;
    }

    // First click on a new entity/level: select this component and highlight its subtree.
    this.startSubtreeSelection(contraption, hitNodeId);
  }

  canEditEntityInternals(contraption) {
    return !!contraption && (typeof contraption.canEditInternalSelection === 'function'
      ? contraption.canEditInternalSelection()
      : contraption.scriptStatus === 'stopped');
  }

  /**
   * Select a component level and auto-highlight its full subtree (descendants only, not the
   * parent). Clears any active world selection so the two modes never overlap.
   *
   * `opts.wholeOnly` selects the root and every descendant without entering box
   * mode; subsequent clicks cannot start a subregion selection.
   */
  startSubtreeSelection(contraption, hitNodeId, opts: { wholeOnly?: boolean } = {}) {
    if (this.selectedSubtree && this.selectedSubtree.contraption !== contraption) {
      this.selectedSubtree.contraption.clearSubtreeHighlight();
    }
    // A finished block selection on another entity keeps its orange per-block outlines
    // attached to that entity's node groups. They must be removed here as well, or the
    // old entity stays permanently highlighted after switching levels.
    if (this.selectedBlockSelection && this.selectedBlockSelection.contraption !== contraption) {
      this.selectedBlockSelection.contraption.clearSubtreeHighlight();
    }
    const result = this.performBasicAction({
      domain: ActionDomain.SELECTION,
      action: 'entity-subtree',
      target: { contraption },
      nodeId: hitNodeId
    });
    if (!result.ok) return;
    const nodeIds = result.selection?.nodeIds || this.collectSubtreeIds(contraption, hitNodeId);
    this.selectedSubtree = { contraption, rootId: hitNodeId, nodeIds };
    this.selectedBlockSelection = null;
    if (opts.wholeOnly) {
      // Whole-entity selection clears selectorLevel and selectorRange instead of entering box mode.
      this.selectorLevel = null;
      this.selectorRange = null;
    } else {
      this.selectorLevel = { contraption, nodeId: hitNodeId };
      this.selectorRange = { contraption, nodeId: hitNodeId, pointA: null, pointB: null };
    }

    const blockCount = contraption.blocks.filter(b => nodeIds.has(b.entityId || 'root')).length;
    if (this.ui) {
      if (opts.wholeOnly) {
        this.ui.showToast(`Entity #${contraption.id} is not stopped — whole entity selected (${blockCount} blocks) · Del delete entity · R copy · use Wrench right-click to stop it before selecting internal blocks`);
      } else {
        this.ui.showToast(`Selected level [${hitNodeId}] + descendants (${blockCount} blocks, no parent) · Del delete selection · R copy · click to box its own blocks · Shift+click to switch level`);
      }
    }
  }

  /**
   * Convert a world-space click point into the target node's local coordinate frame and store it
   * as a box-selection corner.
   *
   * Components can be rotated or translated at runtime by scripts or rotors (e.g. turbine blades).
   * If the range corners were stored in world space, any movement between the two clicks would
   * misalign the stored range with the blocks, producing false "No blocks" misses. Anchoring to
   * the node's local frame means the range co-moves with the component regardless of rotation or
   * translation.
   *
   * @returns The point in node-local space, or `null` if the node no longer exists.
   */
  rangePointToLocal(range, worldPoint) {
    if (!range || !worldPoint || !range.contraption) return null;
    const node = range.contraption.entityNodes.get(range.nodeId);
    if (!node) return null;
    return node.group.worldToLocal(new THREE.Vector3(worldPoint.x, worldPoint.y, worldPoint.z));
  }

  /**
   * Convert a node-local range corner back to world space.
   * Used for live preview rendering and diagnostic toast messages.
   *
   * @returns World-space position, or `null` if the node no longer exists.
   */
  rangePointToWorld(range, point) {
    if (!range || !point || !range.contraption) return null;
    const node = range.contraption.entityNodes.get(range.nodeId);
    if (!node) return null;
    return node.group.localToWorld(new THREE.Vector3(point.x, point.y, point.z));
  }

  /**
   * Describe an entity selection range in its authored voxel grid. Range
   * points are stored relative to the node pivot, while renderer cell
   * quantization expects entity-local voxel coordinates, so the pivot is
   * added back here. The renderer uses the live node group as the frame so
   * previews inherit root and child rotations, including render interpolation.
   */
  rangePreviewFrame(range) {
    if (!range || !range.contraption) return null;
    const node = range.contraption.entityNodes.get(range.nodeId);
    if (!node) return null;
    const blocks = range.contraption.blocks.filter(block => (
      (block.entityId || 'root') === range.nodeId
      && (!this.selectorMicroMode || (block.size || 1) < 1)
    ));
    if (blocks.length === 0) return null;
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const block of blocks) {
      const size = block.size || 1;
      min.x = Math.min(min.x, block.localX);
      min.y = Math.min(min.y, block.localY);
      min.z = Math.min(min.z, block.localZ);
      max.x = Math.max(max.x, block.localX + size);
      max.y = Math.max(max.y, block.localY + size);
      max.z = Math.max(max.z, block.localZ + size);
    }
    return {
      object: node.group,
      pivot: node.pivotLocal.clone(),
      // The live range is only a selector aid. Clamp it to real component
      // bounds so pointing outside the entity cannot draw cyan ghost cells.
      bounds: { min, max }
    };
  }

  rangePointToPreviewGrid(range, point) {
    const frame = this.rangePreviewFrame(range);
    if (!frame || !point) return null;
    return new THREE.Vector3(point.x, point.y, point.z).add(frame.pivot);
  }

  worldPointToRangePreviewGrid(range, worldPoint) {
    const local = this.rangePointToLocal(range, worldPoint);
    return local ? this.rangePointToPreviewGrid(range, local) : null;
  }

  /**
   * Finalize a 2-point AABB box-selection for the current component level.
   *
   * Collects all blocks owned directly by `range.nodeId` (child-component blocks are excluded)
   * whose AABB intersects the selection box. Block-AABB intersection is used instead of
   * block-center containment because the two surface clicks typically form a near-zero-thickness
   * slab — center-point testing would miss many surface blocks.
   *
   * If no own blocks are found the method tries to auto-detect which other component's blocks
   * fall inside the range and switches to that level automatically.
   */
  resolveBlockRangeSelection(range) {
    const { contraption, nodeId, pointA, pointB } = range;
    const node = contraption.entityNodes.get(nodeId);
    if (!node) {
      // Target component no longer exists — discard this range.
      range.pointA = null;
      range.pointB = null;
      this.selectorRange = null;
      if (this.ui) this.ui.showToast(`Level [${nodeId}] no longer exists - selection reset`);
      return;
    }
    const result = this.performBasicAction({
      domain: ActionDomain.SELECTION,
      action: 'entity-box',
      target: { contraption },
      nodeId,
      a: pointA,
      b: pointB,
      space: 'node-local',
      // Micro mode (Tab) keeps only 0.2 m blocks inside the range.
      micro: this.selectorMicroMode === true
    });

    if (!result.ok) {
      range.pointA = null;
      range.pointB = null;
      if (result.reason === 'entity_not_stopped') {
        this.selectorLevel = null;
        this.selectorRange = null;
        this.startSubtreeSelection(contraption, 'root', { wholeOnly: true });
        if (this.ui) this.ui.showToast(`Entity #${contraption.id} changed state — stop it before selecting internal blocks`);
        return;
      }
      const componentsInRange = result.components || [];
      if (componentsInRange.length === 1) {
        this.startSubtreeSelection(contraption, componentsInRange[0]);
        if (this.ui) {
          const label = componentsInRange[0] === 'root'
            ? 'root'
            : `child level [${componentsInRange[0]}]`;
          this.ui.showToast(`Selection belongs to ${label} - switched automatically · click twice to box its own blocks`);
        }
      } else if (componentsInRange.length > 1) {
        if (this.ui) {
          this.ui.showToast(`Range covers multiple components (${componentsInRange.join(', ')}) - Shift+click one to switch level`);
        }
      } else if (this.ui) {
        // Diagnostic: include world-space positions of A and B (node-local → current world).
        const toWorld = p => node.group.localToWorld(new THREE.Vector3(p.x, p.y, p.z));
        const fmt = p => {
          const w = toWorld(p);
          return `(${w.x.toFixed(2)}, ${w.y.toFixed(2)}, ${w.z.toFixed(2)})`;
        };
        this.ui.showToast(`No blocks of [${nodeId}] inside this range - A${fmt(pointA)} B${fmt(pointB)} - try again (or Shift+click to switch level)`);
      }
      return;
    }

    const selected = result.selection.blocks;
    this.selectedSubtree = null;
    this.selectedBlockSelection = { contraption, nodeId, blocks: selected };
    this.selectorLevel = { contraption, nodeId };
    // Box-selection complete: exit box mode. The next click anywhere will start a fresh re-box.
    this.selectorRange = null;

    if (this.ui) {
      this.ui.showToast(this.selectorMicroMode
        ? `Selected ${selected.length} own micro blocks of [${nodeId}] (children excluded) · R copy · G create child`
        : `Selected ${selected.length} own blocks of [${nodeId}] (children excluded) · R copy · G create child`);
    }
  }

  /**
   * G key (Selector + block selection): create a child component from the currently box-selected
   * blocks under the active level.
   */
  private preparedChildBoundsStep(bounds, block) {
    const size = block.size || 1;
    bounds.minX = Math.min(bounds.minX, block.localX);
    bounds.minY = Math.min(bounds.minY, block.localY);
    bounds.minZ = Math.min(bounds.minZ, block.localZ);
    bounds.maxX = Math.max(bounds.maxX, block.localX + size);
    bounds.maxY = Math.max(bounds.maxY, block.localY + size);
    bounds.maxZ = Math.max(bounds.maxZ, block.localZ + size);
  }

  private finishPreparedChildCreation(contraption, nodeId, blocks, bounds, legacy = false) {
    const result = this.performBasicAction({
      domain: ActionDomain.SELECTION,
      action: 'create-child',
      selection: {
        kind: 'entity-blocks',
        contraption,
        nodeId,
        blocks,
        preparedBounds: bounds
      }
    });
    const child = result.child;
    if (!child) {
      this.ui?.showToast?.(result.reason === 'entity_not_stopped'
        ? 'Stop the entity before creating a child component from its blocks'
        : 'Could not create child component from this selection');
      return null;
    }
    contraption.clearSubtreeHighlight?.();
    this.sound?.playAssemblyClack?.();
    if (legacy) {
      this.ui?.showToast?.(`Child component ${child.id} created · control it via self.child('${child.id}')`);
      this.ui?.renderComponentTree?.(contraption);
      this.ui?.renderCodeTabs?.(contraption);
      this.ui?.updateInspectorProperties?.(child.id);
    } else {
      this.selectorLevel = { contraption, nodeId };
      this.ui?.showToast?.(`Created child component [${child.id}] from ${blocks.length} blocks under [${nodeId}] · press C to program`);
    }
    return child;
  }

  private startLargeChildCreation(contraption, nodeId, candidates, legacy = false, selectedCells = null) {
    const source = [...candidates];
    const prepared: any[] = [];
    const bounds = {
      minX: Infinity, minY: Infinity, minZ: Infinity,
      maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity
    };
    return this.startBulkEditJob({
      label: 'Creating child component',
      total: source.length,
      mutatesWorld: false,
      detail: 'Preparing component blocks',
      step: index => {
        const block = source[index];
        if ((block.entityId || 'root') !== nodeId) return 0;
        if (selectedCells) {
          const key = `${Math.floor(block.localX + 1e-6)},${Math.floor(block.localY + 1e-6)},${Math.floor(block.localZ + 1e-6)}`;
          if (!selectedCells.has(key)) return 0;
        }
        prepared.push(block);
        this.preparedChildBoundsStep(bounds, block);
        return 1;
      },
      finish: () => this.finishPreparedChildCreation(contraption, nodeId, prepared, bounds, legacy)
    });
  }

  createChildFromSelectedBlocks() {
    if (this.bulkEditJob) {
      this.ui?.showToast?.(`Please wait for ${this.bulkEditJob.label.toLowerCase()} to finish`);
      return null;
    }
    const sel = this.selectedBlockSelection;
    if (!sel || !sel.contraption || sel.blocks.length === 0) {
      if (this.ui) this.ui.showToast('No block selection - box-select blocks of a level first');
      return;
    }
    const { contraption, nodeId, blocks } = sel;
    if (!this.canEditEntityInternals(contraption)) {
      this.clearSelection();
      this.ui?.showToast?.('Stop the entity before creating a child component from its blocks');
      return null;
    }
    if (blocks.length > BULK_EDIT_THRESHOLD) {
      const started = this.startLargeChildCreation(contraption, nodeId, blocks);
      if (started) {
        contraption.clearSubtreeHighlight?.();
        this.selectedBlockSelection = null;
        this.selectorRange = null;
      }
      return started;
    }
    const result = this.performBasicAction({
      domain: ActionDomain.SELECTION,
      action: 'create-child',
      selection: { kind: 'entity-blocks', contraption, nodeId, blocks }
    });
    const child = result.child;
    if (child) {
      contraption.clearSubtreeHighlight();
      this.selectedBlockSelection = null;
      this.selectorLevel = { contraption, nodeId }; // Keep level active so another region can be box-selected immediately.
      this.sound?.playAssemblyClack?.();
      if (this.ui) {
        this.ui.showToast(`Created child component [${child.id}] from ${blocks.length} blocks under [${nodeId}] · press C to program`);
      }
    } else if (this.ui) {
      this.ui.showToast(result.reason === 'entity_not_stopped'
        ? 'Stop the entity before creating a child component from its blocks'
        : 'Could not create child component from this selection');
    }
  }

  /**
   * R key: copy the current selection into the active inventory slot.
  /**
   * Smart copy (R key or Copy button):
   * - If an entity component or subtree is selected, copies as an entity.
   * - If world blocks / micro cells are selected, copies as a raw block set.
   * - If nothing is selected, shows a helpful toast.
   */
  copySelectionSmart() {
    if (this.selectedBlockSelection && this.selectedBlockSelection.blocks.length > 0) {
      return this.copySelectionToInventory();
    }
    if (this.selectedSubtree && this.selectedSubtree.contraption) {
      return this.copySelectionToInventory();
    }
    if (this.contraptions && this.contraptions.hasValidSelection()) {
      return this.copySelectionAsBlockSet();
    }
    if (this.ui) {
      this.ui.showToast('Nothing selected - select an entity/component or box-select blocks, then press R');
    }
    return null;
  }

  /**
   * Copy the currently selected component/entity into the active entity inventory slot.
   *
   * Sources, in priority order:
   *
   * - **Block selection** (2-point box): copies the selected own-blocks as a standalone entity
   *   slot.
   * - **Subtree selection** (first-click level): copies the entire component subtree.
   */
  copySelectionToInventory() {
    if (this.selectedBlockSelection && this.selectedBlockSelection.blocks.length > 0) {
      const { contraption, nodeId, blocks } = this.selectedBlockSelection;
      if (!this.canEditEntityInternals(contraption)) {
        this.clearSelection();
        this.ui?.showToast?.('Stop the entity before copying an internal block selection');
        return null;
      }
      const slot = contraption.serializeSubtree(nodeId);
      slot.blocks = blocks.map(b => ({ ...b, entityId: 'root' }));
      slot.blockCount = blocks.length;
      // A block selection copies only the level's own blocks (children excluded), so
      // descendants must be pruned to avoid empty ghost components and orphaned scripts.
      slot.childEntities = [];
      slot.scripts = (slot.scripts || []).filter(s => s.id === 'root');
      slot.enabled = (slot.enabled || []).filter(e => e.id === 'root');
      slot.constraints = (slot.constraints || []).filter(constraint => (
        constraint.bodyA === 'world' && constraint.bodyB === 'root'
      ));
      slot.nodeCount = 1;
      const index = this.addInventoryItem('entity', slot);
      if (index === null) {
        this.ui?.showToast?.(`Entity inventory is full (${this.inventories.entity.items.length}) - delete one first`);
        return null;
      }
      this.setActiveInventoryCategory('entity');
      this.ui?.renderInventoryBar?.();
      this.clearSelection();
      this.activateTool(SpecialTool.HAMMER);
      if (this.ui) {
        this.ui.showToast(`Copied ${blocks.length} own blocks of [${nodeId}] to entity slot ${index + 1} · switched to Hammer`);
      }
      return slot;
    }
    if (this.selectedSubtree && this.selectedSubtree.contraption) {
      return this.copySelectedSubtreeToInventory();
    }
    if (this.contraptions && this.contraptions.hasValidSelection()) {
      return this.copySelectionAsBlockSet();
    }
    if (this.ui) this.ui.showToast('Nothing selected - click an entity/component with the selector, or box-select its blocks');
    return null;
  }

  /**
   * T key: copy the current selection as a raw **block set** into the active
   * inventory slot. Pasting stamps plain world blocks — no entity is created.
   *
   * This is the sibling of R (copy as entity): R keeps the full component hierarchy
   * and scripts, while T keeps only the raw voxels (standard blocks + micro voxels).
   *
   * Sources, in priority order:
   * 1. **Block selection** (2-point box on a level): the selected own-blocks.
   * 2. **Subtree selection** (first-click level): all blocks of the subtree.
   * 3. **World selection** (2-point box / single cells): read-only sampling of the
   *    world — the original blocks stay in place (unlike G, which extracts them).
   */
  private finishBlockSetCopy(rawBlocks, name) {
    if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) {
      this.ui?.showToast?.('Selection region is empty (no voxels to copy)');
      return null;
    }
    const slot = { kind: 'blockset', name, blocks: rawBlocks, blockCount: rawBlocks.length };
    const index = this.addInventoryItem('blockset', slot);
    if (index === null) {
      this.ui?.showToast?.(`Block set inventory is full (${this.inventories.blockset.items.length}) - delete one first`);
      return null;
    }
    this.setActiveInventoryCategory('blockset');
    this.ui?.renderInventoryBar?.();
    this.clearSelection();
    this.activateTool(SpecialTool.HAMMER);
    this.ui?.showToast?.(`Copied ${rawBlocks.length} voxels as a block set to block set slot ${index + 1} · switched to Hammer · left-click to build`);
    return slot;
  }

  /** Two-pass, frame-sliced normalization for entity-local block selections. */
  private startLargeEntityBlockSetCopy(blocks, name) {
    const source = [...blocks];
    const rawBlocks: any[] = [];
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    return this.startBulkEditJob({
      label: 'Copying block set',
      total: source.length * 2,
      mutatesWorld: false,
      detail: job => job.processed < source.length ? 'Measuring selection' : 'Preparing inventory voxels',
      step: index => {
        const sourceIndex = index % source.length;
        const block = source[sourceIndex];
        if (index < source.length) {
          minX = Math.min(minX, block.localX);
          minY = Math.min(minY, block.localY);
          minZ = Math.min(minZ, block.localZ);
          return 0;
        }
        rawBlocks.push({
          dx: block.localX - minX,
          dy: block.localY - minY,
          dz: block.localZ - minZ,
          size: block.size || 1,
          block: block.block,
          color: block.color,
          part: block.part
        });
        return 1;
      },
      finish: () => this.finishBlockSetCopy(rawBlocks, name)
    });
  }

  /** Read one standard world cell and all of its carved micro voxels. */
  private sampleWorldCellForBulkCopy(cell, consider) {
    const block = this.world.getBlock?.(cell.x, cell.y, cell.z);
    if (block !== BlockTypes.AIR) {
      consider(cell.x, cell.y, cell.z, 1, block, this.world.getBlockColor?.(cell.x, cell.y, cell.z), null);
    }
    const micros = this.world.getMicroBlocksInAABB?.({
      minX: cell.x,
      minY: cell.y,
      minZ: cell.z,
      maxX: cell.x + 1 - 1e-6,
      maxY: cell.y + 1 - 1e-6,
      maxZ: cell.z + 1 - 1e-6
    }) || [];
    for (const micro of micros) {
      consider(micro.x, micro.y, micro.z, micro.size || 0.2, BlockTypes.COLOR_BLOCK, micro.color, micro.part);
    }
  }

  /** Scan and normalize a large world selection through the shared executor. */
  private startLargeWorldBlockSetCopy(manager) {
    const microCells = Array.isArray(manager.microSelection)
      ? manager.microSelection.map(cell => ({ x: cell.x, y: cell.y, z: cell.z }))
      : null;
    const bounds = manager.getSelectionBounds?.();
    const sparseCells = !microCells && manager.connectedSelection !== null
      ? [...(manager.connectedSelection || [])].map(cell => ({ x: cell.x, y: cell.y, z: cell.z }))
      : null;
    if (!microCells && !bounds) return false;

    const sizeY = bounds ? bounds.maxY - bounds.minY + 1 : 0;
    const sizeZ = bounds ? bounds.maxZ - bounds.minZ + 1 : 0;
    const scanTotal = microCells?.length
      ?? sparseCells?.length
      ?? ((bounds.maxX - bounds.minX + 1) * sizeY * sizeZ);
    const collected: any[] = [];
    const rawBlocks: any[] = [];
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    const consider = (x, y, z, size, block, color, part = null) => {
      collected.push({ x, y, z, size, block, color, part });
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
    };
    const cellAt = index => sparseCells?.[index] || {
      x: bounds.minX + Math.floor(index / (sizeY * sizeZ)),
      y: bounds.minY + Math.floor(index / sizeZ) % sizeY,
      z: bounds.minZ + index % sizeZ
    };

    const started = this.startBulkEditJob({
      label: 'Copying world selection',
      total: scanTotal,
      mutatesWorld: false,
      detail: job => job.processed < scanTotal ? 'Scanning selected cells' : 'Normalizing inventory voxels',
      step: (index, job) => {
        if (index < scanTotal) {
          if (microCells) {
            const cell = microCells[index];
            const existing = this.world.getMicroBlock?.(cell.x, cell.y, cell.z);
            let color = existing?.color;
            let part = null;
            if (existing) {
              const exact = this.world.getMicroBlocksInAABB?.({
                minX: cell.x / MICRO_DIVISIONS,
                minY: cell.y / MICRO_DIVISIONS,
                minZ: cell.z / MICRO_DIVISIONS,
                maxX: cell.x / MICRO_DIVISIONS,
                maxY: cell.y / MICRO_DIVISIONS,
                maxZ: cell.z / MICRO_DIVISIONS
              })?.[0];
              part = exact?.part ?? null;
            } else {
              const wx = Math.floor(cell.x / MICRO_DIVISIONS);
              const wy = Math.floor(cell.y / MICRO_DIVISIONS);
              const wz = Math.floor(cell.z / MICRO_DIVISIONS);
              if (this.world.getBlock?.(wx, wy, wz) !== BlockTypes.AIR) {
                color = this.world.getBlockColor?.(wx, wy, wz);
              }
            }
            if (color !== null && color !== undefined) {
              consider(
                cell.x / MICRO_DIVISIONS,
                cell.y / MICRO_DIVISIONS,
                cell.z / MICRO_DIVISIONS,
                0.2,
                BlockTypes.COLOR_BLOCK,
                color,
                part
              );
            }
          } else {
            this.sampleWorldCellForBulkCopy(cellAt(index), consider);
          }
          if (index === scanTotal - 1) job.total += collected.length;
          return 0;
        }

        const item = collected[index - scanTotal];
        rawBlocks.push({
          dx: microCells ? Math.round((item.x - minX) * 5) / 5 : item.x - minX,
          dy: microCells ? Math.round((item.y - minY) * 5) / 5 : item.y - minY,
          dz: microCells ? Math.round((item.z - minZ) * 5) / 5 : item.z - minZ,
          size: item.size,
          block: item.block,
          color: item.color,
          part: item.part
        });
        return 1;
      },
      finish: () => this.finishBlockSetCopy(rawBlocks, `world selection (${rawBlocks.length} voxels)`)
    });
    if (started) manager.clearSelection?.();
    return started;
  }

  copySelectionAsBlockSet() {
    if (this.bulkEditJob) {
      this.ui?.showToast?.(`Please wait for ${this.bulkEditJob.label.toLowerCase()} to finish`);
      return null;
    }
    let rawBlocks = null;
    let name = '';

    // 1. Entity block selection (2-point box on a component level)
    if (this.selectedBlockSelection && this.selectedBlockSelection.blocks.length > 0) {
      const { contraption, nodeId, blocks } = this.selectedBlockSelection;
      if (!this.canEditEntityInternals(contraption)) {
        this.clearSelection();
        this.ui?.showToast?.('Stop the entity before copying an internal block selection');
        return null;
      }
      if (blocks.length > BULK_EDIT_THRESHOLD) {
        const started = this.startLargeEntityBlockSetCopy(blocks, `${blocks.length} blocks of [${nodeId}]`);
        if (started) {
          contraption.clearSubtreeHighlight?.();
          this.selectedBlockSelection = null;
          this.selectorRange = null;
        }
        return started;
      }
      const minX = Math.min(...blocks.map(b => b.localX));
      const minY = Math.min(...blocks.map(b => b.localY));
      const minZ = Math.min(...blocks.map(b => b.localZ));
      rawBlocks = blocks.map(b => ({
        dx: b.localX - minX,
        dy: b.localY - minY,
        dz: b.localZ - minZ,
        size: b.size || 1,
        block: b.block,
        color: b.color,
        part: b.part
      }));
      name = `${blocks.length} blocks of [${nodeId}]`;
    }

    // 2. Subtree selection (first-click level): every block owned by the subtree.
    if (!rawBlocks && this.selectedSubtree && this.selectedSubtree.contraption) {
      const { contraption, rootId } = this.selectedSubtree;
      if (rootId !== 'root' && !this.canEditEntityInternals(contraption)) {
        this.clearSelection();
        this.ui?.showToast?.('Stop the entity before copying one of its internal components');
        return null;
      }
      const nodeIds = this.selectedSubtree.nodeIds || this.collectSubtreeIds(contraption, rootId);
      const blocks = contraption.blocks.filter(b => nodeIds.has(b.entityId || 'root'));
      if (blocks.length > 0) {
        if (blocks.length > BULK_EDIT_THRESHOLD) {
          const started = this.startLargeEntityBlockSetCopy(blocks, `subtree [${rootId}] (${blocks.length} blocks)`);
          if (started) {
            contraption.clearSubtreeHighlight?.();
            this.selectedSubtree = null;
          }
          return started;
        }
        const minX = Math.min(...blocks.map(b => b.localX));
        const minY = Math.min(...blocks.map(b => b.localY));
        const minZ = Math.min(...blocks.map(b => b.localZ));
        rawBlocks = blocks.map(b => ({
          dx: b.localX - minX,
          dy: b.localY - minY,
          dz: b.localZ - minZ,
          size: b.size || 1,
          block: b.block,
          color: b.color,
          part: b.part
        }));
        name = `subtree [${rootId}] (${blocks.length} blocks)`;
      }
    }

    // 3. World selection (2-point box / single-cell mode): read-only, keeps the source intact.
    if (!rawBlocks && this.contraptions && this.contraptions.hasValidSelection()) {
      if (this.contraptions.getSelectionBlockCount?.() > BULK_EDIT_THRESHOLD) {
        return this.startLargeWorldBlockSetCopy(this.contraptions);
      }
      rawBlocks = this.sampleWorldSelectionAsBlockSet();
      if (rawBlocks && rawBlocks.length > 0) name = `world selection (${rawBlocks.length} voxels)`;
    }

    if (!rawBlocks || rawBlocks.length === 0) {
      if (this.ui) this.ui.showToast('Nothing selected - box-select blocks in the world or on a component, then press T');
      return;
    }

    return this.finishBlockSetCopy(rawBlocks, name);
  }

  /**
   * Read-only sampling of the current world selection (cornerA/B box or
   * connectedSelection single cells) into relative block-set entries.
   * Unlike G-assembly this never extracts or removes anything.
   */
  sampleWorldSelectionAsBlockSet() {
    const manager = this.contraptions;
    if (!this.world || !manager) return [];

    // Micro selection (Tab mode): sample exactly the selected 0.2 m cells.
    // Empty selected cells are skipped so the copy matches what G extracts.
    const microSelection = manager.microSelection;
    if (Array.isArray(microSelection)) {
      const collected = [];
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      for (const cell of microSelection) {
        let color = null;
        const block = this.world.getMicroBlock?.(cell.x, cell.y, cell.z);
        if (block) {
          color = block.color;
        } else {
          const wx = Math.floor(cell.x / 5);
          const wy = Math.floor(cell.y / 5);
          const wz = Math.floor(cell.z / 5);
          if (this.world.getBlock && this.world.getBlock(wx, wy, wz) !== BlockTypes.AIR) {
            color = this.world.getBlockColor(wx, wy, wz);
          }
        }
        if (color === null || color === undefined) continue;
        const x = cell.x * 0.2;
        const y = cell.y * 0.2;
        const z = cell.z * 0.2;
        collected.push({ x, y, z, size: 0.2, block: BlockTypes.COLOR_BLOCK, color });
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
      }
      if (collected.length === 0) return [];
      return collected.map(b => ({
        dx: Math.round((b.x - minX) * 5) / 5,
        dy: Math.round((b.y - minY) * 5) / 5,
        dz: Math.round((b.z - minZ) * 5) / 5,
        size: b.size,
        block: b.block,
        color: b.color
      }));
    }

    const bounds = manager.getSelectionBounds();
    if (!bounds) return [];

    // MicroVoxelLayer.getCellsInAABB treats max as an exclusive bound, but the
    // selection bounds are inclusive integer cells — expand by 1−ε so micro
    // voxels in the top 4/5 of the last cell are still sampled.
    const microBounds = {
      minX: bounds.minX,
      minY: bounds.minY,
      minZ: bounds.minZ,
      maxX: bounds.maxX + 1 - 1e-6,
      maxY: bounds.maxY + 1 - 1e-6,
      maxZ: bounds.maxZ + 1 - 1e-6
    };

    const collected = []; // { x, y, z, size, block, color } in world units
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    const consider = (x, y, z, size, block, color) => {
      collected.push({ x, y, z, size, block, color });
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
    };

    if (manager.connectedSelection !== null) {
      // Single-cell mode: only the explicitly selected cells (standard blocks
      // plus any micro voxels inside those cells).
      const singleKeys = new Set(manager.connectedSelection.map(c => `${c.x},${c.y},${c.z}`));
      for (const cell of manager.connectedSelection) {
        const block = this.world.getBlock(cell.x, cell.y, cell.z);
        if (block !== BlockTypes.AIR) {
          consider(cell.x, cell.y, cell.z, 1, block, this.world.getBlockColor(cell.x, cell.y, cell.z));
        }
      }
      const micros = this.world.getMicroBlocksInAABB(microBounds) || [];
      for (const m of micros) {
        const cellKey = `${Math.floor(m.x)},${Math.floor(m.y)},${Math.floor(m.z)}`;
        if (singleKeys.has(cellKey)) {
          consider(m.x, m.y, m.z, m.size || 0.2, BlockTypes.COLOR_BLOCK, m.color);
        }
      }
    } else {
      // 2-point box: every non-air standard block plus micro voxels in the AABB.
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        for (let y = bounds.minY; y <= bounds.maxY; y++) {
          for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
            const block = this.world.getBlock(x, y, z);
            if (block !== BlockTypes.AIR) {
              consider(x, y, z, 1, block, this.world.getBlockColor(x, y, z));
            }
          }
        }
      }
      const micros = this.world.getMicroBlocksInAABB(microBounds) || [];
      for (const m of micros) {
        consider(m.x, m.y, m.z, m.size || 0.2, BlockTypes.COLOR_BLOCK, m.color);
      }
    }

    if (collected.length === 0) return [];
    return collected.map(b => ({
      dx: b.x - minX,
      dy: b.y - minY,
      dz: b.z - minZ,
      size: b.size,
      block: b.block,
      color: b.color
    }));
  }

  private bulkEditProgress(job: BulkEditJob, phase: BulkEditPhase, detail = '') {
    const jobDetail = typeof job.detail === 'function' ? job.detail(job) : job.detail;
    this.ui?.setBulkEditProgress?.({
      label: job.label,
      phase,
      processed: job.processed,
      total: job.total,
      changed: job.changed,
      detail: detail || jobDetail || ''
    });
  }

  private startBulkEditJob(job: Omit<BulkEditJob, 'processed' | 'changed'>) {
    if (this.bulkEditJob) {
      this.ui?.showToast?.(`Please wait for ${this.bulkEditJob.label.toLowerCase()} to finish`);
      return false;
    }
    this.bulkEditJob = {
      ...job,
      processed: 0,
      changed: 0
    };
    this.bulkEditProgress(this.bulkEditJob, 'applying');
    return true;
  }

  /** Process a bounded slice of a large Hammer/Selector edit from the game loop. */
  processBulkEditFrame(
    maxOperations = BULK_EDIT_MAX_OPERATIONS_PER_FRAME,
    timeBudgetMs = BULK_EDIT_FRAME_BUDGET_MS
  ) {
    const job = this.bulkEditJob;
    if (!job) return false;

    const sync = this.world?.editPersistence?.getSyncStatus?.();
    if (sync) this.ui?.setWorldEditSync?.(sync);
    if (job.mutatesWorld !== false && sync?.backpressured) {
      this.bulkEditProgress(job, 'waiting', `Waiting for the server · ${sync.pendingBatches} batches queued`);
      return true;
    }

    const now = () => globalThis.performance?.now?.() ?? Date.now();
    const startedAt = now();
    let operations = 0;
    const operationLimit = Number.isFinite(maxOperations) ? Math.max(1, Math.floor(maxOperations)) : Infinity;
    const timeLimit = Number.isFinite(timeBudgetMs) ? Math.max(0, timeBudgetMs) : Infinity;

    try {
      while (
        job.processed < job.total
        && operations < operationLimit
        && (operations === 0 || now() - startedAt < timeLimit)
      ) {
        const changed = Number(job.step(job.processed, job)) || 0;
        job.changed += changed;
        job.processed++;
        operations++;
      }
    } catch (error) {
      console.error(`Bulk edit failed during ${job.label}.`, error);
      this.bulkEditJob = null;
      this.bulkEditProgress(job, 'failed', 'The operation stopped before all blocks were processed');
      this.ui?.showToast?.(`${job.label} failed after ${job.processed}/${job.total} cells`);
      return false;
    }

    if (job.processed < job.total) {
      this.bulkEditProgress(job, 'applying');
      return true;
    }

    this.bulkEditJob = null;
    try {
      job.finish?.(job);
    } catch (error) {
      console.error(`Bulk edit failed while finishing ${job.label}.`, error);
      this.bulkEditProgress(job, 'failed', 'The operation could not be committed');
      this.ui?.showToast?.(`${job.label} could not be completed`);
      return false;
    }
    const finalSync = this.world?.editPersistence?.getSyncStatus?.();
    if (finalSync) this.ui?.setWorldEditSync?.(finalSync);
    const hasPendingSync = job.mutatesWorld !== false
      && !!finalSync
      && (finalSync.pendingBatches > 0 || finalSync.sending);
    this.bulkEditProgress(
      job,
      hasPendingSync ? 'syncing' : 'complete',
      hasPendingSync ? `${finalSync.pendingBatches} server batches queued` : ''
    );
    return false;
  }

  /** Prefer the visible entity surface over terrain behind it for inventory placement. */
  getInventoryPlacementHit() {
    const entityHit = this.hoveredContraptionHit;
    if (entityHit?.point) {
      return {
        hitPos: entityHit.point,
        normal: entityHit.normal || { x: 0, y: 1, z: 0 }
      };
    }
    return this.currentRaycast?.hit
      ? { hitPos: this.currentRaycast.hitPos, normal: this.currentRaycast.normal }
      : null;
  }

  /**
   * Resolve the exact origin shared by the Hammer ghost and every Hammer
   * build (LMB/RMB). Placement always requires a hovered surface — terrain
   * or entity — so aiming at the sky (high altitude, open air) yields no
   * pose instead of falling back to a point in front of the eye.
   * Plain block sets snap to the world grid; entity slots preserve the
   * precise hit point so their local voxel coordinates and collider remain
   * aligned.
   */
  getInventoryPlacementPose(slot) {
    if (!slot || !Array.isArray(slot.blocks) || slot.blocks.length === 0) return null;

    const placementHit = this.getInventoryPlacementHit();
    if (!placementHit) return null;

    const hp = placementHit.hitPos;
    const n = placementHit.normal;
    const position = new THREE.Vector3(
      hp.x + (n?.x || 0),
      hp.y + (n?.y || 0),
      hp.z + (n?.z || 0)
    );

    if (slot.kind === 'blockset') {
      position.set(
        Math.floor(position.x),
        Math.floor(position.y),
        Math.floor(position.z)
      );
    }

    return {
      slot,
      kind: slot.kind === 'blockset' ? 'blockset' : 'entity',
      position
    };
  }

  /** Refresh the Hammer hover ghost without mutating either world or entity state. */
  updateInventoryPlacementPreview() {
    this.inventoryPlacementPreview = null;
    if (this.activeTool !== SpecialTool.HAMMER) return;
    // Color sets apply to the palette with left-click — no placement ghost.
    if (this.activeInventoryCategory === 'colorset') return;
    const slot = this.inventorySlots?.[this.selectedInventoryIndex];
    if (!slot) return;
    this.inventoryPlacementPreview = this.getInventoryPlacementPose(slot);
  }

  /**
   * Paste a block-set slot (kind === 'blockset') at the crosshair as plain world
   * blocks. Standard blocks land on integer cells; micro voxels land on the
   * 1/5-scale micro grid. No entity is created — the voxels become terrain.
   *
   * replace = false (Hammer LMB): writes only empty cells; occupied cells are
   * skipped. replace = true (Hammer RMB, overwrite mode): occupied standard
   * blocks are replaced and occupied micro cells are replaced; a micro voxel
   * that overlaps a standard block clears that block first.
   */
  private applyBlockSetVoxel(target, block, replace = false) {
    if ((block.size || 1) < 1) {
      if (replace) {
        // Micro voxels cannot coexist with a standard block, so overwrite
        // mode clears the parent cell before writing the micro voxel.
        const wx = Math.round(target.x + block.dx);
        const wy = Math.round(target.y + block.dy);
        const wz = Math.round(target.z + block.dz);
        if (this.world.getBlock?.(wx, wy, wz) !== BlockTypes.AIR) {
          this.performBasicAction({
            domain: ActionDomain.WORLD,
            action: 'remove-standard',
            cell: { x: wx, y: wy, z: wz }
          });
        }
      }
      const result = this.performBasicAction({
        domain: ActionDomain.WORLD,
        action: 'place-micro',
        micro: [
          Math.round((target.x + block.dx) * MICRO_DIVISIONS),
          Math.round((target.y + block.dy) * MICRO_DIVISIONS),
          Math.round((target.z + block.dz) * MICRO_DIVISIONS)
        ],
        color: block.color,
        part: block.part || null,
        replace
      });
      return result.placed || 0;
    }

    const result = this.performBasicAction({
      domain: ActionDomain.WORLD,
      action: 'place-standard',
      cell: {
        x: target.x + Math.round(block.dx),
        y: target.y + Math.round(block.dy),
        z: target.z + Math.round(block.dz)
      },
      block: block.block || BlockTypes.COLOR_BLOCK,
      color: block.color,
      replace
    });
    return result.placed || 0;
  }

  private finishBlockSetPaste(target, total, placed, replace) {
    if (placed > 0) this.sound?.playBlockPlace?.();
    if (!this.ui) return;
    const skipped = Math.max(0, total - placed);
    const where = `at (${target.x}, ${target.y}, ${target.z})`;
    this.ui.showToast(replace
      ? `Overwrote block set: ${placed}/${total} plain blocks ${where}`
      : skipped > 0
        ? `Built block set: ${placed}/${total} plain blocks ${where} · ${skipped} occupied cell(s) skipped`
        : `Built block set: ${placed}/${total} plain blocks ${where}`);
  }

  pasteBlockSet(slot, replace = false) {
    if (!this.world || !slot || !Array.isArray(slot.blocks) || slot.blocks.length === 0) return false;
    if (this.bulkEditJob) {
      this.ui?.showToast?.(`Please wait for ${this.bulkEditJob.label.toLowerCase()} to finish`);
      return false;
    }

    const pose = this.getInventoryPlacementPose(slot);
    if (!pose) {
      if (this.ui) this.ui.showToast('No surface under the crosshair — aim at terrain or an entity to build');
      return false;
    }
    const target = pose.position.clone?.() || { ...pose.position };
    const blocks = [...slot.blocks];
    let placed = 0;

    if (blocks.length > BULK_EDIT_THRESHOLD) {
      return this.startBulkEditJob({
        label: replace ? 'Overwriting block set' : 'Building block set',
        total: blocks.length,
        step: index => {
          const changed = this.applyBlockSetVoxel(target, blocks[index], replace);
          placed += changed;
          return changed;
        },
        finish: () => this.finishBlockSetPaste(target, blocks.length, placed, replace)
      });
    }

    for (const block of blocks) placed += this.applyBlockSetVoxel(target, block, replace);
    this.finishBlockSetPaste(target, blocks.length, placed, replace);
    return placed > 0;
  }

  /**
   * Put an externally generated block set, such as an STL import, into the first
   * empty block-set slot. Its format and Hammer left-click placement behavior
   * matches block sets copied with T.
   * @returns The written slot, or null.
   */
  importBlockSetToInventory(blocks, name = 'STL import') {
    if (!Array.isArray(blocks) || blocks.length === 0) {
      if (this.ui) this.ui.showToast('Nothing to import - the source produced no voxels');
      return null;
    }
    const slot = { kind: 'blockset', name, blocks, blockCount: blocks.length };
    const index = this.addInventoryItem('blockset', slot);
    if (index === null) {
      if (this.ui) this.ui.showToast(`Block set inventory is full (9) - cannot import ${name}`);
      return null;
    }
    this.setActiveInventoryCategory('blockset');
    this.ui?.renderInventoryBar?.();
    if (this.ui) {
      this.ui.showToast(`Imported ${name}: ${blocks.length} voxels into block set slot ${index + 1} · Hammer LMB builds empty cells · RMB overwrites`);
    }
    return slot;
  }

  private finishWorldSelectionDelete(standard, micro) {
    const removed = standard + micro;
    if (removed > 0) {
      this.sound?.playBlockBreak?.();
      const parts = [];
      if (standard > 0) parts.push(`${standard} blocks`);
      if (micro > 0) parts.push(`${micro} micro voxels`);
      this.ui?.showToast?.(`Deleted ${parts.join(' + ')} from the selection`);
    } else {
      this.ui?.showToast?.('Selection region is empty (no blocks to delete)');
    }
  }

  private startLargeWorldSelectionDelete(manager, microSelection, bounds) {
    let particleBudget = 64;
    let removedStandard = 0;
    let removedMicro = 0;

    if (Array.isArray(microSelection)) {
      const cells = microSelection.map(cell => ({ x: cell.x, y: cell.y, z: cell.z }));
      const subdividedStandardCells = new Set<string>();
      const started = this.startBulkEditJob({
        label: 'Deleting micro selection',
        total: cells.length,
        step: index => {
          const cell = cells[index];
          const wx = Math.floor(cell.x / MICRO_DIVISIONS);
          const wy = Math.floor(cell.y / MICRO_DIVISIONS);
          const wz = Math.floor(cell.z / MICRO_DIVISIONS);
          let block = this.world.getMicroBlock?.(cell.x, cell.y, cell.z);
          if (!block && this.world.getBlock?.(wx, wy, wz) !== BlockTypes.AIR) {
            block = { color: this.world.getBlockColor?.(wx, wy, wz) };
          }
          if (block && particleBudget > 0) {
            this.particles?.emitBlockBreak?.(
              {
                x: cell.x / MICRO_DIVISIONS + 0.5 / MICRO_DIVISIONS,
                y: cell.y / MICRO_DIVISIONS + 0.5 / MICRO_DIVISIONS,
                z: cell.z / MICRO_DIVISIONS + 0.5 / MICRO_DIVISIONS
              },
              block.color,
              3
            );
            particleBudget--;
          }

          const cellKey = `${wx},${wy},${wz}`;
          let result;
          if (!subdividedStandardCells.has(cellKey)) {
            if (this.world.getBlock?.(wx, wy, wz) !== BlockTypes.AIR) {
              result = this.performBasicAction({
                domain: ActionDomain.WORLD,
                action: 'subdivide-standard',
                cell: { x: wx, y: wy, z: wz },
                micro: cell
              });
            }
            subdividedStandardCells.add(cellKey);
          }
          if (!result) {
            result = this.performBasicAction({
              domain: ActionDomain.WORLD,
              action: 'remove-micro',
              micro: cell
            });
          }
          const changed = result.removed || 0;
          removedMicro += changed;
          return changed;
        },
        finish: () => this.finishWorldSelectionDelete(0, removedMicro)
      });
      if (started) manager.clearSelection?.();
      return started;
    }

    const sparseCells = manager.connectedSelection !== null
      ? [...(manager.connectedSelection || [])].map(cell => ({ x: cell.x, y: cell.y, z: cell.z }))
      : null;
    const sizeY = bounds.maxY - bounds.minY + 1;
    const sizeZ = bounds.maxZ - bounds.minZ + 1;
    const total = sparseCells?.length
      ?? (bounds.maxX - bounds.minX + 1) * sizeY * sizeZ;
    const cellAt = index => {
      if (sparseCells) return sparseCells[index];
      return {
        x: bounds.minX + Math.floor(index / (sizeY * sizeZ)),
        y: bounds.minY + Math.floor(index / sizeZ) % sizeY,
        z: bounds.minZ + index % sizeZ
      };
    };

    const started = this.startBulkEditJob({
      label: 'Deleting selection',
      total,
      step: index => {
        const cell = cellAt(index);
        const block = this.world.getBlock?.(cell.x, cell.y, cell.z);
        if (block !== BlockTypes.AIR && particleBudget > 0) {
          this.particles?.emitBlockBreak?.(
            { x: cell.x + 0.5, y: cell.y + 0.5, z: cell.z + 0.5 },
            this.world.getBlockColor?.(cell.x, cell.y, cell.z),
            6
          );
          particleBudget--;
        }
        const result = this.performBasicAction({
          domain: ActionDomain.WORLD,
          action: 'clear-cell',
          cell
        });
        removedStandard += result.standard || 0;
        removedMicro += result.micro || 0;
        return result.removed || 0;
      },
      finish: () => this.finishWorldSelectionDelete(removedStandard, removedMicro)
    });
    if (started) manager.clearSelection?.();
    return started;
  }

  /**
   * Delete removes blocks in the current selection and then resets the selection.
   *
   * - Entity subtree selection removes the selected component and descendants;
   *   selecting root removes the whole entity.
   * - Entity block selection removes selected standard and microblocks directly
   *   owned by a component, removing the entity when it becomes empty.
   * - World box or Shift single-cell selection removes standard and 5x5x5 microblocks.
   */
  deleteSelectionBlocks() {
    const manager = this.contraptions;
    if (!manager) return;
    if (this.bulkEditJob) {
      this.ui?.showToast?.(`Please wait for ${this.bulkEditJob.label.toLowerCase()} to finish`);
      return;
    }

    // 1. Remove selected blocks from an entity component.
    if (this.selectedBlockSelection && this.selectedBlockSelection.blocks.length > 0) {
      const { contraption, nodeId, blocks } = this.selectedBlockSelection;
      const result = this.performBasicAction({
        domain: ActionDomain.SELECTION,
        action: 'delete',
        selection: { kind: 'entity-blocks', contraption, nodeId, blocks }
      });
      contraption.clearSubtreeHighlight?.();
      this.selectedBlockSelection = null;
      this.selectorLevel = null;
      this.selectorRange = null;
      if (result.ok) {
        if (!result.empty) this.ui?.notifyContraptionStructureChanged(contraption);
        this.sound?.playBlockBreak();
        if (this.ui) this.ui.showToast(`Deleted ${result.removed} blocks from [${nodeId}]`);
      } else if (this.ui) {
        this.ui.showToast(result.reason === 'entity_not_stopped'
          ? 'Stop the entity before deleting internal blocks'
          : 'Selection is empty');
      }
      return;
    }

    // 2. Delete a selected entity/component subtree through the same selection
    // command used by ctx.selection.delete(). Root selection removes the entity;
    // child selection removes that component and all descendants.
    if (this.selectedSubtree?.contraption) {
      const { contraption, rootId, nodeIds } = this.selectedSubtree;
      const result = this.performBasicAction({
        domain: ActionDomain.SELECTION,
        action: 'delete',
        selection: { kind: 'entity-subtree', contraption, rootId, nodeId: rootId, nodeIds }
      });
      this.selectedSubtree = null;
      this.selectedBlockSelection = null;
      this.selectorLevel = null;
      this.selectorRange = null;
      if (this.hoveredContraption === contraption) this.hoveredContraption = null;
      if (this.hoveredContraptionHit?.contraption === contraption) this.hoveredContraptionHit = null;

      if (result.ok) {
        this.sound?.playBlockBreak();
        if (result.entities > 0) {
          this.ui?.notifyContraptionRemoved?.(contraption);
          this.ui?.showToast(`Deleted entity ${result.entityId || `#${contraption.id}`} (${result.removed} voxels)`);
        } else {
          this.ui?.notifyContraptionStructureChanged?.(contraption);
          const descendants = Math.max(0, (result.components || 1) - 1);
          const suffix = descendants > 0 ? ` and ${descendants} descendant component${descendants === 1 ? '' : 's'}` : '';
          this.ui?.showToast(`Deleted component [${rootId}]${suffix} (${result.removed} voxels)`);
        }
      } else {
        this.ui?.showToast(result.reason === 'entity_not_stopped'
          ? 'Stop the entity before deleting an internal component'
          : 'Selected entity no longer exists');
      }
      return;
    }

    // 3. Delete a two-point world box or Shift-selected cells (standard or
    // Tab-toggled micro mode).
    if (!this.world || !manager.hasValidSelection()) {
      if (this.ui) this.ui.showToast('Nothing selected - box-select a region with the selector first, then press Del');
      return;
    }
    const microSelection = manager.microSelection;
    const isMicroSelection = Array.isArray(microSelection);
    const bounds = isMicroSelection ? null : manager.getSelectionBounds();
    if (!bounds && !isMicroSelection) {
      if (this.ui) this.ui.showToast('Nothing selected - box-select a region with the selector first, then press Del');
      return;
    }

    const largeSelectionCount = isMicroSelection
      ? microSelection.length
      : manager.connectedSelection !== null
        ? manager.connectedSelection.length
        : (bounds.maxX - bounds.minX + 1)
          * (bounds.maxY - bounds.minY + 1)
          * (bounds.maxZ - bounds.minZ + 1);
    if (largeSelectionCount > BULK_EDIT_THRESHOLD) {
      this.startLargeWorldSelectionDelete(manager, microSelection, bounds);
      return;
    }

    let particleBudget = 64;
    if (isMicroSelection) {
      // Micro mode deletes exactly the selected 0.2 m cells that hold a voxel.
      for (const cell of microSelection) {
        let block = this.world.getMicroBlock?.(cell.x, cell.y, cell.z);
        if (!block) {
          const wx = Math.floor(cell.x / 5);
          const wy = Math.floor(cell.y / 5);
          const wz = Math.floor(cell.z / 5);
          if (this.world.getBlock && this.world.getBlock(wx, wy, wz) !== BlockTypes.AIR) {
            block = { color: this.world.getBlockColor(wx, wy, wz) };
          }
        }
        if (block && particleBudget > 0) {
          this.particles?.emitBlockBreak(
            { x: cell.x * 0.2 + 0.1, y: cell.y * 0.2 + 0.1, z: cell.z * 0.2 + 0.1 },
            block.color, 3
          );
          particleBudget--;
        }
      }
    } else {
      const cells = [];
      const collectCell = (x, y, z) => {
        cells.push({ x, y, z });
        const block = this.world.getBlock(x, y, z);
        if (block !== BlockTypes.AIR) {
          const color = this.world.getBlockColor(x, y, z);
          if (particleBudget > 0) {
            this.particles?.emitBlockBreak({ x: x + 0.5, y: y + 0.5, z: z + 0.5 }, color, 6);
            particleBudget--;
          }
        }
      };

      if (manager.connectedSelection !== null) {
        // Shift single-cell mode deletes only explicitly selected cells.
        for (const cell of manager.connectedSelection) collectCell(cell.x, cell.y, cell.z);
      } else {
        for (let x = bounds.minX; x <= bounds.maxX; x++) {
          for (let y = bounds.minY; y <= bounds.maxY; y++) {
            for (let z = bounds.minZ; z <= bounds.maxZ; z++) collectCell(x, y, z);
          }
        }
      }
    }

    // The shared selection command resolves the manager's current box/sparse cells
    // and executes the same world voxel commands available to entity programs.
    const result = this.performBasicAction({ domain: ActionDomain.SELECTION, action: 'delete' });
    const removedBlocks = result.standard || 0;
    const removedMicros = result.micro || 0;
    if (result.ok) {
      this.sound?.playBlockBreak();
      if (this.ui) {
        const parts = [];
        if (removedBlocks > 0) parts.push(`${removedBlocks} blocks`);
        if (removedMicros > 0) parts.push(`${removedMicros} micro voxels`);
        this.ui.showToast(`Deleted ${parts.join(' + ')} from the selection`);
      }
    } else if (this.ui) {
      this.ui.showToast('Selection region is empty (no blocks to delete)');
    }
  }

  handleRightClick(e = null) {
    if (this.bulkEditJob) {
      this.ui?.showToast?.(`Please wait for ${this.bulkEditJob.label.toLowerCase()} to finish`);
      return false;
    }
    const isRecolorModifier = e && (e.shiftKey || this.keys.crouch);

    // 1. Shovel -> place one standard block, replacing micro cells in the cell.
    // When Shift is held, recolor the targeted block without placing a new one.
    if (this.activeTool === SpecialTool.SHOVEL) {
      if (isRecolorModifier) {
        this.paintTargetedBlock();
        return;
      }

      if (this.hoveredContraptionHit) {
        const hit = this.hoveredContraptionHit;
        const c = hit.contraption;
        const targetNodeId = hit.entityId || 'root';
        // When targeting micro voxels, treat the carved cell as one 1x1x1
        // block: the placement target is its neighbor along the normal; the
        // carved cell itself is never overwritten.
        const targetCell = hit.kind === 'micro'
          ? {
              x: hit.cell.x + (hit.normal?.x || 0),
              y: hit.cell.y + (hit.normal?.y || 0),
              z: hit.cell.z + (hit.normal?.z || 0)
            }
          : hit.placeCell;

        const result = this.performBasicAction({
          domain: ActionDomain.ENTITY,
          action: 'place-standard',
          target: { contraption: c },
          nodeId: targetNodeId,
          cell: targetCell,
          color: this.selectedColor
        });
        if (!result.ok) {
          if (result.reason === 'occupied' && this.ui) {
            this.ui.showToast('Target cell is occupied; the shovel never overwrites existing geometry');
          }
          return;
        }
        this.ui?.notifyContraptionStructureChanged(c);
        this.sound.playBlockPlace();
        if (this.ui) {
          this.ui.showToast(`Added 1 standard block to [${targetNodeId}]`);
        }
        return;
      }

      if (!this.currentRaycast.hit) return;

      let target;
      if (this.currentRaycast.kind === 'micro') {
        // Carved cell is treated as one block: target = neighbor along the normal
        const mp = this.currentRaycast.microPos;
        const normal = this.currentRaycast.normal;
        target = {
          x: Math.floor(mp.x / 5) + (normal?.x || 0),
          y: Math.floor(mp.y / 5) + (normal?.y || 0),
          z: Math.floor(mp.z / 5) + (normal?.z || 0)
        };
      } else {
        target = this.currentRaycast.placePos;
      }
      if (!this.canPlaceStandardAt(target)) return;
      const result = this.performBasicAction({
        domain: ActionDomain.WORLD,
        action: 'place-standard',
        cell: target,
        color: this.selectedColor
      });
      if (!result.ok && result.reason === 'occupied') {
        if (this.ui) this.ui.showToast('Target cell is occupied; the shovel never overwrites existing geometry');
        return;
      }
      this.sound.playBlockPlace();
      return;
    }

    // 2. Spoon -> place one 1/5-scale micro block on the targeted surface.
    // When Shift is held, recolor the targeted micro block.
    if (this.activeTool === SpecialTool.SPOON) {
      if (isRecolorModifier) {
        this.paintTargetedBlock();
        return;
      }

      if (this.hoveredContraptionHit) {
        const hit = this.hoveredContraptionHit;
        const c = hit.contraption;
        const targetNodeId = hit.entityId || 'root';
        const placePos = hit.placeMicroPos;
        const mx = Math.round(placePos.localX * 5) / 5;
        const my = Math.round(placePos.localY * 5) / 5;
        const mz = Math.round(placePos.localZ * 5) / 5;

        const result = this.performBasicAction({
          domain: ActionDomain.ENTITY,
          action: 'place-micro',
          target: { contraption: c },
          nodeId: targetNodeId,
          micro: [Math.round(mx * 5), Math.round(my * 5), Math.round(mz * 5)],
          color: this.selectedColor
        });

        if (result.ok) {
          this.ui?.notifyContraptionStructureChanged(c);
          this.sound.playBlockPlace();
          if (this.ui) {
            this.ui.showToast(`Added 1 micro voxel to [${targetNodeId}]`);
          }
        }
        return;
      }

      if (!this.currentRaycast.hit) return;

      let targetMicro = this.currentRaycast.placeMicroPos;
      if (this.currentRaycast.kind === 'standard') {
        const normal = this.currentRaycast.normal;
        const entry = this.currentRaycast.entry
          ? new THREE.Vector3(this.currentRaycast.entry.x, this.currentRaycast.entry.y, this.currentRaycast.entry.z)
          : this.physics.getEyePosition();
        entry.x += normal.x * 0.02;
        entry.y += normal.y * 0.02;
        entry.z += normal.z * 0.02;
        targetMicro = {
          x: Math.floor(entry.x * 5),
          y: Math.floor(entry.y * 5),
          z: Math.floor(entry.z * 5)
        };
      }
      const result = targetMicro && this.performBasicAction({
        domain: ActionDomain.WORLD,
        action: 'place-micro',
        micro: targetMicro,
        color: this.selectedColor
      });
      if (result?.ok) {
        this.sound.playBlockPlace();
      }
      return;
    }

    // 3. Brush -> Left-click paints (see handleLeftClick); right-click samples
    //    the targeted color (pipette merged into the brush).
    if (this.activeTool === SpecialTool.BRUSH) {
      this.sampleTargetedColor();
      return;
    }

    // 4. Pipette -> Sample color on right click as well
    if (this.activeTool === SpecialTool.PIPETTE) {
      this.sampleTargetedColor();
      return;
    }

    // Wrench right-click toggles entity runtime start/stop.
    if (this.activeTool === SpecialTool.WRENCH) {
      this.toggleHoveredEntityPlayback();
      return;
    }

    // Hammer RMB pastes a block-set slot in overwrite mode; LMB still writes
    // only into empty cells. Entity slots keep their left-click build.
    if (this.activeTool === SpecialTool.HAMMER) {
      const slot = this.inventorySlots[this.selectedInventoryIndex];
      if (slot && slot.kind === 'blockset') return this.pasteBlockSet(slot, true);
      return;
    }

    // Selector intentionally has no right-click action.
    return;
  }

  getWrenchGrabBodyId(contraption, nodeId = 'root') {
    let currentId = String(nodeId || 'root');
    while (currentId) {
      const body = contraption.getRigidBody?.(currentId);
      if (body?.type === BodyType.DYNAMIC) return currentId;
      currentId = contraption.getEntityNode?.(currentId)?.parentId || '';
    }
    return null;
  }

  startWrenchGrab() {
    const contraption = this.hoveredContraptionHit?.contraption || this.hoveredContraption;
    if (!contraption) {
      this.ui?.showToast?.('Wrench: hold left-click on a dynamic entity to grab it');
      return false;
    }
    const bodyId = this.getWrenchGrabBodyId(
      contraption,
      this.hoveredContraptionHit?.entityId || 'root'
    );
    if (!bodyId) {
      this.ui?.showToast?.('Wrench: this entity has no dynamic body to grab');
      return false;
    }
    const eyePos = this.physics?.getEyePosition ? this.physics.getEyePosition() : (this.camera?.position ? this.camera.position.clone() : new THREE.Vector3());
    const hitPoint = this.hoveredContraptionHit?.point
      ? (this.hoveredContraptionHit.point.isVector3
        ? this.hoveredContraptionHit.point.clone()
        : new THREE.Vector3(this.hoveredContraptionHit.point.x, this.hoveredContraptionHit.point.y, this.hoveredContraptionHit.point.z))
      : (contraption.position?.isVector3 ? contraption.position.clone() : new THREE.Vector3());

    const localPoint = contraption.worldToEntityLocal
      ? contraption.worldToEntityLocal(bodyId, hitPoint.clone())
      : contraption.worldToLocal
        ? contraption.worldToLocal(hitPoint.clone())
        : hitPoint.clone().sub(contraption.position || new THREE.Vector3());

    const initialDistance = Math.max(1.5, eyePos.distanceTo(hitPoint));

    this.releaseWrenchGrab();
    this.wrenchGrab = {
      contraption,
      bodyId,
      localPoint,
      targetDistance: initialDistance,
      lastTargetPosition: hitPoint.clone(),
      active: true
    };
    this.sound?.playWrenchClick?.();
    return true;
  }

  releaseWrenchGrab() {
    const wasActive = !!this.wrenchGrab;
    this.wrenchGrab = null;
    this.sceneRenderer?.setWrenchTether?.(null, null);
    return wasActive;
  }

  stopHoveredEntity() {
    const contraption = this.hoveredContraptionHit?.contraption || this.hoveredContraption;
    if (!contraption) {
      this.ui?.showToast?.('Wrench: point at an entity to stop it');
      return false;
    }
    const result = this.performBasicAction({
      domain: ActionDomain.ENTITY,
      action: 'stop-scripts',
      target: { contraption }
    });
    this.sound?.playWrenchClick?.();
    if (this.ui) {
      this.ui.showToast(result.ok
        ? `Entity #${contraption.id} stopped (state reset)`
        : result.reason === 'already_stopped'
          ? `Entity #${contraption.id} is already stopped`
          : `Entity #${contraption.id} could not be stopped`);
    }
    return result.ok;
  }

  toggleHoveredEntityPlayback() {
    const contraption = this.hoveredContraptionHit?.contraption || this.hoveredContraption;
    if (!contraption) {
      this.ui?.showToast?.('Wrench: point at an entity to start or stop it');
      return false;
    }
    const nodeIds = [...(contraption.entityNodes?.keys?.() || ['root'])];
    const hasEnabledCode = nodeIds.some(id => contraption.isNodeScriptEnabled?.(id));
    const isRunning = contraption.scriptStatus === 'running' && hasEnabledCode;
    const shouldStart = !isRunning;
    const result = this.performBasicAction({
      domain: ActionDomain.ENTITY,
      action: shouldStart ? 'start-scripts' : 'stop-scripts',
      target: { contraption }
    });
    this.sound?.playWrenchClick?.();
    if (this.ui) {
      const message = result.ok
        ? shouldStart
          ? `Entity #${contraption.id} started`
          : `Entity #${contraption.id} stopped (state reset)`
        : result.reason === 'no_scripts'
          ? `Entity #${contraption.id} has no runnable code`
          : `Entity #${contraption.id} could not be updated`;
      this.ui.showToast(message);
    }
    return result.ok;
  }

  paintTargetedBlock() {
    if (this.hoveredContraptionHit) {
      const hit = this.hoveredContraptionHit;
      const c = hit.contraption;
      if (hit.block) {
        const nodeId = hit.entityId || 'root';
        const isMicro = (hit.block.size || 1) < 1;
        const result = this.performBasicAction({
          domain: ActionDomain.ENTITY,
          action: isMicro ? 'paint-micro' : 'paint-standard',
          target: { contraption: c },
          nodeId,
          ...(isMicro
            ? { micro: [
                Math.round(hit.block.localX * 5),
                Math.round(hit.block.localY * 5),
                Math.round(hit.block.localZ * 5)
              ] }
            : { cell: hit.cell }),
          color: this.selectedColor
        });
        if (!result.ok) return;
        this.sound.playBlockPlace();
        this.particles.emitBlockBreak(hit.point, this.selectedColor, 6);
        if (this.ui) this.ui.showToast(`Painted block on [${hit.entityId || 'root'}]: ${colorToHex(this.selectedColor)}`);
        return;
      }
    }

    if (!this.currentRaycast || !this.currentRaycast.hit) return;
    if (this.currentRaycast.kind === 'micro') {
      const mp = this.currentRaycast.microPos;
      const result = this.performBasicAction({
        domain: ActionDomain.WORLD,
        action: 'paint-micro',
        micro: mp,
        color: this.selectedColor
      });
      if (result.ok) {
        this.sound.playBlockPlace();
        this.particles.emitBlockBreak(this.currentRaycast.hitPos, this.selectedColor, 4);
        if (this.ui) this.ui.showToast(`Painted micro voxel: ${colorToHex(this.selectedColor)}`);
      }
    } else {
      const hp = this.currentRaycast.hitPos;
      const result = this.performBasicAction({
        domain: ActionDomain.WORLD,
        action: 'paint-standard',
        cell: hp,
        color: this.selectedColor
      });
      if (result.ok) {
        this.sound.playBlockPlace();
        this.particles.emitBlockBreak(hp, this.selectedColor, 8);
        if (this.ui) this.ui.showToast(`Painted block: ${colorToHex(this.selectedColor)}`);
      }
    }
  }

  sampleTargetedColor() {
    if (this.hoveredContraptionHit && this.hoveredContraptionHit.color !== undefined) {
      if (this.ui) {
        this.ui.setBuildColor(this.hoveredContraptionHit.color);
      }
      this.sound.playWrenchClick();
      return;
    }

    if (!this.currentRaycast || !this.currentRaycast.hit) return;
    const color = this.currentRaycast.color;
    if (color !== undefined && color !== null) {
      if (this.ui) {
        this.ui.setBuildColor(color);
      }
      this.sound.playWrenchClick();
    }
  }

  // =========================================================================
  // Inventory serialization plus Hammer placement
  // =========================================================================

  /**
   * Recursively collect the node IDs of `rootId` and all its descendants.
   * @returns A `Set<string>` of node IDs.
   */
  collectSubtreeIds(contraption, rootId) {
    const ids = new Set();
    const walk = (id) => {
      if (ids.has(id)) return;
      ids.add(id);
      for (const node of contraption.entityNodes.values()) {
        if (node.parentId === id) walk(node.id);
      }
    };
    walk(rootId);
    return ids;
  }

  /** R key (Selector): serialize the selected subtree into the entity category. */
  copySelectedSubtreeToInventory() {
    if (!this.selectedSubtree || !this.selectedSubtree.contraption) {
      if (this.ui) this.ui.showToast('Nothing selected - point at an entity/component with the selector first');
      return null;
    }
    const { contraption, rootId } = this.selectedSubtree;
    const containsInternalRoot = rootId !== 'root';
    if (containsInternalRoot && !this.canEditEntityInternals(contraption)) {
      this.clearSelection();
      this.ui?.showToast?.('Stop the entity before copying one of its internal components');
      return null;
    }
    const slot = contraption.serializeSubtree(rootId);
    const index = this.addInventoryItem('entity', slot);
    if (index === null) {
      this.ui?.showToast?.(`Entity inventory is full (${this.inventories.entity.items.length}) - delete one first`);
      return null;
    }
    this.setActiveInventoryCategory('entity');
    this.ui?.renderInventoryBar?.();
    this.clearSelection();
    this.activateTool(SpecialTool.HAMMER);
    if (this.ui) {
      this.ui.showToast(`Copied [${rootId}] (${slot.blockCount} blocks, ${slot.scripts.length} scripts) to entity slot ${index + 1} · switched to Hammer`);
    }
    return slot;
  }

  // --- Backpack compatibility bridge -------------------------------------------------
  // `inventorySlots` / `selectedInventoryIndex` keep the historic single-list API,
  // transparently bound to the *active* category so the hammer bar and the Shift
  // shortcuts operate on 9 slots of blocksets, entities or color sets.
  get inventorySlots() {
    return this.inventoryCategory().items;
  }
  set inventorySlots(value) {
    const items = new Array(9).fill(null);
    if (Array.isArray(value)) {
      for (let i = 0; i < Math.min(9, value.length); i++) items[i] = value[i];
    }
    this.inventoryCategory().items = items;
    this.saveInventoriesToLocalStorage();
  }
  get selectedInventoryIndex() {
    return this.inventoryCategory().selected;
  }
  set selectedInventoryIndex(value) {
    const group = this.inventoryCategory();
    group.selected = Number.isInteger(value) && value >= 0 && value < group.items.length ? value : 0;
    this.saveInventoriesToLocalStorage();
  }

  createEmptyInventories() {
    return {
      blockset: { items: new Array(99).fill(null), selected: 0 },
      entity: { items: new Array(99).fill(null), selected: 0 },
      colorset: { items: new Array(9).fill(null), selected: 0 }
    };
  }

  inventoryCategory() {
    // Lazy bootstrap for prototype-created instances (tests skip the constructor).
    if (!this.inventories) {
      this.inventories = this.createEmptyInventories();
      this.activeInventoryCategory = 'blockset';
    }
    return this.inventories[this.activeInventoryCategory] || this.inventories.blockset;
  }

  /** Switch the hammer bar between blocksets / entities. */
  setActiveInventoryCategory(category) {
    if (!this.inventories) this.inventoryCategory();
    if (!this.inventories[category]) return this.activeInventoryCategory;
    this.activeInventoryCategory = category;
    const group = this.inventories[category];
    group.selected = Number.isInteger(group.selected) && group.selected >= 0 && group.selected < group.items.length
      ? group.selected
      : 0;
    this.saveInventoriesToLocalStorage();
    return category;
  }

  /**
   * Tab key: toggle the hammer bar between block sets (BKS) and entities
   * (ENT). The bar no longer exposes color sets; its renderer snaps a
   * legacy color-set focus back to block sets.
   */
  toggleHammerCategory() {
    const next = this.activeInventoryCategory === 'entity' ? 'blockset' : 'entity';
    this.setActiveInventoryCategory(next);
    this.ui?.renderInventoryBar?.();
    if (this.ui) {
      this.ui.showToast(next === 'entity'
        ? 'Hammer bar: ENTITIES · Tab switches to BLOCK SETS'
        : 'Hammer bar: BLOCK SETS · Tab switches to ENTITIES');
    }
    return next;
  }

  /**
   * Tab key (Selector tool): toggle between standard 1 m block selection
   * (the default) and 0.2 m micro-block selection. Switching granularity
   * discards any in-progress or completed block selection (world box, sparse
   * single cells, entity box) so the two granularities never mix; component
   * subtree selection is unaffected.
   */
  toggleSelectorMicroMode() {
    this.selectorMicroMode = !this.selectorMicroMode;
    if (this.selectedBlockSelection?.contraption?.clearSubtreeHighlight) {
      this.selectedBlockSelection.contraption.clearSubtreeHighlight();
    }
    this.selectedBlockSelection = null;
    this.selectorLevel = null;
    this.selectorRange = null;
    this.contraptions?.clearSelection?.();
    if (this.ui) {
      this.ui.updateToolPanelMode?.();
      this.ui.renderHotbar?.();
      this.ui.showToast(this.selectorMicroMode
        ? 'Selector: MICRO mode · Shift+click toggles micro cells · Tab switches to STANDARD'
        : 'Selector: STANDARD mode · Tab switches to MICRO');
    }
    return this.selectorMicroMode;
  }

  /**
   * Resolve the 0.2 m micro cell under the crosshair for the current world
   * raycast. Micro hits use the hit micro cell directly; standard hits use
   * the exact face entry point pushed through the surface (the same math as
   * the spoon's direct carve), clamped to the hit standard cell so aiming at
   * any face selects the surface micro cell of the target block. Returns
   * torus-wrapped micro-grid indices {x,y,z}, or null when nothing is hit.
   */
  selectorMicroCellFromRaycast(ray = this.currentRaycast) {
    if (!ray || !ray.hit) return null;
    if (ray.kind === 'micro' && ray.microPos) {
      return {
        x: wrapMicroX(ray.microPos.x),
        y: Math.max(0, ray.microPos.y),
        z: wrapMicroZ(ray.microPos.z)
      };
    }
    const hp = ray.hitPos;
    if (!hp) return null;
    const normal = ray.normal || { x: 0, y: 0, z: 0 };
    const entry = ray.entry || hp;
    const baseX = Math.floor(hp.x);
    const baseY = Math.floor(hp.y);
    const baseZ = Math.floor(hp.z);
    const clamp = (value, base) => Math.max(base * 5, Math.min(base * 5 + 4, value));
    return {
      x: wrapMicroX(clamp(Math.floor((entry.x + normal.x * 0.02) * 5), baseX)),
      y: Math.max(0, clamp(Math.floor((entry.y + normal.y * 0.02) * 5), baseY)),
      z: wrapMicroZ(clamp(Math.floor((entry.z + normal.z * 0.02) * 5), baseZ))
    };
  }

  /** Meter-space origin of the 0.2 m micro cell containing a world point. */
  microMeterPoint(point) {
    if (!point) return null;
    return {
      x: Math.floor(point.x * 5 + 1e-6) / 5,
      y: Math.max(0, Math.floor(point.y * 5 + 1e-6)) / 5,
      z: Math.floor(point.z * 5 + 1e-6) / 5
    };
  }

  /**
   * Corner A of a pending world box in meter units. Micro-mode corners are
   * stored as 0.2-grid integers, so they must be scaled down before the
   * preview renderer (which works in meters) floors them.
   */
  pendingWorldCornerAMeters() {
    const cornerA = this.contraptions?.selectionCornerA;
    if (!cornerA) return null;
    return cornerA.micro
      ? { x: cornerA.x / 5, y: cornerA.y / 5, z: cornerA.z / 5 }
      : { x: cornerA.x, y: cornerA.y, z: cornerA.z };
  }

  /** Put an item into the first matching-category slot that is empty (or the selected
   *  slot when it is empty and the bar is showing that category). Returns the index,
   *  or null when the category is full (9 items max). */
  addInventoryItem(category, item) {
    if (!this.inventories) this.inventoryCategory();
    const group = this.inventories?.[category];
    if (!group || !item) return null;
    if (!item.id) {
      const prefix = category === 'colorset' ? 'cs_' : category === 'blockset' ? 'bs_' : 'ent_';
      item.id = typeof globalThis.crypto?.randomUUID === 'function'
        ? `${prefix}${globalThis.crypto.randomUUID()}`
        : `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
    // Put an item into the first available empty slot in the category.
    const index = group.items.findIndex(slot => !slot);
    if (index < 0) return null;
    item.name = this.inventoryItemName(category, item, index);
    group.items[index] = item;
    if (index < 9) {
      group.selected = index;
    }
    this.saveInventoriesToLocalStorage();
    return index;
  }

  /** Display name for a backpack item. Names are intentionally not unique. */
  inventoryItemName(category, item, index = 0) {
    const explicitName = typeof item?.name === 'string' ? item.name.trim() : '';
    if (explicitName) return explicitName.slice(0, MAX_INVENTORY_NAME_LENGTH);
    if (category === 'blockset') {
      return `Block set ${index + 1}`;
    }
    if (category === 'entity') {
      return `Entity ${index + 1}`;
    }
    return `Color set ${index + 1}`;
  }

  /** Rename one item. Duplicate and empty names are allowed within and across categories. */
  renameInventoryItem(category, index, name) {
    if (!this.inventories) this.inventoryCategory();
    const group = this.inventories?.[category];
    if (!group || !Number.isInteger(index) || !group.items[index]) return null;
    const cleanName = typeof name === 'string' ? name.trim().slice(0, MAX_INVENTORY_NAME_LENGTH) : '';
    group.items[index].name = cleanName;
    this.saveInventoriesToLocalStorage();
    return cleanName;
  }

  /** Remove one backpack item; keeps a valid selected index. */
  deleteInventoryItem(category, index) {
    if (!this.inventories) this.inventoryCategory();
    const group = this.inventories?.[category];
    if (!group || !Number.isInteger(index) || !group.items[index]) return false;
    if (category === 'colorset') {
      const nonNullCount = group.items.filter(Boolean).length;
      if (nonNullCount <= 1) return false;
      group.items.splice(index, 1);
      while (group.items.length < 9) {
        group.items.push(null);
      }
      if (group.selected >= group.items.filter(Boolean).length) {
        group.selected = Math.max(0, group.items.filter(Boolean).length - 1);
      }
      this.saveInventoriesToLocalStorage();
      return true;
    }
    group.items[index] = null;
    if (!group.items[group.selected]) {
      const filled = group.items.findIndex(slot => slot);
      group.selected = filled >= 0 ? filled : 0;
    }
    this.saveInventoriesToLocalStorage();
    return true;
  }

  /** Swap two slots within an inventory category. */
  swapInventorySlots(category, fromIndex, toIndex) {
    if (!this.inventories) this.inventoryCategory();
    const group = this.inventories?.[category];
    if (!group || !Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return false;
    const maxLen = group.items.length;
    if (fromIndex < 0 || fromIndex >= maxLen || toIndex < 0 || toIndex >= maxLen || fromIndex === toIndex) return false;

    const temp = group.items[fromIndex];
    group.items[fromIndex] = group.items[toIndex];
    group.items[toIndex] = temp;

    if (group.selected === fromIndex) {
      group.selected = toIndex;
    } else if (group.selected === toIndex) {
      group.selected = fromIndex;
    }

    this.saveInventoriesToLocalStorage();
    return true;
  }

  inventoryStorage() {
    if (this.persistentStorage) return this.persistentStorage;
    try {
      return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
    } catch (err) {
      return null;
    }
  }

  /** Keep the built-in nine-color palette available as a color set. */
  ensureDefaultColorSet() {
    if (!this.inventories) this.inventoryCategory();
    const items = this.inventories.colorset.items;
    const defaultColors = PRESET_COLORS.map(color => color.hex.toLowerCase());
    const alreadyPresent = items.some(item => item && Array.isArray(item.colors)
      && item.colors.length === defaultColors.length
      && item.colors.every((color, index) => String(color).toLowerCase() === defaultColors[index]));
    if (alreadyPresent) {
      items.forEach(item => {
        if (item && !item.id) {
          item.id = typeof globalThis.crypto?.randomUUID === 'function'
            ? `cs_${globalThis.crypto.randomUUID()}`
            : `cs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        }
      });
      return false;
    }
    const index = items.findIndex(item => !item);
    if (index < 0) return false;
    items[index] = {
      id: typeof globalThis.crypto?.randomUUID === 'function'
        ? `cs_${globalThis.crypto.randomUUID()}`
        : `cs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name: DEFAULT_COLOR_SET_NAME,
      colors: defaultColors
    };
    return true;
  }

  /** Persist all three backpack categories in the same canonical format used by export. */
  saveInventoriesToLocalStorage(storage = this.inventoryStorage()) {
    if (!storage || !this.inventories) return false;
    const categories = {};
    for (const category of INVENTORY_CATEGORIES) {
      const group = this.inventories[category];
      categories[category] = {
        selected: group.selected,
        items: group.items.map(item => item ? this.serializeInventoryItem(category, item) : null)
      };
    }
    try {
      storage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify({
        type: 'space-backpack',
        version: INVENTORY_STORAGE_VERSION,
        activeCategory: this.activeInventoryCategory,
        categories
      }));
      return true;
    } catch (err) {
      console.warn('Could not save backpack to browser storage:', err);
      return false;
    }
  }

  /** Restore the backpack on startup; old or malformed storage is intentionally ignored. */
  loadInventoriesFromLocalStorage(storage = this.inventoryStorage()) {
    const inventories = this.createEmptyInventories();
    let activeCategory = 'blockset';
    let loaded = false;
    let changed = false;

    try {
      const raw = storage?.getItem(INVENTORY_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data?.type === 'space-backpack' && data?.version === INVENTORY_STORAGE_VERSION) {
          for (const category of INVENTORY_CATEGORIES) {
            const storedGroup = data.categories?.[category];
            const maxLen = inventories[category].items.length;
            const storedItems = Array.isArray(storedGroup?.items) ? storedGroup.items.slice(0, maxLen) : [];
            for (let index = 0; index < storedItems.length; index++) {
              if (!storedItems[index]) continue;
              const parsed = this.parseInventoryImport(JSON.stringify(storedItems[index]), category);
              if (parsed.ok) inventories[category].items[index] = (parsed as any).item;
              else changed = true;
            }
            const selected = Number(storedGroup?.selected);
            inventories[category].selected = Number.isInteger(selected) && selected >= 0 && selected < maxLen ? selected : 0;
          }
          if (INVENTORY_CATEGORIES.includes(data.activeCategory)) activeCategory = data.activeCategory;
          loaded = true;
        }
      }
    } catch (err) {
      changed = true;
    }

    this.inventories = inventories;
    this.activeInventoryCategory = activeCategory;
    if (this.ensureDefaultColorSet()) changed = true;
    if (storage && (!loaded || changed)) this.saveInventoriesToLocalStorage(storage);
    return loaded;
  }

  // --- File import / export (pure, DOM-free) ----------------------------------------

  /** Serialize one backpack item for a JSON download. */
  serializeInventoryItem(category, item) {
    if (!item) return null;
    if (category === 'blockset') {
      return {
        type: 'space-blockset',
        version: 2,
        name: this.inventoryItemName('blockset', item),
        blockCount: item.blockCount || item.blocks?.length || 0,
        blocks: (item.blocks || []).map(b => {
          const shared = {
            block: BlockTypes.COLOR_BLOCK,
            color: normalizeColor(b.color ?? 0xf2a93b),
            ...(b.part ? { part: String(b.part).slice(0, 64) } : {})
          };
          if ((b.size ?? 1) < 1) {
            // Block-set files keep every coordinate integral. dx/dy/dz select
            // the standard cell; mx/my/mz select one of its 5 subdivisions.
            const microX = Math.round(Number(b.dx) * MICRO_DIVISIONS);
            const microY = Math.round(Number(b.dy) * MICRO_DIVISIONS);
            const microZ = Math.round(Number(b.dz) * MICRO_DIVISIONS);
            const dx = Math.floor(microX / MICRO_DIVISIONS);
            const dy = Math.floor(microY / MICRO_DIVISIONS);
            const dz = Math.floor(microZ / MICRO_DIVISIONS);
            return {
              dx,
              dy,
              dz,
              mx: microX - dx * MICRO_DIVISIONS,
              my: microY - dy * MICRO_DIVISIONS,
              mz: microZ - dz * MICRO_DIVISIONS,
              ...shared
            };
          }
          return {
            dx: Math.round(Number(b.dx)),
            dy: Math.round(Number(b.dy)),
            dz: Math.round(Number(b.dz)),
            ...shared
          };
        })
      };
    }
    if (category === 'entity') {
      const vector3 = value => Array.isArray(value) && value.length >= 3
        && value.slice(0, 3).every(component => Number.isFinite(Number(component)))
        ? value.slice(0, 3).map(Number)
        : undefined;
      const optionalNumber = value => value !== null && value !== undefined && Number.isFinite(Number(value))
        ? Number(value)
        : undefined;
      const childEntities = (item.childEntities || []).map(definition => ({
        id: String(definition.id || ''),
        parentId: String(definition.parentId || definition.parent || 'root'),
        ...(definition.kind === 'child' ? { kind: 'child' } : {}),
        ...(definition.collisionEnabled === false ? { collisionEnabled: false } : {}),
        ...(vector3(definition.pivot) ? { pivot: vector3(definition.pivot) } : {}),
        ...(['dynamic', 'kinematic'].includes(definition.bodyType) ? { bodyType: definition.bodyType } : {}),
        ...(optionalNumber(definition.mass) !== undefined ? { mass: optionalNumber(definition.mass) } : {}),
        ...(optionalNumber(definition.restitution) !== undefined ? { restitution: optionalNumber(definition.restitution) } : {}),
        ...(optionalNumber(definition.friction) !== undefined ? { friction: optionalNumber(definition.friction) } : {})
      }));
      const constraints = (item.constraints || []).map(constraint => ({
        id: String(constraint.id || ''),
        type: ['point', 'hinge', 'weld'].includes(constraint.type) ? constraint.type : 'point',
        bodyA: String(constraint.bodyA || constraint.other || 'world'),
        bodyB: String(constraint.bodyB || constraint.nodeId || ''),
        ...(vector3(constraint.anchorA) ? { anchorA: vector3(constraint.anchorA) } : {}),
        ...(vector3(constraint.anchorB) ? { anchorB: vector3(constraint.anchorB) } : {}),
        ...(vector3(constraint.axisA) ? { axisA: vector3(constraint.axisA) } : {}),
        ...(vector3(constraint.axisB) ? { axisB: vector3(constraint.axisB) } : {}),
        ...(vector3(constraint.referenceA) ? { referenceA: vector3(constraint.referenceA) } : {}),
        ...(vector3(constraint.referenceB) ? { referenceB: vector3(constraint.referenceB) } : {}),
        ...(constraint.limits && Number.isFinite(Number(constraint.limits.min))
          && Number.isFinite(Number(constraint.limits.max))
          ? { limits: { min: Number(constraint.limits.min), max: Number(constraint.limits.max) } }
          : {}),
        stiffness: Number.isFinite(Number(constraint.stiffness)) ? Number(constraint.stiffness) : 0.9,
        collideConnected: constraint.collideConnected === true
      }));
      return {
        type: 'space-entity',
        version: 2,
        name: this.inventoryItemName('entity', item),
        rootId: 'root',
        nodeCount: 1 + childEntities.length,
        blockCount: item.blockCount || item.blocks?.length || 0,
        blocks: (item.blocks || []).map(b => {
          const shared = {
            block: BlockTypes.COLOR_BLOCK,
            color: normalizeColor(b.color ?? 0xf2a93b),
            entityId: String(b.entityId || 'root'),
            ...(b.part ? { part: String(b.part).slice(0, 64) } : {})
          };
          const x = Number(b.localX ?? b.dx);
          const y = Number(b.localY ?? b.dy);
          const z = Number(b.localZ ?? b.dz);
          if ((b.size ?? 1) < 1) {
            const microX = Math.round(x * MICRO_DIVISIONS);
            const microY = Math.round(y * MICRO_DIVISIONS);
            const microZ = Math.round(z * MICRO_DIVISIONS);
            const dx = Math.floor(microX / MICRO_DIVISIONS);
            const dy = Math.floor(microY / MICRO_DIVISIONS);
            const dz = Math.floor(microZ / MICRO_DIVISIONS);
            return {
              dx,
              dy,
              dz,
              mx: microX - dx * MICRO_DIVISIONS,
              my: microY - dy * MICRO_DIVISIONS,
              mz: microZ - dz * MICRO_DIVISIONS,
              ...shared
            };
          }
          return {
            dx: Math.round(x),
            dy: Math.round(y),
            dz: Math.round(z),
            ...shared
          };
        }),
        childEntities,
        scripts: (item.scripts || []).map(script => ({ id: String(script.id || ''), code: String(script.code || '') })),
        enabled: (item.enabled || []).map(entry => ({ id: String(entry.id || ''), enabled: entry.enabled === true })),
        constraints,
        mode: item.mode,
        bodyType: item.bodyType,
        mass: item.mass,
        restitution: item.restitution,
        friction: item.friction,
        useGravity: item.useGravity,
        bearingAxis: vector3(item.bearingAxis),
        bearingRpm: optionalNumber(item.bearingRpm),
        pistonAxis: vector3(item.pistonAxis),
        pistonDistance: optionalNumber(item.pistonDistance),
        pistonSpeed: optionalNumber(item.pistonSpeed),
        cockpitPosition: vector3(item.cockpitPosition),
        isVehicle: item.isVehicle
      };
    }
    if (category === 'colorset') {
      return {
        type: 'space-colorset',
        version: 2,
        name: item.name || 'color set',
        colors: item.colors
      };
    }
    return null;
  }

  /** Parse a JSON file into a backpack item. Returns { ok, item, error }. */
  parseInventoryImport(text, category) {
    const fail = error => ({ ok: false, error });
    if (typeof text !== 'string') return fail('Import data must be text');
    if (new TextEncoder().encode(text).byteLength > MAX_INVENTORY_IMPORT_BYTES) {
      return fail(`File exceeds ${MAX_INVENTORY_IMPORT_BYTES / (1024 * 1024)} MiB`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return fail('Not valid JSON');
    }

    const validBaseCoordinates = (values) => values.every(value => (
      Number.isSafeInteger(value) && Math.abs(value) <= MAX_IMPORT_COORDINATE
    ));
    const withinEntityBounds = (blocks, keys) => {
      for (let axis = 0; axis < 3; axis++) {
        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        for (const block of blocks) {
          const value = Math.floor(Number(block[keys[axis]]) + 1e-6);
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
        if (max - min + 1 > MAX_ENTITY_BOUNDS) return false;
      }
      return true;
    };
    const safePart = value => typeof value === 'string' && value.length > 0
      ? value.slice(0, 64)
      : undefined;
    const isPortableBlockId = value => value === undefined
      || (typeof value === 'number' && Number.isInteger(value) && value === BlockTypes.COLOR_BLOCK);
    const validateVoxelOccupancy = (blocks, coordinateKeys, ownerKey = null) => {
      const standardCells = new Set();
      const microCells = new Set();
      const microParents = new Set();
      for (const block of blocks) {
        const owner = ownerKey ? String(block[ownerKey] || 'root') : 'resource';
        const coordinates = coordinateKeys.map(key => Number(block[key]));
        const base = coordinates.map(value => Math.floor(value + 1e-6));
        const isMicro = Number(block.size) < 1;
        const parentKey = `${owner}:${base.join(',')}`;
        const fine = coordinates.map(value => Math.round(value * MICRO_DIVISIONS));
        if (isMicro) {
          const key = `${owner}:${fine.join(',')}`;
          if (standardCells.has(parentKey) || microCells.has(key)) return false;
          microCells.add(key);
          microParents.add(parentKey);
        } else {
          if (standardCells.has(parentKey) || microParents.has(parentKey)) return false;
          standardCells.add(parentKey);
        }
      }
      return true;
    };

    if (category === 'blockset') {
      if (data?.type !== 'space-blockset' || data?.version !== 2) return fail('Expected a space-blockset v2 file');
      if (typeof data.name !== 'string' || !data.name.trim()) return fail('A block set must have a name');
      const rawBlocks = data.blocks;
      if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) return fail('No block set found (expected a "blocks" array)');
      if (rawBlocks.length > MAX_INVENTORY_BLOCKS) return fail(`A block set may contain at most ${MAX_INVENTORY_BLOCKS} voxels`);
      const blocks = [];
      for (const b of rawBlocks) {
        if (!isPortableBlockId(b?.block)) {
          return fail('Block-set v2 supports only color block id 1');
        }
        const baseCoordinates = [b?.dx, b?.dy, b?.dz].map(Number);
        if (!baseCoordinates.every(Number.isFinite)) return fail('A block has non-numeric coordinates');
        if (!validBaseCoordinates(baseCoordinates)) return fail('Block-set v2 coordinates must be bounded safe integers');

        const microValues = [b?.mx, b?.my, b?.mz];
        const hasMicroCoordinates = microValues.some(value => value !== undefined);
        let [dx, dy, dz] = baseCoordinates;
        const size = hasMicroCoordinates ? 1 / MICRO_DIVISIONS : 1;

        if (hasMicroCoordinates) {
          const microCoordinates = microValues.map(Number);
          if (!microCoordinates.every(Number.isInteger)) {
            return fail('Micro block dx/dy/dz and mx/my/mz must be integers');
          }
          if (!microCoordinates.every(value => value >= 0 && value < MICRO_DIVISIONS)) {
            return fail('Micro block mx/my/mz must be between 0 and 4');
          }
          [dx, dy, dz] = baseCoordinates.map(
            (value, index) => (value * MICRO_DIVISIONS + microCoordinates[index]) / MICRO_DIVISIONS
          );
        }

        const part = safePart(b?.part);
        blocks.push({
          dx,
          dy,
          dz,
          size,
          block: BlockTypes.COLOR_BLOCK,
          color: normalizeColor(b?.color ?? 0xf2a93b),
          ...(part ? { part } : {})
        });
      }
      if (!withinEntityBounds(blocks, ['dx', 'dy', 'dz'])) {
        return fail(`Block-set bounds may not exceed ${MAX_ENTITY_BOUNDS} cells per axis`);
      }
      if (!validateVoxelOccupancy(blocks, ['dx', 'dy', 'dz'])) {
        return fail('Block set contains duplicate voxels or standard/micro overlap');
      }
      const name = data.name.trim().slice(0, MAX_INVENTORY_NAME_LENGTH);
      return { ok: true, item: { kind: 'blockset', name, blocks, blockCount: blocks.length } };
    }

    if (category === 'entity') {
      if (data?.type !== 'space-entity' || data?.version !== 2) return fail('Expected a space-entity v2 file');
      if (typeof data.name !== 'string' || !data.name.trim()) return fail('An entity must have a name');
      if (!data || !Array.isArray(data.blocks) || data.blocks.length === 0) return fail('No entity found (expected a "blocks" array)');
      if (data.blocks.length > MAX_INVENTORY_BLOCKS) return fail(`An entity may contain at most ${MAX_INVENTORY_BLOCKS} voxels`);
      if (data.rootIds !== undefined) return fail('Entity v2 supports exactly one root');
      if (data.rootId !== undefined && data.rootId !== 'root') return fail('Entity rootId must be "root"');

      const rawChildEntities = Array.isArray(data.childEntities) ? data.childEntities : [];
      if (rawChildEntities.length > MAX_ENTITY_COMPONENTS - 1) {
        return fail(`An entity may contain at most ${MAX_ENTITY_COMPONENTS} components`);
      }
      const portableVector = (value, maxAbs = MAX_PORTABLE_VECTOR_COMPONENT) => {
        if (value === undefined) return undefined;
        if (!Array.isArray(value) || value.length < 3) return null;
        const vector = value.slice(0, 3).map(Number);
        return vector.every(component => Number.isFinite(component) && Math.abs(component) <= maxAbs)
          ? vector
          : null;
      };
      const portableMass = value => {
        if (value === undefined || value === null) return undefined;
        const mass = Number(value);
        if (!Number.isFinite(mass) || mass <= 0 || mass > MAX_PORTABLE_BODY_MASS) return null;
        return Math.max(0.1, mass);
      };

      const childEntities = [];
      const childIdSet = new Set();
      for (const definition of rawChildEntities) {
        const id = definition?.id;
        if (!isValidComponentId(id, false) || childIdSet.has(id)) return fail('Child component ids must be unique portable identifiers');
        childIdSet.add(id);
        const parentId = String(definition.parentId || definition.parent || 'root');
        if (!isValidComponentId(parentId)) return fail(`Invalid parent id for component ${id}`);
        const pivot = portableVector(definition.pivot, MAX_IMPORT_COORDINATE);
        if (pivot === null) {
          return fail(`Invalid pivot for component ${id}`);
        }
        const bodyType = definition.bodyType === 'dynamic' || definition.bodyType === 'kinematic'
          ? definition.bodyType
          : undefined;
        const mass = portableMass(definition.mass);
        if (mass === null) return fail(`Invalid mass for component ${id}`);
        const restitution = definition.restitution === undefined || definition.restitution === null
          ? Number.NaN
          : Number(definition.restitution);
        const friction = definition.friction === undefined || definition.friction === null
          ? Number.NaN
          : Number(definition.friction);
        childEntities.push({
          id,
          parentId,
          ...(definition.kind === 'child' ? { kind: 'child' } : {}),
          ...(definition.collisionEnabled === false ? { collisionEnabled: false } : {}),
          ...(pivot ? { pivot } : {}),
          ...(bodyType ? { bodyType } : {}),
          ...(mass !== undefined ? { mass } : {}),
          ...(Number.isFinite(restitution) ? { restitution: Math.max(0, Math.min(1, restitution)) } : {}),
          ...(Number.isFinite(friction) ? { friction: Math.max(0, Math.min(1, friction)) } : {})
        });
      }
      const knownNodeIds = new Set(['root', ...childIdSet]);
      for (const definition of childEntities) {
        if (!knownNodeIds.has(definition.parentId)) {
          return fail(`Unknown parent ${definition.parentId} for component ${definition.id}`);
        }
      }
      for (const definition of childEntities) {
        const visited = new Set([definition.id]);
        let parentId = definition.parentId;
        while (childIdSet.has(parentId)) {
          if (visited.has(parentId)) return fail('Component hierarchy contains a cycle');
          visited.add(parentId);
          parentId = childEntities.find(candidate => candidate.id === parentId)?.parentId || 'root';
        }
      }

      const blocks = [];
      for (const b of data.blocks) {
        if (!isPortableBlockId(b?.block)) {
          return fail('Entity v2 supports only color block id 1');
        }
        const baseCoordinates = [b?.dx, b?.dy, b?.dz].map(Number);
        if (!baseCoordinates.every(Number.isFinite)) return fail('An entity block has non-numeric coordinates');
        if (!validBaseCoordinates(baseCoordinates)) return fail('Entity v2 coordinates must be bounded safe integers');

        const microValues = [b?.mx, b?.my, b?.mz];
        const hasMicroCoordinates = microValues.some(value => value !== undefined);
        let [localX, localY, localZ] = baseCoordinates;
        const size = hasMicroCoordinates ? 1 / MICRO_DIVISIONS : 1;

        if (hasMicroCoordinates) {
          const microCoordinates = microValues.map(Number);
          if (!microCoordinates.every(Number.isInteger)) {
            return fail('Entity micro block dx/dy/dz and mx/my/mz must be integers');
          }
          if (!microCoordinates.every(value => value >= 0 && value < MICRO_DIVISIONS)) {
            return fail('Entity micro block mx/my/mz must be between 0 and 4');
          }
          [localX, localY, localZ] = baseCoordinates.map(
            (value, index) => (value * MICRO_DIVISIONS + microCoordinates[index]) / MICRO_DIVISIONS
          );
        }

        const entityId = typeof b?.entityId === 'string' ? b.entityId : 'root';
        if (!knownNodeIds.has(entityId)) return fail(`A block references unknown component ${entityId}`);
        const part = safePart(b?.part);
        blocks.push({
          localX,
          localY,
          localZ,
          size,
          block: BlockTypes.COLOR_BLOCK,
          color: normalizeColor(b?.color ?? 0xf2a93b),
          entityId,
          ...(part ? { part } : {})
        });
      }
      if (!withinEntityBounds(blocks, ['localX', 'localY', 'localZ'])) {
        return fail(`Entity bounds may not exceed ${MAX_ENTITY_BOUNDS} cells per axis`);
      }
      if (!validateVoxelOccupancy(blocks, ['localX', 'localY', 'localZ'], 'entityId')) {
        return fail('Entity contains duplicate voxels or standard/micro overlap');
      }

      const scripts = [];
      const scriptIds = new Set();
      let totalScriptBytes = 0;
      for (const script of Array.isArray(data.scripts) ? data.scripts : []) {
        if (!script || typeof script.id !== 'string' || typeof script.code !== 'string'
          || !knownNodeIds.has(script.id) || scriptIds.has(script.id)) {
          return fail('Scripts must reference unique known components');
        }
        const scriptBytes = new TextEncoder().encode(script.code).byteLength;
        if (scriptBytes > MAX_INVENTORY_SCRIPT_BYTES) return fail(`One component script may not exceed ${MAX_INVENTORY_SCRIPT_BYTES / 1024} KiB`);
        totalScriptBytes += scriptBytes;
        if (totalScriptBytes > MAX_INVENTORY_TOTAL_SCRIPT_BYTES) return fail(`Entity scripts may not exceed ${MAX_INVENTORY_TOTAL_SCRIPT_BYTES / 1024} KiB in total`);
        scriptIds.add(script.id);
        scripts.push({ id: script.id, code: script.code });
      }
      const enabled = [];
      const enabledIds = new Set();
      for (const entry of Array.isArray(data.enabled) ? data.enabled : []) {
        if (!entry || typeof entry.id !== 'string' || typeof entry.enabled !== 'boolean'
          || !knownNodeIds.has(entry.id) || enabledIds.has(entry.id)) {
          return fail('Enabled flags must reference unique known components');
        }
        enabledIds.add(entry.id);
        enabled.push({ id: entry.id, enabled: entry.enabled });
      }

      const rawConstraints = Array.isArray(data.constraints) ? data.constraints : [];
      if (rawConstraints.length > MAX_INVENTORY_CONSTRAINTS) return fail(`An entity may contain at most ${MAX_INVENTORY_CONSTRAINTS} constraints`);
      const constraints = [];
      const constraintIds = new Set();
      for (const constraint of rawConstraints) {
        const id = constraint?.id;
        const bodyA = String(constraint?.bodyA || constraint?.other || 'world');
        const bodyB = String(constraint?.bodyB || constraint?.nodeId || '');
        if (!isValidComponentId(id, false) || constraintIds.has(id)) return fail('Constraint ids must be unique portable identifiers');
        if ((bodyA !== 'world' && !knownNodeIds.has(bodyA)) || !knownNodeIds.has(bodyB) || bodyA === bodyB) {
          return fail(`Constraint ${id} references an invalid component`);
        }
        const vectorFields = ['anchorA', 'anchorB', 'axisA', 'axisB', 'referenceA', 'referenceB'];
        const vectors: Record<string, number[]> = {};
        for (const field of vectorFields) {
          if (constraint[field] === undefined) continue;
          const vector = portableVector(constraint[field]);
          if (vector === null) {
            return fail(`Constraint ${id} has an invalid ${field}`);
          }
          vectors[field] = vector;
        }
        let limits;
        if (constraint.limits !== undefined && constraint.limits !== null) {
          const min = Number(constraint.limits?.min);
          const max = Number(constraint.limits?.max);
          if (!Number.isFinite(min) || !Number.isFinite(max)
            || Math.abs(min) > MAX_PORTABLE_CONSTRAINT_VALUE
            || Math.abs(max) > MAX_PORTABLE_CONSTRAINT_VALUE) {
            return fail(`Constraint ${id} has invalid limits`);
          }
          limits = { min: Math.min(min, max), max: Math.max(min, max) };
        }
        const stiffness = Number(constraint.stiffness ?? 0.9);
        if (!Number.isFinite(stiffness)) return fail(`Constraint ${id} has invalid stiffness`);
        constraintIds.add(id);
        constraints.push({
          id,
          type: ['point', 'hinge', 'weld'].includes(constraint.type) ? constraint.type : 'point',
          bodyA,
          bodyB,
          ...vectors,
          ...(limits ? { limits } : {}),
          stiffness: Math.max(0, Math.min(1, stiffness)),
          collideConnected: constraint.collideConnected === true
        });
      }

      const validModes = new Set(Object.values(ContraptionMode));
      const bearingAxis = portableVector(data.bearingAxis);
      const pistonAxis = portableVector(data.pistonAxis);
      const cockpitPosition = portableVector(data.cockpitPosition, MAX_IMPORT_COORDINATE);
      if (bearingAxis === null || pistonAxis === null || cockpitPosition === null) {
        return fail('Entity axes and cockpit position must be bounded finite 3D vectors');
      }
      const optionalBoundedNumber = (value, min, max) => {
        if (value === undefined || value === null) return undefined;
        const number = Number(value);
        return Number.isFinite(number) && number >= min && number <= max ? number : null;
      };
      const bearingRpm = optionalBoundedNumber(data.bearingRpm, -10_000, 10_000);
      const pistonDistance = optionalBoundedNumber(data.pistonDistance, 0, MAX_IMPORT_COORDINATE);
      const pistonSpeed = optionalBoundedNumber(data.pistonSpeed, 0, 10_000);
      if (bearingRpm === null || pistonDistance === null || pistonSpeed === null) {
        return fail('Entity bearing and piston parameters are outside portable bounds');
      }
      const mass = portableMass(data.mass);
      if (mass === null) return fail('Entity mass is outside portable bounds');
      const item = {
        name: data.name.trim().slice(0, MAX_INVENTORY_NAME_LENGTH),
        rootId: 'root',
        nodeCount: knownNodeIds.size,
        blockCount: blocks.length,
        blocks,
        childEntities,
        scripts,
        enabled,
        constraints,
        mode: validModes.has(data.mode) ? data.mode : ContraptionMode.FREE_PHYSICS,
        bodyType: data.bodyType === 'kinematic' ? 'kinematic' : 'dynamic',
        mass,
        restitution: data.restitution !== undefined && data.restitution !== null && Number.isFinite(Number(data.restitution))
          ? Math.max(0, Math.min(1, Number(data.restitution)))
          : undefined,
        friction: data.friction !== undefined && data.friction !== null && Number.isFinite(Number(data.friction))
          ? Math.max(0, Math.min(1, Number(data.friction)))
          : undefined,
        useGravity: typeof data.useGravity === 'boolean' ? data.useGravity : undefined,
        bearingAxis,
        bearingRpm,
        pistonAxis,
        pistonDistance,
        pistonSpeed,
        cockpitPosition,
        isVehicle: data.isVehicle === true
      };
      return { ok: true, item };
    }

    if (category === 'colorset') {
      if (data?.type !== 'space-colorset' || data?.version !== 2) return fail('Expected a space-colorset v2 file');
      if (typeof data.name !== 'string' || !data.name.trim()) return fail('A color set must have a name');
      const rawColors = data.colors;
      if (!Array.isArray(rawColors) || rawColors.length !== 9) return fail('A color set must contain exactly 9 hex colors');
      const colors = rawColors.map(c => `#${String(c ?? '').replace(/^#/, '').toLowerCase()}`);
      if (!colors.every(c => HEX_COLOR.test(c))) return fail('Every color must be a 6-digit hex value like #48dbfb');
      const name = data.name.trim().slice(0, MAX_INVENTORY_NAME_LENGTH);
      return { ok: true, item: { name, colors } };
    }

    return fail('Unknown inventory category');
  }

  // --- Hammer build ------------------------------------------------------------------

  private finishEntitySlotBuild(slot, position, preparedBlocks = null) {
    const created = this.contraptions.buildFromSlot(slot, position, null, true, preparedBlocks);
    if (created) {
      this.sound?.playBlockPlace?.();
      const builtLabel = slot.name || 'entity';
      this.ui?.showToast?.(`Built [${builtLabel}] (${slot.blockCount} blocks) as entity #${created.id}`);
    }
    return created;
  }

  /** Map a large serialized entity slot incrementally; registration stays atomic. */
  private startLargeEntitySlotBuild(slot, position) {
    const source = [...slot.blocks];
    const preparedBlocks: any[] = [];
    return this.startBulkEditJob({
      label: 'Building entity',
      total: source.length,
      mutatesWorld: false,
      detail: 'Preparing entity voxels',
      step: index => {
        const block = source[index];
        preparedBlocks.push({
          localX: block.localX,
          localY: block.localY,
          localZ: block.localZ,
          size: block.size || 1,
          color: block.color,
          block: block.block,
          part: block.part,
          entityId: block.entityId || 'root'
        });
        return 1;
      },
      finish: () => this.finishEntitySlotBuild(slot, position, preparedBlocks)
    });
  }

  /**
   * Hammer left-click: place the current inventory slot at the crosshair.
   * - **Block set** (T copy, STL import): stamps plain world blocks.
   * - **Entity** (R copy, imported): spawns an independent physics entity.
   * - **Color set**: applies its 9 colors to the keyboard palette.
   */
  pasteInventorySlot() {
    if (this.activeTool !== SpecialTool.HAMMER) return false;
    const category = this.activeInventoryCategory;
    const slot = this.inventorySlots[this.selectedInventoryIndex];
    if (!slot) {
      if (this.ui) this.ui.showToast(`${category} slot is empty - copy or import something first`);
      return false;
    }
    if (this.bulkEditJob) {
      this.ui?.showToast?.(`Please wait for ${this.bulkEditJob.label.toLowerCase()} to finish`);
      return false;
    }

    if (category === 'colorset') {
      this.ui?.applyColorSetToPalette?.(slot);
      if (this.ui) {
        this.ui.showToast(`Applied color set "${slot.name || 'unnamed'}" to the keyboard palette`);
      }
      return true;
    }

    if (slot.kind === 'blockset' || category === 'blockset') {
      return this.pasteBlockSet(slot);
    }

    const pose = this.getInventoryPlacementPose(slot);
    if (!pose) {
      if (Array.isArray(slot.blocks) && slot.blocks.length > 0 && this.ui) {
        this.ui.showToast('No surface under the crosshair — aim at terrain or an entity to build');
      }
      return false;
    }

    const position = pose.position.clone?.() || new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z);
    if (Array.isArray(slot.blocks) && slot.blocks.length > BULK_EDIT_THRESHOLD) {
      return this.startLargeEntitySlotBuild(slot, position);
    }
    return !!this.finishEntitySlotBuild(slot, position);
  }

  /**
   * Cycle the active inventory slot of the current backpack category by
   * `direction` (+1 or −1); used when the Hammer is active.
   */
  cycleInventorySlot(direction) {
    const count = this.inventorySlots.length;
    this.selectedInventoryIndex = (this.selectedInventoryIndex + direction + count) % count;
    this.ui?.renderInventoryBar?.();
    if (this.ui) {
      const slot = this.inventorySlots[this.selectedInventoryIndex];
      const prefix = `${this.activeInventoryCategory} slot ${this.selectedInventoryIndex + 1}`;
      this.ui.showToast(!slot
        ? `${prefix}: empty`
        : this.activeInventoryCategory === 'colorset'
          ? `${prefix}: ${slot.name || 'unnamed'} (Hammer LMB applies palette)`
        : this.activeInventoryCategory === 'blockset'
            ? `${prefix}: ${slot.name || 'unnamed'} · ${slot.blockCount} voxels (Hammer LMB builds empty · RMB overwrites)`
            : `${prefix}: ${slot.name || 'unnamed'} · ${slot.blockCount} blocks`);
    }
  }

  canPlaceStandardAt(pos) {
    if (!pos) return false;
    const playerAABB = this.physics.getAABB();
    return !(
      pos.x + 1 > playerAABB.minX && pos.x < playerAABB.maxX &&
      pos.y + 1 > playerAABB.minY && pos.y < playerAABB.maxY &&
      pos.z + 1 > playerAABB.minZ && pos.z < playerAABB.maxZ
    );
  }

  private finishPreparedWorldAssembly(rawBlocks, origin, mode, customOptions) {
    if (rawBlocks.length === 0) {
      this.ui?.showToast?.('Selection region is empty (no blocks to assemble)');
      return null;
    }
    const actionResult = this.performBasicAction({
      domain: ActionDomain.SELECTION,
      action: 'assemble',
      mode,
      options: customOptions,
      prepared: { blocks: rawBlocks, origin }
    });
    const contraption = actionResult.entity;
    if (contraption) {
      this.ui?.showToast?.(`${contraption.blocks.length} blocks assembled as root body · press C to open the editor`);
      this.openCodeEditorForTarget();
    }
    return contraption || null;
  }

  /** Extract a large world selection incrementally, then atomically create its entity. */
  private startLargeWorldAssembly(mode, customOptions = {}) {
    const manager = this.contraptions;
    const finalMode = manager.normalizeAssemblyMode?.(mode);
    if (!finalMode) return false;

    const microCells = Array.isArray(manager.microSelection)
      ? manager.microSelection.map(cell => ({ x: cell.x, y: cell.y, z: cell.z }))
      : null;
    const bounds = manager.getSelectionBounds?.();
    const sparseCells = !microCells && manager.connectedSelection !== null
      ? [...(manager.connectedSelection || [])].map(cell => ({ x: cell.x, y: cell.y, z: cell.z }))
      : null;
    if (!microCells && !bounds) return false;

    const sizeY = bounds ? bounds.maxY - bounds.minY + 1 : 0;
    const sizeZ = bounds ? bounds.maxZ - bounds.minZ + 1 : 0;
    const scanTotal = microCells?.length
      ?? sparseCells?.length
      ?? ((bounds.maxX - bounds.minX + 1) * sizeY * sizeZ);
    const origin = microCells
      ? { x: Infinity, y: Infinity, z: Infinity }
      : { x: bounds.minX, y: bounds.minY, z: bounds.minZ };
    const total = microCells ? scanTotal * 2 : scanTotal;
    const rawBlocks: any[] = [];
    const cellAt = index => sparseCells?.[index] || {
      x: bounds.minX + Math.floor(index / (sizeY * sizeZ)),
      y: bounds.minY + Math.floor(index / sizeZ) % sizeY,
      z: bounds.minZ + index % sizeZ
    };

    const started = this.startBulkEditJob({
      label: 'Assembling selection',
      total,
      detail: job => microCells && job.processed < scanTotal
        ? 'Measuring micro selection'
        : 'Extracting selected voxels',
      step: index => {
        if (microCells) {
          if (index < scanTotal) {
            const cell = microCells[index];
            origin.x = Math.min(origin.x, cell.x / MICRO_DIVISIONS);
            origin.y = Math.min(origin.y, cell.y / MICRO_DIVISIONS);
            origin.z = Math.min(origin.z, cell.z / MICRO_DIVISIONS);
            return 0;
          }
          const cell = microCells[index - scanTotal];
          const wx = Math.floor(cell.x / MICRO_DIVISIONS);
          const wy = Math.floor(cell.y / MICRO_DIVISIONS);
          const wz = Math.floor(cell.z / MICRO_DIVISIONS);
          const existing = this.world.getMicroBlock?.(cell.x, cell.y, cell.z);
          let color = existing?.color;
          let part = null;
          if (existing) {
            const exact = this.world.getMicroBlocksInAABB?.({
              minX: cell.x / MICRO_DIVISIONS,
              minY: cell.y / MICRO_DIVISIONS,
              minZ: cell.z / MICRO_DIVISIONS,
              maxX: cell.x / MICRO_DIVISIONS,
              maxY: cell.y / MICRO_DIVISIONS,
              maxZ: cell.z / MICRO_DIVISIONS
            })?.[0];
            part = exact?.part ?? null;
          } else if (this.world.getBlock?.(wx, wy, wz) !== BlockTypes.AIR) {
            color = this.world.getBlockColor?.(wx, wy, wz);
          }
          if (color === null || color === undefined) return 0;

          let result;
          if (!existing && this.world.getBlock?.(wx, wy, wz) !== BlockTypes.AIR) {
            result = this.performBasicAction({
              domain: ActionDomain.WORLD,
              action: 'subdivide-standard',
              cell: { x: wx, y: wy, z: wz },
              micro: cell
            });
          } else {
            result = this.performBasicAction({
              domain: ActionDomain.WORLD,
              action: 'remove-micro',
              micro: cell
            });
          }
          if (!(result.removed > 0)) return 0;
          rawBlocks.push({
            localX: cell.x / MICRO_DIVISIONS - origin.x,
            localY: cell.y / MICRO_DIVISIONS - origin.y,
            localZ: cell.z / MICRO_DIVISIONS - origin.z,
            size: 0.2,
            block: BlockTypes.COLOR_BLOCK,
            color,
            part
          });
          return 1;
        }

        const cell = cellAt(index);
        const block = this.world.getBlock?.(cell.x, cell.y, cell.z);
        const color = block !== BlockTypes.AIR
          ? this.world.getBlockColor?.(cell.x, cell.y, cell.z)
          : null;
        const micros = this.world.getMicroBlocksInAABB?.({
          minX: cell.x,
          minY: cell.y,
          minZ: cell.z,
          maxX: cell.x + 1 - 1e-6,
          maxY: cell.y + 1 - 1e-6,
          maxZ: cell.z + 1 - 1e-6
        }) || [];
        const result = this.performBasicAction({
          domain: ActionDomain.WORLD,
          action: 'clear-cell',
          cell
        });
        if (result.standard > 0) {
          rawBlocks.push({
            localX: cell.x - origin.x,
            localY: cell.y - origin.y,
            localZ: cell.z - origin.z,
            size: 1,
            block,
            color
          });
        }
        for (const micro of micros) {
          rawBlocks.push({
            localX: micro.x - origin.x,
            localY: micro.y - origin.y,
            localZ: micro.z - origin.z,
            size: micro.size || 0.2,
            block: BlockTypes.COLOR_BLOCK,
            color: micro.color,
            part: micro.part
          });
        }
        return result.removed || 0;
      },
      finish: () => this.finishPreparedWorldAssembly(rawBlocks, origin, finalMode, customOptions)
    });
    if (started) manager.clearSelection?.();
    return started;
  }

  assembleSelection(mode = ContraptionMode.PROGRAMMABLE, customOptions = {}) {
    if (this.bulkEditJob) {
      this.ui?.showToast?.(`Please wait for ${this.bulkEditJob.label.toLowerCase()} to finish`);
      return null;
    }
    if (this.contraptions.hasChildSelection()) {
      if (!this.contraptions.hasReadyChildSelection()) {
        if (this.ui) this.ui.showToast('No blocks selected - click to select component blocks');
        return null;
      }
      const selection = this.contraptions.getChildSelectionInfo?.();
      if (selection && (selection.count > BULK_EDIT_THRESHOLD
        || selection.contraption.blocks.length > BULK_EDIT_THRESHOLD)) {
        const started = this.startLargeChildCreation(
          selection.contraption,
          selection.parentId,
          selection.contraption.blocks,
          true,
          selection.cells
        );
        if (started) this.contraptions.clearChildSelection?.();
        return started;
      }
      const actionResult = this.performBasicAction({
        domain: ActionDomain.SELECTION,
        action: 'create-child'
      });
      const result = actionResult.child
        ? { child: actionResult.child, contraption: actionResult.contraption }
        : null;
      if (result && this.ui) {
        this.ui.showToast(`Child component ${result.child.id} created · control it via self.child('${result.child.id}')`);
        this.ui.renderComponentTree(result.contraption);
        this.ui.renderCodeTabs(result.contraption);
        this.ui.updateInspectorProperties(result.child.id);
      }
      return result?.child || null;
    }
    if (this.contraptions.getSelectionBlockCount?.() > BULK_EDIT_THRESHOLD) {
      return this.startLargeWorldAssembly(mode, customOptions);
    }
    const actionResult = this.performBasicAction({
      domain: ActionDomain.SELECTION,
      action: 'assemble',
      mode,
      options: customOptions
    });
    const contraption = actionResult.entity;
    if (contraption && this.ui) {
      this.ui.showToast(`${contraption.blocks.length} blocks assembled as root body · press C to open the editor`);
      this.openCodeEditorForTarget();
    }
    return contraption || null;
  }

  toggleDriveVehicle() {
    if (this.isDriving) {
      const vehicle = this.drivenContraption;
      this.isDriving = false;
      this.contraptions.activeDrivable = null;
      this.drivenContraption = null;
      this.resetEntityInputState();

      if (vehicle) {
        // Leave beside the vehicle instead of teleporting two metres upward.
        // The bounding sphere keeps the player's AABB outside even when the
        // vehicle is rotated, while preserving its current altitude/velocity.
        const exitDirection = new THREE.Vector3(1, 0, 0).applyQuaternion(vehicle.quaternion);
        exitDirection.y = 0;
        if (exitDirection.lengthSq() < 1e-6) exitDirection.set(1, 0, 0);
        exitDirection.normalize();
        const exitDistance = vehicle.boundingRadius + this.physics.width + 0.25;
        this.physics.position.copy(vehicle.position).addScaledVector(exitDirection, exitDistance);
        this.physics.velocity.copy(vehicle.velocity);
        this.physics.isOnGround = false;
        this.physics.ridingContraption = null;
      }

      if (this.ui) this.ui.showToast(`Left the driver seat`);
      return;
    }

    const eye = this.physics.getEyePosition();
    let closest = null;
    let closestDist = 5.5;

    for (const c of this.contraptions.contraptions) {
      // Entities with isVehicle=false cannot be driven with V; the default is true.
      if (c.isVehicle === false) continue;
      if (c.mode === ContraptionMode.DRIVABLE || c.mode === ContraptionMode.PROGRAMMABLE) {
        const d = eye.distanceTo(c.position);
        if (d < closestDist) {
          closestDist = d;
          closest = c;
        }
      }
    }

    if (closest) {
      this.resetEntityInputState();
      this.isDriving = true;
      this.drivenContraption = closest;
      this.contraptions.activeDrivable = closest;
      if (this.ui) this.ui.showToast(`Mounted! Key behavior is defined by the ctx.input script · [C] program [V] leave`);
    } else {
      if (this.ui) this.ui.showToast(`No drivable entity nearby (press B to spawn a drone or rover)`);
    }
  }

  setSceneRenderer(sceneRenderer) {
    this.sceneRenderer = sceneRenderer;
    if (this.sceneRenderer?.setPlayerAvatarVisible) {
      this.sceneRenderer.setPlayerAvatarVisible(this.perspective !== 'first_person');
    }
  }

  setFov(fov: number) {
    this.fov = Math.max(40, Math.min(120, Number(fov) || 75));
    if (this.camera) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  setPerspective(perspective: PlayerPerspective) {
    const normalized: PlayerPerspective = perspective === 'third_person'
      || perspective === 'third_person_front'
      ? perspective
      : 'first_person';
    this.perspective = normalized;
    if (this.sceneRenderer?.setPlayerAvatarVisible) {
      this.sceneRenderer.setPlayerAvatarVisible(normalized !== 'first_person');
    }
  }

  setThirdPersonDistance(dist: number) {
    this.thirdPersonDistance = Math.max(1.5, Math.min(12, Number(dist) || 4));
  }

  togglePerspective() {
    const next: PlayerPerspective = this.perspective === 'first_person'
      ? 'third_person'
      : this.perspective === 'third_person'
        ? 'third_person_front'
        : 'first_person';
    this.setPerspective(next);
    if (this.ui) {
      this.ui.syncSettingsUI?.();
      const label = next === 'third_person'
        ? 'Third Person Back View'
        : next === 'third_person_front'
          ? 'Third Person Front View'
          : 'First Person View';
      this.ui.showToast(label);
    }
  }

  updateCameraPosition() {
    const eyePos = this.physics.getEyePosition();
    // Always rebuild the normal player look before deriving an offset. The
    // front-facing third-person camera reverses its render orientation below,
    // so reusing its quaternion on the next frame would make the two camera
    // positions alternate.
    const pitch = Number.isFinite(this.pitch) ? this.pitch : this.camera.rotation.x;
    const yaw = Number.isFinite(this.yaw) ? this.yaw : this.camera.rotation.y;
    this.camera.rotation.set(pitch, yaw, 0, 'YXZ');
    if (this.perspective === 'third_person') {
      const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion);
      this.camera.position.copy(eyePos).addScaledVector(backward, this.thirdPersonDistance);
    } else if (this.perspective === 'third_person_front') {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.camera.position.copy(eyePos).addScaledVector(forward, this.thirdPersonDistance);
      this.camera.lookAt(eyePos);
    } else {
      this.camera.position.copy(eyePos);
    }
  }

  /**
   * Re-seat a mounted player from the vehicle's latest solved transform.
   * Contraption physics runs after PlayerController.update(), so doing this
   * again from the post-physics aim pass prevents the camera from rendering a
   * one-frame-old cockpit pose while a vehicle accelerates or rotates.
   */
  syncDrivenVehiclePose() {
    if (!this.isDriving || !this.drivenContraption) return false;
    const cockpitWorld = this.drivenContraption.getCockpitWorldPosition
      ? this.drivenContraption.getCockpitWorldPosition()
      : this.drivenContraption.position.clone();
    this.physics.position.copy(cockpitWorld);
    this.physics.velocity.set(0, 0, 0);
    return true;
  }

  updateSimulation(dt) {
    if (this.isDriving) this.physics.capturePreviousPosition?.();
    if (!this.syncDrivenVehiclePose()) {
      this.physics.update(dt, this.keys, this.yaw);
    }

    if (this.wrenchGrab?.active && this.wrenchGrab.contraption) {
      const grab = this.wrenchGrab;
      const contraption = grab.contraption;
      if (this.contraptions?.contraptions && !this.contraptions.contraptions.includes(contraption)) {
        this.releaseWrenchGrab();
      } else {
        const { localPoint, targetDistance, bodyId } = grab;
        const body = contraption.getRigidBody?.(bodyId);
        if (!body || body.type !== BodyType.DYNAMIC) {
          this.releaseWrenchGrab();
        } else {
          const eyePos = this.physics?.getEyePosition ? this.physics.getEyePosition() : this.camera.position.clone();
          const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
          const targetPos = eyePos.clone().addScaledVector(lookDir, targetDistance);
          const anchorPos = contraption.entityLocalToWorld
            ? contraption.entityLocalToWorld(bodyId, localPoint.clone())
            : contraption.localToWorld
              ? contraption.localToWorld(localPoint.clone())
              : localPoint.clone().add(contraption.position || new THREE.Vector3());

          this.sceneRenderer?.setWrenchTether?.(eyePos, anchorPos);

          // Treat the wrench as an editor-style velocity constraint instead of
          // a spring force. This deliberately ignores mass so a billion-kilogram
          // body follows just as readily as a single block. Movement still goes
          // through the physics step, preserving terrain sweep/collision checks.
          const safeDt = Math.max(1 / 240, Math.min(0.08, Number(dt) || 0));
          const targetVelocity = targetPos.clone()
            .sub(grab.lastTargetPosition)
            .divideScalar(safeDt);
          if (targetVelocity.length() > 24) targetVelocity.setLength(24);

          const desiredVelocity = targetPos.clone()
            .sub(anchorPos)
            .multiplyScalar(36)
            .add(targetVelocity);
          if (desiredVelocity.length() > 30) desiredVelocity.setLength(30);

          const constrained = this.contraptions?.physics?.constrainWrenchVelocity?.(
            contraption,
            body,
            desiredVelocity,
            safeDt,
            this.contraptions?.contraptions
          );
          const collisionSafeVelocity = constrained?.velocity || desiredVelocity;

          const velocityBlend = 1 - Math.exp(-80 * safeDt);
          body.velocity.lerp(collisionSafeVelocity, velocityBlend);
          for (const normal of constrained?.normals || []) {
            const inwardSpeed = body.velocity.dot(normal);
            if (inwardSpeed < 0) body.velocity.addScaledVector(normal, -inwardSpeed);
          }
          body.angularVelocity.multiplyScalar(Math.exp(-32 * safeDt));
          grab.lastTargetPosition.copy(targetPos);
        }
      }
    } else {
      this.sceneRenderer?.setWrenchTether?.(null, null);
    }
  }

  updateRender() {
    this.processBulkEditFrame();
    this.updateCameraPosition();
  }

  /** Compatibility one-call form used by focused controller tests. The game
   * loop invokes updateSimulation at 20 Hz and updateRender on every RAF. */
  update(dt) {
    this.processBulkEditFrame();
    this.updateSimulation(dt);
    this.updateCameraPosition();
  }

  /**
   * Refresh crosshair picking after all scene kinematics have advanced.
   * Game.animate calls this after ContraptionManager.update so interactions use
   * the latest solved pose before presentation-only interpolation is applied.
   */
  updateAimRaycast() {
    // This pass runs after ContraptionManager.update(), so it is the first
    // point in the frame where the mounted body's final physics pose exists.
    this.syncDrivenVehiclePose();
    this.updateCameraPosition();
    const eyePos = this.physics.getEyePosition();

    // Torus aiming bends the flat camera forward vector through the local frame,
    // raycasts in visible bent space, and maps hits back to flat block coordinates.
    const eyeBent = PlayerController._bentEye.copy(eyePos);
    bendPoint(eyePos.x, eyePos.y, eyePos.z, eyeBent);
    const forwardFlat = PlayerController._forwardFlat
      .set(0, 0, -1)
      .applyQuaternion(this.camera.quaternion);
    const forwardBent = bendDirection(eyePos.x, eyePos.y, eyePos.z, forwardFlat, PlayerController._forwardBent);
    const query = this.performBasicAction({
      domain: ActionDomain.QUERY,
      action: 'raycast',
      origin: eyeBent,
      direction: forwardBent,
      maxDistance: 8,
      space: 'bent',
      include: 'all',
      voxelKinds: ['standard', 'micro']
    });
    this.currentRaycast = query.worldHit || { hit: false };

    // Entity and terrain candidates are resolved by the shared raycast query,
    // using exact bent triangles for the same deformation rendered by the GPU.
    const contraptionHit = query.entityHit;
    const hovered = query.kind === 'entity' ? contraptionHit.contraption : null;
    this.hoveredContraptionHit = hovered ? contraptionHit : null;
    if (this.hoveredContraption !== hovered) {
      if (this.hoveredContraption) {
        this.hoveredContraption.setHighlighted(false);
        if (!this.contraptions.hasChildSelection() || this.contraptions.childSelection?.contraption !== this.hoveredContraption) {
          this.hoveredContraption.clearFocusHighlight();
        }
      }
      this.hoveredContraption = hovered;
    }

    if (this.hoveredContraption) {
      if (this.activeTool === SpecialTool.WRENCH) {
        this.hoveredContraption.setHighlighted(false);
        this.hoveredContraption.clearFocusHighlight();
      } else {
        this.hoveredContraption.setHighlighted(true);
        if (this.hoveredContraptionHit) {
          const hitNodeId = this.canEditEntityInternals(this.hoveredContraption)
            ? this.hoveredContraptionHit.entityId || 'root'
            : 'root';
          if (!this.contraptions.hasChildSelection() || this.contraptions.childSelection?.contraption !== this.hoveredContraption) {
            this.hoveredContraption.setFocusHighlight(hitNodeId);
          }
        }
      }
    }

    this.updateMicroCarvePreview();
    this.updateInventoryPlacementPreview();
  }

  /**
   * Cursor highlight (block focus box). When the shovel targets a 0.2 micro
   * voxel, the operation applies to the whole 1x1x1 standard cell, so the
   * outline stays 1x1x1 instead of shrinking to the micro cell.
   * @returns {null | { pos: {x,y,z}, size: number }}
   */
  getCursorHighlight() {
    const ray = this.currentRaycast;
    if (!ray || !ray.hit) return null;
    if (this.activeTool === SpecialTool.SHOVEL && ray.kind === 'micro' && ray.microPos) {
      return {
        pos: {
          x: Math.floor(ray.microPos.x / 5),
          y: Math.floor(ray.microPos.y / 5),
          z: Math.floor(ray.microPos.z / 5)
        },
        size: 1
      };
    }
    // Selector micro mode (Tab): highlight the exact 0.2 m cell under the
    // crosshair so the selection granularity is visible while aiming.
    if (this.selectorMicroMode && ray.kind && ray.hitPos) {
      const isSelectorTool = this.activeTool === SpecialTool.SELECTOR || this.activeTool === SpecialTool.SUPER_GLUE;
      if (isSelectorTool) {
        const cell = this.selectorMicroCellFromRaycast(ray);
        if (cell) {
          return {
            pos: { x: cell.x * 0.2, y: cell.y * 0.2, z: cell.z * 0.2 },
            size: 0.2
          };
        }
      }
    }
    return { pos: ray.hitPos, size: ray.size || 1 };
  }

  /**
   * Compute the spoon 5x5x5 grid focus preview (same hit priority as clicks):
   * entity hit first, then world ray; standard cell shows the full grid,
   * micro hit additionally highlights the current micro cell.
   */
  updateMicroCarvePreview() {
    this.microCarvePreview = null;
    // Spoon: show 5×5 micro-voxel focus grid.
    // Selector (after a level has been selected): show a 1×1×1 outline on hover to help the user
    // aim their first box-selection corner.
    const isSpoon = this.activeTool === SpecialTool.SPOON;
    const isSelectorTool = this.activeTool === SpecialTool.SELECTOR || this.activeTool === SpecialTool.SUPER_GLUE;
    const selectorActive = isSelectorTool && !!this.selectorRange && !!this.selectorRange.contraption;
    // World 2-point box in progress: cornerA set, cornerB not yet confirmed → live preview.
    const worldBoxPending = isSelectorTool &&
      !!this.contraptions &&
      this.contraptions.selectionCornerA !== null &&
      this.contraptions.selectionCornerB === null;
    this.focusBlockPreview = null;
    this.boxSelectionPreview = null;
    if (!isSpoon && !selectorActive && !worldBoxPending) return;

    if (this.hoveredContraptionHit) {
      const hit = this.hoveredContraptionHit;
      const contraption = hit.contraption;
      const nodeId = hit.entityId || 'root';
      const cellOrigin = contraption.entityLocalToWorld(
        nodeId,
        new THREE.Vector3(hit.cell.x, hit.cell.y, hit.cell.z)
      );
      // Selector: once a level is active, hovering inside the entity shows the 1×1×1 focus
      // outline. After corner 1 is set (box-selection in progress) the outline turns orange and
      // a live AABB preview is drawn. Range corners are stored in node-local space and converted
      // back to world space here so the preview co-moves with rotating/translating components.
      // Hovering a *different* entity shows nothing (a click there switches the level) — and it
      // must never fall through to the spoon micro-voxel grid.
      if (selectorActive) {
        if (this.selectorRange.contraption === contraption) {
          const focusNode = contraption.entityNodes.get(nodeId);
          focusNode?.group?.updateWorldMatrix?.(true, false);
          const focusQuaternion = focusNode?.group
            ?.getWorldQuaternion?.(new THREE.Quaternion()) || new THREE.Quaternion();
          // In micro mode, hovering a 0.2 m block focuses the guide on that
          // block instead of the 1 m standard cell containing it.
          const microTarget = this.selectorMicroMode && hit.block && (hit.block.size || 1) < 1;
          this.focusBlockPreview = microTarget
            ? {
                center: contraption.getBlockWorldCenter(hit.block),
                cellSize: hit.block.size || 0.2,
                active: !!this.selectorRange.pointA,
                quaternion: focusQuaternion
              }
            : {
                center: contraption.entityLocalToWorld(
                  nodeId,
                  new THREE.Vector3(hit.cell.x + 0.5, hit.cell.y + 0.5, hit.cell.z + 0.5)
                ),
                cellSize: 1,
                active: !!this.selectorRange.pointA,
                quaternion: focusQuaternion
              };
          if (this.selectorRange.pointA && !this.selectorRange.pointB && hit.point) {
            const pointA = this.rangePointToPreviewGrid(this.selectorRange, this.selectorRange.pointA);
            const cursor = this.worldPointToRangePreviewGrid(this.selectorRange, hit.point);
            const frame = this.rangePreviewFrame(this.selectorRange);
            if (pointA && cursor && frame) {
              this.boxSelectionPreview = {
                pointA,
                cursor,
                micro: this.selectorMicroMode === true,
                frame
              };
            }
          }
        }
        return;
      }
      // World 2-point box in progress: hovering an entity also shows the live preview
      // (clicking the entity surface confirms cornerB, same as clicking world voxels).
      if (worldBoxPending && hit.point) {
        this.boxSelectionPreview = {
          pointA: this.pendingWorldCornerAMeters(),
          cursor: this.selectorMicroMode
            ? this.microMeterPoint(hit.point)
            : {
                x: Math.floor(hit.point.x),
                y: Math.floor(hit.point.y),
                z: Math.floor(hit.point.z)
              },
          micro: this.selectorMicroMode === true
        };
        return;
      }
      // Only the spoon renders the 5×5 micro-voxel grid.
      if (!isSpoon) return;
      let microCenter = null;
      if (hit.kind === 'micro' && hit.block) {
        microCenter = contraption.getBlockWorldCenter(hit.block);
      }
      this.microCarvePreview = { cellOrigin, microCenter };
      return;
    }

    // Selector (world hit): corner 1 is set — show live AABB preview (re-project corner 1 from
    // node-local to current world space so it follows component movement).
    if (isSelectorTool && this.selectorRange && this.selectorRange.pointA && !this.selectorRange.pointB && this.currentRaycast && this.currentRaycast.hit) {
      const pointA = this.rangePointToPreviewGrid(this.selectorRange, this.selectorRange.pointA);
      if (pointA) {
        // Cursor must use the same quantization the click applies: in micro mode
        // the corner snaps to the 0.2 m surface cell under the crosshair, not to
        // the whole standard cell (hitPos).
        const microCell = this.selectorMicroMode ? this.selectorMicroCellFromRaycast() : null;
        const cursorWorld = microCell
          ? new THREE.Vector3(microCell.x / 5, microCell.y / 5, microCell.z / 5)
          : new THREE.Vector3(this.currentRaycast.hitPos.x, this.currentRaycast.hitPos.y, this.currentRaycast.hitPos.z);
        const cursor = this.worldPointToRangePreviewGrid(this.selectorRange, cursorWorld);
        const frame = this.rangePreviewFrame(this.selectorRange);
        if (cursor && frame) {
          this.boxSelectionPreview = {
            pointA,
            cursor,
            micro: this.selectorMicroMode === true,
            frame
          };
        }
      }
      return;
    }
    // World 2-point box (cornerA/B): cornerA set, cornerB not yet confirmed → rubber-band
    // preview follows the crosshair. A second click on any voxel or entity surface finalises it.
    if (worldBoxPending && this.currentRaycast && this.currentRaycast.hit) {
      const hp = this.currentRaycast.hitPos;
      const microC = this.selectorMicroMode ? this.selectorMicroCellFromRaycast() : null;
      this.boxSelectionPreview = {
        pointA: this.pendingWorldCornerAMeters(),
        cursor: microC
          ? { x: microC.x / 5, y: microC.y / 5, z: microC.z / 5 }
          : { x: Math.floor(hp.x), y: Math.floor(hp.y), z: Math.floor(hp.z) },
        micro: this.selectorMicroMode === true
      };
      return;
    }
    // World hit: only the Spoon shows the micro-voxel grid. The Selector already has its own
    // block cursor overlay so we skip the grid to avoid duplication.
    if (!isSpoon) return;
    const ray = this.currentRaycast;
    if (!ray || !ray.hit) return;
    if (ray.kind === 'micro') {
      const mp = ray.microPos;
      this.microCarvePreview = {
        cellOrigin: new THREE.Vector3(
          Math.floor(mp.x / 5),
          Math.floor(mp.y / 5),
          Math.floor(mp.z / 5)
        ),
        microCenter: isSpoon
          ? new THREE.Vector3((mp.x + 0.5) * 0.2, (mp.y + 0.5) * 0.2, (mp.z + 0.5) * 0.2)
          : null
      };
    } else {
      this.microCarvePreview = {
        cellOrigin: new THREE.Vector3(ray.hitPos.x, ray.hitPos.y, ray.hitPos.z),
        microCenter: null
      };
    }
  }
}
