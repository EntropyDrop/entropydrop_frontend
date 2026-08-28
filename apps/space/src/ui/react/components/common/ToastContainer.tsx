import React from 'react';
import { useSpaceStore } from '../../store/useSpaceStore.ts';

export const ToastContainer: React.FC = () => {
  const toasts = useSpaceStore((s) => s.toasts);
  const latest = toasts[toasts.length - 1];

  return (
    <div id="toast" className={`toast ${latest ? 'show' : ''}`}>
      {latest?.message || ''}
    </div>
  );
};
