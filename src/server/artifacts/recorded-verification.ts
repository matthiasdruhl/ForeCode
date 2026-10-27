import "server-only";
import { z } from "zod";
import { IdSchema } from "@/lib/contracts/common";
import { ExperimentRunV1Schema } from "@/lib/contracts/evidence";
import {
  invariant,
  sameIds,
  unique,
  validateReceiptRelationships,
} from "@/lib/contracts/validation";
import {
  createProtectedEvaluationStore,
  isTrustedEvaluation,
} from "./evaluation-store";

const publicText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value),
    );
const identityNames = [
  "evaluatedTreeSha256",
  "fixtureSha256",
  "evaluatorSha256",
  "testSuiteSha256",
  "requiredPolicySha256",
  "checkArtifactSha256",
  "manifestSha256",
] as const;
const metricNames = [
  "elapsedMs",
  "tokens",
  "costUsd",
  "iterations",
  "filesTouched",
] as const;

// Approval is a separate operator review of these exact public fields. Parsing
// enforces bounds and references; it cannot decide whether text is publishable.
export const RecordingMetadataSchema = z.strictObject({
  id: IdSchema,
  evaluationId: IdSchema,
  runId: IdSchema,
  receiptId: IdSchema,
  verificationId: IdSchema,
  title: publicText(120),
  scope: publicText(500),
  category: z.enum(["infrastructure_acceptance", "recorded_checks"]),
  checks: z
    .array(
      z.strictObject({
        id: IdSchema,
        label: publicText(120),
        description: publicText(300),
        publishArtifactDigest: z.boolean(),
      }),
    )
    .min(1)
    .max(100),
  publicIdentities: z.array(z.enum(identityNames)).max(identityNames.length),
  publicMetrics: z.array(z.enum(metricNames)).max(metricNames.length),
  limitations: z.array(publicText(500)).max(16),
});
export type RecordingMetadata = z.infer<typeof RecordingMetadataSchema>;
const RegistrationSchema = z.strictObject({
  metadata: RecordingMetadataSchema,
  run: ExperimentRunV1Schema.nullable(),
});
export type RecordingRegistration = z.infer<typeof RegistrationSchema>;
type StoreConfiguration = Parameters<typeof createProtectedEvaluationStore>[0];

export function projectRecordedVerification(
  input: unknown,
  registrationInput: RecordingRegistration,
) {
  // Never replace this with structural parsing, a brand cast or a digest check.
  invariant(isTrustedEvaluation(input), "Authenticated evaluation required.");
  const { metadata, run } = RegistrationSchema.parse(registrationInput);
  unique(
    metadata.checks.map((check) => check.id),
    "public check IDs",
  );
  unique(metadata.publicIdentities, "public identities");
  unique(metadata.publicMetrics, "public metrics");
  const { receipt, checks, verification } = input;
  invariant(
    receipt.runId === metadata.runId &&
      receipt.id === metadata.receiptId &&
      verification.id === metadata.verificationId,
    "Recording identity mismatch.",
  );
  // Require public representation of every observed and required check. This
  // fails closed instead of concealing a failure or a missing required result.
  invariant(
    sameIds(
      metadata.checks.map((check) => check.id),
      [
        ...new Set([
          ...receipt.requiredCheckIds,
          ...checks.map((check) => check.id),
        ]),
      ],
    ),
    "Incomplete public check approval.",
  );
  if (run !== null) {
    validateReceiptRelationships(receipt, verification, run);
    invariant(
      run.presentationMode === "recorded",
      "Recording must be historical.",
    );
  }
  return {
    state: "available" as const,
    id: metadata.id,
    title: metadata.title,
    presentation: "recorded" as const,
    category: metadata.category,
    scope: metadata.scope,
    runId: receipt.runId,
    receiptId: receipt.id,
    verificationId: verification.id,
    runStatus: run?.status ?? null,
    verdict: verification.verdict,
    checks: [...metadata.checks]
      .sort((a, b) => compare(a.id, b.id))
      .map((approved) => {
        const check = checks.find((item) => item.id === approved.id);
        return {
          id: approved.id,
          label: approved.label,
          description: approved.description,
          required: receipt.requiredCheckIds.includes(approved.id),
          status: check?.status ?? ("missing" as const),
          artifactSha256: approved.publishArtifactDigest
            ? (check?.artifactSha256 ?? null)
            : null,
        };
      }),
    identities: [...metadata.publicIdentities].sort().map((name) => ({
      name,
      sha256:
        name === "manifestSha256"
          ? receipt.integrity.manifestSha256
          : receipt[name],
    })),
    metrics: metricNames.map((name) => ({
      name,
      value: metadata.publicMetrics.includes(name)
        ? (run?.metrics[name] ?? null)
        : null,
    })),
    limitations: [...metadata.limitations],
  };
}
export type RecordedVerification = ReturnType<
  typeof projectRecordedVerification
>;
export type RecordingView =
  | RecordedVerification
  | {
      state: "unavailable";
      id: string;
      title: string;
    };
export type RecordedCatalogView = {
  state: "empty" | "unavailable" | "configured";
  recordings: RecordingView[];
};
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// Code-owned composition only: no request parameters, discovery, uploads, env
// framework or execution. Recreate/reload on every serving request, no cache.
export async function loadRecordedVerifications(config: {
  recordings: readonly RecordingRegistration[];
  store: StoreConfiguration | null;
}): Promise<RecordedCatalogView> {
  if (config.recordings.length === 0) return { state: "empty", recordings: [] };
  try {
    const recordings = z
      .array(RegistrationSchema)
      .max(40)
      .parse(config.recordings);
    for (const field of [
      "id",
      "evaluationId",
      "runId",
      "receiptId",
      "verificationId",
    ] as const)
      unique(
        recordings.map((item) => item.metadata[field]),
        `recording ${field}`,
      );
    // Validate all public approvals before acquiring even read-only custody.
    for (const { metadata } of recordings) {
      unique(
        metadata.checks.map((check) => check.id),
        "public check IDs",
      );
      unique(metadata.publicIdentities, "public identities");
      unique(metadata.publicMetrics, "public metrics");
    }
    const store =
      config.store === null
        ? null
        : await createProtectedEvaluationStore(config.store);
    const views: RecordingView[] = [];
    for (const registration of recordings.sort((a, b) =>
      compare(a.metadata.id, b.metadata.id),
    )) {
      const unavailable = {
        state: "unavailable" as const,
        id: registration.metadata.id,
        title: registration.metadata.title,
      };
      try {
        const evaluation = await store?.load(
          registration.metadata.evaluationId,
        );
        views.push(
          evaluation
            ? projectRecordedVerification(evaluation, registration)
            : unavailable,
        );
      } catch {
        views.push(unavailable);
      }
    }
    return { state: "configured", recordings: views };
  } catch {
    // No raw configuration, paths, diagnostics or unvalidated metadata escapes.
    return { state: "unavailable", recordings: [] };
  }
}
