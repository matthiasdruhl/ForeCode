// Additive archival source disclosure. Parsing/projecting grants no authority.
import { z } from "zod";
import { IdSchema, Sha256Schema } from "../contracts/common";
import { invariant } from "../contracts/validation";
import { jsonDigest, sha256 } from "../report/digests";
import {
  PublicTournamentSchema,
  type PublicTournament,
} from "./tournament-publication";

export const SOURCE_LIMITS = Object.freeze({
  snapshots: 4,
  manifest: 100,
  bodies: 20,
  bodyBytes: 32 * 1024,
  totalBytes: 256 * 1024,
  documentBytes: 900 * 1024,
  lines: 500,
  cells: 250_000,
});
const literalPath = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) =>
    value
      .split("/")
      .every(
        (part) =>
          part !== "." && part !== ".." && /^[A-Za-z0-9_.[\]-]+$/.test(part),
      ),
  );
const sourcePath = literalPath.refine(
  (value) =>
    /^src\/(?:(?:[A-Za-z0-9_-]+|\[(?:\.\.\.)?[A-Za-z0-9_-]+\]|\[\[\.\.\.[A-Za-z0-9_-]+\]\])\/)*[A-Za-z0-9_.-]+\.(?:ts|tsx|css)$/.test(
      value,
    ) &&
    !value
      .split("/")
      .some((part) =>
        /^(?:tests?|__tests__|evaluator|graders?|config|configuration|env|environment|packages?)$/i.test(
          part,
        ),
      ) &&
    !/(?:^|\/)(?:[^/]*\.(?:test|spec|config)|config|configuration|env|environment|package)\.[^/]+$/i.test(
      value,
    ),
);
const validText = (value: string) =>
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value) &&
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
    value,
  );
const body = z.strictObject({
  path: sourcePath,
  sha256: Sha256Schema,
  text: z
    .string()
    .max(SOURCE_LIMITS.bodyBytes)
    .refine(
      (value) =>
        validText(value) &&
        Buffer.byteLength(value, "utf8") <= SOURCE_LIMITS.bodyBytes,
    ),
});
export const SourceRoleSchema = z.enum([
  "shared-original",
  "B-prepared",
  "A-final",
  "B-final",
]);
export type SourceRole = z.infer<typeof SourceRoleSchema>;
const snapshot = z
  .strictObject({
    role: SourceRoleSchema,
    treeSha256: Sha256Schema,
    runId: IdSchema.nullable(),
    manifest: z
      .array(z.strictObject({ path: literalPath, sha256: Sha256Schema }))
      .min(1)
      .max(SOURCE_LIMITS.manifest),
    bodies: z.array(body).max(SOURCE_LIMITS.bodies),
  })
  .superRefine((value, context) => {
    if (
      !value.manifest.every(
        (file, index) =>
          index === 0 || value.manifest[index - 1]!.path < file.path,
      ) ||
      jsonDigest(value.manifest) !== value.treeSha256 ||
      new Set(value.bodies.map((file) => file.path)).size !==
        value.bodies.length ||
      value.bodies.some(
        (file) =>
          sha256(file.text) !== file.sha256 ||
          !value.manifest.some(
            (entry) => entry.path === file.path && entry.sha256 === file.sha256,
          ),
      )
    )
      context.addIssue({
        code: "custom",
        message: "Noncanonical source inventory or body mismatch",
      });
  });
const limitation = z
  .string()
  .min(1)
  .max(1200)
  .refine(
    (value) =>
      value.trim() === value &&
      validText(value) &&
      !/[\r\n\t]/.test(value) &&
      !/(?:\/Users\/|\/private\/|\/home\/|\/root\/|\/tmp\/|[A-Za-z]:\\)/u.test(
        value,
      ),
  );
