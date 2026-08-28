import React from 'react';
import { useSpaceStore } from '../../store/useSpaceStore.ts';

export const GlobalSettingsModal: React.FC = () => {
  const activeModal = useSpaceStore((s) => s.activeModal);
  const closeAllModals = useSpaceStore((s) => s.closeAllModals);
  const fov = useSpaceStore((s) => s.fov);
  const perspective = useSpaceStore((s) => s.perspective);
  const cameraDistance = useSpaceStore((s) => s.cameraDistance);
  const gravity = useSpaceStore((s) => s.gravity);
  const setSettings = useSpaceStore((s) => s.setSettings);

  if (activeModal !== 'settings') return null;

  return (
    <div className="modal-backdrop show" id="global-settings-modal" onClick={closeAllModals}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h2>SETTINGS &amp; CONTROLS</h2>
          <button type="button" className="modal-close" onClick={closeAllModals}>✕</button>
        </div>
        <div className="modal-sub">
          Graphics, camera perspectives, and physics simulation parameters.
        </div>

        <div className="settings-section" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
          {/* FOV */}
          <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>Field of View (FOV): {fov}°</label>
            <input
              type="range"
              min="50"
              max="110"
              value={fov}
              onChange={(e) => setSettings({ fov: Number(e.target.value) })}
              style={{ width: '180px' }}
            />
          </div>

          {/* Perspective */}
          <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>Camera Perspective (F3)</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                className={`backpack-section-btn ${perspective === 'first_person' ? 'active' : ''}`}
                onClick={() => setSettings({ perspective: 'first_person' })}
              >
                1st Person
              </button>
              <button
                type="button"
                className={`backpack-section-btn ${perspective === 'third_person' ? 'active' : ''}`}
                onClick={() => setSettings({ perspective: 'third_person' })}
              >
                3rd Back
              </button>
              <button
                type="button"
                className={`backpack-section-btn ${perspective === 'third_person_front' ? 'active' : ''}`}
                onClick={() => setSettings({ perspective: 'third_person_front' })}
              >
                3rd Front
              </button>
            </div>
          </div>

          {/* Camera Distance */}
          {perspective !== 'first_person' && (
            <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>Camera Distance: {cameraDistance}m</label>
              <input
                type="range"
                min="2"
                max="15"
                step="0.5"
                value={cameraDistance}
                onChange={(e) => setSettings({ cameraDistance: Number(e.target.value) })}
                style={{ width: '180px' }}
              />
            </div>
          )}

          {/* Gravity */}
          <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>World Gravity: {gravity} m/s²</label>
            <input
              type="range"
              min="0"
              max="50"
              value={gravity}
              onChange={(e) => setSettings({ gravity: Number(e.target.value) })}
              style={{ width: '180px' }}
            />
          </div>

          {/* Keybindings Help Summary */}
          <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-light)', marginBottom: '6px' }}>
              KEYBOARD SHORTCUTS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', fontSize: '10.5px', color: 'var(--text-muted)' }}>
              <div><kbd className="key-badge">WASD</kbd> Move</div>
              <div><kbd className="key-badge">Space</kbd> / <kbd className="key-badge">Shift</kbd> Jump / Crouch</div>
              <div><kbd className="key-badge">1~6</kbd> Select tool</div>
              <div><kbd className="key-badge">Shift+1~9</kbd> Palette color</div>
              <div><kbd className="key-badge">E</kbd> Full Backpack</div>
              <div><kbd className="key-badge">Tab</kbd> Toggle BKS/ENT or Micro</div>
              <div><kbd className="key-badge">R</kbd> Unified Smart Copy</div>
              <div><kbd className="key-badge">G</kbd> Assemble Entity</div>
              <div><kbd className="key-badge">C</kbd> Code Terminal</div>
              <div><kbd className="key-badge">F</kbd> Fly mode</div>
              <div><kbd className="key-badge">F3</kbd> Cycle Perspective</div>
              <div><kbd className="key-badge">ESC</kbd> Settings / Release lock</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
