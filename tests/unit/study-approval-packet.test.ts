import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmod, lstat, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildStudyApprovalPacket,
  refreshStudyApprovalRuntime,
  refreshStudyApprovalEvaluation,
  writeStudyApprovalPacket,
} from "../../scripts/experiments/tournament/study-approval-packet";
import { studyFixture } from "../support/tournament-study";
import {
  validateStudyDefinition,
  protocolSubject,
} from "../../scripts/experiments/tournament/study";
import { jsonDigest, sha256 } from "@/lib/report/digests";
import { canonicalJson } from "@/lib/report/canonical";
import { BOOKING_REVIEW_COMMIT } from "@/lib/foresight/booking-context";
import { bookingPolicy } from "../../scripts/evaluator/booking-v1/freeze";
import { teamEvaluatorIdentity } from "../../scripts/evaluator/booking-v1/grade-profile";
import {
  configuredTeamRuntimes,
  prospectiveTeamStudyId,
  nextProspectiveTeamStudyId,
  recoveryProspectiveTeamStudyId,
  diagnosticProspectiveTeamStudyId,
  selectionWindowProspectiveTeamStudyId,
  staticAssetsProspectiveTeamStudyId,
  isProspectiveTeamStudy,
} from "../../scripts/experiments/tournament/team-config";

let fixture: Awaited<ReturnType<typeof studyFixture>>;
const outputs: string[] = [];
beforeEach(async () => {
  fixture = await studyFixture({
    configure: (definition, draft) => {
      definition.protocol.executionConditions.forEach((arm) => {
        arm.modelId = "muse-spark-1.3-contributor";
      });
      draft.executionConditions.forEach((arm) => {
        arm.modelId = "muse-spark-1.3-contributor";
      });
    },
  });
});
afterEach(async () => {
  for (const directory of outputs.splice(0)) {
    await chmod(directory, 0o700);
    await rm(directory, { recursive: true, force: true });
  }
  await rm(fixture.parent, { recursive: true, force: true });
});
function build() {
  return buildStudyApprovalPacket({
    sourceDefinition: fixture.input.definition,
    originalManifest: fixture.input.evidence.originalManifest,
    reviewedGitManifest: fixture.input.evidence.originalManifest,
  });
}

