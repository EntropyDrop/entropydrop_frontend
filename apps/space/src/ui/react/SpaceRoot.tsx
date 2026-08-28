import React from 'react';
import { TopBar } from './components/hud/TopBar.tsx';
import { AutoPilotPanel } from './components/hud/AutoPilotPanel.tsx';
import { BottomToolbar } from './components/toolbar/BottomToolbar.tsx';
import { BackpackModal } from './components/modals/BackpackModal.tsx';
import { BlueprintsModal } from './components/modals/BlueprintsModal.tsx';
import { GlobalSettingsModal } from './components/modals/GlobalSettingsModal.tsx';
import { CodeEditorModal } from './components/modals/CodeEditorModal.tsx';
import { PauseScreen } from './components/modals/PauseScreen.tsx';
import { ToastContainer } from './components/common/ToastContainer.tsx';

export const SpaceRoot: React.FC = () => {
  return (
    <div className="space-ui-overlay" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
      {/* Interactive UI layers */}
      <div style={{ pointerEvents: 'auto' }}>
        <TopBar />
        <AutoPilotPanel />
        <BottomToolbar />

        {/* Modals & Overlays */}
        <BackpackModal />
        <BlueprintsModal />
        <GlobalSettingsModal />
        <CodeEditorModal />
        <PauseScreen />
        <ToastContainer />
      </div>

      {/* Crosshair */}
      <div
        id="crosshair"
        className="hud-crosshair"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 40
        }}
      />
    </div>
  );
};
