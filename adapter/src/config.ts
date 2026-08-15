/**
 * Bridge configuration — validates and parses config only.
 *
 * Contains NO enforcement decisions, NO event normalization,
 * NO raw Watchtower internals.
 */

import type { BridgeConfig } from "./contracts.js";

export interface RawConfigInput {
  characterKitSocket?: string;
  characterKitToken?: string;
  watchtowerGateway?: string;
  watchtowerIngestionSecret?: string;
  watchtowerProducer?: string;
  watchtowerAgentToken?: string;
  watchtowerOwnerToken?: string;
  projectId?: string;
  agentId?: string;
  maxRetries?: number;
  retryBaseMs?: number;
}

/**
 * Resolve config from explicit input, falling back to environment variables.
 * Throws on missing mandatory values (fail-closed config).
 */
export function resolveConfig(input: RawConfigInput = {}): BridgeConfig {
  const gateway = input.watchtowerGateway ?? process.env.WATCHTOWER_GATEWAY;
  const secret = input.watchtowerIngestionSecret ?? process.env.WATCHTOWER_INGESTION_SECRET;
  const producer = input.watchtowerProducer ?? process.env.WATCHTOWER_PRODUCER ?? "bridge-character-kit";
  const projectId = input.projectId ?? process.env.BRIDGE_PROJECT_ID;
  const agentId = input.agentId ?? process.env.BRIDGE_AGENT_ID;

  if (!gateway) throw new Error("config: watchtowerGateway is required");
  if (!secret) throw new Error("config: watchtowerIngestionSecret is required");
  if (!projectId) throw new Error("config: projectId is required");
  if (!agentId) throw new Error("config: agentId is required");

  const maxRetries = input.maxRetries ?? Number(process.env.BRIDGE_MAX_RETRIES ?? "5");
  const retryBaseMs = input.retryBaseMs ?? Number(process.env.BRIDGE_RETRY_BASE_MS ?? "200");

  // Canonical tokens (MOD-004): optional, never required. Absence means
  // legacy-only behavior, unchanged from before this field existed.
  const watchtowerAgentToken = input.watchtowerAgentToken ?? process.env.WATCHTOWER_AGENT_TOKEN;
  const watchtowerOwnerToken = input.watchtowerOwnerToken ?? process.env.WATCHTOWER_OWNER_TOKEN;

  return {
    characterKitSocket: input.characterKitSocket ?? process.env.CHARACTER_KIT_SOCKET,
    characterKitToken: input.characterKitToken ?? process.env.CHARACTER_KIT_TOKEN,
    watchtowerGateway: gateway,
    watchtowerIngestionSecret: secret,
    watchtowerProducer: producer,
    watchtowerAgentToken,
    watchtowerOwnerToken,
    projectId,
    agentId,
    maxRetries: Number.isFinite(maxRetries) ? maxRetries : 5,
    retryBaseMs: Number.isFinite(retryBaseMs) ? retryBaseMs : 200,
  };
}
