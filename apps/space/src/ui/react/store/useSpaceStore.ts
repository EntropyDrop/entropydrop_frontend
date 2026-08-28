import { create } from 'zustand';
import { SpecialTool } from '../../../engine/controls/PlayerController.ts';
import { colorToHex, normalizeColor } from '../../../engine/voxel/BlockTypes.ts';

export type SpecialToolType = typeof SpecialTool[keyof typeof SpecialTool];

export interface NearbyEntityItem {
  id: string | number;
  name: string;
  pos: { x: number; y: number; z: number };
  dist: number;
  type: string;
}

export interface ToastItem {
  id: string;
  message: string;
}

export interface SpaceState {
  // Engine handles
  controller: any | null;
  world: any | null;
  contraptions: any | null;
  sceneRenderer: any | null;
  navigationSystem: any | null;

  // Game Lifecycle & Modes
  hasStarted: boolean;
  isPaused: boolean;
  isFlying: boolean;
  activeModal: 'inventory' | 'blueprints' | 'code' | 'settings' | null;

  // Hotbar & Tools
  activeTool: SpecialToolType;
  selectedHotbarIndex: number;
  hotbarSlots: Array<{ value: SpecialToolType; name: string; key: string; desc: string }>;

  // Palette
  selectedColor: number;
  selectedColorIndex: number;
  paletteColors: Array<{ hex: string; name: string }>;

  // Inventory / Backpack
  activeInventoryCategory: 'blockset' | 'entity' | 'colorset';
  selectedInventoryIndex: number;
  inventories: {
    blockset: { items: any[] };
    entity: { items: any[] };
    colorset: { items: any[] };
  };

  // Selector Tool State
  selectorMicroMode: boolean;
  selectorTitle: string;
  selectorDetails: string;
  canAssemble: boolean;
  assembleLabel: string;
  canCopy: boolean;

  // Settings
  fov: number;
  perspective: 'first_person' | 'third_person' | 'third_person_front';
  cameraDistance: number;
  gravity: number;
  renderDistance: number;

  // Code Editor Target
  editingContraption: any | null;

  // Nearby entities for top-left radar
  nearbyEntities: NearbyEntityItem[];

  // Toast notifications
  toasts: ToastItem[];

  // Methods
  setController: (c: any) => void;
  setWorld: (w: any) => void;
  setContraptions: (cm: any) => void;
  setSceneRenderer: (sr: any) => void;
  setNavigationSystem: (ns: any) => void;

  setGameStarted: (started: boolean) => void;
  toggleModal: (modal: 'inventory' | 'blueprints' | 'code' | 'settings' | null, force?: boolean) => void;
  closeAllModals: () => void;

  selectHotbarSlot: (index: number) => void;
  setBuildColor: (val: string | number) => void;
  selectInventoryCategory: (cat: 'blockset' | 'entity') => void;
  selectInventorySlot: (index: number) => void;
  setSelectorMicroMode: (micro: boolean) => void;

  setSettings: (settings: Partial<Pick<SpaceState, 'fov' | 'perspective' | 'cameraDistance' | 'gravity' | 'renderDistance'>>) => void;
  setEditingContraption: (contraption: any) => void;
  setNearbyEntities: (entities: NearbyEntityItem[]) => void;
  showToast: (message: string) => void;
  removeToast: (id: string) => void;

  syncFromEngine: (state: Partial<SpaceState>) => void;
}

const DEFAULT_PALETTE_COLORS = [
  { hex: '#A8B0B8', name: 'Alloy' },
  { hex: '#7A889B', name: 'Slate' },
  { hex: '#D8B838', name: 'Gold' },
  { hex: '#C86828', name: 'Rust' },
  { hex: '#A03828', name: 'Brick' },
  { hex: '#388850', name: 'Moss' },
  { hex: '#2868A0', name: 'Cobalt' },
  { hex: '#181C24', name: 'Carbon' },
  { hex: '#E8ECEF', name: 'Frost' }
];

const DEFAULT_HOTBAR_SLOTS = [
  { value: SpecialTool.SHOVEL, name: 'Shovel', key: '1', desc: 'LMB dig · RMB place 1m' },
  { value: SpecialTool.SPOON, name: 'Spoon', key: '2', desc: 'Micro-carve 5×5×5' },
  { value: SpecialTool.BRUSH, name: 'Brush', key: '3', desc: 'Paint / sample color' },
  { value: SpecialTool.SELECTOR, name: 'Selector', key: '4', desc: 'Box / Component selector' },
  { value: SpecialTool.HAMMER, name: 'Hammer', key: '5', desc: 'Construct block set / entity' },
  { value: SpecialTool.WRENCH, name: 'Wrench', key: '6', desc: 'Drag / toggle entity physics' }
];

