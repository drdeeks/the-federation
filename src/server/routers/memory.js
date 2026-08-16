/**
 * Memory router — tiered memory management (local shared/memory engine)
 */
import express from 'express';
import { MemoryStore } from '../../../shared/memory/store/memory-store.js';

const router = express.Router();

let memoryStore = null;

export function setMemoryStore(store) {
  memoryStore = store;
}

router.get('/:agentId', async (req, res) => {
  try {
    if (!memoryStore) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Memory store not initialized' }] });
    }

    // In a real impl, filter by agentId
    const memories = memoryStore.getAll?.() || [];
    res.json({ status: 'success', data: memories });
  } catch (err) {
    console.error('[memory] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to fetch memory' }] });
  }
});

router.post('/:agentId', async (req, res) => {
  try {
    if (!memoryStore) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Memory store not initialized' }] });
    }

    const { cid } = memoryStore.add({
      content: req.body.content,
      tags: req.body.tags || [],
      type: req.body.type || 'note',
      agentId: req.params.agentId,
    });

    res.status(201).json({ status: 'success', data: { cid } });
  } catch (err) {
    console.error('[memory] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to create memory' }] });
  }
});

router.get('/:agentId/search', async (req, res) => {
  try {
    if (!memoryStore) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Memory store not initialized' }] });
    }

    const query = req.query.q || '';
    // In a real impl, use RecallEngine
    const results = memoryStore.search?.(query) || [];
    res.json({ status: 'success', data: results });
  } catch (err) {
    console.error('[memory] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Search failed' }] });
  }
});

router.delete('/:agentId/:cid', async (req, res) => {
  try {
    if (!memoryStore) {
      return res.status(503).json({ status: 'error', errors: [{ message: 'Memory store not initialized' }] });
    }

    memoryStore.remove(req.params.cid);
    res.json({ status: 'success', data: { removed: true } });
  } catch (err) {
    console.error('[memory] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to delete memory' }] });
  }
});

export default router;