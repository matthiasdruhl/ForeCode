# ForeCode Glimmer QLoRA on Colab

Status: **PREPARED_OFFLINE_NOT_GPU_VALIDATED**. Colab is the selected compute route. No Georgia Tech access is needed. This directory is independent research, outside the web app and tournament runtime.

Open `ForeCode-Glimmer-QLoRA.ipynb` in Colab. Run the helper definitions, settings and **hardware/package check first**. That check reports GPU/VRAM, BF16, disk, Python, torch CUDA build and selected package versions without printing credentials, repository text or environment variables. Use that summary to resolve the actual runtime before downloading the model. Do not assume an AI subscription guarantees a particular accelerator or convert compute units to hours without the displayed rate. [Colab's official FAQ](https://research.google.com/colaboratory/faq.html) explains variable resource availability and session limits.

## Implemented preparation

- Self-contained notebook, deterministically generated from `build_notebook.py` and `colab_support.py`, with no saved outputs or credentials.
- Strict text demonstration validation, provenance fields and train/validation/test separation by repository, task family and duplicate group. Synthetic fixtures and asserted verified-success labels cannot enter the training preparation path. Review digests are references; the program does not authenticate data rights.
- Immutable prepared files with hashes, a separate held-out prompt artifact and no assistant target passed into generation. The test split never becomes a trainer validation input.
- Pinned model/tokenizer revision, language-only LoRA targets, fixed NF4/bf16 recipe, exactly two smoke optimizer steps, checkpoint-state checks, fresh-base adapter tensor comparison and a separately enabled pilot with explicit step/time bounds.
- Untuned/tuned generations using the same base revision, held-out prompts and decoding. Reports preserve responses, invalid formats, unsupported actions, latency and token counts. Architectural correctness stays unknown.
- Process-group timeout and interrupt cleanup for checkpoint download and training; failure and timeout produce no success result. Model acquisition permits asset files, excludes remote Python code and disables implicit credential use. Training uses model/dataset offline and telemetry-disable environment flags; these are not a network sandbox. No public API, agent runner, automatic package installation, Drive mount, Hub upload, sweep or resource purchase.

Reference: Meta's [post-training instructions](https://dev.meta.ai/docs/muse-glimmer/post-training) and Axolotl's [versioned language-only example](https://github.com/axolotl-ai-cloud/axolotl/blob/v0.19.0/examples/muse-glimmer/qlora.yaml). Model and processor: `meta-models/Muse-Glimmer-30B`, revision `a4e59da52a7bc87ae7251dd5545c0dd437c44b68`. Review the [model card/license](https://huggingface.co/meta-models/Muse-Glimmer-30B) and pinned usage policy before acquisition. No checkpoint access is established by this preparation.

## What still needs the actual runtime

1. Assigned GPU, actual CU balance/rate and a compatible environment. The starting target is a 40 GB-class or larger BF16 CUDA GPU; memory feasibility is unmeasured. Smaller hardware produces HOLD. The published single-H100 recipe is the reference, not a Colab validation result.
2. Resolve Python 3.12, CUDA 13/PyTorch 2.12.1, torchvision 0.27.1, Axolotl 0.19.0, flash-attn 2.8.3 and Cut Cross Entropy revision `4dfa52212d0552805aec5a6a2176c0abbea277d2` against the actual driver/toolkit/GPU architecture. Capture compatible transitive versions and wheel hashes. No tested installation cell or complete wheel lock exists yet. Avoid building with the H100 architecture setting on an A100. Restart and recheck after changing compiled packages.
3. A genuinely reviewed corpus and explicit permission for the exact Colab disclosure. No real examples or approved corpus are included. Prepare local data first; the notebook does not upload files from the owner's machine.
4. Check the real processor/chat template, token lengths and **actual Axolotl assistant-only loss masks**. The supplied processor cell measures token lengths/template identity; it does not validate the trainer's labels. The separate mask-review gate remains false. No full training until that check is implemented/executed against the resolved release.
5. Execute the two-step save/reload on approved compute; measure trainable parameter scope, gradients, peak training memory, disk and throughput. Only checkpoint state/loss and adapter equality are checked by the current scaffold. Training peak memory and optimizer resume are not validated. Adapter reload alone does not establish resumability.
6. Review those measurements before enabling one pilot and repeating held-out generation. Human review of falsifiability, abstention and reasoning is still needed. SFT output formatting or loss changes cannot establish architecture improvement; that requires future independent tournament evidence.

## Units and manual execution

All data/download/compute/pilot approval flags default false; budget fields default unknown and pilot steps default zero. Run All stops before preparing a dataset with these defaults. Enter approval only for the exact reviewed stage; enabling the notebook is the owner's action, not authorization supplied by this repository.

Use the **actual** remaining units and current rate at every phase. The proposed 100-CU envelope is 10 for preflight/smoke, 60 for one pilot and 30 reserved for evaluation/recovery. Download/setup also consumes the envelope. Timers bound individual child processes, not cumulative setup, GPU loading or idle allocation. Generation's `max_time` is a soft generation limit; model loading/reload has no provider billing cap. The helpers cannot query or enforce the Colab account meter. If setup or the smoke exceeds its proposed allowance, stop and revise the plan. Do not silently spend the reserve. Disconnect and delete the runtime when finished; stopping a cell does not end idle GPU billing.

Keep base/adapter models sequential in GPU memory. Download adapter weights/config, hashes, runtime/config/data manifests and evaluation artifacts into approved storage before deleting the temporary VM. Raw datasets and logs remain private. No external artifact destination is configured. Serving and adapter deployment are separate work.

## Local verification

No ML dependencies, network, GPU, checkpoint or corpus are needed:

```sh
python3 -B research/qlora/build_notebook.py
python3 -B -m unittest discover -s research/qlora -p 'test_*.py' -v
npx vitest run tests/unit/colab-qlora.test.ts
```

The normal Vitest suite runs the Python checks too. Tests use explicitly fictional datasets, rights digests and runtime reports. A harmless local Python child verifies real process success/failure/timeout behavior. These tests demonstrate CPU implementation behavior, not actual QLoRA compatibility or model improvement. No hosted training, model download or paid request runs in CI.

Next task: obtain the first Colab hardware/package summary, resolve the compatible environment and implement/test the real assistant-mask preflight before any optimizer steps.
