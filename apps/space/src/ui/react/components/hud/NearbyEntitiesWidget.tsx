import React, { useState } from 'react';
import { useSpaceStore, NearbyEntityItem } from '../../store/useSpaceStore.ts';

const PAGE_SIZE = 3;

export const NearbyEntitiesWidget: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const nearbyEntities = useSpaceStore((s) => s.nearbyEntities);
  const navigationSystem = useSpaceStore((s) => s.navigationSystem);
  const showToast = useSpaceStore((s) => s.showToast);

  const total = nearbyEntities.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const currentItems = nearbyEntities.slice(startIdx, startIdx + PAGE_SIZE);

  const handleNav = (e: React.MouseEvent, item: NearbyEntityItem) => {
    e.stopPropagation();
    if (navigationSystem) {
      const flightY = Math.max(item.pos.y + 1.5, 20);
      navigationSystem.startNavigation(item.pos.x, flightY, item.pos.z);
      showToast(`Auto Pilot Engaged: ${item.name} (${item.pos.x.toFixed(0)}, ${flightY.toFixed(0)}, ${item.pos.z.toFixed(0)})`);
    }
  };

  return (
    <div className="hud-entities-section" id="hud-entities-section">
      <div
        className="hud-entities-header"
        id="hud-entities-toggle"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        title="Toggle nearby entities list"
      >
        <div className="hud-entities-title">
          <span className="hud-entities-icon">⬡</span>
          <span>Nearby Entities (<span id="hud-entities-count">{total}</span>)</span>
        </div>
        <button
          type="button"
          id="hud-entities-toggle-btn"
          className={`hud-entities-toggle-btn ${expanded ? 'expanded' : ''}`}
          aria-label="Toggle entities list"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          ▼
        </button>
      </div>

      <div className="hud-entities-body" id="hud-entities-body" style={{ display: expanded ? 'flex' : 'none' }}>
        <div className="hud-entities-list" id="hud-entities-list">
          {total === 0 ? (
            <div className="hud-entity-empty">No entities detected nearby</div>
          ) : (
            currentItems.map((item) => {
              const distStr = item.dist < 1000 ? `${item.dist.toFixed(1)}m` : `${(item.dist / 1000).toFixed(2)}km`;
              const posStr = `X:${item.pos.x.toFixed(0)} Y:${item.pos.y.toFixed(0)} Z:${item.pos.z.toFixed(0)}`;
              return (
                <div key={item.id} className="hud-entity-item">
                  <div className="hud-entity-info">
                    <div className="hud-entity-name" title={item.name}>{item.name}</div>
                    <div className="hud-entity-meta">
                      <span className="hud-entity-pos">{posStr}</span>
                      <span className="hud-entity-dist">{distStr}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="hud-entity-nav-btn"
                    onClick={(e) => handleNav(e, item)}
                    title={`Autopilot to ${item.name}`}
                  >
                    NAV
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="hud-entities-pagination" id="hud-entities-pagination" style={{ display: total > PAGE_SIZE ? 'flex' : 'none' }}>
          <button
            type="button"
            id="hud-entities-prev-btn"
            className="hud-page-btn"
            disabled={currentPage <= 1}
            onClick={(e) => {
              e.stopPropagation();
              setPage(p => Math.max(1, p - 1));
            }}
            title="Previous page"
          >
            ◀
          </button>
          <span id="hud-entities-page-info" className="hud-page-info">{currentPage} / {totalPages}</span>
          <button
            type="button"
            id="hud-entities-next-btn"
            className="hud-page-btn"
            disabled={currentPage >= totalPages}
            onClick={(e) => {
              e.stopPropagation();
              setPage(p => Math.min(totalPages, p + 1));
            }}
            title="Next page"
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
};
