import "server-only";
import { createForesightService } from "./service";
import { createMetaTransport } from "./transport";
import { createForesightHttp } from "./http";

// Shared across Next route bundles in this process. Restart/replica limits are
// explicitly not a distributed quota or provider-side billing enforcement.
const runtime = globalThis as typeof globalThis & {
  __forecodeForesight?: ReturnType<typeof createForesightHttp>;
};
if (!runtime.__forecodeForesight) {
  const env = () => process.env;
  const transport = createMetaTransport({
    env,
    fetch: (...args) => fetch(...args),
  });
  runtime.__forecodeForesight = createForesightHttp(
    createForesightService(transport),
    env,
  );
}
export const foresightHttp = runtime.__forecodeForesight;
