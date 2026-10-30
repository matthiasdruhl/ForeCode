"""ForeCode Colab preparation. Importing this module performs no network or GPU work.

The default workflow stops before installing packages, downloading weights or
training. Runtime/budget/data review is explicit in the notebook. No runner,
grader, provider credential, cloud provisioning or hosted API is imported.
"""
from __future__ import annotations

import gc
import hashlib
import importlib.metadata as metadata
import json
import math
import os
import platform
import re
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

MODEL = "meta-models/Muse-Glimmer-30B"
REVISION = "a4e59da52a7bc87ae7251dd5545c0dd437c44b68"
TARGETS = r"model\.language_model\.layers\.\d+\.(self_attn\.(q|k|v|o)_proj|mlp\.(gate|up|down)_proj)"
ACTIONS = {"KEEP", "BOUNDARY", "ADAPTER"}
REFERENCE = {"axolotl": "0.19.0", "torch": "2.12.1", "torchvision": "0.27.1",
             "flash-attn": "2.8.3"}
PACKAGES = tuple(REFERENCE) + ("transformers", "peft", "bitsandbytes", "accelerate",
                              "safetensors", "huggingface-hub", "cut-cross-entropy")
SHA = re.compile(r"^[a-f0-9]{64}$")
ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
SECRET = re.compile(r"-----BEGIN .*PRIVATE KEY-----|(?:sk|ghp|github_pat)[-_][a-zA-Z0-9]{16,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|PRIVATE_GRADER_SENTINEL", re.I)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(value):
    """Python manifest digest, not an evaluator signature or RFC8785 assertion."""
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def strict_json(text):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "Duplicate JSON key.")
            result[key] = value
        return result
    def nonfinite(_):
        raise ValueError("Non-finite JSON value.")
    return json.loads(text, object_pairs_hook=pairs, parse_constant=nonfinite)


def keys(value, allowed):
    require(isinstance(value, dict) and set(value) == set(allowed), "Unsupported or missing fields.")


def finite_positive(value, name):
    require(type(value) in (int, float) and math.isfinite(value) and value > 0,
            name + " must be a known positive number.")
    return value


def phase_budget(remaining_cu, cu_per_hour, phase_cu, reserve_cu, wall_seconds):
    for name, value in (("remaining CU", remaining_cu), ("CU/hour", cu_per_hour),
                        ("phase CU", phase_cu), ("wall seconds", wall_seconds)):
        finite_positive(value, name)
    require(type(reserve_cu) in (int, float) and math.isfinite(reserve_cu) and reserve_cu >= 0,
            "Reserve must be known and nonnegative.")
    usable = min(phase_cu, remaining_cu - reserve_cu)
    require(usable > 0, "Insufficient units after reserve.")
    seconds = math.floor(min(wall_seconds, usable / cu_per_hour * 3600))
    require(seconds >= 60, "Less than one minute remains in this phase.")
    return {"maximum_seconds": seconds, "maximum_cu_at_displayed_rate": seconds * cu_per_hour / 3600,
            "provider_billing_cap": False,
            "limitation": "The rate is user-entered. Idle allocation still consumes units; disconnect the Colab runtime."}


