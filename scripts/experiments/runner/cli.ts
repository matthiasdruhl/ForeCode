import { writeFile } from "node:fs/promises";
import path from "node:path";
import { jsonDigest } from "../../../src/lib/report/digests";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { protectedRead, privateDirectory, disjoint } from "../artifacts/files";
import { OperatorConfigSchema } from "../isolation/config";
import { randomUUID } from "node:crypto";
import { acquireBookingLease } from "./lease";
import { createSbxAdapter } from "./sbx";
import { runBookingExperiment } from "./controller";
import { boundedProcess } from "./process";
import {
  prepareBookingExecutionCommitment,
  realAgentExecutionBlockers,
} from "./commitment";

const { values } = parseArgs({
  options: {
    config: { type: "string" },
    commitment: { type: "string" },
    "prepare-commitment": { type: "boolean", default: false },
    "inspect-runtime": { type: "boolean", default: false },
    execute: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  strict: true,
});
if (values.help) {
  process.stdout.write(
    "Developer-local booking runner. --config /absolute/private/config.json [--execute --commitment /absolute/private/UUID/commitment-proposal.json]\nConcrete supervised worker execution requires an independently reviewed exact commitment, current admission, installed helper/image and enforced provider envelope. --prepare-commitment persists a private proposal only. Default validates configuration without VM/provider operations. --inspect-runtime requires explicit owner authority and the shared lease. No task/model/command override. See docs/BOOKING-RUNNER.md.\n",
  );
} else {
  try {
    if (!values.config) throw new Error("Missing private configuration.");
    const config = OperatorConfigSchema.parse(
      JSON.parse((await protectedRead(values.config)).toString("utf8")),
    );
    if (values.commitment && !values.execute)
      throw new Error("Commitment selection requires execution.");
    if (values["prepare-commitment"]) {
      if (values.execute || values["inspect-runtime"])
        throw new Error(
          "Preparation, inspection and execution are separate actions.",
        );
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
      const proposal = await prepareBookingExecutionCommitment(
        config,
        git.stdout.trim(),
      );
      process.stdout.write(
        JSON.stringify({
          runId: proposal.runId,
          commitmentSha256: proposal.commitmentSha256,
          execution: "NOT_RUN",
          admission: "BLOCKED",
          blockers: realAgentExecutionBlockers,
        }) + "\n",
      );
    } else if (values["inspect-runtime"]) {
      if (values.execute)
        throw new Error("Inspection and execution are separate actions.");
      const root = await privateDirectory(config.protectedRoot);
      disjoint(root, fileURLToPath(new URL("../../../", import.meta.url)));
      disjoint(
        config.coordinationRoot,
        fileURLToPath(new URL("../../../", import.meta.url)),
      );
      const lease = await acquireBookingLease(
        config.coordinationRoot,
        randomUUID(),
      );
      const adapter = createSbxAdapter(config);
      const cancellation = new AbortController();
      const cancel = () => cancellation.abort();
      process.on("SIGINT", cancel);
      process.on("SIGTERM", cancel);
      try {
        const inventory = await adapter.inspectRuntime(
          cancellation.signal,
          lease,
        );
        await writeFile(
          path.join(root, "inventory.json"),
          JSON.stringify(inventory),
          { mode: 0o400, flag: "wx" },
        );
        process.stdout.write(
          JSON.stringify({
            execution: "NOT_RUN",
            inventorySha256: jsonDigest(inventory),
            note: "Trusted inventory/resource setup only; no containment or inference claim.",
          }) + "\n",
        );
      } finally {
        try {
          await adapter.cleanup();
          await lease.release();
        } finally {
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
          admission: "BLOCKED",
          blockers: realAgentExecutionBlockers,
          note: "Execution requires separately approved exact commitment, supervised runtime installation, current independent admission and provider hard-budget evidence.",
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
          values.commitment
            ? JSON.parse(
                (await protectedRead(values.commitment)).toString("utf8"),
              )
            : undefined,
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
