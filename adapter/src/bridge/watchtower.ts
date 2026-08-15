/**
 * Watchtower client — ONLY Watchtower-facing integration.
 *
 * Two client surfaces, both from @federation-watchtower/sdk (verified
 * against src/index.d.ts):
 *   - WatchtowerClient (legacy, producer-signed HMAC): emitEvent, heartbeat,
 *     requestLease, validateLease, submitValidationGate, authorizeAction,
 *     getCommands, acknowledgeCommand. Always constructed -- this is the
 *     only path for the four routes with no canonical bearer alternative
 *     (lease validate, tool authorize, validation gates, commands), which
 *     is Federation's own gap to close (MOD-002), not this adapter's.
 *   - FederationAgentClient (canonical fw_agent_* bearer): connect,
 *     heartbeat, disconnect, emit. Constructed ADDITIONALLY, only when
 *     config.watchtowerAgentToken is present (MOD-004) -- used for the
 *     routes it actually covers, legacy remains the path for everything
 *     else. No canonical token configured -> behaves exactly as before
 *     this file changed, zero regression.
 *
 * Contains NO habit policy, NO Character Kit daemon internals.
 *
 * Legacy signed ingestion (verified): HMAC-SHA256 over `${ts}.${body}`,
 * headers X-Watchtower-Signature: sha256=..., X-Watchtower-Timestamp,
 * X-Watchtower-Producer. The SDK handles signing internally.
 */

import { WatchtowerClient, FederationAgentClient, type OperationalEvent } from "@federation-watchtower/sdk";
import type { BridgeConfig, WatchtowerState } from "../contracts.js";

export interface WatchtowerClientHandle {
  connect(): Promise<void>;
  emit(event: OperationalEvent): Promise<void>;
  heartbeat(agentId: string, runId: string): Promise<void>;
  disconnect(): Promise<void>;
  state(): WatchtowerState;
  isConnected(): boolean;
}

/**
 * Build a Watchtower client from bridge config. Uses the verified SDK
 * surface, canonical FederationAgentClient layered on top of the legacy
 * WatchtowerClient when a canonical agent token is configured.
 *
 * `fetchImpl` is test-only injection (both SDK clients accept a `fetch`
 * override) -- production callers never pass it, defaulting to the SDK's
 * own `globalThis.fetch` fallback.
 */
export function createWatchtowerClient(config: BridgeConfig, fetchImpl?: typeof globalThis.fetch): WatchtowerClientHandle {
  const legacy = new WatchtowerClient({
    ingestionSecret: config.watchtowerIngestionSecret,
    producer: config.watchtowerProducer,
    gateway: config.watchtowerGateway,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });

  const canonical = config.watchtowerAgentToken
    ? new FederationAgentClient({
        agentToken: config.watchtowerAgentToken,
        projectId: config.projectId,
        agentId: config.agentId,
        gateway: config.watchtowerGateway,
        ...(fetchImpl ? { fetch: fetchImpl } : {}),
      })
    : null;

  const state: WatchtowerState = {};
  let connected = true;

  return {
    async connect(): Promise<void> {
      // Legacy has no connect concept (one-off signed calls, no session) --
      // only the canonical client has a real registration/connect step.
      if (canonical) await canonical.connect();
      connected = true;
    },
    async emit(event: OperationalEvent): Promise<void> {
      if (canonical) {
        // AgentLifecycleEvent has no projectId/agentId -- both are already
        // bound at FederationAgentClient construction time above.
        const { projectId: _projectId, agentId: _agentId, ...lifecycleEvent } = event;
        await canonical.emit(lifecycleEvent);
      } else {
        await legacy.emitEvent(event);
      }
      state.last_event_id = event.eventId;
      state.last_delivered_at = new Date().toISOString();
      connected = true;
    },
    async heartbeat(agentId: string, runId: string): Promise<void> {
      if (canonical) {
        await canonical.heartbeat();
      } else {
        await legacy.heartbeat({ projectId: config.projectId, agentId, runId });
      }
      connected = true;
    },
    async disconnect(): Promise<void> {
      if (canonical) await canonical.disconnect();
      connected = false;
    },
    state(): WatchtowerState {
      return { ...state };
    },
    isConnected(): boolean {
      return connected;
    },
  };
}
