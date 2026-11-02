// Private operator entry: fixed registered study only, no caller controls or roots.
import path from "node:path";
import { IdSchema } from "../../../src/lib/contracts/common";
import { invariant } from "../../../src/lib/contracts/validation";
import { freezeBooking } from "../../evaluator/booking-v1/freeze";
import { loadRegisteredTeamRuntime } from "./team-config";
import { loadOperatorStudy } from "./operator";
import { createStudyCustodyStore } from "./custody";
import {
  createSupervisedTeamTransport,
  isAdmittedSupervisedTeamTransport,
  teamCompositionBlockers,
} from "./supervised-team";
import { runPairedTournament } from "./paired";
import { retainIncompleteHandoff } from "./incomplete-handoff";
import type { RegisteredMeasurementSession } from "./registered-measurement";
export async function runRegisteredTeamTournament(
  id: string,
  signal: AbortSignal,
  measurement?: RegisteredMeasurementSession,
) {
  IdSchema.parse(id);
  const loaded = await loadRegisteredTeamRuntime(id);
  const registered = loaded?.registration;
  if (!registered?.runtime.enabled)
    return {
      kind: "blocked_paired_execution" as const,
      studyId: id,
      execution: "BLOCKED" as const,
      attempts: [],
      cleanupConfirmed: false,
      leaseReleased: false,
      blockers: [...teamCompositionBlockers],
    };
  const config = structuredClone(registered);
  const study = await loadOperatorStudy(config.studyRoot, config.study);
  invariant(
    study.definition.protocol.studyId === id,
    "Registered study mismatch.",
  );
  const transport = await createSupervisedTeamTransport(study, measurement);
  invariant(
    isAdmittedSupervisedTeamTransport(transport),
    "Concrete registered composition required.",
  );
  const outcome = await runPairedTournament({
    study,
    transport,
    protectedRoot: config.runtime.protectedRoot,
    coordinationRoot: config.runtime.coordinationRoot,
    sources: config.runtime.sources,
    reloadRuntimeAuthorization: async (variant) =>
      (await createStudyCustodyStore(config.study.custody)).load(
        config.runtime.runtimeOriginalIds[variant].paired,
      ),
    reloadStudy: () => loadOperatorStudy(config.studyRoot, config.study),
    implementationIdentity: async () => (await freezeBooking()).evaluatorSha256,
    signal: measurement ? measurement.bindSignal(signal) : signal,
  });
  // Preserve the primary outcome before any caller requests a complete report.
  // Two attempted arms do not imply two observed executions or originals.
  invariant(outcome.studyId === id, "Returned paired study mismatch.");
  await retainIncompleteHandoff({
    outputDirectory: path.join(
      config.runtime.protectedRoot,
      `paired-${outcome.studyId}`,
    ),
    runtimeOriginalRoot: config.runtime.runtimeOriginalRoot,
    outcome,
    declaredArms: study.definition.protocol.arms.map(({ variant, runId }) => ({
      variant,
      runId,
    })),
    acceptedReferences: measurement?.references(),
  });
  return outcome;
}
