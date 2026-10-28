import "server-only";
import { z } from "zod";
import {
  GitCommitSchema,
  IdSchema,
  Sha256Schema,
  UtcTimestampSchema,
} from "@/lib/contracts/common";
import { DemoResponseSchema } from "@/lib/contracts/api";
import {
  ExperimentRunV1Schema,
  type ExperimentRunV1,
} from "@/lib/contracts/evidence";
import { invariant, unique } from "@/lib/contracts/validation";
import { assembleCertificate } from "@/lib/report/certificate";
import { jsonDigest } from "@/lib/report/digests";
import {
  createProtectedEvaluationStore,
  isTrustedEvaluation,
} from "./evaluation-store";
import {
  projectRecordedVerification,
  RecordingMetadataSchema,
  type RecordingRegistration,
  type RecordedVerification,
} from "./recorded-verification";

const publicText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((s) => s.trim() === s && !/[\u0000-\u001f\u007f]/u.test(s));
const ApprovalSchema = z.strictObject({
  id: IdSchema,
  title: publicText(120),
  scope: publicText(500),
  baselineCommit: GitCommitSchema,
  generatedAt: UtcTimestampSchema,
  evidenceOrigin: z.enum(["none", "measured"]),
  limitations: z.array(publicText(500)).max(32),
});
export type CertificateRegistration = {
  approval: z.infer<typeof ApprovalSchema>;
  sources: readonly {
    recording: RecordingRegistration;
    publicRunSha256: string;
  }[];
};
const RegistrationSchema = z.strictObject({
  approval: ApprovalSchema,
  sources: z
    .array(
      z.strictObject({
        recording: z.strictObject({
          metadata: RecordingMetadataSchema,
          run: ExperimentRunV1Schema.nullable(),
        }),
        publicRunSha256: Sha256Schema,
      }),
    )
    .min(1)
    .max(40),
});
function validateRegistration(input: CertificateRegistration) {
  const registration = RegistrationSchema.parse(input);
  for (const field of [
    "id",
    "evaluationId",
    "runId",
    "receiptId",
    "verificationId",
  ] as const)
    unique(
      registration.sources.map((source) => source.recording.metadata[field]),
      `certificate source ${field}`,
    );
  return registration;
}
type StoreConfiguration = Parameters<typeof createProtectedEvaluationStore>[0];
const limits = [
  "Only the referenced pinned protected checks are assessed; run completion is separate from check acceptance.",
  "No historical intent, scenario, decision, task or matched A/B pairing is bound by this certificate.",
  "Protected checks do not establish experiment fairness, measured architecture benefit, Meta incremental advantage or sandbox containment.",
  "The certificate hash identifies bytes; it is not a signature or proof of independent evaluator custody.",
  "This historical snapshot cannot independently re-verify private evidence and is separate from current browser intents and worksheet state.",
];

// Enumerate every frozen public run field. The digest approval covers the entire
// original record, including limitations/IDs; no field is redacted or invented.
function publicRun(
  input: ExperimentRunV1,
  approvedDigest: string,
): ExperimentRunV1 {
  const r = ExperimentRunV1Schema.parse(input);
  invariant(
    jsonDigest(r) === Sha256Schema.parse(approvedDigest),
    "Complete public run approval required.",
  );
  return {
    schemaVersion: r.schemaVersion,
    id: r.id,
    variant: r.variant,
    status: r.status,
    repoCommit: r.repoCommit,
    evaluatedTreeSha256: r.evaluatedTreeSha256,
    fixtureSha256: r.fixtureSha256,
    agentConfigSha256: r.agentConfigSha256,
    evaluatorSha256: r.evaluatorSha256,
    requiredPolicySha256: r.requiredPolicySha256,
    isolationAttestationId: r.isolationAttestationId,
    seed: r.seed,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    verificationId: r.verificationId,
    receiptId: r.receiptId,
    metrics: {
      elapsedMs: r.metrics.elapsedMs,
      tokens: r.metrics.tokens,
      costUsd: r.metrics.costUsd,
      iterations: r.metrics.iterations,
      filesTouched: r.metrics.filesTouched,
    },
    evidenceOrigin: r.evidenceOrigin,
    presentationMode: r.presentationMode,
    limitations: [...r.limitations],
  };
}

