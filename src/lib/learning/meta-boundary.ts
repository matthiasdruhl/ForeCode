import { ContextSchema, ProposalSchema } from "./contracts";
import { jsonDigest } from "../report/digests";
import { invariant } from "../contracts/validation";

// Validates a proposal captured by a separately consented Meta adapter. It
// contains no transport, runner, evaluator, grading or spending capability.
export function validateConditionedProposal(
  context: unknown,
  proposal: unknown,
) {
  const c = ContextSchema.parse(context),
    p = ProposalSchema.parse(proposal);
  invariant(
    p.contextSha256 === jsonDigest(c) &&
      p.provenance.inputSha256 === jsonDigest(c),
    "Proposal input mismatch.",
  );
  invariant(
    p.candidateSetSha256 === jsonDigest(c.actions),
    "Candidate set mismatch.",
  );
  invariant(
    p.proposed.every((a) => c.actions.eligible.includes(a)),
    "Unsupported proposal strategy.",
  );
  return p;
}
