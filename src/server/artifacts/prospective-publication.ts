import "server-only";
import { invariant, sameIds } from "@/lib/contracts/validation";
import { jsonDigest } from "@/lib/report/digests";
import {
  joinProspectivePublication,
  type PublicProspectiveEvidence,
} from "@/lib/experiment/prospective-publication";
import {
  createProtectedProspectivePublicationStore,
  createProtectedTournamentPublicationStore,
  type ProspectivePublicationStoreConfig,
} from "./evaluation-store";
import {
  loadTournamentRecordings,
  type TournamentRecordingConfig,
} from "./tournament-recordings";
export type ProspectiveEvidenceCatalog = {
  state: "empty" | "available" | "unavailable";
  evidence: PublicProspectiveEvidence[];
  unavailableCount: number;
};
export function assertProspectivePublicationAuthority(
  base: TournamentRecordingConfig["publications"],
  supplement: ProspectivePublicationStoreConfig,
) {
  invariant(
    supplement.custody.publicKeyPem === base.authorityPublicKeyPem &&
      supplement.custody.publicKeySha256 === base.authorityPublicKeySha256 &&
      supplement.custody.revocationSha256 === base.revocationSha256 &&
      sameIds(
        [...supplement.custody.workspaceRoots],
        [...base.agentWorkspaceRoots],
      ),
    "Prospective supplement must use the existing authority, revocations and workspace inventory",
  );
}
export async function loadProspectivePublications(
  config: TournamentRecordingConfig | null,
  supplement: ProspectivePublicationStoreConfig | undefined,
  now: number,
): Promise<ProspectiveEvidenceCatalog> {
  if (!config || !supplement || supplement.entries.size === 0)
    return { state: "empty", evidence: [], unavailableCount: 0 };
  try {
    assertProspectivePublicationAuthority(config.publications, supplement);
    // A second exact artifact read supplies reportSha256, absent from the v1
    // public projection. Both reads must match the freshly receipt-joined base.
    const catalog = await loadTournamentRecordings(config, now);
    if (catalog.state !== "available") throw new Error("Base unavailable");
    const base = await createProtectedTournamentPublicationStore(
        config.publications,
      ),
      additions = await createProtectedProspectivePublicationStore(supplement);
    const evidence: PublicProspectiveEvidence[] = [];
    let unavailableCount = 0;
    for (const studyId of supplement.entries.keys()) {
      try {
        const projection = catalog.studies.find(
            (study) => study.studyId === studyId,
          ),
          original = await base.load(studyId, now),
          additional = await additions.load(studyId, now);
        if (
          !projection ||
          !original ||
          !additional ||
          jsonDigest(projection) !== jsonDigest(original.artifact.projection)
        )
          throw new Error("Fresh base mismatch");
        evidence.push(
          joinProspectivePublication(
            additional,
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
      unavailableCount: supplement.entries.size,
    };
  }
}
