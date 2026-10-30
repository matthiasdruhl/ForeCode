import { describe, expect, it } from "vitest";
import {
  qloraPreparation,
  GLIMMER_REVISION,
  validateDemonstrations,
  estimateTrainingCost,
  DemonstrationDatasetSchema,
} from "../../scripts/learning/qlora";
import { h } from "../support/learning";

function dataset() {
  return DemonstrationDatasetSchema.parse({
    schemaVersion: "glimmer-demonstrations.v1",
    origin: "SYNTHETIC_TEST_ONLY",
    reviewSha256: h("test-review"),
    examples: [
      {
        id: "synthetic-demo",
        repositoryFamily: h("r"),
        taskFamily: h("t"),
        nearDuplicateGroup: h("near"),
        split: "train",
        licenseId: "test-owned-example",
        sourceSha256: h("test-source"),
        rightsReviewSha256: h("test-rights"),
        sanitationReviewSha256: h("test-sanitize"),
        supervision: "demonstration",
        observationSha256: null,
        eligible: ["KEEP", "BOUNDARY"],
        messages: [
          {
            role: "system",
            content:
              "Provide bounded architectural advice. Reasoning strength: high.",
          },
          {
            role: "user",
            content:
              "A small reviewed service has uncertain future requirements.",
          },
          {
            role: "assistant",
            content: JSON.stringify({
              strategy: "ABSTAIN",
              mechanism: "The requirement is not established.",
              falsifiedWhen:
                "A confirmed requirement and source context become available.",
              uncertainty: "insufficient",
            }),
          },
        ],
      },
    ],
  });
}
describe("offline Glimmer SFT preparation, no training capability", () => {
  it("pins documented base/tokenizer/recipe and keeps every operational gate blocked", () => {
    const p = qloraPreparation();
    expect(p.axolotl.revision_of_model).toBe(GLIMMER_REVISION);
    expect(p.data.tokenizerRevision).toBe(GLIMMER_REVISION);
    expect(p.environment.axolotl).toBe("0.19.0");
    expect(p.budget.approvedUsd).toBe(0);
    expect(p.status).toBe("NOT_AUTHORIZED");
    expect(p.checkpointProtocol.smokeOptimizerSteps).toBe(2);
    expect(p.checkpointProtocol.requireFreshBaseAdapterReload).toBe(true);
    expect(p.environment.resolvedWheelLockSha256).toBeNull();
    expect(p.data.chatTemplateSha256).toBeNull();
    expect(p.quantization.visionTrainable).toBe(false);
    const target = new RegExp("^" + p.axolotl.lora_target_modules + "$");
    expect(target.test("model.language_model.layers.12.self_attn.q_proj")).toBe(
      true,
    );
    expect(target.test("model.language_model.layers.0.mlp.down_proj")).toBe(
      true,
    );
    expect(target.test("model.vision_model.layers.0.self_attn.q_proj")).toBe(
      false,
    );
    expect(target.test("lm_head")).toBe(false);
  });
  it("validates explicitly labeled demonstrations without authorizing training or uploading text", () => {
    const d = dataset(),
      result = validateDemonstrations(d);
    expect(result.origin).toBe("SYNTHETIC_TEST_ONLY");
    expect(result.trainingAuthorized).toBe(false);
    expect(result.examples).toBe(1);
    expect(result).toEqual(validateDemonstrations(structuredClone(d)));
    expect(JSON.stringify(result)).not.toContain("service");
  });
  it.each([
    "rights",
    "verified",
    "fake-authentic",
    "secret",
    "grader",
    "unsupported",
    "duplicate",
    "leakage",
  ])("rejects %s training-data defect", (defect) => {
    const d = dataset(),
      e = d.examples[0]!;
    if (defect === "rights") e.rightsReviewSha256 = "";
    if (defect === "verified") {
      e.supervision = "verified_success";
      e.observationSha256 = h("fake");
    }
    if (defect === "fake-authentic") {
      d.origin = "RIGHTS_REVIEWED";
      e.supervision = "verified_success";
      e.observationSha256 = h("fake");
    }
    if (defect === "secret")
      e.messages[1].content = "Contact person@example.org";
    if (defect === "grader") e.messages[1].content = "PRIVATE_GRADER_SENTINEL";
    if (defect === "unsupported")
      e.messages[2].content = JSON.stringify({
        strategy: "ADAPTER",
        mechanism: "Unknown",
        falsifiedWhen: "Unknown",
        uncertainty: "limited",
      });
    if (defect === "duplicate") d.examples.push({ ...e, id: "copy" });
    if (defect === "leakage")
      d.examples.push({
        ...e,
        id: "test",
        split: "test",
        messages: [
          { ...e.messages[0] },
          { role: "user", content: "A different task in the same repository." },
          { ...e.messages[2] },
        ],
      });
    expect(() => validateDemonstrations(d)).toThrow();
  });
  it("uses explicit quote assumptions, includes non-GPU costs and rejects negative/overflow estimates", () => {
    const input = {
      gpuUsdPerHour: 3,
      gpuHours: 2,
      storageUsd: 1,
      egressUsd: 1,
      inferenceUsd: 2,
      approvedCapUsd: 0,
    };
    // Arithmetic fixture only. This is NOT a provider quote or approved budget.
    expect(estimateTrainingCost(input)).toEqual({
      kind: "ESTIMATE_ONLY",
      totalUsd: 10,
      withinApprovedCap: false,
      executionAuthorized: false,
    });
    expect(() => estimateTrainingCost({ ...input, gpuHours: -1 })).toThrow();
    expect(() =>
      estimateTrainingCost({ ...input, gpuHours: 1e308, gpuUsdPerHour: 1e308 }),
    ).toThrow();
  });
});
