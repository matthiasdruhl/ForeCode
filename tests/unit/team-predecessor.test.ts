import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmod, mkdir, readdir, rm, writeFile } from "node:fs/promises";
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
import { inspectTeamInstallation } from "../../scripts/evaluator/booking-v1/team-installation";
import { teamEvaluatorIdentity } from "../../scripts/evaluator/booking-v1/grade-profile";
import {
  inspectTeamPredecessor,
  assertTeamPredecessorInstallation,
} from "../../scripts/experiments/tournament/team-predecessor";
import {
  teamAgentId,
  teamCredentialPolicy,
  teamNetworkPolicy,
  teamRoadmapDigest,
  teamEnforcementPlan,
} from "../../scripts/experiments/tournament/team-policy";
import { TeamInventorySchema } from "../../scripts/experiments/tournament/supervised-team";
import { canonicalJson } from "../../src/lib/report/canonical";
import { jsonDigest, sha256 } from "../../src/lib/report/digests";
import { compositionFixture } from "../support/team-composition";
import { studyFixture } from "../support/tournament-study";
import { syntheticOracleBytes } from "../support/team-grade-data";
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
  const base = await compositionFixture();
  roots.push(base.parent);
  const f = await studyFixture({
    configure(d, draft) {
      const oracleHash = sha256(syntheticOracleBytes);
      for (const descriptor of [d.protocol.futureOracle, draft.futureOracle]) {
        descriptor.oracle.testSuiteSha256 = oracleHash;
        descriptor.oracle.evaluatorSha256 = teamEvaluatorIdentity(
          descriptor.baselineOracle.evaluatorSha256,
          oracleHash,
        );
      }
      draft.plan.futureOracle = structuredClone(draft.futureOracle.oracle);
      draft.plan.manifest.evaluatorSha256 =
        draft.futureOracle.oracle.evaluatorSha256;
      for (const c of [...d.protocol.conditions, ...draft.plan.conditions]) {
        c.seed = null;
        c.budget.tokenLimit = 100000;
        c.networkPolicySha256 = jsonDigest(teamNetworkPolicy);
        c.credentialPolicySha256 = jsonDigest(teamCredentialPolicy);
        c.visibleRoadmapSha256 = teamRoadmapDigest(d);
      }
      draft.plan.manifest.budget = structuredClone(
        draft.plan.conditions[0]!.budget,
      );
      draft.plan.visibleRoadmapSha256 =
        draft.plan.conditions[0]!.visibleRoadmapSha256;
      for (const e of [
        ...d.protocol.executionConditions,
        ...draft.executionConditions,
      ])
        e.agentId = teamAgentId;
    },
  });
  roots.push(f.parent);
  const plan = teamEnforcementPlan(f.study.definition);
  for (const [name, value] of Object.entries({
    definition: f.study.definition,
    draft: f.study.draft,
    preparation: f.study.evidence,
  }))
    await writeFile(
      path.join(f.studyRoot, name + ".json"),
      canonicalJson(value),
      { mode: 0o400 },
    );
  const packageRoot = path.join(f.parent, "package");
  await mkdir(packageRoot, { mode: 0o700 });
  const manifest = {
    schemaVersion: "booking-team-oracle-installation.v1",
    profile: plan.profile,
  };
  const manifestPath = path.join(packageRoot, "manifest.json");
  await writeFile(manifestPath, canonicalJson(manifest), { mode: 0o400 });
  await writeFile(path.join(packageRoot, "oracle.mjs"), syntheticOracleBytes, {
    mode: 0o400,
  });
  const installation = await inspectTeamInstallation(
    packageRoot,
    plan.profile,
    process.getuid!(),
  );
  const expected = TeamInventorySchema.parse({
    ...(base.config.expectedInventory as object),
    runtime: plan.runtime,
    implementationSha256: plan.profile.baselineEvaluatorSha256,
    enforcementSha256: jsonDigest(plan),
    protectedInstallationSha256: jsonDigest(installation),
  });
  const config = {
    ...base.config,
    enabled: false,
    expectedInventory: expected,
    sources: f.sources,
  };
  const { entries, publicKeyPem, publicKeySha256, ...custody } =
    f.operatorConfig.custody;
  const document = {
    schemaVersion: "supervised-team-registration.local.v1",
    studyRoot: f.studyRoot,
    study: {
      ...f.operatorConfig,
      custody: {
        ...custody,
        entries: [...entries].map(([id, entry]) => ({ id, ...entry })),
      },
    },
    runtime: config,
  };
  const registrationRoot = path.join(f.parent, "registration");
  await mkdir(registrationRoot, { mode: 0o700 });
  const registrationFile = path.join(
      registrationRoot,
      "team-registration.json",
    ),
    bytes = canonicalJson(document);
  await writeFile(registrationFile, bytes, { mode: 0o400 });
  const policy = {
      ...base.initial.policy,
      enabled: false,
      studyId: "failed-later-transition",
    },
    policySha = sha256(canonicalJson(policy));
  const vm = new Map<string, string>([
    [config.agentSandbox, "stopped"],
    [config.graderSandbox, "stopped"],
  ]);
  const faults = { worker: false, reader: false, toolchain: false };
  const calls: string[][] = [],
    assertLease = vi.fn(async () => {}),
    abort = new AbortController();
  const exec = async (args: string[], _signal: AbortSignal, stdin?: string) => {
    calls.push(args);
    if (args[0] === "ls")
      return JSON.stringify([
        { name: config.agentSandbox, id: expected.agentInstance },
        { name: config.graderSandbox, id: expected.graderInstance },
      ]);
    if (args[0] === "inspect")
      return JSON.stringify({
        state: vm.get(args[1]!),
        image_digest:
          args[1] === config.agentSandbox
            ? expected.runtime.agentImage
            : expected.runtime.graderImage,
        sessions: 0,
        runtime_mounts: [],
      });
    expect(args[0]).toBe("exec");
    const role = args.includes(config.agentSandbox)
      ? config.agentSandbox
      : config.graderSandbox;
    vm.set(role, "running");
    if (args.includes("docker")) return faults.worker ? "foreign-worker" : "";
    if (args.at(-1) === "agent")
      return JSON.stringify({
        ...base.agentFiles,
        "/opt/forecode-agent/team-policy.json": policySha,
        installedPolicy: policy,
      });
    if (args.includes("python3"))
      return JSON.stringify({
        ...base.graderFiles,
        scratchAbsent: true,
        ...(faults.reader
          ? {
              "/opt/forecode-booking/controller/team-installation.ts":
                "0".repeat(64),
            }
          : {}),
        ...(faults.toolchain ? { node_modules: "0".repeat(64) } : {}),
      });
    expect(args.at(-1)).toBe(
      "/opt/forecode-booking/controller/team-profile-inventory.ts",
    );
    // Real protected-reader interface on sealed inert bytes; never imports oracle.
    return JSON.stringify(
      await inspectTeamInstallation(
        packageRoot,
        JSON.parse(stdin!),
        process.getuid!(),
      ),
    );
  };
  const input = {
    studyId: f.study.definition.protocol.studyId,
    registrationSha256: sha256(bytes),
    disabledPolicy: { studyId: policy.studyId, sha256: policySha },
    exec,
    assertLease,
    signal: abort.signal,
    location: { registrationRoot, publicKeyPem, publicKeySha256 },
  };
  return {
    input,
    installation,
    manifest,
    manifestPath,
    registrationFile,
    calls,
    vm,
    faults,
    abort,
    policySha,
  };
}
describe(
  "authenticated retired package transition preflight through the protected reader",
  { timeout: 30000 },
  () => {
    it("joins actual signed study/profile and package tuple; reobserves owned-started roles", async () => {
      const f = await fixture(),
        proof = await inspectTeamPredecessor(f.input);
      expect(proof.installation).toEqual(f.installation);
      expect(proof.installationSha256).toBe(jsonDigest(f.installation));
      expect(proof.disabledPolicy.sha256).toBe(f.policySha);
      expect(Object.isFrozen(proof.installation)).toBe(true);
      expect([...f.vm.values()]).toEqual(["running", "running"]);
      await expect(proof.assertCurrent()).resolves.toBeUndefined();
      expect(
        f.calls.filter(
          (args) =>
            args.at(-1) ===
            "/opt/forecode-booking/controller/team-profile-inventory.ts",
        ),
      ).toHaveLength(2);
    });
    it("rejects stale registered manifest lineage with unchanged real oracle before any mutation", async () => {
      const f = await fixture();
      await chmod(f.manifestPath, 0o600);
      await writeFile(f.manifestPath, JSON.stringify(f.manifest, null, 2));
      await chmod(f.manifestPath, 0o400);
      let mutations = 0,
        inference = 0;
      await expect(
        (async () => {
          await inspectTeamPredecessor(f.input);
          mutations++;
          inference++;
        })(),
      ).rejects.toThrow("Retired protected installation changed");
      expect(mutations).toBe(0);
      expect(inference).toBe(0);
      const actual = await inspectTeamInstallation(
        path.dirname(f.manifestPath),
        f.manifest.profile,
        process.getuid!(),
      );
      expect(actual.oracleSha256).toBe(f.installation.oracleSha256);
      expect(actual.manifestSha256).not.toBe(f.installation.manifestSha256);
      expect(() =>
        assertTeamPredecessorInstallation(actual, jsonDigest(f.installation)),
      ).toThrow();
    });
    it("refuses package changes between observation and mutation", async () => {
      const f = await fixture(),
        proof = await inspectTeamPredecessor(f.input);
      await chmod(f.manifestPath, 0o600);
      await writeFile(f.manifestPath, JSON.stringify(f.manifest, null, 2));
      await chmod(f.manifestPath, 0o400);
      await expect(proof.assertCurrent()).rejects.toThrow(
        "Retired protected installation changed",
      );
    });
    it.each([
      "registration",
      "policy",
      "foreign-running",
      "worker",
      "reader",
      "toolchain",
      "aborted",
    ])("refuses %s without protected reader execution", async (defect) => {
      const f = await fixture();
      if (defect === "registration")
        f.input.registrationSha256 = "0".repeat(64);
      if (defect === "policy") f.input.disabledPolicy.sha256 = "0".repeat(64);
      if (defect === "foreign-running")
        f.vm.set("forecode-team-agent", "running");
      if (defect === "worker") f.faults.worker = true;
      if (defect === "reader") f.faults.reader = true;
      if (defect === "toolchain") f.faults.toolchain = true;
      if (defect === "aborted") f.abort.abort();
      await expect(inspectTeamPredecessor(f.input)).rejects.toThrow();
      expect(
        f.calls.some(
          (args) =>
            args.at(-1) ===
            "/opt/forecode-booking/controller/team-profile-inventory.ts",
        ),
      ).toBe(false);
    });
  },
);
