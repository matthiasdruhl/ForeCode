import { z } from "zod";
import { IdSchema, Sha256Schema } from "../contracts/common";
import { invariant, sameIds, unique } from "../contracts/validation";
import { jsonDigest } from "../report/digests";

export const teamRoles = [
  "owner",
  "admin",
  "member",
  "nonmember",
  "revoked",
] as const;
export const teamActions = ["view", "create", "cancel", "revoke"] as const;
const PermissionSchema = z.strictObject({
  role: z.enum(teamRoles),
  action: z.enum(teamActions),
  allowed: z.boolean(),
});

// Supplementary benchmark data, not an extension of the frozen contracts.
export const FutureTaskSchema = z.strictObject({
  schemaVersion: z.literal("booking-team-task.proposal.v1"),
  id: IdSchema,
  version: z.number().int().positive().max(1000),
  review: z.literal("OWNER_REVIEW_REQUIRED"),
  visibility: z.literal("visible_preregistered_case_study"),
  specification: z.string().min(1).max(32000),
  decisions: z.strictObject({
    memberCreate: z.literal("allow"),
    memberCancel: z.literal("deny_even_creator"),
    membershipAdministration: z.literal("owner_only_revoke_nonowner"),
    organizationCreation: z.literal("operator_seed_only"),
    resources: z.literal("dedicated_team_resources_preserve_personal_catalog"),
  }),
  permissions: z.array(PermissionSchema).length(20),
  acceptance: z
    .array(
      z.strictObject({
        id: IdSchema,
        permission: PermissionSchema,
      }),
    )
    .length(20),
  invariants: z.tuple([
    z.literal("baseline-personal-compatibility"),
    z.literal("half-open-utc-atomic-conflicts"),
    z.literal("idempotent-cancel-frees-slot"),
    z.literal("cross-tenant-and-user-isolation"),
    z.literal("revocation-effective-next-operation"),
    z.literal("trusted-session-no-header-authority"),
    z.literal("strict-input-validation-no-existence-leaks"),
  ]),
  fixtures: z.strictObject({
    clock: z.literal("2026-11-01T00:00:00.000Z"),
    organizations: z.tuple([z.literal("team-red"), z.literal("team-blue")]),
    users: z.tuple([
      z.literal("u-alice"),
      z.literal("u-bob"),
      z.literal("u-cara"),
    ]),
    teamResources: z.tuple([z.literal("room-red"), z.literal("room-blue")]),
    idPrefix: z.literal("team-booking-"),
  }),
});
export type FutureTask = z.infer<typeof FutureTaskSchema>;

export function validateFutureTask(input: unknown): FutureTask {
  const task = FutureTaskSchema.parse(input);
  unique(
    task.acceptance.map((item) => item.id),
    "future acceptance IDs",
  );
  const key = (item: z.infer<typeof PermissionSchema>) =>
    `${item.role}.${item.action}`;
  unique(task.permissions.map(key), "permission decisions");
  unique(
    task.acceptance.map((item) => key(item.permission)),
    "acceptance decisions",
  );
  invariant(
    sameIds(
      task.permissions.map(key),
      teamRoles.flatMap((role) =>
        teamActions.map((action) => `${role}.${action}`),
      ),
    ),
    "Missing permission decisions.",
  );
  for (const permission of task.permissions) {
    const privileged =
      permission.role === "owner" || permission.role === "admin";
    const member = permission.role === "member";
    const expected =
      permission.action === "revoke"
        ? permission.role === "owner"
        : privileged ||
          (member &&
            (permission.action === "view" ||
              (permission.action === "create" &&
                task.decisions.memberCreate === "allow")));
    invariant(
      permission.allowed === expected,
      "Permission matrix conflicts with proposed decisions.",
    );
    const criterion = task.acceptance.find(
      (item) => key(item.permission) === key(permission),
    );
    invariant(
      criterion?.permission.allowed === permission.allowed,
      "Conflicting acceptance criterion.",
    );
  }
  return task;
}

export function futureTaskDigest(input: unknown): string {
  return jsonDigest(validateFutureTask(input));
}

export function validateFutureTaskCatalog(
  input: readonly unknown[],
): FutureTask[] {
  invariant(
    input.length > 0 && input.length <= 32,
    "Missing or oversized future task catalog.",
  );
  const tasks = input.map(validateFutureTask);
  unique(
    tasks.map((task) => task.id),
    "future task IDs",
  );
  return tasks;
}

// ScenarioV1 has a 2000-character request bound. Pin the full separately delivered
// task rather than truncating it or changing that frozen public definition.
export function futureTaskRequest(input: unknown): string {
  const task = validateFutureTask(input);
  return `Implement future task ${task.id} version ${task.version}. The exact accompanying task document has SHA-256 ${futureTaskDigest(task)}. Implement its observable API and permission contract without assuming any internal architecture. Preserve booking-v1 behavior. This proposal requires independent owner review before experimental freeze.`;
}

export function requireFutureTaskDigest(
  input: unknown,
  expected: string,
): FutureTask {
  Sha256Schema.parse(expected);
  const task = validateFutureTask(input);
  invariant(
    futureTaskDigest(task) === expected,
    "Future task digest mismatch.",
  );
  return task;
}
