import React, { useState } from 'react';
import { useSpaceStore } from '../../store/useSpaceStore.ts';

export const AutoPilotPanel: React.FC = () => {
  const navigationSystem = useSpaceStore((s) => s.navigationSystem);
  const showToast = useSpaceStore((s) => s.showToast);

  const [xVal, setXVal] = useState('');
  const [yVal, setYVal] = useState('20');
  const [zVal, setZVal] = useState('');
  const [active, setActive] = useState(false);

  const handleStart = () => {
    const x = parseFloat(xVal);
    const y = parseFloat(yVal);
    const z = parseFloat(zVal);

    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      showToast('Please enter valid numeric coordinates (X, Y, Z)');
      return;
    }

    if (navigationSystem) {
      navigationSystem.startNavigation(x, y, z);
      setActive(true);
      showToast(`Auto Pilot Engaged: Target (${x}, ${y}, ${z})`);
    }
  };

  const handleStop = () => {
    if (navigationSystem) {
      navigationSystem.stopNavigation();
      setActive(false);
      showToast('Auto Pilot Disengaged');
    }
  };

  return (
    <div className="autopilot-panel" id="autopilot-panel">
      <div className="autopilot-header">
        <span className="autopilot-title">✈ AUTO PILOT</span>
        <span className={`autopilot-status ${active ? 'active' : ''}`}>
          {active ? 'ENGAGED' : 'STANDBY'}
        </span>
      </div>

      <div className="autopilot-inputs">
        <div className="autopilot-input-group">
          <label>X</label>
          <input
            type="number"
            value={xVal}
            onChange={(e) => setXVal(e.target.value)}
            placeholder="0"
            onFocus={(e) => e.stopPropagation()}
          />
        </div>
        <div className="autopilot-input-group">
          <label>Y</label>
          <input
            type="number"
            value={yVal}
            onChange={(e) => setYVal(e.target.value)}
            placeholder="20"
            onFocus={(e) => e.stopPropagation()}
          />
        </div>
        <div className="autopilot-input-group">
          <label>Z</label>
          <input
            type="number"
            value={zVal}
            onChange={(e) => setZVal(e.target.value)}
            placeholder="0"
            onFocus={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      <div className="autopilot-actions">
        {!active ? (
          <button type="button" className="autopilot-btn start" onClick={handleStart}>
            ENGAGE NAV
          </button>
        ) : (
          <button type="button" className="autopilot-btn stop" onClick={handleStop}>
            DISENGAGE
          </button>
        )}
      </div>
    </div>
  );
};
