// Synthetic originals, signed only with the existing disposable fixture key.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "@/lib/report/canonical";
import { sha256 } from "@/lib/report/digests";
import { digest } from "@/server/meta/transport";
import {
  createScientistRegistrationReader,
  type RegistrationConfig,
} from "@/server/meta/registration-reader";
import {
  createScientistEvidenceLinkReader,
  type EvidenceLinkConfig,
} from "@/server/meta/evidence-link-reader";
import type {
  ProspectiveRegistration,
  EvidenceLink,
} from "@/server/meta/prospective-lineage";
import type { IssuedHypothesis } from "@/server/meta/evidence";
import type { CustodianRecord } from "../../scripts/experiments/tournament/custody";
import type { publicationFixture } from "./tournament-publication";

export async function scientistFixture(
  f: Awaited<ReturnType<typeof publicationFixture>>,
  registration: ProspectiveRegistration,
  link: EvidenceLink,
  issued: IssuedHypothesis,
  now: () => number,
) {
  const root = path.join(f.parent, `scientist-${randomUUID()}`);
  await mkdir(root, { mode: 0o700 });
  const revocations = canonicalJson({ revokedIds: [] });
  await writeFile(path.join(root, "revocations.json"), revocations, {
    mode: 0o400,
  });
  const entries: RegistrationConfig["custody"]["entries"] extends ReadonlyMap<
    string,
    infer E
  >
    ? Map<string, E>
    : never = new Map();
  const studyId = registration.study.studyId;
  const prefix = randomUUID();
  async function document(id: string, bytes: Buffer, value: unknown) {
    const documentFile = `${id}-document.json`,
      file = `${id}.json`;
    const documentBytes = canonicalJson(value);
    await writeFile(path.join(root, file), bytes, { mode: 0o400 });
    await writeFile(path.join(root, documentFile), documentBytes, {
      mode: 0o400,
    });
    entries.set(id, {
      file,
      sha256: sha256(bytes),
      documentFile,
      documentSha256: sha256(documentBytes),
    });
    return sha256(bytes);
  }
  async function hold(
    name: string,
    kind: CustodianRecord["kind"],
    value: unknown,
    predecessorSha256: string | null,
    at: number,
  ) {
    const id = `${prefix}-${name}`;
    await f.hold({
      id,
      studyId,
      kind,
      subjectSha256: digest(value),
      predecessorSha256,
      heldAt: new Date(at).toISOString(),
    });
    const bytes = await readFile(path.join(f.root, `${id}.json`));
    return { id, sha256: await document(id, bytes, value) };
  }
  const definition = f.study.definition,
    p = definition.protocol;
  const protocolId = f.input.protocol!.record.id;
  await document(
    protocolId,
    await readFile(path.join(f.root, `${protocolId}.json`)),
    definition,
  );
  const { intents, graph, goal } = registration.context;
  const matchedConditionsSha256 = digest({
    conditions: p.conditions,
    executionConditions: p.executionConditions,
    trialPolicy: p.trialPolicy,
    runtime: definition.runtime,
    restrictions: definition.restrictions,
    toolAllowlist: definition.toolAllowlist,
    downstreamPrompt: definition.downstreamPrompt,
    adapterInstructions: definition.adapterInstructions,
  });
  const commitment = {
    schemaVersion: "scientist-initial-commitment.local.v1",
    study: registration.study,
    preselection: { intents, graph, goal, consent: true },
    prediction: {
      metric: issued.hypothesis.prediction.metric,
      direction: issued.hypothesis.prediction.direction,
      comparison: issued.hypothesis.prediction.comparison,
    },
    studyProtocolSha256: digest(p),
    matchedConditionsSha256,
    measurementPlan: {
      schemaVersion: "prospective-tournament-metrics.v1",
      externalPackages: ["server-only"],
      stylesheetPaths: [],
      boundaryRules: [
        { id: "separate", from: "src/service.ts", to: "src/policy.ts" },
      ],
      authorizationCaseIds: ["owner-only"],
      observationWindow: "prepared_baseline_and_sealed_final_tree",
      duplicatePolicy: "one_resolved_edge_or_case_per_arm_snapshot",
      prediction: "B_fewer_final_forbidden_edges_than_A",
    },
    sourceManifest: f.input.evidence.originalManifest,
  };
  const c = await hold(
    "commitment",
    "scientist-commitment",
    commitment,
    registration.study.protocolOriginalSha256,
    issued.proposalStartedAt! - 1000,
  );
  const s = registration.study;
  const identities = {
    studyId,
    hypothesisId: registration.hypothesisId,
    contextSha256: issued.contextSha256,
    taskSha256: s.taskDefinitionSha256,
    matchedConditionsSha256,
    evaluatorSha256: s.futureEvaluatorSha256,
    suiteSha256: s.futureSuiteSha256,
    policySha256: s.futurePolicySha256,
  };
  const lineage = {
    ...identities,
    protocolSha256: digest({ ...commitment.measurementPlan, ...identities }),
    studyProtocolSha256: digest(p),
    sourceTreeSha256: p.fixtureSha256,
    sourceManifestSha256: digest(commitment.sourceManifest),
    variants: (["A", "B"] as const).map((variant, i) => ({
      variant,
      candidateId: registration.context.candidates[i]!.id,
      runId: p.arms.find((a) => a.variant === variant)!.runId,
    })),
  };
  const binding = {
    schemaVersion: "scientist-issued-binding.local.v1",
    commitmentOriginalSha256: c.sha256,
    hypothesis: issued.hypothesis,
    registration,
    lineage,
  };
  const b = await hold(
    "binding",
    "scientist-registration",
    binding,
    c.sha256,
    registration.registeredAt,
  );
  const preparationId = [...f.input.authorizations.values()][0]!.record.id;
  const prep = f.input.evidence;
  const prepDoc = {
    preparationSha256: digest({
      definitionSha256: digest(definition),
      proposalSha256: sha256(prep.proposal),
      instructionsSha256: sha256(prep.instructions),
    }),
    attemptId: prep.selectedAttemptId,
  };
  await document(
    preparationId,
    await readFile(path.join(f.root, `${preparationId}.json`)),
    prepDoc,
  );
  const preparedId = f.input.prepared!.record.id;
  const preparedDoc = {
    definitionSha256: digest(definition),
    draftSha256: digest(f.study.draft),
    preparationSha256: digest(prep),
  };
  await document(
    preparedId,
    await readFile(path.join(f.root, `${preparedId}.json`)),
    preparedDoc,
  );
  const linkDocument = {
    schemaVersion: "scientist-evidence-link.local.v1",
    disclosureScope: "meta-scientist-allowlisted-summary.v2",
    recipientModels: ["muse-spark-1.3", "muse-spark-1.3-contributor"],
    candidateConformance: "independently_reviewed_against_registered_candidate",
    link,
    registrationOriginalSha256: b.sha256,
    preparedOriginalSha256: f.input.prepared!.sha256,
    selectionAt: prep.selectionAt,
    preparationEvidence: prep,
    studyDraft: f.study.draft,
    lineage,
    arms: f.artifact.projection.arms.map((a) => ({
      variant: a.variant,
      runId: a.runId,
      baselineReceiptId: a.baselineReceiptId,
      receiptId: a.receiptId,
      initialTreeSha256: a.initialTreeSha256,
      finalTreeSha256: a.finalTreeSha256,
    })),
  };
  const l = await hold(
    "link",
    "scientist-evidence-link",
    linkDocument,
    b.sha256,
    link.publicationApprovedAt,
  );
  const config: RegistrationConfig = {
    custody: {
      originalRoot: root,
      workspaceRoots: [f.workspace],
      publicKeyPem: f.config.publications.authorityPublicKeyPem,
      publicKeySha256: f.config.publications.authorityPublicKeySha256,
      revocationSha256: sha256(revocations),
      entries,
    },
    registrations: [
      {
        id: registration.id,
        studyId,
        hypothesisId: issued.hypothesis.id,
        protocolId,
        commitmentId: c.id,
        bindingId: b.id,
      },
    ],
  };
  const publication = {
    ...f.config,
    registrations: f.config.registrations.map((r) => ({
      ...r,
      projectionSha256: digest(f.artifact.projection),
    })),
  };
  const linkConfig: EvidenceLinkConfig = {
    registration: config,
    publication,
    links: [
      {
        id: link.evidenceSummaryId,
        registrationId: registration.id,
        originalId: l.id,
        preparationId,
        preparedId,
      },
    ],
  };
  return {
    root,
    config,
    linkConfig,
    commitment,
    binding,
    linkDocument,
    ids: {
      protocolId,
      commitmentId: c.id,
      bindingId: b.id,
      linkId: l.id,
      preparationId,
      preparedId,
    },
    registrationReader: createScientistRegistrationReader(config, now),
    linkReader: createScientistEvidenceLinkReader(linkConfig, now),
  };
}
