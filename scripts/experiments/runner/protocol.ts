import type { CandidateEnvelope } from "../artifacts/files";
import { z } from "zod";
import { Sha256Schema } from "../../../src/lib/contracts/common";
import { bookingPolicy } from "../../evaluator/booking-v1/freeze";

export const fixedTask = {
  id: "booking-ownership-refactor-v1",
  prompt:
    "Refactor src/server/booking-service.ts to extract its viewer and ownership authorization helpers into a separate server module. Preserve all current booking behavior, public service and HTTP interfaces. Only edit src/. Read the service first and inspect immediate imports only if necessary; keep tool calls focused. This is a source-only worker without installed dependencies. Do not install packages or run tests/builds: the separate protected grader will check the sealed source after you exit. Finish once the extraction is complete. Do not change package/configuration/test files. The public baseline oracle checks behavior preservation; it does not certify refactor quality. Do not access host integrations or other workspaces.",
} as const;
export const GradeReportSchema = z.strictObject({
  schemaVersion: z.literal("booking-grade-observation.v1"),
  runId: z.string().uuid(),
  evaluatedTreeSha256: Sha256Schema,
  evaluatorSha256: Sha256Schema,
  testSuiteSha256: Sha256Schema,
  requiredPolicySha256: Sha256Schema,
  checks: z
    .array(
      z.strictObject({
        id: z.enum([
          "typecheck",
          "build",
          "baseline-domain",
          "http-integration",
          "boundary",
        ]),
        exitCode: z.number().int().min(0).max(255).nullable(),
        status: z.enum(["pass", "fail", "error", "not_run"]),
        detail: z.string().max(2048),
      }),
    )
    .max(5),
});
export type GradeReport = z.infer<typeof GradeReportSchema>;
export function validateGradeReport(
  raw: unknown,
  expected: Omit<GradeReport, "schemaVersion" | "checks">,
) {
  const report = GradeReportSchema.parse(raw);
  for (const key of Object.keys(expected) as (keyof typeof expected)[])
    if (report[key] !== expected[key])
      throw new Error("Wrong candidate or stale evaluator report.");
  const ids = report.checks.map((check) => check.id);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !bookingPolicy.requiredCheckIds.includes(id))
  )
    throw new Error("Invalid evaluator check set.");
  for (const check of report.checks) {
    if (
      (check.status === "pass" && check.exitCode !== 0) ||
      (check.status === "fail" &&
        (check.exitCode === null || check.exitCode === 0)) ||
      (check.status === "not_run" && check.exitCode !== null)
    )
      throw new Error("Forged evaluator status/exit pair.");
  }
  return report;
}

export type GradeInput = {
  runId: string;
  evaluatedTreeSha256: string;
  evaluatorSha256: string;
  testSuiteSha256: string;
  requiredPolicySha256: string;
  candidate: CandidateEnvelope;
  workerImage: string;
};
