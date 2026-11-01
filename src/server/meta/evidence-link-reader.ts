import "server-only";
import { z } from "zod";
import { Sha256Schema, UtcTimestampSchema } from "@/lib/contracts/common";
import { invariant } from "@/lib/contracts/validation";
import {
  createProtectedScientistCustodyStore,
  createProtectedTournamentPublicationStore,
} from "@/server/artifacts/evaluation-store";
import {
  createTournamentPublicationReader,
  type ApprovedTournamentConfig,
} from "@/server/artifacts/tournament-provisioning";
import {
  createScientistRegistrationReader,
  type RegistrationConfig,
} from "./registration-reader";
import {
  EvidenceLinkSchema,
  RegistrationLineageSchema,
} from "./prospective-lineage";
import { digest } from "./transport";
import { canonicalJson as canonicalRecord } from "@/lib/report/canonical";
import { sha256 } from "@/lib/report/digests";
import type { IssuedHypothesis } from "./evidence";

const arm = z.strictObject({
  variant: z.enum(["A", "B"]),
  runId: z.string().min(1).max(128),
  baselineReceiptId: z.string().min(1).max(128),
  receiptId: z.string().min(1).max(128),
  initialTreeSha256: Sha256Schema,
  finalTreeSha256: Sha256Schema,
});
export const ScientistEvidenceLinkOriginalSchema = z.strictObject({
  schemaVersion: z.literal("scientist-evidence-link.local.v1"),
  disclosureScope: z.literal("meta-scientist-allowlisted-summary.v2"),
  recipientModels: z.tuple([
    z.literal("muse-spark-1.3"),
    z.literal("muse-spark-1.3-contributor"),
  ]),
  candidateConformance: z.literal(
    "independently_reviewed_against_registered_candidate",
  ),
  link: EvidenceLinkSchema,
  registrationOriginalSha256: Sha256Schema,
  preparedOriginalSha256: Sha256Schema,
  selectionAt: UtcTimestampSchema,
  preparationEvidence: z.record(z.string(), z.unknown()),
  studyDraft: z.record(z.string(), z.unknown()),
  lineage: RegistrationLineageSchema,
  arms: z.array(arm).length(2),
});
export type AuthenticatedEvidenceLink = Readonly<
  z.infer<typeof ScientistEvidenceLinkOriginalSchema>
>;
const authenticated = new WeakSet<object>();
export const isAuthenticatedEvidenceLink = (
  value: unknown,
): value is AuthenticatedEvidenceLink =>
  !!value && typeof value === "object" && authenticated.has(value);
