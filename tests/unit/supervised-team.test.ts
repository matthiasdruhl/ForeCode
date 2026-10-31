import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { jsonDigest, sha256 } from "@/lib/report/digests";
import { studyFixture } from "../support/tournament-study";
import { syntheticEvaluation } from "../support/tournament-evidence";
import {
  pairedRuntimeSubject,
  runPairedTournament,
  sharedFutureTask,
  type Variant,
} from "../../scripts/experiments/tournament/paired";
import {
  createNoInferenceTeamTransport,
  createSupervisedTeamTransport,
  isAdmittedSupervisedTeamTransport,
  supervisedTeamRuntimeSubject,
  TeamInventorySchema,
  type NoInferenceTeamControls,
} from "../../scripts/experiments/tournament/supervised-team";
import {
  teamAgentId,
  teamCredentialPolicy,
  teamEnforcementPlan,
  teamNetworkPolicy,
  teamRoadmapDigest,
} from "../../scripts/experiments/tournament/team-policy";
import type { StudyDefinition } from "../../scripts/experiments/tournament/study";
import {
  captureReviewedTree,
  type CandidateEnvelope,
} from "../../scripts/experiments/artifacts/files";
import { isTrustedAgentFinalization } from "../../scripts/experiments/runner/sbx";
import type { HeldRecord } from "../../scripts/experiments/tournament/custody";
import { isTrustedEvaluation } from "../../src/server/artifacts/evaluation-store";

