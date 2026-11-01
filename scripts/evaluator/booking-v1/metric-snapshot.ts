// Evaluator-only data capture. Never imports, builds, or executes candidate code.
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { Sha256Schema } from "../../../src/lib/contracts/common";
import { invariant } from "../../../src/lib/contracts/validation";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import {
  MetricProtocolSchema,
  MetricSourcePathSchema,
  type MetricProtocol,
} from "../../../src/lib/experiment/prospective-metrics";
import {
  privateDirectory,
  protectedRead,
} from "../../experiments/artifacts/files";
import { SourceManifestSchema } from "../../experiments/tournament/source-manifest";
import { collectBoundaryMetrics } from "../../experiments/tournament/boundary-metrics";

export function validateMetricManifest(input: unknown, treeSha256: string) {
  const manifest = SourceManifestSchema.parse(input);
  invariant(
    manifest.every((file, i) => !i || manifest[i - 1]!.path < file.path) &&
      jsonDigest(manifest) === Sha256Schema.parse(treeSha256),
    "Noncanonical or mismatched sealed manifest.",
  );
  return manifest;
}

// This helper alone confers no authority: expectedManifest/tree must come from
// authenticated prepared/runtime originals, never a worker file map. The reader
// redoes this capture and requires independent custody of the observation.
export async function collectSealedMetricSnapshot(input: {
  directory: string;
  manifest: unknown;
  treeSha256: string;
  protocol: MetricProtocol;
}) {
  const protocol = MetricProtocolSchema.parse(input.protocol);
  const manifest = validateMetricManifest(input.manifest, input.treeSha256);
  const root = await privateDirectory(input.directory);
  const expected = new Map(manifest.map((f) => [f.path, f.sha256]));
  async function scan() {
    const files: Record<string, string> = Object.create(null);
    const found: { path: string; sha256: string }[] = [];
    let visited = 0,
      total = 0,
      sourceBytes = 0;
    async function walk(directory: string, prefix = "") {
      const stat = await lstat(directory);
      invariant(
        stat.isDirectory() &&
          !stat.isSymbolicLink() &&
          stat.uid === process.getuid?.() &&
          (stat.mode & 0o222) === 0,
        "Metric directories must be sealed.",
      );
      for (const entry of (
        await readdir(directory, { withFileTypes: true })
      ).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const relative = prefix + entry.name;
        invariant(
          ++visited <= 2000 && relative.split("/").length <= 32,
          "Metric traversal bound.",
        );
        // Check names before forming a filesystem target. No ignored files or
        // directories: generated, hidden, extra and linked entries fail closed.
        invariant(
          /^[A-Za-z0-9_.[\]-]+$/.test(entry.name) &&
            entry.name !== "." &&
            entry.name !== ".." &&
            !entry.name.startsWith(".env"),
          "Unsafe metric path.",
        );
        const target = path.join(directory, entry.name);
        const info = await lstat(target);
        if (info.isDirectory() && !info.isSymbolicLink()) {
          invariant(
            [...expected.keys()].some((p) => p.startsWith(relative + "/")),
            "Unmanifested directory.",
          );
          await walk(target, relative + "/");
        } else {
          invariant(
            expected.has(relative) &&
              info.isFile() &&
              !info.isSymbolicLink() &&
              (info.mode & 0o222) === 0,
            "Unmanifested or unsealed source file.",
          );
          const bytes = await protectedRead(target, 2_097_152);
          invariant(
            (total += bytes.length) <= 8_000_000 &&
              sha256(bytes) === expected.get(relative),
            "Sealed source changed.",
          );
          found.push({ path: relative, sha256: sha256(bytes) });
          if (relative.startsWith("src/")) {
            invariant(
              bytes.length <= 262144 &&
                (sourceBytes += bytes.length) <= 4_194_304,
              "Source bound.",
            );
            files[relative] = new TextDecoder("utf-8", { fatal: true }).decode(
              bytes,
            );
          }
        }
      }
    }
    await walk(root);
    found.sort((a, b) => (a.path < b.path ? -1 : 1));
    invariant(
      jsonDigest(found) === input.treeSha256,
      "Incomplete sealed source inventory.",
    );
    return files;
  }
  const files = await scan();
  // Detect replacement/mutation while parsing or enumerating. Custody and a
  // worker-inaccessible immutable export are still required; hashing is not a
  // defense against an authorized operator deliberately replacing both views.
  // Only v3 can omit exact precommitted opaque SVGs from the static parser.
  // Inventory/tree hashing still includes every asset. An absent/changed asset
  // makes the entire observation unknown, even if the new tree is self-consistent.
  const assets =
    protocol.schemaVersion === "prospective-tournament-metrics.v3"
      ? protocol.staticAssets
      : [];
  const assetPaths = new Set(assets.map((asset) => asset.path));
  const assetMismatch = assets.some(
    (asset) =>
      !Object.hasOwn(files, asset.path) ||
      expected.get(asset.path) !== asset.sha256,
  );
  const measuredFiles = Object.fromEntries(
    Object.entries(files).filter(([p]) => !assetPaths.has(p)),
  );
  const unsupported =
    assetMismatch ||
    Object.keys(measuredFiles).some(
      (p) =>
        !MetricSourcePathSchema.safeParse(p).success &&
        !protocol.stylesheetPaths.includes(p),
    );
  const boundary =
    unsupported || Object.keys(measuredFiles).length === 0
      ? {
          complete: false,
          unresolvedImports: 1,
          scannedRuleIds: protocol.boundaryRules.map((r) => r.id),
          edges: [],
        }
      : collectBoundaryMetrics(measuredFiles, protocol);
  invariant(
    jsonDigest(files) === jsonDigest(await scan()),
    "Source changed during measurement.",
  );
  return { treeSha256: input.treeSha256, manifest, boundary };
}

export type SealedMetricSnapshot = Awaited<
  ReturnType<typeof collectSealedMetricSnapshot>
>;
