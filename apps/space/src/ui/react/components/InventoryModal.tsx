import React, { useEffect, useRef, useState } from 'react';
import { InventoryThumbnailRenderer } from '../../../engine/render/InventoryThumbnailRenderer.ts';
import { MAX_STL_FILE_BYTES } from '../../../engine/voxel/STLVoxelizer.ts';
import { colorToHex, normalizeColor } from '../../../engine/voxel/BlockTypes.ts';
import { spaceUiStore } from '../store/SpaceUiStore.ts';
import { useSpaceUi } from '../store/useSpaceUi.ts';

export type InventoryCategory = 'blockset' | 'entity' | 'colorset';

function PixelCopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block', shapeRendering: 'crispEdges' }}>
      <path fillRule="evenodd" clipRule="evenodd" d="M2 2h8v2H4v8H2V2zm4 4h8v8H6V6zm2 2h4v4H8V8z" />
    </svg>
  );
}

function PixelExportIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block', shapeRendering: 'crispEdges' }}>
      <path d="M7 1h2v5h3l-4 4-4-4h3V1zm-5 9h2v2h8v-2h2v4H2v-4z" />
    </svg>
  );
}

function PixelDeleteIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block', shapeRendering: 'crispEdges' }}>
      <path fillRule="evenodd" clipRule="evenodd" d="M5 2h6v2h4v2h-1v8H2V6H1V4h4V2zm-1 4v6h8V6H4zm2 1h2v4H6V7zm4 0h2v4h-2V7z" />
    </svg>
  );
}

