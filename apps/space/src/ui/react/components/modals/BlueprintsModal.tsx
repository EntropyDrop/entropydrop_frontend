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
    <div id="blueprints-modal" className="custom-modal show" onClick={closeAllModals}>
      <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Structure Blueprints</h2>
          <button
            id="close-blueprints-btn"
            className="icon-btn"
            style={{ width: '28px', height: '28px', fontSize: '13px' }}
            onClick={closeAllModals}
          >
            ✕
          </button>
        </div>
        <div className="modal-sub">Click to spawn a colored structure in front of you — ready to use!</div>
        <div id="blueprints-grid" className="blueprints-grid">
          {SAMPLE_BLUEPRINTS.map((bp) => (
            <div key={bp.id} className="blueprint-card" onClick={() => handleSpawnBlueprint(bp)}>
              <div className="bp-info">
                <div className="bp-name">{bp.name}</div>
                <div className="bp-meta">{bp.blocks} blocks · {bp.category}</div>
                <div className="bp-desc">{bp.desc}</div>
              </div>
              <button type="button" className="banner-btn primary bp-btn">Spawn</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
