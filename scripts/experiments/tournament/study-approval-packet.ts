// Local, unsigned review preparation only. No provider, signer or runner import.
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdtemp, open, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { invariant } from "../../../src/lib/contracts/validation";
import { Sha256Schema } from "../../../src/lib/contracts/common";
import { futureTaskDigest } from "../../../src/lib/experiment/future-task";
import { matchedConditionsDigest } from "../../../src/lib/experiment/study-identities";
import { BOOKING_REVIEW_COMMIT } from "../../../src/lib/foresight/booking-context";
import { canonicalJson } from "../../../src/lib/report/canonical";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import { snapshotTree } from "../../evaluator/booking-v1/snapshot";
import { bookingPolicy } from "../../evaluator/booking-v1/freeze";
import { futurePolicy } from "../../evaluator/booking-v1/future";
import { teamEvaluatorIdentity } from "../../evaluator/booking-v1/grade-profile";
import { immutable } from "./custody";
import { readStudyInput } from "./operator";
import { SourceManifestSchema } from "./source-manifest";
import {
  loadRegisteredTeamRuntime,
  prospectiveTeamStudyId,
  prospectiveTeamStudyIds,
  isProspectiveTeamStudy,
} from "./team-config";
import { StudyDefinitionSchema, validateStudyDefinition } from "./study";
import { buildScientistPreselectionDraft } from "./scientist-preselection-draft";

export const approvalPacketSource = "forecode-team-20261031-case-14";
export const prospectiveStudyGoal =
  "Test B_fewer_final_forbidden_edges_than_A: whether a subsequently proposed preparation yields strictly fewer final forbidden static imports under identical task and downstream conditions. Predeclare src/server/http.ts to src/server/booking-store.ts, count preparation effort, verify personal regressions before coding, and evaluate future authorization only on sealed final trees. Retain ties, counterexamples, unknowns and the limits of one pair.";
const runtimeCandidateIdentity = z.strictObject({
  controllerImplementationSha256: Sha256Schema,
});
const candidatePins = runtimeCandidateIdentity.extend({
  runtime: StudyDefinitionSchema.shape.runtime,
});
const evaluationPins = z.strictObject({
  baselineEvaluatorSha256: Sha256Schema,
  baselineSuiteSha256: Sha256Schema,
  baselinePolicySha256: Sha256Schema,
  futureSuiteSha256: Sha256Schema,
});

/** Proposals only: a parsed draft can never become custody, approval or admission. */
export function buildStudyApprovalPacket(input: {
  targetStudyId?: (typeof prospectiveTeamStudyIds)[number];
  sourceDefinition: unknown;
  originalManifest: unknown;
  reviewedGitManifest: unknown;
}) {
  const source = validateStudyDefinition(input.sourceDefinition);
  invariant(
    source.protocol.executionConditions.every(
      (arm) => arm.modelId === "muse-spark-1.3-contributor",
    ),
    "Existing matched Contributor profile required.",
  );
  const manifest = SourceManifestSchema.parse(input.originalManifest);
  const reviewedManifest = SourceManifestSchema.parse(
    input.reviewedGitManifest,
  );
  invariant(
    manifest.every((entry, i) => !i || manifest[i - 1]!.path < entry.path) &&
      jsonDigest(manifest) === source.protocol.fixtureSha256 &&
      manifest.find((entry) => entry.path === "package-lock.json")?.sha256 ===
        source.protocol.conditions[0]!.dependencyLockSha256,
    "Original fixture tree or dependency lock changed.",
  );
  invariant(
    jsonDigest(reviewedManifest) === jsonDigest(manifest),
    "Reviewed Git fixture differs from observed original source.",
  );
  const definition = structuredClone(source);
  const studyId = input.targetStudyId ?? prospectiveTeamStudyId;
  invariant(isProspectiveTeamStudy(studyId), "Unknown prospective slot.");
  invariant(
    source.protocol.studyId !== studyId,
    "Prospective slot already used as source.",
  );
  const intentId = `intent-${randomUUID()}`;
  definition.protocol.studyId = studyId;
  definition.protocol.scenario.baselineCommit = BOOKING_REVIEW_COMMIT;
  for (const condition of definition.protocol.conditions)
    condition.originalCommit = BOOKING_REVIEW_COMMIT;
  definition.protocol.arms.forEach((arm) => {
    arm.runId = randomUUID();
  });
  definition.protocol.intentRevision = { id: intentId, revision: 1 };
  definition.protocol.scenario.id = `scenario-${randomUUID()}`;
  definition.protocol.scenario.intentIds = [intentId];
  definition.protocol.futureOracle.id = `oracle-${randomUUID()}`;
  const checked = validateStudyDefinition(definition);
  return assemblePacket({
    definition: checked,
    originalManifest: manifest,
    sourceDefinitionSha256: jsonDigest(source),
    runtimeCandidate: null,
  });
}

