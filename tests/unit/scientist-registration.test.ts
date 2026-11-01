// Disposable signatures/originals only; no private grader, provider or experiment.
import { generateKeyPairSync, randomUUID } from "node:crypto";
import {
  chmod,
  link,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { canonicalJson } from "@/lib/report/canonical";
import { sha256 } from "@/lib/report/digests";
import { MetricProtocolSchema } from "@/lib/experiment/prospective-metrics";
import { createProtectedScientistCustodyStore } from "@/server/artifacts/evaluation-store";
import {
  createScientistRegistrationReader,
  isAuthenticatedRegistration,
} from "@/server/meta/registration-reader";
import {
  createScientistEvidenceLinkReader,
  isAuthenticatedEvidenceLink,
} from "@/server/meta/evidence-link-reader";
import { approvedScientistLineage } from "@/server/meta/approved-scientist-lineage";
import { createEvidenceAdapter } from "@/server/meta/evidence";
import { digest } from "@/server/meta/transport";
import { META_LIMITS } from "@/lib/foresight/prompts";
import type { CustodianRecord } from "../../scripts/experiments/tournament/custody";
import { publicationFixture } from "../support/tournament-publication";
import { scientistHarness } from "../support/scientist-harness";
vi.mock("@/lib/foresight/booking-context", async (original) => ({
  ...(await original<typeof import("@/lib/foresight/booking-context")>()),
  bookingGraph: {
    ...(await original<typeof import("@/lib/foresight/booking-context")>())
      .bookingGraph,
    repoCommit: "1".repeat(40),
  },
}));
let f: Awaited<ReturnType<typeof publicationFixture>>;
beforeAll(async () => {
  f = await publicationFixture();
});
afterAll(async () => {
  await rm(f.parent, { recursive: true, force: true });
});
type Harness = Awaited<ReturnType<typeof scientistHarness>>;
async function replace(filename: string, bytes: string | Buffer) {
  await chmod(filename, 0o600);
  await writeFile(filename, bytes);
  await chmod(filename, 0o400);
}
// Re-sign a synthetic original and recursively update the synthetic append-only
// descendants. Negative controls thus reach semantic checks with VALID signatures.
async function resign(
  h: Harness,
  id: string,
  change: (record: CustodianRecord, document: Record<string, unknown>) => void,
) {
  const entries = h.config.custody.entries as Map<
    string,
    {
      file: string;
      sha256: string;
      documentFile: string;
      documentSha256: string;
    }
  >;
  const entry = entries.get(id)!,
    oldHash = entry.sha256;
  const envelope = JSON.parse(
    await readFile(path.join(h.root, entry.file), "utf8"),
  );
  const document = JSON.parse(
    await readFile(path.join(h.root, entry.documentFile), "utf8"),
  );
  change(envelope.record, document);
  envelope.record.subjectSha256 = digest(document);
  const { schemaVersion, ...record } = envelope.record;
  void schemaVersion;
  await rm(path.join(f.root, `${id}.json`));
  await f.hold(record);
  const bytes = await readFile(path.join(f.root, `${id}.json`));
  await replace(path.join(h.root, entry.file), bytes);
  await replace(path.join(h.root, entry.documentFile), canonicalJson(document));
  entry.sha256 = sha256(bytes);
  entry.documentSha256 = sha256(canonicalJson(document));
  for (const [childId, child] of entries) {
    const r = JSON.parse(await readFile(path.join(h.root, child.file), "utf8"));
    if (r.record.predecessorSha256 === oldHash)
      await resign(h, childId, (record, doc) => {
        record.predecessorSha256 = entry.sha256;
        for (const key of [
          "commitmentOriginalSha256",
          "registrationOriginalSha256",
        ])
          if (doc[key] === oldHash) doc[key] = entry.sha256;
      });
  }
}
const load = (h: Harness) =>
  createScientistRegistrationReader(h.config, h.now).resolveRegistration(
    h.registration.id,
    h.issued,
  );
const loadLink = (h: Harness) =>
  createScientistEvidenceLinkReader(h.linkConfig, h.now).resolveLink(
    h.link.evidenceSummaryId,
    h.issued,
  );

describe("authenticated prospective custody", () => {
  it("authenticates signed originals and binds the immutable Agent B interface", async () => {
    const h = await scientistHarness(f),
      result = await load(h);
    expect(isAuthenticatedRegistration(result)).toBe(true);
    expect(isAuthenticatedRegistration(structuredClone(result))).toBe(false);
    expect(Object.isFrozen(result!.registration.context.graph)).toBe(true);
    expect(result!.lineage).toMatchObject({
      studyId: f.report.studyId,
      hypothesisId: h.issued.hypothesis.id,
      contextSha256: h.issued.contextSha256,
    });
    const protocol = MetricProtocolSchema.parse({
      ...h.commitment.measurementPlan,
      ...Object.fromEntries(
        [
          "studyId",
          "hypothesisId",
          "contextSha256",
          "taskSha256",
          "matchedConditionsSha256",
          "evaluatorSha256",
          "suiteSha256",
          "policySha256",
        ].map((k) => [
          k,
          result!.lineage[k as keyof NonNullable<typeof result>["lineage"]],
        ]),
      ),
    });
    expect(digest(protocol)).toBe(result!.lineage.protocolSha256);
    const evidence = await loadLink(h);
    expect(isAuthenticatedEvidenceLink(evidence)).toBe(true);
    expect(Object.isFrozen(evidence!.arms)).toBe(true);
    const adapter = createEvidenceAdapter({
      loadReports: async () =>
        (
          await import("@/server/artifacts/decision-reports")
        ).loadDecisionReports(f.config, h.now()),
      resolveLink: h.linkReader.resolveLink,
      resolveRegistration: h.registrationReader.resolveRegistration,
    });
    expect(
      (await adapter(h.link.evidenceSummaryId, h.issued, h.now())).studyId,
    ).toBe(f.report.studyId);
  });
  it.each([
    "signature",
    "missing-signature",
    "wrong-signer",
    "key-substitution",
    "subject",
    "bytes",
    "missing-original",
    "missing-document",
    "document-bytes",
  ])("rejects %s even with repinned test bytes", async (kind) => {
    const h = await scientistHarness(f),
      id = h.ids.bindingId;
    const entries = h.config.custody.entries as Map<
      string,
      {
        file: string;
        sha256: string;
        documentFile: string;
        documentSha256: string;
      }
    >;
    const entry = entries.get(id)!,
      filename = path.join(h.root, entry.file),
      docfile = path.join(h.root, entry.documentFile);
    if (kind === "key-substitution" || kind === "wrong-signer") {
      const pem = generateKeyPairSync("ed25519")
        .publicKey.export({ type: "spki", format: "pem" })
        .toString();
      h.config.custody.publicKeyPem = pem;
      if (kind === "wrong-signer")
        h.config.custody.publicKeySha256 = sha256(pem);
    } else if (kind === "missing-original") await rm(filename);
    else if (kind === "missing-document") await rm(docfile);
    else if (kind === "document-bytes") await replace(docfile, "{}");
    else {
      const envelope = JSON.parse(await readFile(filename, "utf8"));
      if (kind === "signature")
        envelope.signature = Buffer.alloc(64).toString("base64");
      if (kind === "missing-signature") delete envelope.signature;
      if (kind === "subject") envelope.record.subjectSha256 = "f".repeat(64);
      const bytes = canonicalJson(envelope) + (kind === "bytes" ? " " : "");
      await replace(filename, bytes);
      if (kind !== "bytes") entry.sha256 = sha256(bytes);
    }
    expect(await load(h)).toBeNull();
  });
  it.each([
    "expired",
    "future",
    "revoked",
    "changed-revocations",
    "expired-protocol",
    "wrong-kind",
    "wrong-predecessor",
    "reassigned-study",
  ])("rejects custody %s", async (kind) => {
    const h = await scientistHarness(f);
    if (kind === "revoked" || kind === "changed-revocations") {
      const bytes =
        canonicalJson({
          revokedIds: kind === "revoked" ? [h.ids.bindingId] : [],
        }) + " ";
      await replace(path.join(h.root, "revocations.json"), bytes);
      if (kind === "revoked") h.config.custody.revocationSha256 = sha256(bytes);
    } else
      await resign(h, h.ids.bindingId, (r) => {
        if (kind === "expired") r.expiresAt = new Date(h.now()).toISOString();
        if (kind === "future")
          r.heldAt = new Date(h.now() + 1000).toISOString();
        if (kind === "expired-protocol") r.expiresAt = r.heldAt;
        if (kind === "wrong-kind") r.kind = "disclosure";
        if (kind === "wrong-predecessor") r.predecessorSha256 = "f".repeat(64);
        if (kind === "reassigned-study") r.studyId = "another-study";
      });
    expect(await load(h)).toBeNull();
  });
  it.each([
    "hypothesis",
    "context",
    "source",
    "candidate",
    "task",
    "study",
    "evaluator",
    "suite",
    "policy",
    "model",
    "order",
    "protocol",
    "conditions",
    "source-tree",
    "manifest",
    "metric-protocol",
    "uuid",
    "issued-at",
    "expires-at",
  ])("rejects independently signed binding with wrong %s", async (kind) => {
    const h = await scientistHarness(f);
    await resign(h, h.ids.bindingId, (_r, doc) => {
      const b = doc as unknown as typeof h.binding;
      if (kind === "hypothesis") b.hypothesis.statement += " changed";
      if (kind === "context") b.registration.context.goal += " changed";
      if (kind === "source")
        b.registration.context.graph.repoCommit = "f".repeat(40);
      if (kind === "candidate")
        b.registration.context.candidates[1]!.description += " changed";
      if (kind === "task")
        b.registration.study.taskDefinitionSha256 = "f".repeat(64);
      if (kind === "study") b.registration.study.studyId = "wrong-study";
      if (kind === "evaluator") b.lineage.evaluatorSha256 = "f".repeat(64);
      if (kind === "suite") b.lineage.suiteSha256 = "f".repeat(64);
      if (kind === "policy") b.lineage.policySha256 = "f".repeat(64);
      if (kind === "model") b.registration.study.model = "wrong-model";
      if (kind === "order")
        b.registration.study.order =
          b.registration.study.order === "A_then_B" ? "B_then_A" : "A_then_B";
      if (kind === "protocol") b.lineage.studyProtocolSha256 = "f".repeat(64);
      if (kind === "conditions")
        b.lineage.matchedConditionsSha256 = "f".repeat(64);
      if (kind === "source-tree") b.lineage.sourceTreeSha256 = "f".repeat(64);
      if (kind === "manifest") b.lineage.sourceManifestSha256 = "f".repeat(64);
      if (kind === "metric-protocol") b.lineage.protocolSha256 = "f".repeat(64);
      if (kind === "uuid") b.registration.hypothesisId = randomUUID();
      if (kind === "issued-at") b.registration.issuedAt--;
      if (kind === "expires-at")
        b.registration.expiresAt += META_LIMITS.artifactTtlMs;
    });
    expect(await load(h)).toBeNull();
  });
  it.each([
    "premature",
    "late-initial",
    "initial-context",
    "initial-task",
    "initial-manifest",
    "retroactive-uuid",
    "initial-prediction",
  ])("rejects %s authenticated initial commitments", async (kind) => {
    const h = await scientistHarness(f);
    if (kind === "premature")
      await resign(h, h.ids.bindingId, (r, doc) => {
        const b = doc as unknown as typeof h.binding;
        b.registration.registeredAt = h.issued.issuedAt - 1;
        r.heldAt = new Date(b.registration.registeredAt).toISOString();
      });
    else
      await resign(h, h.ids.commitmentId, (r, doc) => {
        const c = doc as unknown as typeof h.commitment;
        if (kind === "late-initial")
          r.heldAt = new Date(h.issued.proposalStartedAt!).toISOString();
        if (kind === "initial-context") c.preselection.goal += " changed";
        if (kind === "initial-task")
          c.study.taskDefinitionSha256 = "f".repeat(64);
        if (kind === "initial-manifest")
          c.sourceManifest[0]!.sha256 = "f".repeat(64);
        if (kind === "initial-prediction") c.prediction.direction = "higher";
        if (kind === "retroactive-uuid")
          Object.assign(c.measurementPlan, {
            hypothesisId: h.issued.hypothesis.id,
          });
      });
    expect(await load(h)).toBeNull();
  });
  it.each([
    "root-in-repo",
    "worker-root",
    "root-alias",
    "symlink",
    "hardlink",
    "writable",
    "public-readable",
    "unsafe-file",
    "unexpected",
    "duplicate-file",
    "duplicate-study",
  ])("refuses %s filesystem/configuration inputs", async (kind) => {
    const h = await scientistHarness(f),
      entry = h.config.custody.entries.get(h.ids.bindingId)!;
    if (kind === "root-in-repo") h.config.custody.originalRoot = process.cwd();
    if (kind === "worker-root") h.config.custody.workspaceRoots = [h.root];
    if (kind === "root-alias") {
      const alias = h.root + "-alias";
      await symlink(h.root, alias);
      h.config.custody.originalRoot = alias;
    }
    if (kind === "symlink") {
      await rm(path.join(h.root, entry.file));
      await symlink(
        path.join(f.root, `${h.ids.bindingId}.json`),
        path.join(h.root, entry.file),
      );
    }
    if (kind === "hardlink")
      await link(
        path.join(h.root, entry.file),
        path.join(h.root, "another.json"),
      );
    if (kind === "writable") await chmod(path.join(h.root, entry.file), 0o600);
    if (kind === "public-readable")
      await chmod(path.join(h.root, entry.file), 0o444);
    if (kind === "unsafe-file") entry.file = "../outside.json";
    if (kind === "unexpected") {
      await writeFile(path.join(h.root, "unregistered.json"), "{}");
      h.config.registrations[0]!.bindingId = "unregistered";
    }
    if (kind === "duplicate-file")
      h.config.custody.entries = new Map([
        ...h.config.custody.entries,
        ["duplicate", { ...entry }],
      ]);
    if (kind === "duplicate-study")
      h.config.registrations = [
        h.config.registrations[0]!,
        {
          ...h.config.registrations[0]!,
          id: randomUUID(),
          hypothesisId: randomUUID(),
        },
      ];
    expect(await load(h)).toBeNull();
  });
});

describe("evidence chain and process lifecycle", () => {
  it.each([
    "projection",
    "evidence-id",
    "run",
    "receipt",
    "source",
    "registration",
    "late-selection",
    "late-preparation",
    "prepared-original",
    "provider-disclosure",
  ])("rejects wrong %s authenticated evidence link", async (kind) => {
    const h = await scientistHarness(f);
    await resign(h, h.ids.linkId, (_r, doc) => {
      const b = doc as unknown as typeof h.linkDocument;
      if (kind === "projection") b.link.projectionSha256 = "f".repeat(64);
      if (kind === "evidence-id") b.link.evidenceSummaryId = randomUUID();
      if (kind === "run") b.arms[0]!.runId = randomUUID();
      if (kind === "receipt") b.arms[0]!.receiptId = "wrong-receipt";
      if (kind === "source") b.arms[1]!.initialTreeSha256 = "f".repeat(64);
      if (kind === "registration")
        b.registrationOriginalSha256 = "f".repeat(64);
      if (kind === "late-selection")
        b.selectionAt = new Date(h.registration.registeredAt).toISOString();
      if (kind === "late-preparation")
        b.selectionAt = new Date(h.now()).toISOString();
      if (kind === "prepared-original")
        b.preparedOriginalSha256 = "f".repeat(64);
      if (kind === "provider-disclosure") b.disclosureScope = "public-only";
    });
    expect(await loadLink(h)).toBeNull();
  });
  it("rejects a second held binding for the same immutable study", async () => {
    const h = await scientistHarness(f),
      id = randomUUID();
    const original = JSON.parse(
      await readFile(
        path.join(h.root, h.config.custody.entries.get(h.ids.bindingId)!.file),
        "utf8",
      ),
    );
    const { schemaVersion, ...record } = original.record;
    void schemaVersion;
    const secondBinding = structuredClone(h.binding);
    secondBinding.registration.id = randomUUID();
    await f.hold({ ...record, id, subjectSha256: digest(secondBinding) });
    const bytes = await readFile(path.join(f.root, `${id}.json`));
    const doc = canonicalJson(secondBinding);
    await writeFile(path.join(h.root, `${id}.json`), bytes, { mode: 0o400 });
    await writeFile(path.join(h.root, `${id}-document.json`), doc, {
      mode: 0o400,
    });
    h.config.custody.entries = new Map([
      ...h.config.custody.entries,
      [
        id,
        {
          file: `${id}.json`,
          sha256: sha256(bytes),
          documentFile: `${id}-document.json`,
          documentSha256: sha256(doc),
        },
      ],
    ]);
    expect(await load(h)).toBeNull();
  });
  it("rejects an independently held supplement completed after preparation custody", async () => {
    const h = await scientistHarness(f);
    await resign(h, h.ids.bindingId, (record, doc) => {
      const b = doc as unknown as typeof h.binding;
      b.registration.registeredAt = Date.parse("2026-10-28T12:02:00.000Z");
      record.heldAt = new Date(b.registration.registeredAt).toISOString();
    });
    expect(await load(h)).toBeNull();
  });
  it("withholds cached approvals after actual revocation bytes change", async () => {
    const h = await scientistHarness(f);
    expect(
      await h.registrationReader.resolveRegistration(
        h.registration.id,
        h.issued,
      ),
    ).not.toBeNull();
    await replace(
      path.join(h.root, "revocations.json"),
      canonicalJson({ revokedIds: [h.ids.commitmentId] }),
    );
    expect(
      await h.registrationReader.resolveRegistration(
        h.registration.id,
        h.issued,
      ),
    ).toBeNull();
    expect(
      await h.linkReader.resolveLink(h.link.evidenceSummaryId, h.issued),
    ).toBeNull();
  });
  it("requires authentic objects rather than a successfully parsed JSON shape", async () => {
    const h = await scientistHarness(f);
    const adapter = createEvidenceAdapter({
      resolveRegistration: async () => h.binding,
      resolveLink: async () => h.linkDocument,
    });
    await expect(
      adapter(h.link.evidenceSummaryId, h.issued, h.now()),
    ).rejects.toThrow("UNTRUSTED_EVIDENCE");
  });
  it("accepts once and rejects duplicate/concurrent completion without extending lifetime", async () => {
    const h = await scientistHarness(f);
    const pending = h.service.register(
      h.registration.id,
      h.issued.hypothesis.id,
    );
    await expect(
      h.service.register(h.registration.id, h.issued.hypothesis.id),
    ).rejects.toThrow("INVALID_REFERENCE");
    expect(isAuthenticatedRegistration(await pending)).toBe(true);
    await expect(
      h.service.register(h.registration.id, h.issued.hypothesis.id),
    ).rejects.toThrow("INVALID_REFERENCE");
    h.advance(META_LIMITS.artifactTtlMs);
    expect(await load(h)).toBeNull();
  });
  it("rejects accepted replacement while registration is pending", async () => {
    const h = await scientistHarness(f);
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    h.setResolver(async (id, issued) => {
      const result = await h.registrationReader.resolveRegistration(id, issued);
      entered();
      await wait;
      return result;
    });
    const pending = h.service.register(
      h.registration.id,
      h.issued.hypothesis.id,
    );
    await ready;
    h.advance(11_000);
    await h.service.run("hypothesize", h.hypothesisInput, h.signal);
    release();
    await expect(pending).rejects.toThrow("INVALID_REFERENCE");
  });
  it("rejects an authentic object substituted by a resolver for another process", async () => {
    const a = await scientistHarness(f),
      b = await scientistHarness(f);
    const original = await load(a);
    b.setResolver(async () => original);
    await expect(
      b.service.register(a.registration.id, b.issued.hypothesis.id),
    ).rejects.toThrow("UNTRUSTED_EVIDENCE");
  });
  it("does not resurrect a retired or cross-process UUID", async () => {
    const a = await scientistHarness(f),
      b = await scientistHarness(f);
    await expect(
      b.service.register(a.registration.id, a.issued.hypothesis.id),
    ).rejects.toThrow("INVALID_REFERENCE");
    a.advance(11_000);
    await a.service.run(
      "propose",
      { ...a.input, goal: "Superseded goal" },
      a.signal,
    );
    await expect(
      a.service.register(a.registration.id, a.issued.hypothesis.id),
    ).rejects.toThrow("INVALID_REFERENCE");
  });
  it("keeps the source-owned production composition unavailable despite environment switches", async () => {
    const h = await scientistHarness(f);
    vi.stubEnv("FORECODE_SCIENTIST_REGISTRATION", h.registration.id);
    try {
      expect(
        await approvedScientistLineage.resolveRegistration(
          h.registration.id,
          h.issued,
        ),
      ).toBeNull();
      expect(
        await approvedScientistLineage.resolveLink(
          h.link.evidenceSummaryId,
          h.issued,
        ),
      ).toBeNull();
      const store = await createProtectedScientistCustodyStore(
        h.config.custody,
      );
      expect(await store.load("not-allowlisted")).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
