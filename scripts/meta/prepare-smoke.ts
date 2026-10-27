// Preparation only. No environment/key loading, network calls or file writes.
// Redirect stdout to private temporary storage if a review artifact is wanted.
import { createHash } from "node:crypto";
import { bookingGraph } from "../../src/lib/foresight/booking-context";
import { confirmIntent } from "../../src/lib/intents/lifecycle";
import { canonicalJson } from "../../src/lib/report/canonical";
import {
  buildMetaPayload,
  META_LIMITS,
  PROMPT_VERSION,
} from "../../src/lib/foresight/prompts";
import { ProposeRequestSchema } from "../../src/lib/contracts/api";

const model = process.argv[2];
if (
  process.argv.length !== 3 ||
  !["muse-spark-1.3", "muse-spark-1.3-contributor"].includes(model ?? "")
) {
  throw new Error(
    "Usage: node --import tsx scripts/meta/prepare-smoke.ts <explicit-allowlisted-model>",
  );
}
const request = ProposeRequestSchema.parse({
  intents: [
    confirmIntent(
      {
        title: "Team permissions",
        statement:
          "Let team owners delegate booking cancellation while preserving individual ownership rules.",
        priority: "high",
        horizon: "near",
      },
      "intent-smoke-team",
      new Date("2026-10-27T18:00:00.000Z"),
    ),
  ],
  graph: bookingGraph,
  goal: "Assess one bounded permissions boundary inside the reviewed booking service.",
  consent: true,
});
const providerBody = buildMetaPayload("propose", request, model!);
console.log(
  JSON.stringify(
    {
      status: "NOT_RUN",
      step: "propose",
      endpoint: "https://api.meta.ai/v1/chat/completions",
      model,
      promptVersion: PROMPT_VERSION,
      providerPayloadSha256: createHash("sha256")
        .update(canonicalJson(providerBody))
        .digest("hex"),
      providerBodyBytes: Buffer.byteLength(JSON.stringify(providerBody)),
      maximumCalls: 1,
      maximumOutputTokensIncludingReasoning: META_LIMITS.outputTokens,
      timeoutMs: META_LIMITS.timeoutMs,
      automaticRetries: 0,
      spendingCeilingUSD: null,
      remainingGates: [
        "Explicit human approval of this exact request/body hash and a non-null spending ceiling.",
        "Confirmed account/model access and credits, and suitable provider-side spending controls.",
        "Contributor model content-use consent if that model was explicitly selected.",
        "Separate approval of each later hypothesis/challenge payload; no full-session approval is inferred.",
      ],
      request,
      providerBody,
    },
    null,
    2,
  ),
);
