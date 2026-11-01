// Independent QA: only the existing reviewed, disposable synthetic publication
// fixture is used. This tests fresh loader -> replay join -> visible memo.
import { afterEach, describe, expect, it } from "vitest";
import { chmod, rm, writeFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionMemo } from "@/components/v6/decision-memo";
import { loadDecisionReports } from "@/server/artifacts/decision-reports";
import { loadTournamentRecordings } from "@/server/artifacts/tournament-recordings";
import { composeReplayPresentation } from "@/server/artifacts/replay-presentation";
import { publicationFixture } from "../support/tournament-publication";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function memo(
  presentation: ReturnType<typeof composeReplayPresentation>,
  studyId: string,
) {
  const replay = presentation.replays.replays.find(
    (entry) => entry.studyId === studyId,
  );
  return renderToStaticMarkup(
    <DecisionMemo
      catalog={presentation.reports}
      studyId={studyId}
      projectionSha256={replay?.projectionSha256}
      inspect={() => {}}
    />,
  );
}

describe("judge-facing evidence withdrawal (synthetic originals only)", () => {
  it.each(["revoked", "expired", "missing-original", "tampered-publication"])(
    "withdraws a previously favourable memo after %s, including torn fresh reads",
    async (defect) => {
      const f = await publicationFixture({ failA: true });
      roots.push(f.parent);
      const [oldTournaments, oldReports] = await Promise.all([
        loadTournamentRecordings(f.config, f.now),
        loadDecisionReports(f.config, f.now),
      ]);
      const before = composeReplayPresentation(oldTournaments, oldReports);
      expect(memo(before, f.report.studyId)).toContain(
        "Review the prepared architecture.",
      );
      if (defect === "revoked") {
        await chmod(f.revocationFile, 0o600);
        await writeFile(
          f.revocationFile,
          JSON.stringify({ revokedIds: ["public-disclosure"] }),
        );
        await chmod(f.revocationFile, 0o400);
      }
      if (defect === "missing-original") await rm(f.disclosureFile);
      if (defect === "tampered-publication") {
        await chmod(f.publicationFile, 0o600);
        await writeFile(f.publicationFile, "{}");
        await chmod(f.publicationFile, 0o400);
      }
      const now =
        defect === "expired" ? Date.parse("2026-11-01T00:00:00.000Z") : f.now;
      const [freshTournaments, freshReports] = await Promise.all([
        loadTournamentRecordings(f.config, now),
        loadDecisionReports(f.config, now),
      ]);
      expect(freshTournaments.state).toBe("unavailable");
      expect(freshReports.state).toBe("unavailable");
      for (const presentation of [
        composeReplayPresentation(freshTournaments, freshReports),
        composeReplayPresentation(freshTournaments, oldReports),
        composeReplayPresentation(oldTournaments, freshReports),
      ]) {
        const html = memo(presentation, f.report.studyId);
        expect(html).toContain("Insufficient evidence to choose.");
        expect(html).toContain("EVIDENCE UNAVAILABLE");
        expect(html).not.toContain("Review the prepared architecture.");
        expect(html).not.toContain("Keep the current architecture.");
        expect(html).not.toContain(f.parent);
      }
    },
  );
});
