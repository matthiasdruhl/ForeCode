import { parseArgs } from "node:util";
import { protectedRead } from "../artifacts/files";
import { OfflineConfigSchema } from "../isolation/offline-config";
import { offlineConfigurationDigest } from "../isolation/offline-gate";
import { createOfflineSbxAdapter } from "./offline-sbx";
import { runOfflineAcceptance } from "./offline-controller";
const { values } = parseArgs({
  strict: true,
  options: {
    config: { type: "string" },
    execute: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});
if (values.help)
  process.stdout.write(
    "Developer-local NO-INFERENCE booking acceptance. --config /private/offline.json [--execute]\nDefault validates only. Execution requires independently reviewed existing runtime/owner authority. Fixed scenarios only; no source, shell, prompt, model or provider options. See docs/BOOKING-OFFLINE-ACCEPTANCE.md.\n",
  );
else {
  const cancellation = new AbortController(),
    cancel = () => cancellation.abort();
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    if (!values.config) throw new Error("Missing private config");
    const config = OfflineConfigSchema.parse(
      JSON.parse((await protectedRead(values.config)).toString()),
    );
    if (!values.execute)
      process.stdout.write(
        JSON.stringify({
          execution: "NOT_RUN",
          configurationValid: true,
          configurationSha256: offlineConfigurationDigest(config),
          acceptanceEnabled: config.acceptanceEnabled,
          realAgentExecution: "DISABLED",
        }) + "\n",
      );
    else {
      const result = await runOfflineAcceptance(
        config,
        createOfflineSbxAdapter(config),
        cancellation.signal,
      );
      process.stdout.write(
        JSON.stringify({
          acceptanceId: result.acceptanceId,
          status: result.status,
          inference: "NOT_RUN",
          realAgentExecution: "NOT_RUN",
        }) + "\n",
      );
      if (result.status !== "completed") process.exitCode = 1;
    }
  } catch {
    process.stderr.write(
      "Offline acceptance failed closed. Inspect private gates and run records.\n",
    );
    process.exitCode = 1;
  } finally {
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}
