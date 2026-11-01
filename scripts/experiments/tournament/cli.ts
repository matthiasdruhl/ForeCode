import path from "node:path";
import { inspectApprovedTournamentPublication } from "../../../src/server/artifacts/recording-catalog";
import { fileURLToPath } from "node:url";
import { protectedRead, privateDirectory } from "../artifacts/files";
import { teamCompositionBlockers } from "./supervised-team";
import { realAgentExecutionBlockers } from "../runner/commitment";
import { canonicalJson } from "../../../src/lib/report/canonical";
import { buildTournamentReport, tournamentExecutionBlockers } from "./report";
import { assessFutureStudy } from "./future-study";
import {
  configuredStudies,
  loadOperatorStudy,
  readStudyInput,
  recordExternalCommitment,
} from "./operator";
import { protocolSubject, validateStudyDefinition } from "./study";
import {
  configuredTournamentReports,
  loadPrivateTournamentReport,
} from "./report-operator";

export async function tournamentCli(args: readonly string[]): Promise<number> {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(
      "Developer-local, no-execution tournament preparation.\n" +
        "  --status                 report unavailable independent gates\n" +
        "  --publication-status     read configured disclosure/receipt availability (safe codes only)\n" +
        "  --plan /absolute/plan.json validate a private local plan and report missing evidence\n" +
        "  --future-draft /absolute/draft.json validate task/oracle/preparation bindings (always blocked)\n" +
        "  --definition /absolute/study-root validate preselection definition (no B required)\n" +
        "  --protocol /absolute/study-root inspect protocol commitment proposal\n" +
        "  --readiness /absolute/study-root freshly check independently held records\n" +
        "  --record-protocol /absolute/study-root index an authorized external original\n" +
        "  --record-prepared /absolute/study-root index the final external original\n" +
        "  --report /absolute/study-root authenticate private original outcomes (no execution)\n" +
        "No approval, agent, provider, grader, artifact registration or certificate is invoked.\n",
    );
    return 0;
  }
  if (args.length === 1 && args[0] === "--publication-status") {
    const inspection = await inspectApprovedTournamentPublication();
    process.stdout.write(canonicalJson(inspection) + "\n");
    return inspection.state === "available" && inspection.unavailableCount === 0
      ? 0
      : inspection.state === "empty"
        ? 2
        : 1;
  }
  if (args.length === 1 && args[0] === "--status") {
    process.stdout.write(
      canonicalJson({
        execution: "DISABLED",
        blockers: tournamentExecutionBlockers,
        runtimeBlockers: realAgentExecutionBlockers,
        teamRuntimeBlockers: teamCompositionBlockers,
      }) + "\n",
    );
    return 2;
  }
  if (
    args.length === 2 &&
    args[0] === "--report" &&
    path.isAbsolute(args[1]!)
  ) {
    try {
      const root = args[1]!;
      validateStudyDefinition(await readStudyInput(root, "definition"));
      const config = configuredTournamentReports.get(root);
      if (!config)
        process.stdout.write(
          canonicalJson({
            execution: "DISABLED",
            correctness: "INCONCLUSIVE",
            blockers: ["ORIGINAL_REPORT_CUSTODY_NOT_CONFIGURED"],
          }) + "\n",
        );
      else
        process.stdout.write(
          canonicalJson(await loadPrivateTournamentReport(root, config)) + "\n",
        );
      return 2;
    } catch {
      process.stderr.write(
        "Private original study report is unavailable or invalid.\n",
      );
      return 1;
    }
  }
  if (
    args.length === 2 &&
    [
      "--definition",
      "--protocol",
      "--readiness",
      "--record-protocol",
      "--record-prepared",
    ].includes(args[0]!) &&
    path.isAbsolute(args[1]!)
  ) {
    try {
      const root = args[1]!;
      const definition = validateStudyDefinition(
        await readStudyInput(root, "definition"),
      );
      const base = {
        studyId: definition.protocol.studyId,
        definitionSha256: protocolSubject(definition),
        execution: "DISABLED",
        evidenceOrigin: "none",
      };
      const config = configuredStudies.get(root);
      if (args[0] === "--definition" || args[0] === "--protocol")
        process.stdout.write(
          canonicalJson({ ...base, status: "PROPOSAL_ONLY" }) + "\n",
        );
      else if (!config)
        process.stdout.write(
          canonicalJson({
            ...base,
            status: "BLOCKED",
            blockers: ["EXTERNAL_CUSTODY_NOT_CONFIGURED"],
          }) + "\n",
        );
      else if (args[0] === "--readiness") {
        await loadOperatorStudy(root, config);
        process.stdout.write(
          canonicalJson({
            ...base,
            status: "PREPARATION_AUTHENTICATED",
            blockers: ["EXACT_PAIRED_RUNTIME_ADMISSION_REQUIRED"],
          }) + "\n",
        );
      } else
        process.stdout.write(
          canonicalJson(
            await recordExternalCommitment(
              root,
              config,
              args[0] === "--record-protocol" ? "protocol" : "prepared",
            ),
          ) + "\n",
        );
      return 2;
    } catch {
      process.stderr.write(
        "Private study records are unavailable or invalid.\n",
      );
      return 1;
    }
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
