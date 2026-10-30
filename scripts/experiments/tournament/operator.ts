import { open, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateDirectory, protectedRead, disjoint } from "../artifacts/files";
import { canonicalJson } from "../../../src/lib/report/canonical";
import { invariant } from "../../../src/lib/contracts/validation";
import { createStudyCustodyStore, type CustodyConfig } from "./custody";
import {
  validateStudyDefinition,
  protocolSubject,
  validatePreparedStudy,
} from "./study";

export type OperatorStudyConfig = {
  custody: CustodyConfig;
  protocolId: string;
  preparedId: string;
  preparationAuthorizationIds: readonly string[];
  preparationTelemetryId?: string;
};
// Reviewed code-owned composition only; no request/env-selected authority/key.
export const configuredStudies: ReadonlyMap<string, OperatorStudyConfig> =
  new Map();
export async function readStudyInput(
  root: string,
  name: "definition" | "draft" | "preparation",
) {
  const directory = await privateDirectory(root);
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  disjoint(directory, repository);
  disjoint(directory, path.resolve(repository, "../AgentHarness-Planning"));
  const bytes = await protectedRead(path.join(directory, `${name}.json`));
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  ) as unknown;
}
export async function loadOperatorStudy(
  root: string,
  config: OperatorStudyConfig,
) {
  const directory = await privateDirectory(root);
  disjoint(directory, await realpath(config.custody.originalRoot));
  for (const workspace of config.custody.workspaceRoots)
    disjoint(directory, await realpath(workspace));
  const store = await createStudyCustodyStore(config.custody);
  const definition = await readStudyInput(root, "definition");
  const draft = await readStudyInput(root, "draft");
  const evidence = await readStudyInput(root, "preparation");
  const authorizations = new Map<string, unknown>();
  for (const id of config.preparationAuthorizationIds)
    authorizations.set(id, await store.load(id));
  return validatePreparedStudy({
    definition,
    draft,
    evidence,
    protocol: await store.load(config.protocolId),
    prepared: await store.load(config.preparedId),
    authorizations,
    preparationTelemetry: config.preparationTelemetryId
      ? await store.load(config.preparationTelemetryId)
      : null,
  });
}
// Exclusive, synced index to the independently held original, not a new approval.
// Existing originals/failed attempts can never be overwritten by recovery.
export async function recordExternalCommitment(
  root: string,
  config: OperatorStudyConfig,
  phase: "protocol" | "prepared",
) {
  const directory = await privateDirectory(root);
  disjoint(directory, await realpath(config.custody.originalRoot));
  for (const workspace of config.custody.workspaceRoots)
    disjoint(directory, await realpath(workspace));
  const definition = validateStudyDefinition(
    await readStudyInput(root, "definition"),
  );
  const store = await createStudyCustodyStore(config.custody);
  const held = await store.load(
    phase === "protocol" ? config.protocolId : config.preparedId,
  );
  invariant(
    held &&
      held.record.studyId === definition.protocol.studyId &&
      held.record.kind === phase,
    "Original commitment unavailable.",
  );
  if (phase === "protocol")
    invariant(
      held.record.subjectSha256 === protocolSubject(definition) &&
        held.record.predecessorSha256 === null,
      "Protocol commitment mismatch.",
    );
  else
    invariant(
      (await loadOperatorStudy(root, config)).prepared.sha256 === held.sha256,
      "Prepared commitment mismatch.",
    );
  const handle = await open(
    path.join(directory, `${phase}-original-index.json`),
    "wx",
    0o400,
  );
  try {
    await handle.writeFile(
      canonicalJson({ recordId: held.record.id, originalSha256: held.sha256 }),
    );
    await handle.sync();
  } finally {
    await handle.close();
  }
  return { phase, originalSha256: held.sha256, execution: "DISABLED" as const };
}
