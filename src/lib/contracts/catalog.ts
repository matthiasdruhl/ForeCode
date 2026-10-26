import { SourceSchema } from "./common";
import {
  IntentV1Schema,
  IntentDraftV1Schema,
  IntentRevisionSchema,
  InterpretRequestSchema,
} from "./intents";
import { ProviderInfoSchema } from "./provider";
import { ApiErrorSchema } from "./errors";
import * as architecture from "./architecture";
import * as evidence from "./evidence";
import * as scientist from "./scientist";
import * as api from "./api";
import type { z } from "zod";

// Explicit external names, discovered from this newly authored implementation.
// No external schema, sample records or validator is bundled with the app.
export const contractCatalog: Readonly<Record<string, z.ZodType>> =
  Object.freeze(
    Object.fromEntries(
      Object.entries({
        SourceSchema,
        IntentV1Schema,
        IntentDraftV1Schema,
        IntentRevisionSchema,
        InterpretRequestSchema,
        ProviderInfoSchema,
        ApiErrorSchema,
        ...architecture,
        ...evidence,
        ...scientist,
        ...api,
      }).map(([name, schema]) => [name.replace(/Schema$/, ""), schema]),
    ),
  );
