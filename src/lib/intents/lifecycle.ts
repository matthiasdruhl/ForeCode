import { z } from "zod";
import { HorizonSchema, PrioritySchema } from "../contracts/common";
import {
  IntentV1Schema,
  type IntentRevision,
  type IntentV1,
} from "../contracts/intents";

export const IntentInputSchema = z.strictObject({
  title: z.string().trim().min(1, "Add a short title.").max(120),
  statement: z
    .string()
    .trim()
    .min(1, "Describe the future requirement.")
    .max(2000),
  priority: PrioritySchema,
  horizon: HorizonSchema,
});

export type IntentInput = z.infer<typeof IntentInputSchema>;

// Called by explicit user actions in the editor; model suggestions cannot use this path.
export function confirmIntent(
  input: IntentInput,
  id: string,
  now: Date,
): IntentV1 {
  return IntentV1Schema.parse({
    ...IntentInputSchema.parse(input),
    schemaVersion: "intent.v1",
    id,
    status: "confirmed",
    revision: 1,
    source: { kind: "user_confirmed", reference: "manual-intent-editor" },
    dependencies: [],
    updatedAt: now.toISOString(),
  });
}

export function reviseIntent(
  previous: IntentV1,
  input: IntentInput,
  now: Date,
): IntentV1 {
  const current = IntentV1Schema.parse(previous);
  return IntentV1Schema.parse({
    ...current,
    ...IntentInputSchema.parse(input),
    revision: current.revision + 1,
    status: "confirmed",
    source: { kind: "user_confirmed", reference: "manual-intent-editor" },
    updatedAt: now.toISOString(),
  });
}

export function revokeIntent(previous: IntentV1, now: Date): IntentV1 {
  const current = IntentV1Schema.parse(previous);
  return IntentV1Schema.parse({
    ...current,
    status: "rejected",
    revision: current.revision + 1,
    updatedAt: now.toISOString(),
  });
}

export function isCurrentIntentReference(
  reference: IntentRevision,
  intents: readonly IntentV1[],
): boolean {
  return intents.some(
    (intent) =>
      intent.id === reference.intentId &&
      intent.revision === reference.revision &&
      intent.status === "confirmed",
  );
}
