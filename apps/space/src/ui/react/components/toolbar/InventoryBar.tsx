import React from 'react';
import { useSpaceStore } from '../../store/useSpaceStore.ts';
import { InventoryThumbnailRenderer } from '../../../../engine/render/InventoryThumbnailRenderer.ts';

export const InventoryBar: React.FC = () => {
  const activeCategory = useSpaceStore((s) => s.activeInventoryCategory);
  const selectedIndex = useSpaceStore((s) => s.selectedInventoryIndex);
  const inventories = useSpaceStore((s) => s.inventories);
  const selectInventoryCategory = useSpaceStore((s) => s.selectInventoryCategory);
  const selectInventorySlot = useSpaceStore((s) => s.selectInventorySlot);
  const toggleModal = useSpaceStore((s) => s.toggleModal);

  const currentItems = inventories[activeCategory]?.items || [];
  const thumbnailRenderer = InventoryThumbnailRenderer.getInstance();

  return (
    <div className="inventory-bar" id="inventory-bar">
      <div className="inventory-bar-header">
        <div className="inv-cat-tabs" id="inv-cat-tabs">
          <button
            type="button"
            className={`inv-cat-tab ${activeCategory === 'blockset' ? 'active' : ''}`}
            onClick={() => selectInventoryCategory('blockset')}
          >
            BKS
          </button>
          <button
            type="button"
            className={`inv-cat-tab ${activeCategory === 'entity' ? 'active' : ''}`}
            onClick={() => selectInventoryCategory('entity')}
          >
            ENT
          </button>
        </div>

        <span
          className="backpack-bar-title"
          id="backpack-bar-title"
          title="Click to open full backpack (E)"
          onClick={() => toggleModal('inventory')}
        >
          {activeCategory === 'blockset' ? 'Block Sets' : 'Entities'}
        </span>

        <span className="backpack-bar-hint">
          <b>E</b> Full Backpack · <b>Tab</b> BKS↔ENT
        </span>
      </div>

      <div className="inventory-bar-slots" id="inventory-bar-slots">
        {Array.from({ length: 9 }).map((_, index) => {
          const item = currentItems[index];
          const isSelected = selectedIndex === index;
          const count = item ? (item.blockCount || item.blocks?.length || 0) : 0;
          const thumbUrl = item ? thumbnailRenderer.getThumbnail(item, 96) : null;

          return (
            <div
              key={index}
              className={`inventory-slot ${item ? 'filled' : 'empty'} ${isSelected ? 'active' : ''}`}
              onClick={() => selectInventorySlot(index)}
              title={item ? `${item.name || 'Slot ' + (index + 1)} · ${count} voxels` : `Empty slot ${index + 1}`}
            >
              <span className="inv-slot-key">{index + 1}</span>

              {item && thumbUrl ? (
                <img
                  className="inv-slot-thumb"
                  src={thumbUrl}
                  alt={item.name || `Slot ${index + 1}`}
                  draggable={false}
                />
              ) : null}

              {item && count > 0 && (
                <span className="inv-slot-count">{count}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
