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