const roots: string[] = [];
afterEach(async () => {
  async function writable(root: string): Promise<void> {
    await chmod(root, 0o700);
    for (const entry of await readdir(root, { withFileTypes: true }))
      if (entry.isDirectory()) await writable(path.join(root, entry.name));
  }
  for (const root of roots.splice(0)) {
    await writable(root);
    await rm(root, { recursive: true, force: true });
  }
});
function supported(d: StudyDefinition) {
  for (const c of d.protocol.conditions) {
    c.seed = null;
    c.budget.maxIterations = 3;
    c.budget.tokenLimit = 100000;
    c.networkPolicySha256 = jsonDigest(teamNetworkPolicy);
    c.credentialPolicySha256 = jsonDigest(teamCredentialPolicy);
    c.visibleRoadmapSha256 = teamRoadmapDigest(d);
  }
  for (const e of d.protocol.executionConditions) e.agentId = teamAgentId;
}
async function fixture() {
  const f = await studyFixture({
    configure(d, draft) {
      supported(d);
      draft.plan.conditions = structuredClone(d.protocol.conditions);
      draft.executionConditions = structuredClone(
        d.protocol.executionConditions,
      );
      draft.plan.manifest.budget = structuredClone(
        d.protocol.conditions[0]!.budget,
      );
      draft.plan.visibleRoadmapSha256 =
        d.protocol.conditions[0]!.visibleRoadmapSha256;
    },
  });
  roots.push(f.parent);
  const plan = teamEnforcementPlan(f.study.definition),
    implementation = "a".repeat(64);
  const inventory = TeamInventorySchema.parse({
    schemaVersion: "supervised-team-inventory.local.v1",
    implementationSha256: implementation,
    enforcementSha256: jsonDigest(plan),
    agentInstance: "synthetic-agent-vm",
    graderInstance: "synthetic-grader-vm",
    runtime: plan.runtime,
    agentConfigSha256: plan.agentConfigSha256,
    workerSha256: "b".repeat(64),
    sandboxCliSha256: "c".repeat(64),
    protectedInstallationSha256: "d".repeat(64),
    isolationObservationSha256: "e".repeat(64),
    provider: { inputMicroUsdPerToken: 1, outputMicroUsdPerToken: 1 },
    vm: plan.vm,
    hostIntegrations: "disabled",
    workerNetwork: "none",
    workerCredentials: "absent",
    restart: "no",
  });
  const auth = new Map<Variant, unknown>(),
    teamAuth = new Map<Variant, unknown>();
  for (const variant of ["A", "B"] as const) {
    const paired = (await f.hold({
      id: `runtime-${variant}`,
      studyId: f.study.definition.protocol.studyId,
      kind: "runtime",
      subjectSha256: pairedRuntimeSubject(f.study, implementation, variant),
      predecessorSha256: f.study.prepared.sha256,
      heldAt: "2026-10-28T12:05:30.000Z",
    }))!;
    auth.set(variant, paired);
    teamAuth.set(
      variant,
      await f.hold({
        id: `installed-${variant}`,
        studyId: f.study.definition.protocol.studyId,
        kind: "runtime",
        subjectSha256: supervisedTeamRuntimeSubject({
          study: f.study,
          variant,
          implementationSha256: implementation,
          inventorySha256: jsonDigest(inventory),
          pairedAuthorizationSha256: paired.sha256,
          provider: inventory.provider,
        }),
        predecessorSha256: paired.sha256,
        heldAt: "2026-10-28T12:05:30.000Z",
      }),
    );
  }
  const root = path.join(f.parent, "baseline-evidence"),
    protectedRoot = path.join(f.parent, "paired"),
    coordinationRoot = path.join(f.parent, "coordination");
  for (const directory of [root, protectedRoot, coordinationRoot])
    await mkdir(directory, { mode: 0o700 });
  const baselines = new Map<Variant, unknown>();
  for (const variant of ["A", "B"] as const)
    baselines.set(
      variant,
      (
        await syntheticEvaluation({
          root,
          workspace: f.workspace,
          identity: {
            runId: `baseline-${variant}`,
            evaluatedTreeSha256: f.study.draft.plan.manifest.arms.find(
              (a) => a.variant === variant,
            )!.initialTreeSha256,
            fixtureSha256: plan.profile.fixtureSha256,
            ...f.study.draft.plan.baselineOracle,
          },
          startedAt: "2026-10-28T12:04:00.000Z",
          finishedAt: "2026-10-28T12:04:30.000Z",
        })
      ).loaded,
    );
  type Request = Parameters<NoInferenceTeamControls["prepare"]>[0];
  const requests: Request[] = [],
    candidates = new Map<string, CandidateEnvelope>();
  const events: string[] = [];
  const resultIdentity = (runId: string, nonce: string) => ({
    runId,
    nonce,
    bootId: "synthetic-boot",
    containerId: "f".repeat(64),
    requestSha256: jsonDigest(requests.find((r) => r.runId === runId)!),
  });
  const controls: NoInferenceTeamControls = {
    inspect: vi.fn<NoInferenceTeamControls["inspect"]>(async () =>
      structuredClone(inventory),
    ),
    loadBaseline: vi.fn<NoInferenceTeamControls["loadBaseline"]>(async (v) => {
      events.push(`baseline-${v}`);
      return baselines.get(v);
    }),
    prepare: vi.fn<NoInferenceTeamControls["prepare"]>(async (r) => {
      events.push(`prepare-${r.variant}`);
      requests.push(r);
      const candidate = structuredClone(r.candidate);
      candidate.files.find((f) => f.path === "src/service.ts")!.base64 =
        Buffer.from("// inert future source, never imported").toString(
          "base64",
        );
      candidates.set(r.runId, candidate);
      return {
        runId: r.runId,
        nonce: r.nonce,
        stage: "prepared",
        requestSha256: jsonDigest(r),
      };
    }),
    agent: vi.fn<NoInferenceTeamControls["agent"]>(async (runId, nonce) => {
      events.push(`agent-${runId}`);
      return {
        ...resultIdentity(runId, nonce),
        terminationConfirmed: true,
        restartAbsenceConfirmed: true,
        process: {
          reason: "completed",
          exitCode: 0,
          signal: null,
          elapsedMs: 1,
          stdout: "inert diagnostic",
          stderr: "",
        },
      };
    }),
    finalize: vi.fn<NoInferenceTeamControls["finalize"]>(
      async (runId, nonce) => {
        events.push(`seal-${runId}`);
        return {
          ...resultIdentity(runId, nonce),
          stage: "sealed",
          publicReadiness: {
            status: "READY",
            reason: "public-checks-passed",
            candidateSha256: jsonDigest(candidates.get(runId)),
            outputSha256: "a".repeat(64),
          },
          candidate: candidates.get(runId),
          candidateSha256: jsonDigest(candidates.get(runId)),
          terminationConfirmed: true,
          restartAbsenceConfirmed: true,
          exportWithoutGuestExecution: true,
        };
      },
    ),
    grade: vi.fn<NoInferenceTeamControls["grade"]>(async (input) => {
      events.push(`grade-${input.runId}`);
      return {
        reason: "completed",
        exitCode: 0,
        signal: null,
        elapsedMs: 1,
        stderr: "",
        stdout: JSON.stringify({
          schemaVersion: "booking-grade-observation.v1",
          runId: input.runId,
          evaluatedTreeSha256: input.evaluatedTreeSha256,
          evaluatorSha256: input.evaluatorSha256,
          testSuiteSha256: input.testSuiteSha256,
          requiredPolicySha256: input.requiredPolicySha256,
          evaluationProfile: input.evaluationProfile,
          checks: f.study.draft.plan.futureOracle.requiredCheckIds.map(
            (id) => ({ id, status: "pass", exitCode: 0, detail: "synthetic" }),
          ),
        }),
      };
    }),
    cleanup: vi.fn<NoInferenceTeamControls["cleanup"]>(
      async (runId, nonce, signal) => {
        expect(signal.aborted).toBe(false);
        events.push(`cleanup-${runId}`);
        return { runId, nonce, absent: true, restartAbsenceConfirmed: true };
      },
    ),
  };
  const settings = {
    study: f.study,
    implementationSha256: implementation,
    inventorySha256: jsonDigest(inventory),
    controls,
    now: () => "2026-10-28T12:06:00.000Z",
    reloadStudy: async () => f.study,
    implementationIdentity: async () => implementation,
    reloadRuntimeAuthorization: async (v: Variant) => auth.get(v),
    reloadTeamAuthorization: async (v: Variant) => teamAuth.get(v),
  };
  const transport = createNoInferenceTeamTransport(settings);
  const input = {
    study: f.study,
    transport,
    protectedRoot,
    coordinationRoot,
    sources: f.sources,
    reloadStudy: settings.reloadStudy,
    reloadRuntimeAuthorization: settings.reloadRuntimeAuthorization,
    implementationIdentity: settings.implementationIdentity,
    signal: new AbortController().signal,
    syntheticNow: settings.now,
  };
  return {
    ...f,
    plan,
    inventory,
    auth,
    teamAuth,
    controls,
    settings,
    transport,
    input,
    events,
    requests,
    candidates,
    baselines,
  };
}

