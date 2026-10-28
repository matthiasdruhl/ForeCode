// Developer-local preparation only. A digest is not independent authority.
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GitCommitSchema } from "../../../src/lib/contracts/common";
import { jsonDigest } from "../../../src/lib/report/digests";
import { freezeBooking } from "../../evaluator/booking-v1/freeze";
import { disjoint, privateDirectory } from "../artifacts/files";
import { configurationDigest } from "../isolation/gate";
import type { OperatorConfig } from "../isolation/config";
import { fixedTask } from "./protocol";

export const realAgentExecutionBlockers = [
  "independent-exact-runtime-sandbox-admission",
  "provider-spending-authority-and-enforced-hard-limits",
  "supervised-termination-detached-process-and-restart-absence",
  "read-only-final-source-transfer-without-guest-restart",
  "fresh-runtime-inventory-and-installed-evaluator-custody",
  "owner-coordination-and-shared-lease",
] as const;

export function bookingExecutionCommitment(
  config: OperatorConfig,
  repoCommit: string,
  runId: string,
  pins: Awaited<ReturnType<typeof freezeBooking>>,
) {
  GitCommitSchema.parse(repoCommit);
  const commitment = {
    schemaVersion: "booking-execution-commitment-proposal.v1",
    runId,
    arm: "A",
    purpose: "single-arm-booking-smoke",
    task: fixedTask,
    taskSha256: jsonDigest(fixedTask),
    repoCommit,
    fixtureSha256: pins.fixtureSha256,
    fixtureManifestSha256: jsonDigest(pins.fixtureManifest),
    dependencyFiles: pins.fixtureManifest.filter((file) =>
      ["package.json", "package-lock.json"].includes(file.path),
    ),
    configurationSha256: configurationDigest(config),
    // The later independent review binds this commitment, not vice versa.
    // Including its hash here would make preparation/approval circular.
    proposedIsolationReviewSha256: null,
    implementationSha256: pins.evaluatorSha256,
    evaluator: {
      workerImage: config.workerImage,
      graderNodeSha256: config.graderNodeSha256,
      graderLockSha256: config.graderLockSha256,
      graderModulesSha256: config.graderModulesSha256,
      testSuiteSha256: pins.testSuiteSha256,
      requiredPolicySha256: pins.requiredPolicySha256,
      requiredCheckIds: pins.policy.requiredCheckIds,
    },
    agent: {
      model: config.authorizedModel,
      binarySha256: config.codexBinarySha256,
      configurationSha256: config.agentConfigSha256,
      tools: config.supervision
        ? "nested UID1000 network-none guest shell; no outer-VM or Docker socket access; independent admission required"
        : "guest shell; command mediation NOT_REVIEWED",
      writablePaths: ["src/"],
      pathEnforcement: config.supervision
        ? "read-only fixture with src-only writable mount; sealed post-export rejection; independent admission required"
        : "post-export rejection; guest enforcement NOT_REVIEWED",
      exactGuestWorkspace: config.supervision ? "/workspace" : null,
      maximumSeconds: config.maxSeconds,
      maximumOutputBytes: config.maxOutputBytes,
      tokenLimit: config.tokenLimit,
      spendUsd: config.spendUsd,
      providerHardLimitEnforcement: config.supervision
        ? "serial trusted broker reservations and output cap; exact protocol/tariff/account enforcement must be independently reviewed"
        : "NOT_REVIEWED",
      proposedSupervision: config.supervision ?? null,
    },
    expectedRuntime: {
      agentSandbox: config.agentSandbox,
      agentImage: config.agentImage,
      graderSandbox: config.graderSandbox,
      graderImage: config.graderImage,
      actualInventorySha256: null,
    },
    admission: {
      status: "BLOCKED",
      authority: null,
      independentlyHeldCommitment: null,
      revocationObservation: null,
      blockers: realAgentExecutionBlockers,
    },
    executionStatus: "NOT_RUN",
    evidenceOrigin: "none",
    limitations: [
      "Proposal only: no owner approval, runtime admission, provider spending or measured agent evidence.",
      "A new independently held exact commitment and current revocation check are required before any future launch.",
      "Existing offline grader acceptance does not admit a guest-sudo coding agent.",
    ],
  } as const;
  return { commitment, commitmentSha256: jsonDigest(commitment) };
}

export async function prepareBookingExecutionCommitment(
  config: OperatorConfig,
  repoCommit: string,
) {
  const root = await privateDirectory(config.protectedRoot);
  disjoint(root, fileURLToPath(new URL("../../../", import.meta.url)));
  disjoint(
    root,
    path.resolve(
      fileURLToPath(new URL("../../../", import.meta.url)),
      "../AgentHarness-Planning",
    ),
  );
  const runId = randomUUID();
  const pins = await freezeBooking();
  const proposal = bookingExecutionCommitment(config, repoCommit, runId, pins);
  const after = await freezeBooking();
  if (
    after.fixtureSha256 !== pins.fixtureSha256 ||
    after.evaluatorSha256 !== pins.evaluatorSha256
  )
    throw new Error("Source changed during commitment preparation.");
  const directory = path.join(root, runId);
  await mkdir(directory, { mode: 0o700 });
  await writeFile(
    path.join(directory, "commitment-proposal.json"),
    JSON.stringify(proposal, null, 2),
    { mode: 0o400, flag: "wx" },
  );
  return { runId, ...proposal };
}
