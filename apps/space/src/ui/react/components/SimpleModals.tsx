import React from 'react';
import { spaceUiStore } from '../store/SpaceUiStore.ts';
import { useSpaceUi } from '../store/useSpaceUi.ts';

function ModalBackdrop({ id, className = '', children, onClose }: { id: string; className?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div id={id} className={`custom-modal open ${className}`} onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      {children}
    </div>
  );
}

export function GlobalSettingsModal() {
  const state = useSpaceUi(snapshot => snapshot);
  if (state.activeModal !== 'settings') return null;
  return (
    <ModalBackdrop id="global-settings-modal" onClose={() => spaceUiStore.toggleGlobalSettingsModal(false)}>
      <div className="modal-content settings-modal-content">
        <div className="modal-header"><h2>Global Settings</h2><button id="close-global-settings-btn" className="icon-btn" style={{ width: 28, height: 28, fontSize: 13 }} title="Close settings (ESC)" onClick={() => spaceUiStore.toggleGlobalSettingsModal(false)}>✕</button></div>
        <div className="modal-sub">Configure camera, perspective, and world preferences</div>
        <div className="settings-section">
          <div className="settings-section-title">CAMERA &amp; VIEW</div>
          <div className="settings-row">
            <div className="settings-label-group"><span className="settings-label">Field of View (FOV)</span><span className="settings-desc">Camera lens angle (50° ~ 110°)</span></div>
            <div className="settings-control-group"><input id="setting-fov-slider" className="settings-slider" type="range" min="50" max="110" step="1" value={state.fov} onChange={event => spaceUiStore.setFov(Number(event.target.value))} /><span id="setting-fov-val" className="settings-value-badge">{state.fov}°</span></div>
          </div>
          <div className="settings-row">
            <div className="settings-label-group"><span className="settings-label">Perspective</span><span className="settings-desc">Cycle First, Third Back, and Third Front views (F3)</span></div>
            <div className="settings-segmented-control" id="setting-perspective-group">
              {([
                ['first_person', '1st Person'],
                ['third_person', '3rd Back'],
                ['third_person_front', '3rd Front']
              ] as const).map(([value, label]) => <button key={value} className={`segment-btn ${state.perspective === value ? 'active' : ''}`} onClick={() => spaceUiStore.setPerspective(value)}>{label}</button>)}
            </div>
          </div>
          <div className="settings-row" id="setting-cam-dist-row" style={{ display: state.perspective === 'first_person' ? 'none' : 'flex' }}>
            <div className="settings-label-group"><span className="settings-label">Third Person Distance</span><span className="settings-desc">Camera offset distance from player</span></div>
            <div className="settings-control-group"><input id="setting-cam-dist-slider" className="settings-slider" type="range" min="2" max="8" step="0.5" value={state.cameraDistance} onChange={event => spaceUiStore.setCameraDistance(Number(event.target.value))} /><span id="setting-cam-dist-val" className="settings-value-badge">{state.cameraDistance.toFixed(1)} m</span></div>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-title">PHYSICS &amp; ENVIRONMENT</div>
          <div className="settings-row">
            <div className="settings-label-group"><span className="settings-label">Entity Gravity</span><span className="settings-desc">Rigid body world gravity simulation</span></div>
            <div className="settings-segmented-control" id="setting-gravity-group">
              {([[-18, 'Standard (-18)'], [-5, 'Moon (-5)'], [0, 'Zero-G (0)']] as const).map(([value, label]) => <button key={value} className={`segment-btn ${state.gravity === value ? 'active' : ''}`} onClick={() => spaceUiStore.setGravity(value)}>{label}</button>)}
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-label-group"><span className="settings-label">Chunk Render Distance</span><span className="settings-desc">Voxel terrain mesh streaming radius (4 ~ 20 chunks)</span></div>
            <div className="settings-control-group"><input id="setting-render-dist-slider" className="settings-slider" type="range" min="4" max="20" step="1" value={state.renderDistance} onChange={event => spaceUiStore.setRenderDistance(Number(event.target.value))} /><span id="setting-render-dist-val" className="settings-value-badge">{state.renderDistance} Chunks</span></div>
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
}

export function BlueprintsModal() {
  const open = useSpaceUi(state => state.activeModal === 'blueprints');
  if (!open) return null;
  return (
    <ModalBackdrop id="blueprints-modal" onClose={() => spaceUiStore.toggleBlueprintsModal(false)}>
      <div className="modal-content large">
        <div className="modal-header"><h2>Structure Blueprints</h2><button id="close-blueprints-btn" className="icon-btn" style={{ width: 28, height: 28, fontSize: 13 }} onClick={() => spaceUiStore.toggleBlueprintsModal(false)}>✕</button></div>
        <div className="modal-sub">Click to spawn a colored structure in front of you — ready to use!</div>
        <div id="blueprints-grid" className="blueprints-grid">
          {spaceUiStore.getBlueprints().map(blueprint => (
            <div className="blueprint-card" key={blueprint.id || blueprint.name}>
              <div className="bp-header"><span className="bp-title">{blueprint.name}</span><span className="bp-mode-badge">{blueprint.defaultMode}</span></div>
              <div className="bp-desc">{blueprint.description}</div>
              <div className="bp-actions">
                <button className="bp-btn assemble-direct" onClick={() => { spaceUiStore.spawnBlueprintDirect(blueprint); spaceUiStore.toggleBlueprintsModal(false); }}>Assemble Directly</button>
                <button className="bp-btn spawn-world" onClick={() => { spaceUiStore.spawnBlueprintToWorld(blueprint); spaceUiStore.toggleBlueprintsModal(false); }}>Place as Blocks</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ModalBackdrop>
  );
}

export function PauseScreen() {
  const hasStarted = useSpaceUi(state => state.hasStarted);
  return (
    <div id="pause-screen" className={hasStarted ? 'hidden' : ''}>
      <div className="hero-box">
        <div className="hero-gear-icon">✦</div>
        <h1 className="game-logo">EntropyDrop · Space</h1>
        <p className="game-sub">Build anything. Tell it what to do. · AI-native programmable voxel physics</p>
        <div className="features-highlight">
          <div className="feat-item"><span className="feat-icon">✦</span><b>Behavior via Natural Language</b><p>Point at an entity and press C — say &quot;follow me&quot; or &quot;hover 5 meters&quot; to generate code</p></div>
          <div className="feat-item"><span className="feat-icon">⬡</span><b>One Block · Any Color</b><p>Material type never limits your shape; instant color with palette, brush, and pipette</p></div>
          <div className="feat-item"><span className="feat-icon">⚡</span><b>Dual-Scale Micro-Carving</b><p>The shovel edits standard 1m blocks; the spoon carves each into 5x5x5 micro voxels</p></div>
        </div>
        <div className="controls-guide">
          <span><kbd className="key-badge">W</kbd><kbd className="key-badge">A</kbd><kbd className="key-badge">S</kbd><kbd className="key-badge">D</kbd> Move / Drive</span>
          <span><kbd className="key-badge">Space</kbd> Jump / Ascend</span>
          <span><kbd className="key-badge">Shift+1-9</kbd> Palette color / Backpack slot</span>
          <span><kbd className="key-badge">E</kbd> Backpack / Set colors</span>
          <span><kbd className="key-badge">1</kbd> Shovel: remove / place 1m blocks</span>
          <span><kbd className="key-badge">2</kbd> Spoon: micro-carve 5x5x5</span>
          <span><kbd className="key-badge">3</kbd> Brush: paint / right-click sample</span>
          <span><kbd className="key-badge">MMB</kbd> Sample color anywhere</span>
          <span><kbd className="key-badge">4</kbd> Selector: box select (max 64×64×64) · Tab standard/micro blocks · R copy</span>
          <span><kbd className="key-badge">5</kbd> Hammer: preview &amp; LMB build / RMB overwrite</span>
          <span><kbd className="key-badge">6</kbd> Wrench: LMB drag force · RMB start/stop</span>
          <span><kbd className="key-badge">Shift+Click</kbd> Multi-select component blocks</span>
          <span><kbd className="key-badge">C</kbd> Entity editor</span>
          <span><kbd className="key-badge">G</kbd> Assemble physics entity</span>
          <span><kbd className="key-badge">V</kbd> Mount / leave drivable entity</span>
          <span><kbd className="key-badge">B</kbd> Structure blueprint library</span>
          <span><kbd className="key-badge">F</kbd> Fly mode</span>
          <span><kbd className="key-badge">F3</kbd> Cycle 1st / 3rd Back / 3rd Front</span>
          <span><kbd className="key-badge">ESC</kbd> Settings / release cursor</span>
        </div>
        <button id="start-btn" className="start-btn" onClick={() => spaceUiStore.startGame()}>Enter Space</button>
      </div>
    </div>
  );
}
