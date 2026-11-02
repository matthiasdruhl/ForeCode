// Read-only predecessor observation. This grants no installation or run authority.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { invariant } from "../../../src/lib/contracts/validation";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import { controllerFiles } from "../../evaluator/booking-v1/installed";
import { protectedRead } from "../artifacts/files";
import {
  configuredTeamRuntimes,
  readTeamRegistration,
  TeamInstalledPolicySchema,
  type TeamRuntimeLocation,
} from "./team-config";
import { loadOperatorStudy } from "./operator";
import { teamEnforcementPlan } from "./team-policy";
import { TeamInventorySchema } from "./supervised-team";
import { teamInventoryProgram, type TeamCommand } from "./team-inventory";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const InstallationSchema = z.strictObject({
  manifestSha256: hash,
  oracleSha256: hash,
  authorizationInstrumentationSha256: hash.optional(),
});

/** Compare the entire real protected-reader tuple, including the raw manifest. */
export function assertTeamPredecessorInstallation(
  observed: unknown,
  expectedInstallationSha256: string,
) {
  const installation = InstallationSchema.parse(observed);
  const installationSha256 = jsonDigest(installation);
  invariant(
    installationSha256 === hash.parse(expectedInstallationSha256),
    "Retired protected installation changed.",
  );
  return Object.freeze({
    installation: Object.freeze(installation),
    installationSha256,
  });
}

export type TeamPredecessorInput = {
  studyId: string;
  registrationSha256: string;
  // A failed later transition may own the current disabled policy while the
  // protected package still belongs to this authenticated retired registration.
  disabledPolicy: { studyId: string; sha256: string };
  exec: TeamCommand;
  assertLease: () => Promise<void>;
  signal: AbortSignal;
};

/** Production uses only the source-owned registration location and trust key. */
export async function collectTeamPredecessor(input: TeamPredecessorInput) {
  const location = configuredTeamRuntimes.get(input.studyId);
  invariant(location, "Unknown retired runtime location.");
  return inspectTeamPredecessor({ ...input, location });
}

