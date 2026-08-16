import { useState } from 'react';
import { AgentDrawerProps } from './types';

type TabId = 'terminal' | 'memory' | 'tasks' | 'control' | 'observability';
type MemoryTier = 'daily' | 'weekly' | 'long-term' | 'identity';

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabConfig[] = [
  {
    id: 'terminal',
    label: 'Terminal',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
  },
  {
    id: 'memory',
    label: 'Memory',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <line x1="15" y1="2" x2="15" y2="22" />
      </svg>
    ),
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <line x1="9" y1="11" x2="15" y2="11" />
        <line x1="9" y1="7" x2="15" y2="7" />
        <line x1="9" y1="15" x2="15" y2="15" />
      </svg>
    ),
  },
  {
    id: 'control',
    label: 'Control',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="6" x2="12" y2="12" />
        <line x1="12" y1="12" x2="16" y2="14" />
      </svg>
    ),
  },
  {
    id: 'observability',
    label: 'Observability',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
];

export function AgentDrawer({ agent, onClose }: AgentDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('terminal');
  const [terminalOutput, setTerminalOutput] = useState<string[]>([
    '[system] Connected to agent terminal',
    '[system] Type commands to interact with the agent',
    '$ ',
  ]);
  const [terminalInput, setTerminalInput] = useState('');
  const [activeMemoryTier, setActiveMemoryTier] = useState<MemoryTier>('daily');

  const handleSendCommand = () => {
    if (!terminalInput.trim()) return;
    const command = terminalInput.trim();
    setTerminalOutput((prev) => [...prev, `$ ${command}`, '[agent] Command received', '$ ']);
    setTerminalInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendCommand();
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'terminal':
        return (
          <div className="terminal-tab">
            <div className="terminal-output" role="log" aria-live="polite">
              {terminalOutput.map((line, idx) => (
                <div key={idx} className="terminal-line">
                  {line.startsWith('[system]') && <span className="terminal-system">{line}</span>}
                  {line.startsWith('[agent]') && <span className="terminal-agent">{line}</span>}
                  {line.startsWith('$ ') && <span className="terminal-prompt">{line}</span>}
                  {!line.startsWith('[system]') && !line.startsWith('[agent]') && !line.startsWith('$ ') && <span>{line}</span>}
                </div>
              ))}
            </div>
            <div className="terminal-input-wrapper">
              <span className="terminal-prompt-prefix">$</span>
              <input
                type="text"
                className="terminal-input"
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter command..."
                autoFocus
              />
            </div>
          </div>
        );
      case 'memory':
        return (
          <div className="memory-tab">
            <div className="memory-tabs">
              {(['daily', 'weekly', 'long-term', 'identity'] as MemoryTier[]).map((tier) => (
                <button
                  key={tier}
                  className={`memory-tier-tab ${activeMemoryTier === tier ? 'active' : ''}`}
                  onClick={() => setActiveMemoryTier(tier)}
                >
                  {tier.charAt(0).toUpperCase() + tier.slice(1)}
                </button>
              ))}
            </div>
            <div className="memory-content">
              <p className="memory-empty">Memory inspection for {agent.name} — {activeMemoryTier} tier</p>
              <p className="memory-hint">Memory records will appear here when connected to the memory substrate.</p>
            </div>
          </div>
        );
      case 'tasks':
        return (
          <div className="tasks-tab">
            <div className="tasks-header">
              <h3>Task Queue</h3>
              <button className="btn btn-primary" disabled>Create Task</button>
            </div>
            <div className="tasks-list">
              <p className="tasks-empty">No tasks assigned to {agent.name}</p>
              <p className="tasks-hint">Tasks will appear here when the task manager is connected.</p>
            </div>
          </div>
        );
      case 'control':
        return (
          <div className="control-tab">
            <div className="control-section">
              <h4>Steering</h4>
              <div className="steer-input-wrapper">
                <input
                  type="text"
                  className="steer-input"
                  placeholder="Enter steering directive..."
                  disabled
                />
                <button className="btn btn-primary" disabled>Send</button>
              </div>
            </div>
            <div className="control-section">
              <h4>Lifecycle Controls</h4>
              <div className="control-buttons">
                <button className="btn btn-warning" disabled>Pause</button>
                <button className="btn btn-success" disabled>Resume</button>
                <button className="btn btn-danger" disabled>Kill</button>
              </div>
            </div>
            <div className="control-section">
              <h4>Policy Status</h4>
              <p className="control-policy">Policy enforcement via CharacterKit (local, fail-closed)</p>
              <p className="control-policy-hint">Watchtower leases/validation gates are opt-in (MCP)</p>
            </div>
          </div>
        );
      case 'observability':
        return (
          <div className="observability-tab">
            <div className="observability-sections">
              <div className="obs-section">
                <h4>Immutable Action Log</h4>
                <p className="obs-empty">No actions recorded</p>
              </div>
              <div className="obs-section">
                <h4>Heartbeat / Loop State</h4>
                <p className="obs-empty">No heartbeat data</p>
              </div>
              <div className="obs-section">
                <h4>Local Fallback</h4>
                <p className="obs-hint">Local event store activates automatically on Watchtower outage</p>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <aside className="drawer" role="dialog" aria-label={`${agent.name} management`}>
      <div className="drawer-header">
        <div className="drawer-title">
          <div className="drawer-avatar">
            {agent.avatar?.dataUrl ? (
              <img src={agent.avatar.dataUrl} alt="" />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--accent-primary)' }}>
                {agent.name.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <span>{agent.name}</span>
        </div>
        <button className="drawer-close" onClick={onClose} aria-label="Close drawer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <nav className="drawer-tabs" role="tablist" aria-label="Agent management tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            className={`drawer-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {tab.icon}
              {tab.label}
            </span>
          </button>
        ))}
      </nav>
      <div className="drawer-content" role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {renderTabContent()}
      </div>
    </aside>
  );
}