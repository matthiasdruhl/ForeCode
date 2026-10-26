import { z } from "zod";

export const IdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
export const RevisionSchema = z.number().int().min(1).max(2_147_483_647);
export const UtcTimestampSchema = z.iso.datetime({ offset: false });
export const PrioritySchema = z.enum(["low", "medium", "high"]);
export const HorizonSchema = z.enum(["near", "later", "unspecified"]);

export const SourceSchema = z.strictObject({
  kind: z.enum([
    "user_confirmed",
    "user_tentative",
    "meta_suggestion",
    "manual_entry",
  ]),
  reference: z.string().min(1).max(128),
});

export const GitCommitSchema = z.string().regex(/^[a-f0-9]{40}$/);
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const RelativePathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_./*-]+$/);
export const EffortUnitSchema = z.literal("modeled_effort_points_v1");
export const CheckStatusSchema = z.enum(["pass", "fail", "not_run", "invalid"]);
export const VerdictSchema = z.enum([
  "VERIFIED",
  "REJECTED",
  "INSUFFICIENT_EVIDENCE",
]);
export const text = (max: number) => z.string().min(1).max(max);
export const texts = (maxLength: number, maxItems: number, minItems = 0) =>
  z.array(text(maxLength)).min(minItems).max(maxItems);
export const ids = (maxItems: number, minItems = 0) =>
  z.array(IdSchema).min(minItems).max(maxItems);
export const count = (max = 2_147_483_647) => z.number().int().min(0).max(max);
