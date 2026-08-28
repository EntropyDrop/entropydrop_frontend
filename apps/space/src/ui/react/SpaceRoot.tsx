import React from 'react';
import { TopBar } from './components/hud/TopBar.tsx';
import { BottomToolbar } from './components/toolbar/BottomToolbar.tsx';
import { BackpackModal } from './components/modals/BackpackModal.tsx';
import { BlueprintsModal } from './components/modals/BlueprintsModal.tsx';
import { GlobalSettingsModal } from './components/modals/GlobalSettingsModal.tsx';
import { CodeEditorModal } from './components/modals/CodeEditorModal.tsx';
import { PauseScreen } from './components/modals/PauseScreen.tsx';
import { ToastContainer } from './components/common/ToastContainer.tsx';

export const SpaceRoot: React.FC = () => {
  return (
    <>
      {/* Center Crosshair */}
      <div id="crosshair" />

      {/* HUD Interface Overlay */}
      <div id="hud-overlay">
        <TopBar />
        <BottomToolbar />
      </div>

      {/* Toast Notification */}
      <ToastContainer />

      {/* Modals & Overlays */}
      <BackpackModal />
      <BlueprintsModal />
      <GlobalSettingsModal />
      <CodeEditorModal />
      <PauseScreen />
    </>
  );
};
