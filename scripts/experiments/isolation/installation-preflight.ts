// Developer-local reporting only. No adapter, lease acquisition or guest command.
import { InventorySchema } from "./offline-inventory";
import { protectedRead } from "../artifacts/files";
import { verifyToolchainArtifact } from "./toolchain";
import { OfflineConfigSchema, offlineObligations } from "./offline-config";
import {
  offlineConfigurationDigest,
  reviewOffline,
  admitOffline,
} from "./offline-gate";
import { verifyInstalledGrader } from "./installed-grader";
import { jsonDigest } from "../../../src/lib/report/digests";
import { validateVmResources } from "./vm-resources";

export async function installationPreflight(
  artifactRoot: string,
  configFile?: string,
  inventoryFile?: string,
) {
  const artifact = await verifyToolchainArtifact(artifactRoot);
  const gaps: {
    gate: string;
    state: "MISSING" | "INVALID" | "UNOBSERVED";
    action: string;
  }[] = [];
  const add = (
    gate: string,
    state: "MISSING" | "INVALID" | "UNOBSERVED",
    action: string,
  ) => gaps.push({ gate, state, action });
  let configurationSha256: string | null = null,
    inventorySha256: string | null = null;
  let proposedInputs = "MISSING",
    review = "MISSING",
    inventory = "MISSING";
  let reviewIssue: string | null = null;
  let configuredVmLimits: { diskBytes: number; pids: number } | null = null;
  const configBytes = configFile ? await protectedRead(configFile) : null;
  const inventoryBytes = inventoryFile
    ? await protectedRead(inventoryFile)
    : null;
  if (!configBytes)
    add(
      "configuration",
      "MISSING",
      "Owner supplies private offline configuration; keep enabled=false.",
    );
  else {
    const config = OfflineConfigSchema.parse(
      JSON.parse(configBytes.toString()),
    );
    configurationSha256 = offlineConfigurationDigest(config);
    configuredVmLimits = { diskBytes: config.vmDiskBytes, pids: config.vmPids };
    const imageMatches =
      config.workerImage === artifact.image.id ||
      artifact.image.repoDigests.includes(config.workerImage);
    proposedInputs =
      imageMatches &&
      config.graderNodeSha256 === artifact.audit.nodeSha256 &&
      config.graderLockSha256 === artifact.audit.lockSha256 &&
      config.graderModulesSha256 === artifact.audit.modulesSha256
        ? "BOUND"
        : "INVALID";
    if (proposedInputs === "INVALID")
      add(
        "proposed-tooling",
        "INVALID",
        "Use the exact reviewed artifact image, Node, lock and module-tree identities; do not edit old evidence.",
      );
    try {
      await reviewOffline(config, artifact.request.implementationSha256);
      review = "RECORD_VALID_INTEGRITY_ONLY";
    } catch (error) {
      const reasons: Record<string, string> = {
        "Offline acceptance disabled": "ACCEPTANCE_DISABLED",
        "Offline review digest mismatch": "REVIEW_DIGEST_MISMATCH",
        "Offline review freshness missing": "REVIEW_STALE_OR_INVALID_INTERVAL",
        "Offline review binding mismatch": "REVIEW_BINDING_MISMATCH",
        "Offline obligations missing": "REQUIRED_OBLIGATIONS_MISSING",
        "Offline isolation evidence changed": "ISOLATION_EVIDENCE_CHANGED",
      };
      reviewIssue =
        reasons[error instanceof Error ? error.message : ""] ??
        "REVIEW_OR_EVIDENCE_UNAVAILABLE_OR_MALFORMED";
      add(
        "owner-isolation-review",
        "MISSING",
        "Supply fresh independent owner/exclusive-lease authority and all eleven current implementation/configuration-bound observations. Infrastructure PASS labels grant no authority.",
      );
    }
    if (inventoryBytes) {
      try {
        const raw: unknown = JSON.parse(inventoryBytes.toString());
        const parsed = InventorySchema.parse(raw);
        validateVmResources(parsed.vmResources, config);
        if (
          parsed.image !== config.graderImage ||
          parsed.sbxSha256 !== config.sbxSha256 ||
          parsed.reviewedLimits.vmDiskBytes !== config.vmDiskBytes ||
          parsed.reviewedLimits.vmPids !== config.vmPids
        )
          throw new Error("Inventory configuration differs");
        await verifyInstalledGrader(
          parsed.files,
          [
            {
              Id: parsed.worker.id,
              RepoDigests: parsed.worker.repoDigests,
              Os: parsed.worker.os,
              Architecture: parsed.worker.architecture,
            },
          ],
          config,
        );
        if (parsed.worker.architecture !== artifact.image.architecture)
          throw new Error("Guest architecture differs");
        await admitOffline(config, raw, artifact.request.implementationSha256);
        inventorySha256 = jsonDigest(raw);
        inventory = "RECORD_BOUND_INTEGRITY_ONLY";
      } catch {
        inventory = "INVALID";
        add(
          "installed-inventory",
          "INVALID",
          "Collect the complete actual guest inventory using the fixed offline-sbx inventory sequence and bind its canonical JSON digest in an independent review.",
        );
      }
    }
  }
  if (!inventoryBytes)
    add(
      "installed-inventory",
      "MISSING",
      "Owner must observe installed image/controller/tooling bytes, permissions, executable modes and guest ABI/native/tsx/server-only compatibility. Do not infer installation from an archive.",
    );
  if (review === "MISSING")
    add(
      "owner-authority-and-exclusive-lease",
      "MISSING",
      "The sandbox owner must independently authorize this exact installation and coordinate the shared lease. Preflight does not create or recover a lease or authorize a stopped VM start.",
    );
  add(
    "enforced-vm-limits",
    "UNOBSERVED",
    "Independently observe finite enforced VM disk and process caps. Configured values and free disk are not enforcement; retain the resource-limits observation.",
  );
  add(
    "live-admission-and-acceptance",
    "UNOBSERVED",
    "After owner installation/review, existing acceptance admission must recheck current inventory and custody under the shared lease; run lifecycle-only first, then full booking acceptance.",
  );
  // Verify small proposal inputs and the artifact again before returning a handoff.
  if (configFile && !(await protectedRead(configFile)).equals(configBytes!))
    throw new Error("Configuration changed during preflight");
  if (
    inventoryFile &&
    !(await protectedRead(inventoryFile)).equals(inventoryBytes!)
  )
    throw new Error("Inventory changed during preflight");
  const final = await verifyToolchainArtifact(artifactRoot);
  if (JSON.stringify(final) !== JSON.stringify(artifact))
    throw new Error("Artifact changed during preflight");
  return {
    schemaVersion: "booking-installation-preflight.v1",
    status: gaps.some((g) => g.state === "INVALID")
      ? "INPUTS_INVALID"
      : "OWNER_ACTION_REQUIRED",
    authority: "NONE_INTEGRITY_ONLY",
    implementationSha256: artifact.request.implementationSha256,
    inputs: {
      requestSha256: artifact.requestSha256,
      runtimeManifestSha256: artifact.request.runtimeManifestSha256,
      image: artifact.image,
      archive: artifact.archive,
      nodeSha256: artifact.audit.nodeSha256,
      lockSha256: artifact.audit.lockSha256,
      modulesSha256: artifact.audit.modulesSha256,
    },
    proposal: {
      proposedInputs,
      configurationSha256,
      configuredVmLimits,
      inventorySha256,
      inventory,
      review,
      reviewIssue,
    },
    requiredObligations: offlineObligations,
    installedRuntime: null,
    installationStatus: "UNKNOWN",
    observedVmEnforcement: null,
    lifecycleAcceptance: "NOT_RUN",
    bookingAcceptance: "NOT_RUN",
    inference: "NOT_RUN",
    realAgentExecution: "DISABLED",
    gaps,
    ownerSequence: [
      "Review original request/manifest/build metadata/commands/archive custody and establish an exclusive window using the same coordinationRoot/.booking-run.lock; do not recover another owner's lock.",
      "Owner alone loads the exact image into existing forecode-grader with egress denied. Refuse an existing /opt/forecode-booking; preserve all environments and policy.",
      "Derive bin/node, node_modules, package.json and lock from that same image via an owner-named, never-started staging container. Preserve executable modes; remove only that staging container and its exact staged archive after verification.",
      "Install only runtime/controller at /opt/forecode-booking/controller; trusted directories 0755, text 0644, Node executable, no worker-owned/writable tooling. Keep evaluator/candidate/private material outside the agent workspace.",
      "Verify guest architecture and Node native closure without copying global libraries. Observe pinned Node version, tsx TypeScript transformation, react-server/server-only and native Next smokes under existing containment; stop on incompatibility.",
      "Collect actual runtime-files.py grader REVIEWED_NODE_SHA256 plus image inspect and full fixed inventory. Return fresh independently reviewed isolation/custody/authority and enforced disk/PID observations. Do not generate PASS placeholders.",
      "Use acceptance:booking -- --config /absolute/private/offline.json --lifecycle-only --execute only after admission; retain failures/lease. Then use the same configuration with --execute for booking/publication/loader/verdict acceptance.",
    ],
  };
}
