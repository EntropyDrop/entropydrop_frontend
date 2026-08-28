import React from 'react';
import { useSpaceStore } from '../../store/useSpaceStore.ts';

const SAMPLE_BLUEPRINTS = [
  {
    id: 'quadcopter',
    name: 'Quadcopter Drone',
    category: 'Vehicle',
    desc: '4-rotor agile drone with auto-level flight controller script',
    blocks: 48,
    scripts: 1
  },
  {
    id: 'wind_turbine',
    name: 'Wind Turbine',
    category: 'Mechanism',
    desc: 'Rotating 3-blade power generator with bearing constraint',
    blocks: 120,
    scripts: 1
  },
  {
    id: 'lunar_rover',
    name: 'Lunar Rover',
    category: 'Vehicle',
    desc: '4-wheel drive rover with suspension and steerable front wheels',
    blocks: 86,
    scripts: 1
  },
  {
    id: 'robotic_arm',
    name: '2-Axis Robot Arm',
    category: 'Mechanism',
    desc: 'Articulated arm with inverse kinematics script',
    blocks: 34,
    scripts: 1
  }
];

export const BlueprintsModal: React.FC = () => {
  const activeModal = useSpaceStore((s) => s.activeModal);
  const closeAllModals = useSpaceStore((s) => s.closeAllModals);
  const controller = useSpaceStore((s) => s.controller);
  const showToast = useSpaceStore((s) => s.showToast);

  if (activeModal !== 'blueprints') return null;

  const handleSpawnBlueprint = (bp: typeof SAMPLE_BLUEPRINTS[0]) => {
    if (controller) {
      showToast(`Spawned blueprint: ${bp.name}`);
      closeAllModals();
    }
  };

  return (
    <div className="modal-backdrop show" id="blueprints-modal" onClick={closeAllModals}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <h2>STRUCTURE BLUEPRINTS</h2>
          <button type="button" className="modal-close" onClick={closeAllModals}>✕</button>
        </div>
        <div className="modal-sub">
          Instant programmable mechanisms, vehicles, and architectural structures.
        </div>

        <div className="blueprints-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginTop: '12px' }}>
          {SAMPLE_BLUEPRINTS.map((bp) => (
            <div key={bp.id} className="inventory-card" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#fff' }}>{bp.name}</span>
                <span style={{ fontSize: '10px', color: 'var(--accent-light)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px' }}>
                  {bp.category}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{bp.desc}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{bp.blocks} blocks · {bp.scripts} scripts</span>
                <button
                  type="button"
                  className="backpack-item-btn"
                  style={{ width: 'auto', padding: '3px 10px' }}
                  onClick={() => handleSpawnBlueprint(bp)}
                >
                  Spawn
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
