import { MainContentProps } from './types';

export function MainContent({ selectedAgent }: MainContentProps) {
  if (!selectedAgent) {
    return (
      <main className="main">
        <div className="main-content">
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <h2 style={{ marginBottom: '8px', fontSize: '1.5rem', color: 'var(--fg-primary)' }}>Select an Agent</h2>
            <p style={{ maxWidth: '400px' }}>Choose an agent from the fleet to view their terminal, memory, tasks, policy, and observability.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="main">
      <div className="main-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{selectedAgent.name}</h1>
            <p style={{ color: 'var(--fg-muted)', fontSize: '0.875rem', marginTop: '4px' }}>
              {selectedAgent.role} • {selectedAgent.agentId}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span className={`status-badge ${getStatusBadgeClass(selectedAgent.status)}`}>
              {selectedAgent.status}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <QuickStatsCard label="Status" value={selectedAgent.status} statusClass={getStatusBadgeClass(selectedAgent.status)} />
          <QuickStatsCard label="Health" value={selectedAgent.health} statusClass={getStatusBadgeClass(selectedAgent.health)} />
          <QuickStatsCard label="Room" value={selectedAgent.roomId || 'Unassigned'} />
          <QuickStatsCard label="Federation" value={selectedAgent.federationRegistered ? 'Registered' : 'Not Registered'} statusClass={selectedAgent.federationRegistered ? 'online' : 'offline'} />
        </div>

        <div style={{ marginTop: '24px', padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)' }}>
          <h3 style={{ marginBottom: '12px', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fg-muted)' }}>Agent Details</h3>
          <dl style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 16px', fontSize: '0.8125rem' }}>
            <dt style={{ color: 'var(--fg-muted)' }}>Agent ID</dt>
            <dd style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{selectedAgent.agentId}</dd>
            <dt style={{ color: 'var(--fg-muted)' }}>Role</dt>
            <dd>{selectedAgent.role}</dd>
            <dt style={{ color: 'var(--fg-muted)' }}>Registered</dt>
            <dd>{new Date(selectedAgent.registeredAt).toLocaleString()}</dd>
            <dt style={{ color: 'var(--fg-muted)' }}>Last Seen</dt>
            <dd>{new Date(selectedAgent.lastSeen).toLocaleString()}</dd>
            <dt style={{ color: 'var(--fg-muted)' }}>Federation</dt>
            <dd>{selectedAgent.federationRegistered ? 'Registered' : 'Not Registered'}</dd>
          </dl>
        </div>
      </div>
    </main>
  );
}

function QuickStatsCard({ label, value, statusClass }: { label: string; value: string; statusClass?: string }) {
  return (
    <div style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)' }}>
      <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fg-muted)', marginBottom: '4px' }}>{label}</p>
      <p style={{ fontSize: '1rem', fontWeight: 500 }}>
        {statusClass ? <span className={`status-badge ${statusClass}`}>{value}</span> : value}
      </p>
    </div>
  );
}

function getStatusBadgeClass(status: string) {
  const normalized = status.toLowerCase();
  if (['online', 'active', 'idle', 'blocked', 'offline'].includes(normalized)) {
    return normalized;
  }
  return 'offline';
}