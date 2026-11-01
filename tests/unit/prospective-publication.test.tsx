// Actual read-only validators with disposable signed counterfactual originals.
import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { canonicalJson } from "@/lib/report/canonical";
import { jsonDigest, sha256 } from "@/lib/report/digests";
import {
  ProspectivePublicationSchema,
  joinProspectivePublication,
  prospectiveDisclosureSubject,
} from "@/lib/experiment/prospective-publication";
import {
  createProtectedProspectivePublicationStore,
  type ProspectivePublicationStoreConfig,
} from "@/server/artifacts/evaluation-store";
import {
  createTournamentPublicationReader,
  type ApprovedTournamentConfig,
} from "@/server/artifacts/tournament-provisioning";
import { composeReplayPresentation } from "@/server/artifacts/replay-presentation";
import { EvidenceDetail } from "@/components/v6/evidence-ledger";
import { MeasurementRail } from "@/components/v6/tournament-measurements";
import { publicationFixture } from "../support/tournament-publication";
import { syntheticProspectivePublication } from "../support/prospective-publication";
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const f = await publicationFixture();
  roots.push(f.parent);
  vi.spyOn(Date, "now").mockReturnValue(f.now);
  const evidence = syntheticProspectivePublication(
    f.artifact.projection,
    f.artifact.reportSha256,
  );
  const entries = new Map<
    string,
    {
      file: string;
      sha256: string;
      documentFile: string;
      documentSha256: string;
    }
  >();
  const supplement: ProspectivePublicationStoreConfig = {
    custody: {
      originalRoot: f.root,
      publicKeyPem: f.config.publications.authorityPublicKeyPem,
      publicKeySha256: f.config.publications.authorityPublicKeySha256,
      revocationSha256: f.config.publications.revocationSha256,
      workspaceRoots: [f.workspace],
      entries,
    },
    entries: new Map(),
  };
  let sequence = 0;
  async function hold(input: unknown = evidence, expiresAt?: string) {
    const id = `synthetic-prospective-${sequence++}`,
      documentFile = id + "-document.json",
      bytes = canonicalJson(input);
    await f.hold({
      id,
      studyId: f.report.studyId,
      kind: "disclosure",
      heldAt: f.assessmentAt,
      subjectSha256: jsonDigest(input),
      predecessorSha256: f.report.preparedOriginalSha256,
      ...(expiresAt ? { expiresAt } : {}),
    });
    await writeFile(path.join(f.root, documentFile), bytes, {
      flag: "wx",
      mode: 0o400,
    });
    entries.clear();
    entries.set(id, {
      file: id + ".json",
      sha256: sha256(await readFile(path.join(f.root, id + ".json"))),
      documentFile,
      documentSha256: sha256(bytes),
    });
    (supplement.entries as Map<string, { disclosureId: string }>).set(
      f.report.studyId,
      { disclosureId: id },
    );
    return { id, documentFile };
  }
  const held = await hold();
  let clock = f.now;
  const config: ApprovedTournamentConfig = {
    ...f.config,
    registrations: f.config.registrations.map((registration) => ({
      ...registration,
      projectionSha256: jsonDigest(f.artifact.projection),
    })),
    prospectiveEvidence: supplement,
  };
  return {
    ...f,
    evidence,
    supplement,
    config,
    held,
    hold,
    advance: (ms: number) => {
      clock += ms;
    },
    reader: () => createTournamentPublicationReader(config, () => clock),
  };
}
async function replace(file: string, bytes: string) {
  await chmod(file, 0o600);
  await writeFile(file, bytes);
  await chmod(file, 0o400);
}
describe("signed historical prospective disclosure", () => {
  it("remains unprovisioned by default and leaves existing catalogs unchanged", async () => {
    const reader = createTournamentPublicationReader(null);
    expect(await reader.loadProspectiveEvidence()).toEqual({
      state: "empty",
      evidence: [],
      unavailableCount: 0,
    });
    const f = await fixture(),
      catalog = await f.reader().loadProspectiveEvidence();
    expect(catalog).toMatchObject({ state: "available", unavailableCount: 0 });
    expect(catalog.evidence).toEqual([f.evidence]);
    expect((await f.reader().loadTournaments()).studies).toEqual([
      f.artifact.projection,
    ]);
    expect((await f.reader().loadReports()).reports).toHaveLength(1);
  });
  it.each([
    "wrong-report",
    "wrong-projection",
    "wrong-prepared",
    "wrong-protocol",
    "wrong-run",
    "wrong-tree",
  ])("rejects re-signed %s substitution", async (defect) => {
    const f = await fixture(),
      altered = structuredClone(f.evidence);
    if (defect === "wrong-report") altered.reportSha256 = "0".repeat(64);
    if (defect === "wrong-projection")
      altered.projectionSha256 = "0".repeat(64);
    if (defect === "wrong-prepared")
      altered.preparedOriginalSha256 = "0".repeat(64);
    if (defect === "wrong-protocol")
      altered.lineage.protocolOriginalSha256 = "0".repeat(64);
    if (defect === "wrong-run")
      altered.metrics!.arms[0]!.runId = "synthetic-other-run";
    if (defect === "wrong-tree")
      altered.metrics!.arms[0]!.baselineTreeSha256 = "0".repeat(64);
    await f.hold(altered);
    expect((await f.reader().loadProspectiveEvidence()).evidence).toEqual([]);
  });
  it.each(["authority", "revocation-pin", "workspace"])(
    "requires the same reviewed base %s",
    async (defect) => {
      const f = await fixture();
      if (defect === "authority")
        f.supplement.custody.publicKeySha256 = "0".repeat(64);
      if (defect === "revocation-pin")
        f.supplement.custody.revocationSha256 = "0".repeat(64);
      if (defect === "workspace")
        f.supplement.custody.workspaceRoots = [f.parent];
      expect(await f.reader().loadProspectiveEvidence()).toEqual({
        state: "unavailable",
        evidence: [],
        unavailableCount: 1,
      });
    },
  );
  it.each(["document", "signature", "revoked", "expired", "base-publication"])(
    "fails closed after %s changes on the next read",
    async (defect) => {
      const f = await fixture(),
        reader = f.reader();
      expect((await reader.loadProspectiveEvidence()).evidence).toHaveLength(1);
      if (defect === "document")
        await replace(
          path.join(f.root, f.held.documentFile),
          canonicalJson({ ...f.evidence, authority: "forged" }),
        );
      if (defect === "signature")
        await replace(path.join(f.root, f.held.id + ".json"), "{}");
      if (defect === "revoked")
        await replace(
          path.join(f.root, "revocations.json"),
          canonicalJson({ revokedIds: [f.held.id] }),
        );
      if (defect === "expired") {
        await f.hold(f.evidence, new Date(f.now + 10).toISOString());
        f.advance(11);
      }
      if (defect === "base-publication") await replace(f.publicationFile, "{}");
      expect((await reader.loadProspectiveEvidence()).evidence).toEqual([]);
    },
  );
  it("authenticates fresh expiry and never restores live registration", async () => {
    const f = await fixture(),
      store = await createProtectedProspectivePublicationStore(f.supplement);
    expect(await store.load(f.report.studyId, f.now)).toEqual(f.evidence);
    expect(
      await store.load(
        f.report.studyId,
        Date.parse("2026-10-30T12:00:00.000Z"),
      ),
    ).toBeNull();
    expect(prospectiveDisclosureSubject(f.evidence)).toBe(
      jsonDigest(f.evidence),
    );
    expect(
      joinProspectivePublication(
        f.evidence,
        f.artifact.projection,
        f.artifact.reportSha256,
      ),
    ).toEqual(f.evidence);
  });
  it.each([
    "incomplete-supported",
    "tie-supported",
    "missing-count",
    "duplicate-rule",
    "duplicate-case",
    "wrong-version",
    "raw-payload",
    "private-path",
    "reused-stage",
    "missing-limitations",
  ])("refuses unsupported %s claims", async (defect) => {
    const f = await fixture(),
      altered = structuredClone(f.evidence);
    if (defect === "incomplete-supported")
      altered.metrics!.status = "incomplete";
    if (defect === "tie-supported")
      altered.metrics!.arms[0]!.finalForbiddenEdges = 0;
    if (defect === "missing-count")
      altered.metrics!.arms[0]!.finalForbiddenEdges = null;
    if (defect === "duplicate-rule")
      altered.metrics!.boundaryRules.push({
        ...altered.metrics!.boundaryRules[0]!,
      });
    if (defect === "duplicate-case")
      altered.metrics!.authorizationCaseIds[1] =
        altered.metrics!.authorizationCaseIds[0]!;
    if (defect === "wrong-version")
      (
        altered.metrics as unknown as { protocolVersion: string }
      ).protocolVersion = "prospective-tournament-metrics.v2";
    if (defect === "missing-limitations") altered.scopeLimitations = [];
    if (defect === "reused-stage")
      altered.lineage.stages[1]!.approvedRequestSha256 =
        altered.lineage.stages[0]!.approvedRequestSha256;
    if (defect === "private-path")
      altered.lineage.proposalSummary = "/private/tmp/DO_NOT_PUBLISH";
    if (defect === "raw-payload")
      Object.assign(altered.lineage, {
        providerPayload: { secret: "DO_NOT_PUBLISH" },
      });
    expect(() => ProspectivePublicationSchema.parse(altered)).toThrow();
  });
  it.each([
    "blind",
    "external-authority",
    "duplicate-prior",
    "current-as-prior",
  ])("does not admit false %s provenance", async (defect) => {
    const f = await fixture(),
      altered = structuredClone(f.evidence);
    if (defect === "blind")
      (altered.reviewProvenance as unknown as { blinding: string }).blinding =
        "blind";
    if (defect === "external-authority")
      (
        altered.reviewProvenance as unknown as { reviewAuthority: string }
      ).reviewAuthority = "independent_human";
    if (defect === "duplicate-prior")
      altered.reviewProvenance.priorStudyIds.push(
        altered.reviewProvenance.priorStudyIds[0]!,
      );
    if (defect === "current-as-prior")
      altered.reviewProvenance.priorStudyIds.push(altered.studyId);
    expect(() => ProspectivePublicationSchema.parse(altered)).toThrow();
  });
  it("keeps missing metrics null and unknown values visible without broader authority", async () => {
    const f = await fixture(),
      missing = { ...f.evidence, metrics: null };
    await f.hold(missing);
    const catalog = await f.reader().loadProspectiveEvidence();
    expect(catalog.evidence[0]!.metrics).toBeNull();
    const evidenceHtml = renderToStaticMarkup(
      <EvidenceDetail
        study={f.artifact.projection}
        question="hypothesis"
        prospective={catalog.evidence[0]}
      />,
    );
    const rail = renderToStaticMarkup(
      <MeasurementRail
        study={f.artifact.projection}
        prospective={catalog.evidence[0]}
      />,
    );
    expect(evidenceHtml).toContain("Synthetic fixture:");
    expect(evidenceHtml).toContain(
      "does not establish human, organizational or blind independence",
    );
    expect(evidenceHtml).toContain("Input / output tokens");
    expect(evidenceHtml).toContain("0 / Unknown");
    expect(evidenceHtml).toContain("no current model issuance");
    expect(rail).toContain("Counts remain Unknown");
    expect(rail).not.toContain("supported");
  });
  it("discloses current failure limits separately from prior exposure without inventing metrics", async () => {
    const f = await fixture(),
      currentFailure = {
        ...f.evidence,
        metrics: null,
        scopeLimitations: [
          "Synthetic current attempt: first requests returned HTTP 403; the access boundary remains unknown.",
          "Synthetic current attempt: no valid architecture comparison or observed provider usage was established.",
        ],
      };
    await f.hold(currentFailure);
    const catalog = await f.reader().loadProspectiveEvidence();
    const html = renderToStaticMarkup(
      <EvidenceDetail
        study={f.artifact.projection}
        question="hypothesis"
        prospective={catalog.evidence[0]}
      />,
    );
    expect(html).toContain("HTTP 403");
    expect(html).toContain("no valid architecture comparison");
    expect(html).toContain("prior proposal and source observations were known");
    expect(catalog.evidence[0]!.metrics).toBeNull();
  });
  it("shows exact selected coverage while leaving the official Decision Report untouched", async () => {
    const f = await fixture(),
      reader = f.reader(),
      tournaments = await reader.loadTournaments(),
      reports = await reader.loadReports(),
      prospective = await reader.loadProspectiveEvidence();
    const joined = composeReplayPresentation(tournaments, reports, prospective);
    expect(joined.reports.reports[0]!.analysis).toBe(
      reports.reports[0]!.analysis,
    );
    const html = renderToStaticMarkup(
      <MeasurementRail
        study={tournaments.studies[0]}
        prospective={joined.prospectiveEvidence.evidence[0]}
      />,
    );
    expect(html).toContain("rejection-site-001");
    expect(html).toContain("src/server/http.ts");
    expect(html).toContain("src/server/booking-store.ts");
    expect(html).toContain("subset of protected checks");
    const changed = {
      ...tournaments,
      studies: [{ ...tournaments.studies[0]!, title: "changed" }],
    };
    expect(
      composeReplayPresentation(changed, reports, prospective)
        .prospectiveEvidence.evidence,
    ).toEqual([]);
  });
});
