import * as THREE from 'three';
import { colorToHex, normalizeColor, PRESET_COLORS } from '../engine/voxel/BlockTypes.ts';
import { MAX_INVENTORY_IMPORT_BYTES, SpecialTool } from '../engine/controls/PlayerController.ts';
import { ContraptionMode } from '../engine/contraption/Contraption.ts';
import { BLUEPRINTS, spawnBlueprintInWorld } from '../engine/contraption/Blueprints.ts';
import { loadAgentConfig, saveAgentConfig, runAgentTurn } from '../engine/contraption/AgentChat.ts';
import { MAX_STL_FILE_BYTES } from '../engine/voxel/STLVoxelizer.ts';
import { ActionDomain } from '../engine/actions/BasicActions.ts';
import { TORUS_SIZE_X, TORUS_SIZE_Z, wrapX, wrapZ } from '../engine/torus/TorusWorld.ts';

const TOOL_PIXEL_ICONS: Record<string, string> = {
  [SpecialTool.SHOVEL]: '',
  [SpecialTool.SPOON]: '',
  [SpecialTool.BRUSH]: '',
  [SpecialTool.SELECTOR]: `<svg class="slot-pixel-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 3h6v2H5v4H3V3zm12 0h6v6h-2V5h-4V3zM3 15h2v4h4v2H3v-6zm18 0v6h-6v-2h4v-4h2zM9 9h6v6H9V9zm2 2v2h2v-2h-2z"/></svg>`,
  [SpecialTool.HAMMER]: '',
  [SpecialTool.WRENCH]: ''
};

export class UIManager {
  controller: any = null;
  world: any = null;
  contraptions: any = null;
  sceneRenderer: any = null;

  // Geometry tools. Color is selected independently and applies at both scales.
  hotbarSlots: any[] = [];
  selectedHotbarIndex: number = 0;
  selectedColorIndex: number = 0;
  paletteColors: { hex: string; name: string }[] = [];

  // Currently edited contraption in code editor
  editingContraption: any = null;

  // DOM Elements
  fpsVal: HTMLElement | null = null;
  pingVal: HTMLElement | null = null;
  posVal: HTMLElement | null = null;
  targetVal: HTMLElement | null = null;

  // Nearby Entities DOM & State
  entitiesSection: HTMLElement | null = null;
  entitiesCount: HTMLElement | null = null;
  entitiesToggle: HTMLElement | null = null;
  entitiesToggleBtn: HTMLElement | null = null;
  entitiesBody: HTMLElement | null = null;
  entitiesList: HTMLElement | null = null;
  entitiesPagination: HTMLElement | null = null;
  entitiesPrevBtn: HTMLButtonElement | null = null;
  entitiesNextBtn: HTMLButtonElement | null = null;
  entitiesPageInfo: HTMLElement | null = null;
  entitiesListExpanded: boolean = false;
  entitiesCurrentPage: number = 1;
  entitiesPageSize: number = 3;
  cachedEntities: any[] = [];
  lastEntitiesRenderAt: number = 0;
  remotePlayers: any[] = [];
  navigationSystem: any = null;

  hotbarContainer: HTMLElement | null = null;
  pauseScreen: HTMLElement | null = null;
  hasStarted: boolean = false;
  startBtn: HTMLElement | null = null;
  inventoryModal: HTMLElement | null = null;
  inventoryGrid: HTMLElement | null = null;
  blueprintsModal: HTMLElement | null = null;
  blueprintsGrid: HTMLElement | null = null;
  selectionBanner: HTMLElement | null = null;
  selectionTitle: Element | null = null;
  selectionDetails: HTMLElement | null = null;
  selectorPanelWrapper: HTMLElement | null = null;
  selectorPanelTitle: HTMLElement | null = null;
  selectorPanelDetails: HTMLElement | null = null;
  selectorModeBadge: HTMLElement | null = null;
  selectorModeToggle: HTMLElement | null = null;
  assembleBtn: HTMLButtonElement | null = null;
  copyBtn: HTMLButtonElement | null = null;
  copyEntBtn: HTMLButtonElement | null = null;
  copyBlocksetBtn: HTMLButtonElement | null = null;
  clearSelBtn: HTMLElement | null = null;
  toast: HTMLElement | null = null;
  colorPicker: HTMLInputElement | null = null;
  colorHex: HTMLElement | null = null;
  colorPaletteBar: HTMLElement | null = null;

  // Global Settings DOM
  globalSettingsModal: HTMLElement | null = null;
  globalSettingsBtn: HTMLElement | null = null;
  closeGlobalSettingsBtn: HTMLElement | null = null;
  settingFovSlider: HTMLInputElement | null = null;
  settingFovVal: HTMLElement | null = null;
  settingPerspectiveGroup: HTMLElement | null = null;
  settingCamDistSlider: HTMLInputElement | null = null;
  settingCamDistVal: HTMLElement | null = null;
  settingGravityGroup: HTMLElement | null = null;
  settingRenderDistSlider: HTMLInputElement | null = null;
  settingRenderDistVal: HTMLElement | null = null;

  // Code Editor DOM
  codeEditorModal: HTMLElement | null = null;
  scriptTextarea: HTMLTextAreaElement | null = null;
  globalPlaybackGroup: HTMLElement | null = null;
  globalPlaybackState: string = 'play'; // 'play' | 'pause' | 'stop' - last global radio action
  runScriptBtn: HTMLElement | null = null;
  closeCodeBtn: HTMLElement | null = null;
  editorEntityId: HTMLElement | null = null;
  editorContraptionTag: HTMLElement | null = null;
  editorStatusBadge: HTMLElement | null = null;
  editorExecTime: HTMLElement | null = null;
  apiDocsBtn: HTMLElement | null = null;
  apiDocsModal: HTMLElement | null = null;
  apiDocsBody: HTMLElement | null = null;

  // AI Assistant Chat (conversational programming)
  agentChatBox: HTMLElement | null = null;
  agentChatInput: HTMLInputElement | null = null;
  agentChatSendBtn: HTMLButtonElement | null = null;
  agentClearBtn: HTMLElement | null = null;
  agentSettingsBtn: HTMLElement | null = null;
  agentSetupAccordion: HTMLElement | null = null;
  agentApiBase: HTMLInputElement | null = null;
  agentApiKey: HTMLInputElement | null = null;
  agentApiModel: HTMLInputElement | null = null;
  agentContextLength: HTMLInputElement | null = null;
  agentMaxTokens: HTMLInputElement | null = null;
  agentConfigSaveBtn: HTMLElement | null = null;
  agentMessages: any[] = [];
  agentConfig: any = null;
  agentBusy: boolean = false;
  entityPreviewCanvas: HTMLElement | null = null;

  // Component Hierarchy Tree & Inspector DOM
  componentTreePanel: HTMLElement | null = null;
  componentTreeList: HTMLElement | null = null;
  componentTreeCount: HTMLElement | null = null;
  componentInspectorPanel: HTMLElement | null = null;
  componentInspectorId: HTMLElement | null = null;
  propNodeName: HTMLInputElement | null = null;
  propRenameBtn: HTMLElement | null = null;
  propNodeKind: HTMLElement | null = null;
  propNodeParent: HTMLElement | null = null;
  propBodyType: HTMLSelectElement | null = null;
  propRestitution: HTMLInputElement | null = null;
  propMass: HTMLInputElement | null = null;
  propNodeConstraints: HTMLElement | null = null;
  propNodeBlocks: HTMLElement | null = null;
  propNodeVolume: HTMLElement | null = null;
  propNodePivot: HTMLElement | null = null;
  propNodePos: HTMLElement | null = null;
  propNodeRot: HTMLElement | null = null;
  codeTabBar: HTMLElement | null = null;
  codeTargetHint: HTMLElement | null = null;
  codeApiHint: HTMLElement | null = null;
  selectedComponentNodeId: string = 'root';

  // Telemetry Elements
  teleGroundDist: HTMLElement | null = null;
  teleAltitude: HTMLElement | null = null;
  teleSpeed: HTMLElement | null = null;
  teleMass: HTMLElement | null = null;
  telePower: HTMLElement | null = null;
  telePowerFill: HTMLElement | null = null;
  teleConsoleLogs: HTMLElement | null = null;
  toastTimer: any = null;

  constructor() {
    this.controller = null;
    this.world = null;
    this.contraptions = null;
    this.sceneRenderer = null;

    // Geometry tools. Color is selected independently and applies at both scales.
    this.hotbarSlots = [
      { type: 'tool', value: SpecialTool.SHOVEL, name: 'Shovel', icon: '', desc: 'Remove / place 1x1x1 standard blocks' },
      { type: 'tool', value: SpecialTool.SPOON, name: 'Spoon', icon: '', desc: 'Carve 5x5x5 micro voxels cell by cell' },
      { type: 'tool', value: SpecialTool.BRUSH, name: 'Brush', icon: '', desc: 'Left-click paint · right-click sample color' },
      { type: 'tool', value: SpecialTool.SELECTOR, name: 'Selector', icon: '', desc: 'Select and copy world/entity regions (max 64×64×64); no build action' },
      { type: 'tool', value: SpecialTool.HAMMER, name: 'Hammer', icon: '', desc: 'Preview and left-click build inventory items' },
      { type: 'tool', value: SpecialTool.WRENCH, name: 'Wrench', icon: '', desc: 'Left-click drag force · right-click start/stop' }
    ];
    this.selectedHotbarIndex = 0;
    this.selectedColorIndex = 0;
    this.paletteColors = PRESET_COLORS.map(p => ({ hex: p.hex, name: p.name }));
    try {
      const savedPalette = localStorage.getItem('space_palette_colors');
      if (savedPalette) {
        const parsed = JSON.parse(savedPalette);
        if (Array.isArray(parsed) && parsed.length >= 9) {
          this.paletteColors = parsed.slice(0, 9).map((p: any) => ({
            hex: colorToHex(normalizeColor(p.hex || p)),
            name: p.name || 'Custom'
          }));
        }
      }
    } catch {}

    // Currently edited contraption in code editor
    this.editingContraption = null;

    // DOM Elements
    this.fpsVal = document.getElementById('fps-val');
    this.pingVal = document.getElementById('ping-val');
    this.posVal = document.getElementById('pos-val');
    this.targetVal = document.getElementById('target-val');

    // Nearby Entities DOM
    this.entitiesSection = document.getElementById('hud-entities-section');
    this.entitiesCount = document.getElementById('hud-entities-count');
    this.entitiesToggle = document.getElementById('hud-entities-toggle');
    this.entitiesToggleBtn = document.getElementById('hud-entities-toggle-btn');
    this.entitiesBody = document.getElementById('hud-entities-body');
    this.entitiesList = document.getElementById('hud-entities-list');
    this.entitiesPagination = document.getElementById('hud-entities-pagination');
    this.entitiesPrevBtn = document.getElementById('hud-entities-prev-btn') as HTMLButtonElement | null;
    this.entitiesNextBtn = document.getElementById('hud-entities-next-btn') as HTMLButtonElement | null;
    this.entitiesPageInfo = document.getElementById('hud-entities-page-info');

    this.hotbarContainer = document.getElementById('hotbar');
    this.pauseScreen = document.getElementById('pause-screen');
    this.hasStarted = false;
    this.startBtn = document.getElementById('start-btn');
    this.inventoryModal = document.getElementById('inventory-modal');
    this.inventoryGrid = document.getElementById('inventory-grid');
    this.blueprintsModal = document.getElementById('blueprints-modal');
    this.selectorPanelWrapper = document.getElementById('selector-panel-wrapper');
    this.selectorPanelTitle = document.getElementById('selector-panel-title');
    this.selectorPanelDetails = document.getElementById('selector-panel-details');
    this.selectorModeBadge = document.getElementById('selector-mode-badge');
    this.selectorModeToggle = document.getElementById('selector-mode-toggle');
    this.selectionBanner = this.selectorPanelWrapper || document.getElementById('selection-banner');
    this.selectionTitle = this.selectorPanelTitle || this.selectionBanner?.querySelector('.banner-title') || null;
    this.selectionDetails = this.selectorPanelDetails || document.getElementById('selection-details');
    this.assembleBtn = document.getElementById('assemble-btn') as HTMLButtonElement | null;
    this.copyBtn = (document.getElementById('copy-btn') || document.getElementById('copy-ent-btn')) as HTMLButtonElement | null;
    this.copyEntBtn = this.copyBtn;
    this.copyBlocksetBtn = (document.getElementById('copy-blockset-btn') || this.copyBtn) as HTMLButtonElement | null;
    this.clearSelBtn = document.getElementById('clear-sel-btn');
    this.toast = document.getElementById('toast');
    this.colorPicker = document.getElementById('block-color-picker') as HTMLInputElement | null;
    this.colorHex = document.getElementById('block-color-hex');
    this.colorPaletteBar = document.getElementById('color-palette-bar');

    // Global Settings DOM
    this.globalSettingsModal = document.getElementById('global-settings-modal');
    this.globalSettingsBtn = document.getElementById('global-settings-btn');
    this.closeGlobalSettingsBtn = document.getElementById('close-global-settings-btn');
    this.settingFovSlider = document.getElementById('setting-fov-slider') as HTMLInputElement | null;
    this.settingFovVal = document.getElementById('setting-fov-val');
    this.settingPerspectiveGroup = document.getElementById('setting-perspective-group');
    this.settingCamDistSlider = document.getElementById('setting-cam-dist-slider') as HTMLInputElement | null;
    this.settingCamDistVal = document.getElementById('setting-cam-dist-val');
    this.settingGravityGroup = document.getElementById('setting-gravity-group');
    this.settingRenderDistSlider = document.getElementById('setting-render-dist-slider') as HTMLInputElement | null;
    this.settingRenderDistVal = document.getElementById('setting-render-dist-val');

    // Code Editor DOM
    this.codeEditorModal = document.getElementById('code-editor-modal');
    this.scriptTextarea = document.getElementById('script-textarea') as HTMLTextAreaElement | null;
    this.globalPlaybackGroup = document.getElementById('global-playback-group');
    this.globalPlaybackState = 'play'; // 'play' | 'pause' | 'stop' - last global radio action
    this.runScriptBtn = document.getElementById('run-script-btn');
    this.closeCodeBtn = document.getElementById('close-code-btn');
    this.apiDocsBtn = document.getElementById('api-docs-btn');
    this.apiDocsModal = document.getElementById('api-docs-modal');
    this.apiDocsBody = document.getElementById('api-docs-body');
    this.editorEntityId = document.getElementById('editor-entity-id');
    this.editorContraptionTag = document.getElementById('editor-contraption-tag');
    this.editorStatusBadge = document.getElementById('editor-status-badge');
    this.editorExecTime = document.getElementById('editor-exec-time');

    // AI Assistant Chat (conversational programming)
    this.agentChatBox = document.getElementById('agent-chat-box');
    this.agentChatInput = document.getElementById('agent-chat-input') as HTMLInputElement | null;
    this.agentChatSendBtn = document.getElementById('agent-chat-send-btn') as HTMLButtonElement | null;
    this.agentClearBtn = document.getElementById('agent-clear-btn');
    this.agentSettingsBtn = document.getElementById('agent-settings-btn');
    this.agentSetupAccordion = document.getElementById('agent-setup-accordion');
    this.agentApiBase = document.getElementById('agent-api-base') as HTMLInputElement | null;
    this.agentApiKey = document.getElementById('agent-api-key') as HTMLInputElement | null;
    this.agentApiModel = document.getElementById('agent-api-model') as HTMLInputElement | null;
    this.agentContextLength = document.getElementById('agent-context-length') as HTMLInputElement | null;
    this.agentMaxTokens = document.getElementById('agent-max-tokens') as HTMLInputElement | null;
    this.agentConfigSaveBtn = document.getElementById('agent-config-save-btn');
    this.agentMessages = [];
    this.agentConfig = loadAgentConfig();
    this.agentBusy = false;
    this.entityPreviewCanvas = document.getElementById('entity-preview-canvas');

    // Component Hierarchy Tree & Inspector DOM
    this.componentTreePanel = document.getElementById('component-tree-panel');
    this.componentTreeList = document.getElementById('component-tree-list');
    this.componentTreeCount = document.getElementById('component-tree-count');
    this.componentInspectorPanel = document.getElementById('component-inspector-panel');
    this.componentInspectorId = document.getElementById('component-inspector-id');
    this.propNodeName = document.getElementById('prop-node-name') as HTMLInputElement | null;
    this.propRenameBtn = document.getElementById('prop-rename-btn');
    this.propNodeKind = document.getElementById('prop-node-kind');
    this.propNodeParent = document.getElementById('prop-node-parent');
    this.propBodyType = document.getElementById('prop-body-type') as HTMLSelectElement | null;
    this.propRestitution = document.getElementById('prop-restitution') as HTMLInputElement | null;
    this.propMass = document.getElementById('prop-mass') as HTMLInputElement | null;
    this.propNodeConstraints = document.getElementById('prop-node-constraints');
    this.propNodeBlocks = document.getElementById('prop-node-blocks');
    this.propNodeVolume = document.getElementById('prop-node-volume');
    this.propNodePivot = document.getElementById('prop-node-pivot');
    this.propNodePos = document.getElementById('prop-node-pos');
    this.propNodeRot = document.getElementById('prop-node-rot');
    this.codeTabBar = document.getElementById('code-tab-bar');
    this.codeTargetHint = document.getElementById('code-target-hint');
    this.codeApiHint = document.getElementById('code-api-hint');
    this.selectedComponentNodeId = 'root';

    // Telemetry Elements
    this.teleGroundDist = document.getElementById('tele-ground-dist');
    this.teleAltitude = document.getElementById('tele-altitude');
    this.teleSpeed = document.getElementById('tele-speed');
    this.teleMass = document.getElementById('tele-mass');
    this.telePower = document.getElementById('tele-power');
    this.telePowerFill = document.getElementById('tele-power-fill');
    this.teleConsoleLogs = document.getElementById('tele-console-logs');

    this.setupDOM();
  }

