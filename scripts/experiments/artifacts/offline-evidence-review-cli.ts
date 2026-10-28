import { parseArgs } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  readPrivateReviewInput,
  reviewConsoleSummary,
  reviewOfflineEvidence,
  writePrivateReview,
} from "./offline-evidence-review";

export const help =
  "Developer-local read-only prospective booking evidence review. No runtime, inference, registration or publication.\n--config <PRIVATE_OFFLINE_CONFIG> --request <PINNED_SELECTION_REQUEST> --output <NEW_PRIVATE_DIRECTORY> [--approval <EXPLICIT_DISCLOSURE_INPUT>]\nSee docs/OFFLINE-EVIDENCE-REVIEW.md.\n";
export function parseReviewArguments(args: string[]) {
  const { values, tokens } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      help: { type: "boolean" },
      config: { type: "string" },
      request: { type: "string" },
      output: { type: "string" },
      approval: { type: "string" },
    },
    allowNegative: false,
    tokens: true,
  });
  const names = tokens
    .filter((token) => token.kind === "option")
    .map((token) => token.name);
  if (new Set(names).size !== names.length)
    throw new Error("Duplicate options.");
  if (args.length === 0 || values.help) {
    if (args.length > 1) throw new Error("Conflicting help options.");
    return null;
  }
  if (
    !values.config ||
    !values.request ||
    !values.output ||
    args.some((v, i) => v.startsWith("--") && args.slice(0, i).includes(v))
  )
    throw new Error("Invalid arguments.");
  for (const value of [
    values.config,
    values.request,
    values.output,
    values.approval,
  ])
    if (value !== undefined && !path.isAbsolute(value))
      throw new Error("Absolute private inputs required.");
  return values as {
    config: string;
    request: string;
    output: string;
    approval?: string;
  };
}
export async function runReviewCli(
  args: string[],
  emit: (text: string) => void = (text) => process.stdout.write(text),
) {
  let options: ReturnType<typeof parseReviewArguments>;
  try {
    options = parseReviewArguments(args);
  } catch {
    emit('{"status":"INVALID_ARGUMENTS"}\n');
    return 1;
  }
  if (!options) {
    emit(help);
    return 0;
  }
  try {
    const read = async (file: string) =>
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readPrivateReviewInput(file),
        ),
      );
    const config = await read(options.config),
      request = await read(options.request);
    const approval = options.approval
      ? await read(options.approval)
      : undefined;
    const report = await reviewOfflineEvidence(config, request, approval);
    await writePrivateReview(options.output, report, config);
    emit(JSON.stringify(reviewConsoleSummary(report)) + "\n");
    return report.sourceState === "validated" &&
      (!options.approval || report.disclosure === "validated")
      ? 0
      : 2;
  } catch {
    emit('{"status":"REVIEW_UNAVAILABLE","publication":"NOT_PERFORMED"}\n');
    return 1;
  }
}
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
)
  process.exitCode = await runReviewCli(process.argv.slice(2));