def collect_runtime(directory="/content"):
    """Called manually in Colab; no installation, downloads or secret/env dump."""
    packages = {}
    for name in PACKAGES:
        try:
            packages[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            packages[name] = None
    destination = Path(directory) if Path(directory).exists() else Path.cwd()
    report = {"python": platform.python_version(), "packages": packages,
              "disk_free_gib": shutil.disk_usage(destination).free / 2**30,
              "gpu_count": 0, "gpu_name": None, "gpu_memory_mib": None,
              "gpu_capability": None, "bf16": False, "torch_cuda": None}
    try:
        import torch
        report["torch_cuda"] = torch.version.cuda
        report["gpu_count"] = torch.cuda.device_count()
        if report["gpu_count"] == 1:
            properties = torch.cuda.get_device_properties(0)
            report.update(gpu_name=properties.name, gpu_memory_mib=properties.total_memory / 2**20,
                          gpu_capability=list(torch.cuda.get_device_capability(0)),
                          bf16=bool(torch.cuda.is_bf16_supported()))
    except (ImportError, RuntimeError, OSError):
        pass
    return report


def assess_runtime(report, required_disk_gib=100):
    finite_positive(required_disk_gib, "Required disk headroom")
    blockers = []
    if report.get("gpu_count") != 1:
        blockers.append("ONE_CUDA_GPU_REQUIRED")
    memory = report.get("gpu_memory_mib")
    if type(memory) not in (float, int) or not math.isfinite(memory) or memory < 38 * 1024:
        blockers.append("40GB_CLASS_VRAM_TARGET_NOT_MET")
    if report.get("bf16") is not True:
        blockers.append("BF16_NOT_AVAILABLE")
    disk = report.get("disk_free_gib")
    if type(disk) not in (float, int) or not math.isfinite(disk) or disk < required_disk_gib:
        blockers.append("DISK_HEADROOM_TARGET_NOT_MET")
    if not str(report.get("python", "")).startswith("3.12."):
        blockers.append("REFERENCE_PYTHON_NOT_PRESENT")
    if report.get("torch_cuda") != "13.0":
        blockers.append("REFERENCE_CUDA_BUILD_NOT_PRESENT")
    for name in PACKAGES:
        version = report.get("packages", {}).get(name)
        if not version:
            blockers.append("PACKAGE_MISSING:" + name)
        elif name in REFERENCE and version.split("+")[0] != REFERENCE[name]:
            blockers.append("REFERENCE_VERSION_MISMATCH:" + name)
    return {"status": "ENVIRONMENT_CANDIDATE" if not blockers else "HOLD",
            "blockers": blockers, "runtime_sha256": runtime_identity(report),
            "model_compatibility_validated": False}


def runtime_identity(report):
    # Free disk space changes when data/logs are written; it is a capacity
    # check, not an immutable environment identity.
    return digest({k: report.get(k) for k in (
        "python", "packages", "gpu_count", "gpu_name", "gpu_memory_mib",
        "gpu_capability", "bf16", "torch_cuda")})


def _bounded_process(command, seconds, logfile, environment):
    require(type(seconds) is int and 1 <= seconds <= 7200, "Invalid process time bound.")
    with Path(logfile).open("x", encoding="utf-8") as stream:
        started = time.monotonic()
        process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT,
                                   env=environment, start_new_session=True)
        try:
            code = process.wait(timeout=seconds)
        except BaseException as error:
            # Colab's Stop button can raise KeyboardInterrupt. Clean up the
            # trainer group on interruption as well as on an elapsed timer.
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()
            if isinstance(error, subprocess.TimeoutExpired):
                raise RuntimeError("Process timed out. Inspect private logs; disconnect the Colab runtime.") from error
            raise
    require(code == 0, "Process failed; inspect the private log. No success claimed.")
    return {"elapsed_seconds": time.monotonic() - started, "exit_code": code}


def acquire_checkpoint(directory, budget, approved=False):
    require(approved is True, "Model download has not been approved.")
    root = Path(directory)
    require(not root.exists(), "Download output exists; inspect it before retrying.")
    root.mkdir(parents=True, mode=0o700)
    options = {"repo_id": MODEL, "revision": REVISION, "cache_dir": str(root / "cache"),
               "allow_patterns": ["*.json", "*.safetensors", "*.jinja", "*.txt", "*.model", "LICENSE*", "USAGE_POLICY*"]}
    program = "import json,sys; from huggingface_hub import snapshot_download; snapshot_download(**json.loads(sys.argv[1]))"
    env = dict(os.environ)
    env.update(HF_HUB_DISABLE_TELEMETRY="1", HF_HUB_DISABLE_IMPLICIT_TOKEN="1")
    result = _bounded_process([sys.executable, "-c", program, json.dumps(options)],
                              budget["maximum_seconds"], root / "download.log", env)
    snapshot = root / "cache" / "models--meta-models--Muse-Glimmer-30B" / "snapshots" / REVISION
    require(snapshot.is_dir() and (snapshot / "config.json").is_file()
            and any(snapshot.glob("*.safetensors")), "Pinned model snapshot is incomplete.")
    return {"snapshot": str(snapshot.resolve()), "cache_dir": str((root / "cache").resolve()), **result}


