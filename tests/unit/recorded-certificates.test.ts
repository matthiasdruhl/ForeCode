import { afterEach, describe, expect, it, vi } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as protectedStore from "@/server/artifacts/evaluation-store";
import {
  composeRecordedCertificate,
  loadRecordedCertificates,
  type CertificateCatalog,
} from "@/server/artifacts/recorded-certificates";
import { loadApprovedCertificates } from "@/server/artifacts/recording-catalog";
import { assembleCertificate } from "@/lib/report/certificate";
import { canonicalJson } from "@/lib/report/canonical";
import { certificateDigest, jsonDigest, sha256 } from "@/lib/report/digests";
import { selectCertificateExport } from "@/lib/report/certificate-export";
import { DemoResponseSchema } from "@/lib/contracts/api";
import {
  CertificateV1Schema,
  ExperimentRunV1Schema,
} from "@/lib/contracts/evidence";
import { RecordedCertificatesView } from "@/components/recorded-certificates";
import * as exportControl from "@/components/certificate-export";
import { demoHttp } from "@/server/http/demo";
import { syntheticCertificateFixture } from "../support/recorded-certificates";
import { privateSentinel } from "../support/recorded-verification";
import { check, hash, researchContext, time } from "../support/research-data";

const cleanup: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
const html = (catalog: CertificateCatalog) =>
  renderToStaticMarkup(createElement(RecordedCertificatesView, { catalog }));
async function setup(results?: ReturnType<typeof check>[]) {
  const fixture = await syntheticCertificateFixture(cleanup, results);
  const trusted = await fixture.trusted();
  if (!trusted) throw new Error("Synthetic setup failed");
  const report = composeRecordedCertificate(fixture.registration, [trusted]);
  const { artifactSha256: _self, ...input } = report.certificate;
  void _self;
  const records = {
    intents: [],
    decision: null,
    scenarios: [],
    runs: report.runs,
    receipts: [trusted.receipt],
    verifications: [trusted.verification],
  };
  return { fixture, trusted, report, input, records };
}
const load = (f: Awaited<ReturnType<typeof syntheticCertificateFixture>>) =>
  loadRecordedCertificates(f.certificateConfig);

