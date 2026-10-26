import { describe, expect, it } from "vitest";
import { canonicalJson } from "@/lib/report/canonical";
import {
  certificateDigest,
  checkArtifactDigest,
  jsonDigest,
  receiptManifestDigest,
  sha256,
} from "@/lib/report/digests";
import { assembleEvaluatorReceipt } from "../../scripts/evaluator/booking-v1/receipt";
import {
  check,
  evaluationIdentity,
  hash,
  time,
} from "../support/research-data";
import { CertificateV1Schema } from "@/lib/contracts/evidence";

describe("canonical evidence digests", () => {
  it("uses ECMAScript number serialization and UTF-16 property ordering", () => {
    expect(canonicalJson({ z: -0, a: [1e30, 1e-7, "line\ntext"] })).toBe(
      '{"a":[1e+30,1e-7,"line\\ntext"],"z":0}',
    );
    expect(canonicalJson({ "\uE000": 1, "😀": 2 })).toBe('{"😀":2,"\uE000":1}');
    expect(jsonDigest({ a: 1, z: 2 })).toBe(jsonDigest({ z: 2, a: 1 }));
    expect(sha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it.each([
    NaN,
    Infinity,
    undefined,
    BigInt(2),
    "\ud800",
    new Date(),
    [undefined],
    Array(1),
  ])("rejects non-I-JSON values", (value) => {
    expect(() => canonicalJson(value)).toThrow();
  });
  it("does not execute accessors or recursively follow cycles", () => {
    let accessed = false;
    const accessor = {
      get key() {
        accessed = true;
        return "secret";
      },
    };
    expect(() => canonicalJson(accessor)).toThrow();
    expect(accessed).toBe(false);
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(() => canonicalJson(cycle)).toThrow();
  });
  it("sorts checks by identity and omits only the receipt's self-hash leaf", () => {
    const checks = [check("regression"), check("baseline")];
    const bundle = assembleEvaluatorReceipt({
      id: "receipt-unit",
      identity: evaluationIdentity(),
      checks,
      startedAt: time,
      finishedAt: time,
    });
    expect(checkArtifactDigest(checks)).toBe(
      checkArtifactDigest([...checks].reverse()),
    );
    expect(receiptManifestDigest(bundle.receipt)).toBe(
      bundle.receipt.integrity.manifestSha256,
    );
    expect(
      receiptManifestDigest({
        ...bundle.receipt,
        integrity: { ...bundle.receipt.integrity, manifestSha256: hash("f") },
      }),
    ).toBe(bundle.receipt.integrity.manifestSha256);
    expect(
      receiptManifestDigest({ ...bundle.receipt, runId: "changed" }),
    ).not.toBe(bundle.receipt.integrity.manifestSha256);
  });
  it("has no self-hash cycle when serializing a certificate", () => {
    const certificate = CertificateV1Schema.parse({
      schemaVersion: "certificate.v1",
      id: "certificate-unit",
      baselineCommit: "1".repeat(40),
      intentRevisions: [],
      scenarioIds: [],
      decisionId: null,
      experimentRunIds: [],
      verificationIds: [],
      receiptIds: [],
      conclusion: "No measured experiment has been run.",
      limitations: ["Synthetic unit input."],
      generatedAt: time,
      evidenceOrigin: "none",
      presentationMode: "recorded",
      artifactSha256: hash("0"),
    });
    const digest = certificateDigest(certificate);
    certificate.artifactSha256 = digest;
    expect(certificateDigest(certificate)).toBe(digest);
  });
});
