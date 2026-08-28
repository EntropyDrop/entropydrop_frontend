import React, { useEffect, useRef, useState } from 'react';
import { InventoryThumbnailRenderer } from '../../../engine/render/InventoryThumbnailRenderer.ts';
import { MAX_STL_FILE_BYTES } from '../../../engine/voxel/STLVoxelizer.ts';
import { colorToHex, normalizeColor } from '../../../engine/voxel/BlockTypes.ts';
import { spaceUiStore } from '../store/SpaceUiStore.ts';
import { useSpaceUi } from '../store/useSpaceUi.ts';

type InventoryCategory = 'blockset' | 'entity' | 'colorset';

function SectionHeader({ title, count, category, extra }: { title: string; count: number; category: InventoryCategory; extra?: React.ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="backpack-section-header">
      <span className="backpack-section-title">{title} <span className="backpack-section-count">{count}/9</span></span>
      <div className="backpack-section-actions">
        {extra}
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={event => {
          spaceUiStore.importInventoryFile(category, event.target.files?.[0] || null);
          event.target.value = '';
        }} />
        <button className="backpack-section-btn" onClick={() => input.current?.click()}>Import JSON</button>
      </div>
    </div>
  );
}

function EmptySlot({ index, label }: { index: number; label: string }) {
  return (
    <div className="inventory-card backpack-item backpack-item-empty">
      <div className="backpack-slot-preview-box empty"><span className="backpack-slot-index">#{index + 1}</span><span className="backpack-slot-empty-icon">+</span></div>
      <div className="backpack-item-details"><div className="backpack-item-meta">{label}</div></div>
    </div>
  );
}

