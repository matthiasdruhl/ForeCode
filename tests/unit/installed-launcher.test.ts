import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

// Run only reviewed, harmless Python host samples through the launcher's real
// output/deadline/process-group logic. Installed guest Node is never executed.
describe("installed smoke launcher — synthetic fixed host subprocesses", () => {
  it.each(["completed", "timed_out", "output_limit", "nonzero"])(
    "bounds and records %s without accepting caller commands",
    (mode) => {
      const result = spawnSync(
        "python3",
        [
          "-I",
          "-c",
          `
import json, runpy, subprocess, sys, time
from unittest.mock import patch
original = subprocess.Popen
now = time.monotonic
sample = {
 'completed': 'print("SYNTHETIC constant smoke observation")',
 'nonzero': 'raise SystemExit(7)',
 'timed_out': 'import time; time.sleep(30)',
 'output_limit': 'import sys; sys.stdout.write("S" * 100000); sys.stdout.flush()',
}[sys.argv[2]]
def launch(command, **options):
    assert command == ['/opt/forecode-booking/bin/node', '--conditions=react-server', '--import', '/opt/forecode-booking/node_modules/tsx/dist/loader.mjs', '/opt/forecode-booking/controller/installed-smoke.mjs']
    assert options['start_new_session'] is True
    options['cwd'] = '/'
    return original([sys.executable, '-I', '-c', sample], **options)
start = now()
def clock():
    elapsed = now() - start
    return now() + (30 if sys.argv[2] == 'timed_out' and elapsed > .1 else 0)
with patch('subprocess.Popen', launch), patch('time.monotonic', clock):
    runpy.run_path(sys.argv[1], run_name='__main__')
`,
          path.resolve("scripts/experiments/isolation/installed-smoke.py"),
          mode,
        ],
        {
          encoding: "utf8",
          timeout: 3000,
          maxBuffer: 131072,
        },
      );
      expect(result.status).toBe(0);
      const observed = JSON.parse(result.stdout);
      expect(observed.reason).toBe(mode === "nonzero" ? "completed" : mode);
      expect(observed.exitCode).toBe(
        mode === "nonzero" ? 7 : mode === "completed" ? 0 : -9,
      );
      expect(
        observed.stdout.length + observed.stderr.length,
      ).toBeLessThanOrEqual(69632);
      expect(observed.guestMachine).toBeTruthy();
    },
  );
});
