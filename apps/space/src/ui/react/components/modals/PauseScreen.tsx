import React from 'react';
import { useSpaceStore } from '../../store/useSpaceStore.ts';

export const PauseScreen: React.FC = () => {
  const hasStarted = useSpaceStore((s) => s.hasStarted);
  const setGameStarted = useSpaceStore((s) => s.setGameStarted);

  if (hasStarted) return null;

  return (
    <div className="pause-screen" id="pause-screen">
      <div className="pause-dialog">
        <h1 className="pause-title">ENTROPYDROP · SPACE</h1>
        <p className="pause-subtitle">
          Programmable Voxel Physics Sandbox on a Torus Planet
        </p>

        <button
          type="button"
          id="btn-play"
          className="pause-play-btn"
          onClick={() => setGameStarted(true)}
        >
          CLICK TO PLAY
        </button>

        <div className="pause-controls-grid">
          <div className="pause-control-item"><kbd className="key-badge">WASD</kbd> Walk / Fly</div>
          <div className="pause-control-item"><kbd className="key-badge">Space</kbd> Jump / Up</div>
          <div className="pause-control-item"><kbd className="key-badge">Shift</kbd> Crouch / Down</div>
          <div className="pause-control-item"><kbd className="key-badge">1~6</kbd> Select Tool</div>
          <div className="pause-control-item"><kbd className="key-badge">E</kbd> Backpack</div>
          <div className="pause-control-item"><kbd className="key-badge">R</kbd> Smart Copy</div>
          <div className="pause-control-item"><kbd className="key-badge">G</kbd> Assemble Entity</div>
          <div className="pause-control-item"><kbd className="key-badge">C</kbd> Code Terminal</div>
        </div>
      </div>
    </div>
  );
};
