import path from "node:path";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  IdSchema,
  Sha256Schema,
  UtcTimestampSchema,
} from "../../src/lib/contracts/common";
import { jsonDigest, sha256 } from "../../src/lib/report/digests";
import { invariant } from "../../src/lib/contracts/validation";
import {
  immutable,
  requireHeldRecord,
} from "../experiments/tournament/custody";
import {
  privateDirectory,
  protectedRead,
  disjoint,
} from "../experiments/artifacts/files";
import {
  ProjectionSchema,
  admitObservation,
  type AdmittedObservation,
} from "./intake";

export const ApprovedPacketSchema = z.strictObject({
  schemaVersion: z.literal("approved-learning-export.local.v1"),
  sourceReportSha256: Sha256Schema,
  projection: ProjectionSchema,
});
const EntrySchema = z.strictObject({
  file: z.string().regex(/^[A-Za-z0-9_-]{1,100}\.json$/),
  bytesSha256: Sha256Schema,
  packetSha256: Sha256Schema,
  projectionSha256: Sha256Schema,
  studyId: IdSchema,
  origin: z.enum(["AUTHENTIC", "SYNTHETIC"]),
  protocolId: IdSchema,
  decisionRecordId: IdSchema,
  projectionApprovalId: IdSchema,
  exportApprovalId: IdSchema,
});
export type SourceEntry = z.infer<typeof EntrySchema>;
export type SourceResult =
  | {
      status: "ADMITTED";
      sourceId: string;
      observation: AdmittedObservation;
      packetSha256: string;
      assessedAt: string;
      exportApprovalHeldAt: string;
    }
  | {
      status: "BLOCKED" | "REJECTED";
      reason:
        | "SOURCE_NOT_CONFIGURED"
        | "SOURCE_ID_UNKNOWN"
        | "ORIGINAL_OR_APPROVAL_INVALID"
        | "SYNTHETIC_SOURCE_ISOLATED";
    };
const loadedSources = new WeakSet<object>();
export function isApprovedSourceResult(
  value: unknown,
): value is Extract<SourceResult, { status: "ADMITTED" }> {
  return !!value && typeof value === "object" && loadedSources.has(value);
}
// Constructible before outcomes exist. An independently held original binds
// exact context, action set, model provenance, selector and selected strategy.
export function decisionCommitmentSubject(
  input: Pick<
    z.infer<typeof ProjectionSchema>,
    "studyId" | "protocolOriginalSha256" | "context" | "decisionAt" | "decision"
  >,
) {
  return jsonDigest({
    schemaVersion: "learning-decision-commitment.local.v1",
    studyId: input.studyId,
    protocolOriginalSha256: input.protocolOriginalSha256,
    context: input.context,
    decisionAt: input.decisionAt,
    decision: input.decision,
  });
}
export type EvidenceSource = Readonly<{
  configured: boolean;
  entryCount: number;
  load(id: string, assessmentAt: string): Promise<SourceResult>;
}>;

