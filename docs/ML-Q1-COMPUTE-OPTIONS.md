# Glimmer QLoRA: Colab and Georgia Tech pilot

Prepared October 30, 2026. Planning/preparation only; no runtime, purchase, account request, model download, data upload or training was performed. The proposed Colab envelope is 100 compute units, not an authorization already recorded in the training configuration. Existing spending approval remains zero. This document extends ML-Q1-PREPARATION.md.

## Recommendation

Pursue Georgia Tech access while preparing a portable Colab fallback. Prefer one H100/H200 allocation if it can be approved promptly. A Colab A100 with at least 40 GB VRAM is a candidate for a short pilot after actual memory/software checks; no specific Colab GPU is guaranteed. Do not burn the 100-unit envelope repeatedly trying a 30B recipe on undersized hardware.

Meta's [official training documentation](https://dev.meta.ai/docs/muse-glimmer/post-training) confirms a single-H100 QLoRA reference for the pinned Glimmer checkpoint. The [Axolotl language-model recipe](https://docs.axolotl.ai/docs/models/muse-glimmer.html) reports approximately 27 GiB VRAM. Neither establishes ForeCode's actual memory, throughput or time. Our engineering starting target is at least 40 GB VRAM, preferably 80 GB or more. A different low-memory recipe would need separate validation.

| Option                                  | Suitable first target                              | Advantage                                            | Unknowns to resolve before running                                                                                                             |
| --------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Colab, 100 CU envelope                  | Assigned A100 with enough VRAM, otherwise pause    | Interactive notebook and a bounded pilot             | Actual GPU/VRAM, CU/hour, session lifetime, host RAM/disk, compatible CUDA/extensions, persistent checkpoint storage                           |
| Georgia Tech AI Makerspace / ICE / PACE | One H100/H200 if available to the approved account | Closest hardware match to the documented H100 recipe | Access route, project eligibility, queue/account/partition, allocation granularity, wall time, unit accounting, storage, permitted environment |

