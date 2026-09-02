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
        <div className="modal-header"><h2>Global Settings</h2><button id="close-global-settings-btn" tabIndex={-1} className="icon-btn" style={{ width: 28, height: 28, fontSize: 13 }} title="Close settings (ESC)" onClick={() => spaceUiStore.toggleGlobalSettingsModal(false)}>✕</button></div>
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
              ] as const).map(([value, label]) => <button key={value} tabIndex={-1} className={`segment-btn ${state.perspective === value ? 'active' : ''}`} onClick={() => spaceUiStore.setPerspective(value)}>{label}</button>)}
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
              {([[-18, 'Standard (-18)'], [-5, 'Moon (-5)'], [0, 'Zero-G (0)']] as const).map(([value, label]) => <button key={value} tabIndex={-1} className={`segment-btn ${state.gravity === value ? 'active' : ''}`} onClick={() => spaceUiStore.setGravity(value)}>{label}</button>)}
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-label-group"><span className="settings-label">Chunk Render Distance</span><span className="settings-desc">Voxel terrain mesh streaming radius (4 ~ 20 chunks)</span></div>
            <div className="settings-control-group"><input id="setting-render-dist-slider" className="settings-slider" type="range" min="4" max="20" step="1" value={state.renderDistance} onChange={event => spaceUiStore.setRenderDistance(Number(event.target.value))} /><span id="setting-render-dist-val" className="settings-value-badge">{state.renderDistance} Chunks</span></div>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-title">AUDIO &amp; SOUND</div>
          <div className="settings-row">
            <div className="settings-label-group"><span className="settings-label">Mute Audio</span><span className="settings-desc">Disable all procedural sound effects and mechanical audio</span></div>
            <div className="settings-segmented-control" id="setting-mute-group">
              {([
                [false, 'Sound ON'],
                [true, 'Muted']
              ] as const).map(([value, label]) => (
                <button
                  key={String(value)}
                  tabIndex={-1}
                  className={`segment-btn ${state.isMuted === value ? 'active' : ''}`}
                  onClick={() => spaceUiStore.setMuted(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
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
        <div className="hero-block-icon">■</div>
        <h1 className="game-logo">EntropyDrop · Space <span className="game-logo-beta">BETA</span></h1>
        <div className="controls-guide">
          <span><kbd className="key-badge">W</kbd><kbd className="key-badge">A</kbd><kbd className="key-badge">S</kbd><kbd className="key-badge">D</kbd> Move / Drive</span>
          <span><kbd className="key-badge">Space</kbd> Jump / Ascend</span>
          <span><kbd className="key-badge">Shift+1-9</kbd> Palette color / Backpack slot</span>
          <span><kbd className="key-badge">E</kbd> Backpack / Set colors</span>
          <span><kbd className="key-badge">1</kbd> Shovel: remove / place 1m blocks</span>
          <span><kbd className="key-badge">2</kbd> Spoon: micro-carve 5x5x5</span>
          <span><kbd className="key-badge">3</kbd> Selector: box select (max 64×64×64) · Tab standard/micro blocks · R copy</span>
          <span><kbd className="key-badge">4</kbd> Hammer: LMB build / attach to entity · RMB rotate 90°</span>
          <span><kbd className="key-badge">5</kbd> Wrench: drag pivot axis · click origin to reset · hold LMB to grab · RMB start/stop</span>
          <span><kbd className="key-badge">6</kbd> Brush: paint / right-click sample · Tab micro/standard</span>
          <span><kbd className="key-badge">Shift+Click</kbd> Multi-select component blocks</span>
          <span><kbd className="key-badge">C</kbd> Entity editor</span>
          <span><kbd className="key-badge">G</kbd> Assemble physics entity</span>
          <span><kbd className="key-badge">V</kbd> Mount / leave entity seat</span>
          <span><kbd className="key-badge">F</kbd> Fly mode</span>
          <span><kbd className="key-badge">F3</kbd> Cycle 1st / 3rd Back / 3rd Front</span>
          <span><kbd className="key-badge">ESC</kbd> Settings / release cursor</span>
        </div>
        <button id="start-btn" tabIndex={-1} className="start-btn" onClick={() => spaceUiStore.startGame()}>Enter Space</button>
      </div>
    </div>
  );
}
