import "server-only";
import { z } from "zod";
import { Sha256Schema } from "@/lib/contracts/common";
import { OpaqueIdSchema } from "@/lib/foresight/interpretation/contracts";
import {
  requestSchemas,
  validateApprovedInput,
  toResearchContext,
} from "@/lib/foresight/flow";
import { validateHypothesis } from "@/lib/contracts/validation";
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
  validateHypothesis(issued.hypothesis, toResearchContext(c));
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
