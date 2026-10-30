"""CPU-only tests. Every example, rights digest and runtime below is fictional.

These fixtures are NOT rights-cleared training data, verified outcomes, or GPU
compatibility evidence. No ML package, checkpoint or external service is used.
"""
import copy
import json
import os
import socket
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import build_notebook
import colab_support as c


def example(index, split):
    h = lambda field: c.digest(["SYNTHETIC_TEST_ONLY", field, index])
    return {"id": "test-only-" + str(index), "repositoryFamily": h("repository"),
            "taskFamily": h("task"), "nearDuplicateGroup": h("duplicate"), "split": split,
            "licenseId": "test-only-no-training-rights", "sourceSha256": h("source"),
            "rightsReviewSha256": h("fictional-rights"), "sanitationReviewSha256": h("fictional-review"),
            "supervision": "demonstration", "observationSha256": None,
            "eligible": ["KEEP", "BOUNDARY"], "messages": [
                {"role": "system", "content": "Test-only bounded architectural advice."},
                {"role": "user", "content": "Fictional test scenario number " + str(index)},
                {"role": "assistant", "content": json.dumps({
                    "strategy": "KEEP" if index % 2 else "ABSTAIN", "mechanism": "Test-only reason.",
                    "falsifiedWhen": "Test-only counterexample.", "uncertainty": "insufficient"})}]}


def dataset(origin="SYNTHETIC_TEST_ONLY"):
    return {"schemaVersion": "glimmer-demonstrations.v1", "origin": origin,
            "reviewSha256": c.digest("fictional-review-not-an-approval"),
            "examples": [example(i, "train" if i < 8 else "validation" if i == 8 else "test") for i in range(10)]}