// Explicit location seam matches readTeamRegistration's existing synthetic
// custody seam. Production above never selects a location from request data.
export async function inspectTeamPredecessor(
  input: TeamPredecessorInput & { location: TeamRuntimeLocation },
) {
  const { studyId, exec, assertLease, signal } = input;
  const startedRoles = new Set<string>();
  const registrationSha256 = hash.parse(input.registrationSha256);
  const disabledPolicy = Object.freeze({
    studyId: input.disabledPolicy.studyId,
    sha256: hash.parse(input.disabledPolicy.sha256),
  });
  const location = Object.freeze({ ...input.location });
  async function observe() {
    signal.throwIfAborted();
    await assertLease();
    const loaded = await readTeamRegistration(location);
    invariant(
      loaded.sha256 === registrationSha256 &&
        loaded.registration.runtime.enabled === false,
      "Exact disabled retired registration required.",
    );
    const { registration } = loaded;
    const study = await loadOperatorStudy(
      registration.studyRoot,
      registration.study,
    );
    invariant(
      study.definition.protocol.studyId === studyId,
      "Retired study identity differs.",
    );
    const plan = teamEnforcementPlan(study.definition);
    const config = registration.runtime;
    const expected = TeamInventorySchema.parse(config.expectedInventory);
    invariant(
      expected.enforcementSha256 === jsonDigest(plan) &&
        expected.implementationSha256 === plan.profile.baselineEvaluatorSha256,
      "Retired enforcement identity differs.",
    );
    async function command(args: string[], stdin?: string) {
      signal.throwIfAborted();
      await assertLease();
      invariant(
        sha256(await readFile(config.sbx)) === expected.sandboxCliSha256,
        "Sandbox CLI changed.",
      );
      if (args[0] === "exec") {
        for (const role of [config.agentSandbox, config.graderSandbox])
          if (args.includes(role)) startedRoles.add(role);
      }
      const result = await exec(args, signal, stdin);
      signal.throwIfAborted();
      await assertLease();
      return result;
    }
    const rows = z
      .array(z.object({ name: z.string(), id: z.string() }))
      .parse(JSON.parse(await command(["ls", "--format", "json"])));
    for (const [name, instance, image] of [
      [
        config.agentSandbox,
        expected.agentInstance,
        expected.runtime.agentImage,
      ],
      [
        config.graderSandbox,
        expected.graderInstance,
        expected.runtime.graderImage,
      ],
    ]) {
      const info = JSON.parse(await command(["inspect", name!, "--json"]));
      invariant(
        rows.find((row) => row.name === name)?.id === instance &&
          info.image_digest === image &&
          (info.state === "stopped" ||
            (info.state === "running" && startedRoles.has(name!))) &&
          info.sessions === 0 &&
          Array.isArray(info.runtime_mounts) &&
          info.runtime_mounts.length === 0 &&
          !info.auth_mode,
        "Stopped or exactly owned-started predecessor roles required.",
      );
    }
    for (const [role, label] of [
      [config.agentSandbox, "forecode.booking.team.agent"],
      [config.agentSandbox, "forecode.booking.agent"],
      [config.graderSandbox, "forecode.booking.run"],
    ]) {
      invariant(
        !(
          await command([
            "exec",
            role!,
            "docker",
            "ps",
            "-aq",
            "--filter",
            `label=${label}`,
          ])
        ).trim(),
        "Existing worker prevents predecessor observation.",
      );
    }
    const program = await teamInventoryProgram();
    const agent = JSON.parse(
      await command([
        "exec",
        "-u",
        "root",
        config.agentSandbox,
        "python3",
        "-I",
        "-c",
        program,
        "agent",
      ]),
    );
    const policy = TeamInstalledPolicySchema.extend({
      enabled: z.literal(false),
    }).parse(agent.installedPolicy);
    invariant(
      agent["/opt/forecode-agent/team-policy.json"] === disabledPolicy.sha256 &&
        policy.studyId === disabledPolicy.studyId,
      "Current disabled policy differs from the reviewed transition.",
    );
    const grader = JSON.parse(
      await command([
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
      ]),
    );
    invariant(
      grader.scratchAbsent === true &&
        grader["/opt/forecode-booking/bin/node"] === config.graderNodeSha256 &&
        grader["/opt/forecode-booking/package-lock.json"] ===
          config.graderLockSha256 &&
        grader.node_modules === config.graderModulesSha256,
      "Protected predecessor toolchain or scratch state differs.",
    );
    // Authenticate every installed controller byte before executing the fixed
    // protected-reader CLI. The reader hashes source; it never imports an oracle.
    for (const name of [...controllerFiles, "team-profile-inventory.ts"]) {
      invariant(
        grader[`/opt/forecode-booking/controller/${name}`] ===
          sha256(
            await protectedRead(
              fileURLToPath(
                new URL(`../../evaluator/booking-v1/${name}`, import.meta.url),
              ),
            ),
          ),
        "Protected predecessor reader differs from reviewed source.",
      );
    }
    const installed = assertTeamPredecessorInstallation(
      JSON.parse(
        await command(
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
            "/opt/forecode-booking/controller/team-profile-inventory.ts",
          ],
          JSON.stringify(plan.profile),
        ),
      ),
      expected.protectedInstallationSha256,
    );
    invariant(
      installed.installation.oracleSha256 === plan.profile.testSuiteSha256,
      "Retired private suite differs.",
    );
    signal.throwIfAborted();
    await assertLease();
    const after = await readTeamRegistration(location);
    invariant(
      after.sha256 === registrationSha256,
      "Retired registration changed.",
    );
    invariant(
      jsonDigest(
        await loadOperatorStudy(registration.studyRoot, registration.study),
      ) === jsonDigest(study),
      "Retired authenticated study changed.",
    );
    signal.throwIfAborted();
    return Object.freeze({
      studyId: studyId,
      registrationSha256,
      definitionSha256: jsonDigest(study.definition),
      disabledPolicy,
      ...installed,
    });
  }
  const observed = await observe();
  signal.throwIfAborted();
  return Object.freeze({
    ...observed,
    observedAt: new Date().toISOString(),
    async assertCurrent() {
      invariant(
        jsonDigest(await observe()) === jsonDigest(observed),
        "Predecessor changed before mutation.",
      );
      signal.throwIfAborted();
      await assertLease();
      signal.throwIfAborted();
    },
  });
}
