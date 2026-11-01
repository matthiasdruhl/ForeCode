import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  verifyRecording,
  verifyRecordingDirectory,
} from "../../scripts/meta/verify-live-recording";
import {
  recordingFiles,
  verifyManifest,
} from "../../scripts/meta/recording-manifest";
import { jsonDigest } from "@/lib/report/digests";
const directory = resolve("docs/recordings/live-meta-scientist-20261101");
const fresh = () =>
  Object.fromEntries(
    recordingFiles.map((f) => [
      f,
      JSON.parse(readFileSync(join(directory, f), "utf8")),
    ]),
  );
const rehash = (f: ReturnType<typeof fresh>, name: string) => {
  f["manifest.json"].files[name] = jsonDigest(f[name]);
};

describe("offline live recording consistency", () => {
  it("accepts untouched historical originals and lists unverifiable claims", () => {
    expect(verifyRecordingDirectory(directory)).toContain(
      "does not independently authenticate",
    );
    expect(verifyManifest(fresh()).unchecked).toContain(
      "Historical HTTPS/source execution",
    );
  });
  it.each([
    "sourceCommit",
    "model",
    "promptVersion",
    "hypothesisId",
    "challengeHypothesisId",
    "proposalContextIdentity",
    "hypothesisIdentity",
    "scenarioSnapshotsIdentity",
  ])("rejects changed manifest %s", (key) => {
    const f = fresh();
    f["manifest.json"][key] = "f".repeat(64);
    expect(() => verifyRecording(f)).toThrow();
  });
  it.each([
    "time",
    "provider-time",
    "tokens",
    "token-detail",
    "cost",
    "identity",
    "request-identity",
    "response-identity",
    "model-content",
    "handoff",
    "lineage",
    "response-bytes",
  ])("rejects %s even after rehash", (kind) => {
    const f = fresh(),
      name = "hypothesize-provider-observation.json",
      o = f[name];
    if (kind === "time") o.startedAt = "2026-11-02T04:07:46.363Z";
    if (kind === "provider-time") o.providerCreatedUnixSeconds += 86400;
    if (kind === "tokens") o.usage.total_tokens++;
    if (kind === "token-detail")
      o.usage.completion_tokens_details.reasoning_tokens = 99999;
    if (kind === "cost") o.estimatedCostUsd += 1;
    if (kind === "identity")
      o.transportResponseIdentity =
        f["propose-provider-observation.json"].transportResponseIdentity;
    if (kind === "request-identity")
      o.operatorRawRequestIdSha256 =
        f["propose-provider-observation.json"].operatorRawRequestIdSha256;
    if (kind === "response-identity")
      o.operatorRawResponseIdSha256 =
        f["propose-provider-observation.json"].operatorRawResponseIdSha256;
    if (kind === "model-content")
      o.originalAssistantContent = o.originalAssistantContent.replace(
        "boundary_violations",
        "required_check_success",
      );
    if (kind === "response-bytes")
      o.originalApplicationResponseBytesSha256 = "f".repeat(64);
    if (kind === "handoff") {
      f["challenge-request.json"].intents[0].revision++;
      rehash(f, "challenge-request.json");
    }
    if (kind === "lineage") {
      f["challenge-response.json"].challenges[0].hypothesisId =
        "ffffffff-ffff-4fff-8fff-ffffffffffff";
      rehash(f, "challenge-response.json");
    }
    rehash(f, name);
    expect(() => verifyRecording(f)).toThrow();
  });
  it.each([
    "total",
    "cost",
    "reservation",
    "attempts",
    "stage-order",
    "stage-count",
    "graph",
    "intents",
    "scenarios",
    "candidates",
    "inventory",
    "extra-file",
  ])("rejects manifest %s", (kind) => {
    const f = fresh(),
      m = f["manifest.json"];
    if (kind === "total") m.spending.inputTokens++;
    if (kind === "cost") m.spending.estimatedCostUsd++;
    if (kind === "reservation") m.spending.maximumSixAttemptReservationUsd++;
    if (kind === "attempts") m.providerCalls.automaticRetries++;
    if (kind === "stage-order") m.steps.reverse();
    if (kind === "stage-count") m.steps.pop();
    if (kind === "graph") m.graph.baselineCommit = "f".repeat(40);
    if (kind === "intents") m.intentRevisions[0].revision++;
    if (kind === "scenarios") m.scenarioRevisions[0].id += "-changed";
    if (kind === "candidates") m.proposalCandidates.reverse();
    if (kind === "inventory") m.files["extra.json"] = "f".repeat(64);
    if (kind === "extra-file") f["extra.json"] = {};
    expect(() => verifyRecording(f)).toThrow();
  });
  it("rejects directory extras and symlinked inputs", () => {
    const root = mkdtempSync(join(tmpdir(), "forecode-recording-"));
    try {
      const f = fresh();
      for (const [name, value] of Object.entries(f))
        writeFileSync(join(root, name), JSON.stringify(value));
      writeFileSync(join(root, "extra.json"), "{}");
      expect(() => verifyRecordingDirectory(root)).toThrow();
      rmSync(join(root, "extra.json"));
      rmSync(join(root, "propose-request.json"));
      symlinkSync(
        join(directory, "propose-request.json"),
        join(root, "propose-request.json"),
      );
      expect(() => verifyRecordingDirectory(root)).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