  setController(controller) {
    this.controller = controller;
    this.setBuildColor(this.paletteColors[0]?.hex || '#f2a93b');
    this.applyActiveSlot();
    this.renderInventory();
    this.renderInventoryBar();

    try {
      const savedFov = localStorage.getItem('space_setting_fov');
      if (savedFov && this.controller) this.controller.setFov(Number(savedFov));
      const savedPerspective = localStorage.getItem('space_setting_perspective');
      if (savedPerspective && this.controller) this.controller.setPerspective(savedPerspective as any);
      const savedDist = localStorage.getItem('space_setting_cam_dist');
      if (savedDist && this.controller) this.controller.setThirdPersonDistance(Number(savedDist));
    } catch {}
    this.syncSettingsUI();
  }

  setWorld(world) {
    this.world = world;
    try {
      const savedDist = localStorage.getItem('space_setting_render_dist');
      if (savedDist && this.world) this.world.setRenderDistance(Number(savedDist));
    } catch {}
    this.syncSettingsUI();
  }

  setContraptions(contraptionManager) {
    this.contraptions = contraptionManager;
  }

  setRemotePlayers(players: any[]) {
    this.remotePlayers = players || [];
  }

  setNavigationSystem(navigationSystem: any) {
    this.navigationSystem = navigationSystem;
  }

  setSceneRenderer(sceneRenderer) {
    this.sceneRenderer = sceneRenderer;
    this.sceneRenderer?.setEntityPreviewCanvas(this.entityPreviewCanvas);
    if (this.sceneRenderer) {
      this.sceneRenderer.onEntityPreviewNodeSelect = (nodeId) => {
        this.selectComponentTreeNode(nodeId);
      };
    }
  }

