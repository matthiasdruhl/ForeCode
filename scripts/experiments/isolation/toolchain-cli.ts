import { parseArgs } from "node:util";
import { installationPreflight } from "./installation-preflight";
import {
  prepareToolchain,
  buildToolchain,
  localDockerDriver,
  verifyToolchainArtifact,
} from "./toolchain";
const { values } = parseArgs({
  strict: true,
  options: {
    output: { type: "string" },
    build: { type: "boolean", default: false },
    verify: { type: "string" },
    preflight: { type: "string" },
    config: { type: "string" },
    inventory: { type: "string" },
    help: { type: "boolean", default: false },
  },
});
if (values.help)
  process.stdout.write(
    "Trusted booking tooling only. --output /new/private/directory [--build], --verify /private/artifact, or --preflight /private/artifact [--config /private/offline.json] [--inventory /private/inventory.json].\nDefault prepares a byte-bound bundle without Docker. --build builds only its restricted tooling context, runs fixed offline dependency smokes and exports an image. Preflight is read-only, grants no authority and never starts a VM. No candidate, sbx, agent or inference entrypoint.\n",
  );
else {
  const cancellation = new AbortController(),
    cancel = () => cancellation.abort();
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    if (!values.preflight && (values.config || values.inventory))
      throw new Error("Proposal inputs require preflight");
    if (values.preflight) {
      if (
        values.output ||
        values.build ||
        values.verify ||
        (values.inventory && !values.config)
      )
        throw new Error("Separate read-only preflight operation");
      const report = await installationPreflight(
        values.preflight,
        values.config,
        values.inventory,
      );
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      if (report.status === "INPUTS_INVALID") process.exitCode = 1;
    } else if (values.verify) {
      if (values.output || values.build)
        throw new Error("Separate verification operation");
      const artifact = await verifyToolchainArtifact(values.verify);
      process.stdout.write(
        JSON.stringify({
          status: "BOUND_BYTES_VALID",
          authority: "NONE_INTEGRITY_ONLY",
          imageId: artifact.image.id,
          installationStatus: "NOT_INSTALLED",
          bookingAcceptance: "NOT_RUN",
          inference: "NOT_RUN",
        }) + "\n",
      );
    } else {
      if (!values.output) throw new Error("New private output required");
      if (!values.build) {
        const { request } = await prepareToolchain(values.output);
        process.stdout.write(JSON.stringify(request) + "\n");
      } else {
        const result = await buildToolchain(
          values.output,
          await localDockerDriver(),
          cancellation.signal,
        );
        process.stdout.write(
          JSON.stringify({
            status: result.status,
            stage: result.stage,
            imageId: result.image?.id ?? null,
            archiveSha256: result.archive?.sha256 ?? null,
            installationStatus: "NOT_INSTALLED",
            bookingAcceptance: "NOT_RUN",
            inference: "NOT_RUN",
          }) + "\n",
        );
        if (result.status !== "built") process.exitCode = 1;
      }
    }
  } catch {
    process.stderr.write(
      "Trusted tooling preparation failed closed; inspect private command records.\n",
    );
    process.exitCode = 1;
  } finally {
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}
