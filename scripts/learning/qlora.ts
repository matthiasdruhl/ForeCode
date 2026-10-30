// Offline preparation/validation only: no Python bridge, download or trainer.
import { z } from "zod";
import { Sha256Schema, IdSchema } from "../../src/lib/contracts/common";
import { StrategySchema } from "../../src/lib/learning/contracts";
import { invariant } from "../../src/lib/contracts/validation";
import { jsonDigest } from "../../src/lib/report/digests";
import { immutable } from "../experiments/tournament/custody";
import { isAdmitted, type AdmittedObservation } from "./intake";

export const GLIMMER_REVISION = "a4e59da52a7bc87ae7251dd5545c0dd437c44b68";
export function qloraPreparation() {
  return immutable({
    schemaVersion: "glimmer-qlora-preparation.v1",
    status: "NOT_AUTHORIZED",
    verifiedDocumentationDate: "2026-10-30",
    environment: {
      python: "3.12",
      cuda: "13.0",
      torch: "2.12.1",
      torchvision: "0.27.1",
      axolotl: "0.19.0",
      flashAttention: "2.8.3",
      cutCrossEntropyRevision: "4dfa52212d0552805aec5a6a2176c0abbea277d2",
      // Transitive Transformers/PEFT/bitsandbytes wheels must be resolved and
      // hashed in a dedicated GPU environment before claiming reproducibility.
      resolvedWheelLockSha256: null,
      cudaImageSha256: null,
    },
    axolotl: {
      base_model: "meta-models/Muse-Glimmer-30B",
      revision_of_model: GLIMMER_REVISION,
      processor_type: "AutoProcessor",
      plugins: ["axolotl.integrations.cut_cross_entropy.CutCrossEntropyPlugin"],
      adapter: "qlora",
      load_in_4bit: true,
      bf16: true,
      fp16: false,
      sequence_len: 2048,
      sample_packing: false,
      skip_prepare_dataset: true,
      remove_unused_columns: false,
      train_on_inputs: false,
      roles_to_train: ["assistant"],
      trust_remote_code: false,
      micro_batch_size: 1,
      gradient_accumulation_steps: 4,
      num_epochs: 1,
      lora_r: 32,
      lora_alpha: 16,
      lora_dropout: 0.05,
      lora_target_modules:
        "model\\.language_model\\.layers\\.\\d+\\.(self_attn\\.(q|k|v|o)_proj|mlp\\.(gate|up|down)_proj)",
      optimizer: "adamw_bnb_8bit",
      learning_rate: 0.0002,
      lr_scheduler: "cosine",
      warmup_ratio: 0.1,
      weight_decay: 0,
      gradient_checkpointing: true,
      attn_implementation: "flash_attention_2",
      seed: 42,
      // Metadata paths are purposefully absent until approved private inputs
      // and output locations exist. This object is NOT a runnable job config.
    },
    quantization: {
      type: "nf4",
      computeDtype: "bfloat16",
      doubleQuant: true,
      reloadModelDtype: "bfloat16",
      reloadQuantStorage: "bfloat16",
      visionTrainable: false,
    },
    data: {
      tokenizerRevision: GLIMMER_REVISION,
      modality: "text_only",
      format: "messages",
      chatTemplate: "checkpoint_processor",
      chatTemplateSha256: null,
      datasetSha256: null,
      rightsApprovalSha256: null,
      sanitationReviewSha256: null,
      reasoningStrength: "high",
      trainOnInputs: false,
      telemetry: "disabled",
    },
    checkpointProtocol: {
      smokeOptimizerSteps: 2,
      smokeSaveStep: 2,
      fullSave: "epoch",
      saveAdapterOnly: true,
      requireFreshBaseAdapterReload: true,
      requireBaseVersusAdapterHeldout: true,
    },
    hardware: {
      reference: "single_H100",
      forecodePeakVramGiB: null,
      validated: false,
    },
    budget: {
      approvedUsd: 0,
      maximumGpuHours: 0,
      quotedGpuUsdPerHour: null,
      storageUsd: null,
      egressUsd: null,
      inferenceUsd: null,
    },
    blockers: [
      "CHECKPOINT_ACCESS_NOT_TESTED",
      "LICENSE_AND_CURRENT_USAGE_REVIEW_REQUIRED",
      "TOKENIZER_CHAT_TEMPLATE_HASH_AND_PREFLIGHT_REQUIRED",
      "TRANSITIVE_WHEEL_LOCK_AND_IMAGE_DIGEST_REQUIRED",
      "RIGHTS_CLEARED_DATASET_AND_FAMILY_SPLITS_REQUIRED",
      "GPU_AND_ABSOLUTE_BUDGET_APPROVAL_REQUIRED",
      "TWO_STEP_SAVE_RELOAD_AND_HELDOUT_EVALUATION_NOT_RUN",
      "SEPARATE_INFERENCE_SERVING_NOT_VALIDATED",
    ],
  });
}

