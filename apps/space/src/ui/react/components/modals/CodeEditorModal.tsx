import React, { useState, useEffect } from 'react';
import { useSpaceStore } from '../../store/useSpaceStore.ts';

export const CodeEditorModal: React.FC = () => {
  const activeModal = useSpaceStore((s) => s.activeModal);
  const closeAllModals = useSpaceStore((s) => s.closeAllModals);
  const editingContraption = useSpaceStore((s) => s.editingContraption);
  const controller = useSpaceStore((s) => s.controller);
  const showToast = useSpaceStore((s) => s.showToast);

  const [selectedNodeId, setSelectedNodeId] = useState<string>('root');
  const [code, setCode] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [agentPrompt, setAgentPrompt] = useState<string>('');
  const [agentRunning, setAgentRunning] = useState(false);

  const contraption = editingContraption || controller?.selectedSubtree?.contraption;

  useEffect(() => {
    if (contraption) {
      const script = contraption.scripts?.find((s: any) => (s.entityId || 'root') === selectedNodeId);
      setCode(script?.code || '// Write your component script here\nfunction onTick(ctx) {\n  \n}\n');
    }
  }, [contraption, selectedNodeId, activeModal]);

  if (activeModal !== 'code') return null;

  const handleRunScript = () => {
    if (!contraption) {
      showToast('No entity selected to run script on');
      return;
    }
    contraption.updateScript?.(selectedNodeId, code);
    contraption.startScripts?.();
    showToast(`Script running on [${selectedNodeId}]`);
  };

  const handleStopScript = () => {
    if (contraption) {
      contraption.stopScripts?.();
      showToast(`Scripts stopped`);
    }
  };

  const handleAgentGenerate = async () => {
    if (!agentPrompt.trim()) return;
    setAgentRunning(true);
    setLogs((l) => [...l, `[Agent] Generating script for "${agentPrompt}"...`]);

    try {
      if (controller?.agentChat) {
        const generated = await controller.agentChat.generateCodeForContraption(contraption, selectedNodeId, agentPrompt);
        if (generated) {
          setCode(generated);
          setLogs((l) => [...l, `[Agent] Script generated successfully!`]);
          showToast('Agent generated script!');
        }
      } else {
        setLogs((l) => [...l, `[Agent] Agent chat service ready.`]);
      }
    } catch (err: any) {
      setLogs((l) => [...l, `[Agent Error] ${err.message}`]);
    } finally {
      setAgentRunning(false);
    }
  };

  const nodeIds = contraption ? Array.from(contraption.entityNodes?.keys() || ['root']) as string[] : ['root'];

  return (
    <div className="modal-backdrop show" id="code-editor-modal" onClick={closeAllModals}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', width: '92vw', height: '82vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2>ENTITY CODE TERMINAL {contraption ? `#${contraption.id}` : ''}</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" className="backpack-section-btn" style={{ background: '#15803d' }} onClick={handleRunScript}>
              ▶ Run
            </button>
            <button type="button" className="backpack-section-btn danger" onClick={handleStopScript}>
              ■ Stop
            </button>
            <button type="button" className="modal-close" onClick={closeAllModals}>✕</button>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, gap: '12px', minHeight: 0, marginTop: '8px' }}>
          {/* Node tree hierarchy */}
          <div style={{ width: '180px', borderRight: '1px solid var(--border-subtle)', paddingRight: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-light)' }}>COMPONENTS</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto', flex: 1 }}>
              {nodeIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`backpack-section-btn ${selectedNodeId === id ? 'active' : ''}`}
                  style={{ textAlign: 'left', padding: '4px 8px', width: '100%' }}
                  onClick={() => setSelectedNodeId(id)}
                >
                  [{id}]
                </button>
              ))}
            </div>
          </div>

          {/* Main Editor + Console */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, gap: '8px' }}>
            <textarea
              className="code-editor-textarea"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={{
                flex: 1,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '12px',
                background: '#0d0e12',
                color: '#e2e8f0',
                border: '1px solid var(--border-subtle)',
                padding: '10px',
                outline: 'none',
                resize: 'none',
                lineHeight: 1.5
              }}
              spellCheck={false}
              onFocus={(e) => e.stopPropagation()}
            />

            {/* AI Agent Chat Prompt */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={agentPrompt}
                onChange={(e) => setAgentPrompt(e.target.value)}
                placeholder="Ask AI to write script (e.g. 'Rotate blades at 60 RPM on W key')..."
                style={{ flex: 1, padding: '6px 10px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: '#fff', fontSize: '12px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAgentGenerate();
                }}
              />
              <button
                type="button"
                className="backpack-section-btn"
                onClick={handleAgentGenerate}
                disabled={agentRunning}
              >
                {agentRunning ? 'Generating...' : '⚡ Generate'}
              </button>
            </div>

            {/* Log Output Console */}
            {logs.length > 0 && (
              <div style={{ height: '70px', background: '#090a0d', border: '1px solid #222', padding: '6px', fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', overflowY: 'auto' }}>
                {logs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
