import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import {
  qloraPreparation,
  validateDemonstrations,
} from "../../scripts/learning/qlora";

it("keeps the Colab model pins and demonstration format aligned with the existing learning interface", () => {
  const result = spawnSync(
    "python3",
    [
      "-B",
      "-c",
      `import sys,json
sys.path.insert(0, 'research/qlora')
import colab_support as c
from test_colab_support import dataset
print(json.dumps({'dataset':dataset(), 'model':c.MODEL, 'revision':c.REVISION, 'targets':c.TARGETS}))`,
    ],
    { encoding: "utf8", timeout: 5000, maxBuffer: 128 * 1024 },
  );
  expect(result.status, result.stderr).toBe(0);
  const output = JSON.parse(result.stdout);
  const reference = qloraPreparation();
  expect(output.model).toBe(reference.axolotl.base_model);
  expect(output.revision).toBe(reference.axolotl.revision_of_model);
  expect(output.targets).toBe(reference.axolotl.lora_target_modules);
  expect(validateDemonstrations(output.dataset)).toMatchObject({
    origin: "SYNTHETIC_TEST_ONLY",
    examples: 10,
    trainingAuthorized: false,
  });
});

it("checks the Colab notebook and CPU-only QLoRA preparation without model dependencies", () => {
  const result = spawnSync(
    "python3",
    [
      "-B",
      "-m",
      "unittest",
      "discover",
      "-s",
      "research/qlora",
      "-p",
      "test_*.py",
      "-v",
    ],
    { encoding: "utf8", timeout: 30_000, maxBuffer: 256 * 1024 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stderr).toContain("OK");
}, 35_000);
