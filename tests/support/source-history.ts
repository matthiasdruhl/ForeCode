// Inert synthetic UI input only. No experiment, capture or source authority.
import { syntheticTournamentView } from "./tournament-view";
import { preparationInclusiveMetrics } from "../../src/lib/experiment/metrics";
import { jsonDigest, sha256 } from "../../src/lib/report/digests";
import {
  projectSourcePublication,
  type SourcePublication,
} from "../../src/lib/experiment/source-publication";

export const longSourcePath = `src/${"nested-".repeat(22)}/disclosed-source-with-a-long-name.ts`;
export const maliciousSource =
  '<script>window.sourceExecuted=true</script><img src="https://source-text.invalid/pixel" onerror="window.sourceExecuted=true"> https://source-text.invalid/\n';
export function syntheticSourceHistory(name = "one") {
  const study = syntheticTournamentView();
  study.studyId += `-${name}`;
  study.title = `Synthetic source study ${name} — UI test only`;
  const buildSnapshot = (
    role: SourcePublication["snapshots"][number]["role"],
    index: number,
  ) => {
    const texts: Record<string, string> = {
      [longSourcePath]: `// long path ${name} ${role}\n`,
      [`src/${name}-service.ts`]: `// ${name.toUpperCase()}_${role.toUpperCase()}_SENTINEL\r\n${maliciousSource}${"x".repeat(350)}${index === 0 ? "\n" : ""}`,
      "src/too-large.ts": Array.from(
        { length: 501 },
        (_, i) => `// ${index}-${i}`,
      ).join("\n"),
      "src/unchanged.ts": "// unchanged\n",
      "src/undisclosed.ts": `// disclosed ${name} ${role}`,
    };
    if (index === 0) texts["src/empty-removed.ts"] = "";
    else texts["src/empty-added.ts"] = "";
    const manifest = Object.entries({
      ...texts,
      "src/hidden-inventory.ts": "// never reveal inventory",
    })
      .map(([path, text]) => ({ path, sha256: sha256(text) }))
      .sort((a, b) => (a.path < b.path ? -1 : 1));
    return {
      role,
      treeSha256: jsonDigest(manifest),
      runId:
        role === "shared-original"
          ? null
          : study.arms[role === "A-final" ? 0 : 1]!.runId,
      manifest,
      bodies: Object.entries(texts)
        .filter(([path]) => !(index === 0 && path === "src/undisclosed.ts"))
        .map(([path, text]) => ({ path, text, sha256: sha256(text) })),
    };
  };
  const snapshots = (
    ["shared-original", "B-prepared", "A-final", "B-final"] as const
  ).map(buildSnapshot);
  study.arms[0]!.initialTreeSha256 = snapshots[0]!.treeSha256;
  study.arms[1]!.initialTreeSha256 = snapshots[1]!.treeSha256;
  study.arms[0]!.finalTreeSha256 = snapshots[2]!.treeSha256;
  study.arms[1]!.finalTreeSha256 = snapshots[3]!.treeSha256;
  study.arms.forEach((arm) => {
    arm.total = preparationInclusiveMetrics(arm.preparation, arm.downstream);
  });
  const publication: SourcePublication = {
    schemaVersion: "tournament-source-evidence-publication.v1",
    authority: "owner_approved_archival_disclosure",
    studyId: study.studyId,
    reportSha256: "9".repeat(64),
    projectionSha256: jsonDigest(study),
    preparedOriginalSha256: study.preparedOriginalSha256,
    scopeLimitations: [
      "Synthetic selected bodies only; no experiment occurred.",
    ],
    snapshots,
  };
  return {
    study,
    publication,
    evidence: projectSourcePublication(
      publication,
      study,
      publication.reportSha256,
    ),
  };
}
