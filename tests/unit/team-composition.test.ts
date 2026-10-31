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
    it("refuses malformed trusted broker-stop metadata instead of deriving it from native stdout", async () => {
      const f = await fixture(),
        original = f.deps.run;
      vi.spyOn(f.deps, "run").mockImplementation(async (exe, args, options) => {
        const result = await original(exe, args, options);
        if (options.input?.includes('"operation":"status"')) {
          const value = JSON.parse(result.stdout);
          if (value.stage === "terminated") {
            value.brokerStop = {
              reasonCode: "request-count",
              requestCount: 101,
              refusalSha256: "a".repeat(64),
            };
            return { ...result, stdout: JSON.stringify(value) };
          }
        }
        return result;
      });
      const outcome = await runPairedTournament(f.input);
      expect(outcome.attempts).toHaveLength(2);
      expect(
        outcome.attempts.every(
          (a) => !a.finalizationConfirmed && a.cleanupConfirmed,
        ),
      ).toBe(true);
    });
    it("uses the separately admitted grader image and explicit trusted root for protected operations", async () => {
      const f = await compositionFixture({
        graderWorkerImage: `sha256:${"6".repeat(64)}`,
      });
      roots.push(f.parent);
      const out = await runPairedTournament(f.input);
      expect(out.blockers).toEqual([]);
      expect(out.attempts).toHaveLength(2);
      const protectedCalls = f.calls.filter((c) =>
        c.args.some((a) =>
          /(?:guest\.ts|team-profile-inventory\.ts|lifecycle\.mjs)$/.test(a),
        ),
      );
      expect(protectedCalls.length).toBeGreaterThan(4);
      for (const call of protectedCalls) {
        expect(call.args[call.args.indexOf("-u") + 1]).toBe("root");
        if (call.args.some((a) => a.endsWith("guest.ts")))
          expect(JSON.parse(call.input!).workerImage).toBe(
            f.config.graderWorkerImage,
          );
      }
      const images = f.calls.filter(
        (c) => c.args.includes("image") && c.args.includes("inspect"),
      );
      for (const call of images)
        expect(call.args.at(-1)).toBe(
          call.args.includes(f.config.agentSandbox)
            ? f.plan.runtime.workerImage
            : f.config.graderWorkerImage,
        );
      expect(f.config.graderWorkerImage).not.toBe(f.plan.runtime.workerImage);
      expect(out.execution).toBe("NOT_RUN");
    });
    it("rejects substitution of the coding image for the protected grader image before launch", async () => {
      const f = await compositionFixture({
        graderWorkerImage: `sha256:${"6".repeat(64)}`,
      });
      roots.push(f.parent);
      const original = f.deps.run;
      f.deps.run = async (...args) => {
        const result = await original(...args);
        if (
          args[1].includes(f.config.graderSandbox) &&
          args[1].includes("image") &&
          args[1].includes("inspect")
        ) {
          const rows = JSON.parse(result.stdout);
          rows[0].Id = f.plan.runtime.workerImage;
          return { ...result, stdout: JSON.stringify(rows) };
        }
        return result;
      };
      const out = await runPairedTournament(f.input);
      expect(out.attempts).toHaveLength(0);
      expect(
        f.calls.some((c) => c.input?.includes('"operation":"start"')),
      ).toBe(false);
    });
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
    it.each(["BLOCKED", "NOT_CHECKED"] as const)(
      "archives %s public candidates without presenting successful native exit as readiness",
      async (status) => {
        const f = await fixture(),
          original = f.deps.run;
        vi.spyOn(f.deps, "run").mockImplementation(
          async (exe, args, options) => {
            const result = await original(exe, args, options);
            if (options.input?.includes('"operation":"finalize"')) {
              const value = JSON.parse(result.stdout);
              value.publicReadiness = {
                status,
                reason:
                  status === "BLOCKED"
                    ? "public-checks-failed-or-interrupted"
                    : "deadline",
                candidateSha256: value.candidateSha256,
              };
              return { ...result, stdout: JSON.stringify(value) };
            }
            return result;
          },
        );
        const out = await runPairedTournament(f.input);
        for (const attempt of out.attempts) {
          expect(attempt.finalizationConfirmed).toBe(true);
          expect(attempt.candidateTreeSha256).toMatch(/^[a-f0-9]{64}$/);
          expect(attempt.publicReadiness?.status).toBe(status);
          expect(attempt.run.status).toBe("failed");
          expect(attempt.cleanupConfirmed).toBe(true);
          // Protected observations stay distinct even if their synthetic checks pass.
          expect(attempt.grade?.checks).toHaveLength(8);
        }
      },
    );
    it("rejects public readiness attached to a different source", async () => {
      const f = await fixture(),
        original = f.deps.run;
      vi.spyOn(f.deps, "run").mockImplementation(async (exe, args, options) => {
        const result = await original(exe, args, options);
        if (options.input?.includes('"operation":"finalize"')) {
          const value = JSON.parse(result.stdout);
          value.publicReadiness.candidateSha256 = "0".repeat(64);
          return { ...result, stdout: JSON.stringify(value) };
        }
        return result;
      });
      const out = await runPairedTournament(f.input);
      expect(
        out.attempts.every(
          (a) => !a.finalizationConfirmed && a.cleanupConfirmed,
        ),
      ).toBe(true);
    });
    it("retains safe command and lifecycle failures before cleanup without retrying a worker", async () => {
      const f = await fixture(),
        original = f.deps.run;
      let started = false,
        injected = false;
      vi.spyOn(f.deps, "run").mockImplementation(async (exe, args, options) => {
        const body = options.input?.startsWith("{")
          ? JSON.parse(options.input)
          : null;
        if (
          args.includes("/opt/forecode-agent/team-supervisor.py") &&
          body?.operation === "start"
        )
          started = true;
        if (started && !injected && body?.operation === "status") {
          injected = true;
          return {
            reason: "timed_out",
            exitCode: null,
            signal: "SIGKILL",
            stdout: "SECRET-RAW-OUTPUT",
            stderr: "SECRET-TRANSPORT-ERROR",
            elapsedMs: 30001,
          };
        }
        return original(exe, args, options);
      });
      const out = await runPairedTournament(f.input);
      expect(injected).toBe(true);
      expect(out.attempts[0]).toMatchObject({
        finalizationConfirmed: false,
        cleanupConfirmed: true,
      });
      expect(out.cleanupConfirmed).toBe(true);
      expect(out.leaseReleased).toBe(true);
      const dir = path.join(f.config.runtimeOriginalRoot, "control-failures"),
        files = await readdir(dir);
      expect(files.length).toBeGreaterThanOrEqual(2);
      const diagnostics = await Promise.all(
        files.map((name) => readFile(path.join(dir, name), "utf8")),
      );
      expect(diagnostics.join(" ")).not.toContain("SECRET");
      expect(diagnostics.map((text) => JSON.parse(text).stage)).toContain(
        "agent-lifecycle",
      );
      expect(
        diagnostics.some((text) =>
          JSON.parse(text).recentObservations.some(
            (o: { reason: string }) => o.reason === "timed_out",
          ),
        ),
      ).toBe(true);
      const starts = f.calls.filter((c) =>
        c.input?.includes('"operation":"start"'),
      );
      expect(starts).toHaveLength(2); // Exactly one per arm, no restart of A.
    });
    it.each(["prepare", "finalize", "cleanup"])(
      "retains terminal %s failures with original and cleanup errors kept separately",
      async (operation) => {
        const f = await fixture(),
          original = f.deps.run;
        let injected = false;
        vi.spyOn(f.deps, "run").mockImplementation(
          async (exe, args, options) => {
            const body = options.input?.startsWith("{")
              ? JSON.parse(options.input)
              : null;
            if (!injected && body?.operation === operation) {
              injected = true;
              throw new TypeError("SECRET-PRIMARY");
            }
            return original(exe, args, options);
          },
        );
        const out = await runPairedTournament(f.input);
        expect(injected).toBe(true);
        expect(
          out.attempts[0]?.failure !== null || operation === "cleanup",
        ).toBe(true);
        const dir = path.join(f.config.runtimeOriginalRoot, "control-failures");
        const records = await Promise.all(
          (await readdir(dir)).map(async (name) =>
            JSON.parse(await readFile(path.join(dir, name), "utf8")),
          ),
        );
        expect(
          records.some(
            (r) =>
              r.stage ===
                (operation === "cleanup"
                  ? "cleanup"
                  : operation === "prepare"
                    ? "preparation"
                    : "finalization") && r.runId === out.attempts[0]?.run.id,
          ),
        ).toBe(true);
        expect(JSON.stringify(records)).not.toContain("SECRET");
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
        const retained = await readdir(f.config.runtimeOriginalRoot);
        expect(retained.filter((name) => name !== "control-failures")).toEqual(
          [],
        );
        if (retained.includes("control-failures")) {
          for (const name of await readdir(
            path.join(f.config.runtimeOriginalRoot, "control-failures"),
          )) {
            const diagnostic = JSON.parse(
              await readFile(
                path.join(
                  f.config.runtimeOriginalRoot,
                  "control-failures",
                  name,
                ),
                "utf8",
              ),
            );
            expect(diagnostic.origin).toBe("synthetic_no_inference");
          }
        }
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
    it.each(["missing", "changed"])(
      "refuses a %s public boundary helper before either arm starts",
      async (defect) => {
        const f = await fixture();
        const name = "/opt/forecode-agent/team-public-boundary.mjs";
        if (defect === "missing") delete f.agentFiles[name];
        else f.agentFiles[name] = "0".repeat(64);
        const out = await runPairedTournament(f.input);
        expect(out.attempts).toHaveLength(0);
        expect(
          f.calls.some((call) => call.input?.includes('"operation":"start"')),
        ).toBe(false);
      },
    );
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
      expect(manifest.files.map((f) => f.path)).toContain(
        "team/agent/team-public-boundary.mjs",
      );
      expect(JSON.stringify(manifest)).not.toContain("publicKey");
      expect(JSON.stringify(manifest.files)).not.toContain("team-policy.json");
      await expect(prepareTeamRuntimeBundle(directory)).rejects.toThrow();
      expect(f.calls).toEqual([]);
    });
  },
);
