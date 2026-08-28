import React from 'react';
import { useSpaceStore } from '../../store/useSpaceStore.ts';
import { colorToHex } from '../../../../engine/voxel/BlockTypes.ts';

export const PaletteBar: React.FC = () => {
  const paletteColors = useSpaceStore((s) => s.paletteColors);
  const selectedColor = useSpaceStore((s) => s.selectedColor);
  const setBuildColor = useSpaceStore((s) => s.setBuildColor);

  const currentHex = colorToHex(selectedColor);

  return (
    <div className="palette-bar" id="palette-bar">
      <div className="palette-title">Palette</div>
      <div className="palette-chips">
        {paletteColors.map((col, index) => {
          const isSelected = col.hex.toLowerCase() === currentHex.toLowerCase();
          return (
            <div
              key={col.hex + index}
              className={`palette-chip ${isSelected ? 'selected' : ''}`}
              style={{ backgroundColor: col.hex }}
              onClick={() => setBuildColor(col.hex)}
              title={`${col.name} (Shift+${index + 1}) · ${col.hex}`}
            >
              <span className="palette-chip-key">{index + 1}</span>
            </div>
          );
        })}
      </div>
      <div className="palette-custom-picker">
        <input
          type="color"
          value={currentHex}
          onChange={(e) => setBuildColor(e.target.value)}
          title="Pick custom build color"
        />
      </div>
    </div>
  );
};
