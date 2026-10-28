// Private, fixed-producer review formats. These are not public v1 contracts.
import { z } from "zod";
import {
  GitCommitSchema,
  Sha256Schema,
  UtcTimestampSchema,
  VerdictSchema,
  IdSchema,
} from "../../../src/lib/contracts/common";
import { EvaluationIdentitySchema } from "../../../src/server/artifacts/evaluation-store";
import { RecordingMetadataSchema } from "../../../src/server/artifacts/recorded-verification";

export const cases = [
  "baseline",
  "distinct-final",
  "ownership-regression",
  "forged-success",
] as const;
export const requiredChecks = [
  "typecheck",
  "build",
  "baseline-domain",
  "http-integration",
  "boundary",
] as const;
export const uuid = z
  .string()
  .regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const scenario = z.enum(cases);
const status = z.enum([
  "completed",
  "failed",
  "cancelled",
  "timed_out",
  "blocked",
]);
const source = z.strictObject({
  repoCommit: GitCommitSchema,
  fixtureSha256: Sha256Schema,
});
export const SelectionSchema = z.strictObject({
  schemaVersion: z.literal("offline-evidence-selection.v1"),
  acceptanceId: uuid,
  acceptanceSha256: Sha256Schema,
  sourcePlanSha256: Sha256Schema.nullable(),
  caseContexts: z
    .array(z.strictObject({ runId: uuid, sha256: Sha256Schema }))
    .max(4),
  pins: z
    .strictObject({
      ...source.shape,
      implementationSha256: Sha256Schema,
      evaluatorSha256: Sha256Schema,
      testSuiteSha256: Sha256Schema,
      requiredPolicySha256: Sha256Schema,
      requiredCheckIds: z.array(z.enum(requiredChecks)).length(5),
      agentConfigSha256: Sha256Schema,
    })
    .nullable(),
});
export type Selection = z.infer<typeof SelectionSchema>;
export const EntrySchema = z.strictObject({
  directory: uuid,
  bundleSha256: Sha256Schema,
  identity: EvaluationIdentitySchema,
});
export const AcceptanceSchema = z.strictObject({
  schemaVersion: z.literal("booking-offline-acceptance.v1"),
  acceptanceId: uuid,
  scope: z.literal("fixed-booking-grader-acceptance-no-inference"),
  adapter: z.enum(["synthetic-development", "sbx-offline"]),
  mode: z.enum(["booking-and-lifecycle", "lifecycle-only"]),
  status: z.enum(["completed", "failed"]),
  startedAt: UtcTimestampSchema,
  endedAt: UtcTimestampSchema,
  source: source.nullable(),
  profile: z.unknown(),
  runtimePins: z.unknown(),
  limits: z.unknown(),
  agentConfigSha256: Sha256Schema,
  casePlan: z
    .array(z.strictObject({ scenario, variant: z.literal("A") }))
    .max(4),
  sourceRecords: z
    .array(
      z.strictObject({
        runId: uuid,
        directory: uuid,
        file: z.enum(["experiment-run.json", "experiment-run-failed.json"]),
        sha256: Sha256Schema,
      }),
    )
    .max(4),
  publicationFailures: z.array(uuid).max(4),
  attemptDiagnostics: z
    .array(z.strictObject({ scenario, runId: uuid, status }))
    .max(4),
  entries: z.array(EntrySchema).max(4),
  verdicts: z
    .array(z.strictObject({ scenario, verdict: VerdictSchema }))
    .max(4),
  configurationSha256: Sha256Schema,
  isolationReviewSha256: Sha256Schema,
  lifecycleRequest: z.unknown(),
  lifecycle: z.unknown(),
  inventory: z.unknown(),
  adapterObservations: z.array(z.unknown()).max(100),
  observations: z.array(z.record(z.string(), z.unknown())).max(5),
  cleanup: z.unknown(),
  failure: z.string().max(1000).nullable(),
  realAgentExecution: z.literal("NOT_RUN"),
  inference: z.literal("NOT_RUN"),
  metrics: z.strictObject({
    tokens: z.null(),
    costUsd: z.null(),
    iterations: z.null(),
  }),
  limitations: z.array(z.string().max(1000)).max(16),
});
export const PlanSchema = z.strictObject({
  schemaVersion: z.literal("booking-offline-source-plan.v1"),
  acceptanceId: uuid,
  ...source.shape,
  profile: z.unknown(),
  agentConfigSha256: Sha256Schema,
  cases: z
    .array(z.strictObject({ scenario, variant: z.literal("A") }))
    .length(4),
});
export const ContextSchema = z.strictObject({
  schemaVersion: z.literal("booking-offline-source-context.v1"),
  acceptanceId: uuid,
  scenario,
  runId: uuid,
  variant: z.literal("A"),
  ...source.shape,
  evaluatedTreeSha256: Sha256Schema,
  evaluatorSha256: Sha256Schema,
  requiredPolicySha256: Sha256Schema,
  testSuiteSha256: Sha256Schema,
  agentConfigSha256: Sha256Schema,
  profile: z.unknown(),
  startedAt: UtcTimestampSchema,
});
const publicText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((s) => s.trim() === s && !/[\u0000-\u001f\u007f]/u.test(s));
export const DisclosureSchema = z.strictObject({
  schemaVersion: z.literal("offline-evidence-disclosure.v1"),
  sourceSetSha256: Sha256Schema,
  certificate: z.strictObject({
    id: IdSchema,
    title: publicText(120),
    scope: publicText(500),
    baselineCommit: GitCommitSchema,
    generatedAt: UtcTimestampSchema,
    evidenceOrigin: z.literal("none"),
    limitations: z.array(publicText(500)).max(32),
  }),
  sources: z
    .array(
      z.strictObject({
        runId: uuid,
        sourceRunSha256: Sha256Schema,
        publicRunSha256: Sha256Schema,
        metadata: RecordingMetadataSchema,
      }),
    )
    .length(4),
});
export type Disclosure = z.infer<typeof DisclosureSchema>;