def runtime():
    return {"python": "3.12.12", "packages": {**dict.fromkeys(c.PACKAGES, "fictional-test-version"), **c.REFERENCE},
            "disk_free_gib": 150, "gpu_count": 1, "gpu_name": "FICTIONAL A100",
            "gpu_memory_mib": 40536, "gpu_capability": [8, 0], "bf16": True, "torch_cuda": "13.0"}


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def prepare(self):
        # Exercise RIGHTS_REVIEWED validation mechanics using fictional metadata;
        # never exported or used for actual training, nor claimed to have rights.
        source = self.root / "test-only.json"
        source.write_text(json.dumps(dataset("RIGHTS_REVIEWED")), encoding="utf-8")
        return c.prepare_dataset(source, self.root / "prepared")

    def test_strict_json_rejects_duplicate_and_nonfinite_values(self):
        for value in ('{"x":1,"x":2}', '{"x":NaN}', '{"x":Infinity}'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                c.strict_json(value)

    def test_dataset_reproducibility_and_synthetic_isolation(self):
        doc = dataset()
        result = c.validate_dataset(doc, allow_synthetic=True)
        self.assertEqual(result, c.validate_dataset(copy.deepcopy(doc), allow_synthetic=True))
        self.assertFalse(result["rights_machine_verified"])
        with self.assertRaises(ValueError):
            c.validate_dataset(doc)
        source = self.root / "synthetic.json"
        source.write_text(json.dumps(doc), encoding="utf-8")
        with self.assertRaises(ValueError):
            c.prepare_dataset(source, self.root / "forbidden")
        self.assertFalse((self.root / "forbidden").exists())

    def test_dataset_defects_fail_closed(self):
        for defect in ("version", "unknown-field", "rights", "verified", "action", "duplicate-id",
                       "normalized-prompt", "secret", "grader", "roles", "rationale"):
            with self.subTest(defect=defect):
                doc = dataset()
                row = doc["examples"][0]
                if defect == "version": doc["schemaVersion"] = "v99"
                if defect == "unknown-field": row["hiddenGrader"] = "unapproved"
                if defect == "rights": row["rightsReviewSha256"] = ""
                if defect == "verified":
                    row["supervision"] = "verified_success"
                    row["observationSha256"] = c.digest("forged-verification")
                if defect == "action": row["eligible"] = ["INVENTED"]
                if defect == "duplicate-id": row["id"] = doc["examples"][1]["id"]
                if defect == "normalized-prompt":
                    row["messages"][1]["content"] = doc["examples"][1]["messages"][1]["content"].upper() + "!!!"
                if defect == "secret": row["messages"][1]["content"] = "person@example.org"
                if defect == "grader": row["messages"][1]["content"] = "PRIVATE_GRADER_SENTINEL"
                if defect == "roles": row["messages"][0]["role"] = "assistant"
                if defect == "rationale":
                    answer = json.loads(row["messages"][2]["content"])
                    answer["mechanism"] = ""
                    row["messages"][2]["content"] = json.dumps(answer)
                with self.assertRaises(ValueError):
                    c.validate_dataset(doc, allow_synthetic=True)

    def test_all_three_family_boundaries_reject_heldout_leakage(self):
        for group in ("repositoryFamily", "taskFamily", "nearDuplicateGroup"):
            with self.subTest(group=group):
                doc = dataset()
                doc["examples"][-1][group] = doc["examples"][0][group]
                with self.assertRaisesRegex(ValueError, "leakage"):
                    c.validate_dataset(doc, allow_synthetic=True)

    def test_preparation_splits_and_heldout_target_separation(self):
        manifest = self.prepare()
        c.verify_preparation(manifest)
        self.assertEqual(manifest["files"]["train"]["examples"], 8)
        evaluation = json.loads(Path(manifest["files"]["evaluation"]["path"]).read_text())
        self.assertEqual([m["role"] for m in evaluation["messages"]], ["system", "user"])
        self.assertIn("strategy", evaluation["expected"])
        self.assertNotIn("number 9", Path(manifest["files"]["train"]["path"]).read_text())
        with self.assertRaisesRegex(ValueError, "already exists"):
            c.prepare_dataset(self.root / "test-only.json", self.root / "prepared")

    def test_preparation_rejects_small_corpus_symlink_and_tampering(self):
        doc = dataset("RIGHTS_REVIEWED")
        doc["examples"] = doc["examples"][:7] + doc["examples"][8:]
        source = self.root / "small.json"
        source.write_text(json.dumps(doc))
        with self.assertRaisesRegex(ValueError, "eight"):
            c.prepare_dataset(source, self.root / "small")
        link = self.root / "symlink.json"
        link.symlink_to(source)
        with self.assertRaises(ValueError):
            c.prepare_dataset(link, self.root / "linked")
        manifest = self.prepare()
        del manifest["files"]["evaluation"]
        with self.assertRaises(ValueError):
            c.verify_preparation(manifest)
        manifest = json.loads((self.root / "prepared" / "manifest.json").read_text())
        Path(manifest["files"]["train"]["path"]).write_text("changed\n")
        with self.assertRaisesRegex(ValueError, "changed"):
            c.verify_preparation(manifest)

    def test_fixed_config_pins_and_language_only_targets(self):
        manifest = self.prepare()
        smoke = c.make_config(manifest, self.root / "smoke", "smoke")
        pilot = c.make_config(manifest, self.root / "pilot", "pilot", 10)
        self.assertEqual(smoke["max_steps"], 2)
        self.assertEqual(smoke["revision_of_model"], c.REVISION)
        self.assertEqual(smoke["bnb_config_kwargs"]["bnb_4bit_quant_storage"], "bfloat16")
        self.assertFalse(smoke["trust_remote_code"])
        self.assertTrue(smoke["save_safetensors"])
        self.assertIsNone(smoke["wandb_project"])
        self.assertIsNone(smoke["hub_model_id"])
        self.assertEqual(pilot["datasets"][0]["path"], manifest["files"]["train"]["path"])
        self.assertEqual(pilot["test_datasets"][0]["path"], manifest["files"]["validation"]["path"])
        self.assertNotIn(manifest["files"]["test"]["path"], json.dumps(pilot))
        self.assertTrue(c.re.fullmatch(c.TARGETS, "model.language_model.layers.7.self_attn.q_proj"))
        self.assertFalse(c.re.fullmatch(c.TARGETS, "model.vision_model.layers.7.self_attn.q_proj"))
        for steps in (0, True, 9, 11, 1001):
            with self.subTest(steps=steps), self.assertRaises(ValueError):
                c.make_config(manifest, self.root / "invalid", "pilot", steps)

    def test_modified_config_cannot_launch_a_process(self):
        manifest = self.prepare()
        config = c.make_config(manifest, self.root / "smoke", "smoke")
        config["plugins"] = ["unapproved.module"]
        file = self.root / "modified.yml"
        file.write_text(json.dumps(config))
        with patch.object(c, "collect_runtime", return_value=runtime()), patch.object(c, "_bounded_process") as process:
            with self.assertRaisesRegex(ValueError, "fixed reviewed configuration"):
                c.bounded_train(file, c.digest(config), c.runtime_identity(runtime()),
                                {"maximum_seconds": 60}, manifest, "smoke", approved=True)
            process.assert_not_called()


class RuntimeAndBudgetTests(unittest.TestCase):
    def test_runtime_is_a_candidate_not_a_validation_claim(self):
        report = runtime()
        assessment = c.assess_runtime(report)
        self.assertEqual(assessment["status"], "ENVIRONMENT_CANDIDATE")
        self.assertFalse(assessment["model_compatibility_validated"])
        report["disk_free_gib"] = 90
        self.assertEqual(c.runtime_identity(report), assessment["runtime_sha256"])
        self.assertEqual(c.assess_runtime(report)["status"], "HOLD")
        self.assertEqual(c.assess_runtime(report, required_disk_gib=20)["status"], "ENVIRONMENT_CANDIDATE")

    def test_unsupported_hardware_and_packages_hold(self):
        defects = [("gpu_count", 0), ("gpu_count", 2), ("gpu_memory_mib", 24576),
                   ("gpu_memory_mib", None), ("gpu_memory_mib", float("nan")),
                   ("bf16", False), ("python", "3.11.0"), ("torch_cuda", "12.8"),
                   ("disk_free_gib", 50)]
        for field, value in defects:
            with self.subTest(field=field, value=value):
                report = runtime()
                report[field] = value
                # Nonfinite identity is itself rejected, rather than serialized.
                if isinstance(value, float) and not c.math.isfinite(value):
                    with self.assertRaises(ValueError): c.assess_runtime(report)
                else:
                    self.assertEqual(c.assess_runtime(report)["status"], "HOLD")
        for name in c.PACKAGES:
            report = runtime()
            report["packages"][name] = None
            self.assertEqual(c.assess_runtime(report)["status"], "HOLD")
        report = runtime()
        report["packages"]["torch"] = "0.0.0"
        self.assertEqual(c.assess_runtime(report)["status"], "HOLD")

    def test_budget_uses_entered_rate_and_retains_reserve(self):
        # Fictional arithmetic, not a quote or spending authorization.
        result = c.phase_budget(100, 12, 10, 30, 7200)
        self.assertEqual(result["maximum_seconds"], 3000)
        self.assertEqual(result["maximum_cu_at_displayed_rate"], 10)
        self.assertFalse(result["provider_billing_cap"])
        self.assertEqual(c.phase_budget(32, 12, 10, 30, 7200)["maximum_seconds"], 600)

    def test_unknown_nonfinite_and_overdrawn_budgets_fail(self):
        for index in range(5):
            for bad in (None, True, float("nan"), float("inf"), -1):
                values = [100, 12, 10, 30, 600]
                values[index] = bad
                with self.subTest(index=index, bad=bad), self.assertRaises(ValueError):
                    c.phase_budget(*values)
        for values in ((30, 12, 10, 30, 600), (100, 1000, 1, 30, 600)):
            with self.assertRaises(ValueError): c.phase_budget(*values)

    def test_heavy_functions_require_explicit_approval_before_optional_imports(self):
        with patch("builtins.__import__", side_effect=AssertionError("No optional imports")):
            for call in (lambda: c.acquire_checkpoint("unused", {}),
                         lambda: c.bounded_train(None, None, None, {}, None, "smoke"),
                         lambda: c.reload_adapter("unused"),
                         lambda: c.generate_evaluation(None, "unused")):
                with self.assertRaises(ValueError): call()

    def test_schema_eligibility_is_separate_from_correctness(self):
        text = example(1, "test")["messages"][2]["content"]
        self.assertEqual(c.assess_answer(text, ["KEEP"]), {"schema_valid": True, "eligible_action": True})
        self.assertEqual(c.assess_answer(text, ["ADAPTER"]), {"schema_valid": True, "eligible_action": False})
        for bad in ("not json", text.replace('"KEEP"', '"EXECUTE"'), text.replace('"Test-only reason."', '123')):
            self.assertEqual(c.assess_answer(bad, ["KEEP"]), {"schema_valid": False, "eligible_action": None})

    def test_real_process_exit_and_timeout_with_harmless_local_python(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result = c._bounded_process([sys.executable, "-c", "print('test-only')"], 2, root / "ok.log", dict(os.environ))
            self.assertEqual(result["exit_code"], 0)
            self.assertEqual((root / "ok.log").read_text().strip(), "test-only")
            with self.assertRaisesRegex(ValueError, "failed"):
                c._bounded_process([sys.executable, "-c", "raise SystemExit(7)"], 2, root / "fail.log", dict(os.environ))
            with self.assertRaisesRegex(RuntimeError, "timed out"):
                c._bounded_process([sys.executable, "-c", "import time; time.sleep(30)"], 1, root / "timeout.log", dict(os.environ))

    def test_notebook_interrupt_terminates_the_owned_process_group(self):
        process = Mock(pid=12345)
        process.wait.side_effect = [KeyboardInterrupt(), 0]
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(c.subprocess, "Popen", return_value=process), \
             patch.object(c.os, "killpg") as terminate:
            with self.assertRaises(KeyboardInterrupt):
                c._bounded_process(["test-only-not-executed"], 60, Path(directory) / "interrupt.log", {})
            terminate.assert_called_once_with(process.pid, c.signal.SIGTERM)
            self.assertEqual(process.wait.call_count, 2)


class NotebookTests(unittest.TestCase):
    def test_generated_notebook_matches_source_and_all_cells_compile(self):
        expected = build_notebook.build()
        actual = json.loads((build_notebook.ROOT / "ForeCode-Glimmer-QLoRA.ipynb").read_text())
        self.assertEqual(actual, expected)
        self.assertFalse(actual["metadata"]["forecode"]["automatic_training"])
        for cell in actual["cells"]:
            if cell["cell_type"] == "code":
                self.assertEqual(cell["outputs"], [])
                self.assertIsNone(cell["execution_count"])
                compile("".join(cell["source"]), cell["id"], "exec")

    def test_default_run_all_stops_before_data_download_or_gpu_work(self):
        namespace = {}
        with patch.object(socket, "socket", side_effect=AssertionError("No network")), \
             patch.object(c.subprocess, "Popen", side_effect=AssertionError("No process")):
            cells = [cell for cell in build_notebook.build()["cells"] if cell["cell_type"] == "code"]
            exec("".join(cells[0]["source"]), namespace)
            exec("".join(cells[1]["source"]), namespace)
            for flag in ("APPROVE_DATA_FOR_COLAB", "APPROVE_MODEL_DOWNLOAD", "APPROVE_GPU_COMPUTE",
                         "APPROVE_PILOT", "PROCESSOR_AND_ASSISTANT_MASKS_REVIEWED"):
                self.assertIs(namespace[flag], False)
            self.assertIsNone(namespace["REMAINING_CU"])
            self.assertEqual(namespace["PILOT_STEPS"], 0)
            with self.assertRaisesRegex(ValueError, "GPU compute approval"):
                namespace["ready_compute"]()
            namespace["collect_runtime"] = runtime
            with patch("builtins.print"):
                exec("".join(cells[2]["source"]), namespace)
            with self.assertRaisesRegex(ValueError, "data rights"):
                exec("".join(cells[3]["source"]), namespace)
        self.assertNotIn("manifest", namespace)
        for package in ("torch", "transformers", "peft", "huggingface_hub"):
            self.assertNotIn(package, sys.modules)


if __name__ == "__main__":
    unittest.main()
