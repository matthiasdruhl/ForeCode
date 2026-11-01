// Unsigned review data only. No provider/service/transport, signer or runner.
import { z } from "zod";
import { bookingGraph } from "../../../src/lib/foresight/booking-context";
import { IntentInputSchema } from "../../../src/lib/intents/lifecycle";
import { invariant } from "../../../src/lib/contracts/validation";
import { jsonDigest } from "../../../src/lib/report/digests";
import { immutable } from "./custody";
import { validateStudyDefinition } from "./study";
import { SourceManifestSchema } from "./source-manifest";

/** Concrete review data only: no synthetic confirmation, consent or timestamp. */
export function buildScientistPreselectionDraft(input: {
  definition: unknown;
  sourceManifest: unknown;
  intent: z.infer<typeof IntentInputSchema>;
  goal: string;
}) {
  const definition = validateStudyDefinition(input.definition);
  const sourceManifest = SourceManifestSchema.parse(input.sourceManifest);
  invariant(
    definition.protocol.conditions.every(
      (arm) => arm.originalCommit === bookingGraph.repoCommit,
    ) &&
      jsonDigest(sourceManifest) === definition.protocol.fixtureSha256 &&
      sourceManifest.every(
        (f, i) => !i || sourceManifest[i - 1]!.path < f.path,
      ),
    "Original source does not match reviewed graph.",
  );
  return immutable({
    schemaVersion: "scientist-preselection-review.local.v1" as const,
    state: "UNSIGNED_UNCONFIRMED_NOT_AUTHORIZED" as const,
    definition,
    sourceManifest,
    proposedIntent: {
      ...IntentInputSchema.parse({
        title: input.intent.title,
        statement: input.intent.statement,
        priority: input.intent.priority,
        horizon: input.intent.horizon,
      }),
      id: definition.protocol.intentRevision.id,
      revision: definition.protocol.intentRevision.revision,
    },
    graph: structuredClone(bookingGraph),
    goal: z.string().min(1).max(500).parse(input.goal),
    ownerConfirmation: null,
    consent: null,
    protocolOriginalSha256: null,
    measurementPlan: null,
    pending: [
      "ACTUAL_OWNER_INTENT_CONFIRMATION",
      "EXACT_PAYLOAD_CONSENT",
      "INDEPENDENT_PROTOCOL_ENVELOPE",
      "REVIEWED_METRIC_SEMANTICS",
      "INDEPENDENT_INITIAL_COMMITMENT",
    ],
  });
}