type PacketInput = {
  definition: ReturnType<typeof validateStudyDefinition>;
  originalManifest: z.infer<typeof SourceManifestSchema>;
  sourceDefinitionSha256: string;
  runtimeCandidate: { controllerImplementationSha256: string } | null;
  evaluationCandidate?: z.infer<typeof evaluationPins> | null;
};
function assemblePacket(input: PacketInput) {
  const d = validateStudyDefinition(input.definition);
  const runtimeCandidate =
    input.runtimeCandidate === null
      ? null
      : runtimeCandidateIdentity.parse(input.runtimeCandidate);
  const originalManifest = SourceManifestSchema.parse(input.originalManifest);
  invariant(
    originalManifest.every(
      (entry, i) => !i || originalManifest[i - 1]!.path < entry.path,
    ) &&
      jsonDigest(originalManifest) === d.protocol.fixtureSha256 &&
      originalManifest.find((entry) => entry.path === "package-lock.json")
        ?.sha256 === d.protocol.conditions[0]!.dependencyLockSha256,
    "Original fixture tree or dependency lock changed.",
  );
  if (input.evaluationCandidate) {
    const pins = evaluationPins.parse(input.evaluationCandidate);
    invariant(
      runtimeCandidate?.controllerImplementationSha256 ===
        pins.baselineEvaluatorSha256 &&
        pins.baselinePolicySha256 === jsonDigest(bookingPolicy) &&
        d.protocol.futureOracle.baselineOracle.evaluatorSha256 ===
          pins.baselineEvaluatorSha256 &&
        d.protocol.futureOracle.baselineOracle.testSuiteSha256 ===
          pins.baselineSuiteSha256 &&
        d.protocol.futureOracle.oracle.testSuiteSha256 ===
          pins.futureSuiteSha256 &&
        d.protocol.futureOracle.oracle.evaluatorSha256 ===
          teamEvaluatorIdentity(
            pins.baselineEvaluatorSha256,
            pins.futureSuiteSha256,
          ),
      "Evaluation candidate identities changed.",
    );
  }
  const { variant: _conditionVariant, ...condition } =
    d.protocol.conditions[0]!;
  const { variant: _executionVariant, ...execution } =
    d.protocol.executionConditions[0]!;
  void _conditionVariant;
  void _executionVariant;
  const state = "UNSIGNED_DRAFT_NOT_AUTHORIZED" as const;
  const profile = {
    schemaVersion: "study-approval-common-profile.local.v1",
    state,
    model: execution.modelId,
    agent: execution.agentId,
    execution,
    condition,
    restrictions: d.restrictions,
    toolAllowlist: d.toolAllowlist,
    matchedConditionsSha256: matchedConditionsDigest(d),
    ceilings: "COPIED_PROPOSED_LIMITS_NOT_CURRENT_SPENDING_APPROVAL",
    currentTariff: null,
    actualUsage: null,
    currentSpendingApproval: null,
    runtimePins: runtimeCandidate
      ? "REFRESHED_CANDIDATE_PINS_NOT_INSTALLED_OR_ADMITTED"
      : "HISTORICAL_INPUT_PINS_NOT_CURRENT_OR_ADMITTED",
    runtimeCandidate,
    evaluationPins: input.evaluationCandidate
      ? "REFRESHED_CANDIDATE_NOT_INSTALLED_OR_ADMITTED"
      : "HISTORICAL_OR_UNRESOLVED_NOT_CURRENT_OR_ADMITTED",
    evaluationCandidate: input.evaluationCandidate ?? null,
  };
  const checklist = {
    schemaVersion: "study-approval-checklist.local.v1",
    state,
    studyId: d.protocol.studyId,
    definitionSubjectSha256: jsonDigest(d),
    protocolSha256: jsonDigest(d.protocol),
    taskDefinitionSha256: futureTaskDigest(d.protocol.task),
    selectedArchitecture: null,
    preparedB: null,
    issuedHypothesis: null,
    approvals: null,
    heldAt: null,
    observations: "ORIGINAL_SOURCE_MANIFEST_CHECK_ONLY_NO_EXPERIMENT",
    pending: [
      "Owner reviews exact task decisions, scenario, matched limits and new identities; schema frozen/developer_confirmed fields do not establish current approval.",
      "Review the selected original source: actual original A and the existing reviewed Git fixture have identical full manifests; this new study selects the reviewed Git commit without changing any historical study.",
      "Freeze current reviewed controller, collector, runtime, oracle, suite and policy identities. Historical runtime/image pins are not current installation or admission.",
      "Evaluator owner supplies genuine authorization instrumentation semantics digest, complete unique case-ID/check-ID mapping and updated instrumented oracle suite. No test-only or invented cases.",
      "Review candidate-neutral graph, confirmed intents, goal and prospective metric semantics; independently hold the exact initial definition and measurement commitment before generation/selection.",
      "Approve each exact Meta payload and current model/tariff/spending scope; current tariff and approvals remain unknown in this packet.",
      "Obtain fresh same-process hypothesis issuance and authenticated append-only registration before architecture selection or B preparation. Historical recordings cannot substitute.",
      "Separately approve exact selected preparation and every attempt; preserve complete histories and actual preparation accounting. No B source or cost is fabricated.",
      "Obtain genuine baseline receipts, prepared commitment, complete installed inventories, current isolation controls and exact A/B paired+installed runtime admissions.",
      "Separately authorize one-shot paired dispatch with cleanup, lease, failure and no-retry controls; this packet grants no execution permission.",
      "After actual results, authenticate exact report/receipts and obtain separate disclosure approval and source-owned publication configuration.",
    ],
  };
  const preselectionReview = buildScientistPreselectionDraft({
    definition: d,
    sourceManifest: originalManifest,
    intent: {
      title: "Team accounts and delegated booking permissions",
      statement: d.protocol.scenario.request,
      priority: "high",
      horizon: "near",
    },
    goal: prospectiveStudyGoal,
  });
  return immutable({
    schemaVersion: "study-approval-packet.local.v1" as const,
    state,
    sourceDefinitionSha256: input.sourceDefinitionSha256,
    definition: d,
    task: d.protocol.task,
    originalManifest,
    profile,
    checklist,
    preselectionReview,
  });
}
export type StudyApprovalPacket = ReturnType<typeof assemblePacket>;

