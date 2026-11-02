import "server-only";
import { IdSchema } from "@/lib/contracts/common";
import { invariant, sameIds } from "@/lib/contracts/validation";
import { jsonDigest } from "@/lib/report/digests";
import {
  SourcePublicationSchema,
  sourceDisclosureSubject,
  projectSourcePublication,
  type PublicSourceEvidence,
} from "@/lib/experiment/source-publication";
import {
  createProtectedScientistCustodyStore,
  createProtectedTournamentPublicationStore,
  type ScientistCustodyConfig,
} from "./evaluation-store";
import {
  loadTournamentRecordings,
  type TournamentRecordingConfig,
} from "./tournament-recordings";

// Source-owned composition only; never request/env/JSON-derived configuration.
export type SourcePublicationConfig = {
  custody: ScientistCustodyConfig;
  entries: ReadonlyMap<string, { disclosureId: string }>;
};
export type SourceEvidenceCatalog = {
  state: "empty" | "available" | "unavailable";
  evidence: PublicSourceEvidence[];
  unavailableCount: number;
};
export function assertSourcePublicationAuthority(
  base: TournamentRecordingConfig["publications"],
  supplement: SourcePublicationConfig,
) {
  invariant(
    supplement.custody.publicKeyPem === base.authorityPublicKeyPem &&
      supplement.custody.publicKeySha256 === base.authorityPublicKeySha256 &&
      supplement.custody.revocationSha256 === base.revocationSha256 &&
      sameIds(
        [...supplement.custody.workspaceRoots],
        [...base.agentWorkspaceRoots],
      ),
    "Source supplement authority mismatch",
  );
  invariant(
    supplement.entries.size <= 20 &&
      new Set(
        [...supplement.entries.values()].map((entry) => entry.disclosureId),
      ).size === supplement.entries.size &&
      sameIds(
        [...supplement.custody.entries.keys()],
        [...supplement.entries.values()].map((entry) => entry.disclosureId),
      ),
    "Unregistered or reused source custody",
  );
  for (const [studyId, entry] of supplement.entries) {
    IdSchema.parse(studyId);
    IdSchema.parse(entry.disclosureId);
    invariant(
      supplement.custody.entries.has(entry.disclosureId),
      "Missing source original",
    );
  }
}
export async function loadSourcePublications(
  config: TournamentRecordingConfig | null,
  supplement: SourcePublicationConfig | undefined,
  now: number,
): Promise<SourceEvidenceCatalog> {
  if (!config || !supplement)
    return { state: "empty", evidence: [], unavailableCount: 0 };
  try {
    assertSourcePublicationAuthority(config.publications, supplement);
    invariant(
      [...supplement.entries.keys()].every((id) =>
        config.registrations.some((entry) => entry.studyId === id),
      ),
      "Unregistered source study",
    );
    if (supplement.entries.size === 0)
      return { state: "empty", evidence: [], unavailableCount: 0 };
    const catalog = await loadTournamentRecordings(config, now);
    invariant(catalog.state === "available", "Base unavailable");
    const base = await createProtectedTournamentPublicationStore(
        config.publications,
      ),
      originals = await createProtectedScientistCustodyStore(
        supplement.custody,
      );
    const evidence: PublicSourceEvidence[] = [];
    let unavailableCount = 0;
    for (const [studyId, entry] of supplement.entries) {
      try {
        const projection = catalog.studies.find(
            (item) => item.studyId === studyId,
          ),
          original = await base.load(studyId, now),
          held = await originals.load(entry.disclosureId);
        invariant(
          projection &&
            original &&
            held &&
            jsonDigest(projection) === jsonDigest(original.artifact.projection),
          "Fresh source base unavailable",
        );
        const document = SourcePublicationSchema.parse(held.document),
          record = held.record;
        invariant(
          record.kind === "disclosure" &&
            record.studyId === studyId &&
            document.studyId === studyId &&
            record.predecessorSha256 === document.preparedOriginalSha256 &&
            record.subjectSha256 === sourceDisclosureSubject(document) &&
            Date.parse(record.heldAt) <= now &&
            now < Date.parse(record.expiresAt),
          "Source disclosure stale or mismatched",
        );
        evidence.push(
          projectSourcePublication(
            document,
            projection,
            original.artifact.reportSha256,
          ),
        );
      } catch {
        unavailableCount++;
      }
    }
    return {
      state: evidence.length ? "available" : "unavailable",
      evidence,
      unavailableCount,
    };
  } catch {
    return {
      state: "unavailable",
      evidence: [],
      unavailableCount: Math.max(1, Math.min(20, supplement.entries.size)),
    };
  }
}
