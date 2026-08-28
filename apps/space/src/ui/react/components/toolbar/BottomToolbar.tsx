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

  return (
    <div className="bottom-toolbar-container" style={{ position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', zIndex: 100 }}>
      {isSelector ? (
        <SelectorPanel />
      ) : isHammer ? (
        <InventoryBar />
      ) : (
        <PaletteBar />
      )}

      <Hotbar />
    </div>
  );
};
