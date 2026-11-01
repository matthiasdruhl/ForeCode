// Consistency checks for this fixed three-stage historical recording, not a
// provider signature or evidence authority. No credentials, I/O or inference.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "../../src/lib/report/canonical";
import {
  RECORDED_META_LIMITS_V1 as META_LIMITS,
  RECORDED_PROMPT_VERSION_V1 as PROMPT_VERSION,
} from "./historical-scientist-payload-v1";
import {
  requestSchemas,
  validateFlowOutput,
} from "../../src/lib/foresight/flow";

const stages = ["propose", "hypothesize", "challenge"] as const;
export const recordingFiles = [
  "manifest.json",
  ...stages.flatMap((step) =>
    ["request", "response", "provider-observation"].map(
      (s) => `${step}-${s}.json`,
    ),
  ),
];
// An independently configured source expectation in this reviewed verifier.
// Neither this pin nor matching hashes proves what actually ran historically.
export const recordedSourceCommit = "8749d243c7f17bb641d47f24807e7da8cc540334";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const money = z.number().finite().nonnegative();
const timestamp = z.iso.datetime({ precision: 3 });
const label = z.literal("GENUINE LIVE META OUTPUT");
const model = z.literal("muse-spark-1.3-contributor");
const promptVersion = z.literal(PROMPT_VERSION);
const responseId = z.string().regex(/^meta-[a-f0-9]{64}$/);
const text = z.string().min(1).max(4096);
const observationSchema = z.strictObject({
  label,
  captureMethod: text,
  startedAt: timestamp,
  completedAt: timestamp,
  providerHttpStatus: z.literal(200),
  applicationHttpStatus: z.literal(200),
  model,
  promptVersion,
  providerCreatedUnixSeconds: count,
  transportResponseIdentity: responseId,
  operatorRawResponseIdSha256: hash,
  operatorRawRequestIdSha256: hash,
  identityNote: text,
  payloadIdentity: hash,
  contextIdentity: hash,
  providerResponseBytes: count.positive().max(META_LIMITS.outputBytes),
  originalApplicationResponseBytesSha256: hash,
  finishReason: z.literal("stop"),
  usage: z.strictObject({
    completion_tokens: count.max(META_LIMITS.outputTokens),
    prompt_tokens: count,
    total_tokens: count,
    completion_tokens_details: z.strictObject({ reasoning_tokens: count }),
    prompt_tokens_details: z.strictObject({ cached_tokens: count }),
  }),
  estimatedCostUsd: money,
  actualInvoicedCostUsd: z.null(),
  originalAssistantContent: z.string().min(2).max(META_LIMITS.outputBytes),
});
const stepSchema = z.strictObject({
  step: z.enum(stages),
  startedAt: timestamp,
  completedAt: timestamp,
  providerResponseIdentity: responseId,
  schemaValidation: z.literal("PASS"),
  contextBindingValidation: z.literal("PASS"),
  providerHttpStatus: z.literal(200),
  applicationHttpStatus: z.literal(200),
  safeError: z.null(),
  estimatedCostUsd: money,
});
const manifestSchema = z.strictObject({
  schemaVersion: z.literal("live-meta-scientist-operational-record.v1"),
  label,
  presentationMode: z.literal("recorded"),
  sourceCommit: z.literal(recordedSourceCommit),
  sourceNote: text,
  pullRequest47: z.strictObject({
    state: z.literal("MERGED"),
    mergedAt: z.iso.datetime(),
    correctedHead: z.literal("3420536915c3fc6afb982f236bfc04d729c7a1e9"),
    mergeWorkflow: z.literal(
      "https://github.com/matthiasdruhl/ForeCode/actions/runs/41271468295",
    ),
    conclusion: z.literal("SUCCESS"),
  }),
  runStartedAt: timestamp,
  runCompletedAt: timestamp,
  model,
  promptVersion,
  endpoint: z.literal("https://api.meta.ai/v1/chat/completions"),
  localOrigin: z.literal("http://127.0.0.1:3189"),
  graph: z.strictObject({
    id: text,
    baselineCommit: z.string().regex(/^[a-f0-9]{40}$/),
  }),
  intentRevisions: z
    .array(z.strictObject({ id: text, revision: count.positive() }))
    .min(1),
  scenarioRevisions: z
    .array(
      z.strictObject({
        id: text,
        revision: z.null(),
        frozen: z.literal(false),
        origin: z.literal("meta_generated"),
      }),
    )
    .min(1),
  scenarioRevisionNote: text,
  proposalCandidates: z.array(text).length(2),
  proposalContextIdentity: hash,
  hypothesisId: z.uuid(),
  challengeId: text,
  challengeHypothesisId: z.uuid(),
  steps: z.array(stepSchema).length(3),
  providerCalls: z.strictObject({
    billableInferenceAttempts: count,
    successful: count,
    failed: count,
    automaticRetries: count,
    additionalAttempts: count,
    maximumAuthorized: count,
    nonBillableModelCatalogChecks: count,
    interpretEvidenceCalls: count,
  }),
  spending: z.strictObject({
    ownerCeilingUsd: money,
    accountFunding: text,
    inputTokens: count,
    outputTokensIncludingReasoning: count,
    totalTokens: count,
    reasoningTokensIncludedInOutput: count,
    cachedInputTokens: count,
    priceSource: z.literal("https://dev.meta.ai/docs/pricing-rate-limits"),
    pricingCheckedOn: z.iso.date(),
    inputUsdPerMillion: money,
    outputUsdPerMillion: money,
    estimatedCostUsd: money,
    actualInvoicedCostUsd: z.null(),
    maximumSixAttemptReservationUsd: money,
    reservationBasis: text,
    providerDollarHardCap: text,
    unknowns: z.array(text).min(1),
  }),
  limits: z.strictObject({
    approvedCallLimit: count,
    totalPerProcessRepositoryLimit: count,
    perEndpointPerHour: count,
    concurrent: count,
    intervalMs: count,
    timeoutMs: count,
    inputBytes: count,
    outputBytes: count,
    outputTokensIncludingReasoning: count,
    artifactTtlMs: count,
    automaticRetries: count,
  }),
  assessment: z.strictObject({
    propose: z.literal("YES"),
    hypothesize: z.literal("YES"),
    challenge: z.literal("YES"),
    schemaAndBindingValidation: z.literal("PASS"),
    liveProviderProvenancePreserved: z.literal(true),
    usableForHackathonDemonstration: z.literal("WITH LIMITATIONS"),
    reasoningUsefulness: text,
  }),
  cleanup: z.strictObject({
    ownedLiveServerStopped: z.boolean(),
    listener3189Remaining: z.boolean(),
    temporarySpendingFlagsPersisted: z.boolean(),
    credentialsCopied: z.boolean(),
    originalSecretStorageModified: z.boolean(),
    standardTestsUsedRealCredentials: z.boolean(),
  }),
  files: z.record(z.string(), hash),
  hypothesisIdentity: hash,
  scenarioSnapshotsIdentity: hash,
});
const digest = (v: unknown) =>
  createHash("sha256").update(canonicalJson(v)).digest("hex");
