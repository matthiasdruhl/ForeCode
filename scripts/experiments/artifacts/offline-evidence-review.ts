import { constants } from "node:fs";
import { link, lstat, mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  ExperimentRunV1Schema,
  CheckResultV1Schema,
  EvaluatorReceiptV1Schema,
  type ExperimentRunV1,
  type VerificationV1,
} from "../../../src/lib/contracts/evidence";
import {
  invariant,
  orderedTime,
  sameIds,
  unique,
  validateReceiptRelationships,
} from "../../../src/lib/contracts/validation";
import { canonicalJson } from "../../../src/lib/report/canonical";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import { selectCertificateExport } from "../../../src/lib/report/certificate-export";
import {
  createProtectedEvaluationStore,
  isTrustedEvaluation,
} from "../../../src/server/artifacts/evaluation-store";
import {
  loadRecordedCertificates,
  type CertificateRegistration,
} from "../../../src/server/artifacts/recorded-certificates";
import {
  OfflineConfigSchema,
  type OfflineConfig,
} from "../isolation/offline-config";
import { offlineConfigurationDigest } from "../isolation/offline-gate";
import { disjoint, privateDirectory, protectedRead } from "./files";
import {
  AcceptanceSchema,
  ContextSchema,
  DisclosureSchema,
  PlanSchema,
  SelectionSchema,
  EntrySchema,
  cases,
  requiredChecks,
  type Selection,
} from "./offline-evidence-schema";

const project = fileURLToPath(new URL("../../../", import.meta.url));
const bundleSchema = z.strictObject({
  receipt: EvaluatorReceiptV1Schema,
  checks: z.array(CheckResultV1Schema).max(5),
});
export type Reason =
  | "UNSUPPORTED_SOURCE"
  | "SOURCE_PINS_MISSING"
  | "SOURCE_INVALID"
  | "ACCOUNTING_INVALID"
  | "NEVER_ATTEMPTED"
  | "SOURCE_REFERENCE_MISSING"
  | "ORIGINAL_UNAVAILABLE"
  | "CONTEXT_PIN_MISSING"
  | "CONTEXT_UNAVAILABLE"
  | "SOURCE_RELATIONSHIP_INVALID"
  | "UNLINKED_OPERATIONAL_FAILURE"
  | "FAILED_PUBLICATION"
  | "EVALUATION_UNAVAILABLE"
  | "DISCLOSURE_INVALID"
  | "FULL_SUITE_UNAVAILABLE"
  | "CANDIDATE_UNAVAILABLE";
export type CaseReview = {
  scenario: (typeof cases)[number];
  runId: string | null;
  disposition:
    | "never_attempted"
    | "original_missing"
    | "failed_publication"
    | "unlinked_failure"
    | "authenticated_completion"
    | "not_assessed"
    | "invalid";
  run: ExperimentRunV1 | null;
  sourceRunSha256: string | null;
  proposedCompleteRunSha256: string | null;
  verdict: VerificationV1["verdict"] | null;
  reasons: Reason[];
};
export type Review = {
  schemaVersion: "offline-evidence-review.v1";
  acceptanceId: string;
  acceptanceSha256: string;
  sourceSetSha256: string;
  selection: Selection;
  profile: unknown;
  declaredCaseCount: number | null;
  // Pinned private accounting data only; never substitutes for original runs.
  attemptDiagnostics: {
    scenario: (typeof cases)[number];
    runId: string;
    status: ExperimentRunV1["status"];
  }[];
  publicationFailures: string[];
  sourceState: "validated" | "incomplete" | "invalid" | "unsupported";
  suiteStatus: "completed" | "failed" | null;
  reasons: Reason[];
  cases: CaseReview[];
  disclosure: "not_supplied" | "validated" | "invalid" | "unavailable";
  publication: "NOT_PERFORMED";
  runtimeAdmission: "NOT_ASSESSED";
  candidate: null | {
    demo: Awaited<ReturnType<typeof loadRecordedCertificates>>["demo"];
    certificateExport: ReturnType<typeof selectCertificateExport>;
  };
};