export const SourcePublicationSchema = z
  .strictObject({
    schemaVersion: z.literal("tournament-source-evidence-publication.v1"),
    authority: z.literal("owner_approved_archival_disclosure"),
    studyId: IdSchema,
    reportSha256: Sha256Schema,
    projectionSha256: Sha256Schema,
    preparedOriginalSha256: Sha256Schema,
    scopeLimitations: z.array(limitation).min(1).max(20),
    snapshots: z.array(snapshot).max(SOURCE_LIMITS.snapshots),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.snapshots.map((item) => item.role)).size !==
        value.snapshots.length ||
      value.snapshots.reduce(
        (sum, item) =>
          sum +
          item.bodies.reduce(
            (count, file) => count + Buffer.byteLength(file.text, "utf8"),
            0,
          ),
        0,
      ) > SOURCE_LIMITS.totalBytes ||
      Buffer.byteLength(JSON.stringify(value), "utf8") >
        SOURCE_LIMITS.documentBytes
    )
      context.addIssue({
        code: "custom",
        message: "Duplicate roles or excessive disclosure",
      });
  });
export type SourcePublication = z.infer<typeof SourcePublicationSchema>;
export function sourceDisclosureSubject(input: unknown) {
  return jsonDigest(SourcePublicationSchema.parse(input));
}
export type PublicSourceSnapshot = {
  role: SourceRole;
  treeSha256: string;
  runId: string | null;
  files: z.infer<typeof body>[];
};
export type SourceDiffRow = {
  kind: "context" | "removed" | "added";
  text: string;
  ending: "LF" | "CRLF" | "none";
};
export type SourceFileSide =
  | { state: "absent" }
  | { state: "undisclosed"; sha256: string }
  | { state: "available"; sha256: string; text: string };
