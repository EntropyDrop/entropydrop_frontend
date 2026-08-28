import React from 'react';
import { useSpaceStore } from '../../store/useSpaceStore.ts';
import { SpecialTool } from '../../../../engine/controls/PlayerController.ts';

const TOOL_ICONS: Record<string, string> = {
  [SpecialTool.SHOVEL]: '⛏',
  [SpecialTool.SPOON]: '🥄',
  [SpecialTool.BRUSH]: '🖌',
  [SpecialTool.SELECTOR]: '⛶',
  [SpecialTool.HAMMER]: '🔨',
  [SpecialTool.WRENCH]: '🔧',
  [SpecialTool.SUPER_GLUE]: '⛶',
  [SpecialTool.PIPETTE]: '🖌'
};

export const Hotbar: React.FC = () => {
  const hotbarSlots = useSpaceStore((s) => s.hotbarSlots);
  const selectedHotbarIndex = useSpaceStore((s) => s.selectedHotbarIndex);
  const selectHotbarSlot = useSpaceStore((s) => s.selectHotbarSlot);

  return (
    <div className="hotbar" id="hotbar" role="toolbar" aria-label="Tool hotbar">
      {hotbarSlots.map((slot, index) => {
        const isSelected = selectedHotbarIndex === index;
        const icon = TOOL_ICONS[slot.value] || '⛏';
        return (
          <div
            key={slot.value}
            className={`slot ${isSelected ? 'active' : ''}`}
            onClick={() => selectHotbarSlot(index)}
            title={`${slot.name} (${slot.key}) · ${slot.desc}`}
          >
            <span className="slot-key">{slot.key}</span>
            <span className="slot-icon">{icon}</span>
            <span className="slot-name">{slot.name}</span>
          </div>
        );
      })}
    </div>
  );
};