async function startFirst(f: Awaited<ReturnType<typeof fixture>>) {
  const signal = new AbortController().signal;
  for (const v of ["A", "B"] as const)
    await f.transport.baseline(
      v,
      f.study.draft.plan.manifest.arms.find((a) => a.variant === v)!
        .initialTreeSha256,
      signal,
    );
  await f.transport.admit(
    "A",
    pairedRuntimeSubject(f.study, f.settings.implementationSha256, "A"),
    { assertOwned: async () => {} },
    signal,
  );
  const runId = f.study.draft.plan.manifest.arms[0]!.runId!;
  return {
    runId,
    signal,
    source: await captureReviewedTree(f.sources.A, runId),
    shared: sharedFutureTask(f.study),
  };
}

describe("dedicated supervised team contract, no inference", () => {
  it("maps exact complete input, both baselines, sealed trees and eight checks through the paired controller", async () => {
    const f = await fixture(),
      out = await runPairedTournament(f.input);
    expect(out.blockers).toEqual([]);
    expect(out.attempts).toHaveLength(2);
    expect(out.execution).toBe("NOT_RUN");
    expect(out.cleanupConfirmed).toBe(true);
    expect(f.events.slice(0, 3)).toEqual([
      "baseline-A",
      "baseline-B",
      "prepare-A",
    ]);
    expect(f.requests[0]!.enforcement).toEqual(f.requests[1]!.enforcement);
    expect(JSON.parse(f.plan.prompt)).toEqual({
      task: f.study.definition.protocol.task,
      prompt: f.study.definition.downstreamPrompt,
      adapterInstructions: f.study.definition.adapterInstructions,
      scenario: {
        request: f.study.definition.protocol.scenario.request,
        assumptions: f.study.definition.protocol.scenario.assumptions,
        acceptanceIds: f.study.definition.protocol.scenario.acceptanceIds,
      },
    });
    for (const [i, attempt] of out.attempts.entries()) {
      expect(f.requests[i]!.runId).toBe(attempt.run.id);
      expect(f.requests[i]!.sourceCommit).toBe(attempt.run.repoCommit);
      expect(attempt.grade?.checks).toHaveLength(8);
      expect(attempt.run.evidenceOrigin).toBe("none");
      expect(attempt.run.receiptId).toBeNull();
      expect(attempt.run.metrics.costUsd).toBeNull();
      expect(f.events.indexOf(`seal-${attempt.run.id}`)).toBeLessThan(
        f.events.indexOf(`grade-${attempt.run.id}`),
      );
    }
    expect(f.events.indexOf(`cleanup-${out.attempts[0]!.run.id}`)).toBeLessThan(
      f.events.indexOf("prepare-B"),
    );
    expect(isAdmittedSupervisedTeamTransport(f.transport)).toBe(false);
    expect(() =>
      Object.assign(f.transport, { kind: "supervised-team", admitted: true }),
    ).toThrow();
  });
  it("has a fail-closed production entry with no injection or self-registration", async () => {
    const f = await fixture();
    const transport = await createSupervisedTeamTransport(f.study);
    expect(isAdmittedSupervisedTeamTransport(transport)).toBe(false);
    const out = await runPairedTournament({ ...f.input, transport });
    expect(out.execution).toBe("BLOCKED");
    expect(out.attempts).toEqual([]);
    expect(f.controls.inspect).not.toHaveBeenCalled();
    await expect(
      transport.agent(
        f.study.draft.plan.manifest.arms[0]!.runId!,
        new AbortController().signal,
      ),
    ).rejects.toThrow("COMPOSITION");
  });
  it("admits explicitly committed larger reasoning/output and replay reservations", async () => {
    const f = await fixture();
    const definition = structuredClone(f.study.definition);
    for (const condition of definition.protocol.conditions) {
      condition.budget.tokenLimit = 32_000_000;
      condition.budget.spendUsd = 32;
    }
    definition.restrictions.maxOutputTokens = 32768;
    const plan = teamEnforcementPlan(definition);
    expect(plan.tokenLimit).toBe(32_000_000);
    expect(plan.nativeRolloutTokenLimit).toBe(1_000_000);
    expect(plan.spendMicroUsd).toBe(32_000_000);
    expect(plan.restrictions.maxOutputTokens).toBe(32768);
  });
  it.each([
    "seed",
    "iteration",
    "agent",
    "tool",
    "cpu",
    "memory",
    "pids",
    "disk",
    "output",
    "network",
    "credentials",
    "roadmap",
    "token",
    "spend",
    "spend-cap",
    "precision",
    "provider-output",
    "timeout",
    "old-task",
    "unknown",
  ])("rejects unsupported committed %s before any control", async (defect) => {
    const f = await fixture(),
      d = structuredClone(f.study.definition),
      c = d.protocol.conditions[0]!,
      e = d.protocol.executionConditions[0]!;
    if (defect === "seed") c.seed = 1;
    if (defect === "iteration") c.budget.maxIterations = 0;
    if (defect === "agent") e.agentId = "smoke-agent";
    if (defect === "tool") {
      d.toolAllowlist = ["browser"];
      for (const c of d.protocol.conditions)
        c.toolAllowlistSha256 = jsonDigest(d.toolAllowlist);
    }
    if (defect === "cpu") e.resources.cpus = 2;
    if (defect === "memory") e.resources.memoryMiB = 769;
    if (defect === "pids") e.resources.pids = 129;
    if (defect === "disk") e.resources.diskMiB = 65537;
    if (defect === "output") e.resources.outputBytes = 8_000_001;
    if (defect === "network") c.networkPolicySha256 = "0".repeat(64);
    if (defect === "credentials") c.credentialPolicySha256 = "0".repeat(64);
    if (defect === "roadmap") c.visibleRoadmapSha256 = "0".repeat(64);
    if (defect === "token") c.budget.tokenLimit = 32_000_001;
    if (defect === "spend") c.budget.spendUsd = 0;
    if (defect === "spend-cap") c.budget.spendUsd = 40.000001;
    if (defect === "precision") c.budget.spendUsd = 0.0000001;
    if (defect === "provider-output") d.restrictions.maxOutputTokens = 32769;
    if (defect === "timeout") c.budget.maxSeconds = 601;
    if (defect === "old-task")
      Object.assign(d.protocol.task, { id: "booking-ownership-refactor-v1" });
    if (defect === "unknown") Object.assign(d.restrictions, { maxSteps: 3 });
    d.protocol.conditions[1] = { ...structuredClone(c), variant: "B" };
    d.protocol.executionConditions[1] = { ...structuredClone(e), variant: "B" };
    expect(() => teamEnforcementPlan(d)).toThrow();
    expect(f.controls.prepare).not.toHaveBeenCalled();
  });
  it.each([
    "missing",
    "serialized",
    "wrong-arm",
    "expired",
    "wrong-study",
    "revoked",
  ])(
    "requires both independently held installed admissions: %s",
    async (defect) => {
      const f = await fixture();
      if (defect === "missing" || defect === "revoked")
        f.teamAuth.set("B", null);
      if (defect === "serialized")
        f.teamAuth.set("B", structuredClone(f.teamAuth.get("B")));
      if (defect === "wrong-arm") f.teamAuth.set("B", f.teamAuth.get("A"));
      if (defect === "expired" || defect === "wrong-study")
        f.teamAuth.set(
          "B",
          await f.hold({
            id: "bad-original",
            studyId:
              defect === "wrong-study"
                ? "other-study"
                : f.study.definition.protocol.studyId,
            kind: "runtime",
            subjectSha256: (f.teamAuth.get("B") as HeldRecord).record
              .subjectSha256,
            predecessorSha256: (f.teamAuth.get("B") as HeldRecord).record
              .predecessorSha256,
            heldAt: "2026-10-28T12:05:30.000Z",
            expiresAt:
              defect === "expired"
                ? "2026-10-28T12:05:40.000Z"
                : "2026-10-29T12:00:00.000Z",
          }),
        );
      const out = await runPairedTournament(f.input);
      expect(out.attempts.every((a) => a.failure !== null)).toBe(true);
      expect(f.controls.prepare).not.toHaveBeenCalled();
      expect(f.controls.agent).not.toHaveBeenCalled();
    },
  );
  it.each(["A", "B"] as const)(
    "requires authentic verified baseline %s before either downstream control",
    async (v) => {
      const f = await fixture();
      f.baselines.set(v, structuredClone(f.baselines.get(v)));
      const out = await runPairedTournament(f.input);
      expect(out.attempts).toHaveLength(0);
      expect(f.controls.prepare).not.toHaveBeenCalled();
    },
  );
  it.each(["runtime", "tariff", "vm", "network", "instance", "implementation"])(
    "rejects stale or weaker inventory: %s",
    async (defect) => {
      const f = await fixture(),
        changed = structuredClone(f.inventory);
      if (defect === "runtime")
        changed.runtime.agentBinarySha256 = "0".repeat(64);
      if (defect === "tariff") changed.provider.outputMicroUsdPerToken++;
      if (defect === "vm") changed.vm.diskBytes++;
      if (defect === "network")
        Object.assign(changed, { workerNetwork: "host" });
      if (defect === "instance") changed.agentInstance = changed.graderInstance;
      if (defect === "implementation")
        changed.implementationSha256 = "0".repeat(64);
      vi.mocked(f.controls.inspect).mockResolvedValue(changed);
      const out = await runPairedTournament(f.input);
      expect(out.attempts).toHaveLength(0);
      expect(f.controls.agent).not.toHaveBeenCalled();
    },
  );
  it.each([
    "prepare",
    "termination",
    "output-flood",
    "elapsed",
    "nonce",
    "boot",
    "container",
    "candidate",
    "missing-check",
    "profile",
    "suite",
    "timeout",
    "cancel",
  ])("retains failure and never grades invalid %s evidence", async (defect) => {
    const f = await fixture();
    if (defect === "prepare")
      vi.mocked(f.controls.prepare).mockResolvedValueOnce({});
    if (
      ["termination", "nonce", "timeout", "output-flood", "elapsed"].includes(
        defect,
      )
    ) {
      const original = f.controls.agent;
      vi.mocked(f.controls.agent).mockImplementationOnce(async (...args) => {
        const r = (await original(...args)) as Record<string, unknown>;
        if (defect === "termination") r.terminationConfirmed = false;
        if (defect === "output-flood")
          Object.assign(r.process as object, {
            stdout: "x".repeat(f.plan.resources.outputBytes + 1),
          });
        if (defect === "elapsed")
          Object.assign(r.process as object, {
            elapsedMs: f.plan.maxSeconds * 1000 + 1,
          });
        if (defect === "nonce")
          r.nonce = "33333333-3333-4333-8333-333333333333";
        if (defect === "timeout")
          Object.assign(r.process as object, {
            reason: "timed_out",
            exitCode: null,
          });
        return r;
      });
    }
    if (["boot", "container", "candidate"].includes(defect)) {
      const original = f.controls.finalize;
      vi.mocked(f.controls.finalize).mockImplementationOnce(async (...args) => {
        const r = (await original(...args)) as Record<string, unknown>;
        if (defect === "boot") r.bootId = "different";
        if (defect === "container") r.containerId = "0".repeat(64);
        if (defect === "candidate") r.candidateSha256 = "0".repeat(64);
        return r;
      });
    }
    if (["missing-check", "profile", "suite"].includes(defect)) {
      const original = f.controls.grade;
      vi.mocked(f.controls.grade).mockImplementationOnce(async (...args) => {
        const r = await original(...args),
          report = JSON.parse(r.stdout);
        if (defect === "missing-check") report.checks.pop();
        if (defect === "profile") delete report.evaluationProfile;
        if (defect === "suite") report.testSuiteSha256 = "0".repeat(64);
        return { ...r, stdout: JSON.stringify(report) };
      });
    }
    if (defect === "cancel") f.input.signal = AbortSignal.abort();
    const out = await runPairedTournament(f.input);
    if (defect === "cancel") expect(out.attempts).toHaveLength(0);
    else {
      expect(out.attempts[0]!.failure).not.toBeNull();
      expect(out.attempts[0]!.grade).toBeNull();
    }
    expect(out.execution).toBe("NOT_RUN");
  });
  it("halts the second arm and retains the lease after uncertain cleanup", async () => {
    const f = await fixture();
    vi.mocked(f.controls.cleanup).mockRejectedValue(new Error("uncertain"));
    const out = await runPairedTournament(f.input);
    expect(out.attempts).toHaveLength(1);
    expect(out.cleanupConfirmed).toBe(false);
    expect(out.leaseReleased).toBe(false);
    expect(f.controls.agent).toHaveBeenCalledTimes(1);
  });
  it("binds run/source/task/model by exact subject and rejects reused studies", async () => {
    const f = await fixture(),
      out = await runPairedTournament(f.input);
    expect(out.attempts.every((a) => a.cleanupConfirmed)).toBe(true);
    await expect(runPairedTournament(f.input)).rejects.toThrow();
    const request = f.requests[0]!;
    for (const modified of [
      { ...request, runId: f.requests[1]!.runId },
      { ...request, sourceTreeSha256: "0".repeat(64) },
      { ...request, sharedTaskSha256: "0".repeat(64) },
      {
        ...request,
        enforcement: { ...request.enforcement, model: "gpt-5.6-sol" },
      },
    ])
      expect(jsonDigest(modified)).not.toBe(jsonDigest(request));
    expect(isTrustedAgentFinalization({ terminationConfirmed: true })).toBe(
      false,
    );
    expect(isTrustedEvaluation({ verdict: "VERIFIED" })).toBe(false);
  });
  it.each(["run", "source", "task", "model", "instructions"])(
    "rejects changed %s before source preparation",
    async (defect) => {
      const f = await fixture(),
        next = await startFirst(f),
        shared = structuredClone(next.shared);
      let runId = next.runId;
      if (defect === "run") runId = f.study.draft.plan.manifest.arms[1]!.runId!;
      if (defect === "source")
        next.source.files[0]!.base64 =
          Buffer.from("changed").toString("base64");
      if (defect === "task")
        Object.assign(shared.task, { id: "booking-ownership-refactor-v1" });
      if (defect === "model") shared.model = "muse-spark-1.3-contributor";
      if (defect === "instructions") shared.adapterInstructions += "different";
      await expect(
        f.transport.prepare(runId, next.source, shared, next.signal),
      ).rejects.toThrow();
      expect(f.controls.prepare).not.toHaveBeenCalled();
      await f.transport.cleanup(next.runId);
    },
  );
  it.each(["revocation", "inventory", "cancellation", "partial-prepare"])(
    "rejects launch after %s without retry",
    async (defect) => {
      const f = await fixture(),
        next = await startFirst(f);
      if (defect === "partial-prepare")
        vi.mocked(f.controls.prepare).mockResolvedValueOnce({});
      try {
        await f.transport.prepare(
          next.runId,
          next.source,
          next.shared,
          next.signal,
        );
      } catch {
        expect(defect).toBe("partial-prepare");
      }
      if (defect === "revocation") f.teamAuth.set("A", null);
      if (defect === "inventory")
        vi.mocked(f.controls.inspect).mockResolvedValue({
          ...f.inventory,
          workerSha256: "0".repeat(64),
        });
      const signal =
        defect === "cancellation" ? AbortSignal.abort() : next.signal;
      await expect(f.transport.agent(next.runId, signal)).rejects.toThrow();
      expect(f.controls.agent).not.toHaveBeenCalled();
      await f.transport.cleanup(next.runId);
      await expect(
        f.transport.admit(
          "A",
          pairedRuntimeSubject(f.study, f.settings.implementationSha256, "A"),
          { assertOwned: async () => {} },
          next.signal,
        ),
      ).rejects.toThrow();
    },
  );
  it.each(["smoke-profile", "suite", "sealed-source", "worker"])(
    "rejects %s at fixed grading dispatch",
    async (defect) => {
      const f = await fixture(),
        next = await startFirst(f);
      await f.transport.prepare(
        next.runId,
        next.source,
        next.shared,
        next.signal,
      );
      await f.transport.agent(next.runId, next.signal);
      const finalized = await f.transport.finalizeAgent(
        next.runId,
        next.signal,
      );
      expect(isTrustedAgentFinalization(finalized)).toBe(false);
      const candidate = structuredClone(
        finalized.candidate,
      ) as CandidateEnvelope;
      if (defect === "sealed-source")
        candidate.files.find((f) => f.path === "src/service.ts")!.base64 =
          Buffer.from("// different inert source").toString("base64");
      const tree = jsonDigest(
        candidate.files
          .map((f) => ({
            path: f.path,
            sha256: sha256(Buffer.from(f.base64, "base64")),
          }))
          .sort((a, b) => (a.path < b.path ? -1 : 1)),
      );
      const input = {
        runId: next.runId,
        evaluatedTreeSha256: tree,
        evaluatorSha256: f.plan.profile.evaluatorSha256,
        testSuiteSha256:
          defect === "suite" ? "0".repeat(64) : f.plan.profile.testSuiteSha256,
        requiredPolicySha256: f.plan.profile.requiredPolicySha256,
        candidate,
        workerImage:
          defect === "worker"
            ? `sha256:${"0".repeat(64)}`
            : f.plan.runtime.workerImage,
        ...(defect === "smoke-profile"
          ? {}
          : { evaluationProfile: f.plan.profile }),
      };
      await expect(f.transport.grade(input, next.signal)).rejects.toThrow();
      expect(f.controls.grade).not.toHaveBeenCalled();
      await f.transport.cleanup(next.runId);
    },
  );
  it("runs fixed harmless Python team controls with no Docker, sockets or inference", () => {
    const script = fileURLToPath(
      new URL("../runtime/team-supervisor-unit.py", import.meta.url),
    );
    expect(
      execFileSync("python3", ["-I", "-B", script], { encoding: "utf8" }),
    ).toContain("team controls passed");
  });
  it("exercises full replay growth and durable broker refusals with zero upstream calls", () => {
    const script = fileURLToPath(
      new URL("../runtime/team-reservation-controls.py", import.meta.url),
    );
    expect(
      execFileSync("python3", ["-I", "-B", script], { encoding: "utf8" }),
    ).toContain("zero-send negative controls passed");
  });
  it("delivers committed scenario assumptions as part of the exact common prompt", async () => {
    const f = await fixture(),
      d = structuredClone(f.study.definition);
    d.protocol.scenario.assumptions = [
      "Explicit shared assumption, never an oracle assertion.",
    ];
    const p = d.protocol;
    for (const c of p.conditions)
      c.taskSha256 = jsonDigest({
        taskId: p.task.id,
        request: p.scenario.request,
        assumptions: p.scenario.assumptions,
        acceptanceIds: p.scenario.acceptanceIds,
      });
    expect(
      JSON.parse(teamEnforcementPlan(d).prompt).scenario.assumptions,
    ).toEqual(p.scenario.assumptions);
  });
  it("binds complete shared inputs and rejects weaker request/output ceilings", async () => {
    const f = await fixture(),
      shared = sharedFutureTask(f.study);
    expect(shared.restrictions).toEqual(f.plan.restrictions);
    expect(shared.budget.tokenLimit).toBe(f.plan.tokenLimit);
    expect(shared.model).toBe(f.plan.model);
    expect(f.plan.prompt).not.toContain("inert diagnostic");
    const one = structuredClone(f.study.definition),
      two = structuredClone(f.study.definition);
    one.restrictions.maxRequests++;
    two.restrictions.maxOutputTokens++;
    expect(jsonDigest(teamEnforcementPlan(one))).not.toBe(jsonDigest(f.plan));
    expect(jsonDigest(teamEnforcementPlan(two))).not.toBe(jsonDigest(f.plan));
  });
});
