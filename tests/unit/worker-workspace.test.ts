import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

it("copies inert data into a worker-owned directory without chmod of the root-owned tmpfs", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-vm-modules",
      path.resolve("tests/helpers/worker-workspace-probe.mjs"),
      path.resolve("scripts/evaluator/booking-v1/worker.mjs"),
    ],
    { encoding: "utf8", timeout: 5000, maxBuffer: 16384 },
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
  const observed = JSON.parse(result.stdout);
  expect(observed).toMatchObject({
    imports: ["/bridge/probe.mjs"],
    exits: [0],
    chdirs: ["/work/task"],
    mountRootChmod: false,
    copy: "INERT BASELINE DATA",
    original: "INERT BASELINE DATA",
    copyMode: 0o600,
    sourceMode: 0o444,
  });
  expect(observed.toolingSymlink).toMatch(/\/toolchain\/node_modules$/);
});

it.each([0, 7])(
  "uses the bounded explicit production build profile and preserves exit %s",
  (exit) => {
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-vm-modules",
        path.resolve("tests/helpers/worker-workspace-probe.mjs"),
        path.resolve("scripts/evaluator/booking-v1/worker.mjs"),
        "build",
        String(exit),
      ],
      { encoding: "utf8", timeout: 5000, maxBuffer: 16384 },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const observed = JSON.parse(result.stdout);
    expect(observed.imports).toEqual([]);
    expect(observed.exits).toEqual([exit]);
    expect(observed.commands).toEqual([
      {
        executable: "/usr/local/bin/node",
        args: [
          "/toolchain/node_modules/next/dist/bin/next",
          "build",
          "--webpack",
        ],
        options: {
          cwd: "/work/task",
          timeout: 90000,
          maxBuffer: 1048576,
          env: {
            PATH: "/usr/local/bin:/usr/bin:/bin",
            NEXT_TELEMETRY_DISABLED: "1",
            NODE_ENV: "production",
          },
        },
      },
    ]);
  },
);
