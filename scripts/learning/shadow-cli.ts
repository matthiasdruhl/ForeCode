import path from "node:path";
import { fileURLToPath } from "node:url";
import { IdSchema } from "../../src/lib/contracts/common";
import { canonicalJson } from "../../src/lib/report/canonical";
import { jsonDigest } from "../../src/lib/report/digests";
import { unprovisionedEvidenceSource, type EvidenceSource } from "./source";
import { ShadowPlanSchema } from "./shadow-contracts";
import { replayShadowPlan } from "./shadow";
import type { EvidenceLedger } from "./ledger";
import type { openLearningRegistry } from "./registry";

type Dependencies = {
  source: EvidenceSource;
  ledger: EvidenceLedger | null;
  registry: Awaited<ReturnType<typeof openLearningRegistry>> | null;
  jobs: ReadonlyMap<string, { plan: unknown; sha256: string }>;
  now(): string;
  out(value: string): void;
  error(value: string): void;
  // Trusted test composition only; there is no CLI origin switch.
  mode?: "AUTHENTIC" | "SYNTHETIC";
};

export async function shadowLearningCli(
  args: readonly string[],
  supplied?: Dependencies,
): Promise<number> {
  const d: Dependencies = supplied ?? {
    source: unprovisionedEvidenceSource,
    ledger: null,
    registry: null,
    jobs: new Map(),
    now: () => new Date().toISOString(),
    out: (s) => process.stdout.write(s),
    error: (s) => process.stderr.write(s),
  };
  const output = (value: unknown) => d.out(canonicalJson(value) + "\n");
  if (args.length === 1 && args[0] === "--help") {
    d.out(
      "Operator-local numerical shadow replay.\n--status\n--replay <approved-job-id>\nNo path, model training, experiment, signing, promotion or spending options.\n",
    );
    return 0;
  }
  if (args.length === 1 && args[0] === "--status") {
    const configured =
      d.source.configured &&
      d.ledger !== null &&
      d.registry !== null &&
      d.jobs.size > 0;
    output({
      schemaVersion: "learning-shadow-status.local.v1",
      configured,
      approvedJobs: d.jobs.size,
      policyStatus: configured ? "NOT_ASSESSED" : "NOT_TRAINED",
      modelTraining: "DISABLED",
      execution: "DISABLED",
      promotion: "DISABLED",
    });
    return configured ? 0 : 2;
  }
  if (
    args.length !== 2 ||
    args[0] !== "--replay" ||
    !IdSchema.safeParse(args[1]).success
  ) {
    d.error("Use --help for approved shadow replay.\n");
    return 1;
  }
  if (!d.source.configured || !d.ledger || !d.registry) {
    output({
      status: "BLOCKED",
      reason: "APPROVED_COMPOSITION_NOT_CONFIGURED",
    });
    return 2;
  }
  const job = d.jobs.get(args[1]!);
  if (!job) {
    output({ status: "BLOCKED", reason: "JOB_NOT_ALLOWLISTED" });
    return 2;
  }
  try {
    const plan = ShadowPlanSchema.parse(job.plan);
    if (plan.id !== args[1] || jsonDigest(plan) !== job.sha256)
      throw new Error("Job pin mismatch.");
    const result = await replayShadowPlan({
      plan,
      source: d.source,
      ledger: d.ledger,
      registry: d.registry,
      assessedAt: d.now(),
      mode: d.mode,
    });
    output({
      status: result.report.status,
      origin: result.report.origin,
      reportSha256: result.sha256,
      policySha256: result.policy.sha256,
      observations: result.report.observations.length,
      updates: result.policy.policy.updates.length,
      conclusion: result.report.conclusion,
      promotion: "DISABLED",
      execution: "DISABLED",
    });
    return result.report.status === "SHADOW" ? 0 : 2;
  } catch {
    d.error(
      "Shadow replay is unavailable or invalid; no policy was promoted.\n",
    );
    return 1;
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = await shadowLearningCli(process.argv.slice(2));