/** New immutable revision: retain IDs/task; invalidate all earlier draft hashes. */
export function refreshStudyApprovalRuntime(
  packet: StudyApprovalPacket,
  raw: unknown,
) {
  const pins = candidatePins.parse(raw);
  const definition = structuredClone(packet.definition);
  definition.runtime = pins.runtime;
  for (const condition of definition.protocol.conditions)
    condition.runtimeSha256 = jsonDigest(pins.runtime);
  return assemblePacket({
    definition,
    originalManifest: structuredClone(packet.originalManifest),
    sourceDefinitionSha256: packet.sourceDefinitionSha256,
    runtimeCandidate: {
      controllerImplementationSha256: pins.controllerImplementationSha256,
    },
  });
}

/** Pin a separately supplied reviewed candidate suite; never invent or run it. */
export function refreshStudyApprovalEvaluation(
  packet: StudyApprovalPacket,
  raw: unknown,
) {
  const pins = evaluationPins.parse(raw);
  invariant(
    packet.profile.runtimeCandidate?.controllerImplementationSha256 ===
      pins.baselineEvaluatorSha256,
    "Evaluator differs from refreshed controller candidate.",
  );
  invariant(
    pins.baselinePolicySha256 === jsonDigest(bookingPolicy),
    "Baseline policy must be unchanged.",
  );
  const definition = structuredClone(packet.definition);
  const descriptor = definition.protocol.futureOracle;
  const baseline = {
    evaluatorSha256: pins.baselineEvaluatorSha256,
    testSuiteSha256: pins.baselineSuiteSha256,
    requiredPolicySha256: pins.baselinePolicySha256,
    requiredCheckIds: [...bookingPolicy.requiredCheckIds],
  };
  const policy = futurePolicy(definition.protocol.task, baseline);
  descriptor.baselineOracle = baseline;
  descriptor.oracle = {
    evaluatorSha256: teamEvaluatorIdentity(
      pins.baselineEvaluatorSha256,
      pins.futureSuiteSha256,
    ),
    testSuiteSha256: pins.futureSuiteSha256,
    requiredPolicySha256: jsonDigest(policy),
    requiredCheckIds: [...policy.requiredCheckIds],
  };
  return assemblePacket({
    definition,
    originalManifest: structuredClone(packet.originalManifest),
    sourceDefinitionSha256: packet.sourceDefinitionSha256,
    runtimeCandidate: packet.profile.runtimeCandidate,
    evaluationCandidate: pins,
  });
}

