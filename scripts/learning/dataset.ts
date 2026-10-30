import { DatasetSchema, type Dataset } from "../../src/lib/learning/contracts";
import { invariant } from "../../src/lib/contracts/validation";
import { jsonDigest } from "../../src/lib/report/digests";
import { immutable } from "../experiments/tournament/custody";
import { isAdmitted, type AdmittedObservation } from "./intake";

export function validateDataset(input: unknown): Dataset {
  const d = DatasetSchema.parse(input);
  invariant(
    new Set(d.rows.map((r) => r.observationSha256)).size === d.rows.length,
    "Repeated observation.",
  );
  // Connected duplicate groups: sharing EITHER repository OR task template is
  // enough to prohibit cross-split use. Booking seeds stay one family.
  for (const key of ["repositoryFamily", "taskFamily"] as const) {
    const groups = new Map<string, string>();
    for (const row of d.rows) {
      invariant(
        !groups.has(row[key]) || groups.get(row[key]) === row.split,
        "Train/held-out leakage.",
      );
      groups.set(row[key], row.split);
    }
  }
  return d;
}
export type Snapshot = Readonly<{
  manifest: Dataset;
  sha256: string;
  observations: readonly AdmittedObservation[];
}>;
const snapshots = new WeakSet<object>();
export function isSnapshot(value: unknown): value is Snapshot {
  return !!value && typeof value === "object" && snapshots.has(value);
}
export function createSnapshot(
  manifest: unknown,
  observations: readonly AdmittedObservation[],
): Snapshot {
  const d = validateDataset(manifest);
  invariant(
    d.rows.length === observations.length && observations.every(isAdmitted),
    "Snapshot requires authenticated observations.",
  );
  const byHash = new Map(observations.map((o) => [o.sha256, o]));
  const seenStudies = new Set<string>(),
    seenReceipts = new Set<string>();
  const ordered = d.rows.map((row) => {
    const o = byHash.get(row.observationSha256);
    invariant(
      o && o.projection.origin === d.origin,
      "Origin or observation mismatch.",
    );
    invariant(!seenStudies.has(o.projection.studyId), "Study replay.");
    seenStudies.add(o.projection.studyId);
    for (const receipt of o.evidence.receiptIds) {
      invariant(!seenReceipts.has(receipt), "Evidence replay.");
      seenReceipts.add(receipt);
    }
    const c = o.projection.context;
    invariant(
      row.contextSha256 === jsonDigest(c) &&
        row.repositoryFamily === c.repositoryFamily &&
        row.taskFamily === c.taskFamily &&
        jsonDigest(row.evidence) === jsonDigest(o.evidence),
      "Snapshot row binding mismatch.",
    );
    invariant(
      Date.parse(o.projection.observedAt) <= Date.parse(d.frozenAt),
      "Outcome after dataset freeze.",
    );
    return o;
  });
  const result = immutable({
    manifest: d,
    sha256: jsonDigest(d),
    observations: ordered,
  });
  snapshots.add(result);
  return result;
}
