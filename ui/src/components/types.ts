export interface Agent {
  agentId: string;
  name: string;
  role: string;
  status: string;
  health: string;
  roomId: string | null;
  avatar: {
    dataUrl?: string;
    data?: string;
    type?: string;
    width?: number;
    height?: number;
  } | null;
  registeredAt: number;
  lastSeen: number;
  federationRegistered: boolean;
}

export interface HeaderProps {
  connected: boolean;
}

export interface SidebarProps {
  fleet: Agent[];
  selectedAgent: Agent | null;
  onSelect: (agent: Agent) => void;
}

export interface MainContentProps {
  selectedAgent: Agent | null;
}

export interface AgentDrawerProps {
  agent: Agent;
  onClose: () => void;
}

export interface OverlayProps {
  onClick: () => void;
}