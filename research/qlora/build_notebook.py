"""Build the self-contained notebook without importing training dependencies."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def build():
    cells = []
    def md(text):
        cells.append({"cell_type": "markdown", "metadata": {}, "source": text.strip().splitlines(keepends=True)})
    def code(text, tag):
        cells.append({"cell_type": "code", "execution_count": None, "metadata": {"tags": [tag]},
                      "outputs": [], "source": text.strip().splitlines(keepends=True)})

    md("""
# ForeCode: Glimmer QLoRA on Colab

Colab is the primary compute path. This notebook was prepared and checked offline;
its Glimmer GPU path has NOT been operationally validated. No tournament is needed
for supervised demonstrations. Architectural correctness still needs independent
tournament evidence.

Start with the hardware cell. Aim for a 40 GB-class or larger CUDA GPU; actual
memory use remains unknown. A100/H100 availability depends on your Colab account.
This notebook does not buy units, mount Drive, push to the Hub, install packages,
launch agents or access a grader. Heavy operations default to OFF.

Read cells sequentially. Run All intentionally stops at the first unapproved
data/download/compute stage. GPU allocation can consume units while idle:
the process timer is NOT a Colab billing cap. Disconnect the runtime when done.
    """)
    md("## 1. Offline helpers\nThis definition cell performs no model, network or GPU operation.")
    code((ROOT / "colab_support.py").read_text(encoding="utf-8"), "offline-definitions")
    md("""
## 2. Your run settings

Only set approval flags for the exact reviewed dataset and bounded phase you
intend to run. Enter the actual remaining Colab units and displayed CU/hour.
Do not infer the balance from an AI plan name or assume it is 100 or 200.
No examples or training permissions are bundled.
    """)
    code("""
ROOT = Path("/content/forecode")
DATASET_JSON = ROOT / "input" / "demonstrations.json"
APPROVE_DATA_FOR_COLAB = False
APPROVE_MODEL_DOWNLOAD = False
APPROVE_GPU_COMPUTE = False
APPROVE_PILOT = False
PROCESSOR_AND_ASSISTANT_MASKS_REVIEWED = False
APPROVED_RUNTIME_SHA256 = None
REMAINING_CU = None
DISPLAYED_CU_PER_HOUR = None
REMAINING_CU_AFTER_SMOKE = None
PILOT_STEPS = 0

def ready_compute():
    require(APPROVE_GPU_COMPUTE is True, "GPU compute approval is not enabled.")
    require(PROCESSOR_AND_ASSISTANT_MASKS_REVIEWED is True,
            "Validate the actual processor and Axolotl assistant loss masks first.")
    current = collect_runtime()
    require(assess_runtime(current, required_disk_gib=20)["status"] == "ENVIRONMENT_CANDIDATE",
            "Runtime is not a reference-environment candidate.")
    require(runtime_identity(current) == APPROVED_RUNTIME_SHA256,
            "Review and pin this runtime fingerprint before GPU compute.")
    verify_preparation(manifest)
    require(Path(MODEL_SNAPSHOT).is_dir(), "Pinned checkpoint is not cached.")
    phase_budget(REMAINING_CU, DISPLAYED_CU_PER_HOUR, 10, 30, 600)
    return current
    """, "configuration")
    md("## 3. Run this hardware check first\nShare only this hardware/package summary when resolving compatibility.")
    code("""
runtime_report = collect_runtime()
print(json.dumps(runtime_report, indent=2))
print(json.dumps(assess_runtime(runtime_report), indent=2))
# Save the safe environment summary only when you deliberately prepare a run;
# the first hardware check itself creates no run directory.
    """, "hardware-preflight")
    md("""
## 4. Resolve the actual Colab environment

HOLD is expected if the Colab defaults differ from the documented recipe.
It is not evidence the model cannot work. Record the report above before
installing/replacing packages. No installation cell is run automatically here.

Reference: Python 3.12; CUDA/PyTorch cu130; torch 2.12.1; torchvision 0.27.1;
Axolotl 0.19.0; flash-attn 2.8.3; Cut Cross Entropy source revision
4dfa52212d0552805aec5a6a2176c0abbea277d2. Transformers, PEFT, bitsandbytes
and all transitive versions must be captured after compatible resolution.
The published H100 build architecture flag must not be copied blindly to A100.

Use the actual runtime report to prepare the install commands. Restart the
kernel after replacing torch/CUDA extensions, rerun the helpers/preflight,
then pin APPROVED_RUNTIME_SHA256 to the resulting identity.
This manifest records observed versions; it is not a complete hashed wheel lock.

Sources: https://dev.meta.ai/docs/muse-glimmer/post-training and
https://docs.axolotl.ai/docs/models/muse-glimmer.html
    """)
    md("""
## 5. Prepare approved demonstrations

Create a NEW reviewed dataset using glimmer-demonstrations.v1 from
scripts/learning/qlora.ts. Supply system/user/assistant text, eligible strategies,
repository/task/duplicate groups, splits and source/rights/sanitization digests.
The assistant JSON contains strategy, mechanism, falsifiedWhen and uncertainty.
Include KEEP and ABSTAIN. Do not relabel synthetic receipts or test fixtures.

