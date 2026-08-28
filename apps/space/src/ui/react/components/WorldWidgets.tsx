import React, { useCallback, useEffect, useState } from 'react';
import { useSpaceUi } from '../store/useSpaceUi.ts';

export function NavigationPanel() {
  const navigation = useSpaceUi(state => state.navigationSystem);
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [z, setZ] = useState('');
  const navigating = !!navigation?.isNavigating;

  useEffect(() => {
    const target = navigation?.target;
    if (!target) return;
    setX(target.x.toFixed(0));
    setY(target.y.toFixed(0));
    setZ(target.z.toFixed(0));
  }, [navigation?.target]);

  useEffect(() => {
    if (!navigating) return;
    const cancelOnInput = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      navigation.stopNavigation('cancelled');
    };
    window.addEventListener('keydown', cancelOnInput, true);
    return () => window.removeEventListener('keydown', cancelOnInput, true);
  }, [navigating, navigation]);

  const start = () => navigation?.startFromInputValues?.(x, y, z);
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      start();
      (event.currentTarget as HTMLElement).blur();
    }
  };

  return (
    <div id="nav-system-container" className={`nav-system-container ${navigating ? 'navigating' : ''}`}>
      <div className="nav-badge"><span className="nav-badge-dot" /><span>AUTO PILOT</span></div>
      <div className="nav-coord-inputs">
        <div className="nav-input-field"><span className="nav-coord-label">X</span><input type="number" id="nav-input-x" className="nav-number-input" placeholder="0" step="any" value={x} onChange={event => setX(event.target.value)} onKeyDown={handleKeyDown} /></div>
        <div className="nav-input-field"><span className="nav-coord-label">Y</span><input type="number" id="nav-input-y" className="nav-number-input" placeholder="20" step="any" value={y} onChange={event => setY(event.target.value)} onKeyDown={handleKeyDown} /></div>
        <div className="nav-input-field"><span className="nav-coord-label">Z</span><input type="number" id="nav-input-z" className="nav-number-input" placeholder="0" step="any" value={z} onChange={event => setZ(event.target.value)} onKeyDown={handleKeyDown} /></div>
      </div>
      <button
        type="button"
        id="nav-start-btn"
        className={`nav-action-btn ${navigating ? 'stop-btn' : 'start-btn'}`}
        onClick={() => navigating ? navigation?.stopNavigation?.('cancelled') : start()}
      >{navigating ? 'STOP' : 'START'}</button>
    </div>
  );
}

export function MinimapCanvas() {
  const minimap = useSpaceUi(state => state.minimap);
  const attachCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    minimap?.attachCanvas?.(canvas);
  }, [minimap]);
  return (
    <div id="minimap-container" className="minimap-container">
      <canvas ref={attachCanvas} className="minimap-canvas" aria-label="World minimap" />
    </div>
  );
}
