// Additive local custody kinds; existing frozen v1 contracts are unchanged.
import { z } from "zod";
import {
  IdSchema,
  Sha256Schema,
  UtcTimestampSchema,
} from "../contracts/common";
export const CustodianRecordSchema = z.strictObject({
  schemaVersion: z.literal("tournament-custodian-record.local.v1"),
  id: IdSchema,
  studyId: IdSchema,
  kind: z.enum([
    "protocol",
    "preparation",
    "prepared",
    "runtime",
    "telemetry",
    "execution",
    "disclosure",
    "scientist-commitment",
    "scientist-registration",
    "scientist-evidence-link",
  ]),
  subjectSha256: Sha256Schema,
  predecessorSha256: Sha256Schema.nullable(),
  heldAt: UtcTimestampSchema,
  expiresAt: UtcTimestampSchema,
});
export const CustodianEnvelopeSchema = z.strictObject({
  record: CustodianRecordSchema,
  signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
});
export type CustodianRecord = z.infer<typeof CustodianRecordSchema>;
