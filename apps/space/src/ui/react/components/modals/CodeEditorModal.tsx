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
    <div id="code-editor-modal" className="custom-modal show" onClick={closeAllModals}>
      <div className="modal-content code-editor-container" onClick={(e) => e.stopPropagation()}>
        {/* Editor Header */}
        <div className="editor-header">
          <div className="editor-title-group">
            <div className="editor-title">Entity Editor</div>
            <div id="editor-entity-id" className="editor-tag" title="Click to copy Entity ID">
              ID: {contraption ? `ent_${contraption.id}` : 'ent_pending'}
            </div>
            <div id="editor-status-badge" className="status-badge running">RUNNING</div>
            <div id="editor-exec-time" className="exec-time">0.05 ms</div>
          </div>

          <div className="editor-actions">
            <button id="run-script-btn" className="editor-btn run-btn" onClick={handleRunScript}>Apply Code</button>
            <button id="close-code-btn" className="icon-btn" style={{ width: '28px', height: '28px', fontSize: '13px' }} title="Close terminal (ESC)" onClick={closeAllModals}>✕</button>
          </div>
        </div>

        {/* Editor Main Layout (3-Column: Hierarchy & Inspector | Code & Tabs | 3D View & Telemetry) */}
        <div className="editor-body">
          {/* Left Sidebar: Component Hierarchy Tree & Property Inspector */}
          <div className="hierarchy-sidebar">
            <div className="sidebar-section-title">
              <span>ENTITY COMPONENT TREE</span>
            </div>
            <div id="component-tree-panel" className="component-tree-panel">
              <div id="component-tree-list" className="component-tree-list">
                {nodeIds.map((id) => (
                  <div
                    key={id}
                    className={`tree-node ${selectedNodeId === id ? 'selected' : ''}`}
                    onClick={() => setSelectedNodeId(id)}
                  >
                    <span className="node-icon">⬡</span>
                    <span className="node-name">{id}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="sidebar-section-title" style={{ marginTop: '8px' }}>
              <span>COMPONENT INSPECTOR</span>
              <span id="component-inspector-id" className="component-inspector-badge">{selectedNodeId}</span>
            </div>
            <div id="component-inspector-panel" className="component-inspector-panel">
              <div className="inspector-field">
                <label className="inspector-label">ID</label>
                <div className="inspector-input-row">
                  <input id="prop-node-name" className="inspector-input" type="text" value={selectedNodeId} readOnly />
                </div>
              </div>
              <div className="inspector-field has-tooltip">
                <label className="inspector-label">Type ⓘ</label>
                <span id="prop-node-kind" className="inspector-val">{selectedNodeId === 'root' ? 'root body' : 'child'}</span>
              </div>
            </div>
          </div>

          {/* Center: Code Editor with Component Tab Navigation */}
          <div className="code-area-wrapper">
            <div className="code-tab-bar" id="code-tab-bar">
              {nodeIds.map((id) => (
                <div
                  key={id}
                  className={`code-tab ${selectedNodeId === id ? 'active' : ''}`}
                  onClick={() => setSelectedNodeId(id)}
                >
                  <span className="tab-type-tag">{id === 'root' ? 'R' : 'C'}</span>
                  <span className="tab-name">{id}</span>
                </div>
              ))}
            </div>
            <div className="code-editor-main">
              <textarea
                id="script-textarea"
                className="code-textarea"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="// Write your controller code here..."
                onFocus={(e) => e.stopPropagation()}
              />
            </div>
            <div className="code-footer-hint" id="code-footer-hint">
              <span id="code-target-hint">Editing: {selectedNodeId} ({selectedNodeId === 'root' ? 'body' : 'child'})</span>
              <span id="code-api-hint" className="code-api-hint">API: self · ctx</span>
            </div>
          </div>

          {/* Far right: AI Assistant Chat column */}
          <div className="agent-column">
            <div className="telemetry-section-title agent-chat-title">
              <span>AI ASSISTANT</span>
            </div>

            <div id="agent-chat-box" className="agent-chat-box">
              <div className="agent-chat-msg agent-msg-system">
                Tip: describe a behavior in plain language (e.g. &quot;hover 5 meters above ground&quot;).
              </div>
              {logs.map((log, i) => (
                <div key={i} className="agent-chat-msg agent-msg-user">{log}</div>
              ))}
            </div>
            <div className="agent-chat-input-row">
              <input
                id="agent-chat-input"
                className="agent-chat-input"
                type="text"
                value={agentPrompt}
                onChange={(e) => setAgentPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAgentGenerate()}
                placeholder="e.g. rotate blades at 60 RPM on W key..."
                onFocus={(e) => e.stopPropagation()}
              />
              <button
                id="agent-chat-send-btn"
                className="agent-send-btn"
                onClick={handleAgentGenerate}
                disabled={agentRunning}
              >
                {agentRunning ? '...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
