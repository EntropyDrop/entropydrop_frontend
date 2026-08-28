import React from 'react';
import { useSpaceStore } from '../../store/useSpaceStore.ts';
import { NearbyEntitiesWidget } from './NearbyEntitiesWidget.tsx';

export const TopBar: React.FC = () => {
  const toggleModal = useSpaceStore((s) => s.toggleModal);
  const controller = useSpaceStore((s) => s.controller);
  const showToast = useSpaceStore((s) => s.showToast);

  const handleFlyToggle = () => {
    if (controller) {
      controller.physics.isFlying = !controller.physics.isFlying;
      showToast(controller.physics.isFlying ? '> FLY MODE ON' : 'FLY MODE OFF');
    }
  };

  const handleCodeToggle = () => {
    if (controller) {
      controller.openCodeEditorForTarget?.();
    } else {
      toggleModal('code');
    }
  };

  return (
    <div className="hud-top" id="hud-top">
      <div className="hud-card">
        <div className="hud-metric-row">
          <span id="fps-val">-- FPS</span>
          <span className="hud-metric-sep">/</span>
          <span id="ping-val" className="hud-ping ping-unknown">-- ms</span>
        </div>
        <div id="pos-val">X: -- | Y: -- | Z: --</div>

        <NearbyEntitiesWidget />
      </div>

      <div className="hud-actions">
        <button
          type="button"
          id="code-terminal-toggle"
          className="hud-action-btn"
          title="Open Code Terminal (C)"
          onClick={handleCodeToggle}
        >
          <svg className="pixel-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M2 4h20v16H2V4zm2 2v12h16V6H4zm3 3h2v2H7V9zm2 2h2v2H9v-2zm-2 2h2v2H7v-2zm6-4h4v2h-4V9zm0 4h4v2h-4v-2z" />
          </svg>
          <span className="btn-label">Code</span>
          <kbd className="key-badge">C</kbd>
        </button>

        <button
          type="button"
          id="inv-toggle"
          className="hud-action-btn"
          title="Open Backpack (E)"
          onClick={() => toggleModal('inventory')}
        >
          <svg className="pixel-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M5 2h14v4h3v16H2V6h3V2zm2 4h10V4H7v2zM4 8v12h16V8H4zm4 2h8v2H8v-2z" />
          </svg>
          <span className="btn-label">Backpack</span>
          <kbd className="key-badge">E</kbd>
        </button>

        <button
          type="button"
          id="blueprints-toggle"
          className="hud-action-btn"
          title="Structure Blueprints (B)"
          onClick={() => toggleModal('blueprints')}
        >
          <svg className="pixel-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M4 2h16v20H4V2zm2 2v16h12V4H6zm2 2h8v2H8V6zm0 4h8v2H8v-2zm0 4h5v2H8v-2z" />
          </svg>
          <span className="btn-label">Blueprints</span>
          <kbd className="key-badge">B</kbd>
        </button>

        <button
          type="button"
          id="fly-toggle"
          className="hud-action-btn"
          title="Toggle Flight Mode (F)"
          onClick={handleFlyToggle}
        >
          <svg className="pixel-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12 2L2 9l10 3 10-3-10-7zm0 13l-8-2.5V17l8 5 8-5v-4.5L12 15z" />
          </svg>
          <span className="btn-label">Fly</span>
          <kbd className="key-badge">F</kbd>
        </button>

        <button
          type="button"
          id="global-settings-btn"
          className="hud-action-btn"
          title="Global Settings"
          onClick={() => toggleModal('settings')}
        >
          <svg className="pixel-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M10 2h4v3h-4V2zm6.36 2.64l2.83 2.83-2.12 2.12-2.83-2.83 2.12-2.12zM19 10h3v4h-3v-4zm-2.64 6.36l2.12 2.12-2.83 2.83-2.12-2.12 2.83-2.83zM10 19h4v3h-4v-3zm-6.36-2.64l2.12-2.12 2.83 2.83-2.12 2.12-2.83-2.83zM2 10h3v4H2v-4zm2.64-6.36l2.83-2.83 2.12 2.12-2.83 2.83-2.12-2.12zM12 8a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
        </button>
      </div>
    </div>
  );
};
