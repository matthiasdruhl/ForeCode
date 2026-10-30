import { constants } from "node:fs";
import { open, readdir, lstat, unlink, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  IdSchema,
  Sha256Schema,
  UtcTimestampSchema,
} from "../../src/lib/contracts/common";
import {
  EvidenceReferenceSchema,
  StrategySchema,
} from "../../src/lib/learning/contracts";
import { invariant } from "../../src/lib/contracts/validation";
import { jsonDigest } from "../../src/lib/report/digests";
import { canonicalJson } from "../../src/lib/report/canonical";
import { immutable } from "../experiments/tournament/custody";
import {
  disjoint,
  privateDirectory,
  protectedRead,
} from "../experiments/artifacts/files";
import { isAdmitted } from "./intake";
import { assessReward } from "./reward";
import { isApprovedSourceResult, type SourceResult } from "./source";

export const LedgerAnchorSchema = z
  .strictObject({
    sequence: z.number().int().min(0).max(10000),
    sha256: Sha256Schema.nullable(),
  })
  .refine(
    (a) => (a.sequence === 0) === (a.sha256 === null),
    "Invalid ledger anchor.",
  );
const ReasonSchema = z.enum([
  "SOURCE_NOT_CONFIGURED",
  "SOURCE_ID_UNKNOWN",
  "ORIGINAL_OR_APPROVAL_INVALID",
  "SYNTHETIC_SOURCE_ISOLATED",
  "REWARD_INELIGIBLE",
  "REPLAY_RETAINED",
]);
export const LedgerRecordSchema = z.strictObject({
  schemaVersion: z.literal("learning-intake-ledger.v1"),
  sequence: z.number().int().min(1).max(10000),
  previousSha256: Sha256Schema.nullable(),
  at: UtcTimestampSchema,
  sourceId: IdSchema,
  packetSha256: Sha256Schema.nullable(),
  sourceAssessedAt: UtcTimestampSchema.nullable(),
  exportApprovalHeldAt: UtcTimestampSchema.nullable(),
  observationSha256: Sha256Schema.nullable(),
  origin: z.enum(["AUTHENTIC", "SYNTHETIC"]).nullable(),
  status: z.enum(["ADMITTED", "REJECTED", "BLOCKED", "REPLAY"]),
  reason: ReasonSchema.nullable(),
  evidence: EvidenceReferenceSchema.nullable(),
  comparison: z
    .enum(["COMPARABLE", "INVALID", "BLOCKED", "UNVERIFIED"])
    .nullable(),
  correctnessRewards: z.number().int().min(0).max(3),
  costRewards: z.number().int().min(0).max(3),
  failedActions: z.array(StrategySchema).max(3),
});
const EnvelopeSchema = z.strictObject({
  record: LedgerRecordSchema,
  sha256: Sha256Schema,
});
export type LedgerAnchor = z.infer<typeof LedgerAnchorSchema>;
type LedgerEntry = z.infer<typeof EnvelopeSchema>;
export type EvidenceLedger = Awaited<ReturnType<typeof openEvidenceLedger>>;

