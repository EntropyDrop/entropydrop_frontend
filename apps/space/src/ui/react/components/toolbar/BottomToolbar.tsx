import React from 'react';
import { useSpaceStore } from '../../store/useSpaceStore.ts';
import { SpecialTool } from '../../../../engine/controls/PlayerController.ts';
import { Hotbar } from './Hotbar.tsx';
import { PaletteBar } from './PaletteBar.tsx';
import { InventoryBar } from './InventoryBar.tsx';
import { SelectorPanel } from './SelectorPanel.tsx';

export const BottomToolbar: React.FC = () => {
  const activeTool = useSpaceStore((s) => s.activeTool);

  const isSelector = activeTool === SpecialTool.SELECTOR || activeTool === SpecialTool.SUPER_GLUE;
  const isHammer = activeTool === SpecialTool.HAMMER;
  const isPalette = !isSelector && !isHammer;

  return (
    <div className="hud-bottom">
      <div className="builder-toolbar">
        <div className="toolbar-center-panel">
          {isPalette && <PaletteBar />}
          {isHammer && <InventoryBar />}
          {isSelector && <SelectorPanel />}
          <Hotbar />
        </div>
      </div>
    </div>
  );
};