export function composeRecordedCertificate(
  registration: CertificateRegistration,
  evaluations: readonly unknown[],
) {
  // Check original object identities before any parsing, copying or projection.
  invariant(
    evaluations.length > 0 && evaluations.every(isTrustedEvaluation),
    "Authenticated evaluations required.",
  );
  registration = validateRegistration(registration);
  const approval = ApprovalSchema.parse(registration.approval);
  invariant(
    registration.sources.length === evaluations.length &&
      evaluations.length <= 40,
    "Certificate source count mismatch.",
  );
  const runs: ExperimentRunV1[] = [];
  const recordings: RecordedVerification[] = [];
  for (const [index, source] of registration.sources.entries()) {
    const evaluation = evaluations[index]!;
    invariant(
      isTrustedEvaluation(evaluation),
      "Authenticated evaluations required.",
    );
    invariant(source.recording.run !== null, "Genuine run record required.");
    const run = publicRun(source.recording.run, source.publicRunSha256);
    const view = projectRecordedVerification(evaluation, source.recording);
    invariant(
      run.repoCommit === approval.baselineCommit,
      "Approved baseline mismatch.",
    );
    invariant(
      Date.parse(run.startedAt) <= Date.parse(evaluation.receipt.startedAt) &&
        Date.parse(evaluation.receipt.finishedAt) <= Date.parse(run.endedAt),
      "Run/receipt time mismatch.",
    );
    invariant(
      approval.evidenceOrigin === "none" ||
        (run.evidenceOrigin === "measured" &&
          view.category !== "infrastructure_acceptance"),
      "Unsupported measured provenance.",
    );
    runs.push(run);
    recordings.push(view);
  }
  const counts = { VERIFIED: 0, REJECTED: 0, INSUFFICIENT_EVIDENCE: 0 };
  for (const view of recordings) counts[view.verdict]++;
  const { certificate } = assembleCertificate(
    {
      schemaVersion: "certificate.v1",
      id: approval.id,
      baselineCommit: approval.baselineCommit,
      intentRevisions: [],
      scenarioIds: [],
      decisionId: null,
      experimentRunIds: runs.map((r) => r.id),
      verificationIds: recordings.map((r) => r.verificationId),
      receiptIds: recordings.map((r) => r.receiptId),
      conclusion: `Scoped protected check acceptance: ${counts.VERIFIED} VERIFIED, ${counts.REJECTED} REJECTED, ${counts.INSUFFICIENT_EVIDENCE} INSUFFICIENT_EVIDENCE. These outcomes do not establish architecture benefit.`,
      limitations: [approval.scope, ...approval.limitations, ...limits],
      generatedAt: approval.generatedAt,
      evidenceOrigin: approval.evidenceOrigin,
      presentationMode: "recorded",
    },
    {
      intents: [],
      scenarios: [],
      decision: null,
      runs,
      receipts: evaluations.map((e) => {
        invariant(
          isTrustedEvaluation(e),
          "Authenticated evaluations required.",
        );
        return e.receipt;
      }),
      verifications: evaluations.map((e) => {
        invariant(
          isTrustedEvaluation(e),
          "Authenticated evaluations required.",
        );
        return e.verification;
      }),
    },
  );
  return {
    certificate,
    runs,
    recordings,
    title: approval.title,
    scope: approval.scope,
  };
}

export type CertificateReport = ReturnType<typeof composeRecordedCertificate>;
export type CertificateCatalog = {
  reports: CertificateReport[];
  demo: z.infer<typeof DemoResponseSchema>;
};
const empty = (): CertificateCatalog => ({
  reports: [],
  demo: {
    schemaVersion: "demo.v1",
    runs: [],
    certificates: [],
    mode: "recorded",
  },
});

// No trusted-result cache. Every page/API request reconstructs the sole loader
// and reads original bundle/evidence bytes and identity pins again.
export async function loadRecordedCertificates(config: {
  certificates: readonly CertificateRegistration[];
  store: StoreConfiguration | null;
}): Promise<CertificateCatalog> {
  if (config.certificates.length === 0) return empty();
  try {
    invariant(
      config.certificates.length <= 20,
      "Certificate catalog exceeds bounds.",
    );
    const registrations = config.certificates.map((r) =>
      validateRegistration(r),
    );
    unique(
      registrations.map((r) => r.approval.id),
      "certificate IDs",
    );
    const store =
      config.store === null
        ? null
        : await createProtectedEvaluationStore(config.store);
    const reports: CertificateReport[] = [];
    const runs = new Map<string, ExperimentRunV1>();
    for (const registration of registrations.sort((a, b) =>
      a.approval.id < b.approval.id ? -1 : 1,
    )) {
      try {
        invariant(
          registration.sources.length > 0 && registration.sources.length <= 40,
          "Genuine source records required.",
        );
        const evaluations = [];
        for (const source of registration.sources)
          evaluations.push(
            await store?.load(source.recording.metadata.evaluationId),
          );
        const report = composeRecordedCertificate(registration, evaluations);
        for (const run of report.runs)
          invariant(
            !runs.has(run.id) ||
              jsonDigest(runs.get(run.id)) === jsonDigest(run),
            "Conflicting public run.",
          );
        invariant(
          new Set([...runs.keys(), ...report.runs.map((r) => r.id)]).size <= 40,
          "Demo run bound exceeded.",
        );
        for (const run of report.runs) runs.set(run.id, run);
        reports.push(report);
      } catch {
        /* Missing/unsafe sources have no certificate or trusted fallback. */
      }
    }
    return {
      reports,
      demo: DemoResponseSchema.parse({
        schemaVersion: "demo.v1",
        runs: [...runs.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
        certificates: reports.map((r) => r.certificate),
        mode: "recorded",
      }),
    };
  } catch {
    return empty();
  }
}
