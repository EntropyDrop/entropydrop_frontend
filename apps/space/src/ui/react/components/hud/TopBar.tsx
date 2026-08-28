import React from 'react';
import { useSpaceStore } from '../../store/useSpaceStore.ts';
import { NearbyEntitiesWidget } from './NearbyEntitiesWidget.tsx';

export const TopBar: React.FC = () => {
  const toggleModal = useSpaceStore((s) => s.toggleModal);

  return (
    <div className="hud-top">
      <div className="hud-card">
        <div className="hud-badge"><span className="hud-badge-dot"></span>EntropyDrop · Space</div>
        <div className="hud-metrics-row">
          <span id="fps-val">60 FPS</span>
          <span className="hud-metric-sep">·</span>
          <span id="ping-val" className="hud-ping ping-unknown">-- ms</span>
        </div>
        <div id="pos-val">X: -- | Y: -- | Z: --</div>

        <NearbyEntitiesWidget />
      </div>

      <div className="hud-actions">
        <button
          id="global-settings-btn"
          className="icon-btn"
          title="Global Settings (ESC)"
          onClick={() => toggleModal('settings')}
        >
          ⚙
        </button>
      </div>
    </div>
  );
};
