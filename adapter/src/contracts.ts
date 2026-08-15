/**
 * Bridge contracts — the only TypeScript types the bridge defines.
 *
 * Contains NO network logic, NO runtime logic, NO policy logic.
 * These types are the shared vocabulary between the Character Kit client,
 * the Watchtower client, and the adapter. Neither primitive depends on this
 * file; this file depends on neither primitive's internals.
 */

/** Severity mirrors Watchtower's EventSeverity (verified: index.d.ts). */
export type BridgeSeverity = "info" | "success" | "warning" | "error" | "critical";

/**
 * Normalized adapter event. One shape, both sides map to it.
 * Core fields are required; optional fields carry vendor evidence.
 */
export interface NormalizedEvent {
  event_id: string;
  event_type: NormalizedEventType;
  timestamp: string; // ISO-8601
  agent_id: string;
  session_id: string;
  correlation_id: string;
  sequence: number;
  source: "character-kit" | "watchtower" | "bridge";
  enforcement_state: "checked" | "allowed" | "blocked" | "delivered" | "duplicate" | "out_of_order";
  transport: "socket" | "http" | "unknown";
  evidence: Record<string, unknown>;

  // Optional
  habit_id?: string;
  habit_summary?: string;
  ack_text?: string;
  decision_reason?: string;
  retry_count?: number;
  parent_event_id?: string;
  host_surface?: string;
  watchtower_route?: string;
  character_kit_route?: string;
  latency_ms?: number;
  error_code?: string;
  error_message?: string; // redacted-safe
}

export type NormalizedEventType =
  | "character.enforcement.checked"
  | "character.enforcement.allowed"
  | "character.enforcement.blocked"
  | "character.habit.injected"
  | "character.habit.acknowledged"
  | "event.delivered"
  | "event.duplicate"
  | "event.out_of_order";

/** Result of a Character Kit enforcement gate, as the bridge sees it. */
export interface EnforcementResult {
  decision: "allowed" | "blocked";
  habit_id?: string;
  habit_summary?: string;
  ack_text?: string;
  decision_reason?: string;
  evidence: Record<string, unknown>;
}

/** Adapter-visible Watchtower state. The bridge never re-implements policy. */
export interface WatchtowerState {
  lease_status?: "active" | "denied" | "expired";
  guardrail_decision?: "allowed" | "denied";
  last_event_id?: string;
  last_delivered_at?: string;
}

/** Public bridge configuration (validated by config.ts). */
export interface BridgeConfig {
  characterKitSocket?: string;
  characterKitToken?: string;
  watchtowerGateway: string;
  watchtowerIngestionSecret: string;
  watchtowerProducer: string;
  /**
   * Canonical fw_agent_* credential (MOD-004). Optional: when absent, the
   * bridge behaves exactly as it always has -- legacy producer-signed HMAC
   * only, zero regression. When present, watchtower.ts routes
   * connect/heartbeat/emit/disconnect through FederationAgentClient
   * instead. Never the shared ingestion secret's replacement for the four
   * routes that still have no canonical bearer path (lease validate, tool
   * authorize, validation gates, commands) -- those stay legacy-only until
   * Federation ships MOD-002 canonically, which the adapter cannot control.
   */
  watchtowerAgentToken?: string;
  /**
   * Canonical fw_owner_* credential (MOD-004). Optional, used only for
   * one-time owner/agent bootstrap (FederationOwnerClient.registerAgent),
   * not part of the steady-state emit/heartbeat path.
   */
  watchtowerOwnerToken?: string;
  projectId: string;
  agentId: string;
  maxRetries: number;
  retryBaseMs: number;
}

/** Public API surface returned by createBridge. */
export interface Bridge {
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): BridgeStatus;
}

export interface BridgeStatus {
  running: boolean;
  characterKitConnected: boolean;
  watchtowerConnected: boolean;
  pendingQueue: number;
  lastError?: string;
}
