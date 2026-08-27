import * as THREE from 'three';
import { SceneRenderer } from './engine/render/SceneRenderer.ts';
import { World } from './engine/voxel/World.ts';
import { PlayerPhysics } from './engine/physics/PlayerPhysics.ts';
import { ContraptionPhysics } from './engine/physics/ContraptionPhysics.ts';
import { ContraptionManager } from './engine/contraption/ContraptionManager.ts';
import { PlayerController } from './engine/controls/PlayerController.ts';
import { SoundManager } from './engine/audio/SoundManager.ts';
import { ParticleSystem } from './engine/render/ParticleSystem.ts';
import { UIManager } from './ui/UIManager.ts';
import { Minimap } from './ui/Minimap.ts';
import { NavigationSystem } from './ui/NavigationSystem.ts';
import {
  encodePlayerPosition,
  enterSpace,
  resolveInitialPlayerPose,
  type PlayerPositionPayload,
  type PlayerPositionRemote,
  type ReadySpaceSession,
} from './bootstrap/SpaceBootstrap.ts';
import { loadDistantLodCache } from './bootstrap/DistantLodCache.ts';
import type { DistantLodCacheData } from './engine/render/DistantLodCacheFormat.ts';

class Game {
  canvasContainer: HTMLElement | null;
  sceneRenderer: any;
  world: World;
  soundManager: any;
  particleSystem: any;
  contraptionPhysics: any;
  contraptionManager: any;
  playerPhysics: any;
  uiManager: UIManager;
  minimap: Minimap;
  navigationSystem: NavigationSystem;
  controller: PlayerController;
  clock: THREE.Clock;
  frameCount: number;
  lastFpsTime: number;
  currentFps: number;
  latencyMonitor: ReadySpaceSession['latency_monitor'];
  playerPositionRemote: PlayerPositionRemote;
  lastSavedPlayerPosition: string;
  pendingPlayerPosition: PlayerPositionPayload | null;
  playerPositionSaveInFlight: boolean;
  lastPlayerPositionSyncAt: number;

  constructor(session: ReadySpaceSession, distantLodCache: DistantLodCacheData | null) {
    this.canvasContainer = document.getElementById('canvas-container');

    // 1. Core Engine Systems
    this.sceneRenderer = new SceneRenderer(this.canvasContainer, {
      skinUrl: session.skin_object_url,
      skinModel: session.player.minecraft_skin_model
    });
    // Procedural terrain and every derived LOD/cache must use the durable,
    // server-authoritative seed so all players reconstruct the same base world.
    this.world = new World(
      this.sceneRenderer.scene,
      session.world.seed,
      distantLodCache,
      {
        worldId: session.world.id,
        remote: session.terrain_edit_remote
      }
    );
    this.sceneRenderer.setWorld(this.world);
    this.soundManager = new SoundManager();
    this.particleSystem = new ParticleSystem(this.sceneRenderer.scene);
    this.contraptionPhysics = new ContraptionPhysics(this.world);
    this.contraptionManager = new ContraptionManager(
      this.sceneRenderer.scene,
      this.world,
      this.soundManager,
      this.particleSystem
    );
    this.contraptionManager.setPhysics(this.contraptionPhysics);

    this.playerPhysics = new PlayerPhysics(this.world, this.contraptionManager);
    this.uiManager = new UIManager();
    this.minimap = new Minimap(document.body, this.world, this.contraptionManager);

    // 2. Player Controller
    this.controller = new PlayerController(
      this.sceneRenderer.camera,
      this.playerPhysics,
      this.world,
      this.soundManager,
      this.particleSystem,
      this.contraptionManager,
      this.uiManager
    );
    this.controller.setSceneRenderer(this.sceneRenderer);
    this.contraptionManager.setRuntimeContextProvider(() => {
      const eye = this.playerPhysics.getEyePosition();
      return {
        // Player list (reserved for multiplayer); the local player uses the id 'local'.
        players: [{
          id: 'local',
          position: [eye.x, eye.y, eye.z]
        }]
      };
    });

    // 3. Connect UI
    this.uiManager.setController(this.controller);
    this.uiManager.setWorld(this.world);
    this.uiManager.setContraptions(this.contraptionManager);
    this.uiManager.setSceneRenderer(this.sceneRenderer);
    this.navigationSystem = new NavigationSystem(
      document.body,
      this.playerPhysics,
      this.controller,
      this.uiManager
    );

    // 4. Clock & FPS tracking
    this.clock = new THREE.Clock();
    this.frameCount = 0;
    this.lastFpsTime = performance.now();
    this.currentFps = 60;
    this.latencyMonitor = session.latency_monitor;
    this.playerPositionRemote = session.player_position_remote;
    this.pendingPlayerPosition = null;
    this.playerPositionSaveInFlight = false;

    // 5. Initial Spawn & Worldgen
    this.initializeSpawn(session);
    this.lastSavedPlayerPosition = session.player.resumed
      ? JSON.stringify(this.currentPlayerPosition())
      : '';
    this.lastPlayerPositionSyncAt = performance.now();
    this.installPlayerPositionPersistence();
    // A random first-entry position is sampled on the client; persist it immediately to DB.
    if (!session.player.resumed) this.queuePlayerPositionSave(true);

    // 6. Start Loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initializeSpawn(session: ReadySpaceSession) {
    // The backend returns either the latest durable state or an ephemeral random
    // position for a player who has no snapshot yet.
    const pose = resolveInitialPlayerPose(session.player);

    // Pre-generate initial chunks around the restored position.
    this.world.updateChunksAround(pose.x, pose.z);

    this.playerPhysics.position.set(pose.x, pose.y, pose.z);
    this.sceneRenderer.camera.position.copy(this.playerPhysics.getEyePosition());

    // The initial view follows the inner-ring horizon; look up through the central hole to see the opposite surface.
    this.controller.yaw = pose.yaw;
    this.controller.pitch = 0;
    this.sceneRenderer.camera.rotation.set(this.controller.pitch, this.controller.yaw, 0, 'YXZ');

  }

