// Public component-only synthetic states. Never loaded by production code.
import type { CertificateCatalog } from "../../src/server/artifacts/recorded-certificates";
import type { CertificateV1 } from "../../src/lib/contracts/evidence";
import { certificateDigest } from "../../src/lib/report/digests";

export function syntheticCertificateCatalog(): CertificateCatalog {
  const reports: CertificateCatalog["reports"] = [
    "VERIFIED",
    "REJECTED",
    "INSUFFICIENT_EVIDENCE",
  ].map((verdict, index) => {
    const id = `synthetic-${index}`;
    const run = {
      schemaVersion: "experiment-run.v1" as const,
      id: `run-${id}`,
      variant: "A" as const,
      status: "completed" as const,
      repoCommit: "1".repeat(40),
      evaluatedTreeSha256: "2".repeat(64),
      fixtureSha256: "3".repeat(64),
      agentConfigSha256: "4".repeat(64),
      evaluatorSha256: "5".repeat(64),
      requiredPolicySha256: "6".repeat(64),
      isolationAttestationId: null,
      seed: null,
      startedAt: "2026-10-26T21:00:00.000Z",
      endedAt: "2026-10-26T21:00:00.000Z",
      verificationId: `verify-${id}`,
      receiptId: `receipt-${id}`,
      metrics: {
        elapsedMs: 0,
        tokens: null,
        costUsd: 0,
        iterations: null,
        filesTouched: null,
      },
      evidenceOrigin: "none" as const,
      presentationMode: "recorded" as const,
      limitations: ["Synthetic browser test only."],
    };
    const certificate: CertificateV1 = {
      schemaVersion: "certificate.v1",
      id,
      baselineCommit: run.repoCommit,
      intentRevisions: [],
      scenarioIds: [],
      decisionId: null,
      experimentRunIds: [run.id],
      verificationIds: [run.verificationId],
      receiptIds: [run.receiptId],
      conclusion: `Synthetic scoped outcome ${verdict}; never real evidence.`,
      limitations: [
        "Synthetic browser test only. No architecture benefit established.",
      ],
      generatedAt: run.endedAt,
      evidenceOrigin: "none",
      presentationMode: "recorded",
      artifactSha256: "0".repeat(64),
    };
    certificate.artifactSha256 = certificateDigest(certificate);
    return {
      certificate,
      runs: [run],
      title: `Synthetic ${verdict} — test only`,
      scope: '<img src=x onerror="window.injected=true">',
      recordings: [
        {
          state: "available",
          id,
          title: `Synthetic checks ${verdict}`,
          presentation: "recorded",
          category: "infrastructure_acceptance",
          scope: "Synthetic scope only.",
          runId: run.id,
          receiptId: run.receiptId,
          verificationId: run.verificationId,
          runStatus: "completed",
          verdict: verdict as "VERIFIED" | "REJECTED" | "INSUFFICIENT_EVIDENCE",
          checks: [
            {
              id: "baseline",
              label: "Synthetic required check",
              description: "Synthetic required outcome.",
              required: true,
              status: verdict === "REJECTED" ? "fail" : "pass",
              artifactSha256: "7".repeat(64),
            },
            {
              id: "other",
              label: "Synthetic other required",
              description: "Synthetic other outcome.",
              required: true,
              status: verdict === "VERIFIED" ? "pass" : "missing",
              artifactSha256: null,
            },
          ],
          identities: [],
          metrics: [
            { name: "elapsedMs", value: 0 },
            { name: "tokens", value: null },
          ],
          limitations: ["Synthetic test only."],
        },
      ],
    };
  });
  return {
    reports,
    demo: {
      schemaVersion: "demo.v1",
      runs: reports.flatMap((r) => r.runs),
      certificates: reports.map((r) => r.certificate),
      mode: "recorded",
    },
  };
}