function ImportJsonButton({ category }: { category: InventoryCategory }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={event => {
          spaceUiStore.importInventoryFile(category, event.target.files?.[0] || null);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        className="backpack-section-btn"
        onClick={() => input.current?.click()}
      >
        Import JSON
      </button>
    </>
  );
}

function EmptySlot({ index, label }: { index?: number; label: string }) {
  return (
    <div className="inventory-card backpack-item backpack-item-empty">
      <div className="backpack-slot-preview-box empty">
        {index !== undefined && <span className="backpack-slot-index">#{index + 1}</span>}
        <span className="backpack-slot-empty-icon">+</span>
      </div>
      <div className="backpack-item-details">
        <div className="backpack-item-meta">{label}</div>
      </div>
    </div>
  );
}

function EmptyColorSetSlot() {
  return (
    <div className="inventory-card backpack-item colorset-card colorset-empty-card">
      <div className="colorset-empty-content">
        <span className="backpack-slot-empty-icon">+</span>
        <span className="backpack-item-meta">Empty slot</span>
      </div>
    </div>
  );
}

function InventoryItemCard({ category, index, item }: { category: 'blockset' | 'entity'; index: number; item: any }) {
  const controller = useSpaceUi(state => state.controller);
  const fallback = category === 'blockset' ? `Block set ${index + 1}` : `Entity ${index + 1}`;
  const name = typeof item?.name === 'string' ? item.name : (controller?.inventoryItemName?.(category, item, index) || fallback);
  const count = item.blockCount || item.blocks?.length || 0;
  const thumbnail = InventoryThumbnailRenderer.getInstance().getThumbnail(item, 96);
  const meta = category === 'blockset'
    ? `${count} voxels`
    : `${count} blocks · ${item.scripts?.length || 0} scripts · ${item.mode || 'free_physics'}`;
  return (
    <div className="inventory-card backpack-item">
      <div className="backpack-slot-preview-box filled">
        <span className="backpack-slot-index">#{index + 1}</span>
        {thumbnail ? <img className="inv-slot-thumb" src={thumbnail} alt={name || fallback} draggable={false} /> : null}
        {count > 0 ? <span className="backpack-slot-count">{count}</span> : null}
      </div>
      <div className="backpack-item-details">
        <input
          type="text"
          className="backpack-item-name-input"
          maxLength={80}
          value={name}
          placeholder={fallback}
          aria-label={`${category} slot ${index + 1} name`}
          onChange={event => spaceUiStore.renameInventoryItem(category, index, event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        />
        <div className="backpack-item-meta">{meta}</div>
        <div className="inv-item-actions">
          <button
            type="button"
            tabIndex={-1}
            className="backpack-pixel-btn"
            title={`Copy ${category === 'blockset' ? 'block set' : 'entity'}`}
            aria-label="Copy item"
            onClick={() => spaceUiStore.copyInventoryItem(category, index)}
          >
            <PixelCopyIcon />
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="backpack-pixel-btn"
            title="Export JSON"
            aria-label="Export JSON"
            onClick={() => spaceUiStore.downloadJson(
              spaceUiStore.inventoryJsonFilename(item.name || fallback, fallback),
              controller?.serializeInventoryItem?.(category, item) || item
            )}
          >
            <PixelExportIcon />
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="backpack-pixel-btn danger"
            title="Delete item"
            aria-label="Delete item"
            onClick={() => spaceUiStore.deleteInventoryItem(category, index)}
          >
            <PixelDeleteIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function ColorSetCard({ index, item, totalCount }: { index: number; item: any; totalCount?: number }) {
  const state = useSpaceUi(s => s);
  const controller = state.controller;
  const fallback = `Color set ${index + 1}`;
  const name = typeof item?.name === 'string' ? item.name : (controller?.inventoryItemName?.('colorset', item, index) || fallback);
  const isOnlyColorSet = totalCount !== undefined
    ? totalCount <= 1
    : ((controller?.inventories?.colorset?.items || []) as any[]).filter(Boolean).length <= 1;

  if (!item.id) {
    item.id = typeof globalThis.crypto?.randomUUID === 'function'
      ? `cs_${globalThis.crypto.randomUUID()}`
      : `cs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  const isCurrent = Boolean(
    state.activeColorSetId ? state.activeColorSetId === item.id : index === 0
  );

  const updateColor = (colorIndex: number, value: string) => {
    item.colors[colorIndex] = colorToHex(normalizeColor(value));
    controller?.saveInventoriesToLocalStorage?.();
    if (isCurrent) {
      spaceUiStore.applyColorSetToPalette(item);
    } else {
      spaceUiStore.refresh();
    }
  };

  return (
    <div
      className={`inventory-card backpack-item colorset-card ${isCurrent ? 'active' : ''}`}
      onClick={() => {
        spaceUiStore.applyColorSetToPalette(item);
        spaceUiStore.showToast(`Applied color set "${name || fallback}" to palette`);
      }}
    >
      <div className="colorset-colors-row">
        {(item.colors || []).slice(0, 9).map((hex: string, colorIndex: number) => {
          const safe = colorToHex(normalizeColor(hex));
          return (
            <label
              key={colorIndex}
              className="colorset-cell-swatch"
              style={{ background: safe }}
              title={`Recolor slot ${colorIndex + 1} (${safe})`}
              onClick={event => event.stopPropagation()}
            >
              <input
                type="color"
                value={safe}
                onChange={event => {
                  event.stopPropagation();
                  updateColor(colorIndex, event.target.value);
                }}
              />
            </label>
          );
        })}
      </div>

      <div className="colorset-card-bottom">
        <input
          type="text"
          className="backpack-item-name-input colorset-name-input"
          maxLength={80}
          value={name}
          placeholder={fallback}
          aria-label={`Color set ${index + 1} name`}
          onClick={event => event.stopPropagation()}
          onChange={event => spaceUiStore.renameInventoryItem('colorset', index, event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        />
        {isCurrent && <span className="colorset-active-tag">Active</span>}
        <div className="inv-item-actions">
          <button
            type="button"
            tabIndex={-1}
            className="backpack-pixel-btn"
            title="Copy color set"
            aria-label="Copy color set"
            onClick={event => {
              event.stopPropagation();
              spaceUiStore.copyInventoryItem('colorset', index);
            }}
          >
            <PixelCopyIcon />
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="backpack-pixel-btn"
            title="Export JSON"
            aria-label="Export JSON"
            onClick={event => {
              event.stopPropagation();
              spaceUiStore.downloadJson(
                spaceUiStore.inventoryJsonFilename(item.name, `Color set ${index + 1}`),
                controller?.serializeInventoryItem?.('colorset', item) || item
              );
            }}
          >
            <PixelExportIcon />
          </button>
          <button
            type="button"
            tabIndex={-1}
            disabled={isOnlyColorSet}
            className={`backpack-pixel-btn danger ${isOnlyColorSet ? 'disabled' : ''}`}
            title={isOnlyColorSet ? 'Cannot delete the only color set' : 'Delete color set'}
            aria-label={isOnlyColorSet ? 'Cannot delete the only color set' : 'Delete color set'}
            onClick={event => {
              event.stopPropagation();
              if (!isOnlyColorSet) {
                spaceUiStore.deleteInventoryItem('colorset', index);
              }
            }}
          >
            <PixelDeleteIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function StlImportCard() {
  const controller = useSpaceUi(state => state.controller);
  const [precision, setPrecision] = useState(1);
  const [sizeBlocks, setSizeBlocks] = useState(32);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState('No file selected');
  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const stopWorker = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };
  useEffect(() => stopWorker, []);

  const importStl = async () => {
    if (workerRef.current) {
      stopWorker();
      setStatus('Import cancelled');
      return;
    }
    if (!file) { setStatus('Choose an .stl file first'); return; }
    if (file.size > MAX_STL_FILE_BYTES) { setStatus(`Error: STL files are limited to ${MAX_STL_FILE_BYTES / (1024 * 1024)} MiB`); return; }
    if (!sizeBlocks || sizeBlocks < 1) { setStatus('Error: size in standard blocks must be at least 1'); return; }
    try {
      const worker = new Worker(new URL('../../../engine/voxel/STLImportWorker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      setStatus(`Reading ${file.name}…`);
      timeoutRef.current = window.setTimeout(() => {
        if (workerRef.current === worker) {
          stopWorker();
          setStatus('Error: STL import exceeded the 120 second processing limit');
        }
      }, 120000);
      worker.onmessage = event => {
        if (workerRef.current !== worker) return;
        try {
          if (!event.data?.ok) throw new Error(event.data?.error || 'STL worker failed');
          const result = event.data.result;
          const sizeLabel = `prec ${precision} · size ${sizeBlocks} blocks`;
          const slot = controller?.importBlockSetToInventory?.(result.blocks, `${file.name} @${sizeLabel}`);
          if (!slot) throw new Error('Block set inventory is full');
          const index = controller.inventories.blockset.items.indexOf(slot);
          setStatus(`OK: ${result.blocks.length} voxels (${result.size.sx}×${result.size.sy}×${result.size.sz}) · ${sizeLabel} → block set slot ${index + 1}`);
          spaceUiStore.syncInventoryState();
        } catch (error: any) {
          setStatus(`Error: ${error?.message || String(error)}`);
        } finally {
          stopWorker();
        }
      };
      worker.onerror = event => { stopWorker(); setStatus(`Error: ${event.message || 'STL worker crashed'}`); };
      const buffer = await file.arrayBuffer();
      if (workerRef.current !== worker) return;
      setStatus(`Voxelizing ${file.name} in background…`);
      worker.postMessage({ buffer, sizeBlocks, precision, color: controller?.selectedColor ?? 0xf2a93b }, [buffer]);
    } catch (error: any) {
      stopWorker();
      setStatus(`Error: ${error?.message || String(error)}`);
    }
  };

  return (
    <div className="inventory-card stl-import-card">
      <div className="stl-card-header">
        <span className="inv-icon">⬡</span>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div className="inv-name" style={{ color: 'var(--brass-light)' }}>IMPORT STL → BLOCK BODY</div>
          <div className="inv-desc">Convert an .stl mesh into a block set in the inventory — Hammer left-click places plain blocks</div>
        </div>
      </div>
      <div className="stl-size-row">
        <span className="stl-size-label">Precision:</span>
        <label className="stl-size-option">
          <input type="radio" name="stl-size" value="0.2" checked={precision === 0.2} onChange={() => setPrecision(0.2)} />
          <span> 0.2 (5×5×5 micro voxels)</span>
        </label>
        <label className="stl-size-option">
          <input type="radio" name="stl-size" value="1" checked={precision === 1} onChange={() => setPrecision(1)} />
          <span> 1 (standard blocks)</span>
        </label>
      </div>
      <div className="stl-size-row">
        <span className="stl-size-label">Size (largest axis):</span>
        <input
          type="number"
          id="stl-size-blocks"
          className="stl-max-select"
          value={sizeBlocks}
          min="1"
          max="256"
          step="1"
          required
          onChange={event => setSizeBlocks(Number(event.target.value))}
        />
        <span className="stl-size-hint">required · final model size in 1×1×1 standard blocks</span>
      </div>
      <input
        type="file"
        id="stl-file-input"
        accept=".stl"
        className="stl-file-input"
        onChange={event => {
          const next = event.target.files?.[0] || null;
          setFile(next);
          setStatus(next && next.size > MAX_STL_FILE_BYTES ? `Error: ${next.name} exceeds the ${MAX_STL_FILE_BYTES / (1024 * 1024)} MiB limit` : next ? `Ready: ${next.name}` : 'No file selected');
        }}
      />
      <div className="stl-actions">
        <button
          type="button"
          tabIndex={-1}
          className="banner-btn primary"
          id="stl-import-btn"
          style={{ fontSize: 11, padding: '4px 10px' }}
          onClick={importStl}
        >
          {workerRef.current ? 'Cancel' : 'Import & Voxelize'}
        </button>
        <span id="stl-import-status" className="stl-import-status">{status}</span>
      </div>
    </div>
  );
}

export function InventoryModal() {
  const state = useSpaceUi(snapshot => snapshot);
  if (state.activeModal !== 'inventory') return null;

  const inventories = state.controller?.inventories || {};
  const blocksets = inventories.blockset?.items || [];
  const entities = inventories.entity?.items || [];
  const colorsets = inventories.colorset?.items || [];

  const activeCategory: InventoryCategory = state.activeInventoryCategory === 'entity'
    ? 'entity'
    : state.activeInventoryCategory === 'colorset'
      ? 'colorset'
      : 'blockset';

  return (
    <div
      id="inventory-modal"
      className="custom-modal open"
      onMouseDown={event => {
        if (event.target === event.currentTarget) spaceUiStore.toggleInventoryModal(false);
      }}
    >
      <div className="modal-content inventory-modal-content">
        <div className="modal-header">
          <div className="inventory-header-title-group">
            <h2>Backpack</h2>
            <div className="backpack-tabs-bar" role="tablist" aria-label="Backpack categories">
              <button
                type="button"
                id="backpack-tab-blockset"
                role="tab"
                tabIndex={-1}
                aria-selected={activeCategory === 'blockset'}
                className={`backpack-tab-btn ${activeCategory === 'blockset' ? 'active' : ''}`}
                onClick={() => spaceUiStore.selectInventoryCategory('blockset')}
              >
                Block Set
              </button>
              <button
                type="button"
                id="backpack-tab-entity"
                role="tab"
                tabIndex={-1}
                aria-selected={activeCategory === 'entity'}
                className={`backpack-tab-btn ${activeCategory === 'entity' ? 'active' : ''}`}
                onClick={() => spaceUiStore.selectInventoryCategory('entity')}
              >
                Entity
              </button>
              <button
                type="button"
                id="backpack-tab-colorset"
                role="tab"
                tabIndex={-1}
                aria-selected={activeCategory === 'colorset'}
                className={`backpack-tab-btn ${activeCategory === 'colorset' ? 'active' : ''}`}
                onClick={() => spaceUiStore.selectInventoryCategory('colorset')}
              >
                Color Set
              </button>
            </div>
          </div>
          <button
            type="button"
            id="close-inv-btn"
            tabIndex={-1}
            className="icon-btn"
            style={{ width: 28, height: 28, fontSize: 13 }}
            title="Close backpack (ESC)"
            onClick={() => spaceUiStore.toggleInventoryModal(false)}
          >
            ✕
          </button>
        </div>

        {activeCategory === 'blockset' && (
          <div className="backpack-tab-panel" id="backpack-panel-blockset">
            <div className="inventory-grid" id="inventory-grid">
              {Array.from({ length: 9 }, (_, index) => {
                const item = blocksets[index];
                return item ? (
                  <InventoryItemCard key={item.id || `b:${index}`} category="blockset" index={index} item={item} />
                ) : (
                  <EmptySlot key={`empty-b:${index}`} index={index} label={`Empty slot ${index + 1} · R copy or import`} />
                );
              })}
            </div>
            <div className="stl-import-section">
              <StlImportCard />
            </div>
            <div className="backpack-panel-footer">
              <ImportJsonButton category="blockset" />
            </div>
          </div>
        )}

        {activeCategory === 'entity' && (
          <div className="backpack-tab-panel" id="backpack-panel-entity">
            <div className="inventory-grid" id="inventory-grid">
              {Array.from({ length: 9 }, (_, index) => {
                const item = entities[index];
                return item ? (
                  <InventoryItemCard key={item.id || `e:${index}`} category="entity" index={index} item={item} />
                ) : (
                  <EmptySlot key={`empty-e:${index}`} index={index} label={`Empty slot ${index + 1} · R copy or import`} />
                );
              })}
            </div>
            <div className="backpack-panel-footer">
              <ImportJsonButton category="entity" />
            </div>
          </div>
        )}

        {activeCategory === 'colorset' && (
          <div className="backpack-tab-panel" id="backpack-panel-colorset">
            <div className="inventory-grid" id="inventory-grid">
              {(() => {
                const totalCount = colorsets.filter(Boolean).length;
                return Array.from({ length: 9 }, (_, index) => {
                  const item = colorsets[index];
                  return item ? (
                    <ColorSetCard key={item.id || `c:${index}`} index={index} item={item} totalCount={totalCount} />
                  ) : (
                    <EmptyColorSetSlot key={`empty-c:${index}`} />
                  );
                });
              })()}
            </div>
            <div className="backpack-panel-footer">
              <ImportJsonButton category="colorset" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
