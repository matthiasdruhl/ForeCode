import "server-only";
import { z } from "zod";
import { Sha256Schema } from "@/lib/contracts/common";
import { MetaHypothesisV1Schema } from "@/lib/contracts/scientist";
import { invariant } from "@/lib/contracts/validation";
import { matchedConditionsDigest } from "@/lib/experiment/study-identities";
import {
  MetricProtocolSchema,
  type MetricProtocol,
} from "@/lib/experiment/prospective-metrics";
import {
  validateFutureTask,
  futureTaskDigest,
} from "@/lib/experiment/future-task";
import {
  createProtectedScientistCustodyStore,
  type ScientistCustodyConfig,
} from "@/server/artifacts/evaluation-store";
import { digest } from "./transport";
import {
  ProspectiveRegistrationSchema,
  ScientistCommitmentSchema,
  RegistrationLineageSchema,
  validateProspectiveRegistration,
} from "./prospective-lineage";
import type { IssuedHypothesis } from "./evidence";

export const ScientistBindingSchema = z.strictObject({
  schemaVersion: z.literal("scientist-issued-binding.local.v1"),
  commitmentOriginalSha256: Sha256Schema,
  hypothesis: MetaHypothesisV1Schema,
  registration: ProspectiveRegistrationSchema,
  lineage: RegistrationLineageSchema,
});
export type AuthenticatedRegistration = Readonly<
  z.infer<typeof ScientistBindingSchema> & {
    metricProtocol: MetricProtocol;
    commitmentId: string;
    bindingOriginalSha256: string;
    commitmentSubjectSha256: string;
  }
>;
const authenticated = new WeakSet<object>();
export const isAuthenticatedRegistration = (
  value: unknown,
): value is AuthenticatedRegistration =>
  !!value && typeof value === "object" && authenticated.has(value);
