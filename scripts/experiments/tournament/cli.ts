import path from "node:path";
import { fileURLToPath } from "node:url";
import { protectedRead, privateDirectory } from "../artifacts/files";
import { realAgentExecutionBlockers } from "../runner/commitment";
import { canonicalJson } from "../../../src/lib/report/canonical";
import { buildTournamentReport, tournamentExecutionBlockers } from "./report";
import { assessFutureStudy } from "./future-study";

export async function tournamentCli(args: readonly string[]): Promise<number> {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(
      "Developer-local, no-execution tournament preparation.\n" +
        "  --status                 report unavailable independent gates\n" +
        "  --plan /absolute/plan.json validate a private local plan and report missing evidence\n" +
        "  --future-draft /absolute/draft.json validate task/oracle/preparation bindings (always blocked)\n" +
        "No approval, agent, provider, grader, artifact registration or certificate is invoked.\n",
    );
    return 0;
  }
  if (args.length === 1 && args[0] === "--status") {
    process.stdout.write(
      canonicalJson({
        execution: "DISABLED",
        blockers: tournamentExecutionBlockers,
        runtimeBlockers: realAgentExecutionBlockers,
      }) + "\n",
    );
    return 2;
  }
  if (
    args.length !== 2 ||
    !["--plan", "--future-draft"].includes(args[0]!) ||
    !path.isAbsolute(args[1]!)
  ) {
    process.stderr.write("Use --help for local tournament preparation.\n");
    return 1;
  }
  try {
    const filename = args[1]!;
    await privateDirectory(path.dirname(filename));
    const bytes = await protectedRead(filename);
    const plan: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    const report =
      args[0] === "--future-draft"
        ? assessFutureStudy({ draft: plan })
        : buildTournamentReport({ plan, attempts: [] });
    process.stdout.write(canonicalJson(report) + "\n");
    return 2;
  } catch {
    // Input may contain private paths, payloads and protected task information.
    process.stderr.write(
      "Private tournament plan is unavailable or invalid.\n",
    );
    return 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = await tournamentCli(process.argv.slice(2));
