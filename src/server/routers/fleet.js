/**
 * Fleet router — agent list mirrored from Federation Watchtower
 */
import express from 'express';
import { AgentRegistry } from '../../../layers/registry/agent-registry.js';

const router = express.Router();

let registry = null;

export function setRegistry(reg) {
  registry = reg;
}

router.get('/', async (req, res) => {
  try {
    if (!registry) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Registry not initialized' }] });
    }

    const agents = registry.getAllAgents().map(a => ({
      agentId: a.agentId,
      name: a.name,
      role: a.role,
      status: a.status,
      health: a.health,
      roomId: a.roomId,
      avatar: a.avatar,
      registeredAt: a.registeredAt,
      lastSeen: a.lastSeen,
      federationRegistered: a.federationRegistered,
    }));

    res.json({ status: 'success', data: agents });
  } catch (err) {
    console.error('[fleet] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to fetch fleet' }] });
  }
});

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    registry: registry ? 'initialized' : 'not-initialized',
    timestamp: new Date().toISOString(),
  });
});

export default router;