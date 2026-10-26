import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { jsonDigest } from "../../../src/lib/report/digests";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { protectedRead, privateDirectory, disjoint } from "../artifacts/files";
import { OperatorConfigSchema } from "../isolation/config";
import { createSbxAdapter } from "./sbx";
import { runBookingExperiment } from "./controller";
import { boundedProcess } from "./process";

const { values } = parseArgs({
  options: {
    config: { type: "string" },
    "inspect-runtime": { type: "boolean", default: false },
    execute: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  strict: true,
});
if (values.help) {
  process.stdout.write(
    "Developer-local booking runner. --config /absolute/private/config.json [--execute]\nDefault: validate configuration only; no sandbox command or paid call. --inspect-runtime: explicit operator probes (may start dedicated VMs), then stop them; no inference. See docs/BOOKING-RUNNER.md.\n",
  );
} else {
  try {
    if (!values.config) throw new Error("Missing private configuration.");
    const config = OperatorConfigSchema.parse(
      JSON.parse((await protectedRead(values.config)).toString("utf8")),
    );
    if (values["inspect-runtime"]) {
      if (values.execute)
        throw new Error("Inspection and execution are separate actions.");
      const root = await privateDirectory(config.protectedRoot);
      disjoint(root, fileURLToPath(new URL("../../../", import.meta.url)));
      const lock = path.join(root, ".booking-run.lock");
      await mkdir(lock, { mode: 0o700 });
      const adapter = createSbxAdapter(config);
      const cancellation = new AbortController();
      const cancel = () => cancellation.abort();
      process.on("SIGINT", cancel);
      process.on("SIGTERM", cancel);
      try {
        const inventory = await adapter.inspectRuntime(cancellation.signal);
        await writeFile(
          path.join(root, "inventory.json"),
          JSON.stringify(inventory),
          { mode: 0o400, flag: "wx" },
        );
        process.stdout.write(
          JSON.stringify({
            execution: "NOT_RUN",
            inventorySha256: jsonDigest(inventory),
            note: "Read-only runtime probes only; no containment or inference claim.",
          }) + "\n",
        );
      } finally {
        try {
          await adapter.cleanup();
        } finally {
          await rm(lock, { recursive: true });
          process.off("SIGINT", cancel);
          process.off("SIGTERM", cancel);
        }
      }
    } else if (!values.execute) {
      process.stdout.write(
        JSON.stringify({
          configurationValid: true,
          execution: "NOT_RUN",
          enabled: config.enabled,
          note: "Execution requires --execute, enabled operator configuration and current reviewed isolation/budget evidence.",
        }) + "\n",
      );
    } else {
      const cancellation = new AbortController();
      const cancel = () => cancellation.abort();
      process.on("SIGINT", cancel);
      process.on("SIGTERM", cancel);
      try {
        const git = await boundedProcess(
          "/usr/bin/git",
          [
            "-C",
            fileURLToPath(new URL("../../../", import.meta.url)),
            "rev-parse",
            "HEAD",
          ],
          { milliseconds: 5000, maxBytes: 1024 },
        );
        if (git.exitCode !== 0 || git.reason !== "completed")
          throw new Error("Missing repository identity.");
        const result = await runBookingExperiment(
          config,
          createSbxAdapter(config),
          cancellation.signal,
          git.stdout.trim(),
        );
        process.stdout.write(
          JSON.stringify({
            runId: result.run.id,
            status: result.run.status,
            evidenceOrigin: result.run.evidenceOrigin,
            published: result.entry !== null,
          }) + "\n",
        );
        if (result.run.status !== "completed") process.exitCode = 1;
      } finally {
        process.off("SIGINT", cancel);
        process.off("SIGTERM", cancel);
      }
    }
  } catch {
    process.stderr.write(
      "Booking runner refused configuration or runtime gates. No authority inferred; see the operator runbook and protected run records.\n",
    );
    process.exitCode = 1;
  }
}
