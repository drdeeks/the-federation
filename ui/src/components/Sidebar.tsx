import { SidebarProps, Agent } from './types';

export function Sidebar({ fleet, selectedAgent, onSelect }: SidebarProps) {
  const getAvatarSrc = (avatar: Agent['avatar']) => {
    if (!avatar) return null;
    if (avatar.dataUrl) return avatar.dataUrl;
    if (avatar.data && avatar.type === 'svg') {
      return `data:image/svg+xml;base64,${btoa(avatar.data)}`;
    }
    return null;
  };

  const formatStatus = (status: string) => {
    const normalized = status.toLowerCase();
    if (['online', 'active', 'idle', 'blocked', 'offline'].includes(normalized)) {
      return normalized;
    }
    return 'offline';
  };

  return (
    <aside className="sidebar" role="navigation" aria-label="Agent fleet">
      <div className="sidebar-header">Fleet</div>
      <div className="sidebar-content">
        <div className="fleet-list" role="list">
          {fleet.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 16px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <p>No agents in fleet</p>
              <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>Register an agent via Watchtower</p>
            </div>
          ) : (
            fleet.map((agent) => (
              <button
                key={agent.agentId}
                className={`fleet-card ${selectedAgent?.agentId === agent.agentId ? 'active' : ''}`}
                onClick={() => onSelect(agent)}
                aria-pressed={selectedAgent?.agentId === agent.agentId}
                aria-label={`Select agent ${agent.name}`}
              >
                <div className="fleet-avatar">
                  {getAvatarSrc(agent.avatar) ? (
                    <img src={getAvatarSrc(agent.avatar)!} alt="" />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--accent-primary)' }}>
                      {agent.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="fleet-info">
                  <div className="fleet-name">{agent.name}</div>
                  <div className="fleet-meta">
                    <span className={`status-badge ${getStatusBadgeClass(agent.status)}`}>
                      {formatStatus(agent.status)}
                    </span>
                    <span>•</span>
                    <span>{agent.role}</span>
                    {agent.roomId && (
                      <>
                        <span>•</span>
                        <span>{agent.roomId}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

function getStatusBadgeClass(status: string) {
  const normalized = status.toLowerCase();
  if (['online', 'active', 'idle', 'blocked', 'offline'].includes(normalized)) {
    return normalized;
  }
  return 'offline';
}