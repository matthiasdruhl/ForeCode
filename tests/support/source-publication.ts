// Test-only inert source strings and disposable signed custody; never captures code.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { jsonDigest, sha256 } from "@/lib/report/digests";
import { canonicalJson } from "@/lib/report/canonical";
import type { SourcePublication } from "@/lib/experiment/source-publication";
import {
  createTournamentPublicationReader,
  type ApprovedTournamentConfig,
} from "@/server/artifacts/tournament-provisioning";
import type { SourcePublicationConfig } from "@/server/artifacts/source-publication";
import { publicationFixture } from "./tournament-publication";
export async function sourcePublicationFixture() {
  const f = await publicationFixture();
  const original = f.study.evidence.originalManifest,
    prepared = f.study.evidence.preparedManifest;
  const snapshot = (
    role: SourcePublication["snapshots"][number]["role"],
    manifest: typeof original,
    text: string,
    runId: string | null,
  ) => ({
    role,
    treeSha256: jsonDigest(manifest),
    runId,
    manifest,
    bodies: [{ path: "src/service.ts", sha256: sha256(text), text }],
  });
  const final = (manifest: typeof original, variant: string) =>
    manifest.map((file) =>
      file.path === "src/service.ts"
        ? { ...file, sha256: sha256(`// inert final ${variant}`) }
        : { ...file },
    );
  const evidence: SourcePublication = {
    schemaVersion: "tournament-source-evidence-publication.v1",
    authority: "owner_approved_archival_disclosure",
    studyId: f.report.studyId,
    reportSha256: f.artifact.reportSha256,
    projectionSha256: jsonDigest(f.artifact.projection),
    preparedOriginalSha256: f.report.preparedOriginalSha256,
    scopeLimitations: [
      "Synthetic selected source only; no complete tree reconstruction.",
    ],
    snapshots: [
      snapshot("shared-original", original, "// inert original", null),
      snapshot(
        "B-prepared",
        prepared,
        "// inert prepared",
        f.artifact.projection.arms[1]!.runId,
      ),
      snapshot(
        "A-final",
        final(original, "A"),
        "// inert final A",
        f.artifact.projection.arms[0]!.runId,
      ),
      snapshot(
        "B-final",
        final(prepared, "B"),
        "// inert final B",
        f.artifact.projection.arms[1]!.runId,
      ),
    ],
  };
  const entries = new Map<
    string,
    {
      file: string;
      sha256: string;
      documentFile: string;
      documentSha256: string;
    }
  >();
  const supplement: SourcePublicationConfig = {
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
  async function hold(
    input: unknown = evidence,
    overrides: {
      heldAt?: string;
      expiresAt?: string;
      studyId?: string;
      predecessorSha256?: string;
      kind?: "disclosure" | "prepared";
    } = {},
  ) {
    const id = `synthetic-source-${sequence++}`,
      documentFile = `${id}-document.json`,
      bytes = canonicalJson(input);
    await f.hold({
      id,
      studyId: f.report.studyId,
      kind: "disclosure",
      heldAt: f.assessmentAt,
      subjectSha256: jsonDigest(input),
      predecessorSha256: f.report.preparedOriginalSha256,
      ...overrides,
    });
    await writeFile(path.join(f.root, documentFile), bytes, {
      flag: "wx",
      mode: 0o400,
    });
    entries.clear();
    entries.set(id, {
      file: `${id}.json`,
      sha256: sha256(await readFile(path.join(f.root, `${id}.json`))),
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
    registrations: f.config.registrations.map((entry) => ({
      ...entry,
      projectionSha256: jsonDigest(f.artifact.projection),
    })),
    sourceEvidence: supplement,
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
