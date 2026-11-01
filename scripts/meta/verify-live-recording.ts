// Offline recording verification only: no credentials, provider calls or issuance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, lstatSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyManifest, recordingFiles } from "./recording-manifest";
import { z } from "zod";
import {
  requestSchemas,
  validateApprovedInput,
  validateFlowOutput,
  type Step,
} from "../../src/lib/foresight/flow";
import {
  buildRecordedMetaPayloadV1 as buildMetaPayload,
  RECORDED_PROMPT_VERSION_V1 as PROMPT_VERSION,
} from "./historical-scientist-payload-v1";
import { contentSchemas } from "../../src/lib/foresight/prompts";
import { canonicalJson } from "../../src/lib/report/canonical";

const digest = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
const ObservationSchema = z.object({
  label: z.literal("GENUINE LIVE META OUTPUT"),
  model: z.literal("muse-spark-1.3-contributor"),
  promptVersion: z.literal(PROMPT_VERSION),
  providerHttpStatus: z.literal(200),
  applicationHttpStatus: z.literal(200),
  payloadIdentity: z.string().regex(/^[a-f0-9]{64}$/),
  contextIdentity: z.string().regex(/^[a-f0-9]{64}$/),
  transportResponseIdentity: z.string().regex(/^meta-[a-f0-9]{64}$/),
  originalAssistantContent: z.string().min(2).max(65_536),
});

export function verifyRecording(files: Record<string, unknown>) {
  const read = (name: string): unknown => {
    assert(Object.hasOwn(files, name), "Missing recording file.");
    return files[name];
  };
  verifyManifest(files);
  const manifest = z
    .object({ files: z.record(z.string(), z.string()) })
    .parse(read("manifest.json"));
  const records = new Map<
    Step,
    {
      request: ReturnType<(typeof requestSchemas)[Step]["parse"]>;
      response: ReturnType<typeof validateFlowOutput>;
    }
  >();
  const identities = new Set<string>();
  for (const step of ["propose", "hypothesize", "challenge"] as const) {
    for (const suffix of ["request", "response", "provider-observation"]) {
      const name = `${step}-${suffix}.json`;
      assert.equal(digest(read(name)), manifest.files[name], "File digest.");
    }
    const request = requestSchemas[step].parse(read(`${step}-request.json`));
    validateApprovedInput(request);
    const response = validateFlowOutput(
      step,
      request,
      read(`${step}-response.json`),
    );
    const observation = ObservationSchema.parse(
      read(`${step}-provider-observation.json`),
    );
    assert.equal(
      observation.payloadIdentity,
      digest(buildMetaPayload(step, request, observation.model)),
      "Exact provider payload.",
    );
    assert.equal(
      observation.contextIdentity,
      digest(request),
      "Exact context.",
    );
    assert.deepEqual(response.provider, {
      provider: "meta",
      mode: "live",
      model: observation.model,
      promptVersion: PROMPT_VERSION,
      sourceEvidenceId: observation.transportResponseIdentity,
    });
    assert(!identities.has(observation.transportResponseIdentity));
    identities.add(observation.transportResponseIdentity);
    const original: unknown = JSON.parse(observation.originalAssistantContent);
    let reconstructed;
    if (step === "propose") {
      const content = contentSchemas.propose.parse(original);
      reconstructed = {
        ...response,
        candidates: content.candidates.map((candidate) => ({
          ...candidate,
          metaProvenance: "live",
          modelId: observation.model,
          promptVersion: PROMPT_VERSION,
        })),
        scenarios: content.scenarios,
      };
    } else if (step === "hypothesize") {
      const content = contentSchemas.hypothesize.parse(original);
      assert(response.schemaVersion === "scientist-hypotheses.v1");
      reconstructed = {
        ...response,
        hypotheses: content.hypotheses.map((hypothesis, index) => ({
          ...hypothesis,
          id: z.uuid().parse(response.hypotheses[index]!.id),
          provider: response.provider,
        })),
      };
    } else {
      const content = contentSchemas.challenge.parse(original);
      reconstructed = {
        ...response,
        challenges: content.challenges.map((challenge) => ({
          ...challenge,
          provider: response.provider,
        })),
      };
    }
    assert.equal(
      canonicalJson(reconstructed),
      canonicalJson(response),
      "Original model output differs from the server-enriched response.",
    );
    records.set(step, { request, response });
  }
  const proposal = records.get("propose")!;
  const hypothesis = records.get("hypothesize")!;
  const challenge = records.get("challenge")!;
  assert(proposal.response.schemaVersion === "foresight-proposals.v1");
  assert(hypothesis.response.schemaVersion === "scientist-hypotheses.v1");
  const context = {
    ...requestSchemas.propose.parse(proposal.request),
    candidates: proposal.response.candidates,
    visibleScenarios: proposal.response.scenarios,
  };
  assert.deepEqual(hypothesis.request, context, "Proposal handoff changed.");
  const { goal, ...challengeContext } = context;
  assert(typeof goal === "string");
  assert.deepEqual(challenge.request, {
    ...challengeContext,
    hypotheses: hypothesis.response.hypotheses,
  });
  return "PASS: offline schemas, source/model/prompt pins, manifest/observation chronology, identities, exact handoffs, original model text, token/cost arithmetic and complete file digests. No provider call. This does not independently authenticate the historical HTTPS exchange or restore expired server bindings. Cleanup, concealed attempts, historical source execution, pricing authenticity and invoices remain unverified.";
}

export function verifyRecordingDirectory(directory: string) {
  assert.deepEqual(
    readdirSync(directory).sort(),
    [...recordingFiles].sort(),
    "Unexpected or missing files.",
  );
  const files: Record<string, unknown> = {};
  for (const name of recordingFiles) {
    const path = resolve(directory, name);
    const stat = lstatSync(path);
    assert(
      stat.isFile() && !stat.isSymbolicLink() && stat.size <= 262_144,
      "Invalid recording file.",
    );
    files[name] = JSON.parse(readFileSync(path, "utf8"));
  }
  return verifyRecording(files);
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    assert(process.argv.length === 3, "Provide one recording directory.");
    console.log(verifyRecordingDirectory(resolve(process.argv[2]!)));
  } catch {
    console.error(
      "FAIL: live recording verification. No provider call was made.",
    );
    process.exitCode = 1;
  }
}
