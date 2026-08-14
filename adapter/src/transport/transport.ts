/**
 * Transport interface — defines the seam, contains NO Character Kit logic
 * and NO Watchtower-specific logic.
 */

import type { NormalizedEvent } from "../contracts.js";

export interface Transport {
  send(event: NormalizedEvent): Promise<void>;
  isConnected(): boolean;
}
