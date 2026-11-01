// Fixed trusted inventory. Callers must authenticate authority and lease FIRST.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import { invariant } from "../../../src/lib/contracts/validation";
import { protectedRead } from "../artifacts/files";
import { ensureOfflineVmResources } from "../isolation/vm-resources";
import { verifyInstalledGrader } from "../isolation/installed-grader";
import {
  TeamInstalledPolicySchema,
  type TeamRuntimeConfig,
} from "./team-config";
import { sharedFutureTask } from "./paired-inputs";
import type { PreparedStudy } from "./study";
import { TeamInventorySchema } from "./supervised-team";
import type { TeamEnforcementPlan } from "./team-policy";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export type TeamCommand = (
  args: string[],
  signal: AbortSignal,
  input?: string,
  maxBytes?: number,
  milliseconds?: number,
) => Promise<string>;
export async function teamInventoryProgram() {
  const base = await readFile(
    new URL("../isolation/runtime-files.py", import.meta.url),
  );
  const extra = await readFile(
    new URL("../isolation/team-runtime-files.py", import.meta.url),
    "utf8",
  );
  return (
    "import base64, types\nruntime = types.ModuleType('team_inventory_base')\n" +
    `exec(compile(base64.b64decode('${base.toString("base64")}'), 'runtime-files.py', 'exec'), runtime.__dict__)\n` +
    extra +
    "\nprint(json.dumps(collect_team_runtime(runtime), sort_keys=True, separators=(',', ':')))\n"
  );
}
export async function collectTeamInventory(input: {
  config: TeamRuntimeConfig;
  study: PreparedStudy;
  plan: TeamEnforcementPlan;
  implementationSha256: string;
  exec: TeamCommand;
  signal: AbortSignal;
  initiallyStopped: boolean;
  onForeignState?(): void;
}) {
  const { config, plan, exec, signal } = input;
  function noForeign(ok: boolean, message: string) {
    if (!ok) {
      input.onForeignState?.();
      invariant(false, message);
    }
  }
  const expected = TeamInventorySchema.parse(config.expectedInventory);
  invariant(
    sha256(await readFile(config.sbx)) === expected.sandboxCliSha256,
    "Sandbox CLI changed.",
  );
  const version = (await exec(["version"], signal)).trim();
  invariant(
    version.startsWith("sbx version v0.50.0 "),
    "Unsupported sandbox version.",
  );
  const rows = z
    .array(z.object({ name: z.string(), id: z.string().min(1) }))
    .parse(JSON.parse(await exec(["ls", "--format", "json"], signal)));
  async function inspect(name: string, image: string) {
    const info = JSON.parse(await exec(["inspect", name, "--json"], signal));
    const id = rows.find((row) => row.name === name)?.id;
    invariant(
      id &&
        info.image_digest === image &&
        info.cpus === 2 &&
        info.memory === "4g" &&
        info.sessions === 0 &&
        info.runtime_mounts?.length === 0 &&
        !info.auth_mode &&
        (!input.initiallyStopped || info.state === "stopped"),
      "Dedicated VM inventory mismatch.",
    );
    return {
      id,
      image,
      cpus: info.cpus,
      memory: info.memory,
      mounts: info.runtime_mounts,
      auth: info.auth_mode ?? null,
      policy: JSON.parse(await exec(["policy", "ls", name, "--json"], signal)),
    };
  }
  const agent = await inspect(config.agentSandbox, plan.runtime.agentImage);
  const grader = await inspect(config.graderSandbox, plan.runtime.graderImage);
  invariant(
    agent.id === expected.agentInstance &&
      grader.id === expected.graderInstance &&
      agent.id !== grader.id,
    "Dedicated VM instance replaced.",
  );
  const ssh = (
    await exec(["settings", "get", "ssh.agentForwardingEnabled"], signal)
  ).trim();
  const browser = (
    await exec(["settings", "get", "browser.enabled"], signal)
  ).trim();
  const mcp = JSON.parse(await exec(["mcp", "ls", "--json"], signal));
  invariant(
    ssh === "false" &&
      browser === "false" &&
      Array.isArray(mcp) &&
      mcp.length === 0,
    "Host integrations enabled.",
  );
  const program = await teamInventoryProgram();
  const resources = { vmPids: plan.vm.pids, vmDiskBytes: plan.vm.diskBytes };
  const agentResources = await ensureOfflineVmResources(
    { ...resources, graderSandbox: config.agentSandbox },
    (args, abort) => exec(args, abort ?? signal),
    signal,
  );
  const graderResources = await ensureOfflineVmResources(
    { ...resources, graderSandbox: config.graderSandbox },
    (args, abort) => exec(args, abort ?? signal),
    signal,
  );
  const agentRaw = JSON.parse(
    await exec(
      [
        "exec",
        "-u",
        "root",
        config.agentSandbox,
        "python3",
        "-I",
        "-c",
        program,
        "agent",
      ],
      signal,
    ),
  );
  const { installedPolicy: policyRaw, ...agentHashes } = agentRaw;
  const agentFiles = z.record(z.string(), hash).parse(agentHashes);
  const policy = TeamInstalledPolicySchema.parse(policyRaw);
  const expectedPolicy = {
    schemaVersion: "supervised-team-installed-policy.v1",
    enabled: true,
    implementationSha256: input.implementationSha256,
    enforcementSha256: jsonDigest(plan),
    studyId: input.study.definition.protocol.studyId,
    arms: input.study.draft.plan.manifest.arms.map((a) => ({
      variant: a.variant,
      runId: a.runId!,
      sourceCommit: a.initialCommit,
      sourceTreeSha256: a.initialTreeSha256,
      sharedTaskSha256: jsonDigest(sharedFutureTask(input.study)),
    })),
    provider: expected.provider,
  };
  invariant(
    jsonDigest(policy) === jsonDigest(expectedPolicy),
    "Installed policy task/source/tariff mapping differs.",
  );
  const graderRaw = JSON.parse(
    await exec(
      [
        "exec",
        "-u",
        "root",
        config.graderSandbox,
        "python3",
        "-I",
        "-c",
        program,
        "grader",
        config.graderNodeSha256,
      ],
      signal,
    ),
  );
  noForeign(
    graderRaw.scratchAbsent === true,
    "Foreign or orphan grader scratch requires owner recovery.",
  );
  const { scratchAbsent, ...graderFilesRaw } = graderRaw;
  void scratchAbsent;
  const graderFiles = z.record(z.string(), hash).parse(graderFilesRaw);
  for (const name of [
    "supervisor.py",
    "budget.py",
    "worker.mjs",
    "team-supervisor.py",
    "team-worker.mjs",
    "team-public-checks.mjs",
    "team-public-session.mjs",
    "team-public-boundary.mjs",
    "team-workflow.mjs",
    "team-source-write.mjs",
    "team-shell-hook.sh",
  ]) {
    const local = await protectedRead(
      fileURLToPath(new URL(`../agent/${name}`, import.meta.url)),
    );
    invariant(
      agentFiles[`/opt/forecode-agent/${name}`] === sha256(local),
      "Installed agent control differs from reviewed source.",
    );
  }
  invariant(
    agentFiles["/opt/forecode-agent/team-policy.json"] ===
      config.installedPolicySha256 &&
      agentFiles["/home/agent/.codex/config.toml"] === plan.agentConfigSha256 &&
      plan.agentConfigSha256 ===
        sha256(
          await protectedRead(
            fileURLToPath(
              new URL("../agent/team-config.toml", import.meta.url),
            ),
          ),
        ) &&
      agentFiles["/usr/local/bin/codex"] === plan.runtime.agentBinarySha256,
    "Installed policy or agent identity changed.",
  );
  const supervisor = agentFiles["/opt/forecode-agent/team-supervisor.py"]!;
  // The team broker is this exact extension plus its immutable base budget.py.
  invariant(
    supervisor === plan.runtime.supervisorSha256 &&
      agentFiles["/opt/forecode-agent/budget.py"] === plan.runtime.brokerSha256,
    "Team control pins mismatch.",
  );
  const helperPath =
    "/opt/forecode-booking/controller/team-profile-inventory.ts";
  invariant(
    graderFiles[helperPath] ===
      sha256(
        await protectedRead(
          fileURLToPath(
            new URL(
              "../../evaluator/booking-v1/team-profile-inventory.ts",
              import.meta.url,
            ),
          ),
        ),
      ) &&
      graderFiles["/opt/forecode-booking/controller/guest.ts"] ===
        plan.runtime.graderExecutableSha256,
    "Installed team grader helper differs.",
  );
  const agentImages = JSON.parse(
    await exec(
      [
        "exec",
        config.agentSandbox,
        "docker",
        "image",
        "inspect",
        plan.runtime.workerImage,
      ],
      signal,
    ),
  );
  const graderImages = JSON.parse(
    await exec(
      [
        "exec",
        config.graderSandbox,
        "docker",
        "image",
        "inspect",
        config.graderWorkerImage,
      ],
      signal,
    ),
  );
  invariant(
    agentImages.length === 1 &&
      agentImages[0].Id === plan.runtime.workerImage &&
      agentImages[0].Os === "linux" &&
      ["arm64", "amd64"].includes(agentImages[0].Architecture),
    "Agent worker image mismatch.",
  );
  await verifyInstalledGrader(graderFiles, graderImages, {
    workerImage: config.graderWorkerImage,
    graderNodeSha256: config.graderNodeSha256,
    graderLockSha256: config.graderLockSha256,
    graderModulesSha256: config.graderModulesSha256,
  });
  for (const label of ["forecode.booking.team.agent", "forecode.booking.agent"])
    noForeign(
      !(
        await exec(
          [
            "exec",
            config.agentSandbox,
            "docker",
            "ps",
            "-aq",
            "--filter",
            `label=${label}`,
          ],
          signal,
        )
      ).trim(),
      "Existing agent worker requires owner recovery.",
    );
  noForeign(
    !(
      await exec(
        [
          "exec",
          config.graderSandbox,
          "docker",
          "ps",
          "-aq",
          "--filter",
          "label=forecode.booking.run",
        ],
        signal,
      )
    ).trim(),
    "Existing grader worker requires owner recovery.",
  );
  const installation = z
    .strictObject({
      manifestSha256: hash,
      oracleSha256: hash,
      authorizationInstrumentationSha256: hash.optional(),
    })
    .parse(
      JSON.parse(
        await exec(
          [
            "exec",
            "-i",
            "-u",
            "root",
            config.graderSandbox,
            "/opt/forecode-booking/bin/node",
            "--conditions=react-server",
            "--import",
            "/opt/forecode-booking/node_modules/tsx/dist/loader.mjs",
            helperPath,
          ],
          signal,
          JSON.stringify(plan.profile),
        ),
      ),
    );
  invariant(
    installation.oracleSha256 === plan.profile.testSuiteSha256,
    "Private suite substituted.",
  );
  const isolation = sha256(await protectedRead(config.isolationFile));
  invariant(
    isolation === expected.isolationObservationSha256,
    "Independent isolation observations changed.",
  );
  const observed = {
    policy,
    version,
    agent,
    grader,
    ssh,
    browser,
    mcp,
    agentResources,
    graderResources,
    agentFiles,
    graderFiles,
    agentImages,
    graderImages,
    installation,
  };
  const inventory = TeamInventorySchema.parse({
    schemaVersion: "supervised-team-inventory.local.v1",
    implementationSha256: input.implementationSha256,
    enforcementSha256: jsonDigest(plan),
    agentInstance: agent.id,
    graderInstance: grader.id,
    graderWorkerImage: config.graderWorkerImage,
    runtime: {
      ...plan.runtime,
      agentBinarySha256: agentFiles["/usr/local/bin/codex"],
      supervisorSha256: supervisor,
      brokerSha256: agentFiles["/opt/forecode-agent/budget.py"],
      graderExecutableSha256:
        graderFiles["/opt/forecode-booking/controller/guest.ts"],
    },
    agentConfigSha256: agentFiles["/home/agent/.codex/config.toml"],
    workerSha256: agentFiles["/opt/forecode-agent/worker.mjs"],
    sandboxCliSha256: sha256(await readFile(config.sbx)),
    protectedInstallationSha256: jsonDigest(installation),
    isolationObservationSha256: isolation,
    enforcementObservationSha256: jsonDigest(observed),
    provider: expected.provider,
    vm: plan.vm,
    hostIntegrations: "disabled",
    workerNetwork: "none",
    workerCredentials: "absent",
    restart: "no",
  });
  return { inventory, agentFiles, graderFiles, policy };
}