const AnswerSchema = z.strictObject({
  strategy: z.enum(["KEEP", "BOUNDARY", "ADAPTER", "ABSTAIN"]),
  mechanism: z.string().min(1).max(2000),
  falsifiedWhen: z.string().min(1).max(1000),
  uncertainty: z.enum(["insufficient", "limited", "supported"]),
});
export const DemonstrationDatasetSchema = z.strictObject({
  schemaVersion: z.literal("glimmer-demonstrations.v1"),
  origin: z.enum(["RIGHTS_REVIEWED", "SYNTHETIC_TEST_ONLY"]),
  reviewSha256: Sha256Schema,
  examples: z
    .array(
      z.strictObject({
        id: IdSchema,
        repositoryFamily: Sha256Schema,
        taskFamily: Sha256Schema,
        nearDuplicateGroup: Sha256Schema,
        split: z.enum(["train", "validation", "test"]),
        licenseId: IdSchema,
        sourceSha256: Sha256Schema,
        rightsReviewSha256: Sha256Schema,
        sanitationReviewSha256: Sha256Schema,
        supervision: z.enum(["demonstration", "verified_success"]),
        observationSha256: Sha256Schema.nullable(),
        eligible: z.array(StrategySchema).min(1).max(3),
        messages: z.tuple([
          z.strictObject({
            role: z.literal("system"),
            content: z.string().min(1).max(4000),
          }),
          z.strictObject({
            role: z.literal("user"),
            content: z.string().min(1).max(16000),
          }),
          z.strictObject({
            role: z.literal("assistant"),
            content: z.string().min(1).max(8000),
          }),
        ]),
      }),
    )
    .min(1)
    .max(10000),
});
export function validateDemonstrations(
  input: unknown,
  approvedObservations: readonly AdmittedObservation[] = [],
) {
  const d = DemonstrationDatasetSchema.parse(input);
  const ids = new Set<string>(),
    normalized = new Set<string>();
  const groups = new Map<string, string>();
  for (const e of d.examples) {
    invariant(!ids.has(e.id), "Duplicate demonstration.");
    ids.add(e.id);
    invariant(
      new Set(e.eligible).size === e.eligible.length,
      "Duplicate action.",
    );
    for (const [kind, group] of [
      ["repository", e.repositoryFamily],
      ["task", e.taskFamily],
      ["duplicate", e.nearDuplicateGroup],
    ] as const) {
      const key = kind + ":" + group;
      invariant(
        !groups.has(key) || groups.get(key) === e.split,
        "Demonstration split leakage.",
      );
      groups.set(key, e.split);
    }
    // A lightweight exact/normalized check supplements independent reviewed
    // near-duplicate grouping; this is not a complete PII/secret detector.
    const prompt = e.messages
      .slice(0, 2)
      .map((m) => m.content)
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const digest = jsonDigest(prompt);
    invariant(!normalized.has(digest), "Duplicate normalized prompt.");
    normalized.add(digest);
    for (const message of e.messages)
      invariant(
        !/-----BEGIN .*PRIVATE KEY-----|(?:sk|ghp|github_pat)[-_][a-zA-Z0-9]{16,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|PRIVATE_GRADER_SENTINEL/i.test(
          message.content,
        ),
        "Potential secret, personal data or grader material.",
      );
    const answer = AnswerSchema.parse(JSON.parse(e.messages[2].content));
    invariant(
      answer.strategy === "ABSTAIN" || e.eligible.includes(answer.strategy),
      "Unsupported supervised action.",
    );
    if (e.supervision === "verified_success") {
      invariant(
        d.origin === "RIGHTS_REVIEWED" && e.observationSha256 !== null,
        "Synthetic outcomes are not verified labels.",
      );
      const o = approvedObservations.find(
        (o) => o.sha256 === e.observationSha256,
      );
      invariant(
        o &&
          isAdmitted(o) &&
          o.projection.origin === "AUTHENTIC" &&
          o.projection.comparison === "COMPARABLE" &&
          answer.strategy !== "ABSTAIN" &&
          o.correctness[answer.strategy] === 1,
        "Authentic independently verified outcome required.",
      );
    } else
      invariant(
        e.observationSha256 === null,
        "Demonstration cannot assert verified lineage.",
      );
  }
  return immutable({
    schemaVersion: "glimmer-dataset-validation.v1",
    datasetSha256: jsonDigest(d),
    origin: d.origin,
    examples: d.examples.length,
    repositoryFamilies: new Set(d.examples.map((e) => e.repositoryFamily)).size,
    taskFamilies: new Set(d.examples.map((e) => e.taskFamily)).size,
    trainingAuthorized: false,
  });
}
export function estimateTrainingCost(input: {
  gpuUsdPerHour: number;
  gpuHours: number;
  storageUsd: number;
  egressUsd: number;
  inferenceUsd: number;
  approvedCapUsd: number;
}) {
  const i = z
    .strictObject({
      gpuUsdPerHour: z.number().nonnegative(),
      gpuHours: z.number().nonnegative(),
      storageUsd: z.number().nonnegative(),
      egressUsd: z.number().nonnegative(),
      inferenceUsd: z.number().nonnegative(),
      approvedCapUsd: z.number().nonnegative(),
    })
    .parse(input);
  const totalUsd =
    i.gpuUsdPerHour * i.gpuHours + i.storageUsd + i.egressUsd + i.inferenceUsd;
  invariant(Number.isFinite(totalUsd), "Cost overflow.");
  return {
    kind: "ESTIMATE_ONLY",
    totalUsd,
    withinApprovedCap: totalUsd <= i.approvedCapUsd,
    executionAuthorized: false,
  };
}