// The independently retained anchor is REQUIRED at every reopen. Hash chaining
// alone cannot detect deletion of a complete suffix. No mutable HEAD is trusted.
export async function openEvidenceLedger(config: {
  root: string;
  excludedRoots: readonly string[];
  expectedHead: LedgerAnchor;
  mode?: "AUTHENTIC" | "SYNTHETIC";
}) {
  const root = await privateDirectory(config.root);
  disjoint(root, fileURLToPath(new URL("../../", import.meta.url)));
  invariant(
    config.excludedRoots.length > 0,
    "Ledger workspace/source inventory required.",
  );
  const excluded = await Promise.all(
    config.excludedRoots.map((p) => realpath(p)),
  );
  excluded.forEach((p) => disjoint(root, p));
  const mode = config.mode ?? "AUTHENTIC";
  let head = immutable(LedgerAnchorSchema.parse(config.expectedHead));
  const filename = (sequence: number) =>
    "entry-" + String(sequence).padStart(8, "0") + ".json";
  const lockfile = path.join(root, "intake.lock");
  async function locked<T>(action: () => Promise<T>): Promise<T> {
    await privateDirectory(root);
    for (const p of excluded) disjoint(root, await realpath(p));
    // Exclusive lock rejects concurrent/stale writers. Never steal a stale lock
    // or delete an audit entry to recover automatically.
    const lock = await open(
      lockfile,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o400,
    );
    const identity = await lock.stat();
    try {
      return await action();
    } finally {
      await lock.close();
      const linked = await lstat(lockfile);
      invariant(
        !linked.isSymbolicLink() &&
          linked.ino === identity.ino &&
          linked.dev === identity.dev,
        "Audit lock changed.",
      );
      await unlink(lockfile);
    }
  }
  async function readChain(): Promise<LedgerEntry[]> {
    const names = (await readdir(root))
      .filter((n) => n !== "intake.lock")
      .sort();
    invariant(
      names.length === head.sequence &&
        names.every((n, i) => n === filename(i + 1)),
      "Ledger suffix missing, unexpected or unanchored.",
    );
    const entries: LedgerEntry[] = [];
    let previous: string | null = null,
      previousTime = -Infinity;
    const seen = new Set<string>();
    for (let i = 0; i < names.length; i++) {
      const entry = EnvelopeSchema.parse(
        JSON.parse(
          (await protectedRead(path.join(root, names[i]!))).toString("utf8"),
        ),
      );
      const r = entry.record;
      invariant(
        r.sequence === i + 1 &&
          r.previousSha256 === previous &&
          entry.sha256 === jsonDigest(r),
        "Ledger chain changed.",
      );
      invariant(Date.parse(r.at) >= previousTime, "Ledger chronology changed.");
      const hasEvidence = r.status === "ADMITTED" || r.status === "REPLAY";
      invariant(
        hasEvidence ===
          (r.evidence !== null &&
            r.observationSha256 !== null &&
            r.packetSha256 !== null &&
            r.origin !== null &&
            r.comparison !== null &&
            r.sourceAssessedAt !== null &&
            r.exportApprovalHeldAt !== null),
        "Audit evidence binding missing.",
      );
      if (hasEvidence) {
        invariant(
          r.origin === mode &&
            r.evidence!.projectionSha256 === r.observationSha256 &&
            Date.parse(r.evidence!.approvalHeldAt) <= Date.parse(r.at),
          "Audit origin/reference mismatch.",
        );
        invariant(
          Date.parse(r.sourceAssessedAt!) <= Date.parse(r.at) &&
            Date.parse(r.exportApprovalHeldAt!) <=
              Date.parse(r.sourceAssessedAt!),
          "Audit predates source assessment/approval.",
        );
        if (r.status === "ADMITTED") {
          invariant(!seen.has(r.observationSha256!), "Duplicate admission.");
          seen.add(r.observationSha256!);
        } else
          invariant(
            seen.has(r.observationSha256!) &&
              r.correctnessRewards === 0 &&
              r.costRewards === 0 &&
              r.reason === "REPLAY_RETAINED",
            "Invalid replay audit.",
          );
      } else
        invariant(
          r.correctnessRewards === 0 &&
            r.costRewards === 0 &&
            r.reason !== null &&
            r.failedActions.length === 0,
          "Rejected audit asserted rewards.",
        );
      previous = entry.sha256;
      previousTime = Date.parse(r.at);
      entries.push(entry);
    }
    invariant(
      previous === head.sha256,
      "Ledger differs from independently held head.",
    );
    return entries;
  }
  await locked(readChain);
  return Object.freeze({
    async inspect() {
      return locked(async () =>
        immutable({ head: { ...head }, entries: await readChain() }),
      );
    },
    async append(input: {
      sourceId: string;
      at: string;
      result: SourceResult;
    }) {
      IdSchema.parse(input.sourceId);
      UtcTimestampSchema.parse(input.at);
      return locked(async () => {
        const entries = await readChain();
        invariant(entries.length < 10000, "Ledger limit reached.");
        invariant(
          !entries.length ||
            Date.parse(input.at) >= Date.parse(entries.at(-1)!.record.at),
          "Backdated admission audit.",
        );
        const result = input.result;
        const base = {
          schemaVersion: "learning-intake-ledger.v1" as const,
          sequence: head.sequence + 1,
          previousSha256: head.sha256,
          at: input.at,
          sourceId: input.sourceId,
        };
        let record: z.infer<typeof LedgerRecordSchema>;
        if (result.status === "ADMITTED") {
          const o = result.observation;
          invariant(
            isApprovedSourceResult(result) &&
              isAdmitted(o) &&
              o.projection.origin === mode,
            "Authenticated observation/origin required for audit.",
          );
          invariant(result.sourceId === input.sourceId, "Source id mismatch.");
          invariant(
            Date.parse(result.assessedAt) <= Date.parse(input.at),
            "Audit predates source assessment.",
          );
          invariant(
            Date.parse(o.evidence.approvalHeldAt) <= Date.parse(input.at),
            "Admission audit predates approval.",
          );
          const replay = entries.some(
            (e) =>
              e.record.status === "ADMITTED" &&
              e.record.observationSha256 === o.sha256,
          );
          const rewards = assessReward(o, mode);
          const correctnessRewards = replay
            ? 0
            : rewards.filter((r) => r.correctness !== null).length;
          record = LedgerRecordSchema.parse({
            ...base,
            packetSha256: result.packetSha256,
            sourceAssessedAt: result.assessedAt,
            exportApprovalHeldAt: result.exportApprovalHeldAt,
            observationSha256: o.sha256,
            origin: o.projection.origin,
            status: replay ? "REPLAY" : "ADMITTED",
            reason: replay
              ? "REPLAY_RETAINED"
              : correctnessRewards
                ? null
                : "REWARD_INELIGIBLE",
            evidence: o.evidence,
            comparison: o.projection.comparison,
            correctnessRewards,
            costRewards: replay
              ? 0
              : rewards.filter((r) => r.efficiency !== null).length,
            failedActions: rewards
              .filter((r) => r.correctness === 0)
              .map((r) => r.action),
          });
        } else
          record = LedgerRecordSchema.parse({
            ...base,
            packetSha256: null,
            sourceAssessedAt: null,
            exportApprovalHeldAt: null,
            observationSha256: null,
            origin: null,
            status: result.status,
            reason: result.reason,
            evidence: null,
            comparison: null,
            correctnessRewards: 0,
            costRewards: 0,
            failedActions: [],
          });
        const entry = { record, sha256: jsonDigest(record) };
        const file = await open(
          path.join(root, filename(record.sequence)),
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o400,
        );
        try {
          await file.writeFile(canonicalJson(entry));
          await file.sync();
        } finally {
          await file.close();
        }
        head = immutable({ sequence: record.sequence, sha256: entry.sha256 });
        // A file fsync is not a filesystem/remote durability attestation.
        return immutable({ head: { ...head }, entry });
      });
    },
  });
}
