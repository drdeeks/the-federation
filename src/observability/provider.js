/**
 * Observability Provider — Watchtower mirror + local fallback
 *
 * Provides:
 * - Fleet health (Watchtower mirror via SDK/MCP)
 * - Agent observability (Watchtower mirror)
 * - Events stream (Watchtower mirror + local fallback)
 * - Local event store (immutable append-only log)
 * - Local heartbeat/loop tracker
 * - Alert webhook receiver (verifies X-Watchtower-Signature HMAC)
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';

class ObservabilityProvider extends EventEmitter {
  constructor() {
    super();
    this.watchtowerClient = null;
    this.localEventStore = [];
    this.localHeartbeats = new Map();
    this.maxLocalEvents = 10000;
    this.webhookSecret = null; // Set per webhook config
  }

  setWatchtowerClient(client) {
    this.watchtowerClient = client;
  }

  setWebhookSecret(secret) {
    this.webhookSecret = secret;
  }

  // --- Watchtower mirror (read-only) ---
  async getFleetHealth() {
    if (this.watchtowerClient) {
      try {
        // Use SDK or MCP to get fleet health
        // For now, return mock structure
        return {
          online: 0,
          active: 0,
          idle: 0,
          blocked: 0,
          offline: 0,
          source: 'watchtower',
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        console.warn('[observability] Watchtower fetch failed, using local fallback:', err.message);
      }
    }
    // Local fallback
    return {
      online: this.localHeartbeats.size,
      active: 0,
      idle: 0,
      blocked: 0,
      offline: 0,
      source: 'local-fallback',
      timestamp: new Date().toISOString(),
    };
  }

  async getAgentObservability(agentId) {
    if (this.watchtowerClient) {
      try {
        // Use SDK/MCP to get agent observability
        return {
          agentId,
          status: 'unknown',
          heartbeat: null,
          loopState: null,
          events: [],
          source: 'watchtower',
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        console.warn('[observability] Watchtower fetch failed, using local fallback:', err.message);
      }
    }
    // Local fallback
    return {
      agentId,
      status: this.localHeartbeats.has(agentId) ? 'online' : 'offline',
      heartbeat: this.localHeartbeats.get(agentId) || null,
      loopState: null,
      events: this.localEventStore.filter(e => e.agentId === agentId).slice(-50),
      source: 'local-fallback',
      timestamp: new Date().toISOString(),
    };
  }

  async getEvents(limit = 100) {
    if (this.watchtowerClient) {
      try {
        // Fetch from Watchtower
        return { events: [], source: 'watchtower', timestamp: new Date().toISOString() };
      } catch (err) {
        console.warn('[observability] Watchtower events fetch failed:', err.message);
      }
    }
    return { events: this.localEventStore.slice(-limit), source: 'local-fallback', timestamp: new Date().toISOString() };
  }

  async getLocalEvents(limit = 100) {
    return { events: this.localEventStore.slice(-limit), source: 'local', timestamp: new Date().toISOString() };
  }

  async getLocalHeartbeats() {
    const heartbeats = {};
    for (const [agentId, hb] of this.localHeartbeats) {
      heartbeats[agentId] = hb;
    }
    return { heartbeats, source: 'local', timestamp: new Date().toISOString() };
  }

  // --- Local fallback recording ---
  recordEvent(event) {
    const record = {
      eventId: event.eventId || crypto.randomUUID(),
      agentId: event.agentId,
      source: event.source || 'local',
      actionType: event.actionType,
      status: event.status,
      observedAt: event.observedAt || new Date().toISOString(),
      provenanceRef: event.provenanceRef,
      payload: event.payload,
    };

    this.localEventStore.push(record);
    if (this.localEventStore.length > this.maxLocalEvents) {
      this.localEventStore.shift();
    }

    this.emit('event', record);
    return record;
  }

  recordHeartbeat(agentId, data) {
    this.localHeartbeats.set(agentId, {
      agentId,
      lastHeartbeat: new Date().toISOString(),
      ...data,
    });
    this.emit('heartbeat', { agentId, data });
  }

  // --- Alert webhook receiver ---
  verifyWebhookSignature(req) {
    if (!this.webhookSecret) return false;
    const timestamp = req.headers['x-watchtower-timestamp'];
    const signature = req.headers['x-watchtower-signature'];
    if (!timestamp || !signature) return false;

    const payload = JSON.stringify(req.body);
    const expected = 'sha256=' + crypto
      .createHmac('sha256', this.webhookSecret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  handleAlertWebhook(req, res) {
    if (!this.verifyWebhookSignature(req)) {
      return res.status(401).json({ status: 'error', errors: [{ message: 'Invalid signature' }] });
    }

    const alert = req.body;
    this.recordEvent({
      agentId: alert.agentId,
      source: 'watchtower-alert',
      actionType: 'alert',
      status: alert.severity,
      observedAt: new Date().toISOString(),
      provenanceRef: alert.deliveryId,
      payload: alert,
    });

    res.json({ status: 'success', data: { received: true } });
  }
}

export const observabilityProvider = new ObservabilityProvider();
export default ObservabilityProvider;