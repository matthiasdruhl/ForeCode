// Standalone trusted host/guest protocol. No candidate import or execution.
import { createHash } from "node:crypto";
import { z } from "zod";

export const baselineCheckIds = [
  "typecheck",
  "build",
  "baseline-domain",
  "http-integration",
  "boundary",
] as const;
export const teamOnlyCheckIds = [
  "team-permissions-domain",
  "team-permissions-http",
  "team-permissions-adversarial",
] as const;
export const teamCheckIds = [...baselineCheckIds, ...teamOnlyCheckIds] as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const teamTaskId = "booking-team-permissions-v1";
export const teamTaskSha256 =
  "fcd6f62dd7ca4c9713c230bd83cc4ede181a9a873c6698d2db2148285ea05883";
export const TeamGradeProfileSchema = z.strictObject({
  kind: z.literal("booking-team-permissions.v1"),
  taskId: z.literal(teamTaskId),
  taskDefinitionSha256: z.literal(teamTaskSha256),
  descriptorSha256: hash,
  fixtureSha256: hash,
  dependencyLockSha256: hash,
  baselineEvaluatorSha256: hash,
  evaluatorSha256: hash,
  testSuiteSha256: hash,
  requiredPolicySha256: hash,
});
export type TeamGradeProfile = z.infer<typeof TeamGradeProfileSchema>;

export function teamEvaluatorIdentity(
  publicEvaluatorSha256: string,
  suiteSha256: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "booking-team-evaluator.v1",
        hash.parse(publicEvaluatorSha256),
        teamTaskSha256,
        hash.parse(suiteSha256),
      ]),
    )
    .digest("hex");
}
export function validateTeamProfile(input: unknown): TeamGradeProfile {
  const profile = TeamGradeProfileSchema.parse(input);
  if (
    profile.evaluatorSha256 !==
    teamEvaluatorIdentity(
      profile.baselineEvaluatorSha256,
      profile.testSuiteSha256,
    )
  )
    throw new Error("Team evaluator closure mismatch.");
  return profile;
}
export function selectedChecks(profile?: TeamGradeProfile) {
  if (profile === undefined) return [...baselineCheckIds];
  validateTeamProfile(profile);
  return [...teamCheckIds];
}

export const GradeIdentitySchema = z.strictObject({
  runId: z.string().uuid(),
  evaluatedTreeSha256: hash,
  evaluatorSha256: hash,
  testSuiteSha256: hash,
  requiredPolicySha256: hash,
});
export type GradeIdentity = z.infer<typeof GradeIdentitySchema>;
export const GradeInputSchema = GradeIdentitySchema.extend({
  candidate: z.strictObject({
    runId: z.string().uuid(),
    files: z
      .array(
        z.strictObject({
          path: z.string().min(1).max(240),
          base64: z.string().max(2800000),
        }),
      )
      .min(1)
      .max(100),
  }),
  workerImage: z
    .string()
    .regex(/^(?:forecode-booking-toolchain@)?sha256:[a-f0-9]{64}$/),
  evaluationProfile: TeamGradeProfileSchema.optional(),
});
export type GradeInput = z.infer<typeof GradeInputSchema>;
export const GradeReportSchema = GradeIdentitySchema.extend({
  schemaVersion: z.literal("booking-grade-observation.v1"),
  evaluationProfile: TeamGradeProfileSchema.optional(),
  checks: z
    .array(
      z.strictObject({
        id: z.enum(teamCheckIds),
        exitCode: z.number().int().min(0).max(255).nullable(),
        status: z.enum(["pass", "fail", "error", "not_run"]),
        detail: z.string().max(2048),
      }),
    )
    .max(8),
});
export type GradeReport = z.infer<typeof GradeReportSchema>;

export function validateProfileIdentity(
  identity: GradeIdentity,
  profile?: TeamGradeProfile,
) {
  if (!profile) return;
  const parsed = validateTeamProfile(profile);
  for (const key of [
    "evaluatorSha256",
    "testSuiteSha256",
    "requiredPolicySha256",
  ] as const)
    if (identity[key] !== parsed[key])
      throw new Error("Wrong team profile identity.");
}
export function validateGradeInput(raw: unknown): GradeInput {
  const input = GradeInputSchema.parse(raw);
  validateProfileIdentity(input, input.evaluationProfile);
  if (input.candidate.runId !== input.runId)
    throw new Error("Cross-run candidate.");
  const manifest: { path: string; sha256: string }[] = [];
  let total = 0;
  for (const file of input.candidate.files) {
    if (
      !/^[A-Za-z0-9_.()[\]/-]+$/.test(file.path) ||
      file.path.split("/").some((part) => part === ".." || part === ".") ||
      file.path.startsWith("/") ||
      manifest.some((item) => item.path === file.path)
    )
      throw new Error("Invalid candidate path.");
    const bytes = Buffer.from(file.base64, "base64");
    if (
      bytes.toString("base64") !== file.base64 ||
      bytes.length > 2097152 ||
      (total += bytes.length) > 8000000
    )
      throw new Error("Candidate bound.");
    const digest = createHash("sha256").update(bytes).digest("hex");
    manifest.push({ path: file.path, sha256: digest });
    if (
      input.evaluationProfile &&
      file.path === "package-lock.json" &&
      digest !== input.evaluationProfile.dependencyLockSha256
    )
      throw new Error("Candidate dependency lock mismatch.");
  }
  manifest.sort((a, b) => (a.path < b.path ? -1 : 1));
  if (
    createHash("sha256").update(JSON.stringify(manifest)).digest("hex") !==
    input.evaluatedTreeSha256
  )
    throw new Error("Candidate identity mismatch.");
  if (
    input.evaluationProfile &&
    !manifest.some((file) => file.path === "package-lock.json")
  )
    throw new Error("Candidate dependency lock absent.");
  return input;
}

// Missing checks are retained for the existing publisher/store to mark unrun.
// Neither candidate JSON nor process exit can supply a verification verdict.
export function validateGradeReport(
  raw: unknown,
  expectedInput: GradeIdentity,
  expectedProfile?: TeamGradeProfile,
): GradeReport {
  const expected = GradeIdentitySchema.parse(expectedInput);
  const report = GradeReportSchema.parse(raw);
  for (const key of Object.keys(expected) as (keyof GradeIdentity)[])
    if (report[key] !== expected[key])
      throw new Error("Wrong candidate or stale evaluator report.");
  if (
    JSON.stringify(report.evaluationProfile) !==
    JSON.stringify(
      expectedProfile ? validateTeamProfile(expectedProfile) : undefined,
    )
  )
    throw new Error("Unexpected grading profile.");
  validateProfileIdentity(report, expectedProfile);
  const checks = selectedChecks(expectedProfile);
  const ids = report.checks.map((item) => item.id);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !(checks as readonly string[]).includes(id))
  )
    throw new Error("Invalid evaluator check set.");
  for (const check of report.checks)
    if (
      (check.status === "pass" && check.exitCode !== 0) ||
      (check.status === "fail" &&
        (check.exitCode === null || check.exitCode === 0)) ||
      (check.status === "not_run" && check.exitCode !== null)
    )
      throw new Error("Forged evaluator status/exit pair.");
  return report;
}