export type SourceFileDiff = {
  path: string;
  change: "added" | "removed" | "modified" | "unchanged";
  before: SourceFileSide;
  after: SourceFileSide;
  state: "available" | "text-unavailable" | "too-large" | "unchanged";
  rows: SourceDiffRow[];
};
export type PublicSourceComparison = {
  id: "preparation-B" | "downstream-A" | "downstream-B";
  beforeRole: SourceRole;
  afterRole: SourceRole;
  state: "available" | "snapshot-unavailable";
  files: SourceFileDiff[];
};
export type PublicSourceEvidence = {
  studyId: string;
  reportSha256: string;
  projectionSha256: string;
  preparedOriginalSha256: string;
  scopeLimitations: string[];
  snapshots: PublicSourceSnapshot[];
  comparisons: PublicSourceComparison[];
};
function lines(text: string) {
  const result: { text: string; ending: "LF" | "CRLF" | "none" }[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index++)
    if (text[index] === "\n") {
      const cr = index > start && text[index - 1] === "\r";
      result.push({
        text: text.slice(start, cr ? index - 1 : index),
        ending: cr ? "CRLF" : "LF",
      });
      start = index + 1;
    }
  if (start < text.length)
    result.push({ text: text.slice(start), ending: "none" });
  return result;
}
function textRows(before: string, after: string): SourceDiffRow[] | null {
  const a = lines(before),
    b = lines(after);
  if (
    a.length > SOURCE_LIMITS.lines ||
    b.length > SOURCE_LIMITS.lines ||
    a.length * b.length > SOURCE_LIMITS.cells
  )
    return null;
  const table = Array.from(
    { length: a.length + 1 },
    () => new Uint16Array(b.length + 1),
  );
  const equal = (i: number, j: number) =>
    a[i]!.text === b[j]!.text && a[i]!.ending === b[j]!.ending;
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i]![j] = equal(i, j)
        ? table[i + 1]![j + 1]! + 1
        : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const rows: SourceDiffRow[] = [];
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && equal(i, j)) {
      rows.push({ kind: "context", ...a[i++]! });
      j++;
    } else if (
      i < a.length &&
      (j === b.length || table[i + 1]![j]! >= table[i]![j + 1]!)
    )
      rows.push({ kind: "removed", ...a[i++]! });
    else rows.push({ kind: "added", ...b[j++]! });
  }
  return rows;
}
function compare(
  before: SourcePublication["snapshots"][number],
  after: SourcePublication["snapshots"][number],
): SourceFileDiff[] {
  // Inventory paths without explicit text approval remain server-side. Compare
  // all manifest entries, then expose only paths explicitly disclosed on a side.
  const approved = new Set(
    [...before.bodies, ...after.bodies].map((file) => file.path),
  );
  const side = (snap: typeof before, path: string): SourceFileSide => {
    const entry = snap.manifest.find((file) => file.path === path);
    if (!entry) return { state: "absent" };
    const body = snap.bodies.find((file) => file.path === path);
    return body
      ? { state: "available", sha256: entry.sha256, text: body.text }
      : { state: "undisclosed", sha256: entry.sha256 };
  };
  return [
    ...new Set(
      [...before.manifest, ...after.manifest].map((file) => file.path),
    ),
  ]
    .sort()
    .filter((path) => approved.has(path))
    .map((path) => {
      const left = side(before, path),
        right = side(after, path);
      const change =
        left.state === "absent"
          ? "added"
          : right.state === "absent"
            ? "removed"
            : left.sha256 === right.sha256
              ? "unchanged"
              : "modified";
      const base = { path, change, before: left, after: right } as const;
      if (change === "unchanged")
        return { ...base, state: "unchanged", rows: [] };
      if (left.state === "undisclosed" || right.state === "undisclosed")
        return { ...base, state: "text-unavailable", rows: [] };
      const rows = textRows(
        left.state === "absent" ? "" : left.text,
        right.state === "absent" ? "" : right.text,
      );
      return {
        ...base,
        state: rows === null ? "too-large" : "available",
        rows: rows ?? [],
      };
    });
}
// Pure exact joins/projector; only the server loader authenticates custody.
export function projectSourcePublication(
  input: unknown,
  base: PublicTournament,
  reportSha256: string,
): PublicSourceEvidence {
  const evidence = SourcePublicationSchema.parse(input),
    projection = PublicTournamentSchema.parse(base);
  invariant(
    evidence.studyId === projection.studyId &&
      evidence.reportSha256 === reportSha256 &&
      evidence.projectionSha256 === jsonDigest(projection) &&
      evidence.preparedOriginalSha256 === projection.preparedOriginalSha256,
    "Source/base mismatch",
  );
  for (const snapshot of evidence.snapshots) {
    const arm = projection.arms.find(
      (arm) =>
        arm.variant ===
        (snapshot.role === "A-final" || snapshot.role === "shared-original"
          ? "A"
          : "B"),
    );
    invariant(arm, "Missing source arm");
    const initial =
      snapshot.role === "shared-original" || snapshot.role === "B-prepared";
    invariant(
      snapshot.treeSha256 ===
        (initial ? arm.initialTreeSha256 : arm.finalTreeSha256) &&
        (snapshot.role === "shared-original"
          ? snapshot.runId === null
          : snapshot.role === "B-prepared"
            ? snapshot.runId === arm.runId
            : arm.runId !== null && snapshot.runId === arm.runId),
      "Source role/tree/run mismatch",
    );
  }
  const comparisons: PublicSourceComparison[] = (
    [
      ["preparation-B", "shared-original", "B-prepared"],
      ["downstream-A", "shared-original", "A-final"],
      ["downstream-B", "B-prepared", "B-final"],
    ] as const
  ).map(([id, beforeRole, afterRole]) => {
    const before = evidence.snapshots.find((item) => item.role === beforeRole),
      after = evidence.snapshots.find((item) => item.role === afterRole);
    return {
      id,
      beforeRole,
      afterRole,
      state: before && after ? "available" : "snapshot-unavailable",
      files: before && after ? compare(before, after) : [],
    };
  });
  return {
    studyId: evidence.studyId,
    reportSha256: evidence.reportSha256,
    projectionSha256: evidence.projectionSha256,
    preparedOriginalSha256: evidence.preparedOriginalSha256,
    scopeLimitations: evidence.scopeLimitations,
    snapshots: evidence.snapshots.map(
      ({ role, treeSha256, runId, bodies }) => ({
        role,
        treeSha256,
        runId,
        files: bodies,
      }),
    ),
    comparisons,
  };
}