export const useSpaceStore = create<SpaceState>((set, get) => ({
  controller: null,
  world: null,
  contraptions: null,
  sceneRenderer: null,
  navigationSystem: null,

  hasStarted: false,
  isPaused: true,
  isFlying: false,
  activeModal: null,

  activeTool: SpecialTool.SHOVEL,
  selectedHotbarIndex: 0,
  hotbarSlots: DEFAULT_HOTBAR_SLOTS,

  selectedColor: 0xa8b0b8,
  selectedColorIndex: 0,
  paletteColors: DEFAULT_PALETTE_COLORS,

  activeInventoryCategory: 'blockset',
  selectedInventoryIndex: 0,
  inventories: {
    blockset: { items: [] },
    entity: { items: [] },
    colorset: { items: [] }
  },

  selectorMicroMode: false,
  selectorTitle: 'Selector',
  selectorDetails: 'Click to select an entity or drag 2 points in world',
  canAssemble: false,
  assembleLabel: 'Assemble (G)',
  canCopy: false,

  fov: 75,
  perspective: 'first_person',
  cameraDistance: 5,
  gravity: 28,
  renderDistance: 12,

  editingContraption: null,
  nearbyEntities: [],
  toasts: [],

  setController: (controller) => set({ controller }),
  setWorld: (world) => set({ world }),
  setContraptions: (contraptions) => set({ contraptions }),
  setSceneRenderer: (sceneRenderer) => set({ sceneRenderer }),
  setNavigationSystem: (navigationSystem) => set({ navigationSystem }),

  setGameStarted: (hasStarted) => {
    set({ hasStarted, isPaused: false });
    const { controller } = get();
    if (hasStarted && controller) {
      controller.requestLock?.();
    }
  },

  toggleModal: (modal, force) => {
    const current = get().activeModal;
    const nextModal = force !== undefined ? (force ? modal : null) : (current === modal ? null : modal);
    set({ activeModal: nextModal });
    const { controller } = get();
    if (nextModal) {
      controller?.unlock?.();
    } else {
      if (get().hasStarted) {
        controller?.requestLock?.();
      }
    }
  },

  closeAllModals: () => {
    set({ activeModal: null });
    const { controller, hasStarted } = get();
    if (hasStarted) {
      controller?.requestLock?.();
    }
  },

  selectHotbarSlot: (index) => {
    const slots = get().hotbarSlots;
    if (index < 0 || index >= slots.length) return;
    const slot = slots[index];
    const { controller } = get();

    if (controller) {
      const prevTool = controller.activeTool;
      if ((prevTool === SpecialTool.SELECTOR || prevTool === SpecialTool.SUPER_GLUE) &&
          (slot.value !== SpecialTool.SELECTOR && slot.value !== SpecialTool.SUPER_GLUE)) {
        controller.clearSelection?.();
      }
      controller.activeTool = slot.value;
      controller.selectedBlock = null;
    }

    set({
      selectedHotbarIndex: index,
      activeTool: slot.value
    });

    get().showToast(`Tool [${index + 1}]: ${slot.name} - ${slot.desc}`);
  },

  setBuildColor: (val) => {
    const col = normalizeColor(val);
    const hex = colorToHex(col);
    const { controller, paletteColors } = get();
    if (controller) controller.selectedColor = col;

    const hexLower = hex.toLowerCase();
    const presetIdx = paletteColors.findIndex(p => p.hex.toLowerCase() === hexLower);

    set({
      selectedColor: col,
      selectedColorIndex: presetIdx >= 0 ? presetIdx : get().selectedColorIndex
    });

    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--build-color', hex);
    }
  },

  selectInventoryCategory: (category) => {
    const { controller } = get();
    if (controller) {
      controller.setActiveInventoryCategory?.(category);
    }
    set({ activeInventoryCategory: category });
  },

  selectInventorySlot: (index) => {
    const { controller } = get();
    if (controller) {
      controller.selectedInventoryIndex = index;
    }
    set({ selectedInventoryIndex: index });
  },

  setSelectorMicroMode: (micro) => {
    const { controller } = get();
    if (controller) {
      controller.selectorMicroMode = micro;
    }
    set({ selectorMicroMode: micro });
  },

  setSettings: (partial) => {
    const { controller } = get();
    if (partial.fov !== undefined && controller) {
      controller.setFov?.(partial.fov);
    }
    if (partial.perspective !== undefined && controller) {
      controller.setPerspective?.(partial.perspective);
    }
    if (partial.cameraDistance !== undefined && controller) {
      controller.setCameraDistance?.(partial.cameraDistance);
    }
    set(partial);
  },

  setEditingContraption: (editingContraption) => set({ editingContraption }),
  setNearbyEntities: (nearbyEntities) => set({ nearbyEntities }),

  showToast: (message) => {
    const id = Math.random().toString(36).slice(2, 9);
    set((state) => ({ toasts: [...state.toasts, { id, message }] }));
    setTimeout(() => {
      get().removeToast(id);
    }, 2800);
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }));
  },

  syncFromEngine: (state) => set(state)
}));
