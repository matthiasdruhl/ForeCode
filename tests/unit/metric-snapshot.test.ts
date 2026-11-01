import { afterEach, describe, expect, it } from "vitest";
import { chmod, mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectSealedMetricSnapshot } from "../../scripts/evaluator/booking-v1/metric-snapshot";
import { MetricProtocolSchema } from "@/lib/experiment/prospective-metrics";
import { jsonDigest, sha256 } from "@/lib/report/digests";
import { removeMetricFixture } from "../support/protected-metrics";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await removeMetricFixture(root);
});
const protocol = MetricProtocolSchema.parse({
  schemaVersion: "prospective-tournament-metrics.v1",
  studyId: "synthetic-snapshot-study",
  hypothesisId: "12345678-1234-4234-8234-123456789012",
  contextSha256: "a".repeat(64),
  taskSha256: "b".repeat(64),
  matchedConditionsSha256: "c".repeat(64),
  evaluatorSha256: "d".repeat(64),
  suiteSha256: "e".repeat(64),
  policySha256: "f".repeat(64),
  externalPackages: [],
  stylesheetPaths: [],
  boundaryRules: [
    { id: "service-self", from: "src/service.ts", to: "src/service.ts" },
  ],
  authorizationCaseIds: ["synthetic-case"],
  observationWindow: "prepared_baseline_and_sealed_final_tree",
  duplicatePolicy: "one_resolved_edge_or_case_per_arm_snapshot",
  prediction: "B_fewer_final_forbidden_edges_than_A",
});
async function source(files: Record<string, string | Buffer>) {
  const directory = await realpath(
    await mkdtemp(path.join(tmpdir(), "forecode-metric-tree-")),
  );
  roots.push(directory);
  const dirs = new Set([directory]);
  for (const [p, bytes] of Object.entries(files)) {
    let d = path.dirname(path.join(directory, p));
    await mkdir(d, { recursive: true, mode: 0o700 });
    while (d !== directory) {
      dirs.add(d);
      d = path.dirname(d);
    }
    await writeFile(path.join(directory, p), bytes, { mode: 0o400 });
  }
  for (const d of dirs) await chmod(d, 0o500);
  const manifest = Object.entries(files)
    .map(([path, bytes]) => ({ path, sha256: sha256(bytes) }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  return { directory, manifest, treeSha256: jsonDigest(manifest), protocol };
}
describe("synthetic sealed source inventory — data only", () => {
  it.each(["[id]", "[...slug]", "[[...slug]]"])(
    "enumerates and measures %s without executing the source",
    async (segment) => {
      const route = `src/app/${segment}/route.ts`;
      const input = await source({
        "src/service.ts": 'throw new Error("MUST_NOT_EXECUTE");',
        [route]: 'export * from "@/service.js";',
        "package-lock.json": "{}",
      });
      input.protocol = {
        ...protocol,
        boundaryRules: [
          { id: "dynamic-service", from: route, to: "src/service.ts" },
        ],
      };
      const result = await collectSealedMetricSnapshot(input);
      expect(result.boundary).toMatchObject({
        complete: true,
        unresolvedImports: 0,
        edges: [{ from: route, to: "src/service.ts" }],
      });
      expect(result.manifest).toHaveLength(3);
    },
  );
  it.each(["invalid-utf8", "source-file-limit", "full-file-limit"])(
    "rejects %s even when the manifest hashes match",
    async (defect) => {
      const input = await source(
        defect === "invalid-utf8"
          ? { "src/service.ts": Buffer.from([0xff]) }
          : defect === "source-file-limit"
            ? { "src/service.ts": " ".repeat(262145) }
            : { "package-lock.json": " ".repeat(2_097_153) },
      );
      await expect(collectSealedMetricSnapshot(input)).rejects.toThrow();
    },
  );
  it("abstains on unsupported assets and unmeasurable source syntax", async () => {
    const asset = await source({
      "src/service.ts": 'import "./image.svg";',
      "src/image.svg": "<svg/>",
    });
    expect((await collectSealedMetricSnapshot(asset)).boundary).toMatchObject({
      complete: false,
      unresolvedImports: 1,
    });
    const invalid = await source({ "src/service.ts": "const = invalid" });
    expect(
      (await collectSealedMetricSnapshot(invalid)).boundary.unresolvedImports,
    ).toBeGreaterThan(0);
  });
  it("enforces the exact frozen stylesheet inventory", async () => {
    const input = await source({
      "src/service.ts": 'import "./style.css";',
      "src/style.css": "body{}",
    });
    expect((await collectSealedMetricSnapshot(input)).boundary.complete).toBe(
      false,
    );
    input.protocol = { ...protocol, stylesheetPaths: ["src/style.css"] };
    expect((await collectSealedMetricSnapshot(input)).boundary).toMatchObject({
      complete: true,
      unresolvedImports: 0,
      edges: [],
    });
  });
  it("refuses a partial source manifest and a wrong source hash", async () => {
    const input = await source({
      "src/service.ts": "",
      "package-lock.json": "{}",
    });
    const manifest = input.manifest.slice(0, 1);
    await expect(
      collectSealedMetricSnapshot({
        ...input,
        manifest,
        treeSha256: jsonDigest(manifest),
      }),
    ).rejects.toThrow();
    await expect(
      collectSealedMetricSnapshot({ ...input, treeSha256: "0".repeat(64) }),
    ).rejects.toThrow();
  });
});

describe("v3 exact static assets with full reviewed fixture inventory", () => {
  async function complete() {
    const { completeBookingSource } =
      await import("../support/complete-booking-source");
    const original = await completeBookingSource();
    expect(original.manifest).toHaveLength(22);
    expect(original.treeSha256).toBe(
      "e49687620469faad10637bac404b2f9a1c4973a12a55b2740eb7d904da5988d1",
    );
    const p = MetricProtocolSchema.parse({
      ...protocol,
      schemaVersion: "prospective-tournament-metrics.v3",
      baselineAuthorization: "not_applicable_before_future_requirement",
      staticAssets: [
        {
          path: "src/app/icon.svg",
          sha256: sha256(original.files["src/app/icon.svg"]!),
        },
      ],
      externalPackages: ["react", "next", "server-only", "zod", "node:crypto"],
      stylesheetPaths: ["src/app/style.css"],
      boundaryRules: [
        {
          id: "http-store",
          from: "src/server/http.ts",
          to: "src/server/booking-store.ts",
        },
      ],
    });
    return { original, p };
  }
  it("measures all 22 sealed files and only omits the exact precommitted icon from syntax parsing", async () => {
    const { original, p } = await complete();
    const input = await source(original.files);
    const result = await collectSealedMetricSnapshot({ ...input, protocol: p });
    expect(result.manifest).toEqual(original.manifest);
    expect(result.treeSha256).toBe(original.treeSha256);
    expect(result.boundary).toMatchObject({
      complete: true,
      unresolvedImports: 0,
    });
    expect(result.boundary.edges).not.toContainEqual({
      from: "src/server/http.ts",
      to: "src/server/booking-store.ts",
    });
    for (const version of [
      "prospective-tournament-metrics.v1",
      "prospective-tournament-metrics.v2",
    ] as const) {
      const {
        staticAssets: _,
        baselineAuthorization: na,
        ...legacy
      } = p as Extract<
        typeof p,
        { schemaVersion: "prospective-tournament-metrics.v3" }
      >;
      void _;
      expect(
        (
          await collectSealedMetricSnapshot({
            ...input,
            protocol: MetricProtocolSchema.parse({
              ...legacy,
              schemaVersion: version,
              ...(version.endsWith("v2") ? { baselineAuthorization: na } : {}),
            }),
          })
        ).boundary.complete,
      ).toBe(false);
    }
  });
  it.each([
    "changed-svg",
    "bom-svg",
    "wrong-sha",
    "missing-svg",
    "unregistered-svg",
    "new-js",
    "import-svg",
    "dynamic-load",
  ])(
    "keeps %s unknown even with a consistent sealed manifest",
    async (defect) => {
      const { original, p } = await complete();
      const files: Record<string, string | Buffer> = { ...original.files };
      let configured = p;
      if (defect === "changed-svg") files["src/app/icon.svg"] += "\n";
      if (defect === "bom-svg")
        files["src/app/icon.svg"] = Buffer.concat([
          Buffer.from([0xef, 0xbb, 0xbf]),
          Buffer.from(original.files["src/app/icon.svg"]!),
        ]);
      if (defect === "wrong-sha")
        configured = MetricProtocolSchema.parse({
          ...p,
          staticAssets: [{ path: "src/app/icon.svg", sha256: "0".repeat(64) }],
        });
      if (defect === "missing-svg") delete files["src/app/icon.svg"];
      if (defect === "unregistered-svg") files["src/app/other.svg"] = "<svg/>";
      if (defect === "new-js")
        files["src/server/hidden.js"] = "throw new Error('MUST NOT EXECUTE')";
      if (defect === "import-svg")
        files["src/server/http.ts"] += '\nimport "../app/icon.svg";';
      if (defect === "dynamic-load")
        files["src/server/http.ts"] += '\nimport("./booking-store");';
      const result = await collectSealedMetricSnapshot({
        ...(await source(files)),
        protocol: configured,
      });
      expect(result.boundary.unresolvedImports).toBeGreaterThan(0);
    },
  );
  it.each([
    "src/code.ts",
    "src/code.tsx",
    "src/code.js",
    "src/style.css",
    "../icon.svg",
    "/src/icon.svg",
    "src/../icon.svg",
  ])("rejects executable or unsafe asset path %s", async (assetPath) => {
    const { p } = await complete();
    expect(() =>
      MetricProtocolSchema.parse({
        ...p,
        staticAssets: [{ path: assetPath, sha256: "a".repeat(64) }],
      }),
    ).toThrow();
  });
  it("requires an explicit unique asset commitment and preserves legacy parsed bytes", async () => {
    const { p } = await complete();
    expect(() =>
      MetricProtocolSchema.parse({ ...p, staticAssets: undefined }),
    ).toThrow();
    expect(() =>
      MetricProtocolSchema.parse({
        ...p,
        staticAssets: [
          { path: "src/app/icon.svg", sha256: "a".repeat(64) },
          { path: "src/app/icon.svg", sha256: "b".repeat(64) },
        ],
      }),
    ).toThrow();
    expect(jsonDigest(MetricProtocolSchema.parse(protocol))).toBe(
      jsonDigest(protocol),
    );
    expect(() =>
      MetricProtocolSchema.parse({ ...protocol, staticAssets: [] }),
    ).toThrow();
    const v2 = {
      ...protocol,
      schemaVersion: "prospective-tournament-metrics.v2",
      baselineAuthorization: "not_applicable_before_future_requirement",
    };
    expect(jsonDigest(MetricProtocolSchema.parse(v2))).toBe(jsonDigest(v2));
    expect(() =>
      MetricProtocolSchema.parse({ ...v2, staticAssets: [] }),
    ).toThrow();
  });
});
