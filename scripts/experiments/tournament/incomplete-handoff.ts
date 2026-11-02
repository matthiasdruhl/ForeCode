// Raw terminal retention only. No execution original, accepted reference,
// comparison, signature, registration, or publication authority is created.
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { IdSchema, Sha256Schema } from "../../../src/lib/contracts/common";
import { invariant } from "../../../src/lib/contracts/validation";
import { canonicalJson } from "../../../src/lib/report/canonical";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import { disjoint, privateDirectory, protectedRead } from "../artifacts/files";
import { RuntimeObservationSchema } from "./measured";
import type { PairedOutcome } from "./paired";
import type { Variant } from "./paired-inputs";
import type { RegisteredMeasurementSession } from "./registered-measurement";

type Arm = Readonly<{ variant: Variant; runId: string }>;
export type RuntimeOriginalCoverage = Arm &
  (
    | { state: "PRESENT_RAW_STRUCTURAL"; sha256: string }
    | { state: "MISSING"; sha256: null }
  );
type ClassificationInput = {
  outcome: PairedOutcome;
  declaredArms: readonly Arm[];
  runtimeOriginals: readonly RuntimeOriginalCoverage[];
};

/** Coverage describes protected bytes and schema/ID matches, not custody
 * authentication. The ordinary report path must still authenticate originals. */
export function classifyIncompleteHandoff(input: ClassificationInput) {
  const { outcome, declaredArms, runtimeOriginals } = input;
  IdSchema.parse(outcome.studyId);
  invariant(
    declaredArms.length === 2 &&
      new Set(declaredArms.map((a) => a.variant)).size === 2 &&
      declaredArms.every((a) => a.variant === "A" || a.variant === "B") &&
      new Set(declaredArms.map((a) => a.runId)).size === 2,
    "Two distinct declared arms required.",
  );
  for (const arm of declaredArms) IdSchema.parse(arm.runId);
  const declared = new Map(declaredArms.map((a) => [a.variant, a.runId]));
  invariant(
    ["NOT_RUN", "BLOCKED", "OBSERVED", "INCOMPLETE"].includes(
      outcome.execution,
    ) &&
      outcome.attempts.length <= 2 &&
      new Set(outcome.attempts.map((a) => a.run.id)).size ===
        outcome.attempts.length &&
      new Set(outcome.attempts.map((a) => a.variant)).size ===
        outcome.attempts.length &&
      outcome.attempts.every(
        (a) =>
          declared.get(a.variant) === a.run.id && a.run.variant === a.variant,
      ),
    "Duplicate, foreign, or misbound paired attempt.",
  );
  invariant(
    runtimeOriginals.length === 2 &&
      new Set(runtimeOriginals.map((r) => r.variant)).size === 2 &&
      runtimeOriginals.every(
        (r) =>
          declared.get(r.variant) === r.runId &&
          (r.state === "MISSING"
            ? r.sha256 === null
            : r.state === "PRESENT_RAW_STRUCTURAL" &&
              Sha256Schema.safeParse(r.sha256).success),
      ),
    "Exact declared runtime original coverage required.",
  );
  const actualAttemptIds = outcome.attempts.map((a) => a.run.id);
  const missingRuntimeOriginals = runtimeOriginals
    .filter((r) => r.state === "MISSING")
    .map(({ variant, runId }) => ({ variant, runId }));
  const reasons = [
    ...(actualAttemptIds.length < 2 ? ["ATTEMPTS_INCOMPLETE" as const] : []),
    ...(outcome.execution !== "OBSERVED"
      ? ["EXECUTION_NOT_OBSERVED" as const]
      : []),
    ...(missingRuntimeOriginals.length
      ? ["RUNTIME_ORIGINALS_MISSING" as const]
      : []),
    ...(!outcome.cleanupConfirmed || !outcome.leaseReleased
      ? ["CLEANUP_OR_LEASE_UNCONFIRMED" as const]
      : []),
  ];
  return {
    incomplete: reasons.length > 0,
    pairStatus:
      actualAttemptIds.length === 0
        ? ("NO_DOWNSTREAM_ATTEMPTS" as const)
        : actualAttemptIds.length < 2
          ? ("PARTIAL_DOWNSTREAM_ATTEMPTS" as const)
          : reasons.length
            ? ("TWO_ATTEMPTS_INCOMPLETE_EXECUTION_OR_EVIDENCE" as const)
            : ("COMPLETE_OBSERVED_PAIR" as const),
    execution: outcome.execution,
    reasons,
    actualAttemptIds,
    missingRuntimeOriginals,
  };
}

