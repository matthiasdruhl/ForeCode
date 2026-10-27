import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { OfflineConfigSchema } from "../../scripts/experiments/isolation/offline-config";
import { createOfflineSbxAdapter } from "../../scripts/experiments/runner/offline-sbx";
import { collectOfflineInventory } from "../../scripts/experiments/isolation/offline-inventory";
import { boundedProcess } from "../../scripts/experiments/runner/process";

// Synthetic ordering test only: mocks do not supply runtime or owner authority.
vi.mock("../../scripts/experiments/isolation/offline-inventory", () => ({
  collectOfflineInventory: vi.fn(),
}));
vi.mock("../../scripts/experiments/isolation/offline-gate", () => ({
  reviewOffline: vi.fn(),
  admitOffline: vi.fn(),
}));
vi.mock("../../scripts/experiments/runner/process", () => ({
  boundedProcess: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());
describe("resource envelope across restart — SYNTHETIC", () => {
  it.each([false, true])(
    "revalidates after restart before recovery, resource failure=%s",
    async (failRestart) => {
      const h = "a".repeat(64),
        runId = randomUUID(),
        order: string[] = [];
      const config = OfflineConfigSchema.parse({
        schemaVersion: "booking-offline-operator.v1",
        scope: "fixed-booking-grader-acceptance-no-inference",
        enabled: false,
        acceptanceEnabled: true,
        sbx: "/opt/homebrew/bin/sbx",
        sbxSha256: h,
        graderSandbox: "forecode-grader",
        graderImage: `sha256:${h}`,
        workerImage: `sha256:${h}`,
        graderNodeSha256: h,
        graderLockSha256: h,
        graderModulesSha256: h,
        coordinationRoot: "/synthetic/coordination",
        protectedRoot: "/synthetic/protected",
        scratchRoot: "/synthetic/scratch",
        reviewFile: "/synthetic/review",
        reviewSha256: h,
        maxSeconds: 60,
        maxOutputBytes: 65536,
        vmDiskBytes: 8 * 1024 ** 3,
        vmPids: 4096,
      });
      let inventories = 0,
        recoveries = 0;
      vi.mocked(collectOfflineInventory).mockImplementation(
        async (_c, _e, _s, _initial, touch) => {
          touch();
          order.push("enforce-and-inventory");
          inventories++;
          if (failRestart && inventories === 3)
            throw Error("SYNTHETIC kernel controls reset/unavailable");
          return { synthetic: "stable-inventory" } as unknown as Awaited<
            ReturnType<typeof collectOfflineInventory>
          >;
        },
      );
      vi.mocked(boundedProcess).mockImplementation(async (_exe, args) => {
        let stdout = "";
        if (args[0] === "stop") order.push("stop");
        else if (args[0] === "inspect")
          stdout = JSON.stringify({ state: "stopped" });
        else if (args[0] === "exec") {
          order.push("recover");
          recoveries++;
          stdout = JSON.stringify({
            runId,
            removed: 0,
            remaining: 0,
            controllerRecovered: false,
          });
        } else throw Error("Unexpected synthetic command");
        return {
          reason: "completed",
          exitCode: 0,
          signal: null,
          stdout,
          stderr: "SYNTHETIC",
          elapsedMs: 1,
        };
      });
      const adapter = createOfflineSbxAdapter(config);
      await adapter.admit(h, new AbortController().signal);
      if (failRestart)
        await expect(adapter.cleanup([runId])).rejects.toThrow(
          "reset/unavailable",
        );
      else
        await expect(adapter.cleanup([runId])).resolves.toMatchObject({
          restartChecked: true,
          absentRunIds: [runId],
        });
      expect(order.slice(0, 5)).toEqual([
        "enforce-and-inventory",
        "enforce-and-inventory",
        "recover",
        "stop",
        "enforce-and-inventory",
      ]);
      expect(recoveries).toBe(failRestart ? 1 : 2);
      expect(order.at(-1)).toBe("stop");
    },
  );
});
