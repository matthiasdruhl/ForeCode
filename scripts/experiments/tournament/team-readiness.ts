// Public readiness is separate from native exit, archival and protected grade.
import { z } from "zod";
export const PublicReadinessSchema = z
  .strictObject({
    status: z.enum(["READY", "BLOCKED", "NOT_CHECKED"]),
    reason: z.enum([
      "deadline",
      "public-checks-passed",
      "public-checks-failed-or-interrupted",
    ]),
    candidateSha256: z.string().regex(/^[a-f0-9]{64}$/),
    outputSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    errorClass: z
      .enum(["ValueError", "TimeoutExpired", "OSError", "Exception"])
      .optional(),
  })
  .superRefine((value, context) => {
    if (
      (value.status === "READY") !==
        (value.reason === "public-checks-passed") ||
      (value.status === "READY" && !value.outputSha256) ||
      (value.status === "NOT_CHECKED" && value.reason !== "deadline")
    ) {
      context.addIssue({
        code: "custom",
        message: "Inconsistent public readiness.",
      });
    }
  });
export type PublicReadiness = z.infer<typeof PublicReadinessSchema>;
