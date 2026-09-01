import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  LiaDownloadSolid,
  LiaHeartSolid,
  LiaHeart,
  LiaTrashAltSolid,
  LiaAngleLeftSolid,
  LiaAngleRightSolid,
  LiaStoreAltSolid,
  LiaBoxesSolid,
  LiaCloudUploadAltSolid,
  LiaCopySolid,
  LiaFileExportSolid,
  LiaFileImportSolid,
  LiaCubeSolid,
  LiaFileUploadSolid,
} from 'react-icons/lia';
import { InventoryThumbnailRenderer } from '../../../engine/render/InventoryThumbnailRenderer.ts';
import { MAX_STL_FILE_BYTES } from '../../../engine/voxel/STLVoxelizer.ts';
import { colorToHex, normalizeColor } from '../../../engine/voxel/BlockTypes.ts';
import {
  decodeInventoryResource,
  inventoryResourcePreviewItem,
} from '../../../engine/storage/InventoryProtobuf.ts';
import { spaceUiStore } from '../store/SpaceUiStore.ts';
import { useSpaceUi } from '../store/useSpaceUi.ts';
import {
  SpaceMarketError,
  type SpaceMarketQuota,
  type SpaceMarketResource,
  type SpaceMarketSort,
} from '../../../bootstrap/SpaceMarketClient.ts';

export type InventoryCategory = 'blockset' | 'entity' | 'colorset';

export function PixelCopyIcon() {
  return <LiaCopySolid size={14} style={{ display: 'block' }} />;
}

export function PixelExportIcon() {
  return <LiaFileExportSolid size={14} style={{ display: 'block' }} />;
}

export function PixelDeleteIcon() {
  return <LiaTrashAltSolid size={14} style={{ display: 'block' }} />;
}

export function PixelPublishIcon() {
  return <LiaCloudUploadAltSolid size={14} style={{ display: 'block' }} />;
}

export function PixelDownloadIcon() {
  return <LiaDownloadSolid size={14} style={{ display: 'block' }} />;
}

export function PixelHeartIcon() {
  return <LiaHeartSolid size={14} style={{ display: 'block' }} />;
}

function ImportProtobufButton({ category }: { category: InventoryCategory }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".edpb,.pb,application/x-protobuf"
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
        <LiaFileImportSolid size={15} style={{ marginRight: 4, display: 'inline', verticalAlign: 'text-bottom' }} />
        Import Protobuf
      </button>
    </>
  );
}