describe("scoped recorded certificates", () => {
  it("requires original authenticated objects even when pure construction and hashing succeed", async () => {
    const { fixture, trusted, input, records, report } = await setup();
    const pure = assembleCertificate(input, structuredClone(records));
    expect(pure.certificate.artifactSha256).toBe(
      certificateDigest(pure.certificate),
    );
    for (const fake of [
      {},
      { ...trusted },
      structuredClone(trusted),
      JSON.parse(JSON.stringify(trusted)),
      pure,
      report.recordings[0],
      {
        ...trusted,
        issuer: "trusted-local-evaluator",
        origin: "trusted_evaluator",
      },
    ]) {
      expect(() =>
        composeRecordedCertificate(fixture.registration, [fake]),
      ).toThrow("Authenticated evaluations required");
    }
    expect(() =>
      composeRecordedCertificate(fixture.registration, []),
    ).toThrow();
    expect(() =>
      composeRecordedCertificate(fixture.registration, [
        trusted,
        structuredClone(trusted),
      ]),
    ).toThrow("Authenticated evaluations required");
  });
  it.each([
    ["VERIFIED", [check("baseline"), check("regression")]],
    ["REJECTED", [check("baseline", "fail"), check("regression")]],
    ["REJECTED", [check("baseline", "fail")]],
    ["INSUFFICIENT_EVIDENCE", [check("baseline")]],
    [
      "INSUFFICIENT_EVIDENCE",
      [check("baseline"), check("regression", "invalid")],
    ],
    [
      "INSUFFICIENT_EVIDENCE",
      [check("baseline"), check("regression", "not_run")],
    ],
  ] as const)(
    "retains %s, including required failure with missing evidence",
    async (verdict, results) => {
      const { fixture, report } = await setup([...results]);
      expect(report.recordings[0]!.verdict).toBe(verdict);
      expect(report.certificate.conclusion).toContain(`1 ${verdict}`);
      const catalog = await load(fixture);
      expect(catalog.demo.certificates).toEqual([report.certificate]);
      expect(html(catalog)).toContain(verdict);
      expect(report.runs[0]!.status).toBe("completed");
      expect(report.certificate.evidenceOrigin).toBe("none");
    },
  );
  it("never replaces a missing required check with an optional pass", async () => {
    const f = await syntheticCertificateFixture(cleanup, [
      check("baseline"),
      check("optional"),
    ]);
    f.registration.sources[0]!.recording.metadata.checks.push({
      id: "optional",
      label: "Synthetic optional",
      description: "Synthetic optional only.",
      publishArtifactDigest: false,
    });
    expect((await load(f)).reports[0]!.recordings[0]!.verdict).toBe(
      "INSUFFICIENT_EVIDENCE",
    );
  });
  it("exports the exact frozen shape and independently computed self-digest omission", async () => {
    const { fixture, report } = await setup();
    const response = await demoHttp(
      new Request("https://example.test/api/demo"),
      () => load(fixture),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const demo = await response.json();
    expect(Object.keys(demo).sort()).toEqual([
      "certificates",
      "mode",
      "runs",
      "schemaVersion",
    ]);
    expect(DemoResponseSchema.parse(demo)).toEqual(demo);
    expect(ExperimentRunV1Schema.parse(demo.runs[0])).toEqual(
      fixture.registration.sources[0]!.recording.run,
    );
    const output = selectCertificateExport(
      demo,
      report.certificate.id,
      report.certificate.artifactSha256,
    );
    const cert = JSON.parse(output.json);
    expect(CertificateV1Schema.parse(cert)).toEqual(report.certificate);
    expect(output.json).toBe(canonicalJson(report.certificate));
    const { artifactSha256, ...content } = cert;
    expect(artifactSha256).toBe(sha256(canonicalJson(content)));
    expect(jsonDigest(cert)).not.toBe(artifactSha256);
    expect(certificateDigest({ ...cert, artifactSha256: hash("f") })).toBe(
      artifactSha256,
    );
    expect(cert.experimentRunIds).toEqual([demo.runs[0].id]);
    expect(cert.receiptIds).toEqual([demo.runs[0].receiptId]);
    expect(cert.verificationIds).toEqual([demo.runs[0].verificationId]);
    expect(Object.keys(cert).sort()).toEqual(
      [
        "schemaVersion",
        "id",
        "baselineCommit",
        "intentRevisions",
        "scenarioIds",
        "decisionId",
        "experimentRunIds",
        "verificationIds",
        "receiptIds",
        "conclusion",
        "limitations",
        "generatedAt",
        "evidenceOrigin",
        "presentationMode",
        "artifactSha256",
      ].sort(),
    );
    expect(cert).not.toHaveProperty("verdict");
    expect(cert).not.toHaveProperty("checks");
  });
  it.each([
    "id",
    "receiptId",
    "verificationId",
    "repoCommit",
    "evaluatedTreeSha256",
    "fixtureSha256",
    "evaluatorSha256",
    "requiredPolicySha256",
    "startedAt",
    "endedAt",
    "presentationMode",
  ] as const)(
    "rejects approved run %s relationship mismatch",
    async (field) => {
      const f = await syntheticCertificateFixture(cleanup);
      const source = f.registration.sources[0]!;
      const run = source.recording.run!;
      if (field.endsWith("Sha256")) Object.assign(run, { [field]: hash("f") });
      else if (field === "repoCommit") run.repoCommit = "f".repeat(40);
      else if (field === "startedAt")
        run.startedAt = "2026-10-27T00:00:00.000Z";
      else if (field === "endedAt") run.endedAt = "2026-10-25T00:00:00.000Z";
      else if (field === "presentationMode") run.presentationMode = "live";
      else Object.assign(run, { [field]: "mismatched-id" });
      source.publicRunSha256 = jsonDigest(run);
      expect((await load(f)).reports).toEqual([]);
    },
  );
  it.each(["runId", "receiptId", "verificationId"] as const)(
    "rejects mismatched approved recording %s",
    async (field) => {
      const f = await syntheticCertificateFixture(cleanup);
      f.registration.sources[0]!.recording.metadata[field] = "other-id";
      expect((await load(f)).reports).toEqual([]);
    },
  );
  it("requires approved baseline, coherent receipt/run time and explicit later generation", async () => {
    const { fixture, trusted } = await setup();
    const registration = fixture.registration;
    for (const change of [
      { baselineCommit: "f".repeat(40) },
      { generatedAt: "2026-10-25T00:00:00.000Z" },
    ]) {
      expect(() =>
        composeRecordedCertificate(
          {
            ...registration,
            approval: { ...registration.approval, ...change },
          },
          [trusted],
        ),
      ).toThrow();
    }
    // Both intervals are individually ordered, but receipt is outside this run.
    const source = registration.sources[0]!;
    source.recording.run!.startedAt = "2026-10-26T22:00:00.000Z";
    source.recording.run!.endedAt = "2026-10-26T23:00:00.000Z";
    source.publicRunSha256 = jsonDigest(source.recording.run);
    expect(() => composeRecordedCertificate(registration, [trusted])).toThrow(
      "Run/receipt time mismatch",
    );
  });
  it("does not invent runs or accept incomplete publication approvals", async () => {
    const f = await syntheticCertificateFixture(cleanup);
    const source = f.registration.sources[0]!;
    const original = source.recording.run;
    source.recording.run = null;
    expect((await load(f)).demo).toEqual({
      schemaVersion: "demo.v1",
      runs: [],
      certificates: [],
      mode: "recorded",
    });
    source.recording.run = original;
    source.publicRunSha256 = hash("f");
    expect((await load(f)).reports).toEqual([]);
    source.publicRunSha256 = jsonDigest(original);
    source.recording.run!.metrics.tokens = 0;
    expect((await load(f)).reports).toEqual([]);
  });
  it("never upgrades infrastructure or unmeasured evidence, or synthesizes historical context", async () => {
    const { fixture, trusted, report } = await setup();
    expect(report.certificate.intentRevisions).toEqual([]);
    expect(report.certificate.scenarioIds).toEqual([]);
    expect(report.certificate.decisionId).toBeNull();
    expect(report.runs[0]!.isolationAttestationId).toBeNull();
    expect(report.certificate.conclusion).not.toMatch(
      /B beat A|Meta improved|fair experiment/i,
    );
    fixture.registration.approval.evidenceOrigin = "measured";
    expect((await load(fixture)).reports).toEqual([]);
    const source = fixture.registration.sources[0]!;
    source.recording.run!.evidenceOrigin = "measured";
    source.recording.run!.isolationAttestationId =
      "synthetic-source-attestation";
    source.publicRunSha256 = jsonDigest(source.recording.run);
    expect(() =>
      composeRecordedCertificate(fixture.registration, [trusted]),
    ).toThrow("Unsupported measured provenance");
    fixture.registration.approval.evidenceOrigin = "none";
    const withContext = {
      ...fixture.registration,
      historicalContext: researchContext(),
    };
    expect(() => composeRecordedCertificate(withContext, [trusted])).toThrow();
  });
  it.each([
    "bundle",
    "evidence",
    "source",
    "root",
    "bundlePin",
    "policyPin",
    "treePin",
    "suitePin",
  ])("rechecks %s after successful display and export", async (target) => {
    const { fixture, report } = await setup();
    const before = await load(fixture);
    expect(
      selectCertificateExport(
        before.demo,
        report.certificate.id,
        report.certificate.artifactSha256,
      ).json,
    ).toContain("certificate.v1");
    if (target === "bundle" || target === "evidence")
      await writeFile(
        path.join(
          fixture.directory,
          target === "bundle"
            ? "evaluation.json"
            : fixture.bundle.checks[0]!.evidencePath!,
        ),
        "changed bytes",
      );
    else if (target === "source" || target === "root")
      await rm(
        target === "source" ? fixture.directory : fixture.config.store.root,
        { recursive: true },
      );
    else {
      const entry = fixture.config.store.entries.get("synthetic-evaluation")!;
      if (target === "bundlePin") entry.bundleSha256 = hash("f");
      else
        entry.identity[
          target === "policyPin"
            ? "requiredPolicySha256"
            : target === "treePin"
              ? "evaluatedTreeSha256"
              : "testSuiteSha256"
        ] = hash("f");
    }
    const after = await load(fixture);
    expect(after.reports).toEqual([]);
    expect(after.demo.runs).toEqual([]);
    expect(() =>
      selectCertificateExport(
        after.demo,
        report.certificate.id,
        report.certificate.artifactSha256,
      ),
    ).toThrow("unavailable or changed");
    const fresh = await demoHttp(
      new Request("https://example.test/api/demo"),
      () => load(fixture),
    );
    expect((await fresh.json()).certificates).toEqual([]);
    expect(html(after)).not.toContain("VERIFIED · scoped");
  });
  it("requires complete public check approval and never selectively hides failures", async () => {
    const f = await syntheticCertificateFixture(cleanup, [
      check("baseline"),
      check("regression"),
      check("optional", "fail"),
    ]);
    expect((await load(f)).reports).toEqual([]);
  });
  it("fails malformed/duplicate registrations closed and allows independent unavailable reports", async () => {
    const f = await syntheticCertificateFixture(cleanup);
    f.certificateConfig.certificates.push(f.registration);
    const spy = vi.spyOn(protectedStore, "createProtectedEvaluationStore");
    expect((await load(f)).reports).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    f.certificateConfig.certificates.pop();
    const missing = structuredClone(f.registration);
    missing.approval.id = "aaa-unavailable";
    missing.sources[0]!.recording.run = null;
    f.certificateConfig.certificates.push(missing);
    expect((await load(f)).reports.map((r) => r.certificate.id)).toEqual([
      "synthetic-certificate",
    ]);
  });
  it("does not accept duplicate or mismatched source sets", async () => {
    const { fixture, trusted, input, records } = await setup();
    expect(() =>
      composeRecordedCertificate(
        {
          ...fixture.registration,
          sources: [
            fixture.registration.sources[0]!,
            fixture.registration.sources[0]!,
          ],
        },
        [trusted, trusted],
      ),
    ).toThrow();
    for (const field of [
      "experimentRunIds",
      "verificationIds",
      "receiptIds",
      "scenarioIds",
    ] as const) {
      const refs = input[field];
      for (const invalid of [[], [...refs, "missing"], [...refs, ...refs]]) {
        if (canonicalJson(invalid) === canonicalJson(refs)) continue;
        expect(() =>
          assembleCertificate({ ...input, [field]: invalid }, records),
        ).toThrow();
      }
    }
    expect(() =>
      assembleCertificate(input, {
        ...records,
        runs: [...records.runs, { ...records.runs[0]!, id: "extraneous" }],
      }),
    ).toThrow();
    const context = researchContext();
    expect(() =>
      assembleCertificate(
        {
          ...input,
          intentRevisions: [{ intentId: context.intents[0]!.id, revision: 99 }],
        },
        { ...records, intents: context.intents },
      ),
    ).toThrow();
    expect(() =>
      assembleCertificate(
        { ...input, scenarioIds: [context.scenarios[0]!.id] },
        {
          ...records,
          scenarios: [
            { ...context.scenarios[0]!, baselineCommit: "f".repeat(40) },
          ],
        },
      ),
    ).toThrow();
    expect(() =>
      assembleCertificate({ ...input, decisionId: "unbound" }, records),
    ).toThrow();
  });
  it("preserves null and zero and allowlists every public field, including client props and download bytes", async () => {
    const { fixture, report } = await setup();
    const catalog = await load(fixture);
    const captured: unknown[] = [];
    vi.spyOn(exportControl, "CertificateExport").mockImplementation((props) => {
      captured.push(props);
      return createElement("button", null, "Export certificate JSON");
    });
    const rendered = html(catalog);
    expect(catalog.demo.runs[0]!.metrics).toEqual({
      elapsedMs: 0,
      tokens: null,
      costUsd: 0,
      iterations: null,
      filesTouched: null,
    });
    expect(Object.keys(report).sort()).toEqual([
      "certificate",
      "recordings",
      "runs",
      "scope",
      "title",
    ]);
    const clientProps = {
      id: report.certificate.id,
      digest: report.certificate.artifactSha256,
    };
    const download = selectCertificateExport(
      catalog.demo,
      clientProps.id,
      clientProps.digest,
    );
    expect(captured).toEqual([clientProps]);
    for (const output of [
      rendered,
      JSON.stringify(catalog),
      JSON.stringify(clientProps),
      download.json,
    ]) {
      for (const forbidden of [
        privateSentinel,
        fixture.parent,
        "evidencePath",
        "stdout",
        "stderr",
        "testBody",
        "private test contents",
        "synthetic-secret-token",
        "bundleSha256",
        "agentWorkspaceRoot",
        "hidden-case description",
      ])
        expect(output).not.toContain(forbidden);
    }
    expect(html(catalog)).toContain("<dd>0</dd>");
    expect(html(catalog)).toContain("<dd>Unknown</dd>");
    expect(html(catalog)).toContain("not a signature");
    expect(html(catalog)).toContain("not a signed attestation");
    const source = fixture.registration.sources[0]!;
    Object.assign(source.recording.run!, { privatePath: privateSentinel });
    expect((await load(fixture)).reports).toEqual([]);
  });
  it("renders public text inertly without copying arbitrary raw check text into conclusions", async () => {
    const f = await syntheticCertificateFixture(cleanup);
    f.registration.approval.title = '<script>alert("test")</script>';
    const catalog = await load(f);
    expect(html(catalog)).toContain("&lt;script&gt;");
    expect(html(catalog)).not.toContain("<script");
    expect(catalog.demo.certificates[0]!.conclusion).not.toContain(
      privateSentinel,
    );
  });
  it("is reproducible, ordered and never mutates inputs", async () => {
    const { input, records, fixture, trusted } = await setup();
    const before = canonicalJson({
      input,
      records,
      registration: fixture.registration,
    });
    Object.freeze(input.limitations);
    Object.freeze(input);
    Object.freeze(fixture.registration);
    const first = assembleCertificate(input, records);
    expect(
      assembleCertificate(
        { ...input, limitations: [...input.limitations].reverse() },
        records,
      ),
    ).toEqual(first);
    expect(
      composeRecordedCertificate(fixture.registration, [trusted]).certificate,
    ).toEqual(first.certificate);
    expect(
      canonicalJson({ input, records, registration: fixture.registration }),
    ).toBe(before);
    expect(
      assembleCertificate(
        { ...input, generatedAt: "2026-10-27T00:00:00.000Z" },
        records,
      ).json,
    ).not.toBe(first.json);
    const duplicate = { ...input, limitations: [...input.limitations] };
    expect(
      assembleCertificate(duplicate, records).certificate.generatedAt,
    ).toBe(time);
  });
  it("sorts multiple reference sets reproducibly without inferring a pair", async () => {
    const { input, records } = await setup();
    const run = {
      ...records.runs[0]!,
      id: "aaa-run",
      receiptId: "aaa-receipt",
      verificationId: "aaa-verification",
      variant: "B" as const,
    };
    const receipt = {
      ...records.receipts[0]!,
      id: run.receiptId,
      runId: run.id,
    };
    const verification = {
      ...records.verifications[0]!,
      id: run.verificationId,
      runId: run.id,
      receiptId: receipt.id,
      checks: records.verifications[0]!.checks.map((check) => ({
        ...check,
        runId: run.id,
      })),
    };
    const fullInput = {
      ...input,
      experimentRunIds: [...input.experimentRunIds, run.id],
      receiptIds: [...input.receiptIds, receipt.id],
      verificationIds: [...input.verificationIds, verification.id],
    };
    const sources = {
      ...records,
      runs: [...records.runs, run],
      receipts: [...records.receipts, receipt],
      verifications: [...records.verifications, verification],
    };
    const before = canonicalJson({ fullInput, sources });
    const first = assembleCertificate(fullInput, sources);
    const reversed = assembleCertificate(
      {
        ...fullInput,
        experimentRunIds: [...fullInput.experimentRunIds].reverse(),
        receiptIds: [...fullInput.receiptIds].reverse(),
        verificationIds: [...fullInput.verificationIds].reverse(),
      },
      {
        ...sources,
        runs: [...sources.runs].reverse(),
        receipts: [...sources.receipts].reverse(),
        verifications: [...sources.verifications].reverse(),
      },
    );
    expect(reversed).toEqual(first);
    expect(first.certificate.experimentRunIds).toEqual(["aaa-run", "run-unit"]);
    expect(canonicalJson({ fullInput, sources })).toBe(before);
    expect(first.certificate.decisionId).toBeNull();
    expect(first.certificate).not.toHaveProperty("pairId");
  });
  it.each([
    "id",
    "evaluationId",
    "runId",
    "receiptId",
    "verificationId",
  ] as const)(
    "rejects duplicate source %s before filesystem access",
    async (field) => {
      const f = await syntheticCertificateFixture(cleanup);
      const second = structuredClone(f.registration.sources[0]!);
      for (const key of [
        "id",
        "evaluationId",
        "runId",
        "receiptId",
        "verificationId",
      ] as const)
        second.recording.metadata[key] = `second-${key}`;
      second.recording.metadata[field] =
        f.registration.sources[0]!.recording.metadata[field];
      f.certificateConfig.certificates = [
        { ...f.registration, sources: [...f.registration.sources, second] },
      ];
      const spy = vi.spyOn(protectedStore, "createProtectedEvaluationStore");
      expect((await load(f)).reports).toEqual([]);
      expect(spy).not.toHaveBeenCalled();
    },
  );
  it("returns empty defaults without reading filesystem configuration", async () => {
    const spy = vi.spyOn(protectedStore, "createProtectedEvaluationStore");
    const config = {
      certificates: [],
      get store(): never {
        throw new Error("must not access");
      },
    };
    expect(await loadRecordedCertificates(config)).toEqual(
      await loadApprovedCertificates(),
    );
    expect(spy).not.toHaveBeenCalled();
    expect(html(await loadApprovedCertificates())).toContain(
      "No approved recorded certificates available.",
    );
  });
  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])(
    "rejects %s via the safe no-store error convention",
    async (method) => {
      const response = await demoHttp(
        new Request("https://example.test/api/demo", { method }),
      );
      expect(response.status).toBe(422);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect((await response.json()).error.code).toBe("UNSUPPORTED_OPERATION");
    },
  );
  it("rejects request-selected configuration and never exposes failures", async () => {
    const query = await demoHttp(
      new Request("https://example.test/api/demo?root=private"),
    );
    expect(query.status).toBe(400);
    const failed = await demoHttp(
      new Request("https://example.test/api/demo"),
      async () => {
        throw new Error(privateSentinel);
      },
    );
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain(privateSentinel);
  });
});
