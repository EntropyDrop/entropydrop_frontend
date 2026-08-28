import React from 'react';
import { useSpaceStore } from '../../store/useSpaceStore.ts';

export const ToastContainer: React.FC = () => {
  const toasts = useSpaceStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" style={{ position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '6px', pointerEvents: 'none' }}>
      {toasts.map((t) => (
        <div key={t.id} className="hud-toast show" style={{ pointerEvents: 'auto' }}>
          {t.message}
        </div>
      ))}
    </div>
  );
};
