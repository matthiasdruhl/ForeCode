import type { LifecycleRequest } from "./lifecycle-protocol.mjs";
export function exerciseLifecycle(
  request: LifecycleRequest,
  signal?: AbortSignal,
): Promise<unknown>;
