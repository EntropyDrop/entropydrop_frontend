import React, { useEffect, useState } from 'react';
import { ContraptionMode } from '../../../engine/contraption/Contraption.ts';
import { SpecialTool } from '../../../engine/controls/PlayerController.ts';
import { InventoryThumbnailRenderer } from '../../../engine/render/InventoryThumbnailRenderer.ts';
import { spaceUiStore } from '../store/SpaceUiStore.ts';
import { useSpaceUi } from '../store/useSpaceUi.ts';

const SELECTOR_ICON = (
  <svg className="slot-pixel-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
    <path d="M3 3h6v2H5v4H3V3zm12 0h6v6h-2V5h-4V3zM3 15h2v4h4v2H3v-6zm18 0v6h-6v-2h4v-4h2zM9 9h6v6H9V9zm2 2v2h2v-2h-2z" />
  </svg>
);

function NearbyEntities() {
  const { nearbyEntities, navigationSystem } = useSpaceUi(state => state);
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 3;
  const pageCount = Math.max(1, Math.ceil(nearbyEntities.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = nearbyEntities.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <div className="hud-entities-section" id="hud-entities-section">
      <div
        className="hud-entities-header"
        id="hud-entities-toggle"
        role="button"
        tabIndex={0}
        title="Toggle nearby entities list"
        onClick={() => setExpanded(value => !value)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') setExpanded(value => !value);
        }}
      >
        <div className="hud-entities-title">
          <span className="hud-entities-icon">⬡</span>
          <span>Nearby Entities (<span id="hud-entities-count">{nearbyEntities.length}</span>)</span>
        </div>
        <button
          type="button"
          id="hud-entities-toggle-btn"
          className={`hud-entities-toggle-btn ${expanded ? 'expanded' : ''}`}
          aria-label="Toggle entities list"
          onClick={event => {
            event.stopPropagation();
            setExpanded(value => !value);
          }}
        >▼</button>
      </div>
      <div className="hud-entities-body" id="hud-entities-body" style={{ display: expanded ? 'flex' : 'none' }}>
        <div className="hud-entities-list" id="hud-entities-list">
          {rows.length === 0 ? <div className="hud-entity-empty">No entities detected nearby</div> : rows.map(item => (
            <div className="hud-entity-item" key={`${item.type}:${item.id}`}>
              <div className="hud-entity-info">
                <div className="hud-entity-name" title={item.name}>{item.name}</div>
                <div className="hud-entity-meta">
                  <span className="hud-entity-pos">X:{item.pos.x.toFixed(0)} Y:{item.pos.y.toFixed(0)} Z:{item.pos.z.toFixed(0)}</span>
                  <span className="hud-entity-dist">{item.dist < 1000 ? `${item.dist.toFixed(1)}m` : `${(item.dist / 1000).toFixed(2)}km`}</span>
                </div>
              </div>
              <button
                type="button"
                className="hud-entity-nav-btn"
                title={`Autopilot to ${item.name}`}
                onClick={() => navigationSystem?.startNavigation?.(item.pos.x, Math.max(item.pos.y + 1.5, 20), item.pos.z)}
              >NAV</button>
            </div>
          ))}
        </div>
        <div className="hud-entities-pagination" id="hud-entities-pagination" style={{ display: pageCount > 1 ? 'flex' : 'none' }}>
          <button type="button" id="hud-entities-prev-btn" className="hud-page-btn" disabled={currentPage <= 1} title="Previous page" onClick={() => setPage(value => Math.max(1, value - 1))}>◀</button>
          <span id="hud-entities-page-info" className="hud-page-info">{currentPage} / {pageCount}</span>
          <button type="button" id="hud-entities-next-btn" className="hud-page-btn" disabled={currentPage >= pageCount} title="Next page" onClick={() => setPage(value => Math.min(pageCount, value + 1))}>▶</button>
        </div>
      </div>
    </div>
  );
}