def validate_dataset(document, allow_synthetic=False):
    """Validate the existing demonstration contract, without asserting rights."""
    keys(document, ("schemaVersion", "origin", "reviewSha256", "examples"))
    require(document["schemaVersion"] == "glimmer-demonstrations.v1", "Dataset version mismatch.")
    origin = document["origin"]
    require(origin == "RIGHTS_REVIEWED" or (allow_synthetic and origin == "SYNTHETIC_TEST_ONLY"),
            "Only reviewed demonstrations may be prepared for training.")
    require(isinstance(document["reviewSha256"], str) and SHA.fullmatch(document["reviewSha256"]),
            "Dataset review digest required.")
    examples = document["examples"]
    require(isinstance(examples, list) and 1 <= len(examples) <= 10000, "Dataset size unsupported.")
    groups, ids, prompts = {}, set(), set()
    splits = {"train": [], "validation": [], "test": []}
    fields = ("id", "repositoryFamily", "taskFamily", "nearDuplicateGroup", "split", "licenseId",
              "sourceSha256", "rightsReviewSha256", "sanitationReviewSha256", "supervision",
              "observationSha256", "eligible", "messages")
    for row in examples:
        keys(row, fields)
        require(isinstance(row["id"], str) and ID.fullmatch(row["id"]) and row["id"] not in ids,
                "Invalid or repeated demonstration ID.")
        ids.add(row["id"])
        require(row["split"] in splits, "Invalid split.")
        require(isinstance(row["licenseId"], str) and ID.fullmatch(row["licenseId"]), "License identity required.")
        for field in ("repositoryFamily", "taskFamily", "nearDuplicateGroup", "sourceSha256",
                      "rightsReviewSha256", "sanitationReviewSha256"):
            require(isinstance(row[field], str) and SHA.fullmatch(row[field]), "Provenance digest required.")
        # The Colab SFT path accepts demonstrations, not tournament labels.
        # Verified outcome training requires the independent authenticated pipeline.
        require(row["supervision"] == "demonstration" and row["observationSha256"] is None,
                "Colab input cannot assert verified outcomes.")
        eligible = row["eligible"]
        require(isinstance(eligible, list) and 1 <= len(eligible) <= 3
                and all(isinstance(a, str) and a in ACTIONS for a in eligible)
                and len(set(eligible)) == len(eligible), "Invalid eligible actions.")
        for field in ("repositoryFamily", "taskFamily", "nearDuplicateGroup"):
            group = (field, row[field])
            require(group not in groups or groups[group] == row["split"], "Train/held-out family leakage.")
            groups[group] = row["split"]
        messages = row["messages"]
        require(isinstance(messages, list) and len(messages) == 3, "Three text messages required.")
        for message, role, limit in zip(messages, ("system", "user", "assistant"), (4000, 16000, 8000)):
            keys(message, ("role", "content"))
            require(message["role"] == role and isinstance(message["content"], str)
                    and 0 < len(message["content"]) <= limit, "Invalid message.")
            require(not SECRET.search(message["content"]), "Potential secret, personal or grader data.")
        prompt = re.sub(r"[^a-z0-9]+", " ", " ".join(m["content"] for m in messages[:2]).lower()).strip()
        require(prompt not in prompts, "Duplicate normalized prompt.")
        prompts.add(prompt)
        answer = strict_json(messages[2]["content"])
        keys(answer, ("strategy", "mechanism", "falsifiedWhen", "uncertainty"))
        require(answer["strategy"] == "ABSTAIN" or answer["strategy"] in eligible, "Unsupported answer action.")
        require(answer["uncertainty"] in ("insufficient", "limited", "supported"), "Invalid uncertainty.")
        for field, limit in (("mechanism", 2000), ("falsifiedWhen", 1000)):
            require(isinstance(answer[field], str) and 0 < len(answer[field]) <= limit, "Invalid rationale.")
        splits[row["split"]].append(row)
    return {"origin": origin, "dataset_sha256": digest(document), "splits": splits,
            "rights_machine_verified": False}


