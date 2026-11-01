import {
  PublicTournamentSchema,
  tournamentRequiredChecks,
  type PublicTournament,
} from "../experiment/tournament-publication";
import { canonicalJson } from "../report/canonical";
import type { ReplayEvidenceReference, ReplayVariant } from "./contracts";

export class ReplayInputError extends Error {
  constructor() {
    super("Replay projection is malformed or internally inconsistent.");
    this.name = "ReplayInputError";
  }
}
function requireInput(condition: unknown): asserts condition {
  if (!condition) throw new ReplayInputError();
}
// Check a small JSON budget before canonicalization/schema parsing. Descriptors
// reject accessors without running caller code; bounds cover the public schema.
function requireBoundedJson(input: unknown) {
  const stack = [{ value: input, depth: 0 }];
  let nodes = 0,
    characters = 0;
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    requireInput(++nodes <= 20_000 && depth <= 16);
    if (typeof value === "string") characters += value.length;
    if (value && typeof value === "object") {
      if (Array.isArray(value)) requireInput(value.length <= 100);
      const keys = Object.keys(value);
      requireInput(keys.length <= 100);
      for (const key of keys) {
        characters += key.length;
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        requireInput("value" in descriptor);
        stack.push({ value: descriptor.value, depth: depth + 1 });
      }
    }
    requireInput(characters <= 512_000);
  }
}
/** Shape/relationship checks only. Does not authenticate input or grant disclosure. */
export function parseReplaySource(input: PublicTournament): PublicTournament {
  let p: PublicTournament;
  try {
    requireBoundedJson(input);
    p = PublicTournamentSchema.parse(JSON.parse(canonicalJson(input)));
  } catch {
    throw new ReplayInputError();
  }
  requireInput(new Set(p.arms.map((a) => a.variant)).size === 2);
  requireInput(new Set(p.attempts.map((a) => a.id)).size === p.attempts.length);
  requireInput(
    new Set(p.preparationAttempts.map((a) => a.id)).size ===
      p.preparationAttempts.length,
  );
  requireInput(p.attempts.every((a) => a.variant !== "C"));
  const runs = new Set<string>(),
    receipts = new Set<string>();
  for (const arm of p.arms) {
    if (arm.runId !== null) {
      requireInput(!runs.has(arm.runId));
      runs.add(arm.runId);
      const attempt = p.attempts.find((a) => a.id === arm.runId);
      // Missing histories are represented, never synthesized. An existing
      // matching ID must belong to this arm and describe the same final state.
      requireInput(
        !attempt ||
          (attempt.variant === arm.variant && attempt.status === arm.status),
      );
    }
    for (const receipt of [arm.baselineReceiptId, arm.receiptId]) {
      if (receipt === null) continue;
      requireInput(!receipts.has(receipt));
      receipts.add(receipt);
    }
    requireInput(
      new Set(arm.checks.map((c) => c.id)).size === 8 &&
        arm.checks.every((c) =>
          tournamentRequiredChecks.some((id) => id === c.id),
        ),
    );
    requireInput(
      arm.baselineReceiptId !== null ||
        arm.baselineVerdict === "INSUFFICIENT_EVIDENCE",
    );
    if (arm.receiptId === null) {
      requireInput(
        arm.verdict === "INSUFFICIENT_EVIDENCE" &&
          arm.checks.every((c) => c.status === "not_run"),
      );
    } else {
      requireInput(arm.runId !== null && arm.finalTreeSha256 !== null);
      if (arm.verdict === "VERIFIED")
        requireInput(arm.checks.every((c) => c.status === "pass"));
      if (arm.verdict === "REJECTED")
        requireInput(arm.checks.some((c) => c.status === "fail"));
    }
  }
  for (const comparison of p.sourceComparison ?? []) {
    requireInput(
      comparison.path.length <= 512 &&
        comparison.path
          .split("/")
          .every(
            (segment) => segment !== "." && segment !== ".." && segment !== "",
          ),
    );
  }
  return p;
}

/** Internal selector resolution. Every reference is built from this source,
 * without caller-supplied run/receipt/source fields. */
export function referenceFor(
  p: PublicTournament,
  selector: ReplayEvidenceReference["selector"],
): ReplayEvidenceReference {
  const selectorKeys: Record<
    ReplayEvidenceReference["selector"]["kind"],
    string[]
  > = {
    study: ["kind"],
    arm: ["kind", "variant"],
    attempt: ["kind", "attemptId", "variant"],
    preparation_attempt: ["kind", "attemptId"],
    baseline: ["kind", "variant"],
    future: ["kind", "variant"],
    check: ["kind", "variant", "checkId"],
    source_comparison: ["kind", "index"],
  };
  const keys = selectorKeys[selector.kind];
  requireInput(
    Array.isArray(keys) &&
      Object.keys(selector).length === keys.length &&
      keys.every((key) => Object.hasOwn(selector, key)),
  );
  const result: {
    studyId: string;
    selector: ReplayEvidenceReference["selector"];
    variant: ReplayVariant | null;
    runId: string | null;
    receiptId: string | null;
    sourceTreeSha256: string | null;
    checkId: string | null;
    comparison: ReplayEvidenceReference["comparison"];
  } = {
    studyId: p.studyId,
    selector,
    variant: null,
    runId: null,
    receiptId: null,
    sourceTreeSha256: null,
    checkId: null,
    comparison: null,
  };
  if ("variant" in selector) {
    const arm = p.arms.find((a) => a.variant === selector.variant);
    requireInput(arm);
    result.variant = arm.variant;
    if (selector.kind === "attempt") {
      const attempt = p.attempts.find(
        (a) => a.id === selector.attemptId && a.variant === selector.variant,
      );
      requireInput(attempt);
      result.runId = attempt.id;
    } else if (selector.kind === "baseline") {
      result.receiptId = arm.baselineReceiptId;
      result.sourceTreeSha256 = arm.initialTreeSha256;
    } else {
      result.runId = arm.runId;
      result.sourceTreeSha256 =
        selector.kind === "arm" ? arm.initialTreeSha256 : arm.finalTreeSha256;
      if (selector.kind !== "arm") result.receiptId = arm.receiptId;
      if (selector.kind === "check") {
        requireInput(arm.checks.some((c) => c.id === selector.checkId));
        result.checkId = selector.checkId;
      }
    }
  } else if (selector.kind === "preparation_attempt") {
    requireInput(
      p.preparationAttempts.some((a) => a.id === selector.attemptId),
    );
  } else if (selector.kind === "source_comparison") {
    requireInput(Number.isInteger(selector.index) && selector.index >= 0);
    const comparison = p.sourceComparison?.[selector.index];
    requireInput(comparison);
    result.comparison = { ...comparison };
  }
  return result;
}

/** Optional inspection guard. Equality to this projection is not authentication;
 * replacing an entire source with coherently forged JSON requires the loader. */
export function matchesReplayEvidence(
  study: PublicTournament,
  reference: ReplayEvidenceReference,
): boolean {
  try {
    const p = parseReplaySource(study);
    requireBoundedJson(reference);
    const encoded = canonicalJson(reference);
    const snapshot = JSON.parse(encoded) as ReplayEvidenceReference;
    return canonicalJson(referenceFor(p, snapshot.selector)) === encoded;
  } catch {
    return false;
  }
}