function Import3DModelPopover() {
  const controller = useSpaceUi(state => state.controller);
  const [isOpen, setIsOpen] = useState(false);
  const [precision, setPrecision] = useState(1);
  const [sizeBlocks, setSizeBlocks] = useState(32);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState('No file selected');
  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopWorker = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };
  useEffect(() => stopWorker, []);

  // Close on outside click or ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const importModel = async () => {
    if (workerRef.current) {
      stopWorker();
      setStatus('Import cancelled');
      return;
    }
    if (!file) { setStatus('Choose a .glb, .gltf, or .stl file first'); return; }
    if (file.size > MAX_STL_FILE_BYTES) { setStatus(`Error: Model files are limited to ${MAX_STL_FILE_BYTES / (1024 * 1024)} MiB`); return; }
    if (!sizeBlocks || sizeBlocks < 1) { setStatus('Error: size in standard blocks must be at least 1'); return; }
    try {
      const worker = new Worker(new URL('../../../engine/voxel/STLImportWorker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      setStatus(`Reading ${file.name}…`);
      timeoutRef.current = window.setTimeout(() => {
        if (workerRef.current === worker) {
          stopWorker();
          setStatus('Error: 3D model import exceeded the 120 second processing limit');
        }
      }, 120000);
      worker.onmessage = event => {
        if (workerRef.current !== worker) return;
        try {
          if (!event.data?.ok) throw new Error(event.data?.error || 'Model worker failed');
          const result = event.data.result;
          const sizeLabel = `prec ${precision} · size ${sizeBlocks} blocks`;
          const slot = controller?.importBlockSetToInventory?.(result.blocks, `${file.name} @${sizeLabel}`);
          if (!slot) throw new Error('Block set inventory is full');
          const index = controller.inventories.blockset.items.indexOf(slot);
          setStatus(`OK: ${result.blocks.length} voxels (${result.size.sx}×${result.size.sy}×${result.size.sz}) · ${sizeLabel} → block set slot ${index + 1}`);
          spaceUiStore.syncInventoryState();
          spaceUiStore.showToast(`Imported "${file.name}" to Block Set slot ${index + 1}`);
          setTimeout(() => setIsOpen(false), 1200);
        } catch (error: any) {
          setStatus(`Error: ${error?.message || String(error)}`);
        } finally {
          stopWorker();
        }
      };
      worker.onerror = event => { stopWorker(); setStatus(`Error: ${event.message || 'Model worker crashed'}`); };
      const buffer = await file.arrayBuffer();
      if (workerRef.current !== worker) return;
      setStatus(`Voxelizing ${file.name} in background…`);
      worker.postMessage({
        buffer,
        filename: file.name,
        sizeBlocks,
        precision,
        color: controller?.selectedColor ?? 0xf2a93b
      }, [buffer]);
    } catch (error: any) {
      stopWorker();
      setStatus(`Error: ${error?.message || String(error)}`);
    }
  };

  return (
    <div className="stl-import-anchor" ref={popoverRef}>
      <button
        type="button"
        tabIndex={-1}
        className={`backpack-section-btn ${isOpen ? 'active' : ''}`}
        title="Import 3D Model (.glb / .gltf / .stl)"
        onClick={() => setIsOpen(!isOpen)}
      >
        <LiaCubeSolid size={15} style={{ marginRight: 4, display: 'inline', verticalAlign: 'text-bottom' }} />
        Import 3D Model
      </button>

      {isOpen && (
        <div className="stl-popover-container" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="stl-popover-header">
            <div className="stl-popover-title">
              <LiaCubeSolid size={18} className="stl-title-icon" />
              <span>Import 3D Model</span>
            </div>
            <button
              type="button"
              className="icon-btn stl-popover-close"
              title="Close"
              onClick={() => setIsOpen(false)}
            >
              ✕
            </button>
          </div>

          <div className="stl-popover-sub">
            Convert full-color .glb, .gltf, or .stl meshes into a voxel block set.
          </div>

          {/* Form Fields */}
          <div className="stl-popover-body">
            {/* Precision */}
            <div className="stl-field-group">
              <div className="stl-field-label">Voxel Precision</div>
              <div className="stl-toggle-group">
                <button
                  type="button"
                  className={`stl-toggle-option ${precision === 0.2 ? 'active' : ''}`}
                  onClick={() => setPrecision(0.2)}
                >
                  0.2 (5×5×5 Micro)
                </button>
                <button
                  type="button"
                  className={`stl-toggle-option ${precision === 1 ? 'active' : ''}`}
                  onClick={() => setPrecision(1)}
                >
                  1.0 (Standard)
                </button>
              </div>
            </div>

            {/* Size */}
            <div className="stl-field-group">
              <div className="stl-field-label">Size (Largest Axis)</div>
              <div className="stl-size-row-inner">
                <input
                  type="number"
                  id="stl-size-blocks"
                  className="stl-number-input"
                  value={sizeBlocks}
                  min={1}
                  max={256}
                  step={1}
                  required
                  onChange={e => setSizeBlocks(Number(e.target.value))}
                />
                <span className="stl-size-unit">blocks</span>
              </div>
              <div className="stl-field-hint">Target size in 1×1×1 standard blocks (1-256)</div>
            </div>

            {/* File Dropzone */}
            <div className="stl-field-group">
              <div className="stl-field-label">3D Model File</div>
              <div
                className={`stl-dropzone ${file ? 'has-file' : ''}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  id="stl-file-input"
                  accept=".glb,.gltf,.stl"
                  hidden
                  onChange={event => {
                    const next = event.target.files?.[0] || null;
                    setFile(next);
                    setStatus(
                      next && next.size > MAX_STL_FILE_BYTES
                        ? `Error: ${next.name} exceeds ${MAX_STL_FILE_BYTES / (1024 * 1024)} MiB limit`
                        : next
                          ? `Ready: ${next.name}`
                          : 'No file selected'
                    );
                  }}
                />
                <LiaFileUploadSolid size={20} className="stl-dropzone-icon" />
                <div className="stl-dropzone-text">
                  {file ? (
                    <span className="stl-selected-name">{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                  ) : (
                    <span>Click to choose .glb, .gltf, or .stl</span>
                  )}
                </div>
              </div>
            </div>

            {/* Status Feedback */}
            {status && (
              <div
                id="stl-import-status"
                className={`stl-import-status-bar ${
                  status.startsWith('Error') ? 'error' : status.startsWith('OK') ? 'success' : ''
                }`}
              >
                {status}
              </div>
            )}

            {/* Actions */}
            <div className="stl-popover-actions">
              <button
                type="button"
                className="backpack-section-btn"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                id="stl-import-btn"
                className="backpack-section-btn primary mc-btn-green"
                onClick={importModel}
                disabled={!file}
              >
                {workerRef.current ? 'Cancel' : 'Import & Voxelize'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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

function InventoryItemCard({
  category,
  index,
  item,
  isHotbar,
  onPublish,
  draggedIndex,
  dragOverIndex,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  category: 'blockset' | 'entity';
  index: number;
  item: any;
  isHotbar?: boolean;
  onPublish: (category: InventoryCategory, item: any) => void;
  draggedIndex?: number | null;
  dragOverIndex?: number | null;
  onDragStart?: (e: React.DragEvent, index: number) => void;
  onDragOver?: (e: React.DragEvent, index: number) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent, index: number) => void;
  onDragEnd?: () => void;
}) {
  const controller = useSpaceUi(state => state.controller);
  const fallback = category === 'blockset' ? `Block set ${index + 1}` : `Entity ${index + 1}`;
  const name = typeof item?.name === 'string' ? item.name : (controller?.inventoryItemName?.(category, item, index) || fallback);
  const count = item ? (item.blockCount || item.blocks?.length || 0) : 0;
  const thumbnail = item ? InventoryThumbnailRenderer.getInstance().getThumbnail(item, isHotbar ? 144 : 96) : null;
  const isDragging = draggedIndex === index;
  const isDragOver = dragOverIndex === index;

  return (
    <div
      className={`backpack-slot-card group ${item ? 'filled' : 'empty'} ${isHotbar ? 'hotbar-slot' : 'storage-slot'} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
      draggable={Boolean(item)}
      onDragStart={e => {
        const target = e.target as HTMLElement | null;
        if (target?.tagName === 'INPUT' || target?.closest('.backpack-slot-name-row')) {
          e.preventDefault();
          return;
        }
        onDragStart?.(e, index);
      }}
      onDragOver={e => onDragOver?.(e, index)}
      onDragLeave={onDragLeave}
      onDrop={e => onDrop?.(e, index)}
      onDragEnd={onDragEnd}
      title={item ? `${name} (Slot #${index + 1}${isHotbar ? ' · Hotbar' : ''}) · Drag to reorder` : `Empty slot #${index + 1}`}
    >
      <div className="backpack-slot-thumb-container">
        <span className={`backpack-slot-index ${isHotbar ? 'hotbar-badge' : ''}`}>#{index + 1}</span>
        {thumbnail ? (
          <img className="inv-slot-thumb" src={thumbnail} alt={name || fallback} draggable={false} />
        ) : item ? (
          <span className="backpack-slot-empty-icon">{category === 'blockset' ? 'B' : 'E'}</span>
        ) : (
          <span className="backpack-slot-empty-icon">+</span>
        )}
        {count > 0 && <span className="backpack-slot-count">{count}</span>}

        {item && (
          <div className="backpack-slot-edge-actions" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className="backpack-pixel-btn publish"
              title="Publish to market (AGPL-3.0)"
              aria-label="Publish item to market"
              onClick={() => onPublish(category, item)}
            >
              <PixelPublishIcon />
            </button>
            <button
              type="button"
              className="backpack-pixel-btn"
              title={`Copy ${category === 'blockset' ? 'block set' : 'entity'}`}
              aria-label="Copy item"
              onClick={() => spaceUiStore.copyInventoryItem(category, index)}
            >
              <PixelCopyIcon />
            </button>
            <button
              type="button"
              className="backpack-pixel-btn"
              title="Export Protobuf"
              aria-label="Export Protobuf"
              onClick={() => spaceUiStore.downloadProtobuf(
                spaceUiStore.inventoryProtobufFilename(item.name || fallback, fallback),
                controller?.encodeInventoryItem?.(category, item)
              )}
            >
              <PixelExportIcon />
            </button>
            <button
              type="button"
              className="backpack-pixel-btn danger"
              title="Delete item"
              aria-label="Delete item"
              onClick={() => spaceUiStore.deleteInventoryItem(category, index)}
            >
              <PixelDeleteIcon />
            </button>
          </div>
        )}
      </div>

      <div
        className="backpack-slot-name-row"
        draggable={false}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onDragStart={e => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        {item ? (
          <input
            type="text"
            className="backpack-item-name-input"
            maxLength={60}
            value={name}
            placeholder={fallback}
            aria-label={`${category} slot ${index + 1} name`}
            draggable={false}
            onMouseDown={e => e.stopPropagation()}
            onDragStart={e => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onChange={event => spaceUiStore.renameInventoryItem(category, index, event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
            title="Click to edit name"
          />
        ) : (
          <span className="backpack-slot-empty-label">Empty</span>
        )}
      </div>
    </div>
  );
}

function InventorySlotsRow({
  category,
  items,
  onPublish,
}: {
  category: 'blockset' | 'entity';
  items: any[];
  onPublish: (category: InventoryCategory, item: any) => void;
}) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceStr = e.dataTransfer.getData('text/plain');
    const sourceIndex = Number(sourceStr);
    if (!Number.isNaN(sourceIndex) && sourceIndex !== targetIndex) {
      spaceUiStore.swapInventorySlots(category, sourceIndex, targetIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="backpack-slots-container" id="inventory-grid">
      {/* Hotbar Section (Row 1: Slots #1 - #9) */}
      <div className="backpack-section-subgroup hotbar-group">
        <div className="backpack-subgroup-header">
          <span className="backpack-hotbar-label">Active Hotbar</span>
          <span className="backpack-subgroup-hint">Drag items here from storage to equip</span>
        </div>
        <div className="backpack-slots-row backpack-hotbar-row">
          {Array.from({ length: 9 }, (_, index) => (
            <InventoryItemCard
              key={items[index]?.id || `${category}:${index}`}
              category={category}
              index={index}
              item={items[index]}
              isHotbar={true}
              onPublish={onPublish}
              draggedIndex={draggedIndex}
              dragOverIndex={dragOverIndex}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      </div>

      {/* Storage Section (Rows 2 - 11: Slots #10 - #99) */}
      <div className="backpack-section-subgroup storage-group">
        <div className="backpack-subgroup-header">
          <span className="backpack-storage-label">Storage</span>
        </div>
        <div className="backpack-slots-grid backpack-storage-grid">
          {Array.from({ length: 90 }, (_, offset) => {
            const index = offset + 9;
            return (
              <InventoryItemCard
                key={items[index]?.id || `${category}:${index}`}
                category={category}
                index={index}
                item={items[index]}
                isHotbar={false}
                onPublish={onPublish}
                draggedIndex={draggedIndex}
                dragOverIndex={dragOverIndex}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ColorSetCard({
  index,
  item,
  totalCount,
  onPublish,
}: {
  index: number;
  item: any;
  totalCount?: number;
  onPublish: (category: InventoryCategory, item: any) => void;
}) {
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
            className="backpack-pixel-btn publish"
            title="Publish to market (AGPL-3.0)"
            aria-label="Publish color set to market"
            onClick={event => {
              event.stopPropagation();
              onPublish('colorset', item);
            }}
          >
            <PixelPublishIcon />
          </button>
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
            title="Export Protobuf"
            aria-label="Export Protobuf"
            onClick={event => {
              event.stopPropagation();
              spaceUiStore.downloadProtobuf(
                spaceUiStore.inventoryProtobufFilename(item.name, `Color set ${index + 1}`),
                controller?.encodeInventoryItem?.('colorset', item)
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

function MarketResourceCard({
  resource,
  isAdmin,
  onDownload,
  onLike,
  onDelete,
}: {
  resource: SpaceMarketResource;
  isAdmin: boolean;
  onDownload: (resource: SpaceMarketResource) => void;
  onLike: (resource: SpaceMarketResource) => void;
  onDelete: (resource: SpaceMarketResource) => void;
}) {
  const marketClient = spaceUiStore.getMarketClient();
  const [previewItem, setPreviewItem] = useState<any | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();
    setPreviewItem(null);
    setPreviewFailed(false);
    if (!marketClient) {
      setPreviewFailed(true);
      return () => abortController.abort();
    }
    void marketClient.loadResourceContent(resource.content_url, abortController.signal)
      .then(payload => decodeInventoryResource(payload, resource.kind).portable)
      .then(portable => {
        if (!abortController.signal.aborted) {
          setPreviewItem(inventoryResourcePreviewItem(resource.kind, portable));
        }
      })
      .catch(() => {
        if (!abortController.signal.aborted) setPreviewFailed(true);
      });
    return () => abortController.abort();
  }, [marketClient, resource.content_url, resource.digest, resource.kind]);

  const thumbnail = resource.kind === 'colorset'
    ? null
    : InventoryThumbnailRenderer.getInstance().getThumbnail(previewItem, 96);
  const publishedAt = new Date(resource.created_at);
  const publisher = resource.publisher.username || resource.publisher.id || 'Former player';

  return (
    <article className="inventory-card market-resource-card">
      <div className={`market-resource-preview ${resource.kind}`}>
        {resource.kind === 'colorset' && previewItem ? (
          <div className="market-colorset-preview">
            {(previewItem?.colors || []).map((color: string, index: number) => (
              <span key={`${color}:${index}`} style={{ background: color }} />
            ))}
          </div>
        ) : thumbnail ? (
          <img className="inv-slot-thumb" src={thumbnail} alt="" draggable={false} />
        ) : (
          <span
            className="market-resource-glyph"
            title={previewFailed ? 'Preview unavailable' : 'Loading preview'}
          >
            {resource.kind === 'entity' ? 'E' : resource.kind === 'colorset' ? 'C' : 'B'}
          </span>
        )}
        <span className="market-license-badge">AGPL-3.0</span>
      </div>
      <div className="market-resource-body">
        <div className="market-resource-kind">{resource.kind === 'blockset' ? 'BLOCK SET' : resource.kind.toUpperCase()}</div>
        <h3 title={resource.name}>{resource.name}</h3>
        <div className="market-resource-author">by {publisher}</div>
        <div className="market-resource-meta">
          {resource.kind === 'colorset'
            ? '9 colors'
            : `${resource.block_count} voxels${resource.kind === 'entity' ? ` · ${resource.node_count} nodes · ${resource.script_count} scripts` : ''}`}
        </div>
        <div className="market-resource-meta">{Number.isNaN(publishedAt.getTime()) ? resource.created_at : publishedAt.toLocaleDateString()}</div>
        <div className="market-resource-stats">
          <span>↓ {resource.downloads_count}</span>
          <span>♥ {resource.likes_count}</span>
          <span title={resource.digest}>#{resource.digest.slice(0, 8)}</span>
        </div>
        <div className="market-resource-actions">
          <button type="button" className="backpack-section-btn primary" onClick={() => onDownload(resource)}>
            <LiaDownloadSolid size={13} style={{ marginRight: 3, display: 'inline', verticalAlign: 'text-bottom' }} /> Download
          </button>
          <button
            type="button"
            className={`backpack-section-btn market-like-btn ${resource.is_liked ? 'active' : ''}`}
            aria-pressed={resource.is_liked}
            onClick={() => onLike(resource)}
          >
            {resource.is_liked ? (
              <LiaHeartSolid size={13} style={{ marginRight: 3, display: 'inline', verticalAlign: 'text-bottom', color: '#ff6b81' }} />
            ) : (
              <LiaHeart size={13} style={{ marginRight: 3, display: 'inline', verticalAlign: 'text-bottom' }} />
            )}
            {resource.is_liked ? 'Liked' : 'Like'}
          </button>
          {isAdmin && (
            <button
              type="button"
              className="backpack-pixel-btn danger"
              title="Admin delete market resource"
              aria-label="Admin delete market resource"
              onClick={() => onDelete(resource)}
            >
              <LiaTrashAltSolid size={13} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function MarketSection({
  category,
  isAdmin,
  onDownload,
  refreshKey,
}: {
  category: InventoryCategory;
  isAdmin: boolean;
  onDownload: (resource: SpaceMarketResource) => void;
  refreshKey?: number;
}) {
  const [marketSort, setMarketSort] = useState<SpaceMarketSort>('latest');
  const [marketPage, setMarketPage] = useState(1);
  const pageSize = 9;
  const [marketItems, setMarketItems] = useState<SpaceMarketResource[]>([]);
  const [marketTotal, setMarketTotal] = useState(0);
  const [marketQuota, setMarketQuota] = useState<SpaceMarketQuota | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState('');
  const marketRequestIdRef = useRef(0);
  const marketClient = spaceUiStore.getMarketClient();

  const loadMarket = useCallback(async (
    targetCategory: InventoryCategory,
    sort: SpaceMarketSort,
    page: number
  ) => {
    if (!marketClient) return;
    const requestId = ++marketRequestIdRef.current;
    setMarketLoading(true);
    setMarketError('');
    try {
      const offset = (page - 1) * pageSize;
      const response = await marketClient.listResources(targetCategory, sort, pageSize, offset);
      if (requestId !== marketRequestIdRef.current) return;
      setMarketItems(response.items);
      setMarketTotal(response.total);
      setMarketQuota(response.quota);
    } catch (error) {
      if (requestId !== marketRequestIdRef.current) return;
      setMarketError(error instanceof Error ? error.message : String(error));
    } finally {
      if (requestId === marketRequestIdRef.current) setMarketLoading(false);
    }
  }, [marketClient]);

  // When category, sort, or refreshKey changes, reload market
  useEffect(() => {
    setMarketPage(1);
    void loadMarket(category, marketSort, 1);
  }, [category, marketSort, refreshKey, loadMarket]);

  const handlePageChange = (newPage: number) => {
    setMarketPage(newPage);
    void loadMarket(category, marketSort, newPage);
  };

  const handleLike = async (resource: SpaceMarketResource) => {
    if (!marketClient) return;
    try {
      const result = await marketClient.toggleLike(resource.id);
      setMarketItems(items => items.map(item => item.id === resource.id
        ? { ...item, is_liked: result.is_liked, likes_count: result.likes_count }
        : item));
    } catch (error: any) {
      spaceUiStore.showToast(error?.message || 'Failed to like resource');
    }
  };

  const handleDelete = async (resource: SpaceMarketResource) => {
    if (!marketClient || !isAdmin) return;
    if (!window.confirm(`Delete "${resource.name}" from the market?`)) return;
    try {
      await marketClient.deleteResource(resource.id);
      setMarketItems(items => items.filter(item => item.id !== resource.id));
      setMarketTotal(total => Math.max(0, total - 1));
      spaceUiStore.showToast(`Deleted "${resource.name}" from the market.`);
    } catch (error: any) {
      spaceUiStore.showToast(error?.message || 'Failed to delete resource');
    }
  };

  const totalPages = Math.max(1, Math.ceil(marketTotal / pageSize));

  return (
    <div className="market-section-container" id={`market-section-${category}`}>
      <div className="market-toolbar">
        <div className="market-section-title-group">
          <div className="backpack-section-title">
            <LiaStoreAltSolid size={18} style={{ color: 'var(--accent-light)' }} />
            <span>Community Market ({category === 'blockset' ? 'Block Sets' : category === 'entity' ? 'Entities' : 'Color Sets'})</span>
          </div>
          <div className="market-license-note">
            Published under <strong>AGPL-3.0-only</strong>
            {marketQuota && (
              <span className="market-quota">
                Today: {marketQuota.published_today}/{marketQuota.daily_limit} · {marketQuota.remaining_today} remaining
              </span>
            )}
          </div>
        </div>

        <div className="market-sort-buttons" role="group" aria-label="Market ranking">
          {([
            ['downloads', 'Most downloaded'],
            ['likes', 'Most liked'],
            ['latest', 'Newest'],
          ] as Array<[SpaceMarketSort, string]>).map(([sort, label]) => (
            <button
              key={sort}
              type="button"
              className={`backpack-section-btn ${marketSort === sort ? 'active' : ''}`}
              onClick={() => setMarketSort(sort)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {marketError && <div className="market-state error">{marketError}</div>}

      {marketLoading && marketItems.length === 0 ? (
        <div className="market-state">Loading market resources…</div>
      ) : marketItems.length === 0 ? (
        <div className="market-state">No {category} resources have been published yet. Be the first to publish one!</div>
      ) : (
        <>
          <div className="market-result-summary">
            {marketTotal} resources available · Page {marketPage} of {totalPages}
          </div>
          <div className="market-grid">
            {marketItems.map(resource => (
              <MarketResourceCard
                key={resource.id}
                resource={resource}
                isAdmin={isAdmin}
                onDownload={onDownload}
                onLike={handleLike}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* Market Pagination */}
          {totalPages > 1 && (
            <div className="market-pagination">
              <button
                type="button"
                className="market-page-btn"
                disabled={marketPage <= 1}
                title="Previous page"
                onClick={() => handlePageChange(Math.max(1, marketPage - 1))}
              >
                <LiaAngleLeftSolid />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - marketPage) <= 2)
                .map((p, idx, arr) => {
                  const prev = arr[idx - 1];
                  const hasGap = prev && p - prev > 1;
                  return (
                    <React.Fragment key={p}>
                      {hasGap && <span className="market-page-ellipsis">…</span>}
                      <button
                        type="button"
                        className={`market-page-btn ${marketPage === p ? 'active' : ''}`}
                        onClick={() => handlePageChange(p)}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  );
                })}

              <button
                type="button"
                className="market-page-btn"
                disabled={marketPage >= totalPages}
                title="Next page"
                onClick={() => handlePageChange(Math.min(totalPages, marketPage + 1))}
              >
                <LiaAngleRightSolid />
              </button>
              <span className="market-page-info">
                {marketPage} / {totalPages}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function InventoryModal() {
  const state = useSpaceUi(snapshot => snapshot);
  const activeCategory: InventoryCategory = state.activeInventoryCategory === 'entity'
    ? 'entity'
    : state.activeInventoryCategory === 'colorset'
      ? 'colorset'
      : 'blockset';

  const [marketRefreshKey, setMarketRefreshKey] = useState(0);
  const marketClient = spaceUiStore.getMarketClient();

  if (state.activeModal !== 'inventory') return null;

  const inventories = state.controller?.inventories || {};
  const blocksets = inventories.blockset?.items || [];
  const entities = inventories.entity?.items || [];
  const colorsets = inventories.colorset?.items || [];

  const publishItem = async (category: InventoryCategory, item: any) => {
    if (!marketClient || !state.controller) return;
    const encoded = state.controller.encodeInventoryItem?.(category, item);
    if (!encoded) {
      spaceUiStore.showToast('Could not serialize this backpack item.');
      return;
    }
    const validated = state.controller.parseInventoryImport?.(encoded, category);
    if (!validated?.ok) {
      spaceUiStore.showToast(validated?.error || 'This backpack item is not portable.');
      return;
    }
    const payload = state.controller.encodeInventoryItem?.(category, validated.item);
    if (!payload) {
      spaceUiStore.showToast('Could not canonicalize this backpack item.');
      return;
    }
    try {
      const result = await marketClient.publishResource(category, payload);
      spaceUiStore.showToast(`Published "${result.resource.name}" under AGPL-3.0`);
      setMarketRefreshKey(key => key + 1);
    } catch (error: any) {
      if (error instanceof SpaceMarketError) {
        if (error.code === 'RESOURCE_ALREADY_PUBLISHED') {
          spaceUiStore.showToast('This exact resource is already published.');
          return;
        }
        if (error.code === 'DAILY_PUBLISH_LIMIT_REACHED') {
          spaceUiStore.showToast('Daily publication limit reached (10/10).');
          return;
        }
      }
      spaceUiStore.showToast(error?.message || 'Publish failed');
    }
  };

  const downloadResource = async (resource: SpaceMarketResource) => {
    if (!marketClient || !state.controller) return;
    try {
      const downloaded = await marketClient.downloadResource(resource.id);
      const parsed = state.controller.parseInventoryImport?.(
        downloaded.payload,
        downloaded.kind
      );
      if (!parsed?.ok) throw new Error(parsed?.error || 'Downloaded resource failed local validation.');
      const index = state.controller.addInventoryItem?.(downloaded.kind, parsed.item);
      if (index === null || index === undefined) {
        throw new Error(`${downloaded.kind} backpack is full.`);
      }
      state.controller.setActiveInventoryCategory?.(downloaded.kind);
      spaceUiStore.syncInventoryState();
      spaceUiStore.showToast(`Downloaded to ${downloaded.kind} slot ${index + 1} · AGPL-3.0`);
    } catch (error: any) {
      spaceUiStore.showToast(error?.message || 'Download failed');
    }
  };

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
            <div className="inventory-title-row">
              <h2>Backpack &amp; Market</h2>
            </div>
            <div className="backpack-tabs-bar" role="tablist" aria-label="Resource categories">
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
            style={{ width: 32, height: 32, fontSize: 16 }}
            title="Close backpack (ESC)"
            onClick={() => spaceUiStore.toggleInventoryModal(false)}
          >
            ✕
          </button>
        </div>

        {activeCategory === 'blockset' && (
          <div className="backpack-tab-panel backpack-split-layout" id="backpack-panel-blockset">
            <div className="backpack-main-col">
              <div className="backpack-section-header">
                <div className="backpack-section-title">
                  <LiaBoxesSolid size={18} />
                  <span>My Block Sets (99 slots)</span>
                </div>
                <div className="backpack-panel-footer">
                  <div className="backpack-panel-actions">
                    <Import3DModelPopover />
                    <ImportProtobufButton category="blockset" />
                  </div>
                </div>
              </div>

              <InventorySlotsRow
                category="blockset"
                items={blocksets}
                onPublish={publishItem}
              />
            </div>

            <aside className="backpack-market-sidebar">
              <MarketSection
                category="blockset"
                isAdmin={state.isAdmin}
                onDownload={downloadResource}
                refreshKey={marketRefreshKey}
              />
            </aside>
          </div>
        )}

        {activeCategory === 'entity' && (
          <div className="backpack-tab-panel backpack-split-layout" id="backpack-panel-entity">
            <div className="backpack-main-col">
              <div className="backpack-section-header">
                <div className="backpack-section-title">
                  <LiaBoxesSolid size={18} />
                  <span>My Entities (99 slots)</span>
                </div>
                <div className="backpack-panel-footer">
                  <div className="backpack-panel-actions">
                    <ImportProtobufButton category="entity" />
                  </div>
                </div>
              </div>

              <InventorySlotsRow
                category="entity"
                items={entities}
                onPublish={publishItem}
              />
            </div>

            <aside className="backpack-market-sidebar">
              <MarketSection
                category="entity"
                isAdmin={state.isAdmin}
                onDownload={downloadResource}
                refreshKey={marketRefreshKey}
              />
            </aside>
          </div>
        )}

        {activeCategory === 'colorset' && (
          <div className="backpack-tab-panel backpack-split-layout" id="backpack-panel-colorset">
            <div className="backpack-main-col">
              <div className="backpack-section-header">
                <div className="backpack-section-title">
                  <LiaBoxesSolid size={18} />
                  <span>My Color Sets (9 slots)</span>
                </div>
                <div className="backpack-panel-footer">
                  <div className="backpack-panel-actions">
                    <ImportProtobufButton category="colorset" />
                  </div>
                </div>
              </div>

              <div className="inventory-grid" id="inventory-grid">
                {(() => {
                  const totalCount = colorsets.filter(Boolean).length;
                  return Array.from({ length: 9 }, (_, index) => {
                    const item = colorsets[index];
                    return item ? (
                      <ColorSetCard key={item.id || `c:${index}`} index={index} item={item} totalCount={totalCount} onPublish={publishItem} />
                    ) : (
                      <EmptyColorSetSlot key={`empty-c:${index}`} />
                    );
                  });
                })()}
              </div>
            </div>

            <aside className="backpack-market-sidebar">
              <MarketSection
                category="colorset"
                isAdmin={state.isAdmin}
                onDownload={downloadResource}
                refreshKey={marketRefreshKey}
              />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
