import React from 'react';
import { useSpaceStore } from '../../store/useSpaceStore.ts';

export const SelectorPanel: React.FC = () => {
  const selectorMicroMode = useSpaceStore((s) => s.selectorMicroMode);
  const selectorTitle = useSpaceStore((s) => s.selectorTitle);
  const selectorDetails = useSpaceStore((s) => s.selectorDetails);
  const canAssemble = useSpaceStore((s) => s.canAssemble);
  const assembleLabel = useSpaceStore((s) => s.assembleLabel);
  const canCopy = useSpaceStore((s) => s.canCopy);
  const setSelectorMicroMode = useSpaceStore((s) => s.setSelectorMicroMode);
  const controller = useSpaceStore((s) => s.controller);

  const handleAssemble = () => {
    if (controller) {
      if (controller.selectedBlockSelection) {
        controller.createChildFromSelectedBlocks?.();
      } else {
        controller.assembleSelection?.();
      }
    }
  };

  const handleCopy = () => {
    if (controller) {
      controller.copySelectionSmart?.();
    }
  };

  const handleClear = () => {
    if (controller) {
      controller.clearSelection?.();
    }
  };

  return (
    <div className="selector-panel" id="selector-panel">
      <div className="selector-mode-badge" onClick={() => setSelectorMicroMode(!selectorMicroMode)} title="Toggle mode (Tab)">
        <span className="selector-mode-name">{selectorMicroMode ? 'MICRO (0.2m)' : 'STANDARD (1m)'}</span>
        <kbd className="key-badge">Tab</kbd>
      </div>

      <div className="selector-info">
        <div className="selector-title">{selectorTitle}</div>
        <div className="selector-details">{selectorDetails}</div>
      </div>

      <div className="selector-actions">
        {canAssemble && (
          <button type="button" className="selector-action-btn primary" onClick={handleAssemble}>
            {assembleLabel} <kbd className="key-badge">G</kbd>
          </button>
        )}
        {canCopy && (
          <button type="button" className="selector-action-btn" onClick={handleCopy}>
            Copy <kbd className="key-badge">R</kbd>
          </button>
        )}
        <button type="button" className="selector-action-btn danger" onClick={handleClear}>
          Clear <kbd className="key-badge">Del</kbd>
        </button>
      </div>
    </div>
  );
};