def assess_answer(text, eligible):
    try:
        answer = strict_json(text)
        keys(answer, ("strategy", "mechanism", "falsifiedWhen", "uncertainty"))
        require(isinstance(answer["strategy"], str) and answer["strategy"] in ACTIONS | {"ABSTAIN"},
                "Invalid strategy.")
        require(answer["uncertainty"] in ("insufficient", "limited", "supported"), "Invalid uncertainty.")
        for field, limit in (("mechanism", 2000), ("falsifiedWhen", 1000)):
            require(isinstance(answer[field], str) and 0 < len(answer[field]) <= limit, "Invalid response text.")
        return {"schema_valid": True, "eligible_action": answer["strategy"] == "ABSTAIN" or answer["strategy"] in eligible}
    except (ValueError, TypeError, KeyError):
        return {"schema_valid": False, "eligible_action": None}


def prepare_dataset(source, output):
    source, output = Path(source), Path(output)
    require(source.is_file() and not source.is_symlink() and source.stat().st_size <= 32 * 2**20,
            "Expected a bounded, regular dataset JSON file.")
    validated = validate_dataset(strict_json(source.read_text(encoding="utf-8")))
    require(len(validated["splits"]["train"]) >= 8 and all(validated["splits"][s] for s in ("validation", "test")),
            "Need at least eight training examples and independent validation/test examples.")
    require(not output.exists(), "Preparation output already exists; preserve earlier artifacts.")
    output.mkdir(parents=True, mode=0o700)
    files = {}
    for split, rows in validated["splits"].items():
        filename = output / (split + ".jsonl")
        contents = "".join(json.dumps({"messages": row["messages"]}, ensure_ascii=False, allow_nan=False) + "\n" for row in rows)
        filename.write_text(contents, encoding="utf-8")
        files[split] = {"path": str(filename.resolve()), "sha256": hashlib.sha256(contents.encode()).hexdigest(),
                        "examples": len(rows), "ids_sha256": digest([r["id"] for r in rows])}
    # Held-out answers live in a separate evaluation artifact. Only the first
    # two messages are passed into generation; no assistant target is prefixed.
    evaluation = [{"id": row["id"], "eligible": row["eligible"], "messages": row["messages"][:2],
                   "expected": strict_json(row["messages"][2]["content"])}
                  for row in validated["splits"]["test"]]
    evaluation_file = output / "evaluation.jsonl"
    contents = "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in evaluation)
    evaluation_file.write_text(contents, encoding="utf-8")
    files["evaluation"] = {"path": str(evaluation_file.resolve()), "sha256": hashlib.sha256(contents.encode()).hexdigest(),
                           "examples": len(evaluation), "ids_sha256": digest([r["id"] for r in evaluation])}
    manifest = {"schemaVersion": "colab-sft-preparation.v1", "model": MODEL, "revision": REVISION,
                "origin": validated["origin"], "dataset_sha256": validated["dataset_sha256"], "files": files}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def verify_preparation(manifest):
    keys(manifest, ("schemaVersion", "model", "revision", "origin", "dataset_sha256", "files"))
    require(manifest["schemaVersion"] == "colab-sft-preparation.v1"
            and isinstance(manifest["dataset_sha256"], str) and SHA.fullmatch(manifest["dataset_sha256"]),
            "Unsupported preparation manifest.")
    require(manifest["model"] == MODEL and manifest["revision"] == REVISION
            and manifest["origin"] == "RIGHTS_REVIEWED", "Preparation lineage mismatch.")
    keys(manifest["files"], ("train", "validation", "test", "evaluation"))
    paths = set()
    for entry in manifest["files"].values():
        keys(entry, ("path", "sha256", "examples", "ids_sha256"))
        require(type(entry["examples"]) is int and entry["examples"] > 0
                and isinstance(entry["ids_sha256"], str) and SHA.fullmatch(entry["ids_sha256"]),
                "Invalid prepared split metadata.")
        file = Path(entry["path"])
        require(file.is_file() and not file.is_symlink()
                and hashlib.sha256(file.read_bytes()).hexdigest() == entry["sha256"],
                "Prepared dataset changed.")
        require(str(file.resolve()) not in paths, "Prepared splits must use distinct files.")
        paths.add(str(file.resolve()))


