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

  return (
    <div className="selector-panel-wrapper" id="selector-panel-wrapper">
      <div className="palette-info-row">
        <div className="selector-title-group">
          <span className="palette-title">Selector</span>
          <button
            id="selector-mode-toggle"
            className="selector-mode-btn"
            title="Click or press Tab to switch mode"
            onClick={() => setSelectorMicroMode(!selectorMicroMode)}
          >
            <span id="selector-mode-badge" className={`mode-badge ${selectorMicroMode ? 'micro' : 'std'}`}>
              {selectorMicroMode ? 'MICRO' : 'STANDARD'}
            </span>
            <span className="mode-tab-hint">Tab ⇋</span>
          </button>
        </div>
        <span className="palette-hotkey-hint"><b>Tab</b> mode · <b>R</b> copy · <b>G</b> assemble</span>
      </div>
      <div className="selector-toolbox-content" id="selector-toolbox-content">
        <div className="selector-status-col">
          <div className="selector-status-main">
            <span className="selector-icon">⬡</span>
            <span id="selector-panel-title" className="selector-status-title">{selectorTitle}</span>
          </div>
          <div id="selector-panel-details" className="selector-status-sub">{selectorDetails}</div>
        </div>
        <div className="selector-action-buttons">
          <button
            id="assemble-btn"
            className="banner-btn primary"
            disabled={!canAssemble}
            onClick={handleAssemble}
          >
            {assembleLabel || 'Assemble (G)'}
          </button>
          <button
            id="copy-btn"
            className="banner-btn secondary"
            title="Copy selection to backpack (R)"
            disabled={!canCopy}
            onClick={handleCopy}
          >
            Copy (R)
          </button>
        </div>
      </div>
    </div>
  );
};
