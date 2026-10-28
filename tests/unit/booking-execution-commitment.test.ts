import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { freezeBooking } from "../../scripts/evaluator/booking-v1/freeze";
import { OperatorConfigSchema } from "../../scripts/experiments/isolation/config";
import {
  bookingExecutionCommitment,
  prepareBookingExecutionCommitment,
  realAgentExecutionBlockers,
} from "../../scripts/experiments/runner/commitment";
import { runBookingExperiment } from "../../scripts/experiments/runner/controller";
import { createSbxAdapter } from "../../scripts/experiments/runner/sbx";
import * as hostProcesses from "../../scripts/experiments/runner/process";
import { jsonDigest } from "../../src/lib/report/digests";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function setup() {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "forecode-commitment-")),
  );
  roots.push(root);
  const protectedRoot = path.join(root, "protected"),
    scratchRoot = path.join(root, "scratch"),
    coordinationRoot = path.join(root, "coordination");
  for (const directory of [protectedRoot, scratchRoot, coordinationRoot])
    await mkdir(directory, { mode: 0o700 });
  const example = JSON.parse(
    await readFile(
      new URL(
        "../../scripts/experiments/isolation/operator.example.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const config = OperatorConfigSchema.parse({
    ...example,
    protectedRoot,
    scratchRoot,
    coordinationRoot,
  });
  return { root, config };
}

describe("booking pre-run commitment — integrity preparation, never runtime admission", () => {
  it("persists a private proposal without sandbox, provider, lease or candidate execution", async () => {
    const { config } = await setup();
    const processes = vi.spyOn(hostProcesses, "boundedProcess");
    const proposal = await prepareBookingExecutionCommitment(
      config,
      "b".repeat(40),
    );
    const file = path.join(
      config.protectedRoot,
      proposal.runId,
      "commitment-proposal.json",
    );
    const original = JSON.parse(await readFile(file, "utf8"));
    expect(original).toEqual({
      commitment: proposal.commitment,
      commitmentSha256: proposal.commitmentSha256,
    });
    expect((await stat(file)).mode & 0o777).toBe(0o400);
    expect(proposal.commitment.admission.status).toBe("BLOCKED");
    expect(proposal.commitment.admission.authority).toBeNull();
    expect(
      proposal.commitment.expectedRuntime.actualInventorySha256,
    ).toBeNull();
    expect(proposal.commitment.agent.exactGuestWorkspace).toBeNull();
    expect(proposal.commitment.admission.blockers).toEqual(
      realAgentExecutionBlockers,
    );
    expect(processes).not.toHaveBeenCalled();
    await expect(
      stat(path.join(config.coordinationRoot, ".booking-run.lock")),
    ).rejects.toThrow();
    // An operator can change local bytes; that breaks integrity and grants no authority.
    await chmod(file, 0o600);
    original.commitment.admission.status = "APPROVED";
    expect(jsonDigest(original.commitment)).not.toBe(proposal.commitmentSha256);
  });
  it("binds source, task, arm, tools, model, limits, evaluator and runtime separately", async () => {
    const { config } = await setup();
    const pins = await freezeBooking(),
      runId = randomUUID();
    const proposal = bookingExecutionCommitment(
      config,
      "b".repeat(40),
      runId,
      pins,
    );
    expect(jsonDigest(proposal.commitment)).toBe(proposal.commitmentSha256);
    for (const changed of [
      { ...proposal.commitment, arm: "B" },
      {
        ...proposal.commitment,
        task: { ...proposal.commitment.task, id: "other" },
      },
      {
        ...proposal.commitment,
        agent: { ...proposal.commitment.agent, tools: "host shell" },
      },
    ])
      expect(jsonDigest(changed)).not.toBe(proposal.commitmentSha256);
    for (const changed of [
      { ...config, maxSeconds: config.maxSeconds + 1 },
      { ...config, spendUsd: config.spendUsd + 0.1 },
      { ...config, tokenLimit: config.tokenLimit + 1 },
      { ...config, agentImage: `sha256:${"a".repeat(64)}` },
      { ...config, codexBinarySha256: "a".repeat(64) },
      { ...config, reviewSha256: "a".repeat(64) },
    ])
      expect(
        bookingExecutionCommitment(changed, "b".repeat(40), runId, pins)
          .commitmentSha256,
      ).not.toBe(proposal.commitmentSha256);
    for (const key of [
      "fixtureSha256",
      "evaluatorSha256",
      "testSuiteSha256",
      "requiredPolicySha256",
    ] as const)
      expect(
        bookingExecutionCommitment(config, "b".repeat(40), runId, {
          ...pins,
          [key]: "a".repeat(64),
        }).commitmentSha256,
      ).not.toBe(proposal.commitmentSha256);
    expect(() =>
      bookingExecutionCommitment(config, "unknown", runId, pins),
    ).toThrow();
  });
  it.each([false, true])(
    "durably blocks the concrete adapter with enabled=%s and makes no sandbox call",
    async (enabled) => {
      const { config } = await setup();
      config.enabled = enabled;
      const processes = vi.spyOn(hostProcesses, "boundedProcess");
      const result = await runBookingExperiment(
        config,
        createSbxAdapter(config),
        new AbortController().signal,
        "b".repeat(40),
      );
      expect(result.run.status).toBe("blocked");
      expect(result.run.evidenceOrigin).toBe("none");
      expect(result.run.receiptId).toBeNull();
      expect(result.run.evaluatedTreeSha256).toBeNull();
      expect(result.executionBlockers).toEqual(realAgentExecutionBlockers);
      expect(result.run.metrics.tokens).toBeNull();
      expect(result.run.metrics.costUsd).toBeNull();
      expect(
        JSON.parse(
          await readFile(
            path.join(config.protectedRoot, result.run.id, "run.json"),
            "utf8",
          ),
        ).commitmentSha256,
      ).toBe(result.commitmentSha256);
      expect(processes).not.toHaveBeenCalled();
    },
  );
});
