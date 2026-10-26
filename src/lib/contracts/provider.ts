import { z } from "zod";
import { IdSchema } from "./common";

export const ProviderInfoSchema = z
  .strictObject({
    provider: z.enum(["meta", "template", "recording"]),
    model: z.string().min(1).max(160).nullable(),
    mode: z.enum(["live", "recorded", "template"]),
    promptVersion: IdSchema.nullable(),
    sourceEvidenceId: IdSchema.nullable(),
  })
  .superRefine((provider, ctx) => {
    if (
      provider.mode === "live" &&
      (provider.provider !== "meta" ||
        provider.model === null ||
        provider.promptVersion === null ||
        provider.sourceEvidenceId === null)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Live provenance requires Meta, model, prompt version and observed response evidence.",
      });
    }
    if (
      provider.mode === "template" &&
      (provider.provider !== "template" ||
        provider.model !== null ||
        provider.sourceEvidenceId !== null)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "A template cannot claim model inference or response evidence.",
      });
    }
  });
