import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { jsonDigest } from "@/lib/report/digests";
import {
  runPairedTournament,
  pairedRuntimeSubject,
  sharedFutureTask,
  type PairedTransport,
  type Variant,
} from "../../scripts/experiments/tournament/paired";
import { studyFixture } from "../support/tournament-study";
import { syntheticEvaluation } from "../support/tournament-evidence";
import type { CandidateEnvelope } from "../../scripts/experiments/artifacts/files";
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  async function writable(directory: string): Promise<void> {
    await chmod(directory, 0o700);
    for (const entry of await readdir(directory, { withFileTypes: true }))
      if (entry.isDirectory()) await writable(path.join(directory, entry.name));
  }
  for (const root of roots.splice(0)) {
    await writable(root);
    // restore only synthetic sealed directories for removal
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture(order: "A_then_B" | "B_then_A" = "A_then_B") {
  const data = await studyFixture({ order });
  roots.push(data.parent);
  const evidenceRoot = path.join(data.parent, "evaluations"),
    protectedRoot = path.join(data.parent, "paired"),
    coordinationRoot = path.join(data.parent, "coordination");
  for (const root of [evidenceRoot, protectedRoot, coordinationRoot])
    await mkdir(root, { mode: 0o700 });
  const implementation = "a".repeat(64),
    studyId = data.study.draft.plan.manifest.id;
  const runtimeAuthorizations = new Map<Variant, unknown>();
  for (const variant of ["A", "B"] as const)
    runtimeAuthorizations.set(
      variant,
      await data.hold({
        id: `runtime-${variant}`,
        studyId,
        kind: "runtime",
        subjectSha256: pairedRuntimeSubject(
          data.study,
          implementation,
          variant,
        ),
        predecessorSha256: data.study.prepared.sha256,
        heldAt: "2026-10-28T12:05:30.000Z",
      }),
    );
  const baselines = new Map<Variant, unknown>();
  for (const variant of ["A", "B"] as const)
    baselines.set(
      variant,
      (
        await syntheticEvaluation({
          root: evidenceRoot,
          workspace: data.workspace,
          identity: {
            runId: `baseline-${variant}`,
            evaluatedTreeSha256: data.study.draft.plan.manifest.arms.find(
              (a) => a.variant === variant,
            )!.initialTreeSha256,
            fixtureSha256: data.study.draft.plan.manifest.fixtureSha256,
            ...data.study.draft.plan.baselineOracle,
          },
          startedAt: "2026-10-28T12:04:00.000Z",
          finishedAt: "2026-10-28T12:04:30.000Z",
        })
      ).loaded,
    );
  const events: string[] = [],
    payloads: unknown[] = [];
  let envelope: CandidateEnvelope;
  const transport: PairedTransport = {
    kind: "synthetic-development",
    baseline: vi.fn(async (variant) => {
      events.push(`baseline-${variant}`);
      return baselines.get(variant);
    }),
    admit: vi.fn(async (variant, _subject, lease) => {
      await lease.assertOwned();
      events.push(`admit-${variant}`);
    }),
    prepare: vi.fn(async (runId, source, shared) => {
      events.push(`prepare-${runId}`);
      payloads.push(shared);
      envelope = structuredClone(source);
      envelope.files.find((f) => f.path === "src/service.ts")!.base64 =
        Buffer.from("// inert downstream bytes, never imported").toString(
          "base64",
        );
    }),
    agent: vi.fn(async (runId) => {
      events.push(`agent-${runId}`);
      return {
        exitCode: 0,
        signal: null,
        reason: "completed" as const,
        stdout: "private synthetic trace",
        stderr: "",
        elapsedMs: 1,
      };
    }),
    finalizeAgent: vi.fn(async (runId) => {
      events.push(`finalize-${runId}`);
      return {
        runId,
        candidate: envelope,
        candidateSha256: jsonDigest(envelope),
        terminationConfirmed: true,
        restartAbsenceConfirmed: true,
        exportWithoutGuestExecution: true,
      };
    }),
    grade: vi.fn(async (input) => {
      events.push(`grade-${input.runId}`);
      return {
        exitCode: 0,
        signal: null,
        reason: "completed" as const,
        stdout: JSON.stringify({
          schemaVersion: "booking-grade-observation.v1",
          runId: input.runId,
          evaluatedTreeSha256: input.evaluatedTreeSha256,
          evaluatorSha256: input.evaluatorSha256,
          testSuiteSha256: input.testSuiteSha256,
          requiredPolicySha256: input.requiredPolicySha256,
          evaluationProfile: input.evaluationProfile,
          checks: data.study.draft.plan.futureOracle.requiredCheckIds.map(
            (id) => ({
              id,
              status: "pass",
              exitCode: 0,
              detail: "Synthetic protected observation only",
            }),
          ),
        }),
        stderr: "",
        elapsedMs: 1,
      };
    }),
    cleanup: vi.fn(async (runId) => {
      events.push(`cleanup-${runId}`);
    }),
  };
  const input = {
    study: data.study,
    transport,
    protectedRoot,
    coordinationRoot,
    sources: data.sources,
    runtimeAuthorizations,
    reloadRuntimeAuthorization: async (variant: Variant) =>
      runtimeAuthorizations.get(variant),
    reloadStudy: async () => data.study,
    implementationIdentity: async () => implementation,
    signal: new AbortController().signal,
    syntheticNow: () => "2026-10-28T12:06:00.000Z",
  };
  return {
    ...data,
    input,
    transport,
    events,
    payloads,
    baselines,
    protectedRoot,
    coordinationRoot,
  };
}
describe("paired tournament sequential no-inference lifecycle", () => {
  it.each(["A_then_B", "B_then_A"] as const)(
    "follows frozen order %s, seals before grading and withholds opposing outcomes",
    async (order) => {
      const f = await fixture(order),
        out = await runPairedTournament(f.input);
      expect(out.blockers).toEqual([]);
      expect(out.attempts.map((a) => a.variant)).toEqual(
        order === "A_then_B" ? ["A", "B"] : ["B", "A"],
      );
      expect(out).toMatchObject({
        execution: "NOT_RUN",
        kind: "synthetic_no_inference_paired_lifecycle",
        cleanupConfirmed: true,
        leaseReleased: true,
      });
      expect(f.payloads[0]).toEqual(f.payloads[1]);
      expect(f.payloads[0]).toEqual(sharedFutureTask(f.study));
      expect(JSON.stringify(f.payloads)).not.toContain(
        "private synthetic trace",
      );
      for (const attempt of out.attempts) {
        expect(attempt.run.status).toBe("completed");
        expect(attempt.run.evidenceOrigin).toBe("none");
        expect(attempt.run.metrics.tokens).toBeNull();
        expect(attempt.run.receiptId).toBeNull();
        expect(attempt.grade?.checks).toHaveLength(8);
        expect(f.events.indexOf(`finalize-${attempt.run.id}`)).toBeLessThan(
          f.events.indexOf(`grade-${attempt.run.id}`),
        );
      }
      const first = out.attempts[0]!,
        second = out.attempts[1]!;
      expect(f.events.indexOf(`cleanup-${first.run.id}`)).toBeLessThan(
        f.events.indexOf(`admit-${second.variant}`),
      );
      expect(
        await readFile(
          path.join(f.protectedRoot, `paired-${out.studyId}`, "outcome.json"),
          "utf8",
        ),
      ).not.toContain("private synthetic trace");
    },
  );
  it.each(["missing", "forged", "rejected"])(
    "refuses both future attempts for %s baseline",
    async (defect) => {
      const f = await fixture();
      const baseline = f.baselines.get("B") as object;
      f.baselines.set(
        "B",
        defect === "missing"
          ? null
          : defect === "forged"
            ? structuredClone(baseline)
            : { ...baseline, verification: { verdict: "REJECTED" } },
      );
      const out = await runPairedTournament(f.input);
      expect(out.attempts).toHaveLength(0);
      expect(f.transport.agent).not.toHaveBeenCalled();
      expect(out.blockers.length).toBeGreaterThan(0);
      expect(out.leaseReleased).toBe(true);
    },
  );
  it("requires both exact authorities before either attempt", async () => {
    const f = await fixture();
    f.input.runtimeAuthorizations.delete("B");
    const out = await runPairedTournament(f.input);
    expect(out.attempts).toHaveLength(0);
    expect(f.transport.agent).not.toHaveBeenCalled();
  });
  it.each(["failed-agent", "timeout", "termination", "candidate", "grader"])(
    "retains %s and never substitutes check success for completion",
    async (defect) => {
      const f = await fixture();
      if (defect === "failed-agent")
        vi.mocked(f.transport.agent).mockResolvedValueOnce({
          exitCode: 2,
          signal: null,
          reason: "completed" as const,
          stdout: "",
          stderr: "",
          elapsedMs: 1,
        });
      if (defect === "timeout")
        vi.mocked(f.transport.agent).mockResolvedValueOnce({
          exitCode: null,
          signal: null,
          reason: "timed_out",
          stdout: "",
          stderr: "",
          elapsedMs: 1,
        });
      if (defect === "termination")
        vi.mocked(f.transport.finalizeAgent).mockImplementationOnce(
          async (runId) => ({
            runId,
            terminationConfirmed: false,
            restartAbsenceConfirmed: false,
            exportWithoutGuestExecution: false,
            candidate: {},
            candidateSha256: "a".repeat(64),
          }),
        );
      if (defect === "candidate")
        vi.mocked(f.transport.finalizeAgent).mockImplementationOnce(
          async (runId) => {
            const candidate = {
              runId,
              files: [
                {
                  path: "package-lock.json",
                  base64: Buffer.from("changed").toString("base64"),
                },
              ],
            };
            return {
              runId,
              terminationConfirmed: true,
              restartAbsenceConfirmed: true,
              exportWithoutGuestExecution: true,
              candidate,
              candidateSha256: jsonDigest(candidate),
            };
          },
        );
      if (defect === "grader")
        vi.mocked(f.transport.grade).mockResolvedValueOnce({
          exitCode: 0,
          reason: "completed" as const,
          signal: null,
          stdout: "{}",
          stderr: "",
          elapsedMs: 1,
        });
      const out = await runPairedTournament(f.input);
      expect(out.attempts).toHaveLength(2);
      expect(out.attempts[0]!.run.status).toBe(
        defect === "timeout" ? "timed_out" : "failed",
      );
      expect(out.attempts[1]!.run.status).toBe("completed");
      expect(f.transport.agent).toHaveBeenCalledTimes(2);
      if (defect !== "failed-agent") expect(out.attempts[0]!.grade).toBeNull();
      else expect(out.attempts[0]!.grade?.checks).toHaveLength(8);
    },
  );
  it("halts before B and retains lease when cleanup is uncertain", async () => {
    const f = await fixture();
    const original = f.transport.cleanup;
    let count = 0;
    f.transport.cleanup = vi.fn(async (id) => {
      count++;
      if (count >= 3) throw new Error("Synthetic cleanup denied");
      await original(id);
    });
    const out = await runPairedTournament(f.input);
    expect(out.attempts).toHaveLength(1);
    expect(out.leaseReleased).toBe(false);
    expect(out.cleanupConfirmed).toBe(false);
    expect(out.attempts[0]!.run.status).toBe("blocked");
    expect(f.transport.agent).toHaveBeenCalledTimes(1);
  });
  it("refuses drift, cancellation, duplicate study and reused run IDs without retrying", async () => {
    const f = await fixture();
    f.input.implementationIdentity = async () => "b".repeat(64);
    let changed = false;
    f.input.reloadStudy = async () => {
      if (changed) throw new Error("revoked");
      return f.study;
    };
    const prepare = f.transport.prepare;
    f.transport.prepare = vi.fn<PairedTransport["prepare"]>(async (...args) => {
      await prepare(...args);
      changed = true;
    });
    const out = await runPairedTournament(f.input);
    expect(out.attempts.every((a) => a.run.status !== "completed")).toBe(true);
    expect(f.transport.agent).not.toHaveBeenCalled();
    await expect(runPairedTournament(f.input)).rejects.toThrow();
    const cancelled = await fixture();
    cancelled.input.signal = AbortSignal.abort();
    expect((await runPairedTournament(cancelled.input)).attempts).toHaveLength(
      0,
    );
  });
  it("cannot self-admit a live transport through structural flags", async () => {
    const f = await fixture();
    f.transport.kind = "supervised-team";
    Object.assign(f.transport, { admitted: true });
    const out = await runPairedTournament(f.input);
    expect(out.kind).toBe("blocked_paired_execution");
    expect(out.execution).toBe("BLOCKED");
    expect(f.events).toEqual([]);
  });
  it("rejects original source substitution before any runtime action", async () => {
    const f = await fixture();
    await chmod(path.join(f.sources.B, "src/service.ts"), 0o600);
    await writeFile(
      path.join(f.sources.B, "src/service.ts"),
      "// substituted inert bytes",
    );
    const out = await runPairedTournament(f.input);
    expect(out.attempts).toHaveLength(0);
    expect(f.events).toEqual([]);
  });
});