// Explicit private input paths only. Evidence paths are derived below from UUIDs
// and fixed filenames. No directory discovery, candidate read or runtime import.
export async function readPrivateReviewInput(file: string, original = false) {
  await privateDirectory(path.dirname(file));
  const before = await lstat(file);
  invariant(
    before.uid === process.getuid?.() &&
      (before.mode & 0o077) === 0 &&
      (!original || (before.mode & 0o777) === 0o400),
    "Private file custody required.",
  );
  const bytes = await protectedRead(file);
  const after = await lstat(file);
  invariant(
    before.ino === after.ino &&
      before.dev === after.dev &&
      before.mode === after.mode,
    "Private file changed.",
  );
  return bytes;
}
function parse(bytes: Buffer, canonical = false): unknown {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value: unknown = JSON.parse(text);
  const normalized = canonicalJson(value); // Bounds depth/nodes and JSON values.
  invariant(!canonical || normalized === text, "Noncanonical original.");
  return value;
}
function expectedProfile(
  config: OfflineConfig,
  pins: NonNullable<Selection["pins"]>,
) {
  // Fixed producer v1 profile, not an execution policy or a new admission.
  const limits = {
    vmCpu: 2,
    vmMemoryBytes: 4 * 1024 ** 3,
    vmDiskBytes: config.vmDiskBytes,
    vmPids: config.vmPids,
    workerCpu: 1,
    workerMemoryBytes: 768 * 1024 ** 2,
    workerPids: 64,
    workerWorkBytes: 256 * 1024 ** 2,
    workerTmpBytes: 32 * 1024 ** 2,
    workerShmBytes: 16 * 1024 ** 2,
    workerDescriptors: 256,
    lifecycleSeconds: 90,
    lifecycleWorkerSeconds: 30,
    lifecycleWorkerOutputBytes: 4096,
    acceptanceSeconds: config.maxSeconds,
    graderSeconds: 580,
    cleanupSeconds: 60,
    outputBytes: config.maxOutputBytes,
  };
  const runtimePins = {
    limitsSha256: jsonDigest(limits),
    implementationSha256: pins.implementationSha256,
    workerImage: config.workerImage,
    graderNodeSha256: config.graderNodeSha256,
    graderLockSha256: config.graderLockSha256,
    graderModulesSha256: config.graderModulesSha256,
  };
  return {
    limits,
    runtimePins,
    profile: {
      domain: "forecode/no-agent-fixed-offline-acceptance/v1",
      agent: "none",
      variant: "A",
      scope: config.scope,
      candidateSelection: "code-owned-four-fixed-cases",
      build: "next-build-webpack",
      tools: {
        sbx: config.sbx,
        sbxSha256: config.sbxSha256,
        graderSandbox: config.graderSandbox,
        graderImage: config.graderImage,
        ...runtimePins,
      },
      network: "offline-grader",
    },
  };
}
const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

