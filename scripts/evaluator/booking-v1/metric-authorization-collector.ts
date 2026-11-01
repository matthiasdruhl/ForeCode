// Private operator assembly only. No candidate execution, signer or web import.
import {
  TeamAuthorizationExportSchema,
  TeamAuthorizationInstrumentationSchema,
  authorizationInstrumentationDigest,
} from "./team-authorization";
import { teamOnlyCheckIds } from "./grade-profile";
import { MetricProtocolSchema } from "../../../src/lib/experiment/prospective-metrics";
import {
  isTrustedEvaluation,
  hasAuthorizationTelemetryFailure,
} from "../../../src/server/artifacts/evaluation-store";
import { invariant, sameIds } from "../../../src/lib/contracts/validation";
import { jsonDigest } from "../../../src/lib/report/digests";
import {
  ProtectedAuthorizationObservationSchema,
  readProtectedAuthorizationCases,
} from "./metric-authorization";

// Final independent snapshot custody authenticates this document separately.
// A JSON export and a receipt alone do not authenticate instrumentation/cases.
export function collectProtectedAuthorizationOriginal(input: {
  instrumentation: unknown;
  exported: unknown;
  protocol: unknown;
  evaluation: unknown;
}) {
  const descriptor = TeamAuthorizationInstrumentationSchema.parse(
    input.instrumentation,
  );
  const data = TeamAuthorizationExportSchema.parse(input.exported);
  const protocol = MetricProtocolSchema.parse(input.protocol);
  const evaluation = input.evaluation;
  invariant(
    isTrustedEvaluation(evaluation),
    "Authenticated protected receipt required.",
  );
  invariant(
    !hasAuthorizationTelemetryFailure(evaluation),
    "Protected authorization telemetry unavailable.",
  );
  const receipt = evaluation.receipt;
  invariant(
    sameIds(
      descriptor.cases.map((c) => c.caseId),
      protocol.authorizationCaseIds,
    ),
    "Registered authorization inventory mismatch.",
  );
  invariant(
    data.instrumentationSha256 ===
      authorizationInstrumentationDigest(descriptor),
    "Authorization instrumentation mismatch.",
  );
  invariant(
    sameIds(
      data.groups.map((g) => g.checkId),
      [...teamOnlyCheckIds],
    ),
    "Missing or duplicate authorization group.",
  );
  const cases = [];
  for (const group of data.groups) {
    invariant(
      JSON.stringify(group.identity) === JSON.stringify(data.identity) &&
        group.instrumentationSha256 === data.instrumentationSha256,
      "Cross-run authorization checkpoint.",
    );
    invariant(
      group.finalized && group.complete,
      "Incomplete protected authorization observation.",
    );
    const expected = descriptor.cases
      .filter((c) => c.checkId === group.checkId)
      .map((c) => c.caseId);
    invariant(
      sameIds(
        group.cases.map((c) => c.caseId),
        expected,
      ),
      "Missing, repeated or unexpected authorization case.",
    );
    const check = evaluation.checks.find((c) => c.id === group.checkId);
    invariant(
      check && check.status === group.groupOutcome,
      "Protected authorization group/receipt mismatch.",
    );
    invariant(
      group.cases.every((c) => c.outcome === "pass" || c.outcome === "fail") &&
        !(
          check.status === "pass" &&
          group.cases.some((c) => c.outcome === "fail")
        ),
      "Invalid authorization case/group outcome.",
    );
    cases.push(...group.cases);
  }
  invariant(
    (
      [
        "runId",
        "evaluatedTreeSha256",
        "evaluatorSha256",
        "testSuiteSha256",
        "requiredPolicySha256",
      ] as const
    ).every((k) => data.identity[k] === receipt[k]),
    "Protected authorization run/source identity mismatch.",
  );
  const observation = ProtectedAuthorizationObservationSchema.parse({
    schemaVersion: "protected-authorization-cases.local.v1",
    identity: {
      runId: receipt.runId,
      evaluatedTreeSha256: receipt.evaluatedTreeSha256,
      fixtureSha256: receipt.fixtureSha256,
      evaluatorSha256: receipt.evaluatorSha256,
      testSuiteSha256: receipt.testSuiteSha256,
      requiredPolicySha256: receipt.requiredPolicySha256,
      requiredCheckIds: receipt.requiredCheckIds,
    },
    receiptSha256: jsonDigest(receipt),
    cases,
  });
  readProtectedAuthorizationCases(observation, protocol, evaluation);
  return observation;
}
