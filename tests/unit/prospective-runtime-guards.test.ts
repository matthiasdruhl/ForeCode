// Genuine validators with disposable signed source records; no guest/provider.
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return {
    ...fs,
    readFile: async (...args: Parameters<typeof fs.readFile>) =>
      args[0] === "/opt/homebrew/bin/sbx"
        ? Buffer.from("synthetic fixed CLI bytes")
        : fs.readFile(...args),
  };
});
import { compositionFixture } from "../support/team-composition";
import { studyFixture } from "../support/tournament-study";
import { removeMetricFixture } from "../support/protected-metrics";
import * as configModule from "../../scripts/experiments/tournament/team-config";
import * as processModule from "../../scripts/experiments/runner/process";
import { createInstalledTeamControls } from "../../scripts/experiments/tournament/team-sbx";
import type { RegisteredMeasurementSession } from "../../scripts/experiments/tournament/registered-measurement";
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await removeMetricFixture(root);
});
describe("reserved prospective study dispatch barriers", () => {
  it.each(configModule.prospectiveTeamStudyIds)(
    "%s cannot dispatch without a live registered measurement session",
    async (studyId) => {
      const base = await compositionFixture();
      roots.push(base.parent);
      const reserved = await studyFixture({
        configure(definition, draft) {
          Object.assign(definition, structuredClone(base.study.definition));
          Object.assign(draft, structuredClone(base.study.draft));
          definition.protocol.studyId = studyId;
          draft.plan.manifest.id = studyId;
        },
      });
      roots.push(reserved.parent);
      vi.spyOn(configModule, "loadRegisteredTeamRuntime").mockResolvedValue({
        registration: {
          ...base.registration,
          studyRoot: reserved.studyRoot,
          study: reserved.operatorConfig,
        },
        sha256: "a".repeat(64),
      });
      const run = vi
        .spyOn(processModule, "boundedProcess")
        .mockRejectedValue(new Error("Guest operation forbidden in this test"));
      await expect(createInstalledTeamControls(reserved.study)).rejects.toThrow(
        "Prospective study requires live registered measurement orchestration",
      );
      await expect(
        createInstalledTeamControls(reserved.study, {
          protocol: { schemaVersion: "prospective-tournament-metrics.v2" },
          execution: "APPROVED",
        } as unknown as RegisteredMeasurementSession),
      ).rejects.toThrow(
        "Authenticated registered measurement session required",
      );
      expect(run).not.toHaveBeenCalled();
    },
  );
});