/** Migrate finite incomplete-primary retention here; call before normal report
 * reads. The caller retains its genuine-session and original-authentication
 * checks. Supplied references/snapshot recovery are retained, never promoted. */
export async function retainIncompleteHandoff(input: {
  outputDirectory: string;
  runtimeOriginalRoot: string;
  outcome: PairedOutcome;
  declaredArms: readonly Arm[];
  snapshotRecovery?: unknown;
  acceptedReferences?: ReturnType<RegisteredMeasurementSession["references"]>;
  derivedPrimaryDiagnosis?: unknown;
}) {
  const outputPath = input.outputDirectory;
  const runtimePath = input.runtimeOriginalRoot;
  // Freeze caller data before the first coverage read; callbacks cannot replace
  // an outcome or arm while asynchronous filesystem checks are in progress.
  const captured = JSON.parse(
    canonicalJson({
      outcome: input.outcome,
      declaredArms: input.declaredArms,
      snapshotRecovery: input.snapshotRecovery ?? null,
      acceptedReferences: input.acceptedReferences ?? null,
      derivedPrimaryDiagnosis: input.derivedPrimaryDiagnosis ?? null,
    }),
  ) as Pick<
    typeof input,
    | "outcome"
    | "declaredArms"
    | "snapshotRecovery"
    | "acceptedReferences"
    | "derivedPrimaryDiagnosis"
  >;
  const outputDirectory = await privateDirectory(outputPath);
  const runtimeOriginalRoot = await privateDirectory(runtimePath);
  disjoint(outputDirectory, runtimeOriginalRoot);
  // Validate IDs before using them as filesystem path components.
  classifyIncompleteHandoff({
    ...captured,
    runtimeOriginals: captured.declaredArms.map((arm) => ({
      ...arm,
      state: "MISSING",
      sha256: null,
    })),
  });
  const runtimeOriginals: RuntimeOriginalCoverage[] = [];
  for (const arm of captured.declaredArms) {
    const directory = path.join(runtimeOriginalRoot, arm.runId);
    try {
      invariant(
        !(await lstat(directory)).isSymbolicLink(),
        "Runtime directory aliases are forbidden.",
      );
      await privateDirectory(directory);
      const file = path.join(directory, "runtime-observation.json");
      const info = await lstat(file);
      invariant((info.mode & 0o777) === 0o400, "Sealed runtime file required.");
      const bytes = await protectedRead(file, 8_000_000);
      const original = RuntimeObservationSchema.parse(
        JSON.parse(bytes.toString("utf8")),
      );
      invariant(
        original.run.id === arm.runId && original.run.variant === arm.variant,
        "Runtime original identity differs from the declared arm.",
      );
      runtimeOriginals.push({
        ...arm,
        state: "PRESENT_RAW_STRUCTURAL",
        sha256: sha256(bytes),
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      runtimeOriginals.push({ ...arm, state: "MISSING", sha256: null });
    }
  }
  const classification = classifyIncompleteHandoff({
    ...captured,
    runtimeOriginals,
  });
  if (!classification.incomplete) return null;
  const document = {
    schemaVersion: "prospective-incomplete-primary-handoff.local.v2",
    studyId: captured.outcome.studyId,
    observedAt: new Date().toISOString(),
    pairedOutcomeSha256: jsonDigest(captured.outcome),
    primaryBlockers: captured.outcome.blockers,
    ...classification,
    declaredRunIds: captured.declaredArms.map((a) => a.runId),
    runtimeOriginals,
    runtimeCoverageAuthority: "RAW_STRUCTURAL_ONLY_NOT_AUTHENTICATED_EXECUTION",
    cleanupConfirmed: captured.outcome.cleanupConfirmed,
    leaseReleased: captured.outcome.leaseReleased,
    snapshotRecovery: captured.snapshotRecovery,
    acceptedReferences: captured.acceptedReferences,
    derivedPrimaryDiagnosis: captured.derivedPrimaryDiagnosis,
    metricsAuthority: null,
    completeComparativeReport: false,
    publication: "UNSIGNED_NOT_PUBLISHED",
    retry: "NONE",
    providerCallsByRecovery: 0,
    guestActionsByRecovery: 0,
  };
  const bytes = canonicalJson(document);
  invariant(Buffer.byteLength(bytes) <= 8_000_000, "Handoff exceeds bound.");
  const file = path.join(outputDirectory, "terminal-failure.json");
  const handle = await open(file, "wx", 0o400);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const directoryHandle = await open(outputDirectory, "r");
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
  return { file, sha256: sha256(bytes), document };
}
