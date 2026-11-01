// Trusted grader only. Case IDs/outcomes never cross the candidate RPC bridge.
// This channel is supplementary; it cannot issue a receipt or change a verdict.
import { AssertionError } from "node:assert";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fsyncSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { z } from "zod";
import { GradeIdentitySchema, teamOnlyCheckIds } from "./grade-profile";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const check = z.enum(teamOnlyCheckIds);
const outcome = z.enum(["pass", "fail", "not_run", "invalid"]);
export const TeamAuthorizationInstrumentationSchema = z
  .strictObject({
    schemaVersion: z.literal("booking-team-authorization-instrumentation.v1"),
    semanticsSha256: hash,
    cases: z
      .array(z.strictObject({ caseId: id, checkId: check }))
      .min(1)
      .max(100),
  })
  .superRefine((v, c) => {
    if (new Set(v.cases.map((x) => x.caseId)).size !== v.cases.length)
      c.addIssue({ code: "custom", message: "Duplicate authorization case." });
  });
export type TeamAuthorizationInstrumentation = z.infer<
  typeof TeamAuthorizationInstrumentationSchema
>;
// Explicit key order and sorted cases define this local channel's digest.
export function authorizationInstrumentationDigest(input: unknown) {
  const v = TeamAuthorizationInstrumentationSchema.parse(input);
  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: v.schemaVersion,
        semanticsSha256: v.semanticsSha256,
        cases: [...v.cases].sort((a, b) =>
          a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0,
        ),
      }),
    )
    .digest("hex");
}
export const TeamAuthorizationCheckpointSchema = z.strictObject({
  schemaVersion: z.literal("booking-team-authorization-checkpoint.v1"),
  identity: GradeIdentitySchema,
  instrumentationSha256: hash,
  checkId: check,
  ordinal: z.number().int().min(0).max(204),
  finalized: z.boolean(),
  complete: z.boolean(),
  groupOutcome: z.enum(["pass", "fail", "error"]).nullable(),
  cases: z.array(z.strictObject({ caseId: id, outcome })).max(100),
});
export type TeamAuthorizationCheckpoint = z.infer<
  typeof TeamAuthorizationCheckpointSchema
>;
export type ObserveTeamAuthorizationCase = (
  caseId: string,
  assertions: () => unknown | Promise<unknown>,
) => Promise<void>;

