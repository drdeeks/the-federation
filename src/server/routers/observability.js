/**
 * Observability router — Watchtower mirror + local fallback observability
 */
import express from 'express';

const router = express.Router();

let observabilityProvider = null;

export function setProvider(provider) {
  observabilityProvider = provider;
}

router.get('/fleet', async (req, res) => {
  try {
    if (!observabilityProvider) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Observability provider not initialized' }] });
    }

    const data = await observabilityProvider.getFleetHealth();
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[observability] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to fetch fleet health' }] });
  }
});

router.get('/agent/:agentId', async (req, res) => {
  try {
    if (!observabilityProvider) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Observability provider not initialized' }] });
    }

    const data = await observabilityProvider.getAgentObservability(req.params.agentId);
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[observability] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to fetch agent observability' }] });
  }
});

router.get('/events', async (req, res) => {
  try {
    if (!observabilityProvider) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Observability provider not initialized' }] });
    }

    const limit = parseInt(req.query.limit) || 100;
    const data = await observabilityProvider.getEvents(limit);
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[observability] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to fetch events' }] });
  }
});

router.get('/local/events', async (req, res) => {
  try {
    if (!observabilityProvider) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Observability provider not initialized' }] });
    }

    const limit = parseInt(req.query.limit) || 100;
    const data = await observabilityProvider.getLocalEvents(limit);
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[observability] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to fetch local events' }] });
  }
});

router.get('/local/heartbeats', async (req, res) => {
  try {
    if (!observabilityProvider) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Observability provider not initialized' }] });
    }

    const data = await observabilityProvider.getLocalHeartbeats();
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[observability] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to fetch local heartbeats' }] });
  }
});

export default router;