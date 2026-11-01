// Test-only complete publication chain, with synthetic keys and inert originals.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "../../src/lib/report/canonical";
import { sha256 } from "../../src/lib/report/digests";
import { disclosureSubject } from "../../src/lib/experiment/tournament-publication";
import { buildMeasuredTournamentReport } from "../../scripts/experiments/tournament/measured";
import {
  authorizeTournamentPublication,
  prepareTournamentPublication,
} from "../../scripts/experiments/tournament/disclosure";
import type { TournamentRecordingConfig } from "../../src/server/artifacts/tournament-recordings";
import { measuredFixture } from "./tournament-measured";
export async function publicationFixture(
  options: Parameters<typeof measuredFixture>[0] = {},
  existing?: Awaited<ReturnType<typeof measuredFixture>>,
) {
  const f = existing ?? (await measuredFixture(options));
  const report = buildMeasuredTournamentReport({
    study: f.study,
    arms: f.loaded,
    history: f.history,
    assessmentAt: f.assessmentAt,
  });
  const metadata = {
    title: "Synthetic tournament — test only",
    futureProblem: "Team booking permissions",
    reviewedProposal: "Extract authorization policy before the future task.",
    hypothesis:
      "Preparation may reduce future effort after its own cost is counted.",
    publishSourcePaths: report.preparedChangedFiles.includes("src/service.ts")
      ? ["src/service.ts"]
      : report.preparedChangedFiles
          .filter((path) => path.endsWith(".ts"))
          .slice(0, 1),
  };
  const proposed = prepareTournamentPublication(report, metadata);
  const approval = (await f.hold({
    id: "public-disclosure",
    studyId: report.studyId,
    kind: "disclosure",
    heldAt: f.assessmentAt,
    subjectSha256: disclosureSubject(proposed),
    predecessorSha256: report.preparedOriginalSha256,
  }))!;
  const artifact = authorizeTournamentPublication(
    report,
    metadata,
    approval,
    f.assessmentAt,
  );
  const publicationRoot = path.join(f.parent, "publications"),
    authorityRoot = path.join(f.parent, "disclosure-originals");
  const publicationDirectory = path.join(publicationRoot, report.studyId),
    authorityDirectory = path.join(authorityRoot, approval.record.id);
  await mkdir(publicationDirectory, { recursive: true, mode: 0o700 });
  await mkdir(authorityDirectory, { recursive: true, mode: 0o700 });
  const publicationFile = path.join(
      publicationDirectory,
      "tournament-publication.json",
    ),
    disclosureFile = path.join(authorityDirectory, "disclosure-original.json"),
    revocationFile = path.join(authorityRoot, "revocations.json");
  const publicationBytes = canonicalJson(artifact),
    disclosureBytes = await readFile(
      path.join(f.root, "public-disclosure.json"),
    );
  await writeFile(publicationFile, publicationBytes, { mode: 0o400 });
  await writeFile(disclosureFile, disclosureBytes, { mode: 0o400 });
  await writeFile(revocationFile, canonicalJson({ revokedIds: [] }), {
    mode: 0o400,
  });
  const config: TournamentRecordingConfig = {
    publications: {
      root: publicationRoot,
      authorityRoot,
      agentWorkspaceRoots: [f.workspace],
      authorityPublicKeyPem: f.config.publicKeyPem,
      authorityPublicKeySha256: f.config.publicKeySha256,
      revocationSha256: f.config.revocationSha256,
      entries: new Map([
        [
          report.studyId,
          {
            directory: report.studyId,
            publicationSha256: sha256(publicationBytes),
            disclosureId: approval.record.id,
            disclosureSha256: sha256(disclosureBytes),
          },
        ],
      ]),
    },
    evaluations: {
      root: f.evaluationRoot,
      agentWorkspaceRoot: f.workspace,
      entries: new Map(
        [...f.evaluations].map(([id, value]) => [id, value.entry]),
      ),
    },
    registrations: [
      {
        studyId: report.studyId,
        arms: new Map(
          f.loaded.map((arm) => [
            arm.variant,
            {
              baselineEvaluationId: arm.original.baselineRunId,
              futureEvaluationId:
                arm.original.run.receiptId === null
                  ? null
                  : arm.original.run.id,
            },
          ]),
        ),
      },
    ],
  };
  return {
    ...f,
    report,
    metadata,
    artifact,
    approval,
    config,
    publicationFile,
    disclosureFile,
    revocationFile,
    now: Date.parse(f.assessmentAt),
  };
}
