// Synthetic source records and approvals, authored for this slice. Never shipped.
import { syntheticRecordingFixture } from "./recorded-verification";
import { experimentRun, commit, time } from "./research-data";
import { jsonDigest } from "@/lib/report/digests";
import type { CheckResultV1 } from "@/lib/contracts/evidence";
import type { CertificateRegistration } from "@/server/artifacts/recorded-certificates";

export async function syntheticCertificateFixture(
  cleanup: string[],
  checks?: CheckResultV1[],
) {
  const fixture = await syntheticRecordingFixture(cleanup, checks);
  const recording = fixture.config.recordings[0]!;
  // This new synthetic original is approved in full, unlike the separate
  // recording-only fixture's deliberately private run limitations.
  recording.run = {
    ...experimentRun(),
    isolationAttestationId: null,
    limitations: ["Synthetic public run for tests only; no real measurement."],
    metrics: {
      elapsedMs: 0,
      tokens: null,
      costUsd: 0,
      iterations: null,
      filesTouched: null,
    },
  };
  const registration: CertificateRegistration = {
    approval: {
      id: "synthetic-certificate",
      title: "Synthetic certificate — test only",
      scope: "Synthetic infrastructure checks only.",
      baselineCommit: commit,
      generatedAt: time,
      evidenceOrigin: "none",
      limitations: ["Synthetic inputs, never historical production evidence."],
    },
    sources: [{ recording, publicRunSha256: jsonDigest(recording.run) }],
  };
  return {
    ...fixture,
    registration,
    certificateConfig: {
      certificates: [registration],
      store: fixture.config.store,
    },
  };
}
