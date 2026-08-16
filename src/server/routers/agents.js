/**
 * Agents router — individual agent details and configuration (Watchtower mirror)
 */
import express from 'express';

const router = express.Router();

let agentRegistry = null;

export function setRegistry(reg) {
  agentRegistry = reg;
}

router.get('/:agentId', async (req, res) => {
  try {
    if (!agentRegistry) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Registry not initialized' }] });
    }

    const agent = agentRegistry.getAgent(req.params.agentId);
    if (!agent) {
      return res.status(404).json({ status: 'error', errors: [{ message: 'Agent not found' }] });
    }

    res.json({ status: 'success', data: agent });
  } catch (err) {
    console.error('[agents] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to fetch agent' }] });
  }
});

router.patch('/:agentId', async (req, res) => {
  try {
    if (!agentRegistry) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Registry not initialized' }] });
    }

    const allowedUpdates = ['name', 'role', 'metadata', 'capabilities'];
    const updates = {};
    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const agent = await agentRegistry.updateAgent(req.params.agentId, updates);
    res.json({ status: 'success', data: agent });
  } catch (err) {
    console.error('[agents] error:', err);
    res.status(400).json({ status: 'error', errors: [{ message: err.message }] });
  }
});

router.delete('/:agentId', async (req, res) => {
  try {
    if (!agentRegistry) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Registry not initialized' }] });
    }

    await agentRegistry.removeAgent(req.params.agentId);
    res.json({ status: 'success', data: { removed: true } });
  } catch (err) {
    console.error('[agents] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to remove agent' }] });
  }
});

export default router;