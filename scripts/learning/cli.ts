import path from "node:path";
import { fileURLToPath } from "node:url";
import { IdSchema } from "../../src/lib/contracts/common";
import { canonicalJson } from "../../src/lib/report/canonical";
import { unprovisionedEvidenceSource, type EvidenceSource } from "./source";
import type { EvidenceLedger } from "./ledger";
import { assessReward } from "./reward";

type Dependencies = {
  source: EvidenceSource;
  ledger: EvidenceLedger | null;
  now(): string;
  out(text: string): void;
  error(text: string): void;
};
// Operator composition is intentionally unprovisioned. CLI arguments cannot
// supply keys, artifact roots, uploads, origin overrides or training capability.
export async function learningEvidenceCli(
  args: readonly string[],
  supplied?: Dependencies,
): Promise<number> {
  const d: Dependencies = supplied ?? {
    source: unprovisionedEvidenceSource,
    ledger: null,
    now: () => new Date().toISOString(),
    out: (s) => process.stdout.write(s),
    error: (s) => process.stderr.write(s),
  };
  const output = (value: unknown) => d.out(canonicalJson(value) + "\n");
  if (args.length === 1 && args[0] === "--help") {
    d.out(
      "Developer-local approved learning evidence intake.\n--status\n--inspect <allowlisted-id>\n--admit <allowlisted-id>\nNo path, signing, training or execution options.\n",
    );
    return 0;
  }
  if (args.length === 1 && args[0] === "--status") {
    output({
      schemaVersion: "learning-intake-status.v1",
      sourceConfigured: d.source.configured,
      sourceEntries: d.source.entryCount,
      ledgerConfigured: d.ledger !== null,
      training: "DISABLED",
      execution: "DISABLED",
    });
    return d.source.configured && d.ledger ? 0 : 2;
  }
  if (
    args.length !== 2 ||
    !["--inspect", "--admit"].includes(args[0]!) ||
    !IdSchema.safeParse(args[1]).success
  ) {
    d.error("Use --help for approved evidence intake.\n");
    return 1;
  }
  try {
    if (args[0] === "--admit" && d.ledger === null) {
      output({ status: "BLOCKED", reason: "AUDIT_LEDGER_NOT_CONFIGURED" });
      return 2;
    }
    const at = d.now(),
      result = await d.source.load(args[1]!, at);
    const audit =
      args[0] === "--admit"
        ? await d.ledger!.append({ sourceId: args[1]!, at, result })
        : null;
    if (result.status !== "ADMITTED") {
      output({
        status: result.status,
        reason: result.reason,
        auditHead: audit?.head ?? null,
      });
      return result.status === "BLOCKED" ? 2 : 1;
    }
    const o = result.observation;
    // The source already enforces its origin mode. Explicit synthetic test
    // composition is kept visibly separate; no CLI switch can enable it.
    const rewards = assessReward(o, o.projection.origin);
    output({
      status: audit?.entry.record.status ?? "INSPECTED",
      origin: o.projection.origin,
      observationSha256: o.sha256,
      comparison: o.projection.comparison,
      rewardEligible:
        audit?.entry.record.status !== "REPLAY" &&
        rewards.some((r) => r.correctness !== null),
      policyUpdated: false,
      auditHead: audit?.head ?? null,
    });
    return audit?.entry.record.status !== "REPLAY" &&
      rewards.some((r) => r.correctness !== null)
      ? 0
      : 2;
  } catch {
    d.error(
      "Approved evidence or its audit ledger is unavailable or invalid.\n",
    );
    return 1;
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = await learningEvidenceCli(process.argv.slice(2));