  currentPlayerPosition() {
    return encodePlayerPosition(this.playerPhysics.position, this.controller.yaw);
  }

  queuePlayerPositionSave(force = false, keepalive = false) {
    const position = this.currentPlayerPosition();
    const serialized = JSON.stringify(position);
    if (!force && serialized === this.lastSavedPlayerPosition) return;

    if (keepalive) {
      // A keepalive fetch is deliberately sent immediately instead of waiting
      // behind an older request that may not finish before the page is frozen.
      void this.playerPositionRemote.save(position, true).catch(() => undefined);
      return;
    }

    this.pendingPlayerPosition = position;
    if (!this.playerPositionSaveInFlight) void this.drainPlayerPositionSave();
  }

  async drainPlayerPositionSave() {
    const position = this.pendingPlayerPosition;
    if (!position) return;
    this.pendingPlayerPosition = null;
    this.playerPositionSaveInFlight = true;
    try {
      await this.playerPositionRemote.save(position);
      this.lastSavedPlayerPosition = JSON.stringify(position);
    } catch (error) {
      console.warn('Space player position sync failed; it will be retried.', error);
    } finally {
      this.playerPositionSaveInFlight = false;
      if (this.pendingPlayerPosition) void this.drainPlayerPositionSave();
    }
  }

  installPlayerPositionPersistence() {
    const persistBeforeSuspension = () => this.queuePlayerPositionSave(true, true);
    window.addEventListener('pagehide', persistBeforeSuspension);
    window.addEventListener('beforeunload', persistBeforeSuspension);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persistBeforeSuspension();
    });
  }

  animate() {
    requestAnimationFrame(this.animate);

    const dt = Math.min(this.clock.getDelta(), 0.08);

    // Track FPS
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 500) {
      this.currentFps = (this.frameCount * 1000) / (now - this.lastFpsTime);
      this.frameCount = 0;
      this.lastFpsTime = now;
    }

    // 1. Update Player & Controls
    this.controller.update(dt);
    if (now - this.lastPlayerPositionSyncAt >= 1000) {
      this.lastPlayerPositionSyncAt = now;
      this.queuePlayerPositionSave();
    }

    // 2. Stream World Chunks around Player. Entity streaming consumes this
    // exact active window below, so chunks must be current before entities run.
    const playerPos = this.playerPhysics.position;
    this.world.updateChunksAround(playerPos.x, playerPos.z);

    // 3. Update Contraptions & Physics Simulation
    const entityInput = this.controller.consumeEntityInputFrame();
    this.contraptionManager.update(dt, entityInput);

    // A contraption can move into the player after the player's own physics
    // step. Resolve that new overlap now and keep the camera in sync. Mounted
    // players intentionally remain attached to the driven entity.
    if (!this.controller.isDriving && this.playerPhysics.resolveDynamicContraptionOverlaps()) {
      this.controller.camera.position.copy(this.playerPhysics.getEyePosition());
    }

    // Pick only after programmable child motion and rigid-body physics have
    // finished. Rendering uses these same transforms later in this frame.
    this.controller.updateAimRaycast();

    // 4. Update Particles
    this.particleSystem.update(dt);

    // 5. Update Scene Lighting, Sky & Player Avatar
    this.sceneRenderer.update(dt, playerPos, this.controller.yaw, {
      velocity: this.playerPhysics.velocity,
      grounded: this.playerPhysics.isOnGround,
      flying: this.playerPhysics.isFlying,
      maxSpeed: this.playerPhysics.isFlying
        ? this.playerPhysics.flySpeed
        : (this.playerPhysics.isSprinting ? this.playerPhysics.sprintSpeed : this.playerPhysics.walkSpeed),
      lookPitch: this.controller.pitch
    });

    // 6. Update Cursor Highlight
    const cursor = this.controller.getCursorHighlight();
    if (cursor) {
      this.sceneRenderer.setCursor(cursor.pos, cursor.size);
    } else {
      this.sceneRenderer.setCursor(null);
    }

    // 6b. Spoon micro-carve 5x5x5 grid preview
    this.sceneRenderer.setMicroCarvePreview(this.controller.microCarvePreview);

    // 6c. Selector focus-block guide (orange after point 1 is set; micro-sized
    // when aiming at a 0.2 m block in the selector's Tab micro mode).
    if (this.controller.focusBlockPreview) {
      const p = this.controller.focusBlockPreview;
      this.sceneRenderer.setFocusBlockGuide(p.center, !!p.active, p.cellSize ?? 1);
    } else {
      this.sceneRenderer.clearFocusBlockGuide();
    }

    // 6d. Selector box selection live preview (windows-drag style)
    if (this.controller.boxSelectionPreview) {
      this.sceneRenderer.setBoxSelectionPreview(
        this.controller.boxSelectionPreview.pointA,
        this.controller.boxSelectionPreview.cursor,
        this.controller.boxSelectionPreview.micro === true
      );
    } else {
      this.sceneRenderer.clearBoxSelectionPreview();
    }

    // 6e. Hammer inventory hover ghost (entity slots and plain block sets).
    this.sceneRenderer.setInventoryPlacementPreview(this.controller.inventoryPlacementPreview);

    // 7. Update UI HUD
    this.uiManager.updateHUD(
      this.currentFps,
      playerPos,
      this.controller.currentRaycast,
      this.controller.hoveredContraption,
      this.latencyMonitor?.getPing() ?? null
    );

    // 7b. Minimap (bottom-right)
    this.minimap.update(
      playerPos,
      this.controller.yaw,
      this.controller.isDriving,
      this.controller.drivenContraption
    );

    // 7c. Autopilot Navigation System (bottom-left)
    this.navigationSystem.update(dt);

    // 8. Render 3D Scene
    this.sceneRenderer.render();
  }
}

// Start Game on page load
window.addEventListener('DOMContentLoaded', () => {
  void enterSpace(async session => {
    const distantLodCache = await loadDistantLodCache(
      session.world.seed,
      session.world.terrain_generator_version
    );
    (window as any).spaceSession = session;
    (window as any).game = new Game(session, distantLodCache);
  });
});