export type RegistrationConfig = {
  custody: ScientistCustodyConfig;
  registrations: readonly {
    id: string;
    studyId: string;
    hypothesisId: string;
    protocolId: string;
    commitmentId: string;
    bindingId: string;
  }[];
};
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
// No cache, discovery, client clock, signing key or runtime registration setter.
// The issuance argument comes only from the service's current process-local map.
export function createScientistRegistrationReader(
  input: RegistrationConfig | null,
  now = Date.now,
) {
  const config =
    input === null
      ? null
      : {
          custody: {
            ...input.custody,
            workspaceRoots: [...input.custody.workspaceRoots],
            entries: new Map(
              [...input.custody.entries].map(([id, e]) => [id, { ...e }]),
            ),
          },
          registrations: input.registrations.map((e) => ({ ...e })),
        };
  return Object.freeze({
    async resolveRegistration(
      id: string,
      issued: IssuedHypothesis,
    ): Promise<AuthenticatedRegistration | null> {
      try {
        if (!config) return null;
        invariant(
          config.registrations.length <= 20,
          "Excessive registrations.",
        );
        for (const key of [
          "id",
          "studyId",
          "hypothesisId",
          "protocolId",
          "commitmentId",
          "bindingId",
        ] as const)
          invariant(
            new Set(config.registrations.map((e) => e[key])).size ===
              config.registrations.length,
            "Reassigned or replayed study binding.",
          );
        const e = config.registrations.find((e) => e.id === id);
        if (!e || e.hypothesisId !== issued.hypothesis.id) return null;
        const store = await createProtectedScientistCustodyStore(
          config.custody,
        );
        const protocol = await store.load(e.protocolId),
          commitment = await store.load(e.commitmentId),
          binding = await store.load(e.bindingId);
        invariant(
          protocol && commitment && binding,
          "Missing independent originals.",
        );
        const at = now();
        for (const original of [protocol, commitment, binding])
          invariant(
            original.record.studyId === e.studyId &&
              Date.parse(original.record.heldAt) <= at &&
              at < Date.parse(original.record.expiresAt),
            "Stale or mismatched custody.",
          );
        invariant(
          protocol.record.kind === "protocol" &&
            protocol.record.predecessorSha256 === null &&
            commitment.record.kind === "scientist-commitment" &&
            commitment.record.predecessorSha256 === protocol.sha256 &&
            binding.record.kind === "scientist-registration" &&
            binding.record.predecessorSha256 === commitment.sha256,
          "Wrong append-only chain.",
        );
        const c = ScientistCommitmentSchema.parse(commitment.document),
          b = ScientistBindingSchema.parse(binding.document),
          r = validateProspectiveRegistration(b.registration, issued, at);
        invariant(
          r.id === id &&
            r.study.studyId === e.studyId &&
            b.commitmentOriginalSha256 === commitment.sha256 &&
            digest(b.hypothesis) === digest(issued.hypothesis) &&
            digest(c.study) === digest(r.study),
          "Changed study or hypothesis.",
        );
        invariant(
          r.registeredAt === Date.parse(binding.record.heldAt) &&
            r.expiresAt <= Date.parse(binding.record.expiresAt) &&
            Date.parse(protocol.record.heldAt) <=
              Date.parse(commitment.record.heldAt) &&
            Number.isFinite(issued.proposalStartedAt) &&
            Date.parse(commitment.record.heldAt) < issued.proposalStartedAt &&
            issued.proposalStartedAt < issued.issuedAt &&
            issued.issuedAt <= r.registeredAt &&
            digest(c.preselection) === issued.proposalInputSha256,
          "Not prospective issuance.",
        );
        const { intents, graph, goal } = r.context;
        invariant(
          digest({ intents, graph, goal, consent: true }) ===
            digest(c.preselection),
          "Superseded initial context.",
        );
        // Authenticate the actual existing study-definition bytes, rather than
        // accepting identity labels copied into a registration JSON document.
        const definition = z
          .object({
            protocol: z
              .object({
                studyId: z.string(),
                intentRevision: z.strictObject({
                  id: z.string(),
                  revision: z.number().int().positive(),
                }),
                task: z.unknown(),
                fixtureSha256: Sha256Schema,
                conditions: z
                  .array(
                    z
                      .object({
                        variant: z.enum(["A", "B"]),
                        originalCommit: z.string(),
                        originalTreeSha256: Sha256Schema,
                      })
                      .passthrough(),
                  )
                  .length(2),
                executionConditions: z
                  .array(
                    z
                      .object({
                        variant: z.enum(["A", "B"]),
                        modelId: z.string(),
                      })
                      .passthrough(),
                  )
                  .length(2),
                futureOracle: z
                  .object({
                    baselineOracle: z
                      .object({
                        evaluatorSha256: Sha256Schema,
                        testSuiteSha256: Sha256Schema,
                        requiredPolicySha256: Sha256Schema,
                      })
                      .passthrough(),
                    oracle: z
                      .object({
                        evaluatorSha256: Sha256Schema,
                        testSuiteSha256: Sha256Schema,
                        requiredPolicySha256: Sha256Schema,
                      })
                      .passthrough(),
                  })
                  .passthrough(),
                trialPolicy: z
                  .object({ order: z.enum(["A_then_B", "B_then_A"]) })
                  .passthrough(),
                arms: z
                  .array(
                    z.strictObject({
                      variant: z.enum(["A", "B"]),
                      runId: z.string().uuid(),
                    }),
                  )
                  .length(2),
              })
              .passthrough(),
          })
          .passthrough()
          .parse(protocol.document);
        const p = definition.protocol,
          task = validateFutureTask(p.task),
          s = r.study;
        invariant(
          digest(protocol.document) === s.definitionSha256 &&
            protocol.sha256 === s.protocolOriginalSha256 &&
            p.studyId === s.studyId &&
            task.id === s.taskId &&
            futureTaskDigest(task) === s.taskDefinitionSha256 &&
            digest(p) === c.studyProtocolSha256 &&
            p.trialPolicy.order === s.order &&
            p.executionConditions.every((x) => x.modelId === s.model),
          "Wrong task, protocol or conditions.",
        );
        for (const [prefix, oracle] of [
          ["baseline", p.futureOracle.baselineOracle],
          ["future", p.futureOracle.oracle],
        ] as const)
          invariant(
            s[`${prefix}EvaluatorSha256`] === oracle.evaluatorSha256 &&
              s[`${prefix}SuiteSha256`] === oracle.testSuiteSha256 &&
              s[`${prefix}PolicySha256`] === oracle.requiredPolicySha256,
            "Wrong evaluator, suite or policy.",
          );
        invariant(
          r.context.intents.some(
            (i) =>
              i.id === p.intentRevision.id &&
              i.revision === p.intentRevision.revision,
          ),
          "Wrong study intent revision.",
        );
        const prediction = issued.hypothesis.prediction;
        invariant(
          digest(c.prediction) ===
            digest({
              metric: prediction.metric,
              direction: prediction.direction,
              comparison: prediction.comparison,
            }),
          "Hypothesis does not choose committed prediction.",
        );
        for (const pair of [p.conditions, p.executionConditions]) {
          const { variant: a, ...left } = pair[0]!;
          const { variant: b, ...right } = pair[1]!;
          invariant(
            a !== b && digest(left) === digest(right),
            "Unmatched arm conditions.",
          );
        }
        const matchedDefinition = {
          protocol: p,
          runtime: definition.runtime,
          restrictions: definition.restrictions,
          toolAllowlist: definition.toolAllowlist,
          downstreamPrompt: definition.downstreamPrompt,
          adapterInstructions: definition.adapterInstructions,
        };
        invariant(
          matchedConditionsDigest(matchedDefinition) ===
            c.matchedConditionsSha256,
          "Matched conditions changed.",
        );
        for (const arms of [p.conditions, p.executionConditions, p.arms])
          invariant(
            new Set(arms.map((a) => a.variant)).size === 2,
            "Duplicate variants.",
          );
        invariant(p.arms[0]!.runId !== p.arms[1]!.runId, "Run replay.");
        const manifest = c.sourceManifest;
        invariant(
          manifest.every(
            (f, i) =>
              !f.path.startsWith("/") &&
              !f.path.includes("\\") &&
              !f.path.split("/").some((x) => !x || x === "." || x === "..") &&
              (i === 0 || manifest[i - 1]!.path < f.path),
          ),
          "Invalid source manifest.",
        );
        const sourceTreeSha256 = digest(manifest);
        invariant(
          p.fixtureSha256 === sourceTreeSha256 &&
            p.conditions.every(
              (a) =>
                a.originalTreeSha256 === sourceTreeSha256 &&
                a.originalCommit === graph.repoCommit,
            ),
          "Wrong source tree.",
        );
        const identities = {
          studyId: s.studyId,
          hypothesisId: r.hypothesisId,
          contextSha256: issued.contextSha256,
          taskSha256: s.taskDefinitionSha256,
          matchedConditionsSha256: c.matchedConditionsSha256,
          evaluatorSha256: s.futureEvaluatorSha256,
          suiteSha256: s.futureSuiteSha256,
          policySha256: s.futurePolicySha256,
        };
        for (const key of [
          ...Object.keys(identities),
          "protocolSha256",
          "variants",
        ])
          invariant(
            !(key in c.measurementPlan),
            "Retroactive measurement identity.",
          );
        const metricProtocol = MetricProtocolSchema.parse({
          ...c.measurementPlan,
          ...identities,
        });
        const expected = RegistrationLineageSchema.parse({
          ...identities,
          protocolSha256: digest(metricProtocol),
          studyProtocolSha256: c.studyProtocolSha256,
          sourceTreeSha256,
          sourceManifestSha256: sourceTreeSha256,
          variants: (["A", "B"] as const).map((variant, i) => ({
            variant,
            candidateId: r.context.candidates[i]!.id,
            runId: p.arms.find((a) => a.variant === variant)!.runId,
          })),
        });
        invariant(
          digest(expected) === digest(b.lineage),
          "Wrong registered measurement lineage.",
        );
        // The source-owned catalog is the complete reviewed custody inventory,
        // not a caller-selected subset. Refuse a late supplement even before a
        // public evidence link exists; later serving repeats this check.
        for (const originalId of config.custody.entries.keys()) {
          const held = await store.load(originalId);
          invariant(held, "Incomplete custody inventory.");
          if (
            held.record.studyId === e.studyId &&
            held.record.kind === "scientist-registration"
          )
            invariant(
              held.record.id === e.bindingId,
              "Study binding was reassigned.",
            );
          if (
            held.record.studyId === e.studyId &&
            held.record.kind === "scientist-commitment"
          )
            invariant(
              held.record.id === e.commitmentId,
              "Study commitment was reassigned.",
            );
          if (
            held.record.studyId === e.studyId &&
            ["preparation", "prepared", "runtime", "execution"].includes(
              held.record.kind,
            )
          )
            invariant(
              r.registeredAt < Date.parse(held.record.heldAt),
              "Registration after downstream custody.",
            );
        }
        // Repeat the complete chain after asynchronous reads. Changed revocation
        // bytes or reassigned originals cannot survive a mid-read replacement.
        for (const original of [protocol, commitment, binding]) {
          const fresh = await store.load(original.record.id);
          invariant(
            fresh &&
              fresh.sha256 === original.sha256 &&
              now() < Date.parse(fresh.record.expiresAt),
            "Custody changed during registration.",
          );
        }
        invariant(now() < r.expiresAt, "Registration expired during read.");
        const result = freeze({
          ...b,
          metricProtocol,
          commitmentId: e.commitmentId,
          bindingOriginalSha256: binding.sha256,
          commitmentSubjectSha256: digest(c),
        });
        authenticated.add(result);
        return result;
      } catch {
        return null;
      }
    },
  });
}
export type RegistrationResolver = ReturnType<
  typeof createScientistRegistrationReader
>["resolveRegistration"];