export type EvidenceLinkConfig = {
  registration: RegistrationConfig;
  publication: ApprovedTournamentConfig;
  links: readonly {
    id: string;
    registrationId: string;
    originalId: string;
    preparationId: string;
    preparedId: string;
  }[];
};
export function createScientistEvidenceLinkReader(
  input: EvidenceLinkConfig | null,
  now = Date.now,
) {
  // The publication reader freshly validates custody and protected evidence.
  // Capture our own immutable configuration so caller mutations grant nothing.
  const config = input === null ? null : structuredClone(input);
  return Object.freeze({
    async resolveLink(
      id: string,
      issued: IssuedHypothesis,
    ): Promise<AuthenticatedEvidenceLink | null> {
      try {
        if (!config) return null;
        invariant(
          config.registration.custody.publicKeySha256 ===
            config.publication.publications.authorityPublicKeySha256 &&
            config.registration.custody.publicKeyPem ===
              config.publication.publications.authorityPublicKeyPem,
          "Competing custody authority.",
        );
        invariant(config.links.length <= 20, "Excessive links.");
        for (const key of [
          "id",
          "registrationId",
          "originalId",
          "preparationId",
          "preparedId",
        ] as const)
          invariant(
            new Set(config.links.map((e) => e[key])).size ===
              config.links.length,
            "Replayed lineage.",
          );
        const e = config.links.find((e) => e.id === id);
        if (!e) return null;
        const registrations = createScientistRegistrationReader(
          config.registration,
          now,
        );
        const registration = await registrations.resolveRegistration(
          e.registrationId,
          issued,
        );
        invariant(registration, "No current registered hypothesis.");
        const registered = registration.registration;
        const entry = config.registration.registrations.find(
          (x) => x.id === registered.id,
        )!;
        const store = await createProtectedScientistCustodyStore(
          config.registration.custody,
        );
        const binding = await store.load(entry.bindingId),
          original = await store.load(e.originalId),
          preparation = await store.load(e.preparationId),
          prepared = await store.load(e.preparedId);
        invariant(
          binding && original && preparation && prepared,
          "Missing lineage originals.",
        );
        const b = ScientistEvidenceLinkOriginalSchema.parse(original.document),
          l = b.link,
          at = now();
        for (const held of [original, preparation, prepared])
          invariant(
            held.record.studyId === registered.study.studyId &&
              Date.parse(held.record.heldAt) <= at &&
              at < Date.parse(held.record.expiresAt),
            "Stale lineage custody.",
          );
        invariant(
          original.record.kind === "scientist-evidence-link" &&
            original.record.predecessorSha256 === binding.sha256 &&
            b.registrationOriginalSha256 === binding.sha256 &&
            l.evidenceSummaryId === id &&
            l.prospectiveRegistrationId === registered.id &&
            digest(b.lineage) === digest(registration.lineage) &&
            l.hypothesisId === registered.hypothesisId &&
            l.hypothesisSha256 === registered.hypothesisSha256 &&
            l.contextSha256 === issued.contextSha256 &&
            l.baselineCommit === issued.hypothesis.baselineCommit &&
            l.candidateId === issued.hypothesis.candidateId &&
            l.studyId === registered.study.studyId &&
            l.taskId === registered.study.taskId &&
            l.registeredAt === registered.registeredAt &&
            l.expiresAt <= registered.expiresAt &&
            at < l.expiresAt,
          "Wrong evidence link.",
        );
        invariant(
          preparation.record.kind === "preparation" &&
            prepared.record.kind === "prepared" &&
            preparation.record.predecessorSha256 ===
              registered.study.protocolOriginalSha256 &&
            prepared.record.predecessorSha256 ===
              registered.study.protocolOriginalSha256 &&
            prepared.sha256 === b.preparedOriginalSha256 &&
            registered.registeredAt < Date.parse(preparation.record.heldAt) &&
            registered.registeredAt < Date.parse(b.selectionAt) &&
            Date.parse(b.selectionAt) < Date.parse(prepared.record.heldAt),
          "Late registration or wrong preparation chain.",
        );
        // The exact authenticated publication supplies preparation, run, receipt
        // and source identities. It remains subject to its own protected stores.
        const publications = await createProtectedTournamentPublicationStore(
          config.publication.publications,
        );
        const publication = await publications.load(l.studyId, at);
        invariant(
          publication &&
            Date.parse(publication.disclosureHeldAt) ===
              l.publicationApprovedAt &&
            digest(publication.artifact.projection) === l.projectionSha256 &&
            l.publicationApprovedAt <= Date.parse(original.record.heldAt),
          "Wrong disclosure or projection.",
        );
        const catalog = await createTournamentPublicationReader(
          config.publication,
          now,
        ).loadReports();
        const matches = catalog.reports.filter(
          (r) =>
            r.provenance === "FRESH_APPROVED_TOURNAMENT_LOADER" &&
            r.analysis.evidenceReferences?.projectionSha256 ===
              l.projectionSha256,
        );
        invariant(
          catalog.state === "available" && matches.length === 1,
          "Missing fresh protected report.",
        );
        const report = matches[0]!.analysis,
          identity = report.identity,
          observations = report.observations;
        invariant(
          identity &&
            observations &&
            identity.preparedOriginalSha256 === prepared.sha256,
          "Wrong prepared source commitment.",
        );
        for (const [key, value] of Object.entries(registered.study))
          invariant(
            identity[key as keyof typeof identity] === value,
            "Study identity changed.",
          );
        invariant(
          new Set(b.arms.map((a) => a.variant)).size === 2,
          "Duplicate arms.",
        );
        for (const expected of b.arms) {
          const actual = publication.artifact.projection.arms.find(
            (a) => a.variant === expected.variant,
          );
          invariant(
            actual &&
              registration.lineage.variants.find(
                (a) => a.variant === expected.variant,
              )?.runId === actual.runId,
            "Wrong registered run.",
          );
          for (const [key, value] of Object.entries(expected))
            invariant(
              actual[key as keyof typeof actual] === value,
              "Source or receipt substituted.",
            );
          if (expected.variant === "A")
            invariant(
              actual.initialTreeSha256 ===
                registration.lineage.sourceTreeSha256,
              "Wrong original source.",
            );
        }
        // Recompute the existing operator preparedSubject from its actual
        // authenticated payloads; a signed identity label alone is insufficient.
        const evidence = z
          .object({
            selectionAt: UtcTimestampSchema,
            proposal: z.string(),
            instructions: z.string(),
            selectedAttemptId: z.string(),
            originalManifest: z.unknown(),
            preparedManifest: z.unknown(),
            record: z
              .object({
                taskDefinitionSha256: Sha256Schema,
                protocolSha256: Sha256Schema,
                reviewRecordSha256: Sha256Schema,
                original: z.object({ treeSha256: Sha256Schema }).passthrough(),
                prepared: z.object({ treeSha256: Sha256Schema }).passthrough(),
                startedAt: UtcTimestampSchema,
                finishedAt: UtcTimestampSchema,
              })
              .passthrough(),
            attempts: z
              .array(
                z
                  .object({
                    id: z.string(),
                    authorizationId: z.string(),
                    status: z.string(),
                    startedAt: UtcTimestampSchema,
                    finishedAt: UtcTimestampSchema,
                  })
                  .passthrough(),
              )
              .min(1)
              .max(100),
          })
          .passthrough()
          .parse(b.preparationEvidence);
        const draft = z
          .object({ preparationRecordSha256: Sha256Schema })
          .passthrough()
          .parse(b.studyDraft);
        const preparedSubject = {
          definitionSha256: registered.study.definitionSha256,
          draftSha256: digest(b.studyDraft),
          preparationSha256: digest(b.preparationEvidence),
        };
        const B = b.arms.find((a) => a.variant === "B")!;
        invariant(
          digest(prepared.document) === digest(preparedSubject) &&
            draft.preparationRecordSha256 ===
              sha256(canonicalRecord(evidence.record)) &&
            evidence.selectionAt === b.selectionAt &&
            evidence.record.reviewRecordSha256 === preparation.sha256 &&
            evidence.record.taskDefinitionSha256 ===
              registered.study.taskDefinitionSha256 &&
            evidence.record.protocolSha256 ===
              registration.lineage.studyProtocolSha256 &&
            evidence.record.original.treeSha256 ===
              registration.lineage.sourceTreeSha256 &&
            digest(evidence.originalManifest) ===
              registration.lineage.sourceTreeSha256 &&
            evidence.record.prepared.treeSha256 === B.initialTreeSha256 &&
            digest(evidence.preparedManifest) === B.initialTreeSha256,
          "Unbound preparation payload or source manifest.",
        );
        invariant(
          new Set(evidence.attempts.map((a) => a.id)).size ===
            evidence.attempts.length &&
            evidence.attempts.some(
              (a) =>
                a.id === evidence.selectedAttemptId &&
                a.authorizationId === preparation.record.id,
            ),
          "Wrong selected preparation.",
        );
        invariant(
          digest(
            evidence.attempts.map(({ id, status, startedAt, finishedAt }) => ({
              id,
              status,
              startedAt,
              finishedAt,
            })),
          ) === digest(observations.preparationAttempts),
          "Changed preparation history.",
        );
        for (const attempt of evidence.attempts) {
          const authorization = await store.load(attempt.authorizationId);
          const subject = {
            preparationSha256: digest({
              definitionSha256: registered.study.definitionSha256,
              proposalSha256: sha256(evidence.proposal),
              instructionsSha256: sha256(evidence.instructions),
            }),
            attemptId: attempt.id,
          };
          invariant(
            authorization &&
              authorization.record.kind === "preparation" &&
              authorization.record.studyId === l.studyId &&
              authorization.record.predecessorSha256 ===
                registered.study.protocolOriginalSha256 &&
              digest(authorization.document) === digest(subject) &&
              registered.registeredAt <
                Date.parse(authorization.record.heldAt) &&
              Date.parse(authorization.record.heldAt) <=
                Date.parse(attempt.startedAt) &&
              Date.parse(attempt.startedAt) <= Date.parse(attempt.finishedAt) &&
              Date.parse(attempt.finishedAt) <
                Date.parse(prepared.record.heldAt) &&
              now() < Date.parse(authorization.record.expiresAt),
            "Wrong preparation attempt authorization.",
          );
        }
        const starts = [
          ...observations.preparationAttempts.map((a) => a.startedAt),
          ...observations.attempts.map((a) => a.startedAt),
        ].map(Date.parse);
        invariant(
          starts.length > 0 &&
            starts.every(
              (t) =>
                Number.isFinite(t) &&
                Date.parse(b.selectionAt) <= t &&
                Date.parse(preparation.record.heldAt) <= t &&
                registered.registeredAt < t,
            ),
          "Preparation predates registration.",
        );
        invariant(
          observations.attempts.every(
            (a) => Date.parse(prepared.record.heldAt) < Date.parse(a.startedAt),
          ),
          "Execution predates prepared commitment.",
        );
        const freshRegistration = await registrations.resolveRegistration(
          e.registrationId,
          issued,
        );
        invariant(
          freshRegistration &&
            digest(freshRegistration) === digest(registration),
          "Registration revoked during link read.",
        );
        for (const held of [original, preparation, prepared])
          invariant(
            await store.load(held.record.id),
            "Lineage revoked during read.",
          );
        invariant(
          await publications.load(l.studyId, now()),
          "Disclosure revoked during link read.",
        );
        invariant(now() < l.expiresAt, "Link expired during read.");
        function freeze<T>(value: T): T {
          if (value && typeof value === "object") {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
          }
          return value;
        }
        const result = freeze(b);
        authenticated.add(result);
        return result;
      } catch {
        return null;
      }
    },
  });
}