export async function writeStudyApprovalPacket(packet: StudyApprovalPacket) {
  // Revalidate derived identities rather than accepting an arbitrary file map.
  const validated = assemblePacket({
    definition: packet.definition,
    originalManifest: packet.originalManifest,
    sourceDefinitionSha256: Sha256Schema.parse(packet.sourceDefinitionSha256),
    runtimeCandidate: packet.profile.runtimeCandidate,
    evaluationCandidate: packet.profile.evaluationCandidate,
  });
  invariant(
    jsonDigest(validated) === jsonDigest(packet),
    "Draft packet changed.",
  );
  const root = await mkdtemp(
    path.join(await realpath(tmpdir()), "forecode-study-approval-"),
  );
  invariant((await realpath(root)) === root, "Draft output aliases forbidden.");
  await chmod(root, 0o700);
  const files = {
    "definition.json": validated.definition,
    "task.json": validated.task,
    "original-source-manifest.json": validated.originalManifest,
    "common-profile.json": validated.profile,
    "review-checklist.json": validated.checklist,
    "scientist-preselection-review.json": validated.preselectionReview,
  };
  const inventory: { file: string; sha256: string; bytes: number }[] = [];
  async function write(name: string, value: unknown) {
    const bytes = canonicalJson(value);
    const handle = await open(path.join(root, name), "wx", 0o400);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return {
      file: name,
      sha256: sha256(bytes),
      bytes: Buffer.byteLength(bytes),
    };
  }
  for (const [name, value] of Object.entries(files))
    inventory.push(await write(name, value));
  const manifest = {
    schemaVersion: "study-approval-packet-files.local.v1",
    state: validated.state,
    studyId: validated.definition.protocol.studyId,
    sourceDefinitionSha256: validated.sourceDefinitionSha256,
    definitionSubjectSha256: jsonDigest(validated.definition),
    protocolSha256: jsonDigest(validated.definition.protocol),
    files: inventory,
    authority: "NONE_HASHES_IDENTIFY_DRAFT_BYTES_ONLY",
  };
  const manifestFile = await write("manifest.json", manifest);
  await chmod(root, 0o500);
  return {
    directory: root,
    studyId: manifest.studyId,
    definitionSubjectSha256: manifest.definitionSubjectSha256,
    manifestSha256: manifestFile.sha256,
    state: validated.state,
  };
}

export async function readReviewedFixtureGitManifest() {
  const runGit = promisify(execFile);
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const prefix = "fixtures/booking-v1/";
  const listed = await runGit(
    "git",
    [
      "-C",
      repository,
      "ls-tree",
      "-r",
      "--name-only",
      BOOKING_REVIEW_COMMIT,
      "--",
      prefix,
    ],
    { encoding: "utf8", maxBuffer: 65_536 },
  );
  const names = listed.stdout.trim().split("\n");
  invariant(
    names.length > 0 &&
      names.length <= 100 &&
      names.every((name) => name.startsWith(prefix)),
    "Reviewed Git fixture inventory unavailable.",
  );
  const manifest = await Promise.all(
    names.map(async (name) => {
      const bytes = await runGit(
        "git",
        ["-C", repository, "show", `${BOOKING_REVIEW_COMMIT}:${name}`],
        { encoding: "buffer", maxBuffer: 2_097_152 },
      );
      return { path: name.slice(prefix.length), sha256: sha256(bytes.stdout) };
    }),
  );
  return SourceManifestSchema.parse(
    manifest.sort((a, b) => (a.path < b.path ? -1 : 1)),
  );
}

export async function buildRegisteredStudyApprovalPacket() {
  const loaded = await loadRegisteredTeamRuntime(approvalPacketSource);
  invariant(loaded, "Known source registration unavailable.");
  // No draft/preparation/results/custody originals are opened by this tool.
  const definition = await readStudyInput(
    loaded.registration.studyRoot,
    "definition",
  );
  const snapshot = await snapshotTree(loaded.registration.runtime.sources.A);
  const reviewedGitManifest = await readReviewedFixtureGitManifest();
  return buildStudyApprovalPacket({
    sourceDefinition: definition,
    originalManifest: snapshot.files,
    reviewedGitManifest,
  });
}
export async function prepareRegisteredStudyApprovalPacket() {
  return writeStudyApprovalPacket(await buildRegisteredStudyApprovalPacket());
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(
      "Usage: node --conditions=react-server --import tsx scripts/experiments/tournament/study-approval-packet.ts\nCreates one new unsigned private packet in the canonical OS temporary directory from the fixed registered definition and verified original source. No provider call, signing, activation or execution.\n",
    );
  } else if (args.length) {
    process.stderr.write("Unsupported draft packet arguments. Use --help.\n");
    process.exitCode = 1;
  } else {
    prepareRegisteredStudyApprovalPacket()
      .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
      .catch(() => {
        process.stderr.write(
          "Study approval draft unavailable. No authority or execution was issued.\n",
        );
        process.exitCode = 1;
      });
  }
}
