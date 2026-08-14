/**
 * Watchtower client — ONLY Watchtower-facing integration.
 *
 * Connects to (verified from packages/watchtower-sdk/src/index.d.ts):
 *   - WatchtowerClient.emitEvent(event)
 *   - WatchtowerClient.heartbeat(input)
 *   - WatchtowerClient.requestLease(input)
 *   - WatchtowerClient.validateLease(...)
 *   - FederationOwnerClient.registerAgent(manifest)
 *   - POST /api/v1/agents, /leases, /leases/{id}/validate, /disconnect
 *   - fapi.drdeeks.xyz
 *
 * Contains NO habit policy, NO Character Kit daemon internals.
 *
 * Signed ingestion (verified): HMAC-SHA256 over `${ts}.${body}`,
 * headers X-Watchtower-Signature: sha256=..., X-Watchtower-Timestamp,
 * X-Watchtower-Producer. The SDK handles signing internally.
 */

import { WatchtowerClient, type OperationalEvent } from "@federation-watchtower/sdk";
import type { BridgeConfig, WatchtowerState } from "../contracts.js";

export interface WatchtowerClientHandle {
  emit(event: OperationalEvent): Promise<void>;
  heartbeat(agentId: string, runId: string): Promise<void>;
  state(): WatchtowerState;
  isConnected(): boolean;
}

/**
 * Build a Watchtower client from bridge config. Uses the verified SDK surface.
 */
export function createWatchtowerClient(config: BridgeConfig): WatchtowerClientHandle {
  const client = new WatchtowerClient({
    ingestionSecret: config.watchtowerIngestionSecret,
    producer: config.watchtowerProducer,
    gateway: config.watchtowerGateway,
  });

  const state: WatchtowerState = {};
  let connected = true;

  return {
    async emit(event: OperationalEvent): Promise<void> {
      await client.emitEvent(event);
      state.last_event_id = event.eventId;
      state.last_delivered_at = new Date().toISOString();
      connected = true;
    },
    async heartbeat(agentId: string, runId: string): Promise<void> {
      await client.heartbeat({ projectId: config.projectId, agentId, runId });
      connected = true;
    },
    state(): WatchtowerState {
      return { ...state };
    },
    isConnected(): boolean {
      return connected;
    },
  };
}
