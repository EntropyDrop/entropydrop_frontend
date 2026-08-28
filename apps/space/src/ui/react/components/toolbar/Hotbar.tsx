import React from 'react';
import { useSpaceStore } from '../../store/useSpaceStore.ts';
import { SpecialTool } from '../../../../engine/controls/PlayerController.ts';

const TOOL_PIXEL_ICONS: Record<string, string> = {
  [SpecialTool.SHOVEL]: '',
  [SpecialTool.SPOON]: '',
  [SpecialTool.BRUSH]: '',
  [SpecialTool.SELECTOR]: `<svg class="slot-pixel-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 3h6v2H5v4H3V3zm12 0h6v6h-2V5h-4V3zM3 15h2v4h4v2H3v-6zm18 0v6h-6v-2h4v-4h2zM9 9h6v6H9V9zm2 2v2h2v-2h-2z"/></svg>`,
  [SpecialTool.HAMMER]: '',
  [SpecialTool.WRENCH]: ''
};

export const Hotbar: React.FC = () => {
  const hotbarSlots = useSpaceStore((s) => s.hotbarSlots);
  const selectedHotbarIndex = useSpaceStore((s) => s.selectedHotbarIndex);
  const selectHotbarSlot = useSpaceStore((s) => s.selectHotbarSlot);
  const selectorMicroMode = useSpaceStore((s) => s.selectorMicroMode);

  return (
    <div id="hotbar" className="hotbar" role="toolbar" aria-label="Tool hotbar">
      {hotbarSlots.map((slot, index) => {
        const isSelected = selectedHotbarIndex === index;
        const iconSvg = (slot.value && TOOL_PIXEL_ICONS[slot.value] !== undefined)
          ? TOOL_PIXEL_ICONS[slot.value]
          : '';

        const isSelector = slot.value === SpecialTool.SELECTOR || slot.value === SpecialTool.SUPER_GLUE;

        return (
          <div
            key={slot.value}
            className={`hotbar-slot ${isSelected ? 'active' : ''}`}
            onClick={() => selectHotbarSlot(index)}
            title={`${slot.name} (${slot.key}) · ${slot.desc}`}
          >
            <span className="slot-num">{index + 1}</span>
            <span
              className="slot-icon"
              dangerouslySetInnerHTML={{ __html: iconSvg }}
            />
            <span className="slot-name">{slot.name}</span>
            {isSelector && (
              <span className={`slot-mode-badge ${selectorMicroMode ? 'micro' : 'std'}`}>
                {selectorMicroMode ? 'MICRO' : 'STD'}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
