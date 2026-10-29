import { afterEach, describe, expect, it } from "vitest";
import { chmod, link, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sha256 } from "@/lib/report/digests";
import { canonicalJson } from "@/lib/report/canonical";
import { loadTournamentRecordings } from "@/server/artifacts/tournament-recordings";
import {
  createProtectedTournamentPublicationStore,
  isTrustedTournamentPublication,
} from "@/server/artifacts/evaluation-store";
import { loadApprovedTournamentRecordings } from "@/server/artifacts/recording-catalog";
import { TournamentOverview } from "@/components/tournament-overview";
import { TournamentStudy } from "@/components/tournament-study";
import { publicationFixture } from "../support/tournament-publication";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture(options: Parameters<typeof publicationFixture>[0] = {}) {
  const f = await publicationFixture(options);
  roots.push(f.parent);
  return f;
}
async function replace(file: string, bytes: string) {
  await chmod(file, 0o600);
  await writeFile(file, bytes);
  await chmod(file, 0o400);
}
describe("bounded disclosure-approved tournament recordings", () => {
  it("keeps default catalogs empty without touching private storage", async () => {
    expect(await loadApprovedTournamentRecordings()).toEqual({
      state: "empty",
      studies: [],
      unavailableCount: 0,
    });
    expect(await loadTournamentRecordings(null)).toEqual({
      state: "empty",
      studies: [],
      unavailableCount: 0,
    });
    const html = renderToStaticMarkup(createElement(TournamentOverview));
    expect(html).toContain("No genuine paired study is presented");
    expect(html).toContain("source comparison unavailable");
  });
  it("reloads exact signed originals and all protected receipts, and only exposes the approved projection", async () => {
    const f = await fixture({ telemetry: true });
    const catalog = await loadTournamentRecordings(f.config, f.now);
    expect(catalog.state).toBe("available");
    expect(catalog.studies).toEqual([f.artifact.projection]);
    const loaded = await (
      await createProtectedTournamentPublicationStore(f.config.publications)
    ).load(f.report.studyId, f.now);
    expect(isTrustedTournamentPublication(loaded)).toBe(true);
    expect(isTrustedTournamentPublication(structuredClone(loaded))).toBe(false);
    const html = renderToStaticMarkup(
      createElement(TournamentOverview, { catalog }),
    );
    for (const text of [
      "Before preparation / Architecture A",
      "After preparation / Architecture B",
      "What was measured",
      "BOTH_VERIFIED",
      "0.6000",
      "src/service.ts",
      "team-permissions-adversarial",
    ])
      expect(html).toContain(text);
    for (const secret of [
      f.parent,
      "PRIVATE_SENTINEL",
      f.study.evidence.instructions,
      f.study.definition.protocol.task.specification,
    ])
      expect(html).not.toContain(secret);
    expect(html).not.toMatch(/<button|<form|<script/);
  });
  it.each([
    "projection",
    "disclosure",
    "revocation",
    "key",
    "expired",
    "check-bytes",
    "missing-receipt",
    "writable",
    "hardlink",
    "symlink",
  ])(
    "withholds the entire study on %s instead of preserving stale results",
    async (defect) => {
      const f = await fixture();
      expect((await loadTournamentRecordings(f.config, f.now)).state).toBe(
        "available",
      );
      if (defect === "projection") await replace(f.publicationFile, "{}");
      if (defect === "disclosure") await replace(f.disclosureFile, "{}");
      if (defect === "revocation")
        await replace(
          f.revocationFile,
          canonicalJson({ revokedIds: ["public-disclosure"] }),
        );
      if (defect === "key") f.config.publications.authorityPublicKeyPem += " ";
      if (defect === "check-bytes") {
        const run = f.loaded[0]!.original.run.id;
        const check = f.loaded[0]!.future!.checks[0]!;
        await replace(
          path.join(f.evaluationRoot, run, check.evidencePath!),
          "altered",
        );
      }
      if (defect === "missing-receipt")
        await rm(
          path.join(
            f.evaluationRoot,
            f.loaded[0]!.original.run.id,
            "evaluation.json",
          ),
        );
      if (defect === "writable") await chmod(f.publicationFile, 0o600);
      if (defect === "hardlink")
        await link(f.disclosureFile, path.join(f.parent, "hardlink"));
      if (defect === "symlink") {
        const alias = path.join(f.parent, "publication-copy.json");
        await writeFile(alias, "{}");
        await rm(f.publicationFile);
        await symlink(alias, f.publicationFile);
      }
      const catalog = await loadTournamentRecordings(
        f.config,
        defect === "expired" ? Date.parse("2026-11-01T00:00:00.000Z") : f.now,
      );
      expect(catalog.state).toBe("unavailable");
      expect(catalog.studies).toEqual([]);
    },
  );
  it("does not let signed check/receipt substitutions authenticate unrelated evidence", async () => {
    const f = await fixture();
    f.config.registrations[0]!.arms.get("B")!.futureEvaluationId =
      f.loaded[0]!.original.run.id;
    expect(
      (await loadTournamentRecordings(f.config, f.now)).studies,
    ).toHaveLength(0);
  });
  it("retains authentic rejected and failed outcomes independently", async () => {
    const f = await fixture({ failB: true, failedAgent: true });
    const catalog = await loadTournamentRecordings(f.config, f.now);
    expect(catalog.state).toBe("available");
    expect(catalog.studies[0]!.correctness).toBe("INCONCLUSIVE");
    const html = renderToStaticMarkup(
      createElement(TournamentStudy, { study: catalog.studies[0]! }),
    );
    expect(html).toContain("REJECTED");
    expect(html).toContain("failed");
    expect(html).toContain("Unknown");
  });
  it("displays an approved interrupted attempt honestly when no future receipt ever existed", async () => {
    const f = await fixture({ noFutureB: true });
    const catalog = await loadTournamentRecordings(f.config, f.now);
    expect(catalog.state).toBe("available");
    expect(catalog.studies[0]!.correctness).toBe("INCONCLUSIVE");
    expect(catalog.studies[0]!.arms[1]).toMatchObject({
      status: "timed_out",
      verdict: "INSUFFICIENT_EVIDENCE",
      receiptId: null,
    });
  });
  it("rejects a signature-like record even if a local artifact hash is replaced", async () => {
    const f = await fixture();
    const file = f.disclosureFile;
    const fake = {
      record: f.approval.record,
      signature: Buffer.alloc(64).toString("base64"),
    };
    const bytes = canonicalJson(fake);
    await replace(file, bytes);
    const entry = f.config.publications.entries.get(f.report.studyId)!;
    entry.disclosureSha256 = sha256(bytes);
    expect(
      (await loadTournamentRecordings(f.config, f.now)).studies,
    ).toHaveLength(0);
  });
});
