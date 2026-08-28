import React, { useRef, useState } from 'react';
import { useSpaceStore } from '../../store/useSpaceStore.ts';
import { InventoryThumbnailRenderer } from '../../../../engine/render/InventoryThumbnailRenderer.ts';

export const BackpackModal: React.FC = () => {
  const activeModal = useSpaceStore((s) => s.activeModal);
  const closeAllModals = useSpaceStore((s) => s.closeAllModals);
  const controller = useSpaceStore((s) => s.controller);
  const inventories = useSpaceStore((s) => s.inventories);
  const showToast = useSpaceStore((s) => s.showToast);

  const [stlPrecision, setStlPrecision] = useState<'standard' | 'micro'>('standard');
  const [stlSize, setStlSize] = useState('16');
  const [stlStatus, setStlStatus] = useState<string | null>(null);

  const blocksetFileInputRef = useRef<HTMLInputElement>(null);
  const entityFileInputRef = useRef<HTMLInputElement>(null);
  const colorsetFileInputRef = useRef<HTMLInputElement>(null);
  const stlFileInputRef = useRef<HTMLInputElement>(null);

  if (activeModal !== 'inventory') return null;

  const thumbnailRenderer = InventoryThumbnailRenderer.getInstance();

  const handleExportJson = (category: string, item: any, defaultName: string) => {
    const filename = `${(item.name || defaultName).replace(/[^a-z0-9_-]/gi, '_').toLowerCase()}.json`;
    const serialized = controller?.serializeInventoryItem?.(category, item) || item;
    const jsonStr = JSON.stringify(serialized, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filename}`);
  };

  const handleImportJson = (category: 'blockset' | 'entity' | 'colorset', fileInput: HTMLInputElement) => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        if (category === 'blockset') {
          controller?.importBlockSetToInventory?.(parsed);
        } else if (category === 'entity') {
          controller?.importEntityToInventory?.(parsed);
        } else if (category === 'colorset') {
          controller?.importColorSetToInventory?.(parsed);
        }
        showToast(`Imported ${file.name} to ${category}`);
      } catch (err: any) {
        showToast(`Import failed: ${err.message}`);
      }
      fileInput.value = '';
    };
    reader.readAsText(file);
  };

  const handleRename = (category: 'blockset' | 'entity' | 'colorset', index: number, name: string) => {
    controller?.renameInventoryItem?.(category, index, name);
  };

  const handleDelete = (category: 'blockset' | 'entity' | 'colorset', index: number) => {
    controller?.deleteInventoryItem?.(category, index);
  };

  const handleSTLFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStlStatus(`Voxelizing ${file.name}…`);

    try {
      const buffer = await file.arrayBuffer();
      const worker = new Worker(new URL('../../../../engine/voxel/STLImportWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event) => {
        const result = event.data;
        if (result.ok && result.blocks) {
          controller?.importBlockSetToInventory?.({
            name: file.name.replace(/\.stl$/i, ''),
            blocks: result.blocks,
            blockCount: result.blocks.length
          });
          setStlStatus(`Imported ${result.blocks.length} voxels into Block Sets!`);
          showToast(`STL Imported: ${result.blocks.length} voxels`);
        } else {
          setStlStatus(`Voxelization error: ${result.reason || 'failed'}`);
        }
        worker.terminate();
      };
      worker.onerror = (err) => {
        setStlStatus(`Worker error: ${err.message}`);
        worker.terminate();
      };
      worker.postMessage({
        buffer,
        sizeBlocks: parseInt(stlSize, 10) || 16,
        precision: stlPrecision,
        color: controller?.selectedColor ?? 0xf2a93b
      }, [buffer]);
    } catch (err: any) {
      setStlStatus(`Error: ${err.message}`);
    }
  };

  const blockSets = inventories.blockset?.items || [];
  const entities = inventories.entity?.items || [];
  const colorSets = inventories.colorset?.items || [];

  return (
    <div className="modal-backdrop show" id="inventory-modal" onClick={closeAllModals}>
      <div className="modal-content inventory-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>BACKPACK &amp; INVENTORY</h2>
          <button type="button" className="modal-close" onClick={closeAllModals}>✕</button>
        </div>
        <div className="modal-sub">
          Manage saved Block Sets, assembled Entities, Color palettes, and import 3D STL meshes.
        </div>

        <div className="inventory-grid" id="inventory-grid">
          {/* ================= BLOCK SETS ================= */}
          <div className="backpack-section-header">
            <span className="backpack-section-title">
              BLOCK SETS — hammer builds plain blocks <span className="backpack-section-count">{blockSets.filter(Boolean).length}/9</span>
            </span>
            <div className="backpack-section-actions">
              <input
                ref={blocksetFileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={() => blocksetFileInputRef.current && handleImportJson('blockset', blocksetFileInputRef.current)}
              />
              <button
                type="button"
                className="backpack-section-btn"
                onClick={() => blocksetFileInputRef.current?.click()}
              >
                Import JSON
              </button>
            </div>
          </div>

          {Array.from({ length: 9 }).map((_, index) => {
            const item = blockSets[index];
            if (!item) {
              return (
                <div key={index} className="inventory-card backpack-item backpack-item-empty">
                  <div className="backpack-slot-preview-box empty">
                    <span className="backpack-slot-index">#{index + 1}</span>
                    <span className="backpack-slot-empty-icon">+</span>
                  </div>
                  <div className="backpack-item-details">
                    <div className="backpack-item-meta">Empty slot {index + 1} · R copy or import</div>
                  </div>
                </div>
              );
            }

            const count = item.blockCount || item.blocks?.length || 0;
            const thumbUrl = thumbnailRenderer.getThumbnail(item, 96);

            return (
              <div key={index} className="inventory-card backpack-item">
                <div className="backpack-slot-preview-box filled">
                  <span className="backpack-slot-index">#{index + 1}</span>
                  {thumbUrl && (
                    <img className="inv-slot-thumb" src={thumbUrl} alt={item.name || `Block set ${index + 1}`} draggable={false} />
                  )}
                  {count > 0 && <span className="backpack-slot-count">{count}</span>}
                </div>

                <div className="backpack-item-details">
                  <input
                    type="text"
                    className="backpack-item-name-input"
                    defaultValue={item.name || `Block set ${index + 1}`}
                    onBlur={(e) => handleRename('blockset', index, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                  />
                  <div className="backpack-item-meta">{count} voxels</div>
                  <div className="inv-item-actions">
                    <button
                      type="button"
                      className="backpack-item-btn"
                      onClick={() => handleExportJson('blockset', item, `Block set ${index + 1}`)}
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      className="backpack-item-btn danger"
                      onClick={() => handleDelete('blockset', index)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* ================= STL IMPORT ================= */}
          <div className="inventory-card stl-import-card" style={{ gridColumn: '1 / -1' }}>
            <div className="stl-card-header">
              <span className="inv-icon">⬡</span>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div className="inv-name" style={{ color: 'var(--brass-light)' }}>IMPORT STL → BLOCK BODY</div>
                <div className="inv-desc">Convert an .stl mesh into a block set — Hammer left-click places plain blocks</div>
              </div>
            </div>
            <div className="stl-size-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
              <span className="stl-size-label">Precision:</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="stl-precision"
                  checked={stlPrecision === 'standard'}
                  onChange={() => setStlPrecision('standard')}
                />
                1m blocks
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="stl-precision"
                  checked={stlPrecision === 'micro'}
                  onChange={() => setStlPrecision('micro')}
                />
                0.2m microblocks
              </label>

              <span className="stl-size-label" style={{ marginLeft: '12px' }}>Target size:</span>
              <input
                type="number"
                value={stlSize}
                onChange={(e) => setStlSize(e.target.value)}
                style={{ width: '60px', padding: '2px 4px', background: '#111', color: '#fff', border: '1px solid #333' }}
              />

              <input
                ref={stlFileInputRef}
                type="file"
                accept=".stl"
                style={{ display: 'none' }}
                onChange={handleSTLFileChange}
              />
              <button
                type="button"
                className="backpack-section-btn"
                style={{ marginLeft: 'auto' }}
                onClick={() => stlFileInputRef.current?.click()}
              >
                Select .STL File
              </button>
            </div>
            {stlStatus && (
              <div style={{ fontSize: '11px', color: 'var(--accent-light)', marginTop: '4px' }}>
                {stlStatus}
              </div>
            )}
          </div>

          {/* ================= ENTITIES ================= */}
          <div className="backpack-section-header">
            <span className="backpack-section-title">
              ENTITIES — hammer builds the physics entity <span className="backpack-section-count">{entities.filter(Boolean).length}/9</span>
            </span>
            <div className="backpack-section-actions">
              <input
                ref={entityFileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={() => entityFileInputRef.current && handleImportJson('entity', entityFileInputRef.current)}
              />
              <button
                type="button"
                className="backpack-section-btn"
                onClick={() => entityFileInputRef.current?.click()}
              >
                Import JSON
              </button>
            </div>
          </div>

          {Array.from({ length: 9 }).map((_, index) => {
            const item = entities[index];
            if (!item) {
              return (
                <div key={index} className="inventory-card backpack-item backpack-item-empty">
                  <div className="backpack-slot-preview-box empty">
                    <span className="backpack-slot-index">#{index + 1}</span>
                    <span className="backpack-slot-empty-icon">+</span>
                  </div>
                  <div className="backpack-item-details">
                    <div className="backpack-item-meta">Empty slot {index + 1} · R copy or import</div>
                  </div>
                </div>
              );
            }

            const count = item.blockCount || item.blocks?.length || 0;
            const scriptCount = item.scripts?.length || 0;
            const thumbUrl = thumbnailRenderer.getThumbnail(item, 96);

            return (
              <div key={index} className="inventory-card backpack-item">
                <div className="backpack-slot-preview-box filled">
                  <span className="backpack-slot-index">#{index + 1}</span>
                  {thumbUrl && (
                    <img className="inv-slot-thumb" src={thumbUrl} alt={item.name || `Entity ${index + 1}`} draggable={false} />
                  )}
                  {count > 0 && <span className="backpack-slot-count">{count}</span>}
                </div>

                <div className="backpack-item-details">
                  <input
                    type="text"
                    className="backpack-item-name-input"
                    defaultValue={item.name || `Entity ${index + 1}`}
                    onBlur={(e) => handleRename('entity', index, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                  />
                  <div className="backpack-item-meta">{count} blocks · {scriptCount} scripts</div>
                  <div className="inv-item-actions">
                    <button
                      type="button"
                      className="backpack-item-btn"
                      onClick={() => handleExportJson('entity', item, `Entity ${index + 1}`)}
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      className="backpack-item-btn danger"
                      onClick={() => handleDelete('entity', index)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* ================= COLOR SETS ================= */}
          <div className="backpack-section-header">
            <span className="backpack-section-title">
              COLOR SETS — palette presets <span className="backpack-section-count">{colorSets.filter(Boolean).length}/9</span>
            </span>
            <div className="backpack-section-actions">
              <input
                ref={colorsetFileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={() => colorsetFileInputRef.current && handleImportJson('colorset', colorsetFileInputRef.current)}
              />
              <button
                type="button"
                className="backpack-section-btn"
                onClick={() => colorsetFileInputRef.current?.click()}
              >
                Import JSON
              </button>
            </div>
          </div>

          {Array.from({ length: 9 }).map((_, index) => {
            const item = colorSets[index];
            if (!item) {
              return (
                <div key={index} className="inventory-card backpack-item backpack-item-empty">
                  <div className="backpack-slot-preview-box empty">
                    <span className="backpack-slot-index">#{index + 1}</span>
                    <span className="backpack-slot-empty-icon">+</span>
                  </div>
                  <div className="backpack-item-details">
                    <div className="backpack-item-meta">Empty slot {index + 1}</div>
                  </div>
                </div>
              );
            }

            const colors = item.colors || [];

            return (
              <div key={index} className="inventory-card backpack-item">
                <div className="backpack-slot-preview-box filled">
                  <span className="backpack-slot-index">#{index + 1}</span>
                  <div className="colorset-preview-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', width: '36px', height: '36px', gap: '1px' }}>
                    {colors.slice(0, 9).map((hex: string, i: number) => (
                      <div key={i} style={{ backgroundColor: hex, width: '100%', height: '100%' }} />
                    ))}
                  </div>
                </div>

                <div className="backpack-item-details">
                  <input
                    type="text"
                    className="backpack-item-name-input"
                    defaultValue={item.name || `Color set ${index + 1}`}
                    onBlur={(e) => handleRename('colorset', index, e.target.value)}
                  />
                  <div className="backpack-item-meta">{colors.length} colors</div>
                  <div className="inv-item-actions">
                    <button
                      type="button"
                      className="backpack-item-btn"
                      onClick={() => handleExportJson('colorset', item, `Color set ${index + 1}`)}
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      className="backpack-item-btn danger"
                      onClick={() => handleDelete('colorset', index)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
