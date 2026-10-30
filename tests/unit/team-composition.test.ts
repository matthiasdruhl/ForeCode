import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chmod,
  mkdir,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
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
import { teamCli } from "../../scripts/experiments/tournament/team-cli";
import { prepareTeamRuntimeBundle } from "../../scripts/experiments/tournament/team-bundle";
import { sha256 } from "../../src/lib/report/digests";
import { compositionFixture } from "../support/team-composition";
import { runPairedTournament } from "../../scripts/experiments/tournament/paired";
import { createInstalledTeamControls } from "../../scripts/experiments/tournament/team-sbx";
import {
  createSupervisedTeamTransport,
  isAdmittedSupervisedTeamTransport,
  isTrustedSupervisedTeamFinalization,
  recordSupervisedTeamOutcome,
} from "../../scripts/experiments/tournament/supervised-team";
import { collectTeamInventory } from "../../scripts/experiments/tournament/team-inventory";
import {
  readTeamRegistration,
  loadRegisteredTeamRuntime,
} from "../../scripts/experiments/tournament/team-config";
import { isTrustedEvaluation } from "../../src/server/artifacts/evaluation-store";
const roots: string[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T12:06:00.000Z"));
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  async function writable(root: string): Promise<void> {
    await chmod(root, 0o700);
    for (const e of await readdir(root, { withFileTypes: true }))
      if (e.isDirectory()) await writable(path.join(root, e.name));
  }
  for (const root of roots.splice(0)) {
    await writable(root);
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const f = await compositionFixture();
  roots.push(f.parent);
  return f;
}
// Repeated bounded filesystem/custody observations contend with the full suite;
// this is a test deadline only and never changes production runtime limits.
describe(
  "fixed team production composition under no-inference control",
  { timeout: 30_000 },
  () => {
    it.each(["valid", "key", "override", "alias", "overlap"])(
      "loads only private registration data with source-pinned authority: %s",
      async (defect) => {
        const f = await fixture();
        const registrationRoot = path.join(f.parent, "registration");
        await mkdir(registrationRoot, { mode: 0o700 });
        const { entries, publicKeyPem, publicKeySha256, ...custody } =
          f.registration.study.custody;
        const document = {
          schemaVersion: "supervised-team-registration.local.v1",
          studyRoot: f.registration.studyRoot,
          study: {
            ...f.registration.study,
            custody: {
              ...custody,
              entries: [...entries].map(([id, entry]) => ({ id, ...entry })),
              ...(defect === "override" ? { publicKeyPem } : {}),
            },
          },
          runtime: {
            ...f.config,
            ...(defect === "overlap"
              ? { protectedRoot: registrationRoot }
              : {}),
          },
        };
        const bytes = JSON.stringify(document);
        const file = path.join(registrationRoot, "team-registration.json");
        await writeFile(
          defect === "alias" ? path.join(registrationRoot, "other.json") : file,
          bytes,
          { mode: 0o400 },
        );
        if (defect === "alias") await symlink("other.json", file);
        const location = {
          registrationRoot,
          publicKeyPem,
          publicKeySha256: defect === "key" ? "0".repeat(64) : publicKeySha256,
        };
        if (defect === "valid") {
          const loaded = await readTeamRegistration(location);
          expect(loaded.sha256).toBe(sha256(bytes));
          expect(loaded.registration.study.custody.publicKeyPem).toBe(
            publicKeyPem,
          );
          expect(loaded.registration.study.custody.entries).toEqual(entries);
          expect(
            await loadRegisteredTeamRuntime(
              f.study.definition.protocol.studyId,
            ),
          ).toBeNull();
        } else await expect(readTeamRegistration(location)).rejects.toThrow();
        expect(f.calls).toEqual([]);
      },
    );
    it("executes the exact fixed inventory/baseline/worker/seal/grader/cleanup sequence while remaining synthetic", async () => {
      const f = await fixture(),
        out = await runPairedTournament(f.input);
      expect(out.blockers).toEqual([]);
      expect(out.attempts).toHaveLength(2);
      expect(out.attempts.every((a) => a.failure === null)).toBe(true);
      expect(out).toMatchObject({
        execution: "NOT_RUN",
        cleanupConfirmed: true,
        leaseReleased: true,
      });
      expect(f.installed.kind).toBe("synthetic-team-controls");
      expect(isAdmittedSupervisedTeamTransport(f.transport)).toBe(false);
      for (const v of ["A", "B"] as const) {
        expect(isTrustedEvaluation(f.installed.baseline(v))).toBe(true);
        expect(
          f.installed.actualState(
            f.study.draft.plan.manifest.arms.find((a) => a.variant === v)!
              .runId!,
          ),
        ).toBeNull();
      }
      const grades = f.calls
        .filter((c) => c.args.some((a) => a.endsWith("guest.ts")))
        .map((c) => JSON.parse(c.input!));
      expect(grades).toHaveLength(4);
      expect(
        grades.slice(0, 2).every((g) => g.evaluationProfile === undefined),
      ).toBe(true);
      expect(
        grades
          .slice(2)
          .every(
            (g) => g.evaluationProfile.kind === "booking-team-permissions.v1",
          ),
      ).toBe(true);
      for (const attempt of out.attempts) {
        expect(attempt.run.receiptId).toBeNull();
        expect(attempt.run.metrics.tokens).toBeNull();
        expect(
          isTrustedEvaluation(
            await f.installed.reloadEvaluation(attempt.run.id),
          ),
        ).toBe(true);
      }
      expect([...f.vm.values()]).toEqual(["stopped", "stopped"]);
      expect(await readdir(f.config.runtimeOriginalRoot)).toEqual([]);
      await expect(f.installed.recordOriginals(out)).rejects.toThrow(
        "Synthetic",
      );
      await expect(
        recordSupervisedTeamOutcome(f.transport, out),
      ).rejects.toThrow("Concrete");
      expect(
        isTrustedSupervisedTeamFinalization(
          JSON.parse('{"terminationConfirmed":true}'),
        ),
      ).toBe(false);
      for (const call of f.calls)
        expect([
          "version",
          "ls",
          "inspect",
          "policy",
          "settings",
          "mcp",
          "exec",
          "stop",
        ]).toContain(call.args[0]);
      const observations = JSON.stringify(f.installed.observations());
      expect(observations).not.toContain("synthetic diagnostic");
    });
    it("refuses absent registration even for valid synthetic custody and config", async () => {
      const f = await fixture();
      await expect(createInstalledTeamControls(f.study)).rejects.toThrow(
        "code-owned",
      );
      expect(
        isAdmittedSupervisedTeamTransport(
          await createSupervisedTeamTransport(f.study),
        ),
      ).toBe(false);
      expect(f.calls).toEqual([]);
    });
    it.each(["missing", "forged", "expired", "revoked"])(
      "denies %s installed authority before any VM command",
      async (defect) => {
        const f = await fixture(),
          file = path.join(f.root, "installed-B.json");
        if (defect === "missing") await rm(file);
        if (defect === "forged") {
          await chmod(file, 0o600);
          await writeFile(file, '{"admitted":true}');
        }
        if (defect === "expired")
          vi.setSystemTime(new Date("2026-10-30T12:06:00.000Z"));
        if (defect === "revoked") {
          const p = path.join(f.root, "revocations.json");
          await chmod(p, 0o600);
          await writeFile(p, JSON.stringify({ revokedIds: ["installed-B"] }));
        }
        const out = await runPairedTournament(f.input);
        expect(out.attempts).toHaveLength(0);
        expect(f.calls).toEqual([]);
      },
    );
    it.each(["inventory", "foreign", "scratch"])(
      "refuses %s runtime before downstream worker launch",
      async (fault) => {
        const f = await fixture();
        f.faults[fault as "inventory" | "foreign" | "scratch"] = true;
        const out = await runPairedTournament(f.input);
        expect(out.attempts).toHaveLength(0);
        expect(
          f.calls.some((c) => c.input?.includes('"operation":"start"')),
        ).toBe(false);
        if (fault !== "inventory") {
          expect(out.cleanupConfirmed).toBe(false);
          expect(out.leaseReleased).toBe(false);
        }
      },
    );
    it.each(["boot", "nonce", "timeout", "missingCheck", "sourceOutside"])(
      "retains %s failure without synthetic promotion",
      async (fault) => {
        const f = await fixture();
        // Enable the fault only after the initial five-check baseline invocations.
        const original = f.deps.run;
        let grades = 0;
        f.deps.run = async (...args) => {
          if (args[1].some((a) => a.endsWith("guest.ts"))) grades++;
          if (grades >= 2 && args[2].input?.includes('"operation":"prepare"'))
            f.faults[fault as keyof typeof f.faults] = true;
          return original(...args);
        };
        // Constructor captures the deps object; mode cannot be changed by this seam.
        const out = await runPairedTournament(f.input);
        expect(out.execution).toBe("NOT_RUN");
        expect(out.attempts.length).toBeGreaterThan(0);
        expect(out.attempts[0]!.failure).not.toBeNull();
        expect(await readdir(f.config.runtimeOriginalRoot)).toEqual([]);
      },
    );
    it("stops before the second arm after failed cleanup and retains the lease", async () => {
      const f = await fixture(),
        original = f.deps.run;
      f.deps.run = async (...args) => {
        if (args[2].input?.includes('"operation":"start"'))
          f.faults.cleanup = true;
        return original(...args);
      };
      const out = await runPairedTournament(f.input);
      expect(out.attempts).toHaveLength(1);
      expect(out.cleanupConfirmed).toBe(false);
      expect(out.leaseReleased).toBe(false);
    });
    it("binds exact source and complete dispatch configuration to each installed original", async () => {
      const f = await fixture();
      const input = { ...f.input, sources: { ...f.input.sources } };
      const file = path.join(f.sources.B, "src/service.ts");
      await chmod(file, 0o600);
      await writeFile(file, "// source substitution");
      const out = await runPairedTournament(input);
      expect(out.attempts).toHaveLength(0);
      expect(f.calls).toEqual([]);
    });
    it("collects real command observations rather than accepting an inventory label", async () => {
      const f = await fixture();
      expect(f.initial.inventory.enforcementObservationSha256).toMatch(
        /^[a-f0-9]{64}$/,
      );
      const wrapper = async (
        args: string[],
        signal: AbortSignal,
        input?: string,
      ) => {
        void signal;
        void input;
        if (args[0] === "version") return "sbx version v0.49.0 unapproved";
        throw new Error("No further command allowed");
      };
      await expect(
        collectTeamInventory({
          config: f.config,
          study: f.study,
          plan: f.plan,
          implementationSha256: f.implementation,
          exec: wrapper,
          signal: new AbortController().signal,
          initiallyStopped: true,
        }),
      ).rejects.toThrow("version");
      const observation = await readFile(
        path.join(f.root, "isolation-observation.json"),
        "utf8",
      );
      expect(observation).toContain("synthetic");
    });
    it("keeps operator commands disabled without a code-owned registration", async () => {
      const f = await fixture(),
        stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true),
        stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      expect(await teamCli(["--help"])).toBe(0);
      expect(await teamCli(["--status"])).toBe(2);
      expect(
        await teamCli(["--execute", f.study.definition.protocol.studyId]),
      ).toBe(2);
      expect(await teamCli(["--execute", "/private/secret.json"])).toBe(1);
      expect(await teamCli(["--config", "/private/secret.json"])).toBe(1);
      expect(stdout.mock.calls.flat().join(" ")).toContain(
        '"execution":"BLOCKED"',
      );
      expect(stderr.mock.calls.flat().join(" ")).not.toContain("secret");
      expect(f.calls).toEqual([]);
    });
    it("packages exact trusted source without private policy, credentials or installation", async () => {
      const f = await fixture(),
        directory = path.join(f.parent, "team-source-bundle"),
        manifest = await prepareTeamRuntimeBundle(directory);
      expect(manifest).toMatchObject({
        execution: "NOT_RUN",
        installation: "NOT_INSTALLED",
        admission: "NOT_ADMITTED",
      });
      expect(manifest.baseManifestSha256).toBe(
        sha256(await readFile(path.join(directory, "manifest.json"))),
      );
      expect(manifest.files.map((f) => f.path)).toContain(
        "team/agent/team-supervisor.py",
      );
      expect(JSON.stringify(manifest)).not.toContain("publicKey");
      expect(JSON.stringify(manifest.files)).not.toContain("team-policy.json");
      await expect(prepareTeamRuntimeBundle(directory)).rejects.toThrow();
      expect(f.calls).toEqual([]);
    });
  },
);
