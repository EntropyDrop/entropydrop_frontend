import React, { useEffect } from 'react';
import { colorToHex } from '../../engine/voxel/BlockTypes.ts';
import { ApiDocsModal, CodeEditorModal } from './components/EditorModal.tsx';
import { Hud } from './components/Hud.tsx';
import { InventoryModal } from './components/InventoryModal.tsx';
import { BlueprintsModal, GlobalSettingsModal, PauseScreen } from './components/SimpleModals.tsx';
import { MinimapCanvas, NavigationPanel } from './components/WorldWidgets.tsx';
import { spaceUiStore } from './store/SpaceUiStore.ts';
import { useSpaceUi } from './store/useSpaceUi.ts';

export function SpaceRoot() {
  const selectedColor = useSpaceUi(state => state.selectedColor);

  useEffect(() => {
    document.documentElement.style.setProperty('--build-color', colorToHex(selectedColor));
  }, [selectedColor]);

  useEffect(() => {
    const handleGlobalKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && spaceUiStore.handleEscape()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter'
        && spaceUiStore.getSnapshot().activeModal === 'code') {
        event.preventDefault();
        event.stopPropagation();
        spaceUiStore.applyAndRunScript();
        spaceUiStore.closeAllModals(true);
        spaceUiStore.showToast('Script saved & applied, back to the game!');
      }
    };
    window.addEventListener('keydown', handleGlobalKey, true);
    return () => window.removeEventListener('keydown', handleGlobalKey, true);
  }, []);

  return (
    <>
      <div id="canvas-container" onClick={() => spaceUiStore.resumeFromCanvas()} />
      <Hud />
      <NavigationPanel />
      <MinimapCanvas />
      <InventoryModal />
      <BlueprintsModal />
      <GlobalSettingsModal />
      <CodeEditorModal />
      <ApiDocsModal />
      <PauseScreen />
    </>
  );
}
