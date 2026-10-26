import { describe, expect, it } from "vitest";
import { ProviderInfoSchema } from "@/lib/contracts/provider";

describe("model provenance boundaries", () => {
  const live = {
    provider: "meta",
    model: "unit-test-model",
    mode: "live",
    promptVersion: "intent-1",
    sourceEvidenceId: "response-17",
  };
  it("requires the complete live provenance shape", () => {
    expect(ProviderInfoSchema.safeParse(live).success).toBe(true);
    for (const field of ["model", "promptVersion", "sourceEvidenceId"]) {
      expect(
        ProviderInfoSchema.safeParse({ ...live, [field]: null }).success,
      ).toBe(false);
    }
    expect(
      ProviderInfoSchema.safeParse({ ...live, provider: "template" }).success,
    ).toBe(false);
  });
  it("keeps a template from claiming model inference", () => {
    const template = {
      provider: "template",
      model: null,
      mode: "template",
      promptVersion: "manual-1",
      sourceEvidenceId: null,
    };
    expect(ProviderInfoSchema.safeParse(template).success).toBe(true);
    expect(
      ProviderInfoSchema.safeParse({ ...template, model: "pretend-model" })
        .success,
    ).toBe(false);
    expect(
      ProviderInfoSchema.safeParse({
        ...template,
        sourceEvidenceId: "fabricated-response",
      }).success,
    ).toBe(false);
  });
  it("does not confuse recorded model output with live inference", () => {
    expect(
      ProviderInfoSchema.safeParse({ ...live, mode: "recorded" }).success,
    ).toBe(true);
    expect(
      ProviderInfoSchema.safeParse({ ...live, measured: true }).success,
    ).toBe(false);
  });
});