  setupDOM() {
    this.renderHotbar();
    this.renderColorPaletteBar();
    this.renderInventory();
    this.renderBlueprints();
    this.updateToolPanelMode();

    const onColorChange = (event) => this.setBuildColor(event.target.value);
    this.colorPicker?.addEventListener('input', onColorChange);
    this.colorPicker?.addEventListener('change', onColorChange);

    if (this.startBtn) {
      this.startBtn.addEventListener('click', () => {
        this.hasStarted = true;
        if (this.pauseScreen) this.pauseScreen.classList.add('hidden');
        if (this.controller) this.controller.requestLock();
      });
    }

    // Clicking canvas when unlocked re-locks pointer and resumes game
    const canvasContainer = document.getElementById('canvas-container');
    canvasContainer?.addEventListener('click', () => {
      if (this.hasStarted && !this.hasAnyModalOpen() && this.controller && !this.controller.isLocked) {
        this.controller.requestLock();
      }
    });

    // Top action buttons
    document.getElementById('code-terminal-toggle')?.addEventListener('click', () => {
      if (this.controller) this.controller.openCodeEditorForTarget();
    });
    document.getElementById('inv-toggle')?.addEventListener('click', () => this.toggleInventoryModal());
    document.getElementById('blueprints-toggle')?.addEventListener('click', () => this.toggleBlueprintsModal());
    document.getElementById('fly-toggle')?.addEventListener('click', () => {
      if (this.controller) {
        this.controller.physics.isFlying = !this.controller.physics.isFlying;
        this.showToast(this.controller.physics.isFlying ? '> FLY MODE ON' : 'FLY MODE OFF');
      }
    });

    document.getElementById('close-inv-btn')?.addEventListener('click', () => this.toggleInventoryModal(false));
    document.getElementById('close-blueprints-btn')?.addEventListener('click', () => this.toggleBlueprintsModal(false));
    this.closeCodeBtn?.addEventListener('click', () => this.toggleCodeEditorModal(false));

    // Nearby Entities Dropdown & Navigation Events
    this.entitiesToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleEntitiesList();
    });
    this.entitiesPrevBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.entitiesCurrentPage > 1) {
        this.entitiesCurrentPage--;
        this.renderEntitiesList(true);
      }
    });
    this.entitiesNextBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const totalPages = Math.max(1, Math.ceil(this.cachedEntities.length / this.entitiesPageSize));
      if (this.entitiesCurrentPage < totalPages) {
        this.entitiesCurrentPage++;
        this.renderEntitiesList(true);
      }
    });
    this.entitiesList?.addEventListener('click', (e) => {
      const navBtn = (e.target as HTMLElement)?.closest('.hud-entity-nav-btn') as HTMLElement | null;
      if (!navBtn) return;
      e.stopPropagation();
      const x = parseFloat(navBtn.dataset.x || '0');
      const y = parseFloat(navBtn.dataset.y || '20');
      const z = parseFloat(navBtn.dataset.z || '0');
      const name = navBtn.dataset.name || 'Entity';
      if (this.navigationSystem) {
        const flightY = Math.max(y + 1.5, 20);
        this.navigationSystem.startNavigation(x, flightY, z);
        this.showToast(`Auto Pilot Engaged: ${name} (${x.toFixed(0)}, ${flightY.toFixed(0)}, ${z.toFixed(0)})`);
      }
    });

    // Global Settings Modal
    this.globalSettingsBtn?.addEventListener('click', () => this.toggleGlobalSettingsModal());
    this.closeGlobalSettingsBtn?.addEventListener('click', () => this.toggleGlobalSettingsModal(false));
    this.globalSettingsModal?.addEventListener('click', (e) => {
      if (e.target === this.globalSettingsModal) this.toggleGlobalSettingsModal(false);
    });

    this.settingFovSlider?.addEventListener('input', (e: any) => {
      const fov = Number(e.target.value);
      if (this.controller) this.controller.setFov(fov);
      if (this.settingFovVal) this.settingFovVal.textContent = `${fov}°`;
      try { localStorage.setItem('space_setting_fov', String(fov)); } catch {}
    });

    this.settingPerspectiveGroup?.querySelectorAll('.segment-btn').forEach((btn: any) => {
      btn.addEventListener('click', () => {
        const perspective = btn.dataset.perspective;
        if (this.controller) this.controller.setPerspective(perspective);
        this.syncSettingsUI();
        try { localStorage.setItem('space_setting_perspective', perspective); } catch {}
      });
    });

    this.settingCamDistSlider?.addEventListener('input', (e: any) => {
      const dist = Number(e.target.value);
      if (this.controller) this.controller.setThirdPersonDistance(dist);
      if (this.settingCamDistVal) this.settingCamDistVal.textContent = `${dist.toFixed(1)} m`;
      try { localStorage.setItem('space_setting_cam_dist', String(dist)); } catch {}
    });

    this.settingGravityGroup?.querySelectorAll('.segment-btn').forEach((btn: any) => {
      btn.addEventListener('click', () => {
        const grav = Number(btn.dataset.gravity);
        const game = (window as any).game;
        if (game?.contraptionPhysics?.gravity) {
          game.contraptionPhysics.gravity.y = grav;
        }
        this.settingGravityGroup?.querySelectorAll('.segment-btn').forEach((b: any) => {
          b.classList.toggle('active', b === btn);
        });
        this.showToast(`Gravity set to ${grav} m/s²`);
      });
    });

    this.settingRenderDistSlider?.addEventListener('input', (e: any) => {
      const dist = Number(e.target.value);
      if (this.world) this.world.setRenderDistance(dist);
      if (this.settingRenderDistVal) this.settingRenderDistVal.textContent = `${dist} Chunks`;
      try { localStorage.setItem('space_setting_render_dist', String(dist)); } catch {}
    });

    // Script API Reference docs (entry lives in the code editor header)
    this.apiDocsBtn?.addEventListener('click', () => this.toggleApiDocs(true));
    document.getElementById('close-api-docs-btn')?.addEventListener('click', () => this.toggleApiDocs(false));
    this.apiDocsModal?.addEventListener('click', (e) => {
      // Backdrop click closes only the docs, keeping the code editor open
      if (e.target === this.apiDocsModal) this.toggleApiDocs(false);
    });

    // Selection Actions
    this.assembleBtn?.addEventListener('click', () => {
      if (this.controller) {
        this.controller.assembleSelection(ContraptionMode.PROGRAMMABLE);
      }
    });

    this.copyBtn?.addEventListener('click', () => {
      if (this.controller) {
        if (typeof this.controller.copySelectionSmart === 'function') {
          this.controller.copySelectionSmart();
        } else {
          this.controller.copySelectionToInventory();
        }
      }
    });

    this.clearSelBtn?.addEventListener('click', () => {
      this.controller?.clearSelection?.();
      this.showToast('Selection cleared');
    });

    this.selectorModeToggle?.addEventListener('click', () => {
      this.controller?.toggleSelectorMicroMode();
    });

    // Code Editor Actions
    this.editorEntityId?.addEventListener('click', async () => {
      const text = this.editorEntityId?.textContent?.replace(/^ID:\s*/, '') || '';
      if (!text) return;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        }
        this.showToast(`Entity ID copied: ${text}`);
      } catch (e) {}
    });

    this.runScriptBtn?.addEventListener('click', () => {
      this.applyAndRunScript();
    });

    // Global play / pause / stop radio group (stop = pause + reset state)
    this.globalPlaybackGroup?.querySelectorAll('input[type="radio"]').forEach((radio: HTMLInputElement) => {
      radio.addEventListener('change', () => {
        if (!radio.checked || !this.editingContraption) return;
        const contraption = this.editingContraption;
        const action = radio.value === 'play'
          ? 'start-scripts'
          : radio.value === 'pause'
            ? 'pause-scripts'
            : 'stop-scripts';
        this.contraptions?.performBasicAction?.({
          domain: ActionDomain.ENTITY,
          action,
          target: { contraption }
        });
        this.globalPlaybackState = radio.value;
        this.renderComponentTree(contraption);
        this.renderCodeTabs(contraption);
        this.updateInspectorProperties(this.selectedComponentNodeId || 'root');
        this.sceneRenderer?.renderEntityPreview(contraption);
        const messages = {
          play: '> PLAY: all component scripts running',
          pause: 'PAUSED: all component scripts stopped',
          stop: 'STOPPED: all scripts off and state reset (state/clock/transforms/forces)'
        };
        this.showToast(messages[radio.value]);
      });
    });

    // AI assistant chat
    this.agentChatSendBtn?.addEventListener('click', () => this.sendAgentMessage());
    this.agentChatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.sendAgentMessage();
      }
    });
    this.agentClearBtn?.addEventListener('click', () => {
      this.clearAgentChat();
    });
    this.agentSettingsBtn?.addEventListener('click', () => {
      this.toggleAgentSetup();
    });
    this.agentConfigSaveBtn?.addEventListener('click', () => {
      const contextK = parseFloat(this.agentContextLength?.value || '32');
      const maxOutputK = parseFloat(this.agentMaxTokens?.value || '4');
      const config = {
        baseUrl: this.agentApiBase?.value?.trim() || 'https://api.openai.com/v1',
        apiKey: this.agentApiKey?.value?.trim() || '',
        model: this.agentApiModel?.value?.trim() || 'gpt-4o-mini',
        contextKTokens: isNaN(contextK) ? 32 : Math.max(1, Math.min(2048, contextK)),
        maxOutputKTokens: isNaN(maxOutputK) ? 4 : Math.max(0.1, Math.min(128, maxOutputK))
      };
      this.agentConfig = config;
      saveAgentConfig(config);
      let endpointLabel = config.baseUrl;
      try { endpointLabel = new URL(config.baseUrl).origin; } catch (_) {}
      this.showToast(config.apiKey
        ? `Model config saved for ${endpointLabel} (${config.model}, ctx=${config.contextKTokens}k, max=${config.maxOutputKTokens}k)`
        : 'Saved (no key - local compiler will be used)');
      this.toggleAgentSetup(false);
    });

    this.propRenameBtn?.addEventListener('click', () => {
      if (!this.editingContraption || !this.selectedComponentNodeId) return;
      if (this.selectedComponentNodeId === 'root') {
        this.showToast('The root component id is fixed to root');
        return;
      }
      const newId = this.propNodeName?.value?.trim();
      if (!newId) {
        this.showToast('Component id cannot be empty');
        return;
      }
      // IDs are globally unique, so report a clear error when a rename fails.
      const success = this.editingContraption.renameChildEntity(this.selectedComponentNodeId, newId);
      if (success) {
        this.selectedComponentNodeId = newId;
        this.renderComponentTree(this.editingContraption);
        this.renderCodeTabs(this.editingContraption);
        this.updateInspectorProperties(newId);
        this.showToast(`Component id updated: ${newId}`);
      } else {
        this.showToast('Rename failed: id already exists or is invalid');
      }
    });

    this.propNodeName?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.propRenameBtn?.click();
      }
    });

    this.propBodyType?.addEventListener('change', () => {
      if (!this.editingContraption || !this.selectedComponentNodeId) return;
      const result = this.contraptions?.performBasicAction?.({
        domain: ActionDomain.PHYSICS,
        action: 'set-body-type',
        target: { contraption: this.editingContraption },
        nodeId: this.selectedComponentNodeId,
        bodyType: this.propBodyType?.value
      });
      this.updateInspectorProperties(this.selectedComponentNodeId);
      this.renderComponentTree(this.editingContraption);
      this.showToast(result?.ok ? `Rigid body: ${result.bodyType}` : 'Unable to change rigid body type');
    });

    this.propRestitution?.addEventListener('change', () => {
      if (!this.editingContraption || !this.selectedComponentNodeId) return;
      const restitution = Math.max(0, Math.min(1, Number(this.propRestitution?.value) || 0));
      const result = this.contraptions?.performBasicAction?.({
        domain: ActionDomain.PHYSICS,
        action: 'set-body-material',
        target: { contraption: this.editingContraption },
        nodeId: this.selectedComponentNodeId,
        material: { restitution }
      });
      this.updateInspectorProperties(this.selectedComponentNodeId);
      this.showToast(result?.ok ? `Restitution: ${restitution.toFixed(2)}` : 'Unable to update restitution');
    });

    this.propMass?.addEventListener('change', () => {
      if (!this.editingContraption || !this.selectedComponentNodeId) return;
      const mass = Number(this.propMass?.value);
      const result = this.contraptions?.performBasicAction?.({
        domain: ActionDomain.PHYSICS,
        action: 'set-body-mass',
        target: { contraption: this.editingContraption },
        nodeId: this.selectedComponentNodeId,
        mass
      });
      this.updateInspectorProperties(this.selectedComponentNodeId);
      this.showToast(result?.ok ? `Mass: ${result.mass.toFixed(1)} kg` : 'Mass must be greater than 0 kg');
    });

    this.scriptTextarea?.addEventListener('input', () => {
      if (!this.editingContraption) return;
      const targetId = this.selectedComponentNodeId || 'root';
      this.editingContraption.nodeScripts.set(targetId, this.scriptTextarea.value);
      if (targetId === 'root') {
        this.editingContraption.scriptCode = this.scriptTextarea.value;
      }
      this.renderCodeTabs(this.editingContraption);
    });

    // Backdrop click to close modals and resume
    [this.codeEditorModal, this.blueprintsModal, this.inventoryModal].forEach(modal => {
      modal?.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeAllModals(true);
        }
      });
    });

    // Global Keydown Handler (ESC to close modals, Ctrl/Cmd+Enter to save & play)
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Close the documentation panel first and keep the programming terminal open.
        if (this.apiDocsModal?.classList.contains('open')) {
          e.preventDefault();
          e.stopPropagation();
          this.toggleApiDocs(false);
          this.showToast('API docs closed');
          return;
        }
        if (this.hasAnyModalOpen()) {
          e.preventDefault();
          e.stopPropagation();
          // Browsers intentionally suppress immediate Pointer Lock requests
          // caused by the same Escape key that releases the cursor. Keep the
          // cursor visible and let the next canvas click resume the game.
          this.closeAllModals(false);
          this.showToast('Panel closed · click the world to resume');
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (this.codeEditorModal?.classList.contains('open')) {
          e.preventDefault();
          e.stopPropagation();
          this.applyAndRunScript();
          this.closeAllModals(true);
          this.showToast('Script saved & applied, back to the game!');
        }
      }
    }, true);
    }
  }

  hasAnyModalOpen() {
    return !!(
      this.codeEditorModal?.classList.contains('open') ||
      this.blueprintsModal?.classList.contains('open') ||
      this.inventoryModal?.classList.contains('open') ||
      this.apiDocsModal?.classList.contains('open') ||
      this.globalSettingsModal?.classList.contains('open')
    );
  }

  closeAllModals(resumePointerLock = false) {
    if (this.editingContraption && this.selectedComponentNodeId && this.scriptTextarea) {
      this.editingContraption.setNodeScript(this.selectedComponentNodeId, this.scriptTextarea.value);
    }
    this.codeEditorModal?.classList.remove('open');
    this.blueprintsModal?.classList.remove('open');
    this.inventoryModal?.classList.remove('open');
    this.apiDocsModal?.classList.remove('open');
    this.globalSettingsModal?.classList.remove('open');
    this.sceneRenderer?.setEntityPreviewTarget(null);
    this.editingContraption?.setHighlightedNode(null);

    if (this.controller) {
      if (resumePointerLock) this.controller.requestLock();
      else this.controller.unlock();
    }
  }

  openCodeEditor(contraption) {
    this.editingContraption = contraption;
    if (!contraption) return;

    this.selectedComponentNodeId = 'root';
    this.renderComponentTree(contraption);
    this.renderCodeTabs(contraption);
    this.loadNodeCodeIntoEditor('root');
    this.updateInspectorProperties('root');

    if (this.editorEntityId) {
      this.editorEntityId.textContent = `ID: ${contraption.publicId}`;
      this.editorEntityId.title = 'Stable random entity ID used by ctx.entityId and ctx.world.entities';
    }
    if (this.editorContraptionTag) {
      const childIds = [...(contraption.entityNodes?.keys?.() || [])].filter(id => id !== 'root');
      const childLabel = childIds.length > 0 ? ` · children: ${childIds.join(', ')}` : ' · no children';
      this.editorContraptionTag.textContent = `Runtime: #${contraption.id} (${contraption.blocks.length} blocks) · ${String(contraption.bodyType).toUpperCase()}${childLabel}`;
    }

    this.resetAgentChat();
    this.sceneRenderer?.setEntityPreviewTarget(contraption);
    this.toggleCodeEditorModal(true);
    requestAnimationFrame(() => this.sceneRenderer?.renderEntityPreview(contraption));
  }

  renderCodeTabs(contraption = this.editingContraption) {
    if (!this.codeTabBar || !contraption) return;
    this.codeTabBar.innerHTML = '';

    const nodes = [...(contraption.entityNodes?.values() || [])];
    for (const node of nodes) {
      const tab = document.createElement('div');
      const isAct = (this.selectedComponentNodeId || 'root') === node.id;
      const scriptCode = contraption.getNodeScript(node.id);
      const hasScript = !!(scriptCode && scriptCode.trim().length > 0);
      const isEnabled = contraption.isNodeScriptEnabled(node.id);
      tab.className = `code-tab ${isAct ? 'active' : ''} ${hasScript ? 'has-script' : ''} ${isEnabled ? 'enabled' : 'disabled'}`;
      tab.dataset.nodeId = node.id;

      let icon = '•';
      if (node.id === 'root') icon = '★';
      else if (node.kind === 'bearing') icon = '↻';
      else if (node.kind === 'piston') icon = '↕';

      const statusDot = document.createElement('span');
      statusDot.className = `code-tab-dot ${isEnabled ? 'on' : 'off'}`;
      const label = document.createElement('span');
      label.textContent = `${icon} ${node.id}.js`;
      tab.appendChild(statusDot);
      tab.appendChild(label);

      tab.addEventListener('click', () => {
        this.selectComponentTreeNode(node.id);
      });

      this.codeTabBar.appendChild(tab);
    }
  }

  loadNodeCodeIntoEditor(nodeId = 'root') {
    if (!this.editingContraption || !this.scriptTextarea) return;
    const id = String(nodeId || 'root');
    const existingCode = this.editingContraption.getNodeScript(id);

    if (existingCode !== undefined && existingCode !== '') {
      this.scriptTextarea.value = existingCode;
    } else {
      if (id === 'root') {
        this.scriptTextarea.value = `// [root component controller]
// Unified API: self (every component has the same surface)
// Rigid body: self.applyForce([fx, fy, fz]), self.applyTorque([...])
// Drive children: self.child('child_name')
// Held key: ctx.input.down('KeyW')
// Edge: ctx.input.pressed('Space'), ctx.input.released('KeyW')

`;
      } else {
        this.scriptTextarea.value = `// [${id} child component controller]
// Unified API: self (every component has the same surface)
// Kinematics: self.setLocalPosition([x, y, z]), self.setLocalSpin(axis, rpm)
// Thrust: self.applyThrust([fx, fy, fz]) — direction decoupled from spin
// self.setLocalPosition([0, Math.sin(ctx.time * 2) * 0.5, 0]);
`;
      }
    }

    let icon = '•';
    if (id === 'root') icon = '★';
    else {
      const node = this.editingContraption.getEntityNode(id);
      if (node?.kind === 'bearing') icon = '↻';
      else if (node?.kind === 'piston') icon = '↕';
    }

    if (this.codeTargetHint) {
      this.codeTargetHint.textContent = `Editing: ${icon} ${id}${id === 'root' ? ' (body)' : ''}`;
    }
    if (this.codeApiHint) {
      this.codeApiHint.textContent = 'API: self · ctx';
    }
  }

  updateInspectorProperties(nodeId = 'root') {
    if (!this.editingContraption) return;
    const id = String(nodeId || 'root');
    const props = this.editingContraption.getNodeProperties(id);
    if (!props) return;

    if (this.componentInspectorId) this.componentInspectorId.textContent = props.id;
    if (this.propNodeName && document.activeElement !== this.propNodeName) this.propNodeName.value = props.id;
    if (this.propNodeKind) this.propNodeKind.textContent = props.kind === 'root' ? 'root body' : props.kind;
    if (this.propNodeParent) this.propNodeParent.textContent = props.parentId ? props.parentId : 'None';
    if (this.propBodyType && document.activeElement !== this.propBodyType) this.propBodyType.value = props.bodyType;
    if (this.propRestitution && document.activeElement !== this.propRestitution) this.propRestitution.value = Number(props.restitution).toFixed(2);
    if (this.propMass && document.activeElement !== this.propMass) this.propMass.value = Number(props.mass).toFixed(1);
    if (this.propNodeConstraints) this.propNodeConstraints.textContent = String(props.constraintCount);
    if (this.propNodeBlocks) this.propNodeBlocks.textContent = `${props.blockCount} blocks`;
    if (this.propNodeVolume) this.propNodeVolume.textContent = `${props.volume} m³`;
    if (this.propNodePivot) this.propNodePivot.textContent = `[${props.pivot.join(', ')}]`;
    if (this.propNodePos) this.propNodePos.textContent = `[${props.localPosition.join(', ')}]`;
    if (this.propNodeRot) this.propNodeRot.textContent = `[${props.localEuler.map(v => v + '°').join(', ')}]`;
  }

  notifyContraptionStructureChanged(contraption) {
    if (!contraption) return;
    if (this.editingContraption === contraption) {
      const selectedStillExists = contraption.entityNodes?.has?.(this.selectedComponentNodeId || 'root');
      if (!selectedStillExists) {
        this.selectedComponentNodeId = 'root';
        this.loadNodeCodeIntoEditor('root');
      }
      if (this.editorContraptionTag) {
        const childIds = [...(contraption.entityNodes?.keys?.() || [])].filter(id => id !== 'root');
        const childLabel = childIds.length > 0 ? ` · children: ${childIds.join(', ')}` : ' · no children';
        this.editorContraptionTag.textContent = `Runtime: #${contraption.id} (${contraption.blocks.length} blocks) · ${String(contraption.bodyType).toUpperCase()}${childLabel}`;
      }
      this.renderComponentTree(contraption);
      this.renderCodeTabs(contraption);
      this.updateInspectorProperties(this.selectedComponentNodeId || 'root');
      this.sceneRenderer?.renderEntityPreview(contraption);
    }
  }

  notifyContraptionRemoved(contraption) {
    if (!contraption || this.editingContraption !== contraption) return;
    this.codeEditorModal?.classList.remove('open');
    this.sceneRenderer?.setEntityPreviewTarget(null);
    this.editingContraption = null;
    this.selectedComponentNodeId = 'root';
  }

  renderComponentTree(contraption = this.editingContraption) {
    if (!this.componentTreeList || !contraption) return;
    this.componentTreeList.innerHTML = '';

    const rootTree = contraption.getHierarchyTree?.();
    const totalCount = contraption.entityNodes?.size || (rootTree ? 1 : 0);
    if (this.componentTreeCount) {
      this.componentTreeCount.textContent = `${totalCount} components`;
    }

    if (!rootTree) {
      const empty = document.createElement('div');
      empty.className = 'text-muted';
      empty.style.cssText = 'font-size:11px; padding:6px;';
      empty.textContent = 'No component hierarchy';
      this.componentTreeList.appendChild(empty);
      return;
    }

    const renderNode = (node, depth = 0) => {
      const el = document.createElement('div');
      const isSelected = (this.selectedComponentNodeId || 'root') === node.id;
      el.className = `component-tree-node ${isSelected ? 'selected' : ''}`;
      el.dataset.nodeId = node.id;
      el.style.paddingLeft = `${6 + depth * 14}px`;

      let icon = '•';
      if (node.id === 'root') icon = '★';
      else if (node.kind === 'bearing') icon = '↻';
      else if (node.kind === 'piston') icon = '↕';

      const indentStr = depth > 0 ? '└ ' : '';
      const nameStr = node.id === 'root' ? 'root (body)' : node.id;
      const left = document.createElement('div');
      left.className = 'node-left';
      for (const [className, text] of [
        ['node-indent', indentStr],
        ['node-icon', icon],
        ['node-name', nameStr]
      ]) {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = text;
        left.appendChild(span);
      }
      if (node.kind && node.kind !== 'child' && node.kind !== 'root') {
        const kind = document.createElement('span');
        kind.className = 'node-kind-tag';
        kind.textContent = String(node.kind);
        left.appendChild(kind);
      }

      const right = document.createElement('div');
      right.className = 'node-right';
      const bodyType = document.createElement('span');
      bodyType.className = 'node-kind-tag';
      bodyType.textContent = String(node.bodyType);
      const blockCount = document.createElement('span');
      blockCount.className = 'node-count-badge';
      blockCount.textContent = `${node.blockCount} blk`;
      right.appendChild(bodyType);
      right.appendChild(blockCount);
      el.appendChild(left);
      el.appendChild(right);

      el.addEventListener('click', () => {
        this.selectComponentTreeNode(node.id);
      });

      this.componentTreeList.appendChild(el);

      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          renderNode(child, depth + 1);
        }
      }
    };

    renderNode(rootTree, 0);
    this.syncGlobalPlaybackGroup();
  }

  /**
   * Sync the header play/pause/stop radio selection:
   * All on -> play; all off -> pause, unless runtime status says Stop;
   * Mixed state -> nothing selected.
   */
  syncGlobalPlaybackGroup() {
    if (!this.editingContraption || !this.globalPlaybackGroup) return;
    const contraption = this.editingContraption;
    const nodeIds = [...contraption.entityNodes.keys()];
    const allEnabled = nodeIds.every(id => contraption.isNodeScriptEnabled(id));
    const allDisabled = nodeIds.every(id => !contraption.isNodeScriptEnabled(id));
    let value = null;
    if (allEnabled) value = 'play';
    else if (allDisabled) {
      if (contraption.scriptStatus === 'stopped') this.globalPlaybackState = 'stop';
      value = this.globalPlaybackState === 'stop' ? 'stop' : 'pause';
    }
    this.globalPlaybackGroup.querySelectorAll('input[type="radio"]').forEach((radio: HTMLInputElement) => {
      radio.checked = radio.value === value;
    });
  }

  selectComponentTreeNode(nodeId) {
    const targetId = String(nodeId || 'root');

    // Save previous active node's code before switching
    if (this.editingContraption && this.selectedComponentNodeId && this.scriptTextarea) {
      this.editingContraption.setNodeScript(this.selectedComponentNodeId, this.scriptTextarea.value);
    }

    this.selectedComponentNodeId = targetId;

    if (this.editingContraption) {
      this.editingContraption.setHighlightedNode(this.selectedComponentNodeId);
      this.sceneRenderer?.renderEntityPreview(this.editingContraption);
    }

    if (this.componentTreeList) {
      const nodes = this.componentTreeList.querySelectorAll('.component-tree-node');
      nodes.forEach((el: HTMLElement) => {
        el.classList.toggle('selected', el.dataset.nodeId === this.selectedComponentNodeId);
      });
    }

    if (this.codeTabBar) {
      const tabs = this.codeTabBar.querySelectorAll('.code-tab');
      tabs.forEach((tab: HTMLElement) => {
        tab.classList.toggle('active', tab.dataset.nodeId === this.selectedComponentNodeId);
      });
    }

    this.loadNodeCodeIntoEditor(this.selectedComponentNodeId);
    this.updateInspectorProperties(this.selectedComponentNodeId);
  }

  applyAndRunScript() {
    if (!this.editingContraption || !this.scriptTextarea) return;
    const code = this.scriptTextarea.value;
    const targetNodeId = this.selectedComponentNodeId || 'root';
    const success = this.editingContraption.setNodeScript(targetNodeId, code);

    this.renderCodeTabs(this.editingContraption);

    if (success) {
      const state = this.editingContraption.isNodeScriptEnabled(targetNodeId) ? 'ON' : 'OFF';
      this.showToast(`[${targetNodeId}] script updated · switch ${state}`);
    } else {
      const err = this.editingContraption.nodeScriptErrors.get(targetNodeId) || this.editingContraption.scriptError;
      this.showToast(`Compile error: ${err}`);
    }
  }

  toggleCodeEditorModal(forceState = null) {
    const isOpen = (forceState !== null) ? forceState : !this.codeEditorModal.classList.contains('open');
    if (isOpen) {
      this.codeEditorModal.classList.add('open');
      if (this.pauseScreen) this.pauseScreen.classList.add('hidden');
      if (this.controller) this.controller.unlock();
    } else {
      if (this.editingContraption && this.selectedComponentNodeId && this.scriptTextarea) {
        this.editingContraption.setNodeScript(this.selectedComponentNodeId, this.scriptTextarea.value);
      }
      this.codeEditorModal.classList.remove('open');
      this.sceneRenderer?.setEntityPreviewTarget(null);
      this.editingContraption?.setHighlightedNode(null);
      if (this.controller) this.controller.requestLock();
    }
  }

  /** Toggle the script API reference opened from the terminal's API Docs button. */
  toggleApiDocs(forceState = null) {
    if (!this.apiDocsModal) return;
    const isOpen = (forceState !== null) ? forceState : !this.apiDocsModal.classList.contains('open');
    if (isOpen) {
      this.apiDocsModal.classList.add('open');
      this.apiDocsBody?.scrollTo?.(0, 0);
      if (this.controller) this.controller.unlock();
    } else {
      this.apiDocsModal.classList.remove('open');
      // Restore pointer lock only when the programming terminal is also closed.
      if (this.controller && !this.codeEditorModal?.classList.contains('open')) {
        this.controller.requestLock();
      }
    }
  }

  toggleGlobalSettingsModal(forceState = null) {
    if (!this.globalSettingsModal) return;
    const isOpen = (forceState !== null) ? forceState : !this.globalSettingsModal.classList.contains('open');
    if (isOpen) {
      this.globalSettingsModal.classList.add('open');
      this.syncSettingsUI();
      if (this.pauseScreen) this.pauseScreen.classList.add('hidden');
      if (this.controller) this.controller.unlock();
    } else {
      this.globalSettingsModal.classList.remove('open');
      if (this.controller && !this.hasAnyModalOpen()) {
        this.controller.requestLock();
      }
    }
  }

  syncSettingsUI() {
    if (!this.controller) return;

    if (this.settingFovSlider) this.settingFovSlider.value = String(this.controller.fov || 75);
    if (this.settingFovVal) this.settingFovVal.textContent = `${this.controller.fov || 75}°`;

    const perspective = this.controller.perspective || 'first_person';
    this.settingPerspectiveGroup?.querySelectorAll('.segment-btn').forEach((btn: any) => {
      btn.classList.toggle('active', btn.dataset.perspective === perspective);
    });

    if (this.settingCamDistSlider) this.settingCamDistSlider.value = String(this.controller.thirdPersonDistance || 4);
    if (this.settingCamDistVal) this.settingCamDistVal.textContent = `${(this.controller.thirdPersonDistance || 4).toFixed(1)} m`;

    const distRow = document.getElementById('setting-cam-dist-row');
    if (distRow) {
      distRow.style.display = perspective !== 'first_person' ? 'flex' : 'none';
    }

    if (this.world) {
      const renderDist = this.world.renderDistance || 8;
      if (this.settingRenderDistSlider) this.settingRenderDistSlider.value = String(renderDist);
      if (this.settingRenderDistVal) this.settingRenderDistVal.textContent = `${renderDist} Chunks`;
    }
  }

  // =========================================================================
  // AI assistant chat (conversational programming)
  // =========================================================================

  resetAgentChat() {
    this.agentMessages = [];
    this.agentBusy = false;
    if (this.agentChatInput) this.agentChatInput.value = '';
    if (this.agentChatBox) {
      const mode = this.agentConfig?.apiKey
        ? `Model connected: ${this.agentConfig.model}`
        : 'Using built-in local compiler (configure an API Key in Settings for a real model)';
      this.agentChatBox.textContent = '';
      this.agentChatBox.appendChild(this.createAgentChatTip(mode));
    }
  }

  clearAgentChat() {
    this.agentMessages = [];
    this.agentBusy = false;
    if (this.agentChatInput) this.agentChatInput.value = '';
    this.renderAgentChat();
    this.showToast('AI chat history cleared');
  }

  createAgentChatTip(mode) {
    const tip = document.createElement('div');
    tip.className = 'agent-chat-msg agent-msg-system';
    const lines = [
      'Describe a behavior in plain language (e.g. "hover 5m", "follow me").',
      '- Generated code appears in chat; apply it to the current component with one click.',
      `· ${mode}`
    ];
    lines.forEach((line, index) => {
      if (index > 0) tip.appendChild(document.createElement('br'));
      const text = document.createElement('span');
      text.textContent = line;
      tip.appendChild(text);
    });
    return tip;
  }

  renderAgentChat() {
    if (!this.agentChatBox) return;
    this.agentChatBox.innerHTML = '';
    if (this.agentMessages.length === 0) {
      const mode = this.agentConfig?.apiKey
        ? `Model connected: ${this.agentConfig.model}`
        : 'Using built-in local compiler (configure an API Key in Settings for a real model)';
      this.agentChatBox.appendChild(this.createAgentChatTip(mode));
      return;
    }

    for (const message of this.agentMessages) {
      const row = document.createElement('div');
      row.className = `agent-chat-msg ${message.role === 'user' ? 'agent-msg-user' : 'agent-msg-assistant'}`;

      // Reasoning / Chain of Thought box
      if (message.reasoning) {
        const details = document.createElement('details');
        details.className = 'agent-thought-details';
        details.open = true;

        const summary = document.createElement('summary');
        summary.className = 'agent-thought-summary';
        const thoughtIcon = document.createElement('span');
        thoughtIcon.className = 'thought-icon';
        thoughtIcon.textContent = '💭';
        const thoughtTitle = document.createElement('span');
        thoughtTitle.className = 'thought-title';
        thoughtTitle.textContent = message.isStreaming ? 'Thinking...' : 'Thought';
        const spacer = document.createElement('span');
        spacer.textContent = ' ';
        summary.appendChild(thoughtIcon);
        summary.appendChild(spacer);
        summary.appendChild(thoughtTitle);

        const thoughtBody = document.createElement('div');
        thoughtBody.className = 'agent-thought-content';
        thoughtBody.textContent = message.reasoning;

        details.appendChild(summary);
        details.appendChild(thoughtBody);
        row.appendChild(details);
      }

      if (message.content) {
        const textDiv = document.createElement('div');
        textDiv.className = 'agent-msg-text';
        textDiv.textContent = message.content;
        row.appendChild(textDiv);
      } else if (message.isStreaming && !message.reasoning) {
        const textDiv = document.createElement('div');
        textDiv.className = 'agent-msg-text text-muted';
        textDiv.textContent = 'Generating... ▌';
        row.appendChild(textDiv);
      }

      this.agentChatBox.appendChild(row);

      if (message.role === 'assistant' && message.code && !message.isStreaming) {
        const applyBtn = document.createElement('button');
        applyBtn.className = 'agent-apply-btn';
        applyBtn.textContent = `Apply to ${message.targetId || 'root'} component`;
        applyBtn.addEventListener('click', () => {
          this.applyAgentCode(message.code, message.targetId || 'root');
        });
        this.agentChatBox.appendChild(applyBtn);
      }
    }
    this.agentChatBox.scrollTop = this.agentChatBox.scrollHeight;
  }

  async sendAgentMessage() {
    if (!this.editingContraption || !this.agentChatInput) return;
    const prompt = this.agentChatInput.value.trim();
    if (!prompt || this.agentBusy) return;

    this.agentChatInput.value = '';
    this.agentMessages.push({ role: 'user', content: prompt });
    this.renderAgentChat();
    this.agentBusy = true;
    if (this.agentChatSendBtn) {
      this.agentChatSendBtn.disabled = true;
      this.agentChatSendBtn.textContent = '…';
    }

    const targetId = this.selectedComponentNodeId || 'root';
    const targetNode = this.editingContraption.entityNodes?.get?.(targetId);
    const entityPublicId = this.editingContraption.publicId || `Entity #${this.editingContraption.id}`;
    const allNodeIds = this.editingContraption ? [...this.editingContraption.entityNodes.keys()] : [];

    const targetContext = {
      id: targetId,
      parentId: targetNode?.parentId ?? null,
      entityId: entityPublicId,
      runtimeId: this.editingContraption.id,
      allComponents: allNodeIds,
      mode: this.editingContraption.mode,
      blockCount: this.editingContraption.blocks?.filter?.(block => (
        String(block.entityId || 'root') === targetId
      )).length || 0,
      totalBlockCount: this.editingContraption.blocks?.length || 0
    };

    const history = this.agentMessages
      .slice(0, -1)
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }));

    const assistantMsgIndex = this.agentMessages.length;
    this.agentMessages.push({
      role: 'assistant',
      content: '',
      reasoning: '',
      isStreaming: true,
      targetId
    });
    this.renderAgentChat();

    const onChunk = (chunk: any) => {
      if (this.agentMessages[assistantMsgIndex]) {
        this.agentMessages[assistantMsgIndex].content = chunk.content;
        this.agentMessages[assistantMsgIndex].reasoning = chunk.reasoning;
        this.renderAgentChat();
      }
    };

    try {
      const result: any = await runAgentTurn(prompt, this.agentConfig, history, null, targetContext, onChunk);
      if (result.ok) {
        const code = result.code || null;
        this.agentMessages[assistantMsgIndex] = {
          role: 'assistant',
          content: result.content || (code ? 'Controller code generated.' : ''),
          reasoning: result.reasoning || '',
          code,
          targetId: code ? targetId : null,
          isStreaming: false
        };
        // Model output remains inert until the user explicitly clicks Apply.
      } else {
        this.agentMessages[assistantMsgIndex] = {
          role: 'assistant',
          content: `[!] ${result.error}`,
          isStreaming: false
        };
      }
    } catch (err) {
      this.agentMessages[assistantMsgIndex] = {
        role: 'assistant',
        content: `Chat failed: ${err?.message || String(err)}`,
        isStreaming: false
      };
    } finally {
      this.agentBusy = false;
      if (this.agentChatSendBtn) {
        this.agentChatSendBtn.disabled = false;
        this.agentChatSendBtn.textContent = 'Send';
      }
      this.renderAgentChat();
    }
  }

  applyAgentCode(code, targetNodeId = 'root', silent = false) {
    if (!this.editingContraption) return;
    const targetId = String(targetNodeId || 'root');

    // Save the current editor content back to its component before switching targets
    if (this.editingContraption && this.selectedComponentNodeId && this.scriptTextarea) {
      this.editingContraption.setNodeScript(this.selectedComponentNodeId, this.scriptTextarea.value);
    }

    this.scriptTextarea.value = code;
    this.editingContraption.mode = ContraptionMode.PROGRAMMABLE;
    const success = this.editingContraption.setNodeScript(targetId, code);

    if (this.selectedComponentNodeId !== targetId) {
      this.selectedComponentNodeId = targetId;
      this.editingContraption.setHighlightedNode(targetId);
    }
    this.renderComponentTree(this.editingContraption);
    this.renderCodeTabs(this.editingContraption);
    this.updateInspectorProperties(this.selectedComponentNodeId);
    this.loadNodeCodeIntoEditor(this.selectedComponentNodeId);
    this.sceneRenderer?.renderEntityPreview(this.editingContraption);

    if (success) {
      if (!silent) this.showToast(`AI code applied to [${targetId}]`);
    } else {
      const err = this.editingContraption.nodeScriptErrors.get(targetId) || this.editingContraption.scriptError;
      this.showToast(`Code compile failed: ${err}`);
    }
  }

  renderHotbar() {
    if (!this.hotbarContainer) return;
    this.hotbarContainer.innerHTML = '';
    const isMicro = this.controller?.selectorMicroMode === true;

    this.hotbarSlots.forEach((slot, index) => {
      const slotEl = document.createElement('div');
      slotEl.className = `hotbar-slot ${index === this.selectedHotbarIndex ? 'active' : ''}`;
      slotEl.dataset.index = index as any;

      const iconSvg = (slot.value && TOOL_PIXEL_ICONS[slot.value] !== undefined)
        ? TOOL_PIXEL_ICONS[slot.value]
        : (slot.icon || '');

      let badgeHtml = '';
      if (slot.value === SpecialTool.SELECTOR) {
        badgeHtml = `<span class="slot-mode-badge ${isMicro ? 'micro' : 'std'}">${isMicro ? 'MICRO' : 'STD'}</span>`;
      }

      slotEl.innerHTML = `
        <span class="slot-num">${index + 1}</span>
        <span class="slot-icon">${iconSvg}</span>
        <span class="slot-name">${slot.name}</span>
        ${badgeHtml}
      `;

      slotEl.addEventListener('click', () => {
        this.selectHotbarSlot(index);
      });

      this.hotbarContainer.appendChild(slotEl);
    });
  }

  renderColorPaletteBar() {
    if (!this.colorPaletteBar) return;
    this.colorPaletteBar.innerHTML = '';

    this.paletteColors.forEach((item, index) => {
      const chip = document.createElement('div');
      chip.className = `color-chip ${index === this.selectedColorIndex ? 'active' : ''}`;
      chip.dataset.index = index as any;
      chip.dataset.hex = item.hex;
      chip.title = `${item.name || 'Custom'} (${item.hex.toUpperCase()})${index < 9 ? ` · Shift+${index + 1}` : ''}`;
      chip.style.backgroundColor = item.hex;

      if (index < 9) {
        const numSpan = document.createElement('span');
        numSpan.className = 'chip-num';
        numSpan.textContent = (index + 1) as any;
        chip.appendChild(numSpan);
      }

      chip.addEventListener('click', () => {
        this.selectPresetColor(index);
      });

      this.colorPaletteBar.appendChild(chip);
    });
  }

  cycleColor(direction) {
    const total = this.paletteColors.length;
    this.selectedColorIndex = (this.selectedColorIndex + direction + total) % total;
    const target = this.paletteColors[this.selectedColorIndex];
    this.setBuildColor(target.hex);
  }

  selectPresetColor(index) {
    if (index >= 0 && index < this.paletteColors.length) {
      this.selectedColorIndex = index;
      const target = this.paletteColors[index];
      this.setBuildColor(target.hex);
    }
  }

  getPaletteColors() {
    return this.paletteColors.map(p => p.hex.toLowerCase());
  }

  /** Apply a color set (9 colors) to the keyboard palette. */
  applyColorSetToPalette(colorset) {
    if (!colorset || !Array.isArray(colorset.colors)) return false;
    this.paletteColors = colorset.colors.slice(0, 9).map(hex => ({
      hex: colorToHex(normalizeColor(hex)),
      name: colorset.name ? `${colorset.name}` : 'Custom'
    }));
    while (this.paletteColors.length < 9) this.paletteColors.push({ hex: '#f2a93b', name: 'Custom' });
    const selectedIndex = Number.isInteger(this.selectedColorIndex) ? this.selectedColorIndex : 0;
    this.selectedColorIndex = Math.min(Math.max(selectedIndex, 0), this.paletteColors.length - 1);
    this.renderColorPaletteBar();
    this.setBuildColor(this.paletteColors[this.selectedColorIndex].hex);
    try {
      localStorage.setItem('space_palette_colors', JSON.stringify(this.paletteColors));
    } catch {}
    return true;
  }

  /** Save the current 9-color keyboard palette as a new color-set backpack item. */
  savePaletteAsColorSet() {
    const name = `Palette ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const index = this.controller?.addInventoryItem?.('colorset', { name, colors: this.getPaletteColors() });
    if (index === null || index === undefined) {
      this.showToast('Color set inventory is full (9) - delete one first');
      return null;
    }
    this.showToast(`Added the current palette as color set ${index + 1}`);
    this.renderInventory();
    this.renderInventoryBar();
    return index;
  }

  selectHotbarSlot(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.hotbarSlots.length) return false;
    this.selectedHotbarIndex = index;
    const slots = this.hotbarContainer.querySelectorAll('.hotbar-slot');
    slots.forEach((s, i) => {
      s.classList.toggle('active', i === index);
    });

    this.applyActiveSlot();
    this.updateToolPanelMode();
    return true;
  }

  selectTool(tool) {
    const index = this.hotbarSlots.findIndex(slot => slot.value === tool);
    if (index < 0) return false;
    this.selectHotbarSlot(index);
    return true;
  }

  /**
   * Tool-mode switch: Hammer shows entity backpack; Selector shows selection
   * controls and mode toggle; other building tools show keyboard color palette.
   */
  updateToolPanelMode() {
    const slot = this.hotbarSlots[this.selectedHotbarIndex];
    const showInventory = slot?.value === SpecialTool.HAMMER;
    const isHammer = showInventory;
    const isSelector = slot?.value === SpecialTool.SELECTOR;
    const paletteWrapper = document.getElementById('color-palette-wrapper');
    const inventoryWrapper = document.getElementById('inventory-bar-wrapper');
    const selectorWrapper = document.getElementById('selector-panel-wrapper');

    if (paletteWrapper) paletteWrapper.style.display = (!isHammer && !isSelector) ? '' : 'none';
    if (inventoryWrapper) inventoryWrapper.style.display = isHammer ? '' : 'none';
    if (selectorWrapper) selectorWrapper.style.display = isSelector ? '' : 'none';

    if (isHammer) this.renderInventoryBar();
    this.renderHotbar();
  }

  renderInventoryBar() {
    const bar = document.getElementById('inventory-bar');
    const tabsContainer = document.getElementById('inv-cat-tabs');
    if (!bar || !this.controller) return;
    bar.innerHTML = '';

    let category = this.controller.activeInventoryCategory || 'blockset';
    // The hammer bar only exposes block sets and entities; a legacy
    // color-set focus falls back to block sets.
    if (category === 'colorset') {
      this.controller.setActiveInventoryCategory('blockset');
      category = 'blockset';
    }

    // Category tabs: block sets (BKS) and entities (ENT) — 9 slots each.
    // Tab toggles between the two.
    const targetTabs = tabsContainer || document.createElement('div');
    targetTabs.innerHTML = '';
    targetTabs.className = 'inv-cat-tabs';
    for (const key of ['blockset', 'entity']) {
      const tab = document.createElement('span');
      tab.className = `inv-cat-tab ${key === category ? 'active' : ''}`;
      tab.textContent = key === 'blockset' ? 'BKS' : 'ENT';
      tab.title = key === 'blockset'
        ? 'Block sets · Tab toggles'
        : 'Entities · Tab toggles';
      tab.addEventListener('click', () => this.selectInventoryCategory(key));
      targetTabs.appendChild(tab);
    }
    if (!tabsContainer) {
      bar.appendChild(targetTabs);
    }

    const slots = this.controller.inventorySlots || [];
    const selected = this.controller.selectedInventoryIndex ?? 0;
    for (let i = 0; i < 9; i++) {
      const slotEl = document.createElement('div');
      const content = slots[i];
      const isBlockSet = category === 'blockset' || content?.kind === 'blockset';
      const isColorSet = category === 'colorset';
      const itemName = content
        ? this.controller.inventoryItemName?.(category, content, i) || content.name || `Slot ${i + 1}`
        : '';
      slotEl.className = `inventory-slot ${i === selected ? 'active' : ''} ${content ? 'filled' : 'empty'}`;
      let title;
      if (!content) title = `Slot ${i + 1}: empty`;
      else if (isColorSet) title = `Slot ${i + 1}: color set "${itemName}"`;
      else if (isBlockSet) title = `Slot ${i + 1}: "${itemName}" · ${content.blockCount} voxels`;
      else title = `Slot ${i + 1}: "${itemName}" · ${content.blockCount} blocks · ${content.scripts?.length || 0} scripts`;
      slotEl.title = title + ` · Shift+${i + 1}`;
      slotEl.innerHTML = !content
        ? `<span class="inv-slot-empty">-</span>`
        : isColorSet
          ? `<span class="colorset-preview-grid">${(content.colors || []).slice(0, 9).map(hex => `<i style="background:${hex}"></i>`).join('')}</span>`
          : isBlockSet
            ? `<span class="inv-slot-id">BKS</span><span class="inv-slot-count">${content.blockCount}</span>`
            : `<span class="inv-slot-id">ENT</span><span class="inv-slot-count">${content.blockCount}</span>`;
      slotEl.addEventListener('click', () => {
        this.selectInventorySlot(i);
      });
      bar.appendChild(slotEl);
    }
  }

  /** Switch the hammer bar between block sets and entities. */
  selectInventoryCategory(category) {
    if (!this.controller) return false;
    this.controller.setActiveInventoryCategory(category);
    this.renderInventoryBar();
    return true;
  }

  /** Select an inventory slot of the active category (0-based); used by click and Shift+1..9. */
  selectInventorySlot(index) {
    if (!this.controller) return false;
    const count = this.controller.inventorySlots?.length || 0;
    if (!Number.isInteger(index) || index < 0 || index >= count) return false;
    this.controller.selectedInventoryIndex = index;
    this.renderInventoryBar();
    return true;
  }

  cycleHotbar(direction) {
    let next = (this.selectedHotbarIndex + direction) % this.hotbarSlots.length;
    if (next < 0) next += this.hotbarSlots.length;
    this.selectHotbarSlot(next);
  }

  applyActiveSlot() {
    if (!this.controller) return;
    const prevTool = this.controller.activeTool;
    const slot = this.hotbarSlots[this.selectedHotbarIndex];
    const newTool = slot.value;
    if ((prevTool === SpecialTool.SELECTOR || prevTool === SpecialTool.SUPER_GLUE) &&
        (newTool !== SpecialTool.SELECTOR && newTool !== SpecialTool.SUPER_GLUE)) {
      this.controller.clearSelection?.();
    }
    this.controller.activeTool = newTool;
    this.controller.selectedBlock = null;
    this.showToast(`Tool [${this.selectedHotbarIndex + 1}]: ${slot.name} - ${slot.desc || ''}`);
  }

  renderInventory() {
    if (!this.inventoryGrid) return;
    this.inventoryGrid.innerHTML = '';

    const addSectionHeader = (title, count, total, category, extraActions = []) => {
      const header = document.createElement('div');
      header.className = 'backpack-section-header';
      const heading = document.createElement('span');
      heading.className = 'backpack-section-title';
      heading.textContent = String(title);
      if (count !== null) {
        const countBadge = document.createElement('span');
        countBadge.className = 'backpack-section-count';
        countBadge.textContent = `${count}/${total}`;
        const spacer = document.createElement('span');
        spacer.textContent = ' ';
        heading.appendChild(spacer);
        heading.appendChild(countBadge);
      }
      header.appendChild(heading);
      const actions = document.createElement('div');
      actions.className = 'backpack-section-actions';
      extraActions.forEach(action => {
        const button = document.createElement('button');
        button.className = 'backpack-section-btn';
        button.textContent = action.label;
        button.addEventListener('click', action.run);
        actions.appendChild(button);
      });
      if (category) {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json,application/json';
        fileInput.style.display = 'none';
        actions.appendChild(fileInput);
        const importBtn = document.createElement('button');
        importBtn.className = 'backpack-section-btn';
        importBtn.textContent = 'Import JSON';
        importBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => this.importInventoryFile(category, fileInput));
        actions.appendChild(importBtn);
      }
      if (actions.childNodes.length > 0) header.appendChild(actions);
      this.inventoryGrid.appendChild(header);
    };

    const bindNameInput = (card, category, index, item, fallbackName) => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'backpack-item-name-input';
      input.maxLength = 80;
      input.value = this.controller?.inventoryItemName?.(category, item, index) || item?.name || fallbackName;
      input.placeholder = fallbackName;
      input.title = 'Item name · duplicate names are allowed';
      input.setAttribute('aria-label', `${category} slot ${index + 1} name`);
      let nameAtFocus = input.value;
      const restoreName = () => {
        input.value = this.controller?.inventoryItemName?.(category, item, index) || item?.name || fallbackName;
      };
      const commitName = () => {
        const renamed = this.controller?.renameInventoryItem?.(category, index, input.value);
        if (renamed) input.value = renamed;
        else restoreName();
        this.renderInventoryBar();
      };
      input.addEventListener('focus', () => {
        nameAtFocus = this.controller?.inventoryItemName?.(category, item, index) || item?.name || fallbackName;
      });
      input.addEventListener('input', () => {
        const renamed = this.controller?.renameInventoryItem?.(category, index, input.value);
        if (renamed) this.renderInventoryBar();
      });
      input.addEventListener('change', commitName);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') input.blur();
        if (event.key === 'Escape') {
          this.controller?.renameInventoryItem?.(category, index, nameAtFocus);
          input.value = nameAtFocus;
          this.renderInventoryBar();
          input.blur();
        }
      });
      card.prepend(input);
    };

    const addItemCard = (category, index, item, fallbackName, meta, extraHtml, actions) => {
      const card = document.createElement('div');
      card.className = 'inventory-card backpack-item';
      const metaElement = document.createElement('div');
      metaElement.className = 'backpack-item-meta';
      metaElement.textContent = String(meta);
      card.appendChild(metaElement);
      if (extraHtml?.nodeType === 1) card.appendChild(extraHtml);
      const actionBar = document.createElement('div');
      actionBar.className = 'inv-item-actions';
      actions.forEach((action) => {
        const button = document.createElement('button');
        button.className = `backpack-item-btn${action.danger ? ' danger' : ''}`;
        button.textContent = String(action.label);
        button.addEventListener('click', action.run);
        actionBar.appendChild(button);
      });
      card.appendChild(actionBar);
      bindNameInput(card, category, index, item, fallbackName);
      this.inventoryGrid.appendChild(card);
    };

    const addEmptySlot = (label) => {
      const card = document.createElement('div');
      card.className = 'inventory-card backpack-item backpack-item-empty';
      const meta = document.createElement('div');
      meta.className = 'backpack-item-meta';
      meta.textContent = String(label);
      card.appendChild(meta);
      this.inventoryGrid.appendChild(card);
    };

    const inventories = this.controller?.inventories;

    // === BLOCK SETS (max 9) ===
    const blockSets = inventories?.blockset?.items || [];
    const blockSetCount = blockSets.filter(Boolean).length;
    addSectionHeader('BLOCK SETS — hammer builds plain blocks', blockSetCount, 9, 'blockset');
    blockSets.forEach((item, index) => {
      if (!item) {
        addEmptySlot(`Empty slot ${index + 1} · T copy or import`);
        return;
      }
      addItemCard(
        'blockset',
        index,
        item,
        `Block set ${index + 1}`,
        `${item.blockCount || item.blocks?.length || 0} voxels`,
        null,
        [
          {
            label: 'Export',
            run: () => this.downloadJson(
              this.inventoryJsonFilename(item.name, `Block set ${index + 1}`),
              this.controller?.serializeInventoryItem?.('blockset', item) || item
            )
          },
          {
            label: 'Delete',
            danger: true,
            run: () => {
              this.controller?.deleteInventoryItem?.('blockset', index);
              this.renderInventory();
              this.renderInventoryBar();
            }
          }
        ]
      );
    });

    // STL Import card: pick a quantization size, load an .stl mesh, voxelize it
    // into the block-set area of the backpack.
    const stlCard = document.createElement('div');
    stlCard.className = 'inventory-card stl-import-card';
    stlCard.innerHTML = `
      <div class="stl-card-header">
        <span class="inv-icon">⬡</span>
        <div style="flex: 1; text-align: left;">
          <div class="inv-name" style="color: var(--brass-light);">IMPORT STL → BLOCK BODY</div>
          <div class="inv-desc">Convert an .stl mesh into a block set in the inventory — Hammer left-click places plain blocks</div>
        </div>
      </div>
      <div class="stl-size-row">
        <span class="stl-size-label">Precision:</span>
        <label class="stl-size-option">
          <input type="radio" name="stl-size" value="0.2"> 0.2 (5×5×5 micro voxels)
        </label>
        <label class="stl-size-option">
          <input type="radio" name="stl-size" value="1" checked> 1 (standard blocks)
        </label>
      </div>
      <div class="stl-size-row">
        <span class="stl-size-label">Size (largest axis):</span>
        <input type="number" id="stl-size-blocks" class="stl-max-select" value="32" min="1" max="256" step="1" required>
        <span class="stl-size-hint">required · final model size in 1×1×1 standard blocks</span>
      </div>
      <input type="file" id="stl-file-input" accept=".stl" class="stl-file-input">
      <div class="stl-actions">
        <button class="banner-btn primary" id="stl-import-btn" style="font-size: 11px; padding: 4px 10px;">Import & Voxelize</button>
        <span id="stl-import-status" class="stl-import-status">No file selected</span>
      </div>
    `;
    const stlFileInput = stlCard.querySelector('#stl-file-input') as HTMLInputElement | null;
    const stlStatus = stlCard.querySelector('#stl-import-status');
    const stlImportBtn = stlCard.querySelector('#stl-import-btn') as HTMLButtonElement | null;
    const stlSizeBlocksInput = stlCard.querySelector('#stl-size-blocks') as HTMLInputElement | null;
    const stlSizeValue = () => parseFloat(
      (stlCard.querySelector('input[name="stl-size"]:checked') as HTMLInputElement | null)?.value || '1'
    );
    const stlSizeBlocksValue = () => parseInt(stlSizeBlocksInput?.value || '', 10);
    let activeSTLWorker: Worker | null = null;
    let stlWorkerTimeout: number | null = null;
    const resetSTLWorker = () => {
      activeSTLWorker?.terminate();
      activeSTLWorker = null;
      if (stlWorkerTimeout !== null) window.clearTimeout(stlWorkerTimeout);
      stlWorkerTimeout = null;
      if (stlImportBtn) stlImportBtn.textContent = 'Import & Voxelize';
    };
    stlFileInput?.addEventListener('change', () => {
      const file = stlFileInput.files?.[0];
      if (stlStatus) {
        stlStatus.textContent = file && file.size > MAX_STL_FILE_BYTES
          ? `Error: ${file.name} exceeds the ${MAX_STL_FILE_BYTES / (1024 * 1024)} MiB limit`
          : file ? `Ready: ${file.name}` : 'No file selected';
      }
    });
    stlImportBtn?.addEventListener('click', () => {
      if (activeSTLWorker) {
        resetSTLWorker();
        if (stlStatus) stlStatus.textContent = 'Import cancelled';
        return;
      }
      const file = stlFileInput?.files?.[0];
      if (!file) {
        if (stlStatus) stlStatus.textContent = 'Choose an .stl file first';
        return;
      }
      if (file.size > MAX_STL_FILE_BYTES) {
        if (stlStatus) stlStatus.textContent = `Error: STL files are limited to ${MAX_STL_FILE_BYTES / (1024 * 1024)} MiB`;
        return;
      }
      // Required size sets the exported model's longest axis in standard blocks.
      const sizeBlocks = stlSizeBlocksValue();
      if (!sizeBlocks || sizeBlocks < 1) {
        if (stlStatus) stlStatus.textContent = 'Error: size in standard blocks must be at least 1';
        return;
      }
      const precision = stlSizeValue();
      let worker: Worker;
      try {
        worker = new Worker(new URL('../engine/voxel/STLImportWorker.ts', import.meta.url), { type: 'module' });
      } catch (error) {
        if (stlStatus) stlStatus.textContent = `Error: unable to start STL worker (${error instanceof Error ? error.message : String(error)})`;
        return;
      }
      activeSTLWorker = worker;
      if (stlImportBtn) stlImportBtn.textContent = 'Cancel';
      if (stlStatus) stlStatus.textContent = `Reading ${file.name}…`;
      stlWorkerTimeout = window.setTimeout(() => {
        if (activeSTLWorker !== worker) return;
        resetSTLWorker();
        if (stlStatus) stlStatus.textContent = 'Error: STL import exceeded the 120 second processing limit';
      }, 120000);
      worker.addEventListener('message', event => {
        if (activeSTLWorker !== worker) return;
        try {
          if (!event.data?.ok) throw new Error(event.data?.error || 'STL worker failed');
          const result = event.data.result;
          const sizeLabel = `prec ${precision} · size ${sizeBlocks} blocks`;
          const slot = this.controller?.importBlockSetToInventory(result.blocks, `${file.name} @${sizeLabel}`);
          if (slot && stlStatus) {
            const index = this.controller.inventories.blockset.items.indexOf(slot);
            stlStatus.textContent = `OK: ${result.blocks.length} voxels (${result.size.sx}×${result.size.sy}×${result.size.sz}) · ${sizeLabel} → block set slot ${index + 1}`;
            this.renderInventory();
          }
        } catch (err) {
          if (stlStatus) stlStatus.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
        } finally {
          resetSTLWorker();
        }
      });
      worker.addEventListener('error', event => {
        if (activeSTLWorker !== worker) return;
        resetSTLWorker();
        if (stlStatus) stlStatus.textContent = `Error: ${event.message || 'STL worker crashed'}`;
      });
      file.arrayBuffer().then(buffer => {
        if (activeSTLWorker !== worker) return;
        if (stlStatus) stlStatus.textContent = `Voxelizing ${file.name} in background…`;
        worker.postMessage({
          buffer,
          sizeBlocks,
          precision,
          color: this.controller?.selectedColor ?? 0xf2a93b
        }, [buffer]);
      }).catch(error => {
        if (activeSTLWorker !== worker) return;
        resetSTLWorker();
        if (stlStatus) stlStatus.textContent = `Error: failed to read file (${error instanceof Error ? error.message : String(error)})`;
      });
    });
    this.inventoryGrid.appendChild(stlCard);

    // === ENTITIES (max 9) ===
    const entities = inventories?.entity?.items || [];
    addSectionHeader('ENTITIES — hammer builds the physics entity', entities.filter(Boolean).length, 9, 'entity');
    entities.forEach((item, index) => {
      if (!item) {
        addEmptySlot(`Empty slot ${index + 1} · R copy or import`);
        return;
      }
      const label = item.rootId || (item.rootIds ? `${item.rootIds.length} components` : 'entity');
      addItemCard(
        'entity',
        index,
        item,
        `Entity ${label}`,
        `${item.blockCount || item.blocks?.length || 0} blocks · ${item.scripts?.length || 0} scripts · ${item.mode || 'free_physics'}`,
        null,
        [
          {
            label: 'Export',
            run: () => this.downloadJson(
              this.inventoryJsonFilename(item.name, `Entity ${index + 1}`),
              this.controller?.serializeInventoryItem?.('entity', item) || item
            )
          },
          {
            label: 'Delete',
            danger: true,
            run: () => {
              this.controller?.deleteInventoryItem?.('entity', index);
              this.renderInventory();
              this.renderInventoryBar();
            }
          }
        ]
      );
    });

    // === COLOR SETS (max 9, 9 colors each) ===
    const colorSets = inventories?.colorset?.items || [];
    addSectionHeader(
      'COLOR SETS — apply to the keyboard palette',
      colorSets.filter(Boolean).length,
      9,
      'colorset',
      [{ label: 'Add current palette', run: () => this.savePaletteAsColorSet() }]
    );
    colorSets.forEach((item, index) => {
      if (!item) {
        addEmptySlot(`Empty slot ${index + 1} · save the palette or import`);
        return;
      }
      const card = document.createElement('div');
      card.className = 'inventory-card backpack-item';
      const meta = document.createElement('div');
      meta.className = 'backpack-item-meta';
      meta.textContent = '9 colors · click a swatch to recolor';
      const colors = document.createElement('div');
      colors.className = 'colorset-colors';
      (item.colors || []).forEach((hex, ci) => {
        const safeHex = colorToHex(normalizeColor(hex));
        const label = document.createElement('label');
        label.className = 'colorset-cell';
        label.style.background = safeHex;
        label.title = `Recolor set slot ${ci + 1}`;
        const input = document.createElement('input');
        input.type = 'color';
        input.value = safeHex;
        input.dataset.ci = String(ci);
        label.appendChild(input);
        colors.appendChild(label);
      });
      const actionBar = document.createElement('div');
      actionBar.className = 'inv-item-actions';
      for (const [action, label, danger] of [
        ['apply', 'Apply', false],
        ['export', 'Export', false],
        ['delete', 'Delete', true]
      ]) {
        const button = document.createElement('button');
        button.className = `backpack-item-btn${danger ? ' danger' : ''}`;
        button.dataset.action = String(action);
        button.textContent = String(label);
        actionBar.appendChild(button);
      }
      card.appendChild(meta);
      card.appendChild(colors);
      card.appendChild(actionBar);
      card.querySelectorAll('input[type="color"]').forEach((rawInput) => {
        const input = rawInput as HTMLInputElement;
        input.addEventListener('change', () => {
          const ci = Number(input.dataset.ci);
          if (Number.isInteger(ci) && ci >= 0 && ci < item.colors.length) {
            item.colors[ci] = colorToHex(normalizeColor(input.value));
            input.closest('label')?.style.setProperty('background', input.value);
            this.controller?.saveInventoriesToLocalStorage?.();
            this.renderInventoryBar();
          }
        });
      });
      card.querySelector('[data-action="apply"]')?.addEventListener('click', () => {
        this.applyColorSetToPalette(item);
        this.showToast(`Applied color set "${item.name || index + 1}" to the palette`);
      });
      card.querySelector('[data-action="export"]')?.addEventListener('click', () => {
        this.downloadJson(
          this.inventoryJsonFilename(item.name, `Color set ${index + 1}`),
          this.controller?.serializeInventoryItem?.('colorset', item) || item
        );
      });
      card.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
        this.controller?.deleteInventoryItem?.('colorset', index);
        this.renderInventory();
        this.renderInventoryBar();
      });
      bindNameInput(card, 'colorset', index, item, `Color set ${index + 1}`);
      this.inventoryGrid.appendChild(card);
    });
  }

  /** Use the editable item name as its download filename. */
  inventoryJsonFilename(name, fallback = 'backpack-item') {
    const safe = String(name || fallback)
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/[. ]+$/g, '')
      .slice(0, 120) || fallback;
    return `${safe.replace(/\.json$/i, '')}.json`;
  }

  /** Download one backpack item (or raw data) as a JSON file. */
  downloadJson(filename, data) {
    if (data === null || data === undefined) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Read a JSON import for one backpack category and add it if valid. */
  importInventoryFile(category, fileInput) {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file || !this.controller) return;
    if (file.size > MAX_INVENTORY_IMPORT_BYTES) {
      this.showToast(`Import failed: file exceeds ${Math.floor(MAX_INVENTORY_IMPORT_BYTES / (1024 * 1024))} MiB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = this.controller.parseInventoryImport(String(reader.result || ''), category);
      if (!parsed.ok) {
        this.showToast(`Import failed: ${parsed.error}`);
        return;
      }
      const index = this.controller.addInventoryItem(category, parsed.item);
      if (index === null) {
        this.showToast(`${category} inventory is full (9) - delete one first`);
        return;
      }
      this.controller.setActiveInventoryCategory(category);
      this.showToast(`Imported into ${category} slot ${index + 1}`);
      this.renderInventory();
      this.renderInventoryBar();
    };
    reader.onerror = () => this.showToast('Failed to read the file');
    reader.readAsText(file);
  }

  setBuildColor(value) {
    const color = normalizeColor(value);
    const hex = colorToHex(color);
    if (this.controller) this.controller.selectedColor = color;
    if (this.colorPicker && this.colorPicker.value !== hex) this.colorPicker.value = hex;
    if (this.colorHex) this.colorHex.textContent = hex.toUpperCase();

    document.documentElement?.style?.setProperty?.('--build-color', hex);

    // Update active highlight on HUD palette bar
    const hexLower = hex.toLowerCase();
    const presetIdx = this.paletteColors.findIndex(p => p.hex.toLowerCase() === hexLower);
    if (presetIdx >= 0) {
      this.selectedColorIndex = presetIdx;
    }
    if (this.colorPaletteBar) {
      const chips = this.colorPaletteBar.querySelectorAll('.color-chip');
      chips.forEach((c, idx) => {
        c.classList.toggle('active', idx === this.selectedColorIndex);
      });
    }

    const presetName = presetIdx >= 0 ? this.paletteColors[presetIdx].name : '';
    if (this.hotbarContainer && this.hasStarted) {
      this.showToast(`Palette: ${hex.toUpperCase()} ${presetName ? `(${presetName})` : ''}`);
    }
  }

  renderBlueprints() {
    if (!this.blueprintsGrid) return;
    this.blueprintsGrid.innerHTML = '';

    BLUEPRINTS.forEach(bp => {
      const card = document.createElement('div');
      card.className = 'blueprint-card';
      card.innerHTML = `
        <div class="bp-header">
          <span class="bp-title">${bp.name}</span>
          <span class="bp-mode-badge">${bp.defaultMode}</span>
        </div>
        <div class="bp-desc">${bp.description}</div>
        <div class="bp-actions">
          <button class="bp-btn assemble-direct">Assemble Directly</button>
          <button class="bp-btn spawn-world">Place as Blocks</button>
        </div>
      `;

      card.querySelector('.assemble-direct').addEventListener('click', () => {
        this.spawnBlueprintDirect(bp);
        this.toggleBlueprintsModal(false);
      });

      card.querySelector('.spawn-world').addEventListener('click', () => {
        this.spawnBlueprintToWorld(bp);
        this.toggleBlueprintsModal(false);
      });

      this.blueprintsGrid.appendChild(card);
    });
  }

  spawnBlueprintDirect(bp) {
    if (!this.controller || !this.world || !this.contraptions) return;

    let minDx = 0, maxDx = 0, minDy = 0, maxDy = 0, minDz = 0, maxDz = 0;
    for (const b of bp.blocks) {
      if (b.dx < minDx) minDx = b.dx;
      if (b.dx > maxDx) maxDx = b.dx;
      if (b.dy < minDy) minDy = b.dy;
      if (b.dy > maxDy) maxDy = b.dy;
      if (b.dz < minDz) minDz = b.dz;
      if (b.dz > maxDz) maxDz = b.dz;
    }

    const pPos = this.controller.physics.position;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.controller.camera.quaternion);
    fwd.y = 0;
    fwd.normalize();

    const footprint = Math.max(maxDx - minDx + 1, maxDz - minDz + 1);
    // Directly spawned blueprints must remain inside the engineer tool's
    // eight-metre interaction reach, including wide recursive structures.
    const spawnDistance = Math.max(4, Math.min(7, Math.ceil(footprint / 2) + 3));
    const spawnX = Math.floor(pPos.x + fwd.x * spawnDistance);
    // Keep the blueprint's lowest voxel above the existing terrain. Negative
    // blueprint offsets (the windmill extends below its pivot) must not make
    // assembly accidentally absorb ground blocks into the root entity.
    const spawnY = Math.floor(pPos.y + 2) - minDy;
    const spawnZ = Math.floor(pPos.z + fwd.z * spawnDistance);

    spawnBlueprintInWorld(bp, this.world, spawnX, spawnY, spawnZ);

    this.controller.performBasicAction({
      domain: ActionDomain.SELECTION,
      action: 'box',
      cornerA: { x: spawnX + minDx, y: spawnY + minDy, z: spawnZ + minDz },
      cornerB: { x: spawnX + maxDx, y: spawnY + maxDy, z: spawnZ + maxDz }
    });

    const c = this.controller.performBasicAction({
      domain: ActionDomain.SELECTION,
      action: 'assemble',
      mode: bp.defaultMode,
      options: bp.defaultOptions || {}
    }).entity;
    if (c) {
      this.showToast(`Spawned ${bp.name}! Point at it with the selector and press C to program`);
    }
  }

  spawnBlueprintToWorld(bp) {
    if (!this.controller || !this.world) return;

    const xs = bp.blocks.map(block => block.dx);
    const zs = bp.blocks.map(block => block.dz);
    const footprint = Math.max(
      Math.max(...xs) - Math.min(...xs) + 1,
      Math.max(...zs) - Math.min(...zs) + 1
    );
    const pPos = this.controller.physics.position;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.controller.camera.quaternion);
    fwd.y = 0;
    fwd.normalize();

    const spawnDistance = Math.max(5, Math.ceil(footprint / 2) + 4);
    const spawnX = Math.floor(pPos.x + fwd.x * spawnDistance);
    const spawnY = Math.floor(pPos.y);
    const spawnZ = Math.floor(pPos.z + fwd.z * spawnDistance);

    spawnBlueprintInWorld(bp, this.world, spawnX, spawnY, spawnZ);
    this.showToast(`Placed structure: ${bp.name} (box-select with the selector to assemble)`);
  }

  toggleInventoryModal(forceState = null) {
    const isOpen = (forceState !== null) ? forceState : !this.inventoryModal.classList.contains('open');
    if (isOpen) {
      // Inventory contents can change while the modal is closed (R/T copy,
      // Hammer category operations), so always open on a fresh snapshot.
      this.renderInventory();
      this.inventoryModal.classList.add('open');
      if (this.pauseScreen) this.pauseScreen.classList.add('hidden');
      if (this.controller) this.controller.unlock();
    } else {
      this.inventoryModal.classList.remove('open');
      if (this.controller) this.controller.requestLock();
    }
  }

  /** Toggle AI Assistant API config accordion inside the terminal */
  toggleAgentSetup(forceState: boolean | null = null) {
    if (!this.agentSetupAccordion) return;
    const isCurrentlyOpen = this.agentSetupAccordion.style.display !== 'none';
    const willOpen = (forceState !== null) ? !!forceState : !isCurrentlyOpen;
    this.agentSetupAccordion.style.display = willOpen ? 'flex' : 'none';
    this.agentSettingsBtn?.classList.toggle('active', willOpen);
    const arrow = document.getElementById('agent-setup-arrow');
    if (arrow) arrow.textContent = willOpen ? '▲' : '▼';
    if (willOpen) {
      if (this.agentApiBase) this.agentApiBase.value = this.agentConfig?.baseUrl || 'https://api.openai.com/v1';
      if (this.agentApiKey) this.agentApiKey.value = this.agentConfig?.apiKey || '';
      if (this.agentApiModel) this.agentApiModel.value = this.agentConfig?.model || 'gpt-4o-mini';
      if (this.agentContextLength) this.agentContextLength.value = String(this.agentConfig?.contextKTokens ?? 32);
      if (this.agentMaxTokens) this.agentMaxTokens.value = String(this.agentConfig?.maxOutputKTokens ?? 4);
    }
  }

  toggleBlueprintsModal(forceState = null) {
    const isOpen = (forceState !== null) ? forceState : !this.blueprintsModal.classList.contains('open');
    if (isOpen) {
      this.blueprintsModal.classList.add('open');
      if (this.pauseScreen) this.pauseScreen.classList.add('hidden');
      if (this.controller) this.controller.unlock();
    } else {
      this.blueprintsModal.classList.remove('open');
      if (this.controller) this.controller.requestLock();
    }
  }

  setPointerLocked(locked) {
    if (this.pauseScreen) {
      if (locked) {
        this.hasStarted = true;
        this.pauseScreen.classList.add('hidden');
      } else if (!this.hasStarted) {
        this.pauseScreen.classList.remove('hidden');
      } else {
        // Once started, pressing ESC releases mouse for UI without re-blocking the screen
        this.pauseScreen.classList.add('hidden');
      }
    }
  }

  showToast(message) {
    if (!this.toast) return;
    this.toast.textContent = message;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast.classList.remove('show');
    }, 2800);
  }

  toggleEntitiesList(expand?: boolean) {
    this.entitiesListExpanded = expand !== undefined ? expand : !this.entitiesListExpanded;
    if (this.entitiesBody) {
      this.entitiesBody.style.display = this.entitiesListExpanded ? 'flex' : 'none';
    }
    if (this.entitiesToggleBtn) {
      this.entitiesToggleBtn.classList.toggle('expanded', this.entitiesListExpanded);
    }
    if (this.entitiesListExpanded) {
      this.renderEntitiesList(true);
    }
  }

  renderEntitiesList(force = false) {
    if (!this.entitiesList) return;
    const list = this.cachedEntities;
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / this.entitiesPageSize));

    if (this.entitiesCurrentPage > totalPages) {
      this.entitiesCurrentPage = totalPages;
    }
    if (this.entitiesCurrentPage < 1) {
      this.entitiesCurrentPage = 1;
    }

    if (this.entitiesPagination) {
      this.entitiesPagination.style.display = total > this.entitiesPageSize ? 'flex' : 'none';
    }
    if (this.entitiesPageInfo) {
      this.entitiesPageInfo.textContent = `${this.entitiesCurrentPage} / ${totalPages}`;
    }
    if (this.entitiesPrevBtn) {
      this.entitiesPrevBtn.disabled = this.entitiesCurrentPage <= 1;
    }
    if (this.entitiesNextBtn) {
      this.entitiesNextBtn.disabled = this.entitiesCurrentPage >= totalPages;
    }

    if (total === 0) {
      if (!this.entitiesList.querySelector('.hud-entity-empty')) {
        this.entitiesList.innerHTML = '<div class="hud-entity-empty">No entities detected nearby</div>';
      }
      return;
    }

    // Remove empty placeholder if present
    const emptyEl = this.entitiesList.querySelector('.hud-entity-empty');
    if (emptyEl) {
      emptyEl.remove();
    }

    const startIdx = (this.entitiesCurrentPage - 1) * this.entitiesPageSize;
    const endIdx = startIdx + this.entitiesPageSize;
    const pageItems = list.slice(startIdx, endIdx);

    const existingRows = Array.from(this.entitiesList.querySelectorAll('.hud-entity-item'));

    // Trim excess rows
    while (existingRows.length > pageItems.length) {
      const row = existingRows.pop();
      row?.remove();
    }

    for (let i = 0; i < pageItems.length; i++) {
      const item = pageItems[i];
      const distStr = item.dist < 1000 ? `${item.dist.toFixed(1)}m` : `${(item.dist / 1000).toFixed(2)}km`;
      const posStr = `X:${item.pos.x.toFixed(0)} Y:${item.pos.y.toFixed(0)} Z:${item.pos.z.toFixed(0)}`;
      const safeName = String(item.name);

      let row = existingRows[i] as HTMLElement | undefined;
      if (!row) {
        row = document.createElement('div');
        row.className = 'hud-entity-item';
        row.innerHTML = `
          <div class="hud-entity-info">
            <div class="hud-entity-name"></div>
            <div class="hud-entity-meta">
              <span class="hud-entity-pos"></span>
              <span class="hud-entity-dist"></span>
            </div>
          </div>
          <button type="button" class="hud-entity-nav-btn">NAV</button>
        `;
        this.entitiesList.appendChild(row);
      }

      const nameEl = row.querySelector('.hud-entity-name');
      const posEl = row.querySelector('.hud-entity-pos');
      const distEl = row.querySelector('.hud-entity-dist');
      const navBtn = row.querySelector('.hud-entity-nav-btn') as HTMLElement | null;

      if (nameEl && nameEl.textContent !== safeName) {
        nameEl.textContent = safeName;
        nameEl.setAttribute('title', safeName);
      }
      if (posEl && posEl.textContent !== posStr) {
        posEl.textContent = posStr;
      }
      if (distEl && distEl.textContent !== distStr) {
        distEl.textContent = distStr;
      }
      if (navBtn) {
        navBtn.dataset.x = String(item.pos.x);
        navBtn.dataset.y = String(item.pos.y);
        navBtn.dataset.z = String(item.pos.z);
        navBtn.dataset.name = safeName;
        navBtn.setAttribute('title', `Autopilot to ${safeName}`);
      }
    }
  }

  updateHUD(fps, playerPos, raycast, hoveredContraption, pingMs: number | null = null) {
    if (this.fpsVal) this.fpsVal.textContent = `${Math.round(fps)} FPS`;
    if (this.pingVal) {
      if (typeof pingMs === 'number' && Number.isFinite(pingMs) && pingMs >= 0) {
        const rounded = Math.max(1, Math.round(pingMs));
        this.pingVal.textContent = `${rounded} ms`;
        const quality = rounded < 80 ? 'ping-good' : (rounded < 180 ? 'ping-medium' : 'ping-poor');
        this.pingVal.className = `hud-ping ${quality}`;
      } else {
        this.pingVal.textContent = '-- ms';
        this.pingVal.className = 'hud-ping ping-unknown';
      }
    }
    if (this.posVal) {
      this.posVal.textContent = `X: ${playerPos.x.toFixed(1)} | Y: ${playerPos.y.toFixed(1)} | Z: ${playerPos.z.toFixed(1)}`;
    }

    // Update Nearby Entities
    const entityList: Array<{ id: string | number; name: string; pos: { x: number; y: number; z: number }; dist: number; type: string }> = [];

    const contraptions = this.contraptions?.contraptions || [];
    for (const c of contraptions) {
      if (!c || !c.position) continue;
      let dx = wrapX(c.position.x) - wrapX(playerPos.x);
      if (dx > TORUS_SIZE_X / 2) dx -= TORUS_SIZE_X;
      else if (dx < -TORUS_SIZE_X / 2) dx += TORUS_SIZE_X;

      let dz = wrapZ(c.position.z) - wrapZ(playerPos.z);
      if (dz > TORUS_SIZE_Z / 2) dz -= TORUS_SIZE_Z;
      else if (dz < -TORUS_SIZE_Z / 2) dz += TORUS_SIZE_Z;

      const dy = c.position.y - playerPos.y;
      const dist = Math.hypot(dx, dy, dz);
      const name = c.name || `Entity #${c.id}`;
      entityList.push({
        id: c.id,
        name,
        pos: { x: c.position.x, y: c.position.y, z: c.position.z },
        dist,
        type: c.bodyType || 'dynamic'
      });
    }

    const remotePlayers = this.remotePlayers || [];
    for (const rp of remotePlayers) {
      if (rp.is_self) continue;
      let rdx = wrapX(rp.x) - wrapX(playerPos.x);
      if (rdx > TORUS_SIZE_X / 2) rdx -= TORUS_SIZE_X;
      else if (rdx < -TORUS_SIZE_X / 2) rdx += TORUS_SIZE_X;

      let rdz = wrapZ(rp.z) - wrapZ(playerPos.z);
      if (rdz > TORUS_SIZE_Z / 2) rdz -= TORUS_SIZE_Z;
      else if (rdz < -TORUS_SIZE_Z / 2) rdz += TORUS_SIZE_Z;

      const rdy = rp.y - playerPos.y;
      const dist = Math.hypot(rdx, rdy, rdz);
      entityList.push({
        id: String(rp.user_id || rp.player_entity_id),
        name: `Player: ${rp.username || 'Player'}`,
        pos: { x: rp.x, y: rp.y, z: rp.z },
        dist,
        type: 'player'
      });
    }

    entityList.sort((a, b) => a.dist - b.dist);
    this.cachedEntities = entityList;

    if (this.entitiesCount) {
      this.entitiesCount.textContent = String(entityList.length);
    }

    if (this.entitiesListExpanded) {
      const now = performance.now();
      if (now - this.lastEntitiesRenderAt > 250) {
        this.lastEntitiesRenderAt = now;
        this.renderEntitiesList();
      }
    }

    // Update Selector Panel & Mode Badge
    const isMicro = this.controller?.selectorMicroMode === true;
    if (this.selectorModeBadge) {
      this.selectorModeBadge.textContent = isMicro ? 'MICRO' : 'STANDARD';
      this.selectorModeBadge.className = `mode-badge ${isMicro ? 'micro' : 'std'}`;
    }

    if (this.contraptions) {
      const hasSel = this.contraptions.hasValidSelection();
      const childSelection = this.contraptions.getChildSelectionInfo();
      const worldGlue = this.contraptions.getWorldGlueSelectionInfo();
      const worldGlueActive = worldGlue.mode === 'single' || worldGlue.pointCount > 0;

      if (childSelection) {
        if (this.selectionTitle) this.selectionTitle.textContent = 'Entity Component Selection';
        if (this.assembleBtn) {
          this.assembleBtn.disabled = !childSelection.ready;
          this.assembleBtn.textContent = 'Create Child (G)';
        }
        if (this.copyBtn) this.copyBtn.disabled = false;
        const existingHint = childSelection.existingChildCount > 0
          ? ` · ${childSelection.existingChildCount} children attached`
          : '';
        if (this.selectionDetails) {
          this.selectionDetails.textContent = `Entity #${childSelection.contraption.id} [${childSelection.parentId}] · ${childSelection.count} cells · Shift multi-select · G create child · R copy${existingHint}`;
        }
      } else if (worldGlueActive) {
        const isMicroGranularity = worldGlue.granularity === 'micro';
        if (this.selectionTitle) {
          this.selectionTitle.textContent = isMicroGranularity
            ? (worldGlue.mode === 'box' ? 'World Micro Box Selection' : 'World Micro-Cell Selection')
            : (worldGlue.mode === 'single' ? 'World Single-Cell Selection' : 'World 3-Point Box Selection');
        }
        if (this.assembleBtn) {
          this.assembleBtn.disabled = !worldGlue.ready;
          this.assembleBtn.textContent = 'Assemble (G)';
        }
        if (this.copyBtn) {
          this.copyBtn.disabled = !worldGlue.ready;
          this.copyBtn.title = worldGlue.ready ? 'Copy selection to backpack (R)' : 'Finish the selection first';
        }
        if (this.selectionDetails) {
          if (worldGlue.mode === 'single') {
            this.selectionDetails.textContent = isMicroGranularity
              ? `Micro single-select · ${worldGlue.count} micro cells · Shift+click toggle · Tab standard · R copy · Del delete`
              : `Single-select · ${worldGlue.count} cells · Shift+click toggle · Tab micro · R copy · Del delete`;
          } else if (worldGlue.ready) {
            const bounds = this.contraptions.getSelectionBounds();
            if (bounds) {
              const sx = bounds.maxX - bounds.minX + 1;
              const sy = bounds.maxY - bounds.minY + 1;
              const sz = bounds.maxZ - bounds.minZ + 1;
              this.selectionDetails.textContent = `Box [2/2] · ${sx}x${sy}x${sz} (${worldGlue.count} cells) · G assemble · R copy · Del delete`;
            } else {
              this.selectionDetails.textContent = `Box [2/2] · ${worldGlue.count} cells · G assemble · R copy · Del delete`;
            }
          } else if (worldGlue.pointCount === 1 && this.controller?.boxSelectionPreview) {
            const p = this.controller.boxSelectionPreview;
            const quant = p.micro === true ? (v => Math.floor(v * 5 + 1e-6)) : (v => Math.floor(v));
            const minX = quant(Math.min(p.pointA.x, p.cursor.x)), maxX = quant(Math.max(p.pointA.x, p.cursor.x));
            const minY = quant(Math.min(p.pointA.y, p.cursor.y)), maxY = quant(Math.max(p.pointA.y, p.cursor.y));
            const minZ = quant(Math.min(p.pointA.z, p.cursor.z)), maxZ = quant(Math.max(p.pointA.z, p.cursor.z));
            const liveCount = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
            this.selectionDetails.textContent = isMicroGranularity
              ? `Micro box [1/2] · live preview ~${liveCount} cells · click again to confirm`
              : `Box [1/2] · live preview ${liveCount} cells · click again to confirm`;
          } else {
            this.selectionDetails.textContent = isMicroGranularity
              ? `Micro box [${worldGlue.pointCount}/2] · preview ${worldGlue.count} cells · need ${2 - worldGlue.pointCount} more clicks`
              : `Box [${worldGlue.pointCount}/2] · preview ${worldGlue.count} cells · need ${2 - worldGlue.pointCount} more clicks`;
          }
        }
      } else if (hasSel) {
        if (this.selectionTitle) this.selectionTitle.textContent = 'Selection Ready';
        if (this.assembleBtn) {
          this.assembleBtn.disabled = false;
          this.assembleBtn.textContent = 'Assemble (G)';
        }
        if (this.copyBtn) this.copyBtn.disabled = false;
        const count = this.contraptions.getSelectionBlockCount();
        const bounds = this.contraptions.getSelectionBounds();
        if (this.selectionDetails) {
          if (bounds) {
            const sx = bounds.maxX - bounds.minX + 1;
            const sy = bounds.maxY - bounds.minY + 1;
            const sz = bounds.maxZ - bounds.minZ + 1;
            this.selectionDetails.textContent = `Region: ${sx}x${sy}x${sz} (${count} blocks) · G assemble · R copy`;
          } else {
            this.selectionDetails.textContent = `Selected structure (${count} blocks) · G assemble · R copy`;
          }
        }
      } else {
        if (this.selectionTitle) this.selectionTitle.textContent = isMicro ? 'Micro Selection' : 'Standard Selection';
        if (this.selectionDetails) this.selectionDetails.textContent = '';
        if (this.assembleBtn) {
          this.assembleBtn.disabled = true;
          this.assembleBtn.textContent = 'Assemble (G)';
        }
        if (this.copyBtn) this.copyBtn.disabled = true;
      }
    }

    // Update Holographic Selection visual
    if (this.sceneRenderer && this.contraptions) {
      this.sceneRenderer.updateSelectionHologram(
        this.contraptions.getSelectionBounds(),
        this.contraptions.connectedSelection,
        this.contraptions.microSelection
      );
    }

    // Update Live Telemetry in Code Editor (if open)
    if (this.codeEditorModal && this.codeEditorModal.classList.contains('open') && this.editingContraption) {
      const c = this.editingContraption;

      this.sceneRenderer?.renderEntityPreview(c);
      this.updateInspectorProperties(this.selectedComponentNodeId || 'root');

      if (this.teleGroundDist) this.teleGroundDist.textContent = `${(c.groundDistance || 0).toFixed(2)} m`;
      if (this.teleAltitude) this.teleAltitude.textContent = `${c.position.y.toFixed(1)} m`;
      if (this.teleSpeed) this.teleSpeed.textContent = `${c.velocity.length().toFixed(2)} m/s`;
      if (this.teleMass) this.teleMass.textContent = `${c.mass.toFixed(1)} kg`;
      if (this.telePower || this.telePowerFill) {
        const powerPercent = Math.round(Math.min(1, Math.max(0, c.powerUtilization || 0)) * 100);
        if (this.telePower) this.telePower.textContent = `${powerPercent}%`;
        if (this.telePowerFill) this.telePowerFill.style.width = `${powerPercent}%`;
      }

      if (this.editorStatusBadge) {
        this.editorStatusBadge.className = `status-badge ${c.scriptStatus || 'stopped'}`;
        this.editorStatusBadge.textContent = c.scriptStatus === 'running' ? 'RUNNING' : c.scriptStatus === 'error' ? 'ERROR' : 'STOPPED';
      }
      this.syncGlobalPlaybackGroup();

      if (this.editorExecTime) {
        this.editorExecTime.textContent = `${(c.lastExecutionTimeMs || 0).toFixed(2)} ms`;
      }

      if (this.teleConsoleLogs && c.scriptLogs) {
        this.teleConsoleLogs.textContent = '';
        const logs = c.scriptLogs.length > 0 ? c.scriptLogs : ['No log output yet...'];
        for (const message of logs) {
          const line = document.createElement('div');
          line.className = `log-line${c.scriptLogs.length > 0 ? '' : ' text-muted'}`;
          line.textContent = String(message);
          this.teleConsoleLogs.appendChild(line);
        }
      }
    }
  }
}