def make_config(manifest, output, phase, max_steps=0):
    verify_preparation(manifest)
    require(phase in ("smoke", "pilot"), "Unsupported training phase.")
    if phase == "smoke":
        require(max_steps in (0, 2), "Smoke must cross exactly two optimizer steps.")
        max_steps = 2
    else:
        require(type(max_steps) is int and 10 <= max_steps <= 1000 and max_steps % 10 == 0,
                "Pilot needs a bounded step count divisible by ten (10–1000).")
    destination = Path(output)
    require(not destination.exists(), "Training output exists; no silent overwrite/resume.")
    config = {
        "base_model": MODEL, "revision_of_model": REVISION, "processor_type": "AutoProcessor",
        "plugins": ["axolotl.integrations.cut_cross_entropy.CutCrossEntropyPlugin"],
        "adapter": "qlora", "load_in_4bit": True, "bf16": True, "fp16": False,
        "bnb_config_kwargs": {"bnb_4bit_quant_type": "nf4", "bnb_4bit_use_double_quant": True,
                              "bnb_4bit_compute_dtype": "bfloat16", "bnb_4bit_quant_storage": "bfloat16"},
        "peft_init_lora_weights": True, "save_safetensors": True, "merge_lora": False,
        "trust_remote_code": False, "sample_packing": False, "skip_prepare_dataset": True,
        "remove_unused_columns": False, "train_on_inputs": False, "roles_to_train": ["assistant"],
        "sequence_len": 1024 if phase == "smoke" else 2048,
        "micro_batch_size": 1, "gradient_accumulation_steps": 1 if phase == "smoke" else 4,
        "lora_r": 32, "lora_alpha": 16, "lora_dropout": 0.05, "lora_target_modules": TARGETS,
        "optimizer": "adamw_bnb_8bit", "learning_rate": 0.0002, "lr_scheduler": "cosine",
        "warmup_ratio": 0.1, "weight_decay": 0.0, "gradient_checkpointing": True,
        "attn_implementation": "flash_attention_2", "seed": 42, "num_epochs": 1,
        "max_steps": max_steps, "save_strategy": "steps", "save_steps": 2 if phase == "smoke" else 10,
        "save_total_limit": 2, "logging_steps": 1, "eval_strategy": "no" if phase == "smoke" else "steps",
        "datasets": [{"path": manifest["files"]["train"]["path"], "type": "chat_template", "field_messages": "messages"}],
        "val_set_size": 0.0, "dataset_prepared_path": str(destination.parent / (destination.name + "-cache")),
        "output_dir": str(destination), "wandb_project": None, "hub_model_id": None,
    }
    if phase == "pilot":
        config.update(eval_steps=10, test_datasets=[{"path": manifest["files"]["validation"]["path"],
                                                    "type": "chat_template", "field_messages": "messages"}])
    return config


