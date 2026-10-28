import { describe, expect, it } from "vitest";
import proposedTask from "../../benchmarks/booking-team-permissions/task.proposal.json";
import {
  futureTaskDigest,
  requireFutureTaskDigest,
  validateFutureTask,
  validateFutureTaskCatalog,
} from "@/lib/experiment/future-task";

describe("public proposed future task integrity (no behavioral execution)", () => {
  it("validates deterministic fixtures, all permission decisions and explicit review gate", () => {
    const task = validateFutureTask(proposedTask);
    expect(task.review).toBe("OWNER_REVIEW_REQUIRED");
    expect(task.permissions).toHaveLength(20);
    expect(
      task.permissions.find(
        (item) => item.role === "member" && item.action === "create",
      )?.allowed,
    ).toBe(true);
    expect(
      task.permissions.find(
        (item) => item.role === "member" && item.action === "cancel",
      )?.allowed,
    ).toBe(false);
    expect(requireFutureTaskDigest(task, futureTaskDigest(task))).toEqual(task);
  });
  it("rejects missing/duplicate task IDs and empty catalogs", () => {
    expect(() => validateFutureTask({ ...proposedTask, id: "" })).toThrow();
    expect(() =>
      validateFutureTask({ ...proposedTask, id: undefined }),
    ).toThrow();
    expect(() => validateFutureTaskCatalog([])).toThrow();
    expect(() =>
      validateFutureTaskCatalog([proposedTask, proposedTask]),
    ).toThrow();
  });
  it("detects changed task contents against an earlier commitment", () => {
    const changed = {
      ...proposedTask,
      specification: proposedTask.specification + " Changed wording.",
    };
    expect(futureTaskDigest(changed)).not.toBe(futureTaskDigest(proposedTask));
    expect(() =>
      requireFutureTaskDigest(changed, futureTaskDigest(proposedTask)),
    ).toThrow("digest mismatch");
  });
  it.each([
    "missing-decision",
    "role",
    "permission",
    "duplicate-matrix",
    "conflicting-criterion",
    "duplicate-criterion",
    "invented-action",
  ])("rejects %s", (defect) => {
    const task = structuredClone(proposedTask);
    if (defect === "missing-decision")
      delete (task.decisions as Partial<typeof task.decisions>).memberCancel;
    if (defect === "role") task.permissions[0]!.role = "superuser";
    if (defect === "permission") task.permissions[0]!.allowed = false;
    if (defect === "duplicate-matrix")
      task.permissions[1] = task.permissions[0]!;
    if (defect === "conflicting-criterion")
      task.acceptance[0]!.permission.allowed = false;
    if (defect === "duplicate-criterion")
      task.acceptance[1]!.id = task.acceptance[0]!.id;
    if (defect === "invented-action") task.permissions[0]!.action = "escalate";
    expect(() => validateFutureTask(task)).toThrow();
  });
  it("cannot self-approve or relabel this visible case as a hidden holdout", () => {
    expect(() =>
      validateFutureTask({ ...proposedTask, review: "APPROVED" }),
    ).toThrow();
    expect(() =>
      validateFutureTask({ ...proposedTask, visibility: "blind" }),
    ).toThrow();
  });
});
