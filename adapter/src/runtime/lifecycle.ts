/**
 * Runtime lifecycle — start/stop orchestration only.
 *
 * Contains NO transport-specific code beyond orchestration, NO policy logic.
 */

import type { FullBridge } from "../adapter.js";

export async function startBridge(bridge: FullBridge): Promise<void> {
  await bridge.start();
}

export async function stopBridge(bridge: FullBridge): Promise<void> {
  await bridge.stop();
}