function InventoryItemCard({ category, index, item }: { category: 'blockset' | 'entity'; index: number; item: any }) {
  const controller = useSpaceUi(state => state.controller);
  const fallback = category === 'blockset' ? `Block set ${index + 1}` : `Entity ${index + 1}`;
  const name = controller?.inventoryItemName?.(category, item, index) || item.name || fallback;
  const count = item.blockCount || item.blocks?.length || 0;
  const thumbnail = InventoryThumbnailRenderer.getInstance().getThumbnail(item, 96);
  const meta = category === 'blockset'
    ? `${count} voxels`
    : `${count} blocks · ${item.scripts?.length || 0} scripts · ${item.mode || 'free_physics'}`;
  return (
    <div className="inventory-card backpack-item">
      <div className="backpack-slot-preview-box filled">
        <span className="backpack-slot-index">#{index + 1}</span>
        {thumbnail ? <img className="inv-slot-thumb" src={thumbnail} alt={name} draggable={false} /> : null}
        {count > 0 ? <span className="backpack-slot-count">{count}</span> : null}
      </div>
      <div className="backpack-item-details">
        <input
          type="text"
          className="backpack-item-name-input"
          maxLength={80}
          value={name}
          aria-label={`${category} slot ${index + 1} name`}
          onChange={event => spaceUiStore.renameInventoryItem(category, index, event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        />
        <div className="backpack-item-meta">{meta}</div>
        <div className="inv-item-actions">
          <button className="backpack-item-btn" onClick={() => spaceUiStore.downloadJson(
            spaceUiStore.inventoryJsonFilename(item.name, fallback),
            controller?.serializeInventoryItem?.(category, item) || item
          )}>Export</button>
          <button className="backpack-item-btn danger" onClick={() => spaceUiStore.deleteInventoryItem(category, index)}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function ColorSetCard({ index, item }: { index: number; item: any }) {
  const controller = useSpaceUi(state => state.controller);
  const name = controller?.inventoryItemName?.('colorset', item, index) || item.name || `Color set ${index + 1}`;
  const updateColor = (colorIndex: number, value: string) => {
    item.colors[colorIndex] = colorToHex(normalizeColor(value));
    controller?.saveInventoriesToLocalStorage?.();
    spaceUiStore.refresh();
  };
  return (
    <div className="inventory-card backpack-item">
      <input className="backpack-item-name-input" maxLength={80} value={name} onChange={event => spaceUiStore.renameInventoryItem('colorset', index, event.target.value)} />
      <div className="backpack-item-meta">9 colors · click a swatch to recolor</div>
      <div className="colorset-colors">
        {(item.colors || []).slice(0, 9).map((hex: string, colorIndex: number) => {
          const safe = colorToHex(normalizeColor(hex));
          return <label key={colorIndex} className="colorset-cell" style={{ background: safe }} title={`Recolor set slot ${colorIndex + 1}`}><input type="color" value={safe} onChange={event => updateColor(colorIndex, event.target.value)} /></label>;
        })}
      </div>
      <div className="inv-item-actions">
        <button className="backpack-item-btn" onClick={() => { spaceUiStore.applyColorSetToPalette(item); spaceUiStore.showToast(`Applied color set "${name}" to the palette`); }}>Apply</button>
        <button className="backpack-item-btn" onClick={() => spaceUiStore.downloadJson(spaceUiStore.inventoryJsonFilename(item.name, `Color set ${index + 1}`), controller?.serializeInventoryItem?.('colorset', item) || item)}>Export</button>
        <button className="backpack-item-btn danger" onClick={() => spaceUiStore.deleteInventoryItem('colorset', index)}>Delete</button>
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
      <div className="stl-card-header"><span className="inv-icon">⬡</span><div style={{ flex: 1, textAlign: 'left' }}><div className="inv-name" style={{ color: 'var(--brass-light)' }}>IMPORT STL → BLOCK BODY</div><div className="inv-desc">Convert an .stl mesh into a block set in the inventory — Hammer left-click places plain blocks</div></div></div>
      <div className="stl-size-row"><span className="stl-size-label">Precision:</span>
        <label className="stl-size-option"><input type="radio" name="stl-size" value="0.2" checked={precision === 0.2} onChange={() => setPrecision(0.2)} /> 0.2 (5×5×5 micro voxels)</label>
        <label className="stl-size-option"><input type="radio" name="stl-size" value="1" checked={precision === 1} onChange={() => setPrecision(1)} /> 1 (standard blocks)</label>
      </div>
      <div className="stl-size-row"><span className="stl-size-label">Size (largest axis):</span><input type="number" id="stl-size-blocks" className="stl-max-select" value={sizeBlocks} min="1" max="256" step="1" required onChange={event => setSizeBlocks(Number(event.target.value))} /><span className="stl-size-hint">required · final model size in 1×1×1 standard blocks</span></div>
      <input type="file" id="stl-file-input" accept=".stl" className="stl-file-input" onChange={event => {
        const next = event.target.files?.[0] || null;
        setFile(next);
        setStatus(next && next.size > MAX_STL_FILE_BYTES ? `Error: ${next.name} exceeds the ${MAX_STL_FILE_BYTES / (1024 * 1024)} MiB limit` : next ? `Ready: ${next.name}` : 'No file selected');
      }} />
      <div className="stl-actions"><button className="banner-btn primary" id="stl-import-btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={importStl}>{workerRef.current ? 'Cancel' : 'Import & Voxelize'}</button><span id="stl-import-status" className="stl-import-status">{status}</span></div>
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
  return (
    <div id="inventory-modal" className="custom-modal open" onMouseDown={event => { if (event.target === event.currentTarget) spaceUiStore.toggleInventoryModal(false); }}>
      <div className="modal-content">
        <div className="modal-header"><h2>Backpack</h2><button id="close-inv-btn" className="icon-btn" style={{ width: 28, height: 28, fontSize: 13 }} onClick={() => spaceUiStore.toggleInventoryModal(false)}>✕</button></div>
        <div className="modal-sub">9 block sets · 9 entities · 9 color sets — exportable as JSON · ⬡ STL meshes importable as block sets</div>
        <div id="inventory-grid" className="inventory-grid">
          <SectionHeader title="BLOCK SETS — hammer builds plain blocks" count={blocksets.filter(Boolean).length} category="blockset" />
          {Array.from({ length: 9 }, (_, index) => blocksets[index] ? <InventoryItemCard key={`b:${index}`} category="blockset" index={index} item={blocksets[index]} /> : <EmptySlot key={`b:${index}`} index={index} label={`Empty slot ${index + 1} · R copy or import`} />)}
          <StlImportCard />
          <SectionHeader title="ENTITIES — hammer builds the physics entity" count={entities.filter(Boolean).length} category="entity" />
          {Array.from({ length: 9 }, (_, index) => entities[index] ? <InventoryItemCard key={`e:${index}`} category="entity" index={index} item={entities[index]} /> : <EmptySlot key={`e:${index}`} index={index} label={`Empty slot ${index + 1} · R copy or import`} />)}
          <SectionHeader title="COLOR SETS — apply to the keyboard palette" count={colorsets.filter(Boolean).length} category="colorset" extra={<button className="backpack-section-btn" onClick={() => spaceUiStore.savePaletteAsColorSet()}>Add current palette</button>} />
          {Array.from({ length: 9 }, (_, index) => colorsets[index] ? <ColorSetCard key={`c:${index}`} index={index} item={colorsets[index]} /> : <EmptySlot key={`c:${index}`} index={index} label={`Empty slot ${index + 1} · save the palette or import`} />)}
        </div>
      </div>
    </div>
  );
}
