import React, { useEffect, useState } from 'react';
import {
  LiaCubeSolid,
  LiaUtensilSpoonSolid,
  LiaPaintBrushSolid,
  LiaVectorSquareSolid,
  LiaHammerSolid,
  LiaWrenchSolid,
  LiaCogSolid,
  LiaAngleLeftSolid,
  LiaAngleRightSolid,
  LiaAngleDownSolid,
  LiaExchangeAltSolid,
  LiaShapesSolid,
  LiaBoxesSolid
} from 'react-icons/lia';
import { ContraptionMode } from '../../../engine/contraption/Contraption.ts';
import { SpecialTool } from '../../../engine/controls/PlayerController.ts';
import { InventoryThumbnailRenderer } from '../../../engine/render/InventoryThumbnailRenderer.ts';
import { spaceUiStore } from '../store/SpaceUiStore.ts';
import { useSpaceUi } from '../store/useSpaceUi.ts';

import { LuShovel } from "react-icons/lu";
function getHotbarToolIcon(toolValue: string): React.ReactNode {
  switch (toolValue) {
    case SpecialTool.SHOVEL:
      return <LuShovel size={20} className="slot-pixel-icon" aria-hidden="true" />;
    case SpecialTool.SPOON:
      return <LiaUtensilSpoonSolid size={20} className="slot-pixel-icon" aria-hidden="true" />;
    case SpecialTool.BRUSH:
      return <LiaPaintBrushSolid size={20} className="slot-pixel-icon" aria-hidden="true" />;
    case SpecialTool.SELECTOR:
      return <LiaVectorSquareSolid size={20} className="slot-pixel-icon" aria-hidden="true" />;
    case SpecialTool.HAMMER:
      return <LiaHammerSolid size={20} className="slot-pixel-icon" aria-hidden="true" />;
    case SpecialTool.WRENCH:
      return <LiaWrenchSolid size={20} className="slot-pixel-icon" aria-hidden="true" />;
    default:
      return <LiaCubeSolid size={20} className="slot-pixel-icon" aria-hidden="true" />;
  }
}

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
        tabIndex={-1}
        title="Toggle nearby entities list"
        onClick={() => setExpanded(value => !value)}
        onKeyDown={event => {
          if (event.key === 'Enter') setExpanded(value => !value);
        }}
      >
        <div className="hud-entities-title">
          <span className="hud-entities-icon"><LiaShapesSolid size={14} /></span>
          <span>Nearby Entities (<span id="hud-entities-count">{nearbyEntities.length}</span>)</span>
        </div>
        <button
          type="button"
          id="hud-entities-toggle-btn"
          tabIndex={-1}
          className={`hud-entities-toggle-btn ${expanded ? 'expanded' : ''}`}
          aria-label="Toggle entities list"
          onClick={event => {
            event.stopPropagation();
            setExpanded(value => !value);
          }}
        >
          <LiaAngleDownSolid style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
        </button>
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
                tabIndex={-1}
                className="hud-entity-nav-btn"
                title={`Autopilot to ${item.name}`}
                onClick={() => navigationSystem?.startNavigation?.(item.pos.x, Math.max(item.pos.y + 1.5, 20), item.pos.z)}
              >NAV</button>
            </div>
          ))}
        </div>
        <div className="hud-entities-pagination" id="hud-entities-pagination" style={{ display: pageCount > 1 ? 'flex' : 'none' }}>
          <button type="button" id="hud-entities-prev-btn" tabIndex={-1} className="hud-page-btn" disabled={currentPage <= 1} title="Previous page" onClick={() => setPage(value => Math.max(1, value - 1))}>
            <LiaAngleLeftSolid />
          </button>
          <span id="hud-entities-page-info" className="hud-page-info">{currentPage} / {pageCount}</span>
          <button type="button" id="hud-entities-next-btn" tabIndex={-1} className="hud-page-btn" disabled={currentPage >= pageCount} title="Next page" onClick={() => setPage(value => Math.min(pageCount, value + 1))}>
            <LiaAngleRightSolid />
          </button>
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
        <span className="palette-title flex items-center gap-1">
          <LiaPaintBrushSolid size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Palette
        </span>
        <span className="palette-hotkey-hint"><b>Shift+1~9</b> pick · <b>E</b> set colors</span>
      </div>
      <div id="color-palette-bar" className="color-palette-bar">
        {paletteColors.map((item, index) => (
          <button
            type="button"
            tabIndex={-1}
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
          <button type="button" tabIndex={-1} className="palette-title" id="backpack-bar-title" title="Click or press E to open full backpack" onClick={() => spaceUiStore.toggleInventoryModal(true)}>
            <LiaBoxesSolid size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 3 }} />Backpack
          </button>
          <div id="inv-cat-tabs" className="inv-cat-tabs">
            {(['blockset', 'entity'] as const).map(key => (
              <button type="button" tabIndex={-1} key={key} className={`inv-cat-tab ${category === key ? 'active' : ''}`} onClick={() => spaceUiStore.selectInventoryCategory(key)}>{key === 'blockset' ? 'BKS' : 'ENT'}</button>
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
              tabIndex={-1}
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

function SelectorPanel() {
  const { selector, controller } = useSpaceUi(state => state);
  return (
    <div className="selector-panel-wrapper" id="selector-panel-wrapper">
      <div className="palette-info-row">
        <div className="selector-title-group">
          <span className="palette-title">Selector</span>
          <button id="selector-mode-toggle" tabIndex={-1} className="selector-mode-btn" title="Click or press Tab to switch mode" onClick={() => controller?.toggleSelectorMicroMode?.()}>
            <span id="selector-mode-badge" className={`mode-badge ${selector.micro ? 'micro' : 'std'}`}>{selector.micro ? 'MICRO' : 'STANDARD'}</span>
            <span className="mode-tab-hint flex items-center gap-0.5">Tab <LiaExchangeAltSolid style={{ display: 'inline' }} /></span>
          </button>
        </div>
        <span className="palette-hotkey-hint"><b>Tab</b> switch mode</span>
      </div>
      <div className="selector-toolbox-content" id="selector-toolbox-content">
        <div className="selector-action-buttons">
          <button id="assemble-btn" tabIndex={-1} className="banner-btn primary" disabled={!selector.canAssemble} onClick={() => controller?.assembleSelection?.(ContraptionMode.PROGRAMMABLE)}>{selector.assembleLabel}</button>
          <button id="copy-btn" tabIndex={-1} className="banner-btn secondary" title="Copy selection to backpack (R)" disabled={!selector.canCopy} onClick={() => controller?.copySelectionSmart?.()}>Copy (R)</button>
          <button id="delete-btn" tabIndex={-1} className="banner-btn danger" title="Delete selection (Del)" disabled={!selector.canDelete} onClick={() => controller?.deleteSelectionBlocks?.()}>Delete (Del)</button>
        </div>
      </div>
    </div>
  );
}

function WrenchPanel() {
  const { controller } = useSpaceUi(state => state);
  return (
    <div className="selector-panel-wrapper wrench-panel-wrapper" id="wrench-panel-wrapper">
      <div className="palette-info-row">
        <div className="selector-title-group">
          <span className="palette-title flex items-center gap-1">
            <LiaWrenchSolid size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Wrench
          </span>
          <span className="mode-badge std">PHYSICS & CONTROL</span>
        </div>
        <span className="palette-hotkey-hint"><b>Hold LMB</b> grab · <b>RMB</b> start/stop</span>
      </div>
      <div className="selector-toolbox-content" id="wrench-toolbox-content">
        <div className="wrench-action-buttons">
          <button type="button" tabIndex={-1} className="banner-btn secondary" title="Hold left-click on a dynamic entity to grab and move it" onClick={() => controller?.startWrenchGrab?.()}><b>Hold LMB</b> Grab</button>
          <button type="button" tabIndex={-1} className="banner-btn secondary" title="Right-click on an entity to start or stop physics and scripts (RMB)" onClick={() => controller?.toggleHoveredEntityPlayback?.()}><b>RMB</b> Start/Stop</button>
          <button type="button" tabIndex={-1} className="banner-btn secondary" title="Point at an entity and press C to open its code editor" onClick={() => controller?.openCodeEditorForTarget?.()}><b>C</b> Code</button>
          <button type="button" tabIndex={-1} className="banner-btn secondary" title="Point at a seat block and press V to mount/drive" onClick={() => controller?.toggleDriveVehicle?.()}><b>V</b> Drive</button>
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
        <button type="button" tabIndex={-1} key={slot.value} className={`hotbar-slot ${index === selectedHotbarIndex ? 'active' : ''}`} onClick={() => spaceUiStore.selectHotbarSlot(index)}>
          <span className="slot-num">{index + 1}</span>
          <span className="slot-icon">{getHotbarToolIcon(slot.value)}</span>
          <span className="slot-name">{slot.name}</span>
          {slot.value === SpecialTool.SELECTOR ? <span className={`slot-mode-badge ${selector.micro ? 'micro' : 'std'}`}>{selector.micro ? 'MICRO' : 'STD'}</span> : null}
        </button>
      ))}
    </div>
  );
}

function BulkEditProgressPanel() {
  const { bulkEdit, worldEditSync } = useSpaceUi(state => state);
  if (!bulkEdit) return null;

  const percent = bulkEdit.total > 0
    ? Math.min(100, Math.round((bulkEdit.processed / bulkEdit.total) * 100))
    : 100;
  const phaseLabel = bulkEdit.phase === 'waiting'
    ? 'SERVER BACKPRESSURE'
    : bulkEdit.phase === 'syncing'
      ? 'SYNCING'
      : bulkEdit.phase === 'complete'
        ? 'COMPLETE'
        : bulkEdit.phase === 'failed'
          ? 'FAILED'
          : 'APPLYING';
  const syncIdle = worldEditSync.pendingBatches === 0 && !worldEditSync.sending;
  const syncText = worldEditSync.retrying
    ? `Retrying in ${Math.max(1, Math.ceil(worldEditSync.retryDelayMs / 1_000))}s · ${worldEditSync.pendingBatches} batches queued`
    : worldEditSync.backpressured
      ? `Queue paused · ${worldEditSync.pendingBatches} batches / ${worldEditSync.pendingMutations} edits pending`
      : syncIdle
        ? 'Server synced'
        : `Server sync · ${worldEditSync.pendingBatches} batches / ${worldEditSync.pendingMutations} edits pending`;

  return (
    <div className={`bulk-edit-progress phase-${bulkEdit.phase}`} role="status" aria-live="polite">
      <div className="bulk-edit-heading">
        <span>{bulkEdit.label}</span>
        <span className="bulk-edit-phase">{phaseLabel}</span>
      </div>
      <div className="bulk-edit-row">
        <span className="bulk-edit-row-label">Local</span>
        <div className="bulk-edit-track"><span style={{ width: `${percent}%` }} /></div>
        <span className="bulk-edit-value">{bulkEdit.processed.toLocaleString()} / {bulkEdit.total.toLocaleString()} · {percent}%</span>
      </div>
      <div className="bulk-edit-row">
        <span className="bulk-edit-row-label">Sync</span>
        <div className={`bulk-edit-track sync ${syncIdle ? 'idle' : 'active'}`}><span /></div>
        <span className="bulk-edit-value">{syncText}</span>
      </div>
      {bulkEdit.detail ? <div className="bulk-edit-detail">{bulkEdit.detail}</div> : null}
    </div>
  );
}

export function Hud() {
  const state = useSpaceUi(snapshot => snapshot);
  const activeTool = state.hotbarSlots[state.selectedHotbarIndex]?.value;
  return (
    <>
      <div id="crosshair" />
      {state.sessionMode === 'offline' ? (
        <div className={`space-session-status ${state.onlineReady ? 'ready' : state.queuePosition !== null ? 'queued' : 'offline'}`} role="status" aria-live="polite">
          <span>{state.onlineReady ? 'Ready to Connect' : state.queuePosition !== null ? `Queue #${state.queuePosition}` : 'Offline Mode'}</span>
          {state.onlineReady ? (
            <>
              <button type="button" tabIndex={-1} onClick={() => spaceUiStore.enterOnlineSpace()}>
                Enter Online Space
              </button>
              <button type="button" tabIndex={-1} onClick={() => { void spaceUiStore.cancelSpaceQueue(); }}>
                Stay in Offline Mode
              </button>
            </>
          ) : state.queuePosition !== null ? (
            <button type="button" tabIndex={-1} onClick={() => { void spaceUiStore.cancelSpaceQueue(); }}>
              Cancel Queue
            </button>
          ) : null}
        </div>
      ) : null}
      <div id="hud-overlay">
        <div className="hud-top">
          <div className="hud-card">
            <div className="hud-badge"><span className="hud-badge-dot" />EntropyDrop · Space <span className="hud-beta-badge">BETA</span></div>
            <div className="hud-metrics-row"><span id="fps-val">{state.fpsText}</span><span className="hud-metric-sep">·</span><span id="ping-val" className={state.pingClass}>{state.pingText}</span></div>
            <div id="pos-val">{state.positionText}</div>
            <NearbyEntities />
          </div>
          <div className="hud-actions"><button id="global-settings-btn" tabIndex={-1} className="icon-btn" title="Global Settings (O)" onClick={() => spaceUiStore.toggleGlobalSettingsModal(true)}><LiaCogSolid size={18} /></button></div>
        </div>
        <div className="hud-bottom">
          <div className="hud-bottom-stack">
            <BulkEditProgressPanel />
            <div className="builder-toolbar">
              <div className="toolbar-center-panel">
                {activeTool === SpecialTool.HAMMER ? (
                  <InventoryBar />
                ) : activeTool === SpecialTool.SELECTOR ? (
                  <SelectorPanel />
                ) : activeTool === SpecialTool.WRENCH ? (
                  <WrenchPanel />
                ) : (
                  <PaletteBar />
                )}
                <Hotbar />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="toast" className={`toast ${state.toast ? 'show' : ''}`}>{state.toast?.message || ''}</div>
    </>
  );
}