def bounded_train(config_file, config_sha256, runtime_sha256, budget, manifest, phase, approved=False):
    """Manual, fixed trainer invocation. Never called by import/notebook defaults."""
    require(approved is True, "Training has not been approved in the notebook.")
    report = collect_runtime()
    require(assess_runtime(report, required_disk_gib=20)["status"] == "ENVIRONMENT_CANDIDATE"
            and runtime_identity(report) == runtime_sha256, "Runtime changed or reference environment unavailable.")
    file = Path(config_file)
    require(file.is_file() and not file.is_symlink(), "Expected local training config.")
    config = strict_json(file.read_text(encoding="utf-8"))  # JSON is also YAML.
    require(digest(config) == config_sha256 and config.get("base_model") == MODEL
            and config.get("revision_of_model") == REVISION, "Config identity changed.")
    expected_config = make_config(manifest, config["output_dir"], phase, config["max_steps"])
    require(config == expected_config, "Only the fixed reviewed configuration is supported.")
    require(type(config.get("max_steps")) is int and 1 <= config["max_steps"] <= 1000,
            "An explicit step bound is required.")
    require(not Path(config["output_dir"]).exists(), "Output exists; no automatic resume.")
    require(type(budget.get("maximum_seconds")) is int and 60 <= budget["maximum_seconds"] <= 7200,
            "Wall-time bound must be 60–7200 seconds.")
    executable = shutil.which("axolotl")
    require(executable is not None, "Axolotl executable missing.")
    log = file.with_suffix(".log")
    env = dict(os.environ)
    env.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_DATASETS_OFFLINE="1",
               HF_HUB_DISABLE_TELEMETRY="1", WANDB_MODE="disabled", WANDB_DISABLED="true",
               DO_NOT_TRACK="1", CUDA_VISIBLE_DEVICES="0")
    # Off-line training requires the separately authorized pinned model cached.
    result = _bounded_process([executable, "train", str(file.resolve())],
                              budget["maximum_seconds"], log, env)
    state_file = Path(config["output_dir"]) / ("checkpoint-" + str(config["max_steps"])) / "trainer_state.json"
    require(state_file.is_file() and not state_file.is_symlink(), "Final step checkpoint state missing.")
    state = strict_json(state_file.read_text(encoding="utf-8"))
    require(state.get("global_step") == config["max_steps"], "Trainer did not reach the declared optimizer steps.")
    losses = [r["loss"] for r in state.get("log_history", []) if "loss" in r]
    require(losses and all(type(v) in (int, float) and math.isfinite(v) and v > 0 for v in losses),
            "Finite positive training losses were not recorded.")
    return {**result,
            "optimizer_steps": state["global_step"],
            "config_sha256": config_sha256, "runtime_sha256": runtime_sha256,
            "architecture_improvement_measured": False}


def reload_adapter(adapter_directory, approved=False):
    """Actual fresh-base reload check; requires separately approved GPU use."""
    require(approved is True, "GPU adapter reload has not been approved.")
    import torch
    from transformers import AutoModelForMultimodalLM, BitsAndBytesConfig
    from peft import PeftModel, get_peft_model_state_dict
    from safetensors.torch import load_file
    directory = Path(adapter_directory)
    adapter_config = strict_json((directory / "adapter_config.json").read_text(encoding="utf-8"))
    require(adapter_config.get("base_model_name_or_path") == MODEL
            and adapter_config.get("r") == 32 and adapter_config.get("lora_alpha") == 16
            and adapter_config.get("target_modules") == TARGETS, "Adapter does not match the pinned configuration.")
    expected = load_file(str(directory / "adapter_model.safetensors"))
    require(expected and any("lora_B" in k and bool(torch.count_nonzero(v)) for k, v in expected.items()),
            "No observed nonzero LoRA B weights.")
    torch.cuda.reset_peak_memory_stats()
    model, base, actual = None, None, None
    try:
        base = AutoModelForMultimodalLM.from_pretrained(
            MODEL, revision=REVISION, local_files_only=True, trust_remote_code=False,
            dtype=torch.bfloat16, device_map={"": 0}, attn_implementation="flash_attention_2",
            quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True,
                bnb_4bit_quant_storage=torch.bfloat16))
        model = PeftModel.from_pretrained(base, str(directory), is_trainable=False, local_files_only=True)
        actual = get_peft_model_state_dict(model)
        require(set(actual) == set(expected), "Saved adapter keys did not reload exactly.")
        require(all(torch.equal(actual[k].detach().cpu().to(expected[k].dtype), expected[k])
                    and bool(torch.isfinite(actual[k]).all()) for k in expected),
                "Saved adapter tensors did not reload exactly.")
        return {"schemaVersion": "colab-adapter-reload.v1", "base_revision": REVISION,
                "adapter_weights_sha256": hashlib.sha256((directory / "adapter_model.safetensors").read_bytes()).hexdigest(),
                "tensor_count": len(expected), "saved_tensors_match": True,
                "peak_allocated_mib": torch.cuda.max_memory_allocated() / 2**20,
                "architecture_improvement_measured": False}
    finally:
        del model, base, actual
        gc.collect()
        torch.cuda.empty_cache()