const equal = (a: unknown, b: unknown, claim: string) =>
  assert.deepEqual(a, b, claim);
const close = (a: number, b: number) =>
  assert(Math.abs(a - b) <= 1e-12, "Cost arithmetic differs.");

export function verifyManifest(files: Record<string, unknown>) {
  equal(
    Object.keys(files).sort(),
    [...recordingFiles].sort(),
    "File inventory",
  );
  const m = manifestSchema.parse(files["manifest.json"]);
  equal(
    Object.keys(m.files).sort(),
    recordingFiles.filter((f) => f !== "manifest.json").sort(),
    "Digest inventory",
  );
  for (const [file, hash] of Object.entries(m.files))
    equal(digest(files[file]), hash, "File digest");
  equal(
    m.steps.map((s) => s.step),
    stages,
    "Stage order",
  );
  equal(
    m.limits,
    {
      approvedCallLimit: 6,
      totalPerProcessRepositoryLimit: META_LIMITS.totalPerProcess,
      perEndpointPerHour: META_LIMITS.perEndpointPerHour,
      concurrent: META_LIMITS.concurrent,
      intervalMs: META_LIMITS.intervalMs,
      timeoutMs: META_LIMITS.timeoutMs,
      inputBytes: META_LIMITS.inputBytes,
      outputBytes: META_LIMITS.outputBytes,
      outputTokensIncludingReasoning: META_LIMITS.outputTokens,
      artifactTtlMs: META_LIMITS.artifactTtlMs,
      automaticRetries: 0,
    },
    "Recorded limits",
  );
  equal(
    m.providerCalls,
    {
      billableInferenceAttempts: 3,
      successful: 3,
      failed: 0,
      automaticRetries: 0,
      additionalAttempts: 0,
      maximumAuthorized: 6,
      nonBillableModelCatalogChecks: 1,
      interpretEvidenceCalls: 0,
    },
    "Attempt accounting",
  );
  const seen = {
    transport: new Set<string>(),
    request: new Set<string>(),
    response: new Set<string>(),
  };
  let previous = Date.parse(m.pullRequest47.mergedAt);
  let input = 0,
    output = 0,
    reasoning = 0,
    cached = 0,
    cost = 0;
  for (const [index, step] of stages.entries()) {
    const o = observationSchema.parse(
      files[`${step}-provider-observation.json`],
    );
    const s = m.steps[index]!;
    equal(
      [
        s.startedAt,
        s.completedAt,
        s.providerResponseIdentity,
        s.estimatedCostUsd,
      ],
      [
        o.startedAt,
        o.completedAt,
        o.transportResponseIdentity,
        o.estimatedCostUsd,
      ],
      "Stage observation",
    );
    const start = Date.parse(o.startedAt),
      end = Date.parse(o.completedAt);
    assert(
      start >= previous && end >= start && end - start <= m.limits.timeoutMs,
      "Chronology",
    );
    if (index > 0)
      assert(
        start - Date.parse(m.steps[index - 1]!.startedAt) >=
          m.limits.intervalMs,
        "Call interval",
      );
    // Issuance happened no later than the parent's observed completion. With
    // no intervening proposal refresh in this fixed recording, neither parent
    // can survive beyond that latest possible expiry. The child's request start
    // bounds its server admission from below; client receipt time does not bound
    // server acceptance from below. Do not reject a possibly valid response just
    // because it was received after expiry. Exact server times remain unverified.
    for (const parent of m.steps.slice(0, index))
      assert(
        start < Date.parse(parent.completedAt) + m.limits.artifactTtlMs,
        `Parent ${parent.step} artifact lifetime exceeded`,
      );
    assert(
      o.providerCreatedUnixSeconds >= Math.floor(start / 1000) &&
        o.providerCreatedUnixSeconds <= Math.ceil(end / 1000),
      "Provider timestamp",
    );
    previous = end;
    for (const [key, value] of [
      ["transport", o.transportResponseIdentity],
      ["request", o.operatorRawRequestIdSha256],
      ["response", o.operatorRawResponseIdSha256],
    ] as const) {
      assert(!seen[key].has(value), "Duplicate provider identity");
      seen[key].add(value);
    }
    // Response.json uses compact JSON; no hash convention conversion of provider IDs.
    equal(
      createHash("sha256")
        .update(JSON.stringify(files[`${step}-response.json`]))
        .digest("hex"),
      o.originalApplicationResponseBytesSha256,
      "Original application response bytes",
    );
    const u = o.usage;
    equal(u.total_tokens, u.prompt_tokens + u.completion_tokens, "Token sum");
    assert(
      u.completion_tokens_details.reasoning_tokens <= u.completion_tokens &&
        u.prompt_tokens_details.cached_tokens <= u.prompt_tokens,
      "Token detail bounds",
    );
    // This recording has no cached input; no unrecorded cached rate assumed.
    equal(u.prompt_tokens_details.cached_tokens, 0, "Unsupported cached rate");
    const estimate =
      (u.prompt_tokens * m.spending.inputUsdPerMillion +
        u.completion_tokens * m.spending.outputUsdPerMillion) /
      1e6;
    close(o.estimatedCostUsd, estimate);
    input += u.prompt_tokens;
    output += u.completion_tokens;
    reasoning += u.completion_tokens_details.reasoning_tokens;
    cached += u.prompt_tokens_details.cached_tokens;
    cost += estimate;
  }
  equal(m.runStartedAt, m.steps[0]!.startedAt, "Run start");
  equal(m.runCompletedAt, m.steps[2]!.completedAt, "Run end");
  equal(
    [
      m.spending.inputTokens,
      m.spending.outputTokensIncludingReasoning,
      m.spending.totalTokens,
      m.spending.reasoningTokensIncludedInOutput,
      m.spending.cachedInputTokens,
    ],
    [input, output, input + output, reasoning, cached],
    "Total token accounting",
  );
  close(m.spending.estimatedCostUsd, cost);
  close(
    m.spending.maximumSixAttemptReservationUsd,
    (6 *
      (1_048_576 * m.spending.inputUsdPerMillion +
        4096 * m.spending.outputUsdPerMillion)) /
      1e6,
  );
  assert(
    cost <= m.spending.maximumSixAttemptReservationUsd &&
      m.spending.maximumSixAttemptReservationUsd <= m.spending.ownerCeilingUsd,
    "Spending bounds",
  );
  const p = requestSchemas.propose.parse(files["propose-request.json"]);
  const proposal = validateFlowOutput(
    "propose",
    p,
    files["propose-response.json"],
  );
  const h = requestSchemas.hypothesize.parse(files["hypothesize-request.json"]);
  const hypothesis = validateFlowOutput(
    "hypothesize",
    h,
    files["hypothesize-response.json"],
  );
  const c = requestSchemas.challenge.parse(files["challenge-request.json"]);
  const challenge = validateFlowOutput(
    "challenge",
    c,
    files["challenge-response.json"],
  );
  assert(
    proposal.schemaVersion === "foresight-proposals.v1" &&
      hypothesis.schemaVersion === "scientist-hypotheses.v1" &&
      challenge.schemaVersion === "scientist-challenges.v1",
  );
  equal(
    m.graph,
    { id: p.graph.id, baselineCommit: p.graph.repoCommit },
    "Source graph",
  );
  equal(
    m.intentRevisions,
    p.intents.map((i) => ({ id: i.id, revision: i.revision })),
    "Intent revisions",
  );
  equal(
    m.proposalCandidates,
    proposal.candidates.map((c) => c.id),
    "Candidate identities",
  );
  equal(
    m.scenarioRevisions,
    proposal.scenarios.map((s) => ({
      id: s.id,
      revision: null,
      frozen: s.frozen,
      origin: s.origin,
    })),
    "Scenarios",
  );
  equal(
    m.proposalContextIdentity,
    digest({
      intents: h.intents,
      graph: h.graph,
      candidates: h.candidates,
      visibleScenarios: h.visibleScenarios,
    }),
    "Proposal context",
  );
  equal(m.hypothesisId, hypothesis.hypotheses[0]!.id, "Issued hypothesis");
  equal(
    m.hypothesisIdentity,
    digest(hypothesis.hypotheses[0]),
    "Hypothesis digest",
  );
  equal(
    m.scenarioSnapshotsIdentity,
    digest(proposal.scenarios),
    "Scenario digest",
  );
  equal(
    [m.challengeId, m.challengeHypothesisId],
    [challenge.challenges[0]!.id, challenge.challenges[0]!.hypothesisId],
    "Challenge lineage",
  );
  equal(m.challengeHypothesisId, m.hypothesisId, "Hypothesis handoff");
  return {
    verified: "OFFLINE_CONSISTENCY_ONLY",
    unchecked: [
      "Historical HTTPS/source execution",
      "Exact server issuance and acceptance times",
      "Catalog call and concealed attempts",
      "Pricing authenticity and actual invoice",
      "Cleanup and credential handling",
      "PR workflow outcome and operator prose",
    ],
  } as const;
}