// The private reviewer wraps the original individual assertions with this
// function and awaits it. The assertion itself, not a group exit, sets outcome.
export function createTeamAuthorizationCollector(input: {
  instrumentation: unknown;
  identity: unknown;
  checkId: string;
  retain(checkpoint: TeamAuthorizationCheckpoint): void;
}) {
  const instrumentation = TeamAuthorizationInstrumentationSchema.parse(
    input.instrumentation,
  );
  const identity = GradeIdentitySchema.parse(input.identity);
  const checkId = check.parse(input.checkId);
  const rows = instrumentation.cases
    .filter((c) => c.checkId === checkId)
    .map((c) => ({
      caseId: c.caseId,
      outcome: "not_run" as z.infer<typeof outcome>,
    }));
  const started = new Set<string>();
  let closed = false,
    invalid = false,
    retentionUnavailable = false,
    active = 0,
    ordinal = 0;
  function retain(
    groupOutcome: TeamAuthorizationCheckpoint["groupOutcome"] = null,
  ) {
    try {
      input.retain(
        TeamAuthorizationCheckpointSchema.parse({
          schemaVersion: "booking-team-authorization-checkpoint.v1",
          identity,
          instrumentationSha256:
            authorizationInstrumentationDigest(instrumentation),
          checkId,
          ordinal: ordinal++,
          finalized: closed,
          complete:
            closed &&
            !invalid &&
            !retentionUnavailable &&
            !active &&
            groupOutcome !== "error" &&
            rows.every((r) => r.outcome === "pass" || r.outcome === "fail") &&
            !(
              groupOutcome === "pass" && rows.some((r) => r.outcome === "fail")
            ),
          groupOutcome,
          cases: rows,
        }),
      );
    } catch {
      retentionUnavailable = true;
      // A write may have persisted before its fsync/close failed. A subsequent
      // incomplete checkpoint invalidates that apparent completion if storage
      // recovers. The in-memory availability signal is also required by the
      // trusted grading controller before it may export this channel.
      try {
        input.retain(
          TeamAuthorizationCheckpointSchema.parse({
            schemaVersion: "booking-team-authorization-checkpoint.v1",
            identity,
            instrumentationSha256:
              authorizationInstrumentationDigest(instrumentation),
            checkId,
            ordinal: ordinal++,
            finalized: closed,
            complete: false,
            groupOutcome,
            cases: rows,
          }),
        );
      } catch {
        // Supplementary storage never prevents or replaces original assertions.
      }
    }
  }
  retain();
  const observeCase: ObserveTeamAuthorizationCase = async (
    caseId,
    assertions,
  ) => {
    if (closed) throw new Error("Protected authorization collector finalized.");
    const row = rows.find((r) => r.caseId === caseId);
    if (
      invalid ||
      !row ||
      started.has(caseId) ||
      typeof assertions !== "function"
    ) {
      invalid = true;
      retain();
      throw new Error("Unexpected or repeated protected authorization case.");
    }
    started.add(caseId);
    row.outcome = "invalid"; // A kill during assertions cannot become a pass.
    active++;
    retain();
    try {
      await assertions();
      if (closed || invalid)
        throw new Error("Protected authorization interval ended.");
      row.outcome = "pass";
    } catch (error) {
      row.outcome = error instanceof AssertionError ? "fail" : "invalid";
      throw error; // Preserve the original assertion and existing group verdict.
    } finally {
      active--;
      if (!closed) retain();
    }
  };
  return {
    observeCase,
    retentionAvailable: () => !retentionUnavailable,
    finish(groupOutcome: "pass" | "fail" | "error") {
      if (closed)
        throw new Error("Protected authorization collector finalized.");
      closed = true;
      retain(groupOutcome);
    },
  };
}

