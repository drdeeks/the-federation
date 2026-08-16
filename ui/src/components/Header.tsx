import { HeaderProps } from './types';

export function Header({ connected }: HeaderProps) {
  return (
    <header className="header" role="banner">
      <div className="header-brand">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2"/>
          <path d="M16 6V26M6 16H26" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="16" cy="16" r="6" fill="currentColor"/>
        </svg>
        <span>The Federation</span>
      </div>
      <div className="header-actions">
        <div className="status-indicator">
          <span className={`status-dot ${connected ? 'connected' : ''}`} aria-hidden="true"></span>
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>
    </header>
  );
}