Georgia Tech's [AI Makerspace hardware page](https://coe.gatech.edu/academics/ai-for-engineering/ai-makerspace) lists H100 and H200 systems. This does not grant access to an individual or a hackathon project. PACE's [participation page](https://pace.gatech.edu/participation/) distinguishes faculty-sponsored research access, the undergraduate PACESHIP route and instructional/course access. The user's actual account/sponsor/eligibility is not yet known.

## Colab unit accounting

Google's [official FAQ](https://research.google.com/colaboratory/faq.html) states that paid GPU availability and runtime limits remain dynamic and that sessions can terminate when units are exhausted. The signed-out pricing page does not expose this account's GPU availability or burn rate. Therefore 100 CU cannot honestly be converted to a fixed number of hours in advance.

Use the rate displayed by the actual runtime:

    available runtime hours = remaining CU / displayed CU per hour

Illustrative arithmetic only: 100 CU at 10 CU/hour is 10 hours; at 20 CU/hour it is 5 hours. These are not Google quotes or measurements.

Proposed phase envelopes, subject to owner approval:

- Up to 10 CU: GPU/environment check, processor validation, two optimizer steps and checkpoint/reload smoke.
- Up to 60 CU: one bounded SFT pilot, with a step limit chosen from measured throughput.
- Preserve 30 CU: baseline/adapter held-out generations, reload/recovery and essential debugging.

If the first stage cannot fit its envelope, stop and revise rather than consuming the reserve automatically. These allocations are planning limits, not a hard provider-side spending control. Record remaining CU/rate manually at stage boundaries and disconnect the runtime when finished. Do CPU-only corpus curation, schema validation and manifest work before occupying a GPU where possible; hardware-dependent builds still need a timed budget.

## Shared training design

Keep one model/config/dataset protocol with two launch surfaces: an interactive Colab notebook and a Georgia Tech job wrapper adapted to the actual approved scheduler. Avoid assuming a partition, account name or Slurm command before access details are known.

Base and tokenizer: meta-models/Muse-Glimmer-30B at a4e59da52a7bc87ae7251dd5545c0dd437c44b68. Preserve the published Axolotl 0.19.0 recipe as the reference. Freeze the base/vision tower and train only language projection adapters. Start with NF4/bf16 QLoRA, rank 32/alpha 16/dropout .05, batch 1, accumulation 4, LR 2e-4 and seed 42, matching the existing draft. Use short 512–1024-token smoke inputs; increase to the draft's 2048-token pilot only after memory checks.

The environment is not fully locked yet. Record driver, GPU architecture, CUDA toolkit, torch CUDA build, Python and package versions before resolving and hashing compatible wheels. The documented H100 build settings cannot be blindly reused on an A100. Prefer a compatible approved environment over changing cluster drivers or installing an untested pile of packages. Exact transitive versions, image/wheel hashes and processor/chat-template hashes remain preflight deliverables.

Engineering resource request for an initial GT pilot: one H100 80 GB or an available H200; approximately 8 CPU cores, 128 GB host RAM and 150–200 GB approved disk/scratch; initially a bounded two-hour allocation. These are requested planning limits, not measured requirements or a predicted training duration. The base checkpoint is substantial; caching and checkpoint copies need disk headroom. Confirm whether the service allocates/charges per GPU or per entire node.

## Dataset work can proceed before the tournament

The SFT target is bounded architectural reasoning: eligible strategy, mechanism/tradeoff, falsifiable prediction, counterargument/uncertainty and ABSTAIN. Include legitimate KEEP cases, existing adequate boundaries, volatile dependencies and insufficient-information cases. Start with a few dozen human-reviewed examples to debug formatting; expand to a curated pilot of a few hundred only when quality and provenance are established. This is an experiment size, not a guarantee of useful specialization.

Use legitimately sourced, rights-cleared demonstrations, each labeled as a demonstration. Existing synthetic test receipts are not training outcomes. Private grader assertions, credentials and unapproved private/employer source remain excluded. A separately authorized platform/data-sharing scope is required before staging a corpus remotely.

Freeze train/validation/test splits by repository and task family, grouping duplicates before tuning. The validation code already rejects unsupported answers, malformed provenance, split leakage and selected secret patterns; manual rights/sanitization review is still necessary. Generate no paid teacher-model examples without a separate inference budget.

Before training, capture untuned Glimmer responses on the frozen held-out prompts with fixed decoding and the exact same original checkpoint/quantization used for the adapter comparison. Score schema validity, action eligibility, falsifiability, appropriate abstention/KEEP and human-reviewed proposal quality; record latency/tokens/resources. SFT can be evaluated for these behaviors while the tournament is unfinished. Architectural correctness/improvement still requires independent tournament results later.

## Execution stages once approved

1. Inspect the assigned runtime and its actual resource/rate limits; resolve a reproducible compatible environment.
2. Acquire only the pinned authorized checkpoint and approved corpus; validate processor/chat template, token counts, truncation and assistant loss masks.
3. Record untuned held-out outputs. Do not hold two complete base models in GPU memory just to compare them.
4. Run exactly two optimizer steps, save the adapter/checkpoint, then reload into a fresh original base. Confirm adapter keys/weights loaded, finite loss/gradients and actual peak memory after optimizer initialization and saving.
5. Estimate a bounded pilot's time/units from measured tokens per second, effective batch, sequence lengths and checkpoint overhead. Run one pilot only if it fits the remaining envelope.
6. Repeat the same held-out generation protocol, preserve negative/regression cases and save adapter/config/tokenizer/data-manifest hashes, metrics and resume state in approved persistent storage. Rehearse resume/reload.

Store training data and frequent checkpoints on suitable runtime/local scratch and use an approved persistent destination deliberately. The Colab VM is temporary. Avoid broad Drive mounts, public Hub pushes, hosted experiment tracking or automatic corpus uploads as defaults.

Serving is a separate step. An adapter is a base-checkpoint-dependent artifact, not a fine-tuned Spark API model. First validate base-plus-adapter reload locally on approved compute; do not assume either Colab or a campus batch allocation is an always-on public inference service.

## Information needed for the GT route

Determine the actual access route (existing account, sponsor, course/event allocation or student application), supported project scope and approval lead time. Then obtain the GPU type/VRAM, ability to request a single GPU, account/queue/partition, maximum wall time, unit/billing policy, memory/scratch quota and download/egress/container rules.

A request draft, not sent:

    Project: ForeCode text-only supervised QLoRA feasibility for a 30B Meta model.
    Initial scope: bounded environment/processor check, two optimizer steps,
    checkpoint save/reload and a small held-out baseline/adapter comparison.
    Requested resources: one H100/H200, modest CPU/RAM, approved checkpoint disk
    and an initially bounded allocation. No multi-GPU/GRPO requirement.
    Data: only reviewed, rights-cleared demonstrations; no private grader data.
    Please confirm the suitable access/account route, project eligibility,
    scheduling limits and how GPU/node usage is charged to the allocation.

If access or reproducibility cannot be established by the November 1 integration decision, keep this as independent research. The November 2 core freeze remains unaffected; a tuned adapter alone establishes no architectural benefit.