// No discovery or trusted configuration is read from the packet/CLI/environment.
// Independently reviewed operator composition supplies original-byte pins and
// the existing ORIGINAL custody/evaluation loaders. No signer is implemented.
export async function createApprovedEvidenceSource(input: {
  root: string;
  excludedRoots: readonly string[];
  entries: ReadonlyMap<string, SourceEntry>;
  loadRecord(id: string): Promise<unknown>;
  loadEvaluation(id: string): Promise<unknown>;
  mode?: "AUTHENTIC" | "SYNTHETIC";
}): Promise<EvidenceSource> {
  const root = await privateDirectory(input.root),
    repository = fileURLToPath(new URL("../../", import.meta.url));
  disjoint(root, repository);
  invariant(
    input.excludedRoots.length > 0,
    "Source workspace inventory required.",
  );
  const excluded = await Promise.all(
    input.excludedRoots.map((p) => realpath(p)),
  );
  excluded.forEach((p) => disjoint(root, p));
  const mode = input.mode ?? "AUTHENTIC";
  const entries = new Map<string, SourceEntry>(),
    files = new Set<string>(),
    packets = new Set<string>();
  for (const [id, value] of input.entries) {
    IdSchema.parse(id);
    const e = EntrySchema.parse(value);
    invariant(
      !files.has(e.file) && !packets.has(e.packetSha256),
      "Reused export original.",
    );
    files.add(e.file);
    packets.add(e.packetSha256);
    invariant(
      new Set([
        e.protocolId,
        e.decisionRecordId,
        e.projectionApprovalId,
        e.exportApprovalId,
      ]).size === 4,
      "Custody roles must be distinct.",
    );
    entries.set(id, immutable(e));
  }
  // Capture capabilities; replacing properties of caller configuration later
  // cannot substitute a signer, loader or allowlist entry.
  const loadRecord = input.loadRecord,
    loadEvaluation = input.loadEvaluation;
  return Object.freeze({
    configured: true,
    entryCount: entries.size,
    async load(id: string, assessmentAt: string): Promise<SourceResult> {
      const e = entries.get(id);
      if (!e) return { status: "BLOCKED", reason: "SOURCE_ID_UNKNOWN" };
      if (e.origin !== mode)
        return { status: "REJECTED", reason: "SYNTHETIC_SOURCE_ISOLATED" };
      try {
        UtcTimestampSchema.parse(assessmentAt);
        await privateDirectory(root);
        for (const p of excluded) disjoint(root, await realpath(p));
        const bytes = await protectedRead(path.join(root, e.file));
        invariant(
          sha256(bytes) === e.bytesSha256,
          "Original export bytes changed.",
        );
        const packet = ApprovedPacketSchema.parse(
          JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
        );
        const p = packet.projection;
        invariant(
          jsonDigest(packet) === e.packetSha256 &&
            jsonDigest(p) === e.projectionSha256 &&
            p.studyId === e.studyId &&
            p.origin === e.origin,
          "Export pin mismatch.",
        );
        const decision = requireHeldRecord(
          await loadRecord(e.decisionRecordId),
          {
            studyId: p.studyId,
            kind: "disclosure",
            subjectSha256: decisionCommitmentSubject(p),
            predecessorSha256: p.protocolOriginalSha256,
            at: p.decisionAt,
          },
        );
        invariant(
          Date.parse(decision.record.heldAt) < Date.parse(p.observedAt),
          "Decision original postdates outcome.",
        );
        const approval = requireHeldRecord(
          await loadRecord(e.exportApprovalId),
          {
            studyId: p.studyId,
            kind: "disclosure",
            subjectSha256: e.packetSha256,
            predecessorSha256: p.protocolOriginalSha256,
            at: assessmentAt,
          },
        );
        invariant(
          Date.parse(approval.record.heldAt) >= Date.parse(p.observedAt),
          "Export approval predates outcome.",
        );
        const observation = await admitObservation({
          projection: p,
          approvalId: e.projectionApprovalId,
          protocolId: e.protocolId,
          assessmentAt,
          loadRecord,
          loadEvaluation,
        });
        const result = immutable({
          status: "ADMITTED",
          sourceId: id,
          observation,
          packetSha256: e.packetSha256,
          assessedAt: assessmentAt,
          exportApprovalHeldAt: approval.record.heldAt,
        } as const);
        loadedSources.add(result);
        return result;
      } catch {
        // Raw parser errors, diagnostic bodies, paths and signatures stay private.
        return { status: "REJECTED", reason: "ORIGINAL_OR_APPROVAL_INVALID" };
      }
    },
  });
}

// Main has no approved core exporter/catalog. This cannot be configured by a
// browser payload, filesystem path, environment variable or CLI flag.
export const unprovisionedEvidenceSource: EvidenceSource = Object.freeze({
  configured: false,
  entryCount: 0,
  async load(): Promise<SourceResult> {
    return { status: "BLOCKED", reason: "SOURCE_NOT_CONFIGURED" };
  },
});
