// Code-owned private composition only. No JSON/env/request-selected authority.
import path from "node:path";
import { lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { privateDirectory, protectedRead, disjoint } from "../artifacts/files";
import { invariant } from "../../../src/lib/contracts/validation";
import { IdSchema } from "../../../src/lib/contracts/common";
import { z } from "zod";
import type { OperatorStudyConfig } from "./operator";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const absolute = z.string().refine(path.isAbsolute);
const uuid = z
  .string()
  .regex(
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
export const TeamRuntimeConfigSchema = z.strictObject({
  schemaVersion: z.literal("supervised-team-composition.local.v1"),
  enabled: z.boolean().default(false),
  sbx: z.literal("/opt/homebrew/bin/sbx"),
  agentSandbox: z.literal("forecode-team-agent"),
  graderSandbox: z.literal("forecode-team-grader"),
  graderWorkerImage: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  expectedInventory: z.unknown(),
  graderNodeSha256: hash,
  graderLockSha256: hash,
  graderModulesSha256: hash,
  installedPolicySha256: hash,
  isolationFile: absolute,
  protectedRoot: absolute,
  evaluationRoot: absolute,
  runtimeOriginalRoot: absolute,
  coordinationRoot: absolute,
  sources: z.strictObject({ A: absolute, B: absolute }),
  baselineRunIds: z.strictObject({ A: uuid, B: uuid }),
  runtimeOriginalIds: z.strictObject({
    A: z.strictObject({
      paired: z.string().min(1),
      installed: z.string().min(1),
    }),
    B: z.strictObject({
      paired: z.string().min(1),
      installed: z.string().min(1),
    }),
  }),
});
export type TeamRuntimeConfig = z.infer<typeof TeamRuntimeConfigSchema>;
export type TeamRuntimeRegistration = Readonly<{
  studyRoot: string;
  study: OperatorStudyConfig;
  runtime: TeamRuntimeConfig;
}>;
export type TeamRuntimeLocation = Readonly<{
  registrationRoot: string;
  publicKeyPem: string;
  publicKeySha256: string;
}>;
// Only fixed location and independently trusted key belong in source. Runtime
// hashes/record pins are read as private data AFTER source freeze, avoiding a
// circular implementation digest. No request/env can select a location or key.
export const configuredTeamRuntimes: ReadonlyMap<string, TeamRuntimeLocation> =
  new Map([
    [
      "forecode-team-20261030-case-03",
      {
        // Owner explicitly delegated technical review/operator work to AI.
        // Public trust anchor only. Private key/data stay outside this repo.
        // Registration is disabled until exact paid-run approval and originals.
        registrationRoot: path.join(
          homedir(),
          ".local",
          "share",
          "forecode-tournament",
          "registration",
        ),
        publicKeyPem: [
          "-----BEGIN PUBLIC KEY-----",
          "MCowBQYDK2VwAyEAWt7GiHz942hk4Feu06kF4HpwHSM/I+qyf/ijtAqzfGg=",
          "-----END PUBLIC KEY-----",
          "",
        ].join("\n"),
        publicKeySha256:
          "ad6a10c33da9beb64021fabc896ccd6793b6e02e88ebed68845c13e8eb7d821b",
      },
    ],
  ]);
const RegistrationDocumentSchema = z.strictObject({
  schemaVersion: z.literal("supervised-team-registration.local.v1"),
  studyRoot: absolute,
  study: z.strictObject({
    protocolId: IdSchema,
    preparedId: IdSchema,
    preparationAuthorizationIds: z.array(IdSchema).min(1),
    preparationTelemetryId: IdSchema.optional(),
    custody: z.strictObject({
      originalRoot: absolute,
      revocationSha256: hash,
      workspaceRoots: z.array(absolute).min(1),
      entries: z
        .array(
          z.strictObject({
            id: IdSchema,
            file: z.string().regex(/^[A-Za-z0-9_-]+\.json$/),
            sha256: hash,
          }),
        )
        .max(10000),
    }),
  }),
  runtime: TeamRuntimeConfigSchema,
});
// Pure private-data loader seam; loading data does not create a live capability.
export async function readTeamRegistration(location: TeamRuntimeLocation) {
  invariant(
    sha256(location.publicKeyPem) === hash.parse(location.publicKeySha256),
    "Pinned custodian key changed.",
  );
  const root = await privateDirectory(location.registrationRoot),
    repo = fileURLToPath(new URL("../../../", import.meta.url));
  disjoint(root, repo);
  disjoint(root, path.resolve(repo, "../AgentHarness-Planning"));
  const file = path.join(root, "team-registration.json");
  invariant(
    ((await lstat(file)).mode & 0o777) === 0o400,
    "Immutable registration data required.",
  );
  const bytes = await protectedRead(file);
  const data = RegistrationDocumentSchema.parse(
    JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes)),
  );
  invariant(
    new Set(data.study.custody.entries.map((e) => e.id)).size ===
      data.study.custody.entries.length,
    "Duplicate original catalog ID.",
  );
  const { entries, ...custody } = data.study.custody;
  const registration: TeamRuntimeRegistration = {
    studyRoot: data.studyRoot,
    runtime: data.runtime,
    study: {
      ...data.study,
      custody: {
        ...custody,
        publicKeyPem: location.publicKeyPem,
        publicKeySha256: location.publicKeySha256,
        entries: new Map(entries.map(({ id, ...entry }) => [id, entry])),
      },
    },
  };
  for (const source of [
    ...Object.values(data.runtime.sources),
    ...custody.workspaceRoots,
    custody.originalRoot,
    data.studyRoot,
    data.runtime.protectedRoot,
    data.runtime.evaluationRoot,
    data.runtime.runtimeOriginalRoot,
    data.runtime.coordinationRoot,
  ])
    disjoint(root, await privateDirectory(source));
  return { registration, sha256: sha256(bytes) };
}
export async function loadRegisteredTeamRuntime(id: string) {
  IdSchema.parse(id);
  const location = configuredTeamRuntimes.get(id);
  return location ? readTeamRegistration(location) : null;
}
export async function assertTeamRegistrationCurrent(
  id: string,
  expectedSha256: string,
) {
  const loaded = await loadRegisteredTeamRuntime(id);
  invariant(
    loaded?.sha256 === expectedSha256,
    "Registered composition changed or disappeared.",
  );
}
export function teamCompositionDigest(config: TeamRuntimeConfig) {
  return jsonDigest(TeamRuntimeConfigSchema.parse(config));
}

export const TeamInstalledPolicySchema = z.strictObject({
  schemaVersion: z.literal("supervised-team-installed-policy.v1"),
  enabled: z.literal(true),
  implementationSha256: hash,
  enforcementSha256: hash,
  studyId: z.string().min(1),
  arms: z
    .array(
      z.strictObject({
        variant: z.enum(["A", "B"]),
        runId: uuid,
        sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
        sourceTreeSha256: hash,
        sharedTaskSha256: hash,
      }),
    )
    .length(2),
  provider: z.strictObject({
    inputMicroUsdPerToken: z.number().int().min(1).max(1000),
    outputMicroUsdPerToken: z.number().int().min(1).max(10000),
  }),
});
