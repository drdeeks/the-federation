/**
 * Adapter Client — Thin wrapper over adapter/dist public API
 *
 * Provides fixture fallback for local dev (no live Federation/CharacterKit).
 * In production, consumes the compiled adapter bridge.
 */

class AdapterClient {
  constructor(options = {}) {
    this.adapter = null;
    this.fixtureMode = options.fixtureMode !== false;
    this.ckSocketPath = options.ckSocketPath || process.env.CK_SOCKET_PATH || '/tmp/character-kit.sock';
    this.watchtowerUrl = options.watchtowerUrl || process.env.FEDERATION_API_URL || 'http://localhost:8787';
  }

  async init() {
    if (!this.fixtureMode) {
      try {
        // Dynamic import of compiled adapter
        const adapterModule = await import('@the-federation/watchtower-adapter');
        this.adapter = adapterModule.createAdapter({
          characterKit: { socketPath: this.ckSocketPath },
          watchtower: { url: this.watchtowerUrl },
        });
        await this.adapter.start();
        console.log('[adapter-client] Connected to adapter');
      } catch (err) {
        console.warn('[adapter-client] Failed to load adapter, falling back to fixture mode:', err.message);
        this.fixtureMode = true;
      }
    }
    if (this.fixtureMode) {
      console.log('[adapter-client] Running in fixture mode');
    }
  }

  // --- CharacterKit config ---
  async getAgentConfig(agentId) {
    if (this.fixtureMode) {
      return this.fixtureAgentConfig(agentId);
    }
    return this.adapter.getAgentConfig(agentId);
  }

  async updateAgentConfig(agentId, updates) {
    if (this.fixtureMode) {
      console.log('[fixture] updateAgentConfig:', agentId, updates);
      return { updated: true };
    }
    return this.adapter.updateAgentConfig(agentId, updates);
  }

  async steerAgent(agentId, instruction) {
    if (this.fixtureMode) {
      console.log('[fixture] steerAgent:', agentId, instruction);
      return { steered: true };
    }
    return this.adapter.steerAgent(agentId, instruction);
  }

  async pauseAgent(agentId) {
    if (this.fixtureMode) {
      console.log('[fixture] pauseAgent:', agentId);
      return { paused: true };
    }
    return this.adapter.pauseAgent(agentId);
  }

  async resumeAgent(agentId) {
    if (this.fixtureMode) {
      console.log('[fixture] resumeAgent:', agentId);
      return { resumed: true };
    }
    return this.adapter.resumeAgent(agentId);
  }

  async killAgent(agentId) {
    if (this.fixtureMode) {
      console.log('[fixture] killAgent:', agentId);
      return { killed: true };
    }
    return this.adapter.killAgent(agentId);
  }

  // --- Fixture data ---
  fixtureAgentConfig(agentId) {
    return {
      agentId,
      character: 'You are a helpful Federation agent.',
      habits: [
        { id: 'habit-1', name: 'Daily Sync', frequency: 'daily', prompt: 'Sync state with Federation' },
        { id: 'habit-2', name: 'Memory Consolidation', frequency: 'hourly', prompt: 'Consolidate recent memories' },
      ],
      ack: {
        requiredTools: ['filesystem.write', 'network.request'],
        frequency: 'per-invocation',
        templates: { default: 'Acknowledged: {action}' },
      },
      commitments: {
        rules: [{ id: 'commit-1', description: 'Complete assigned tasks', frequency: 'per-task' }],
      },
      commandPolicy: {
        allowed: ['filesystem.read', 'network.get'],
        prohibited: ['filesystem.delete', 'system.exec'],
        requiresAck: ['filesystem.write', 'network.post'],
        requiresCommitment: ['system.exec'],
      },
      escalation: {
        reviewInterval: 'daily',
        escalationInterval: 'hourly',
        humanApprovalThreshold: 'high-risk',
      },
      updatedAt: new Date().toISOString(),
    };
  }

  async shutdown() {
    if (this.adapter && !this.fixtureMode) {
      await this.adapter.stop();
    }
  }
}

export const adapterClient = new AdapterClient();
export default AdapterClient;