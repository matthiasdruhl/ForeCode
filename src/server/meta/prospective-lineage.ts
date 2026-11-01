import "server-only";
import { z } from "zod";
import { Sha256Schema } from "@/lib/contracts/common";
import { OpaqueIdSchema } from "@/lib/foresight/interpretation/contracts";
import {
  requestSchemas,
  validateApprovedInput,
  toResearchContext,
  validateSliceHypothesis,
} from "@/lib/foresight/flow";
import { ScientistPredictionV1Schema } from "@/lib/contracts/scientist";
import { DecisionReportAnalysisSchema } from "@/lib/report/decision-report";
import { META_LIMITS } from "@/lib/foresight/prompts";
import { digest } from "./transport";
import type { IssuedHypothesis } from "./evidence";

// Safe contract for a FUTURE authenticated server-owned resolver. Parsing this
// record does not authenticate its chronology, authorization or revocation.
// The existing publication authority has no such registration original today.
export const ProspectiveRegistrationSchema = z.strictObject({
  schemaVersion: z.literal("scientist-prospective-registration.v1"),
  id: OpaqueIdSchema,
  hypothesisId: OpaqueIdSchema,
  hypothesisSha256: Sha256Schema,
  issuedAt: z.number().int().nonnegative(),
  registeredAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  context: requestSchemas.hypothesize,
  // Preparation's final commitment/outcomes cannot exist prospectively.
  study: DecisionReportAnalysisSchema.shape.identity.unwrap().omit({
    preparedOriginalSha256: true,
    comparability: true,
    correctness: true,
  }),
});
export type ProspectiveRegistration = z.infer<
  typeof ProspectiveRegistrationSchema
>;
export function validateProspectiveRegistration(
  raw: unknown,
  issued: IssuedHypothesis,
  now: number,
) {
  const r = ProspectiveRegistrationSchema.parse(raw),
    c = r.context;
  validateApprovedInput(c);
  validateSliceHypothesis(issued.hypothesis, toResearchContext(c));
  if (
    r.hypothesisId !== issued.hypothesis.id ||
    r.hypothesisSha256 !== digest(issued.hypothesis) ||
    r.issuedAt !== issued.issuedAt ||
    r.registeredAt < r.issuedAt ||
    r.registeredAt > now ||
    r.expiresAt <= now ||
    r.expiresAt > r.issuedAt + META_LIMITS.artifactTtlMs ||
    issued.contextSha256 !==
      digest({
        intents: c.intents,
        graph: c.graph,
        candidates: c.candidates,
        visibleScenarios: c.visibleScenarios,
        goal: c.goal,
      })
  )
    throw new Error("Invalid prospective binding");
  return r;
}

// Local, additive originals. None of these parsers confer authority.
export const ScientistCommitmentSchema = z.strictObject({
  schemaVersion: z.literal("scientist-initial-commitment.local.v1"),
  study: ProspectiveRegistrationSchema.shape.study,
  preselection: requestSchemas.propose,
  prediction: ScientistPredictionV1Schema.pick({
    metric: true,
    direction: true,
    comparison: true,
  }),
  studyProtocolSha256: Sha256Schema,
  matchedConditionsSha256: Sha256Schema,
  // Candidate-neutral measurement rules only. Issued UUID/context are bound by
  // the later append-only supplement, without changing this original.
  measurementPlan: z.record(z.string(), z.unknown()),
  sourceManifest: z
    .array(
      z.strictObject({
        path: z.string().min(1).max(512),
        sha256: Sha256Schema,
      }),
    )
    .min(1)
    .max(10000),
});
export const RegistrationLineageSchema = z.strictObject({
  studyId: z.string().min(1).max(128),
  hypothesisId: OpaqueIdSchema,
  contextSha256: Sha256Schema,
  protocolSha256: Sha256Schema,
  taskSha256: Sha256Schema,
  matchedConditionsSha256: Sha256Schema,
  evaluatorSha256: Sha256Schema,
  suiteSha256: Sha256Schema,
  policySha256: Sha256Schema,
  studyProtocolSha256: Sha256Schema,
  sourceTreeSha256: Sha256Schema,
  sourceManifestSha256: Sha256Schema,
  variants: z.tuple([
    z.strictObject({
      variant: z.literal("A"),
      candidateId: z.string().min(1).max(128),
      runId: z.string().uuid(),
    }),
    z.strictObject({
      variant: z.literal("B"),
      candidateId: z.string().min(1).max(128),
      runId: z.string().uuid(),
    }),
  ]),
});
export type RegistrationLineage = z.infer<typeof RegistrationLineageSchema>;

export const EvidenceLinkSchema = z.strictObject({
  evidenceSummaryId: OpaqueIdSchema,
  prospectiveRegistrationId: OpaqueIdSchema,
  hypothesisId: OpaqueIdSchema,
  hypothesisSha256: Sha256Schema,
  contextSha256: Sha256Schema,
  // Pins *all* study/task/protocol/evaluator identities and both source trees,
  // run/receipt IDs, check results, and metrics via the exact public projection.
  projectionSha256: Sha256Schema,
  studyId: z.string().min(1).max(128),
  taskId: z.string().min(1).max(128),
  baselineCommit: z.string().regex(/^[a-f0-9]{40}$/),
  candidateId: z.string().min(1).max(128),
  publicationApprovedAt: z.number().int().nonnegative(),
  registeredAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
});
export type EvidenceLink = z.infer<typeof EvidenceLinkSchema>;