function PaletteBar() {
  const { paletteColors, selectedColorIndex } = useSpaceUi(state => state);
  return (
    <div className="color-palette-bar-wrapper" id="color-palette-wrapper">
      <div className="palette-info-row">
        <span className="palette-title">Palette</span>
        <span className="palette-hotkey-hint"><b>Shift+1~9</b> pick · <b>E</b> set colors</span>
      </div>
      <div id="color-palette-bar" className="color-palette-bar">
        {paletteColors.map((item, index) => (
          <button
            type="button"
            key={`${item.hex}:${index}`}
            className={`color-chip ${index === selectedColorIndex ? 'active' : ''}`}
            style={{ backgroundColor: item.hex }}
            title={`${item.name || 'Custom'} (${item.hex.toUpperCase()}) · Shift+${index + 1}`}
            onClick={() => spaceUiStore.selectPresetColor(index)}
          ><span className="chip-num">{index + 1}</span></button>
        ))}
      </div>
    </div>
  );
}

function InventoryBar() {
  const { controller, activeInventoryCategory, selectedInventoryIndex } = useSpaceUi(state => state);
  const category = activeInventoryCategory === 'entity' ? 'entity' : 'blockset';
  const items = controller?.inventories?.[category]?.items || [];
  const renderer = InventoryThumbnailRenderer.getInstance();
  return (
    <div className="inventory-bar-wrapper" id="inventory-bar-wrapper">
      <div className="palette-info-row">
        <div className="palette-title-group">
          <button type="button" className="palette-title" id="backpack-bar-title" title="Click or press E to open full backpack" onClick={() => spaceUiStore.toggleInventoryModal(true)}>Backpack</button>
          <div id="inv-cat-tabs" className="inv-cat-tabs">
            {(['blockset', 'entity'] as const).map(key => (
              <button type="button" key={key} className={`inv-cat-tab ${category === key ? 'active' : ''}`} onClick={() => spaceUiStore.selectInventoryCategory(key)}>{key === 'blockset' ? 'BKS' : 'ENT'}</button>
            ))}
          </div>
        </div>
        <span className="palette-hotkey-hint"><b>E</b> Full Backpack · <b>Tab</b> BKS↔ENT</span>
      </div>
      <div id="inventory-bar" className="inventory-bar">
        {Array.from({ length: 9 }, (_, index) => {
          const item = items[index];
          const count = item?.blockCount || item?.blocks?.length || 0;
          const name = item ? controller?.inventoryItemName?.(category, item, index) || item.name || `Slot ${index + 1}` : '';
          const thumbnail = item ? renderer.getThumbnail(item, 64) : null;
          return (
            <button
              type="button"
              key={index}
              className={`inventory-slot ${selectedInventoryIndex === index ? 'active' : ''} ${item ? 'filled' : 'empty'}`}
              title={item ? `Slot ${index + 1}: "${name}" · ${count} blocks · Shift+${index + 1}` : `Slot ${index + 1}: empty · Shift+${index + 1}`}
              onClick={() => spaceUiStore.selectInventorySlot(index)}
            >
              {thumbnail ? <img className="inv-slot-thumb" src={thumbnail} alt={name} draggable={false} /> : null}
              {item ? <span className="inv-slot-count">{count}</span> : <span className="inv-slot-empty">-</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WrenchChargeRing() {
  const strength = useSpaceUi(state => state.wrenchChargeStrength);
  if (strength === null) return null;
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.round(strength * 100);
  return (
    <div id="wrench-charge-ring" className={`wrench-charge-ring ${strength >= 1 ? 'full' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <circle className="wrench-charge-track" cx="32" cy="32" r={radius} />
        <circle
          className="wrench-charge-progress"
          cx="32"
          cy="32"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - strength)}
        />
      </svg>
      <span>{percent}%</span>
    </div>
  );
}

function SelectorPanel() {
  const { selector, controller } = useSpaceUi(state => state);
  return (
    <div className="selector-panel-wrapper" id="selector-panel-wrapper">
      <div className="palette-info-row">
        <div className="selector-title-group">
          <span className="palette-title">Selector</span>
          <button id="selector-mode-toggle" className="selector-mode-btn" title="Click or press Tab to switch mode" onClick={() => controller?.toggleSelectorMicroMode?.()}>
            <span id="selector-mode-badge" className={`mode-badge ${selector.micro ? 'micro' : 'std'}`}>{selector.micro ? 'MICRO' : 'STANDARD'}</span>
            <span className="mode-tab-hint">Tab ⇋</span>
          </button>
        </div>
        <span className="palette-hotkey-hint"><b>Tab</b> mode · <b>R</b> copy · <b>G</b> assemble</span>
      </div>
      <div className="selector-toolbox-content" id="selector-toolbox-content">
        <div className="selector-status-col">
          <div className="selector-status-main"><span className="selector-icon">⬡</span><span id="selector-panel-title" className="selector-status-title">{selector.title}</span></div>
          <div id="selector-panel-details" className="selector-status-sub">{selector.details}</div>
        </div>
        <div className="selector-action-buttons">
          <button id="assemble-btn" className="banner-btn primary" disabled={!selector.canAssemble} onClick={() => controller?.assembleSelection?.(ContraptionMode.PROGRAMMABLE)}>{selector.assembleLabel}</button>
          <button id="copy-btn" className="banner-btn secondary" title="Copy selection to backpack (R)" disabled={!selector.canCopy} onClick={() => controller?.copySelectionSmart?.()}>Copy (R)</button>
        </div>
      </div>
    </div>
  );
}

function Hotbar() {
  const { hotbarSlots, selectedHotbarIndex, selector } = useSpaceUi(state => state);
  return (
    <div id="hotbar">
      {hotbarSlots.map((slot, index) => (
        <button type="button" key={slot.value} className={`hotbar-slot ${index === selectedHotbarIndex ? 'active' : ''}`} onClick={() => spaceUiStore.selectHotbarSlot(index)}>
          <span className="slot-num">{index + 1}</span>
          <span className="slot-icon">{slot.value === SpecialTool.SELECTOR ? SELECTOR_ICON : slot.icon}</span>
          <span className="slot-name">{slot.name}</span>
          {slot.value === SpecialTool.SELECTOR ? <span className={`slot-mode-badge ${selector.micro ? 'micro' : 'std'}`}>{selector.micro ? 'MICRO' : 'STD'}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Hud() {
  const state = useSpaceUi(snapshot => snapshot);
  const activeTool = state.hotbarSlots[state.selectedHotbarIndex]?.value;
  return (
    <>
      <div id="crosshair" />
      <WrenchChargeRing />
      <div id="hud-overlay">
        <div className="hud-top">
          <div className="hud-card">
            <div className="hud-badge"><span className="hud-badge-dot" />EntropyDrop · Space</div>
            <div className="hud-metrics-row"><span id="fps-val">{state.fpsText}</span><span className="hud-metric-sep">·</span><span id="ping-val" className={state.pingClass}>{state.pingText}</span></div>
            <div id="pos-val">{state.positionText}</div>
            <NearbyEntities />
          </div>
          <div className="hud-actions"><button id="global-settings-btn" className="icon-btn" title="Global Settings (O)" onClick={() => spaceUiStore.toggleGlobalSettingsModal(true)}>⚙</button></div>
        </div>
        <div className="hud-bottom">
          <div className="builder-toolbar">
            <div className="toolbar-center-panel">
              {activeTool === SpecialTool.HAMMER ? <InventoryBar /> : activeTool === SpecialTool.SELECTOR ? <SelectorPanel /> : <PaletteBar />}
              <Hotbar />
            </div>
          </div>
        </div>
      </div>
      <div id="toast" className={`toast ${state.toast ? 'show' : ''}`}>{state.toast?.message || ''}</div>
    </>
  );
}