At least eight train rows are needed for this smoke scaffolding; provide distinct
validation/test families. Upload only the explicitly approved JSON file through
Colab's file pane to DATASET_JSON. No private grader, credentials or unapproved
private/employer code belongs here. This notebook never uploads from your laptop
or authorizes sharing by itself.
    """)
    code("""
require(APPROVE_DATA_FOR_COLAB is True, "Review data rights and exact Colab disclosure scope first.")
manifest = prepare_dataset(DATASET_JSON, ROOT / "prepared")
print(json.dumps({"dataset_sha256": manifest["dataset_sha256"],
                  "examples": {k: v["examples"] for k, v in manifest["files"].items()}}, indent=2))
    """, "dataset-preparation")
    md("""
## 6. Authorized pinned checkpoint acquisition

Run only after confirming the runtime, license/usage terms, storage and phase
budget. This fetches public model assets, not training data. It may take time
while the GPU is billed. No remote Python model code is permitted.
    """)
    code("""
require(APPROVE_MODEL_DOWNLOAD is True, "Model download is disabled.")
require(assess_runtime(collect_runtime())["status"] == "ENVIRONMENT_CANDIDATE",
        "Resolve and review the Colab environment first.")
download_budget = phase_budget(REMAINING_CU, DISPLAYED_CU_PER_HOUR, 10, 30, 600)
print(json.dumps(download_budget, indent=2))
download = acquire_checkpoint(ROOT / "model-download", download_budget, approved=True)
MODEL_SNAPSHOT = download["snapshot"]
os.environ["HF_HUB_CACHE"] = download["cache_dir"]
(ROOT / "download-run.json").write_text(json.dumps(download, indent=2))
(ROOT / "runtime-report.json").write_text(json.dumps(collect_runtime(), indent=2))
print("Pinned snapshot cached. Recheck the CU meter; the download has no provider billing cap.")
    """, "approved-model-download")
    md("""
## 7. Processor and loss-mask preflight

Render/tokenize reviewed train examples with the PINNED AutoProcessor before
training. Verify end-of-turn behavior, the actual assistant-only labels emitted
by Axolotl, nonempty supervised tokens and no loss on system/user tokens.
skip_prepare_dataset means preprocessing success alone is insufficient.
This cell reports lengths/template identity, NOT a claim that Axolotl masks pass.
Set PROCESSOR_AND_ASSISTANT_MASKS_REVIEWED only after the real mask check.
    """)
    code("""
require(APPROVE_MODEL_DOWNLOAD is True, "Pinned checkpoint must be available locally.")
verify_preparation(manifest)
from transformers import AutoProcessor
processor = AutoProcessor.from_pretrained(MODEL, revision=REVISION, local_files_only=True, trust_remote_code=False)
template = getattr(processor, "chat_template", None) or getattr(processor.tokenizer, "chat_template", None)
require(template is not None, "No checkpoint chat template found.")
lengths = []
for line in Path(manifest["files"]["train"]["path"]).read_text(encoding="utf-8").splitlines():
    messages = strict_json(line)["messages"]
    inputs = processor.apply_chat_template(messages, tokenize=True, add_generation_prompt=False,
                                           return_dict=True, return_tensors="pt")
    lengths.append(int(inputs["input_ids"].shape[-1]))
require(max(lengths) <= 1024, "Curate a short smoke corpus before truncating assistant targets.")
PROCESSOR_REPORT = {"template_sha256": digest(template), "maximum_training_tokens": max(lengths),
                    "axolotl_assistant_mask_validated": False}
(ROOT / "processor-report.json").write_text(json.dumps(PROCESSOR_REPORT, indent=2))
print(json.dumps(PROCESSOR_REPORT, indent=2))
del processor, inputs
    """, "processor-preflight")
    md("## 8. Freeze untuned held-out generations\nNo assistant target is passed into generation. Keep prompts and decoding fixed for the later adapter comparison.")
    code("""
ready_compute()
print(generate_evaluation(manifest, ROOT / "baseline.json", approved=True))
    """, "baseline-evaluation")
    md("""
## 9. Exactly two optimizer steps

This manually approved cell invokes only the fixed local Axolotl trainer, with
model/dataset downloads and hosted tracking disabled by environment flags.
It requires the cached pinned checkpoint; these flags are not a network sandbox.
The timer kills the trainer process group on timeout. It does not disconnect
Colab or stop idle GPU billing. Logs stay private; an exit code alone is not
an adapter-reload or architecture-improvement result.
    """)
    code("""
ready_compute()
smoke_config = make_config(manifest, ROOT / "smoke", "smoke")
SMOKE_CONFIG_SHA = digest(smoke_config)
SMOKE_FILE = ROOT / "smoke.yml"
with SMOKE_FILE.open("x", encoding="utf-8") as file:
    json.dump(smoke_config, file, indent=2)  # JSON document is valid YAML.
