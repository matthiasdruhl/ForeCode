import { ContextSchema } from "../../src/lib/learning/contracts";
import { fixedPolicy, DecisionSchema } from "../../src/lib/learning/features";
import { validateConditionedProposal } from "../../src/lib/learning/meta-boundary";
import { UtcTimestampSchema } from "../../src/lib/contracts/common";
import { invariant } from "../../src/lib/contracts/validation";
import { jsonDigest } from "../../src/lib/report/digests";
import { immutable } from "../experiments/tournament/custody";
import { retrieveEvidence } from "./memory";
import { recommend } from "./policy";
import { isFreshShadowReplay, type ShadowReplay } from "./shadow";
import { ShadowDecisionSchema } from "./shadow-contracts";

// Advisory draft for a FUTURE context. This creates no independent timestamp,
// study approval, verification verdict, model request or implementation action.
export function draftShadowDecision(input: {
  replay: ShadowReplay;
  context: unknown;
  proposal?: unknown;
  at: string;
  mode?: "AUTHENTIC" | "SYNTHETIC";
}) {
  invariant(
    isFreshShadowReplay(input.replay),
    "Fresh original replay required.",
  );
  const run = input.replay,
    mode = input.mode ?? "AUTHENTIC",
    c = ContextSchema.parse(input.context),
    at = UtcTimestampSchema.parse(input.at);
  invariant(run.report.origin === mode, "Synthetic decision isolation.");
  invariant(
    at === run.report.assessedAt && Date.parse(c.frozenAt) <= Date.parse(at),
    "Decision requires a replay freshly assessed at recording time.",
  );
  for (const snapshot of run.snapshots) {
    invariant(
      Date.parse(snapshot.manifest.frozenAt) < Date.parse(c.frozenAt),
      "Known evidence postdates proposed context.",
    );
    invariant(
      snapshot.observations.every(
        (o) =>
          o.projection.context.sourceSha256 !== c.sourceSha256 ||
          o.projection.context.intentSha256 !== c.intentSha256,
      ),
      "Outcome already known for source/intent.",
    );
  }
  const proposal =
    input.proposal === undefined
      ? null
      : validateConditionedProposal(c, input.proposal);
  if (proposal)
    invariant(
      jsonDigest([...proposal.proposed].sort()) ===
        jsonDigest([...c.actions.eligible].sort()),
      "Comparison must preserve every eligible strategy.",
    );
  const learned = recommend(run.policy, c, mode);
  const matches = run.snapshots
    .flatMap((snapshot) => retrieveEvidence(snapshot, c, { mode }).matches)
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        a.observationSha256.localeCompare(b.observationSha256),
    );
  const repositoryFamilies = new Set(matches.map((m) => m.repositoryFamily))
      .size,
    taskFamilies = new Set(matches.map((m) => m.taskFamily)).size;
  const record = immutable(
    ShadowDecisionSchema.parse({
      schemaVersion: "learning-shadow-decision-draft.local.v1",
      origin: mode,
      replaySha256: run.sha256,
      policySha256: run.policy.sha256,
      contextSha256: jsonDigest(c),
      candidateSetSha256: jsonDigest(c.actions),
      proposalSha256: proposal ? jsonDigest(proposal) : null,
      recordedAt: at,
      fixed: fixedPolicy(c),
      learned: DecisionSchema.parse({
        schemaVersion: "learning-decision.v1",
        contextSha256: jsonDigest(c),
        policySha256: run.policy.sha256,
        action: learned.action,
        reason: learned.reason,
        authority: "advisory_only",
      }),
      memory: {
        status:
          repositoryFamilies >= 2 && taskFamilies >= 2
            ? "CASES_AVAILABLE"
            : "ABSTAIN",
        repositoryFamilies,
        taskFamilies,
        cases: matches.map((m) => ({
          observationSha256: m.observationSha256,
          evidence: m.evidence,
          distance: m.distance,
          missingFeatures: m.missingFeatures,
          rewards: m.rewards,
        })),
      },
      authority: "DRAFT_ONLY",
      outcome: "UNOBSERVED",
      independentCommitment: "REQUIRED",
    }),
  );
  return immutable({ record, sha256: jsonDigest(record) });
}
