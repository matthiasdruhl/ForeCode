// Supplementary read-only presentation data, outside the 49 frozen contracts.
import { z } from "zod";
import {
  IdSchema,
  Sha256Schema,
  UtcTimestampSchema,
} from "../contracts/common";
import { jsonDigest } from "../report/digests";
import { PublicTournamentSchema } from "./tournament-public-projection";
export {
  PublicTournamentSchema,
  TournamentPublicMetadataSchema,
  tournamentRequiredChecks,
  type PublicTournament,
} from "./tournament-public-projection";
export const PublicationArtifactSchema = z.strictObject({
  reportSha256: Sha256Schema,
  projection: PublicTournamentSchema,
});
// Same signed original format as operator custody; pure validation only.
export const DisclosureEnvelopeSchema = z.strictObject({
  record: z.strictObject({
    schemaVersion: z.literal("tournament-custodian-record.local.v1"),
    id: IdSchema,
    studyId: IdSchema,
    kind: z.literal("disclosure"),
    subjectSha256: Sha256Schema,
    predecessorSha256: Sha256Schema.nullable(),
    heldAt: UtcTimestampSchema,
    expiresAt: UtcTimestampSchema,
  }),
  signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
});
export function disclosureSubject(
  artifact: z.infer<typeof PublicationArtifactSchema>,
) {
  return jsonDigest(PublicationArtifactSchema.parse(artifact));
}
