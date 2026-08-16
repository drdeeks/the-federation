/**
 * Control router — CharacterKit configuration per agent (via adapter)
 */
import express from 'express';

const router = express.Router();

let adapterClient = null;

export function setAdapterClient(client) {
  adapterClient = client;
}

router.get('/:agentId', async (req, res) => {
  try {
    if (!adapterClient) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Adapter client not initialized' }] });
    }

    // Get CK config for agent
    const config = await adapterClient.getAgentConfig(req.params.agentId);
    res.json({ status: 'success', data: config });
  } catch (err) {
    console.error('[control] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to fetch control config' }] });
  }
});

router.patch('/:agentId', async (req, res) => {
  try {
    if (!adapterClient) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Adapter client not initialized' }] });
    }

    const allowedKeys = ['character', 'habits', 'ack', 'commitments', 'commandPolicy', 'escalation'];
    const updates = {};
    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    await adapterClient.updateAgentConfig(req.params.agentId, updates);
    res.json({ status: 'success', data: { updated: true } });
  } catch (err) {
    console.error('[control] error:', err);
    res.status(400).json({ status: 'error', errors: [{ message: err.message }] });
  }
});

router.post('/:agentId/steer', async (req, res) => {
  try {
    if (!adapterClient) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Adapter client not initialized' }] });
    }

    await adapterClient.steerAgent(req.params.agentId, req.body.instruction);
    res.json({ status: 'success', data: { steered: true } });
  } catch (err) {
    console.error('[control] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Steer failed' }] });
  }
});

router.post('/:agentId/pause', async (req, res) => {
  try {
    if (!adapterClient) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Adapter client not initialized' }] });
    }

    await adapterClient.pauseAgent(req.params.agentId);
    res.json({ status: 'success', data: { paused: true } });
  } catch (err) {
    console.error('[control] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Pause failed' }] });
  }
});

router.post('/:agentId/resume', async (req, res) => {
  try {
    if (!adapterClient) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Adapter client not initialized' }] });
    }

    await adapterClient.resumeAgent(req.params.agentId);
    res.json({ status: 'success', data: { resumed: true } });
  } catch (err) {
    console.error('[control] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Resume failed' }] });
  }
});

router.post('/:agentId/kill', async (req, res) => {
  try {
    if (!adapterClient) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Adapter client not initialized' }] });
    }

    await adapterClient.killAgent(req.params.agentId);
    res.json({ status: 'success', data: { killed: true } });
  } catch (err) {
    console.error('[control] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Kill failed' }] });
  }
});

export default router;