describe("unsigned study approval preparation (synthetic inputs only)", () => {
  it.each([
    nextProspectiveTeamStudyId,
    recoveryProspectiveTeamStudyId,
    diagnosticProspectiveTeamStudyId,
    selectionWindowProspectiveTeamStudyId,
    staticAssetsProspectiveTeamStudyId,
  ] as const)(
    "allocates %s with fresh trial identities after a retained failure",
    (targetStudyId) => {
      const prior = build();
      const next = buildStudyApprovalPacket({
        targetStudyId,
        sourceDefinition: fixture.input.definition,
        originalManifest: fixture.input.evidence.originalManifest,
        reviewedGitManifest: fixture.input.evidence.originalManifest,
      });
      expect(next.definition.protocol.studyId).toBe(targetStudyId);
      expect(
        next.definition.protocol.arms.every((arm) =>
          prior.definition.protocol.arms.every(
            (previous) => previous.runId !== arm.runId,
          ),
        ),
      ).toBe(true);
      expect(next.definition.protocol.intentRevision.id).not.toBe(
        prior.definition.protocol.intentRevision.id,
      );
      expect(next.definition.protocol.scenario.id).not.toBe(
        prior.definition.protocol.scenario.id,
      );
      const first = configuredTeamRuntimes.get(prospectiveTeamStudyId)!;
      const second = configuredTeamRuntimes.get(targetStudyId)!;
      expect(first.registrationRoot).not.toBe(second.registrationRoot);
      expect(second.publicKeyPem).toBe(first.publicKeyPem);
      expect(isProspectiveTeamStudy(prospectiveTeamStudyId)).toBe(true);
      expect(isProspectiveTeamStudy(targetStudyId)).toBe(true);
      expect(isProspectiveTeamStudy("forecode-team-20261031-case-14")).toBe(
        false,
      );
      expect(next.definition.protocol.conditions).toEqual(
        prior.definition.protocol.conditions,
      );
      expect(next.definition.protocol.task).toEqual(
        prior.definition.protocol.task,
      );
    },
  );
  it("creates fresh IDs with exact task/conditions and no architecture, approval, usage or run times", () => {
    const before = canonicalJson(fixture.input.definition);
    const packet = build(),
      source = fixture.input.definition,
      d = packet.definition;
    expect(validateStudyDefinition(d)).toEqual(d);
    expect(d.protocol.studyId).not.toBe(source.protocol.studyId);
    expect(d.protocol.studyId).toBe(prospectiveTeamStudyId);
    expect(d.protocol.intentRevision.id).not.toBe(
      source.protocol.intentRevision.id,
    );
    expect(d.protocol.scenario.id).not.toBe(source.protocol.scenario.id);
    expect(d.protocol.futureOracle.id).not.toBe(
      source.protocol.futureOracle.id,
    );
    expect(new Set(d.protocol.arms.map((arm) => arm.runId)).size).toBe(2);
    for (const arm of d.protocol.arms)
      expect(source.protocol.arms.map((prior) => prior.runId)).not.toContain(
        arm.runId,
      );
    expect(d.protocol.task).toEqual(source.protocol.task);
    expect(d.protocol.scenario.assumptions).toEqual(
      source.protocol.scenario.assumptions,
    );
    expect(d.protocol.conditions).toEqual(
      source.protocol.conditions.map((condition) => ({
        ...condition,
        originalCommit: BOOKING_REVIEW_COMMIT,
      })),
    );
    expect(d.protocol.scenario.baselineCommit).toBe(BOOKING_REVIEW_COMMIT);
    expect(d.protocol.executionConditions).toEqual(
      source.protocol.executionConditions,
    );
    expect(d.downstreamPrompt).toBe(source.downstreamPrompt);
    expect(d.adapterInstructions).toBe(source.adapterInstructions);
    expect(packet.checklist.selectedArchitecture).toBeNull();
    expect(packet.checklist.preparedB).toBeNull();
    expect(packet.checklist.issuedHypothesis).toBeNull();
    expect(packet.checklist.approvals).toBeNull();
    expect(packet.checklist.heldAt).toBeNull();
    expect(packet.preselectionReview.ownerConfirmation).toBeNull();
    expect(packet.preselectionReview.consent).toBeNull();
    expect(packet.preselectionReview.protocolOriginalSha256).toBeNull();
    expect(packet.preselectionReview.measurementPlan).toBeNull();
    expect(packet.preselectionReview.proposedIntent.id).toBe(
      d.protocol.intentRevision.id,
    );
    expect(packet.preselectionReview.proposedIntent.statement).toBe(
      d.protocol.scenario.request,
    );
    expect(packet.preselectionReview.graph.repoCommit).toBe(
      BOOKING_REVIEW_COMMIT,
    );
    expect(packet.profile.currentTariff).toBeNull();
    expect(packet.profile.actualUsage).toBeNull();
    expect(packet.profile.currentSpendingApproval).toBeNull();
    expect(packet.profile.runtimePins).toBe(
      "HISTORICAL_INPUT_PINS_NOT_CURRENT_OR_ADMITTED",
    );
    expect(packet.checklist.definitionSubjectSha256).toBe(protocolSubject(d));
    expect(canonicalJson(source)).toBe(before);
    expect(Object.isFrozen(packet.definition.protocol.task)).toBe(true);
  });
  it("reserves a separate source-owned operator slot with the existing public anchor only", () => {
    const previous = configuredTeamRuntimes.get(
      "forecode-team-20261031-case-14",
    )!;
    const reserved = configuredTeamRuntimes.get(prospectiveTeamStudyId)!;
    expect(reserved.registrationRoot).not.toBe(previous.registrationRoot);
    expect(reserved.registrationRoot).toContain("prospective-20261101-01");
    expect(reserved.publicKeyPem).toBe(previous.publicKeyPem);
    expect(sha256(reserved.publicKeyPem)).toBe(reserved.publicKeySha256);
    expect(Object.keys(reserved).sort()).toEqual([
      "publicKeyPem",
      "publicKeySha256",
      "registrationRoot",
    ]);
    const source = structuredClone(fixture.input.definition);
    source.protocol.studyId = prospectiveTeamStudyId;
    expect(() =>
      buildStudyApprovalPacket({
        sourceDefinition: source,
        originalManifest: fixture.input.evidence.originalManifest,
        reviewedGitManifest: fixture.input.evidence.originalManifest,
      }),
    ).toThrow("Prospective slot already used");
  });
  it.each(["tree", "lock", "duplicate", "wrong-model"])(
    "rejects %s drift before a packet is written",
    (defect) => {
      const definition = structuredClone(fixture.input.definition),
        manifest = structuredClone(fixture.input.evidence.originalManifest);
      if (defect === "tree") manifest[1]!.sha256 = "f".repeat(64);
      if (defect === "lock")
        for (const c of definition.protocol.conditions)
          c.dependencyLockSha256 = "f".repeat(64);
      if (defect === "duplicate") manifest.push(manifest[0]!);
      if (defect === "wrong-model")
        definition.protocol.executionConditions.forEach((arm) => {
          arm.modelId = "muse-spark-1.3";
        });
      expect(() =>
        buildStudyApprovalPacket({
          sourceDefinition: definition,
          originalManifest: manifest,
          reviewedGitManifest: fixture.input.evidence.originalManifest,
        }),
      ).toThrow();
    },
  );
  it("rejects a graph-reviewed Git manifest that differs from the actual original source", () => {
    const reviewed = structuredClone(fixture.input.evidence.originalManifest);
    reviewed[1]!.sha256 = "a".repeat(64);
    expect(() =>
      buildStudyApprovalPacket({
        sourceDefinition: fixture.input.definition,
        originalManifest: fixture.input.evidence.originalManifest,
        reviewedGitManifest: reviewed,
      }),
    ).toThrow("Reviewed Git fixture differs");
  });
  it("refreshes proposed runtime pins without changing IDs/task or granting admission", () => {
    const packet = build(),
      before = canonicalJson(packet);
    const runtime = {
      ...packet.definition.runtime,
      supervisorSha256: "a".repeat(64),
    };
    const refreshed = refreshStudyApprovalRuntime(packet, {
      runtime,
      controllerImplementationSha256: "b".repeat(64),
    });
    expect(refreshed.definition.protocol.studyId).toBe(
      packet.definition.protocol.studyId,
    );
    expect(refreshed.definition.protocol.arms).toEqual(
      packet.definition.protocol.arms,
    );
    expect(refreshed.task).toEqual(packet.task);
    expect(refreshed.checklist.definitionSubjectSha256).not.toBe(
      packet.checklist.definitionSubjectSha256,
    );
    expect(
      refreshed.definition.protocol.conditions.map((c) => c.runtimeSha256),
    ).toEqual([jsonDigest(runtime), jsonDigest(runtime)]);
    expect(refreshed.profile.runtimePins).toBe(
      "REFRESHED_CANDIDATE_PINS_NOT_INSTALLED_OR_ADMITTED",
    );
    expect(refreshed.state).toBe("UNSIGNED_DRAFT_NOT_AUTHORIZED");
    expect(canonicalJson(packet)).toBe(before);
    expect(() =>
      refreshStudyApprovalRuntime(packet, {
        runtime,
        controllerImplementationSha256: "b".repeat(64),
        approved: true,
      }),
    ).toThrow();
  });
  it("writes exclusive read-only canonical files and exact byte digests in a private new directory", async () => {
    const packet = build(),
      written = await writeStudyApprovalPacket(packet);
    outputs.push(written.directory);
    expect(path.dirname(written.directory)).toBe(await realpath(tmpdir()));
    expect(path.basename(written.directory)).toMatch(
      /^forecode-study-approval-/,
    );
    expect((await lstat(written.directory)).mode & 0o777).toBe(0o500);
    const bytes = await readFile(path.join(written.directory, "manifest.json"));
    expect(sha256(bytes)).toBe(written.manifestSha256);
    const manifest = JSON.parse(bytes.toString());
    expect(manifest.authority).toBe("NONE_HASHES_IDENTIFY_DRAFT_BYTES_ONLY");
    for (const entry of manifest.files) {
      const file = path.join(written.directory, entry.file),
        value = await readFile(file);
      expect((await lstat(file)).mode & 0o777).toBe(0o400);
      expect(sha256(value)).toBe(entry.sha256);
      expect(value.byteLength).toBe(entry.bytes);
      expect(canonicalJson(JSON.parse(value.toString()))).toBe(
        value.toString(),
      );
    }
    expect(
      (
        await readFile(path.join(written.directory, "definition.json"))
      ).toString(),
    ).toBe(canonicalJson(packet.definition));
  });
  it("refreshes evaluation subjects from the exact controller and unchanged public policy without changing trial identity", () => {
    const packet = build();
    const runtime = refreshStudyApprovalRuntime(packet, {
      runtime: packet.definition.runtime,
      controllerImplementationSha256: "b".repeat(64),
    });
    const before = canonicalJson(runtime);
    const pins = {
      baselineEvaluatorSha256: "b".repeat(64),
      baselineSuiteSha256: "c".repeat(64),
      baselinePolicySha256: jsonDigest(bookingPolicy),
      futureSuiteSha256: "d".repeat(64),
    };
    const refreshed = refreshStudyApprovalEvaluation(runtime, pins);
    expect(refreshed.definition.protocol.arms).toEqual(
      packet.definition.protocol.arms,
    );
    expect(refreshed.definition.protocol.studyId).toBe(
      packet.definition.protocol.studyId,
    );
    expect(refreshed.definition.protocol.futureOracle.id).toBe(
      packet.definition.protocol.futureOracle.id,
    );
    expect(refreshed.task).toEqual(packet.task);
    expect(
      refreshed.definition.protocol.futureOracle.oracle.evaluatorSha256,
    ).toBe(
      teamEvaluatorIdentity(
        pins.baselineEvaluatorSha256,
        pins.futureSuiteSha256,
      ),
    );
    expect(refreshed.profile.evaluationPins).toBe(
      "REFRESHED_CANDIDATE_NOT_INSTALLED_OR_ADMITTED",
    );
    expect(refreshed.preselectionReview.definition).toEqual(
      refreshed.definition,
    );
    expect(refreshed.checklist.definitionSubjectSha256).not.toBe(
      packet.checklist.definitionSubjectSha256,
    );
    expect(canonicalJson(runtime)).toBe(before);
    expect(() => refreshStudyApprovalEvaluation(packet, pins)).toThrow(
      "refreshed controller",
    );
    expect(() =>
      refreshStudyApprovalEvaluation(runtime, {
        ...pins,
        baselineEvaluatorSha256:
          packet.definition.protocol.futureOracle.baselineOracle
            .evaluatorSha256,
      }),
    ).toThrow("refreshed controller");
    expect(() =>
      refreshStudyApprovalEvaluation(runtime, {
        ...pins,
        baselinePolicySha256: "0".repeat(64),
      }),
    ).toThrow("Baseline policy");
    expect(() =>
      refreshStudyApprovalEvaluation(runtime, {
        ...pins,
        futurePolicySha256: "0".repeat(64),
      }),
    ).toThrow();
    expect(() =>
      refreshStudyApprovalEvaluation(runtime, {
        ...pins,
        futureSuiteSha256: pins.baselineSuiteSha256,
      }),
    ).toThrow("separate evaluator and suite");
  });
  it("refuses a changed draft/checklist instead of writing the altered packet", async () => {
    const packet = structuredClone(build());
    packet.checklist.selectedArchitecture = "invented" as never;
    await expect(writeStudyApprovalPacket(packet)).rejects.toThrow(
      "Draft packet changed",
    );
  });
});