def generate_evaluation(manifest, output, adapter_directory=None, approved=False, limit=8):
    """Bounded paired generation scaffold. No architectural correctness oracle."""
    require(approved is True, "GPU evaluation has not been approved.")
    require(type(limit) is int and 1 <= limit <= 8, "Evaluation limit must be 1–8.")
    verify_preparation(manifest)
    destination = Path(output)
    require(not destination.exists(), "Evaluation output exists; retain previous results.")
    import torch
    from transformers import AutoModelForMultimodalLM, AutoProcessor, BitsAndBytesConfig
    from peft import PeftModel
    examples = [strict_json(line) for line in Path(manifest["files"]["evaluation"]["path"]).read_text(encoding="utf-8").splitlines()]
    examples = examples[:limit]
    model, base = None, None
    results = []
    torch.manual_seed(42)
    try:
        base = AutoModelForMultimodalLM.from_pretrained(
            MODEL, revision=REVISION, local_files_only=True, trust_remote_code=False,
            dtype=torch.bfloat16, device_map={"": 0}, attn_implementation="flash_attention_2",
            quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True,
                bnb_4bit_quant_storage=torch.bfloat16))
        model = PeftModel.from_pretrained(base, str(adapter_directory), is_trainable=False, local_files_only=True) if adapter_directory else base
        processor = AutoProcessor.from_pretrained(MODEL, revision=REVISION, local_files_only=True, trust_remote_code=False)
        model.eval()
        for example in examples:
            messages = example["messages"]
            require([m["role"] for m in messages] == ["system", "user"], "Held-out target leaked into input.")
            inputs = processor.apply_chat_template(messages, add_generation_prompt=True, tokenize=True,
                return_dict=True, return_tensors="pt").to("cuda:0")
            prompt_tokens = inputs["input_ids"].shape[-1]
            require(prompt_tokens <= 2048, "Held-out input exceeds the fixed evaluation context.")
            started = time.monotonic()
            with torch.inference_mode():
                tokens = model.generate(**inputs, max_new_tokens=256, do_sample=False, max_time=30)
            answer = processor.decode(tokens[0][prompt_tokens:], skip_special_tokens=True)
            results.append({"id": example["id"], "response": answer, **assess_answer(answer, example["eligible"]),
                            "latency_seconds": time.monotonic() - started,
                            "input_tokens": prompt_tokens, "output_tokens": tokens.shape[-1] - prompt_tokens,
                            "architecture_correctness": None})
    finally:
        del model, base
        gc.collect()
        torch.cuda.empty_cache()
    report = {"schemaVersion": "colab-sft-generation.v1", "model": MODEL, "revision": REVISION,
              "dataset_sha256": manifest["dataset_sha256"], "prompt_ids_sha256": digest([r["id"] for r in results]),
              "decoding": {"do_sample": False, "max_new_tokens": 256, "max_time": 30, "seed": 42},
              "adapter_sha256": hashlib.sha256((Path(adapter_directory) / "adapter_model.safetensors").read_bytes()).hexdigest() if adapter_directory else None,
              "results": results, "architecture_improvement_measured": False}
    destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return {"examples": len(results), "output_sha256": digest(report), "architecture_improvement_measured": False}
