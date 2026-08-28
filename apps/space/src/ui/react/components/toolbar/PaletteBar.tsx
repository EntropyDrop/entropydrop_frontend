import React from 'react';
import { useSpaceStore } from '../../store/useSpaceStore.ts';
import { colorToHex } from '../../../../engine/voxel/BlockTypes.ts';

export const PaletteBar: React.FC = () => {
  const paletteColors = useSpaceStore((s) => s.paletteColors);
  const selectedColor = useSpaceStore((s) => s.selectedColor);
  const setBuildColor = useSpaceStore((s) => s.setBuildColor);

  const currentHex = colorToHex(selectedColor);

  return (
    <div className="color-palette-bar-wrapper" id="color-palette-wrapper">
      <div className="palette-info-row">
        <span className="palette-title">Palette</span>
        <span className="palette-hotkey-hint"><b>Shift+1~9</b> pick · <b>E</b> set colors</span>
      </div>
      <div id="color-palette-bar" className="color-palette-bar">
        {paletteColors.map((col, index) => {
          const isSelected = col.hex.toLowerCase() === currentHex.toLowerCase();
          return (
            <div
              key={col.hex + index}
              className={`color-chip ${isSelected ? 'active' : ''}`}
              style={{ backgroundColor: col.hex }}
              onClick={() => setBuildColor(col.hex)}
              title={`${col.name || 'Custom'} (${col.hex.toUpperCase()})${index < 9 ? ` · Shift+${index + 1}` : ''}`}
            >
              {index < 9 && <span className="chip-num">{index + 1}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};
