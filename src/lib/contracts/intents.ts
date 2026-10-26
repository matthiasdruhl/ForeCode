import { z } from "zod";
import {
  HorizonSchema,
  IdSchema,
  PrioritySchema,
  RevisionSchema,
  SourceSchema,
  UtcTimestampSchema,
} from "./common";

export const IntentV1Schema = z
  .strictObject({
    schemaVersion: z.literal("intent.v1"),
    id: IdSchema,
    title: z.string().min(1).max(120),
    statement: z.string().min(1).max(2000),
    status: z.enum(["confirmed", "tentative", "rejected"]),
    priority: PrioritySchema,
    horizon: HorizonSchema,
    source: SourceSchema,
    dependencies: z.array(IdSchema).max(32),
    revision: RevisionSchema,
    updatedAt: UtcTimestampSchema,
  })
  .superRefine((intent, ctx) => {
    if (
      intent.status === "confirmed" &&
      intent.source.kind !== "user_confirmed"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["source", "kind"],
        message: "Confirmation requires a user-confirmed source.",
      });
    }
    if (
      new Set(intent.dependencies).size !== intent.dependencies.length ||
      intent.dependencies.includes(intent.id)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["dependencies"],
        message:
          "Dependencies must be unique and must not reference the intent itself.",
      });
    }
  });

export const IntentDraftV1Schema = z.strictObject({
  id: IdSchema,
  title: z.string().min(1).max(120),
  statement: z.string().min(1).max(2000),
  priority: PrioritySchema,
  horizon: HorizonSchema,
  uncertainty: z.string().min(1).max(500),
  source: SourceSchema,
});

export const IntentRevisionSchema = z.strictObject({
  intentId: IdSchema,
  revision: RevisionSchema,
});
export const InterpretRequestSchema = z.strictObject({
  text: z.string().min(1).max(4000),
  consent: z.literal(true),
});

export type IntentV1 = z.infer<typeof IntentV1Schema>;
export type IntentRevision = z.infer<typeof IntentRevisionSchema>;
