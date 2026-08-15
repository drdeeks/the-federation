/**
 * Adapter — orchestrates Character Kit <-> Watchtower flow.
 *
 * Contains NO second enforcement engine, NO event storage engine,
 * NO daemon startup code, NO host-specific UI behavior.
 *
 * Flow (blueprint §2):
 *   1. Character Kit gateAction -> EnforcementResult
 *   2. normalize -> NormalizedEvent
 *   3. dedupe + ordering
 *   4. transport.send -> Watchtower (fail-closed: never release on failure)
 */

import type { BridgeConfig, Bridge, BridgeStatus, EnforcementResult, NormalizedEvent } from "./contracts.js";
import { createCharacterKitClient, type CharacterKitClient } from "./bridge/character-kit.js";
import { createWatchtowerClient, type WatchtowerClientHandle } from "./bridge/watchtower.js";
import { enforcementToEvent, habitInjectedToEvent } from "./normalization/event-normalizer.js";
import { createHttpTransport } from "./transport/http.js";
import type { Transport } from "./transport/transport.js";
import { BridgeState } from "./state.js";
import { classifyFailure, isRetryable } from "./failure.js";

export interface AdapterContext {
  session_id: string;
  correlation_id: string;
}

export interface BridgeInternals {
  gateAction(tool: string, params?: Record<string, unknown>): Promise<EnforcementResult>;
  checkHabit(habitId: string, summary: string): Promise<void>;
  submitAcknowledgement(ackText: string): Promise<void>;
  sendHeartbeat(runId: string): Promise<void>;
  emitEvent(result: EnforcementResult, ctx: AdapterContext): Promise<void>;
  injectHabitEvent(habitId: string, summary: string, ctx: AdapterContext): Promise<void>;
}

/** Public bridge API (tiny) + internal helpers, both returned together. */
export interface FullBridge extends Bridge, BridgeInternals {}

export function createBridge(config: BridgeConfig): FullBridge {
  const ck: CharacterKitClient = createCharacterKitClient(config.characterKitSocket, config.characterKitToken);
  const wt: WatchtowerClientHandle = createWatchtowerClient(config);
  const transport: Transport = createHttpTransport(wt, config.projectId, config.agentId);
  const state = new BridgeState();
  let running = false;
  let seq = 0;

  async function deliver(event: NormalizedEvent): Promise<void> {
    if (state.dedupe.isDuplicate(event)) return;
    const ord = state.ordering.classify(event);
    if (ord === "out_of_order") {
      await transport.send({ ...event, enforcement_state: "out_of_order", event_type: "event.out_of_order" });
      return;
    }
    let attempt = 0;
    for (;;) {
      try {
        await transport.send(event);
        return;
      } catch (err) {
        const decision = classifyFailure(err);
        if (!isRetryable(decision) || attempt >= config.maxRetries) {
          // fail-closed: never throw a false "allowed"
          throw decision.blockAction ? (err as Error) : new Error(`delivery failed: ${decision.reason}`);
        }
        attempt = state.bumpRetry(event.correlation_id);
        await delay(config.retryBaseMs * 2 ** attempt);
      }
    }
  }

  const internals: BridgeInternals = {
    async gateAction(tool, params) {
      return ck.gateAction(tool, params);
    },
    async checkHabit(habitId, summary) {
      await ck.injectHabit(habitId, summary);
    },
    async submitAcknowledgement(ackText) {
      await ck.submitAcknowledgement(ackText);
    },
    async sendHeartbeat(runId) {
      await wt.heartbeat(config.agentId, runId);
    },
    async emitEvent(result, ctx) {
      const event = enforcementToEvent(result, {
        agent_id: config.agentId,
        session_id: ctx.session_id,
        correlation_id: ctx.correlation_id,
        sequence: ++seq,
      });
      await deliver(event);
    },
    async injectHabitEvent(habitId, summary, ctx) {
      const event = habitInjectedToEvent(habitId, summary, {
        agent_id: config.agentId,
        session_id: ctx.session_id,
        correlation_id: ctx.correlation_id,
        sequence: ++seq,
      });
      await deliver(event);
    },
  };

  const bridge: Bridge = {
    async start() {
      await wt.connect();
      running = true;
    },
    async stop() {
      await wt.disconnect();
      running = false;
    },
    status(): BridgeStatus {
      return {
        running,
        characterKitConnected: ck.isConnected(),
        watchtowerConnected: wt.isConnected(),
        pendingQueue: 0,
      };
    },
  };

  return { ...bridge, ...internals };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
