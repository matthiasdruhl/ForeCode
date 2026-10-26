import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import path from "node:path";
import { snapshotTree } from "../evaluator/booking-v1/snapshot";
import { sha256 } from "../../src/lib/report/digests";

export async function prepareBookingWorkspace(
  sourceInput: string,
  destinationInput: string,
) {
  const source = await realpath(sourceInput);
  const destination = path.resolve(destinationInput);
  const relative = path.relative(source, destination);
  if (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  )
    throw new Error("Task export must be outside its source tree.");
  const manifest = await snapshotTree(source);
  const packageInfo = JSON.parse(
    await readFile(path.join(source, "package.json"), "utf8"),
  );
  if (packageInfo.name !== "@forecode/booking-v1")
    throw new Error("Only the reviewed booking-v1 package can be exported.");
  if (
    manifest.files.some((file) =>
      file.path
        .split("/")
        .some((part) => ["evaluator", "holdout", "scripts"].includes(part)),
    )
  )
    throw new Error(
      "Evaluator/controller/holdout files must remain outside the task export.",
    );
  await mkdir(destination); // Fails on existing directories; never overwrites user work.
  for (const file of manifest.files) {
    const bytes = await readFile(path.join(source, file.path));
    if (sha256(bytes) !== file.sha256)
      throw new Error("Source changed during task preparation.");
    const target = path.join(destination, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx" });
  }
  const exported = await snapshotTree(destination);
  if (exported.treeSha256 !== manifest.treeSha256)
    throw new Error("Export differs from the reviewed fixture snapshot.");
  return {
    directory: destination,
    treeSha256: exported.treeSha256,
    files: exported.files.length,
    executionStatus: "NOT_RUN" as const,
  };
}

// No subprocess or candidate code is launched by this command.
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const { values } = parseArgs({
    options: { output: { type: "string" } },
    strict: true,
  });
  if (!values.output || !path.isAbsolute(values.output))
    throw new Error("Pass --output with a new absolute directory path.");
  const source = fileURLToPath(
    new URL("../../fixtures/booking-v1", import.meta.url),
  );
  const result = await prepareBookingWorkspace(source, values.output);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
