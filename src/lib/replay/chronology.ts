import type { ReplayChronology, ReplayEvent, ReplayTiming } from "./contracts";

// Compare valid UTC stamps without losing fractional precision to Date.parse.
export function compareRecordedTimes(a: string, b: string): number {
  const whole = (value: string) => Date.parse(value.replace(/\.\d+(?=Z$)/, ""));
  const difference = whole(a) - whole(b);
  if (difference !== 0) return difference;
  const fraction = (value: string) => value.match(/\.(\d+)Z$/)?.[1] ?? "";
  const left = fraction(a),
    right = fraction(b),
    length = Math.max(left.length, right.length);
  const normalizedLeft = left.padEnd(length, "0"),
    normalizedRight = right.padEnd(length, "0");
  return normalizedLeft < normalizedRight
    ? -1
    : normalizedLeft > normalizedRight
      ? 1
      : 0;
}

export function recordedTiming(
  startedAt: string | null = null,
  endedAt: string | null = null,
  mismatch = false,
): ReplayTiming {
  const issues: ReplayTiming["issues"] = [];
  if (
    startedAt !== null &&
    endedAt !== null &&
    compareRecordedTimes(endedAt, startedAt) < 0
  )
    issues.push("END_BEFORE_START");
  if (mismatch) issues.push("ARM_ATTEMPT_TIME_MISMATCH");
  return {
    startedAt,
    endedAt,
    state: issues.length
      ? "inconsistent"
      : startedAt && endedAt
        ? "recorded_interval"
        : startedAt || endedAt
          ? "partial_interval"
          : "unknown",
    issues,
  };
}

export function buildReplayChronology(
  events: readonly ReplayEvent[],
): ReplayChronology {
  return {
    commonClock: "not_established",
    globalOrder: "conceptual_stages_only",
    tracks: events
      .filter((event) => event.timing.state !== "unknown")
      .map((event) => ({
        eventId: event.id,
        state: event.timing.state,
        // Contradictory intervals retain raw times on the event but cannot play.
        observations:
          event.timing.state === "inconsistent"
            ? []
            : [
                ...(event.timing.startedAt
                  ? [
                      {
                        boundary: "start" as const,
                        recordedAt: event.timing.startedAt,
                      },
                    ]
                  : []),
                ...(event.timing.endedAt
                  ? [
                      {
                        boundary: "end" as const,
                        recordedAt: event.timing.endedAt,
                      },
                    ]
                  : []),
              ],
        issues: [...event.timing.issues],
      })),
  };
}