async function intake(config: OfflineConfig, selection: Selection) {
  const root = await privateDirectory(config.protectedRoot);
  await privateDirectory(config.scratchRoot);
  await privateDirectory(config.coordinationRoot);
  disjoint(root, config.scratchRoot);
  disjoint(config.coordinationRoot, config.scratchRoot);
  disjoint(config.coordinationRoot, project);
  disjoint(root, project);
  disjoint(config.scratchRoot, project);
  const reads: { file: string; digest: string }[] = [];
  async function pinned(
    directory: string,
    name: string,
    digest: string,
    canonical = false,
  ) {
    const file = path.join(root, directory, name);
    const bytes = await readPrivateReviewInput(file, true);
    invariant(sha256(bytes) === digest, "Original byte pin mismatch.");
    reads.push({ file, digest });
    return parse(bytes, canonical);
  }
  // This independent selection pin is mandatory; acceptance's own labels and
  // hashes are never an alternative. Preserve its producer serialization.
  const raw = await pinned(
    selection.acceptanceId,
    "acceptance.json",
    selection.acceptanceSha256,
  );
  const acceptance = AcceptanceSchema.safeParse(raw);
  const report: Review = {
    schemaVersion: "offline-evidence-review.v1",
    acceptanceId: selection.acceptanceId,
    acceptanceSha256: selection.acceptanceSha256,
    sourceSetSha256: jsonDigest(selection),
    selection,
    profile: null,
    declaredCaseCount: null,
    attemptDiagnostics: [],
    publicationFailures: [],
    sourceState: "invalid",
    suiteStatus: null,
    reasons: [],
    cases: cases.map((scenario) => ({
      scenario,
      runId: null,
      disposition: "not_assessed",
      run: null,
      sourceRunSha256: null,
      proposedCompleteRunSha256: null,
      verdict: null,
      reasons: [],
    })),
    disclosure: "not_supplied",
    publication: "NOT_PERFORMED",
    runtimeAdmission: "NOT_ASSESSED",
    candidate: null,
  };
  const emptyStore = {
    root,
    agentWorkspaceRoot: config.scratchRoot,
    entries: new Map<string, z.infer<typeof EntrySchema>>(),
  };
  if (!acceptance.success) {
    const prospective =
      typeof raw === "object" && raw !== null && "sourceRecords" in raw;
    report.reasons.push(prospective ? "SOURCE_INVALID" : "UNSUPPORTED_SOURCE");
    report.sourceState = prospective ? "invalid" : "unsupported";
    return { report, store: emptyStore, endedAt: null };
  }
  const a = acceptance.data;
  report.declaredCaseCount = a.casePlan.length;
  report.attemptDiagnostics = a.attemptDiagnostics;
  report.publicationFailures = a.publicationFailures;
  report.suiteStatus = a.status;
  invariant(
    a.acceptanceId === selection.acceptanceId,
    "Acceptance identity mismatch.",
  );
  for (const row of report.cases) {
    const attempt = a.attemptDiagnostics.find(
      (attempt) => attempt.scenario === row.scenario,
    );
    row.runId = attempt?.runId ?? null;
    row.disposition = attempt ? "original_missing" : "never_attempted";
    row.reasons = attempt ? [] : ["NEVER_ATTEMPTED"];
  }
  if (a.mode === "lifecycle-only" || a.source === null) {
    report.sourceState = "unsupported";
    report.reasons.push("UNSUPPORTED_SOURCE");
    return { report, store: emptyStore, endedAt: a.endedAt };
  }
  const pins = selection.pins;
  try {
    orderedTime(a.startedAt, a.endedAt);
    unique(
      a.attemptDiagnostics.map((r) => r.runId),
      "attempt IDs",
    );
    unique(
      a.attemptDiagnostics.map((r) => r.scenario),
      "attempt cases",
    );
    unique(
      a.sourceRecords.map((r) => r.runId),
      "source references",
    );
    unique(
      a.entries.map((r) => r.identity.runId),
      "evaluation references",
    );
    unique(
      a.verdicts.map((r) => r.scenario),
      "verdict references",
    );
    unique(a.publicationFailures, "publication failures");
    unique(
      selection.caseContexts.map((r) => r.runId),
      "context pins",
    );
    invariant(
      equal(
        a.casePlan,
        cases.map((scenario) => ({ scenario, variant: "A" })),
      ),
      "Incomplete case plan.",
    );
    invariant(
      equal(
        a.attemptDiagnostics.map((r) => r.scenario),
        cases.slice(0, a.attemptDiagnostics.length),
      ),
      "Non-producer attempt plan.",
    );
    const attempted = new Set(a.attemptDiagnostics.map((r) => r.runId));
    for (const ref of [
      ...a.sourceRecords,
      ...a.entries.map((e) => ({ runId: e.identity.runId })),
      ...selection.caseContexts,
      ...a.publicationFailures.map((runId) => ({ runId })),
    ])
      invariant(attempted.has(ref.runId), "Undeclared attempt reference.");
    invariant(
      a.verdicts.every((v) =>
        a.attemptDiagnostics.some((r) => r.scenario === v.scenario),
      ),
      "Undeclared verdict.",
    );
    const observedRuns: string[] = [];
    for (const observation of a.observations) {
      if (observation.stage === "lifecycle") {
        invariant(
          observation.runId === undefined && observation.scenario === undefined,
          "Invalid lifecycle observation.",
        );
        continue;
      }
      invariant(
        typeof observation.runId === "string" &&
          a.attemptDiagnostics.some(
            (attempt) =>
              attempt.runId === observation.runId &&
              attempt.scenario === observation.scenario,
          ),
        "Unaccounted observed attempt.",
      );
      observedRuns.push(observation.runId);
    }
    unique(observedRuns, "observed attempts");
  } catch {
    report.reasons.push("ACCOUNTING_INVALID");
    return { report, store: emptyStore, endedAt: a.endedAt };
  }
  if (!pins || !selection.sourcePlanSha256) {
    report.reasons.push("SOURCE_PINS_MISSING");
    return { report, store: emptyStore, endedAt: a.endedAt };
  }
  try {
    unique(pins.requiredCheckIds, "required pins");
    invariant(
      sameIds(pins.requiredCheckIds, requiredChecks),
      "Fixed required policy mismatch.",
    );
    const expected = expectedProfile(config, pins);
    invariant(
      equal(a.source, {
        repoCommit: pins.repoCommit,
        fixtureSha256: pins.fixtureSha256,
      }) &&
        equal(a.profile, expected.profile) &&
        equal(a.runtimePins, expected.runtimePins) &&
        equal(a.limits, expected.limits),
      "Source/profile mismatch.",
    );
    invariant(
      a.configurationSha256 === offlineConfigurationDigest(config) &&
        a.isolationReviewSha256 === config.reviewSha256 &&
        a.agentConfigSha256 === pins.agentConfigSha256 &&
        jsonDigest(a.profile) === pins.agentConfigSha256 &&
        jsonDigest(a.runtimePins) === pins.evaluatorSha256,
      "Source pin mismatch.",
    );
    const plan = PlanSchema.parse(
      await pinned(
        a.acceptanceId,
        "source-context.json",
        selection.sourcePlanSha256,
        true,
      ),
    );
    invariant(
      equal(plan, {
        schemaVersion: "booking-offline-source-plan.v1",
        acceptanceId: a.acceptanceId,
        ...a.source,
        profile: a.profile,
        agentConfigSha256: a.agentConfigSha256,
        cases: a.casePlan,
      }),
      "Source plan mismatch.",
    );
    report.profile = a.profile;
  } catch {
    report.reasons.push("SOURCE_INVALID");
    return { report, store: emptyStore, endedAt: a.endedAt };
  }
  const storeConfig = {
    ...emptyStore,
    entries: new Map(a.entries.map((e) => [e.identity.runId, e])),
  };
  const store = await createProtectedEvaluationStore(storeConfig);
  for (const row of report.cases) {
    if (row.runId === null) continue;
    const ref = a.sourceRecords.find((ref) => ref.runId === row.runId);
    if (!ref) {
      row.reasons.push("SOURCE_REFERENCE_MISSING");
      continue;
    }
    try {
      invariant(ref.directory === ref.runId, "Source directory mismatch.");
      row.run = ExperimentRunV1Schema.parse(
        await pinned(ref.directory, ref.file, ref.sha256, true),
      );
      row.sourceRunSha256 = ref.sha256;
      row.proposedCompleteRunSha256 = jsonDigest(row.run);
    } catch {
      row.reasons.push("ORIGINAL_UNAVAILABLE");
      continue;
    }
    const run = row.run;
    const contextPin = selection.caseContexts.find(
      (pin) => pin.runId === row.runId,
    );
    if (!contextPin) {
      row.disposition = "invalid";
      row.reasons.push("CONTEXT_PIN_MISSING");
      continue;
    }
    let context: z.infer<typeof ContextSchema>;
    try {
      context = ContextSchema.parse(
        await pinned(
          ref.directory,
          "source-context.json",
          contextPin.sha256,
          true,
        ),
      );
    } catch {
      row.disposition = "invalid";
      row.reasons.push("CONTEXT_UNAVAILABLE");
      continue;
    }
    try {
      orderedTime(run.startedAt, run.endedAt);
      invariant(
        run.id === row.runId &&
          run.variant === "A" &&
          run.evidenceOrigin === "none" &&
          run.presentationMode === "recorded" &&
          run.isolationAttestationId === null &&
          run.seed === null &&
          Object.values(run.metrics).every((value) => value === null),
        "Fixed provenance mismatch.",
      );
      invariant(
        equal(context, {
          schemaVersion: "booking-offline-source-context.v1",
          acceptanceId: a.acceptanceId,
          scenario: row.scenario,
          runId: run.id,
          variant: "A",
          repoCommit: pins.repoCommit,
          fixtureSha256: pins.fixtureSha256,
          evaluatedTreeSha256: run.evaluatedTreeSha256,
          evaluatorSha256: pins.evaluatorSha256,
          requiredPolicySha256: pins.requiredPolicySha256,
          testSuiteSha256: pins.testSuiteSha256,
          agentConfigSha256: pins.agentConfigSha256,
          profile: a.profile,
          startedAt: run.startedAt,
        }),
        "Case context mismatch.",
      );
      for (const key of [
        "repoCommit",
        "fixtureSha256",
        "evaluatorSha256",
        "requiredPolicySha256",
        "agentConfigSha256",
      ] as const)
        invariant(run[key] === pins[key], "Run pin mismatch.");
      invariant(
        (row.scenario === "baseline") ===
          (run.evaluatedTreeSha256 === pins.fixtureSha256),
        "Candidate identity mismatch.",
      );
      invariant(
        Date.parse(a.startedAt) <= Date.parse(run.startedAt) &&
          Date.parse(run.endedAt) <= Date.parse(a.endedAt),
        "Suite time mismatch.",
      );
      invariant(
        a.attemptDiagnostics.find((d) => d.runId === run.id)?.status ===
          run.status,
        "Attempt disposition mismatch.",
      );
      if (ref.file === "experiment-run-failed.json")
        invariant(
          a.publicationFailures.includes(run.id),
          "Unreferenced failed disposition.",
        );
    } catch {
      row.disposition = "invalid";
      row.reasons.push("SOURCE_RELATIONSHIP_INVALID");
      continue;
    }
    const entry = a.entries.find((e) => e.identity.runId === run.id);
    const verdict = a.verdicts.find((v) => v.scenario === row.scenario);
    if (
      run.receiptId === null &&
      run.verificationId === null &&
      run.status !== "completed" &&
      !entry &&
      !verdict
    ) {
      row.disposition =
        ref.file === "experiment-run-failed.json" ||
        a.publicationFailures.includes(run.id)
          ? "failed_publication"
          : "unlinked_failure";
      row.reasons.push(
        row.disposition === "failed_publication"
          ? "FAILED_PUBLICATION"
          : "UNLINKED_OPERATIONAL_FAILURE",
      );
      continue;
    }
    try {
      invariant(
        entry &&
          verdict &&
          entry.directory === run.id &&
          run.status === "completed",
        "Incomplete original links.",
      );
      invariant(
        a.observations.some(
          (observation) =>
            observation.runId === run.id &&
            observation.scenario === row.scenario &&
            observation.reason === "completed" &&
            observation.exitCode === 0,
        ),
        "Completion lacks producer observation.",
      );
      const expectedIdentity = {
        runId: run.id,
        evaluatedTreeSha256: run.evaluatedTreeSha256,
        fixtureSha256: pins.fixtureSha256,
        evaluatorSha256: pins.evaluatorSha256,
        testSuiteSha256: pins.testSuiteSha256,
        requiredPolicySha256: pins.requiredPolicySha256,
        requiredCheckIds: pins.requiredCheckIds,
      };
      invariant(
        equal(
          {
            ...entry.identity,
            requiredCheckIds: [...entry.identity.requiredCheckIds].sort(),
          },
          {
            ...expectedIdentity,
            requiredCheckIds: [...pins.requiredCheckIds].sort(),
          },
        ),
        "Evaluation pin mismatch.",
      );
      const bundle = bundleSchema.parse(
        await pinned(run.id, "evaluation.json", entry.bundleSha256),
      );
      unique(
        bundle.checks.map((c) => c.id),
        "check originals",
      );
      for (const check of bundle.checks) {
        invariant(
          requiredChecks.some((id) => id === check.id),
          "Non-fixed check.",
        );
        if (check.evidencePath !== null) {
          invariant(
            check.evidencePath === `checks/${check.id}.json` &&
              check.artifactSha256 !== null,
            "Unsafe original check path.",
          );
          await pinned(run.id, check.evidencePath, check.artifactSha256);
        }
      }
      const evaluation = await store.load(run.id);
      invariant(
        isTrustedEvaluation(evaluation),
        "Original evaluation unavailable.",
      );
      validateReceiptRelationships(
        evaluation.receipt,
        evaluation.verification,
        run,
      );
      invariant(
        Date.parse(run.startedAt) <= Date.parse(evaluation.receipt.startedAt) &&
          Date.parse(evaluation.receipt.finishedAt) <= Date.parse(run.endedAt),
        "Receipt time mismatch.",
      );
      invariant(
        evaluation.verification.verdict === verdict.verdict,
        "Suite verdict mismatch.",
      );
      row.verdict = evaluation.verification.verdict;
      row.disposition = "authenticated_completion";
    } catch {
      row.disposition = "invalid";
      row.reasons.push("EVALUATION_UNAVAILABLE");
    }
  }
  // Detect replacement/mutation across the complete bounded intake, not only
  // during an individual read. No prior successful snapshot is cached.
  try {
    for (const read of reads)
      invariant(
        sha256(await readPrivateReviewInput(read.file, true)) === read.digest,
        "Original changed during intake.",
      );
  } catch {
    for (const row of report.cases) {
      row.verdict = null;
      if (row.runId) row.disposition = "invalid";
    }
    report.reasons.push("SOURCE_INVALID");
    return { report, store: storeConfig, endedAt: a.endedAt };
  }
  report.sourceState = report.cases.every(
    (row) => row.disposition === "authenticated_completion",
  )
    ? "validated"
    : "incomplete";
  return { report, store: storeConfig, endedAt: a.endedAt };
}
export async function reviewOfflineEvidence(
  configInput: unknown,
  requestInput: unknown,
  disclosureInput?: unknown,
): Promise<Review> {
  const config = OfflineConfigSchema.parse(configInput);
  const selection = SelectionSchema.parse(requestInput);
  const first = await intake(config, selection);
  const report = first.report;
  if (disclosureInput === undefined) return report;
  report.disclosure = "invalid";
  try {
    const disclosure = DisclosureSchema.parse(disclosureInput);
    invariant(
      disclosure.sourceSetSha256 === report.sourceSetSha256,
      "Disclosure source set mismatch.",
    );
    invariant(
      report.sourceState === "validated" && first.endedAt !== null,
      "Full suite unavailable.",
    );
    unique(
      disclosure.sources.map((source) => source.runId),
      "disclosure sources",
    );
    invariant(
      sameIds(
        disclosure.sources.map((source) => source.runId),
        report.cases.map((row) => row.runId!),
      ),
      "Complete source disclosure required.",
    );
    invariant(
      disclosure.certificate.baselineCommit === selection.pins?.repoCommit &&
        Date.parse(disclosure.certificate.generatedAt) >=
          Date.parse(first.endedAt),
      "Certificate source/time mismatch.",
    );
    const sources: CertificateRegistration["sources"][number][] = [];
    for (const approved of disclosure.sources) {
      const row = report.cases.find((row) => row.runId === approved.runId)!;
      invariant(
        row.run &&
          approved.sourceRunSha256 === row.sourceRunSha256 &&
          approved.publicRunSha256 === row.proposedCompleteRunSha256,
        "Complete run disclosure mismatch.",
      );
      const metadata = approved.metadata;
      invariant(
        metadata.category === "infrastructure_acceptance" &&
          metadata.evaluationId === row.runId &&
          metadata.runId === row.runId &&
          metadata.receiptId === row.run.receiptId &&
          metadata.verificationId === row.run.verificationId,
        "Disclosure identity mismatch.",
      );
      sources.push({
        recording: { metadata, run: row.run },
        publicRunSha256: approved.publicRunSha256,
      });
    }
    // Only explicit supplied disclosure can construct an operative registration.
    const catalog = await loadRecordedCertificates({
      certificates: [{ approval: disclosure.certificate, sources }],
      store: first.store,
    });
    try {
      const last = await intake(config, selection);
      report.sourceState = last.report.sourceState;
      report.cases = last.report.cases;
      report.reasons.push(...last.report.reasons);
    } catch {
      report.sourceState = "invalid";
      report.reasons.push("SOURCE_INVALID");
      for (const row of report.cases) {
        row.verdict = null;
        if (row.runId) row.disposition = "invalid";
      }
    }
    invariant(
      report.sourceState === "validated",
      "Source changed during disclosure.",
    );
    const certificate = catalog.demo.certificates[0];
    invariant(
      catalog.reports.length === 1 &&
        catalog.demo.runs.length === 4 &&
        certificate,
      "Candidate unavailable.",
    );
    const exported = selectCertificateExport(
      catalog.demo,
      certificate.id,
      certificate.artifactSha256,
    );
    report.disclosure = "validated";
    report.candidate = { demo: catalog.demo, certificateExport: exported };
  } catch {
    report.disclosure =
      report.sourceState === "validated" ? "invalid" : "unavailable";
    report.reasons.push(
      report.sourceState === "validated"
        ? "DISCLOSURE_INVALID"
        : "FULL_SUITE_UNAVAILABLE",
    );
  }
  return report;
}