smoke_budget = phase_budget(REMAINING_CU, DISPLAYED_CU_PER_HOUR, 10, 30, 600)
SMOKE_RUN = bounded_train(SMOKE_FILE, SMOKE_CONFIG_SHA, APPROVED_RUNTIME_SHA256,
                         smoke_budget, manifest, "smoke", approved=True)
(ROOT / "smoke-run.json").write_text(json.dumps(SMOKE_RUN, indent=2))
print(SMOKE_RUN)
    """, "two-step-smoke")
    md("## 10. Fresh-base adapter reload\nVerify saved keys and tensor values. This frees the model after checking; two base copies are never intentionally held together.")
    code("""
ready_compute()
SMOKE_RELOAD = reload_adapter(ROOT / "smoke", approved=True)
SMOKE_RELOAD["config_sha256"] = SMOKE_CONFIG_SHA
(ROOT / "smoke-reload.json").write_text(json.dumps(SMOKE_RELOAD, indent=2))
print(SMOKE_RELOAD)
    """, "adapter-reload")
    md("""
## 11. One bounded pilot

Re-enter the ACTUAL remaining CU after all earlier work. Choose PILOT_STEPS from
measured throughput and the envelope; it must be 10–1000 and divisible by ten.
There is no automatic hyperparameter sweep, retry or resume. Existing outputs
fail closed rather than silently overwriting earlier attempts.
    """)
    code("""
ready_compute()
require(APPROVE_PILOT is True, "Pilot needs its own explicit approval after reviewing the smoke.")
require(SMOKE_RUN["optimizer_steps"] == 2 and SMOKE_RELOAD["saved_tensors_match"] is True,
        "The two-step save/reload gate has not passed.")
require((ROOT / "baseline.json").is_file(), "Record the frozen untuned baseline first.")
pilot_config = make_config(manifest, ROOT / "pilot", "pilot", PILOT_STEPS)
pilot_file = ROOT / "pilot.yml"
with pilot_file.open("x", encoding="utf-8") as file:
    json.dump(pilot_config, file, indent=2)
pilot_budget = phase_budget(REMAINING_CU_AFTER_SMOKE, DISPLAYED_CU_PER_HOUR, 60, 30, 3600)
(ROOT / "runtime-report.json").write_text(json.dumps(collect_runtime(), indent=2))
PILOT_RUN = bounded_train(pilot_file, digest(pilot_config), APPROVED_RUNTIME_SHA256,
                         pilot_budget, manifest, "pilot", approved=True)
(ROOT / "pilot-run.json").write_text(json.dumps(PILOT_RUN, indent=2))
print(PILOT_RUN)
    """, "bounded-pilot")
    md("## 12. Same-base held-out comparison\nPreserve all outputs, failed formatting and regressions. These scores concern SFT behavior; architecture correctness remains unknown.")
    code("""
ready_compute()
print(reload_adapter(ROOT / "pilot", approved=True))
print(generate_evaluation(manifest, ROOT / "tuned.json", ROOT / "pilot", approved=True))
base_report = strict_json((ROOT / "baseline.json").read_text())
tuned_report = strict_json((ROOT / "tuned.json").read_text())
require(all(base_report[k] == tuned_report[k] for k in
            ("model", "revision", "dataset_sha256", "prompt_ids_sha256", "decoding")),
        "Base/adapter evaluation conditions changed.")
print("Matched generation artifacts saved. Independent architecture outcomes are still unavailable.")
    """, "held-out-comparison")
    md("""
## 13. Preserve artifacts, then disconnect

Download the final adapter_model.safetensors and adapter_config.json, the run
configs, dataset manifest, processor report, environment report and evaluation
reports through Colab's file pane into approved storage. Keep raw data and logs
private. No Drive mount, public Hub push or upload destination is automated.

The VM is temporary. A resumable optimizer checkpoint and fresh-session resume
still need separate validation; successful adapter reload does not prove resume.
Verify the downloaded hashes before disconnecting. Then use Runtime > Disconnect
and delete runtime to stop the allocation. Never keep a GPU session alive as a
public ForeCode inference server.
    """)
    return {"nbformat": 4, "nbformat_minor": 5, "metadata": {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python"}, "colab": {"name": "ForeCode-Glimmer-QLoRA.ipynb"},
        "forecode": {"status": "PREPARED_OFFLINE_NOT_GPU_VALIDATED", "model": MODEL_ID,
                     "revision": MODEL_REVISION, "automatic_training": False}},
        "cells": [dict(cell, id="forecode-" + str(i).zfill(2)) for i, cell in enumerate(cells)]}


MODEL_ID = "meta-models/Muse-Glimmer-30B"
MODEL_REVISION = "a4e59da52a7bc87ae7251dd5545c0dd437c44b68"
if __name__ == "__main__":
    (ROOT / "ForeCode-Glimmer-QLoRA.ipynb").write_text(
        json.dumps(build(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
