import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../src/lib/report/canonical";
import { IdSchema } from "../../../src/lib/contracts/common";
import { runRegisteredTeamTournament } from "./team-operator";
import { prepareTeamRuntimeBundle } from "./team-bundle";
import { teamCompositionBlockers } from "./supervised-team";
export async function teamCli(
  args: readonly string[],
  signal = new AbortController().signal,
) {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(
      "Private fixed supervised-team operator. Default execution is disabled.\n--status\n--bundle /absolute/new/private/directory (source packaging only)\n--execute REGISTERED_STUDY_ID (requires code-owned enabled composition and both exact current originals)\nNo JSON configuration, signer, automatic retries, publication or public execution API.\n",
    );
    return 0;
  }
  if (args.length === 1 && args[0] === "--status") {
    process.stdout.write(
      canonicalJson({
        execution: "DISABLED",
        blockers: teamCompositionBlockers,
      }) + "\n",
    );
    return 2;
  }
  try {
    if (
      args.length === 2 &&
      args[0] === "--bundle" &&
      path.isAbsolute(args[1]!)
    ) {
      process.stdout.write(
        canonicalJson(await prepareTeamRuntimeBundle(args[1]!)) + "\n",
      );
      return 0;
    }
    if (args.length === 2 && args[0] === "--execute") {
      const id = IdSchema.parse(args[1]);
      const outcome = await runRegisteredTeamTournament(id, signal);
      process.stdout.write(
        canonicalJson({
          studyId: outcome.studyId,
          execution: outcome.execution,
          attempts: outcome.attempts.map((a) => ({
            variant: a.variant,
            status: a.run.status,
            finalizationConfirmed: a.finalizationConfirmed,
            cleanupConfirmed: a.cleanupConfirmed,
          })),
          cleanupConfirmed: outcome.cleanupConfirmed,
          leaseReleased: outcome.leaseReleased,
          blockers: outcome.blockers,
          comparison: "NOT_ASSESSED",
          independentExecutionCustody: "REQUIRED",
          publication: "DISABLED",
        }) + "\n",
      );
      return 2; // Mechanical observations never issue comparative acceptance.
    }
  } catch {
    process.stderr.write("Registered team operation unavailable or invalid.\n");
    return 1;
  }
  process.stderr.write("Use --help for fixed team operator commands.\n");
  return 1;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const abort = new AbortController();
  const cancel = () => abort.abort();
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    process.exitCode = await teamCli(process.argv.slice(2), abort.signal);
  } finally {
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}
