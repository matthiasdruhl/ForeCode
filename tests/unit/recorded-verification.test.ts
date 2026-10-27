import { afterEach, describe, expect, it, vi } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as protectedStore from "@/server/artifacts/evaluation-store";
import {
  loadRecordedVerifications,
  projectRecordedVerification,
  type RecordedCatalogView,
} from "@/server/artifacts/recorded-verification";
import { loadApprovedRecordings } from "@/server/artifacts/recording-catalog";
import { RecordedVerificationView } from "@/components/recorded-verification";
import { check, hash } from "../support/research-data";
import {
  privateSentinel,
  syntheticRecordingFixture,
  syntheticRegistration,
} from "../support/recorded-verification";

const cleanup: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    cleanup
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
const html = (catalog: RecordedCatalogView) =>
  renderToStaticMarkup(createElement(RecordedVerificationView, { catalog }));
async function available(results?: ReturnType<typeof check>[]) {
  const fixture = await syntheticRecordingFixture(cleanup, results);
  const catalog = await loadRecordedVerifications(fixture.config);
  const view = catalog.recordings[0]!;
  expect(view.state).toBe("available");
  if (view.state !== "available") throw new Error("Synthetic setup failed");
  return { fixture, catalog, view };
}

describe("recorded verification authentication and projection", () => {
  it("rejects plain, spread, cloned, serialized and issuer-labeled objects", async () => {
    const fixture = await syntheticRecordingFixture(cleanup);
    const trusted = await fixture.trusted();
    for (const fake of [
      null,
      {},
      { ...trusted },
      structuredClone(trusted),
      JSON.parse(JSON.stringify(trusted)),
      {
        ...trusted,
        origin: "trusted_evaluator",
        issuer: "trusted-local-evaluator",
      },
    ]) {
      expect(protectedStore.isTrustedEvaluation(fake)).toBe(false);
      expect(() =>
        projectRecordedVerification(fake, syntheticRegistration()),
      ).toThrow("Authenticated evaluation required");
    }
    expect(
      projectRecordedVerification(trusted, syntheticRegistration()).verdict,
    ).toBe("VERIFIED");
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
    "projects authenticated %s with exact required outcomes",
    async (verdict, checks) => {
      const { view, catalog } = await available([...checks]);
      expect(view.verdict).toBe(verdict);
      expect(
        view.checks.map((check) => [check.id, check.required, check.status]),
      ).toEqual([
        ["baseline", true, checks[0]!.status],
        ["regression", true, checks[1]?.status ?? "missing"],
      ]);
      expect(html(catalog)).toContain(verdict);
      expect(view.runStatus).toBe("completed");
      expect(html(catalog)).toContain(
        "Completed means execution ended; it does not mean VERIFIED",
      );
    },
  );
  it("never substitutes an optional pass for a missing required check", async () => {
    const fixture = await syntheticRecordingFixture(cleanup, [
      check("baseline"),
      check("optional"),
    ]);
    fixture.config.recordings[0]!.metadata.checks.push({
      id: "optional",
      label: "Synthetic optional",
      description: "Approved optional description.",
      publishArtifactDigest: false,
    });
    const catalog = await loadRecordedVerifications(fixture.config);
    expect(catalog.recordings[0]).toMatchObject({
      state: "available",
      verdict: "INSUFFICIENT_EVIDENCE",
      checks: [
        { id: "baseline", required: true, status: "pass" },
        {
          id: "optional",
          required: false,
          status: "pass",
          artifactSha256: null,
        },
        { id: "regression", required: true, status: "missing" },
      ],
    });
  });
  it("does not conceal an unapproved check, including an optional failure", async () => {
    for (const checks of [
      [check("baseline", "fail"), check("regression")],
      [check("baseline"), check("regression"), check("optional", "fail")],
    ]) {
      const fixture = await syntheticRecordingFixture(cleanup, checks);
      if (checks.length === 2)
        fixture.config.recordings[0]!.metadata.checks =
          fixture.config.recordings[0]!.metadata.checks.filter(
            (check) => check.id !== "baseline",
          );
      expect(
        (await loadRecordedVerifications(fixture.config)).recordings[0]?.state,
      ).toBe("unavailable");
    }
  });
  it.each([
    "id",
    "receiptId",
    "verificationId",
    "evaluatedTreeSha256",
    "fixtureSha256",
    "evaluatorSha256",
    "requiredPolicySha256",
  ] as const)("rejects run %s mismatch", async (field) => {
    const fixture = await syntheticRecordingFixture(cleanup);
    fixture.config.recordings[0]!.run![field] = field.endsWith("Sha256")
      ? hash("f")
      : "other-id";
    expect(
      (await loadRecordedVerifications(fixture.config)).recordings[0],
    ).toEqual({
      state: "unavailable",
      id: "synthetic-recording",
      title: "Synthetic protected recording — test only",
    });
  });
  it.each(["runId", "receiptId", "verificationId"] as const)(
    "rejects approved %s mismatch",
    async (field) => {
      const fixture = await syntheticRecordingFixture(cleanup);
      fixture.config.recordings[0]!.metadata[field] = "other-id";
      expect(
        (await loadRecordedVerifications(fixture.config)).recordings[0]?.state,
      ).toBe("unavailable");
    },
  );
  it("validates recorded mode, timing and measured-run isolation requirements without inventing attestations", async () => {
    const fixture = await syntheticRecordingFixture(cleanup);
    const original = syntheticRegistration().run!;
    for (const change of [
      { presentationMode: "live" as const },
      { endedAt: "2026-10-25T21:00:00.000Z" },
      { evidenceOrigin: "measured" as const },
    ]) {
      fixture.config.recordings[0]!.run = { ...original, ...change };
      expect(
        (await loadRecordedVerifications(fixture.config)).recordings[0]?.state,
      ).toBe("unavailable");
    }
  });
  it.each([
    "evaluatedTreeSha256",
    "fixtureSha256",
    "evaluatorSha256",
    "testSuiteSha256",
    "requiredPolicySha256",
  ] as const)("does not serve stale %s identity", async (field) => {
    const fixture = await syntheticRecordingFixture(cleanup);
    expect(
      (await loadRecordedVerifications(fixture.config)).recordings[0]?.state,
    ).toBe("available");
    fixture.config.store.entries.get("synthetic-evaluation")!.identity[field] =
      hash("f");
    expect(
      (await loadRecordedVerifications(fixture.config)).recordings[0]?.state,
    ).toBe("unavailable");
  });
  it.each(["bundle", "evidence", "source", "root"])(
    "rechecks %s after an earlier successful load",
    async (target) => {
      const fixture = await syntheticRecordingFixture(cleanup);
      expect(
        (await loadRecordedVerifications(fixture.config)).recordings[0]?.state,
      ).toBe("available");
      const file = path.join(
        fixture.directory,
        target === "bundle"
          ? "evaluation.json"
          : fixture.bundle.checks[0]!.evidencePath!,
      );
      if (target === "root")
        await rm(fixture.config.store.root, { recursive: true });
      else if (target === "source")
        await rm(fixture.directory, { recursive: true });
      else await writeFile(file, "changed bytes");
      const catalog = await loadRecordedVerifications(fixture.config);
      expect(
        catalog.recordings.some((recording) => recording.state === "available"),
      ).toBe(false);
      expect(html(catalog)).not.toContain("VERIFIED · scoped");
      expect(html(catalog)).toContain(
        "No approved recorded evidence available",
      );
    },
  );
  it.each([
    "id",
    "evaluationId",
    "runId",
    "receiptId",
    "verificationId",
  ] as const)(
    "rejects duplicate catalog %s references before filesystem access",
    async (field) => {
      const fixture = await syntheticRecordingFixture(cleanup);
      const second = syntheticRegistration();
      for (const key of [
        "id",
        "evaluationId",
        "runId",
        "receiptId",
        "verificationId",
      ] as const)
        second.metadata[key] = `second-${key}`;
      second.metadata[field] = fixture.config.recordings[0]!.metadata[field];
      fixture.config.recordings.push(second);
      const store = vi.spyOn(protectedStore, "createProtectedEvaluationStore");
      expect(await loadRecordedVerifications(fixture.config)).toEqual({
        state: "unavailable",
        recordings: [],
      });
      expect(store).not.toHaveBeenCalled();
    },
  );
  it("rejects invalid/extra public metadata and duplicate approvals", async () => {
    const fixture = await syntheticRecordingFixture(cleanup);
    const metadata = syntheticRegistration().metadata;
    for (const invalid of [
      { ...metadata, title: "" },
      { ...metadata, scope: " " },
      { ...metadata, title: "invalid\ncontrol" },
      { ...metadata, scope: "x".repeat(501) },
      { ...metadata, privatePath: privateSentinel },
      { ...metadata, checks: [...metadata.checks, metadata.checks[0]] },
      {
        ...metadata,
        checks: [{ ...metadata.checks[0], rawScope: privateSentinel }],
      },
      { ...metadata, publicIdentities: ["manifestSha256", "manifestSha256"] },
      { ...metadata, publicMetrics: ["tokens", "tokens"] },
    ]) {
      const config = {
        ...fixture.config,
        recordings: [{ ...syntheticRegistration(), metadata: invalid }],
      };
      // Deliberately bypass compile-time input types to exercise runtime validation.
      expect(
        await loadRecordedVerifications(config as typeof fixture.config),
      ).toEqual({ state: "unavailable", recordings: [] });
    }
  });
  it("preserves unknown versus genuine zero and requires metric publication approval", async () => {
    const fixture = await syntheticRecordingFixture(cleanup);
    fixture.config.recordings[0]!.run!.metrics = {
      elapsedMs: 0,
      tokens: null,
      costUsd: 0,
      iterations: 0,
      filesTouched: null,
    };
    const trusted = await fixture.trusted();
    const view = projectRecordedVerification(
      trusted,
      fixture.config.recordings[0]!,
    );
    expect(view.metrics.map((metric) => metric.value)).toEqual([
      0,
      null,
      0,
      0,
      null,
    ]);
    expect(html({ state: "configured", recordings: [view] })).toContain(
      "<dd>0</dd>",
    );
    expect(html({ state: "configured", recordings: [view] })).toContain(
      "<dd>Unknown</dd>",
    );
    fixture.config.recordings[0]!.metadata.publicMetrics = [];
    expect(
      projectRecordedVerification(
        trusted,
        fixture.config.recordings[0]!,
      ).metrics.every((metric) => metric.value === null),
    ).toBe(true);
    fixture.config.recordings[0]!.run = null;
    const noRun = projectRecordedVerification(
      trusted,
      fixture.config.recordings[0]!,
    );
    expect(noRun.runStatus).toBeNull();
    expect(noRun.metrics.every((metric) => metric.value === null)).toBe(true);
    expect(noRun.verdict).toBe("VERIFIED");
    expect(html({ state: "configured", recordings: [noRun] })).toContain(
      "Unknown — no run record supplied",
    );
  });
  it("allows only explicit public fields, leaving all private material off serialized view data and HTML", async () => {
    const { fixture, catalog, view } = await available();
    expect(Object.keys(view).sort()).toEqual(
      [
        "state",
        "id",
        "title",
        "presentation",
        "category",
        "scope",
        "runId",
        "receiptId",
        "verificationId",
        "runStatus",
        "verdict",
        "checks",
        "identities",
        "metrics",
        "limitations",
      ].sort(),
    );
    expect(Object.keys(view.checks[0]!).sort()).toEqual(
      [
        "id",
        "label",
        "description",
        "required",
        "status",
        "artifactSha256",
      ].sort(),
    );
    for (const output of [JSON.stringify(catalog), html(catalog)]) {
      for (const forbidden of [
        privateSentinel,
        fixture.parent,
        "evidencePath",
        "stdout",
        "stderr",
        "testBody",
        "private test contents",
        "synthetic-secret-token",
        "synthetic-unit-attestation",
        "agentConfigSha256",
        "isolationAttestationId",
        "intentIds",
        "variant",
        "pairId",
      ])
        expect(output).not.toContain(forbidden);
    }
    expect(
      view.identities.find((identity) => identity.name === "manifestSha256")
        ?.sha256,
    ).toBe(fixture.bundle.receipt.integrity.manifestSha256);
    expect(html(catalog)).toContain("not the original hashed artifact");
    expect(html(catalog)).toContain(
      "Infrastructure acceptance, not an architecture experiment",
    );
    expect(html(catalog)).toContain(
      "No matched A/B pairing, current intent linkage, task binding or isolation evidence",
    );
    expect(html(catalog)).toContain(
      "do not establish experiment fairness, measured architecture benefit, Meta incremental advantage or sandbox containment",
    );
  });
  it("renders approved strings inertly and has no evidence-changing actions", async () => {
    const fixture = await syntheticRecordingFixture(cleanup);
    const metadata = fixture.config.recordings[0]!.metadata;
    metadata.title = '<script>alert("synthetic")</script>';
    metadata.checks[0]!.description = '<img src=x onerror="synthetic()">';
    const output = html(await loadRecordedVerifications(fixture.config));
    expect(output).toContain("&lt;script&gt;");
    expect(output).toContain("&lt;img");
    expect(output).not.toContain("<script");
    expect(output).not.toContain("<img");
    expect(output).not.toMatch(/<(button|form|input|textarea)\b/);
  });
  it("sorts recordings/checks/identities stably without mutating frozen inputs", async () => {
    const fixture = await syntheticRecordingFixture(cleanup);
    const trusted = await fixture.trusted();
    const registration = syntheticRegistration();
    const before = JSON.stringify(registration);
    Object.freeze(registration.metadata.checks);
    Object.freeze(registration.metadata.publicIdentities);
    Object.freeze(registration.metadata);
    Object.freeze(registration);
    const view = projectRecordedVerification(trusted, registration);
    expect(view.checks.map((check) => check.id)).toEqual([
      "baseline",
      "regression",
    ]);
    expect(view.identities.map((identity) => identity.name)).toEqual(
      [...registration.metadata.publicIdentities].sort(),
    );
    expect(projectRecordedVerification(trusted, registration)).toEqual(view);
    expect(JSON.stringify(registration)).toBe(before);
    const second = syntheticRegistration();
    for (const key of [
      "id",
      "evaluationId",
      "runId",
      "receiptId",
      "verificationId",
    ] as const)
      second.metadata[key] = `aaa-${key}`;
    const config = {
      ...fixture.config,
      recordings: Object.freeze([registration, second]),
    };
    expect(
      (await loadRecordedVerifications(config)).recordings.map((recording) => [
        recording.id,
        recording.state,
      ]),
    ).toEqual([
      ["aaa-id", "unavailable"],
      ["synthetic-recording", "available"],
    ]);
    expect(config.recordings[0]).toBe(registration);
  });
  it("operates empty/unconfigured without creating a store or touching filesystem configuration", async () => {
    const store = vi.spyOn(protectedStore, "createProtectedEvaluationStore");
    const empty = {
      recordings: [],
      get store(): never {
        throw new Error("Filesystem config must not be read");
      },
    };
    expect(await loadRecordedVerifications(empty)).toEqual({
      state: "empty",
      recordings: [],
    });
    expect(await loadApprovedRecordings()).toEqual({
      state: "empty",
      recordings: [],
    });
    const unconfigured = await loadRecordedVerifications({
      recordings: [syntheticRegistration()],
      store: null,
    });
    expect(unconfigured.recordings[0]?.state).toBe("unavailable");
    expect(store).not.toHaveBeenCalled();
    expect(html(unconfigured)).toContain(
      "No approved recorded evidence available",
    );
  });
});