export const teamAuthorizationRoot = "/var/lib/forecode-team-authorization";
// The root seam is for synthetic custody tests. Production supplies the fixed
// root above; no worker, request, environment or private package selects a path.
export function retainTeamAuthorizationCheckpoint(root: string, raw: unknown) {
  const checkpoint = TeamAuthorizationCheckpointSchema.parse(raw);
  if (!path.isAbsolute(root) || path.resolve(root) !== root)
    throw new Error("Canonical private authorization root required.");
  for (const directory of [root, path.join(root, checkpoint.identity.runId)]) {
    try {
      mkdirSync(directory, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const s = lstatSync(directory);
    if (
      realpathSync(directory) !== directory ||
      !s.isDirectory() ||
      s.isSymbolicLink() ||
      s.uid !== process.getuid?.() ||
      (s.mode & 0o777) !== 0o700
    )
      throw new Error("Private authorization custody required.");
  }
  const directory = path.join(root, checkpoint.identity.runId);
  const file = path.join(
    directory,
    `${checkpoint.checkId}-${String(checkpoint.ordinal).padStart(3, "0")}.json`,
  );
  const rawBytes = JSON.stringify(checkpoint);
  if (Buffer.byteLength(rawBytes) > 32768)
    throw new Error("Protected authorization checkpoint bound.");
  const fd = openSync(
    file,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o400,
  );
  try {
    writeFileSync(fd, rawBytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  const parent = openSync(directory, "r");
  try {
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
}

export const TeamAuthorizationExportSchema = z.strictObject({
  schemaVersion: z.literal("booking-team-authorization-export.v1"),
  identity: GradeIdentitySchema,
  instrumentationSha256: hash,
  journalSha256: hash,
  groups: z.array(TeamAuthorizationCheckpointSchema).length(3),
});

// Read-only operator export. Original partial/failure journals remain in place.
// Missing/interrupted groups refuse export rather than inventing completions.
export function readTeamAuthorizationJournal(
  root: string,
  identityInput: unknown,
  instrumentationSha256: string,
) {
  const identity = GradeIdentitySchema.parse(identityInput);
  hash.parse(instrumentationSha256);
  const directory = path.join(root, identity.runId);
  for (const p of [root, directory]) {
    const s = lstatSync(p);
    if (
      realpathSync(p) !== p ||
      !s.isDirectory() ||
      s.uid !== process.getuid?.() ||
      (s.mode & 0o777) !== 0o700
    )
      throw new Error("Private authorization custody required.");
  }
  const before = lstatSync(directory);
  const names = readdirSync(directory).sort();
  if (names.length > 615) throw new Error("Authorization journal count bound.");
  const histories: { file: string; sha256: string }[] = [];
  const grouped = new Map<string, TeamAuthorizationCheckpoint[]>();
  for (const name of names) {
    if (
      !/^team-permissions-(domain|http|adversarial)-[0-9]{3}\.json$/.test(name)
    )
      throw new Error("Unexpected authorization journal file.");
    const file = path.join(directory, name),
      s = lstatSync(file);
    if (
      !s.isFile() ||
      s.isSymbolicLink() ||
      s.uid !== process.getuid?.() ||
      s.nlink !== 1 ||
      (s.mode & 0o777) !== 0o400 ||
      s.size > 32768
    )
      throw new Error("Immutable bounded authorization journal required.");
    const fd = openSync(
      file,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    let bytes: Buffer;
    try {
      const opened = fstatSync(fd);
      if (opened.ino !== s.ino || opened.dev !== s.dev)
        throw new Error("Authorization journal path changed.");
      bytes = Buffer.alloc(32769);
      const count = readSync(fd, bytes, 0, bytes.length, 0);
      bytes = bytes.subarray(0, count);
      const current = fstatSync(fd);
      if (
        current.mtimeMs !== s.mtimeMs ||
        current.ctimeMs !== s.ctimeMs ||
        current.size !== s.size
      )
        throw new Error("Authorization journal changed during read.");
    } finally {
      closeSync(fd);
    }
    const after = lstatSync(file);
    if (
      bytes.length !== s.size ||
      after.ino !== s.ino ||
      after.dev !== s.dev ||
      after.mtimeMs !== s.mtimeMs ||
      after.ctimeMs !== s.ctimeMs
    )
      throw new Error("Authorization journal changed.");
    const v = TeamAuthorizationCheckpointSchema.parse(
      JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes)),
    );
    if (
      JSON.stringify(v.identity) !== JSON.stringify(identity) ||
      v.instrumentationSha256 !== instrumentationSha256 ||
      name !== `${v.checkId}-${String(v.ordinal).padStart(3, "0")}.json`
    )
      throw new Error("Authorization journal identity mismatch.");
    const rows = grouped.get(v.checkId) ?? [];
    if (v.ordinal !== rows.length || rows.at(-1)?.finalized)
      throw new Error("Noncontiguous or reopened authorization journal.");
    rows.push(v);
    grouped.set(v.checkId, rows);
    histories.push({
      file: name,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  const groups = teamOnlyCheckIds.map((checkId) => {
    const v = grouped.get(checkId)?.at(-1);
    if (!v?.finalized) throw new Error("Incomplete authorization journal.");
    return v;
  });
  const after = lstatSync(directory);
  if (
    after.ino !== before.ino ||
    after.dev !== before.dev ||
    after.mtimeMs !== before.mtimeMs ||
    after.ctimeMs !== before.ctimeMs
  )
    throw new Error("Authorization journal directory changed.");
  return TeamAuthorizationExportSchema.parse({
    schemaVersion: "booking-team-authorization-export.v1",
    identity,
    instrumentationSha256,
    journalSha256: createHash("sha256")
      .update(JSON.stringify(histories))
      .digest("hex"),
    groups,
  });
}
