import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chmod,
  link,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  SourcePublicationSchema,
  projectSourcePublication,
  sourceDisclosureSubject,
  type SourcePublication,
} from "@/lib/experiment/source-publication";
import { jsonDigest, sha256 } from "@/lib/report/digests";
import { canonicalJson } from "@/lib/report/canonical";
import { createTournamentPublicationReader } from "@/server/artifacts/tournament-provisioning";
import { sourcePublicationFixture } from "../support/source-publication";
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const f = await sourcePublicationFixture();
  roots.push(f.parent);
  vi.spyOn(Date, "now").mockReturnValue(f.now);
  return f;
}
async function replace(file: string, text: string) {
  await chmod(file, 0o600);
  await writeFile(file, text);
  await chmod(file, 0o400);
}
describe("fresh bounded source disclosure", () => {
  it("defaults empty, authenticates four roles, and exposes only disclosed text paths", async () => {
    expect(
      await createTournamentPublicationReader(null).loadSourceEvidence(),
    ).toEqual({ state: "empty", evidence: [], unavailableCount: 0 });
    const f = await fixture(),
      reader = f.reader(),
      catalog = await reader.loadSourceEvidence();
    expect(catalog).toMatchObject({ state: "available", unavailableCount: 0 });
    const evidence = catalog.evidence[0]!;
    expect(evidence.snapshots).toHaveLength(4);
    expect(evidence.comparisons.map((item) => item.id)).toEqual([
      "preparation-B",
      "downstream-A",
      "downstream-B",
    ]);
    expect(evidence.comparisons[0]!.files[0]).toMatchObject({
      path: "src/service.ts",
      change: "modified",
      state: "available",
    });
    const serialized = JSON.stringify(evidence);
    for (const privateValue of [
      "manifest",
      "package-lock.json",
      "publicKey",
      f.root,
      "src/policy.ts",
    ])
      expect(serialized).not.toContain(privateValue);
    expect((await reader.loadTournaments()).studies).toEqual([
      f.artifact.projection,
    ]);
    expect((await reader.loadReports()).reports).toHaveLength(1);
    const invalidSource = {
      ...f.config,
      sourceEvidence: {
        ...f.supplement,
        custody: { ...f.supplement.custody, publicKeySha256: "0".repeat(64) },
      },
    };
    const isolatedReader = createTournamentPublicationReader(
      invalidSource,
      () => f.now,
    );
    expect((await isolatedReader.loadSourceEvidence()).evidence).toEqual([]);
    expect(await isolatedReader.loadTournaments()).toEqual(
      await reader.loadTournaments(),
    );
    expect(await isolatedReader.loadReports()).toEqual(
      await reader.loadReports(),
    );
    expect(await isolatedReader.loadProspectiveEvidence()).toEqual(
      await reader.loadProspectiveEvidence(),
    );
    expect(sourceDisclosureSubject(f.evidence)).toBe(jsonDigest(f.evidence));
    const absent = { ...f.config };
    delete absent.sourceEvidence;
    expect(
      (
        await createTournamentPublicationReader(
          absent,
          () => f.now,
        ).loadSourceEvidence()
      ).state,
    ).toBe("empty");
  });
  it.each([
    "study",
    "report",
    "projection",
    "prepared",
    "tree",
    "run",
    "shared-run",
    "cross-role",
    "final-null-run",
  ])("rejects re-signed %s joins", async (defect) => {
    const f = await fixture(),
      input = structuredClone(f.evidence);
    if (defect === "study") input.studyId = "other-study";
    if (defect === "report") input.reportSha256 = "0".repeat(64);
    if (defect === "projection") input.projectionSha256 = "0".repeat(64);
    if (defect === "prepared") input.preparedOriginalSha256 = "0".repeat(64);
    if (defect === "tree") input.snapshots[0]!.treeSha256 = "0".repeat(64);
    if (defect === "run") input.snapshots[2]!.runId = "other-run";
    if (defect === "shared-run")
      input.snapshots[0]!.runId = f.artifact.projection.arms[0]!.runId;
    if (defect === "cross-role") {
      input.snapshots[2]!.role = "B-final";
      input.snapshots[3]!.role = "A-final";
    }
    if (defect === "final-null-run") input.snapshots[2]!.runId = null;
    await f.hold(input);
    expect((await f.reader().loadSourceEvidence()).evidence).toEqual([]);
  });
  it.each([
    "authority",
    "revocation-pin",
    "workspace",
    "duplicate-disclosure",
    "unregistered-custody",
    "unregistered-study",
  ])("rejects %s configuration", async (defect) => {
    const f = await fixture();
    if (defect === "authority") f.supplement.custody.publicKeyPem += " ";
    if (defect === "revocation-pin")
      f.supplement.custody.revocationSha256 = "0".repeat(64);
    if (defect === "workspace")
      f.supplement.custody.workspaceRoots = [f.parent];
    if (defect === "duplicate-disclosure" || defect === "unregistered-study")
      (f.supplement.entries as Map<string, { disclosureId: string }>).set(
        "other-study",
        {
          disclosureId:
            defect === "duplicate-disclosure" ? f.held.id : "other-original",
        },
      );
    if (defect === "unregistered-custody")
      (f.supplement.custody.entries as Map<string, unknown>).set(
        "other-original",
        {},
      );
    expect((await f.reader().loadSourceEvidence()).evidence).toEqual([]);
  });
  it.each([
    "document",
    "signature",
    "key",
    "revocations",
    "removed",
    "writable",
    "symlink",
    "hardlink",
    "root-mode",
    "root-symlink",
    "file-size",
    "base",
    "expired",
    "future-held",
    "predecessor",
    "kind",
    "custody-study",
  ])("withholds on next read after %s", async (defect) => {
    const f = await fixture(),
      reader = f.reader();
    expect((await reader.loadSourceEvidence()).evidence).toHaveLength(1);
    const document = path.join(f.root, f.held.documentFile),
      envelope = path.join(f.root, f.held.id + ".json");
    if (defect === "document") await replace(document, "{}");
    if (defect === "signature") {
      const input = JSON.parse(await readFile(envelope, "utf8"));
      input.signature = Buffer.alloc(64).toString("base64");
      await replace(envelope, canonicalJson(input));
    }
    if (defect === "key") f.supplement.custody.publicKeySha256 = "0".repeat(64);
    if (defect === "revocations")
      await replace(
        path.join(f.root, "revocations.json"),
        canonicalJson({ revokedIds: [f.held.id] }),
      );
    if (defect === "removed") await rm(document);
    if (defect === "writable") await chmod(document, 0o600);
    if (defect === "symlink" || defect === "hardlink") {
      const target = path.join(f.parent, "synthetic-document.json");
      await writeFile(target, await readFile(document), { mode: 0o400 });
      await rm(document);
      if (defect === "symlink") await symlink(target, document);
      else await link(target, document);
    }
    if (defect === "root-mode") await chmod(f.root, 0o777);
    if (defect === "root-symlink") {
      const alias = path.join(f.parent, "synthetic-root-alias");
      await symlink(f.root, alias);
      f.supplement.custody.originalRoot = alias;
    }
    if (defect === "file-size") {
      const bytes = "x".repeat(1024 * 1024 + 1);
      await replace(document, bytes);
      const entry = f.supplement.custody.entries.get(f.held.id)!;
      (entry as { documentSha256: string }).documentSha256 = sha256(bytes);
    }
    if (defect === "base") await replace(f.publicationFile, "{}");
    if (defect === "expired") {
      await f.hold(f.evidence, {
        expiresAt: new Date(f.now + 10).toISOString(),
      });
      f.advance(11);
    }
    if (defect === "future-held")
      await f.hold(f.evidence, {
        heldAt: new Date(f.now + 1000).toISOString(),
      });
    if (defect === "predecessor")
      await f.hold(f.evidence, { predecessorSha256: "0".repeat(64) });
    if (defect === "kind") await f.hold(f.evidence, { kind: "prepared" });
    if (defect === "custody-study")
      await f.hold(f.evidence, { studyId: "other-study" });
    expect((await reader.loadSourceEvidence()).evidence).toEqual([]);
  });
  it.each([
    "duplicate-role",
    "duplicate-path",
    "duplicate-body",
    "config-body",
    "env-body",
    "unsorted",
    "traversal",
    "absolute",
    "empty-segment",
    "unsafe-body",
    "body-absent",
    "body-hash",
    "cross-body",
    "surrogate",
    "control",
    "body-bound",
    "manifest-bound",
    "bodies-bound",
    "document-bound",
  ])("rejects %s input before presentation", async (defect) => {
    const f = await fixture(),
      input = structuredClone(f.evidence),
      snap = input.snapshots[0]!;
    if (defect === "duplicate-role") input.snapshots.push(snap);
    if (defect === "duplicate-path") snap.manifest.push(snap.manifest[0]!);
    if (defect === "duplicate-body") snap.bodies.push({ ...snap.bodies[0]! });
    if (defect === "config-body") snap.bodies[0]!.path = "src/server/config.ts";
    if (defect === "env-body") snap.bodies[0]!.path = "src/environment.ts";
    if (defect === "unsorted") snap.manifest.reverse();
    if (defect === "traversal") snap.manifest[0]!.path = "src/../x.ts";
    if (defect === "absolute") snap.manifest[0]!.path = "/src/x.ts";
    if (defect === "empty-segment") snap.manifest[0]!.path = "src//x.ts";
    if (defect === "unsafe-body")
      snap.bodies[0]!.path = "src/__tests__/secret.ts";
    if (defect === "body-absent") snap.bodies[0]!.path = "src/absent.ts";
    if (defect === "body-hash") snap.bodies[0]!.sha256 = "0".repeat(64);
    if (defect === "cross-body")
      snap.bodies[0] = input.snapshots[1]!.bodies[0]!;
    if (defect === "surrogate") snap.bodies[0]!.text = "\ud800";
    if (defect === "control") snap.bodies[0]!.text = "\u001b";
    if (defect === "body-bound") snap.bodies[0]!.text = "é".repeat(17_000);
    if (defect === "manifest-bound")
      snap.manifest = Array.from({ length: 101 }, (_, i) => ({
        path: `src/${i}.ts`,
        sha256: sha256(""),
      }));
    if (defect === "bodies-bound")
      snap.bodies = Array.from({ length: 21 }, () => ({ ...snap.bodies[0]! }));
    if (defect === "document-bound")
      input.scopeLimitations = ["x".repeat(901 * 1024)];
    expect(SourcePublicationSchema.safeParse(input).success).toBe(false);
  });
  it("retains preparation with an explicitly absent downstream run", async () => {
    const f = await fixture(),
      base = structuredClone(f.artifact.projection),
      input = structuredClone(f.evidence);
    base.arms[1]!.runId = null;
    base.arms[1]!.finalTreeSha256 = null;
    base.arms[1]!.status = "not_run";
    input.snapshots = input.snapshots.filter(
      (item) => item.role === "shared-original" || item.role === "B-prepared",
    );
    input.snapshots[1]!.runId = null;
    input.projectionSha256 = jsonDigest(base);
    expect(
      projectSourcePublication(input, base, input.reportSha256).comparisons[0]!
        .state,
    ).toBe("available");
    input.snapshots[1]!.runId = "fabricated-run";
    expect(() =>
      projectSourcePublication(input, base, input.reportSha256),
    ).toThrow();
  });
  it.each(["aggregate-bytes", "serialized-bytes"])(
    "rejects %s across individually valid bodies",
    async (defect) => {
      const f = await fixture(),
        input = structuredClone(f.evidence),
        snap = input.snapshots[0]!;
      const text = (defect === "serialized-bytes" ? "\r" : "x").repeat(32768);
      snap.bodies = Array.from(
        { length: defect === "serialized-bytes" ? 14 : 9 },
        (_, i) => ({
          path: `src/source${i.toString().padStart(2, "0")}.ts`,
          sha256: sha256(text),
          text,
        }),
      );
      snap.manifest = snap.bodies.map(({ path, sha256 }) => ({ path, sha256 }));
      snap.treeSha256 = jsonDigest(snap.manifest);
      input.snapshots = [snap];
      // The serialized case is rejected even below the aggregate limit: repeated
      // allowed carriage returns expand when encoded as JSON string escapes.
      if (defect === "serialized-bytes") {
        snap.bodies = snap.bodies.slice(0, 8);
        const extra = Array.from({ length: 92 }, (_, i) => ({
          path: `inventory${i.toString().padStart(2, "0")}/` + "a".repeat(1000),
          sha256: sha256(""),
        }));
        snap.manifest = [
          ...snap.bodies.map(({ path, sha256 }) => ({ path, sha256 })),
          ...extra,
        ].sort((a, b) => (a.path < b.path ? -1 : 1));
        snap.treeSha256 = jsonDigest(snap.manifest);
        input.snapshots = [
          snap,
          ...(["B-prepared", "A-final", "B-final"] as const).map((role) => ({
            ...snap,
            role,
            bodies: [],
          })),
        ];
      }
      expect(SourcePublicationSchema.safeParse(input).success).toBe(false);
    },
  );
  it("rejects excessive source registrations without reading an original", async () => {
    const f = await fixture();
    for (let i = 0; i < 21; i++)
      (f.supplement.entries as Map<string, { disclosureId: string }>).set(
        `synthetic-study-${i}`,
        { disclosureId: `synthetic-disclosure-${i}` },
      );
    expect(await f.reader().loadSourceEvidence()).toEqual({
      state: "unavailable",
      evidence: [],
      unavailableCount: 20,
    });
  });
  it("retains deterministic missing-role states and forbids final with missing base run/tree", async () => {
    const f = await fixture(),
      partial = { ...f.evidence, snapshots: [] };
    await f.hold(partial);
    expect(
      (await f.reader().loadSourceEvidence()).evidence[0]!.comparisons.every(
        (item) => item.state === "snapshot-unavailable",
      ),
    ).toBe(true);
    const base = structuredClone(f.artifact.projection);
    base.arms[0]!.runId = null;
    base.arms[0]!.finalTreeSha256 = null;
    expect(() =>
      projectSourcePublication(
        { ...f.evidence, projectionSha256: jsonDigest(base) },
        base,
        f.artifact.reportSha256,
      ),
    ).toThrow();
  });
});
// Pure synthetic projector fixtures do not assert authentication.
async function diff(
  before: Record<string, string | null>,
  after: Record<string, string | null>,
) {
  const f = await fixture(),
    input: SourcePublication = structuredClone(f.evidence),
    base = structuredClone(f.artifact.projection);
  const snapshot = (
    role: "shared-original" | "B-prepared",
    files: Record<string, string | null>,
  ) => {
    const manifest = Object.entries(files)
      .map(([path, text]) => ({ path, sha256: sha256(text ?? "withheld") }))
      .sort((a, b) => (a.path < b.path ? -1 : 1));
    return {
      role,
      treeSha256: jsonDigest(manifest),
      runId: role === "shared-original" ? null : base.arms[1]!.runId,
      manifest,
      bodies: Object.entries(files)
        .filter((entry) => entry[1] !== null)
        .map(([path, text]) => ({ path, sha256: sha256(text!), text: text! })),
    };
  };
  input.snapshots = [
    snapshot("shared-original", before),
    snapshot("B-prepared", after),
  ];
  base.arms[0]!.initialTreeSha256 = input.snapshots[0]!.treeSha256;
  base.arms[1]!.initialTreeSha256 = input.snapshots[1]!.treeSha256;
  input.projectionSha256 = jsonDigest(base);
  return projectSourcePublication(input, base, input.reportSha256)
    .comparisons[0]!.files;
}
describe("exact inert selected-file diffs", () => {
  it("distinguishes absent, empty, undisclosed and unchanged", async () => {
    const files = await diff(
      { "src/a.ts": "", "src/b.ts": "", "src/c.ts": null, "src/d.ts": "same" },
      { "src/a.ts": "", "src/c.ts": "", "src/d.ts": "same", "src/e.ts": "" },
    );
    expect(files.map((file) => [file.path, file.change, file.state])).toEqual([
      ["src/a.ts", "unchanged", "unchanged"],
      ["src/b.ts", "removed", "available"],
      ["src/c.ts", "modified", "text-unavailable"],
      ["src/d.ts", "unchanged", "unchanged"],
      ["src/e.ts", "added", "available"],
    ]);
    expect(files[1]!.before).toMatchObject({
      state: "available",
      text: "",
      sha256: sha256(""),
    });
    expect(files[1]!.after).toEqual({ state: "absent" });
    expect(files[4]!.rows).toEqual([]);
  });
  it("preserves CRLF, final newline and inert script characters", async () => {
    const files = await diff(
      { "src/a.ts": "x\r\n<script>alert(1)</script>" },
      { "src/a.ts": "x\n<script>alert(1)</script>\n" },
    );
    expect(files[0]!.rows).toEqual([
      { kind: "removed", text: "x", ending: "CRLF" },
      { kind: "removed", text: "<script>alert(1)</script>", ending: "none" },
      { kind: "added", text: "x", ending: "LF" },
      { kind: "added", text: "<script>alert(1)</script>", ending: "LF" },
    ]);
    expect(await diff({ "src/a.ts": "x\n" }, { "src/a.ts": "x" })).toEqual(
      await diff({ "src/a.ts": "x\n" }, { "src/a.ts": "x" }),
    );
  });
  it("returns too-large without truncating source bodies", async () => {
    const large = "x\n".repeat(501);
    const files = await diff({ "src/a.ts": large }, { "src/a.ts": "changed" });
    expect(files[0]).toMatchObject({
      state: "too-large",
      rows: [],
      before: { text: large },
    });
  });
  it("accepts literal dynamic route and CSS paths", async () => {
    expect(
      (
        await diff(
          {
            "src/app/[id]/page.tsx": "x",
            "src/app/[[...slug]]/style.css": "x",
          },
          {
            "src/app/[id]/page.tsx": "y",
            "src/app/[[...slug]]/style.css": "y",
          },
        )
      ).map((file) => file.state),
    ).toEqual(["available", "available"]);
  });
});