export async function writePrivateReview(
  output: string,
  report: Review,
  configInput: unknown,
) {
  const config = OfflineConfigSchema.parse(configInput);
  invariant(path.isAbsolute(output), "Absolute output required.");
  const parent = await privateDirectory(path.dirname(output));
  invariant(
    path.join(parent, path.basename(output)) === output,
    "Output alias refused.",
  );
  for (const root of [
    config.protectedRoot,
    config.scratchRoot,
    config.coordinationRoot,
    project,
  ]) {
    if (root !== project) await privateDirectory(root);
    disjoint(output, root);
  }
  await mkdir(output, { mode: 0o700 }); // EEXIST, including symlinks, never overwritten.
  const custody = await lstat(output);
  async function publish(
    name: "review.json" | "candidate-demo.json" | "candidate-certificate.json",
    value: string,
  ) {
    invariant(
      Buffer.byteLength(value) <= 1_048_576,
      "Review output exceeds bound.",
    );
    async function checkCustody() {
      await privateDirectory(parent);
      await privateDirectory(output);
      const now = await lstat(output);
      invariant(
        now.ino === custody.ino && now.dev === custody.dev,
        "Output custody changed.",
      );
    }
    await checkCustody();
    const staging = path.join(output, `.${name}.pending`);
    const handle = await open(
      staging,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o400,
    );
    try {
      await handle.writeFile(value);
      await handle.sync();
    } finally {
      await handle.close();
    }
    invariant(
      (await readPrivateReviewInput(staging, true)).toString() === value,
      "Output bytes changed.",
    );
    await checkCustody();
    await link(staging, path.join(output, name));
    await unlink(staging);
  }
  if (report.candidate) {
    await publish("candidate-demo.json", canonicalJson(report.candidate.demo));
    await publish(
      "candidate-certificate.json",
      report.candidate.certificateExport.json,
    );
  }
  // Final report is the completion marker. A failed/interrupted earlier write
  // leaves private partial files, never a completed-success report.
  await publish("review.json", canonicalJson(report));
}
export function reviewConsoleSummary(report: Review) {
  return {
    sourceState: report.sourceState,
    disclosure: report.disclosure,
    publication: report.publication,
    runtimeAdmission: report.runtimeAdmission,
    declaredCases: report.declaredCaseCount,
    attemptedCases: report.cases.filter((row) => row.runId !== null).length,
    authenticatedCases: report.cases.filter(
      (row) => row.disposition === "authenticated_completion",
    ).length,
    candidatePrepared: report.candidate !== null,
  };
}
