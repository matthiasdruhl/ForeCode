import { jsonDigest } from "../report/digests";

// A projection of the authenticated full definition, NOT the definition subject
// or operator protocol digest. Array order and every executable condition count.
export function matchedConditionsDigest(definition: {
  protocol: {
    conditions: unknown;
    executionConditions: unknown;
    trialPolicy: unknown;
  };
  runtime: unknown;
  restrictions: unknown;
  toolAllowlist: unknown;
  downstreamPrompt: unknown;
  adapterInstructions: unknown;
}) {
  return jsonDigest({
    conditions: definition.protocol.conditions,
    executionConditions: definition.protocol.executionConditions,
    trialPolicy: definition.protocol.trialPolicy,
    runtime: definition.runtime,
    restrictions: definition.restrictions,
    toolAllowlist: definition.toolAllowlist,
    downstreamPrompt: definition.downstreamPrompt,
    adapterInstructions: definition.adapterInstructions,
  });
}
