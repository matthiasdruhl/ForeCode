import { describe, expect, it } from "vitest";
import {
  IntentDraftV1Schema,
  IntentV1Schema,
  InterpretRequestSchema,
} from "@/lib/contracts/intents";
import {
  confirmIntent,
  isCurrentIntentReference,
  reviseIntent,
  revokeIntent,
  type IntentInput,
} from "@/lib/intents/lifecycle";

const now = new Date("2026-10-26T20:30:00.000Z");
const input: IntentInput = {
  title: "Regional calendars",
  statement: "Keep availability in each location's time zone.",
  priority: "high",
  horizon: "near",
};

describe("explicit intent lifecycle", () => {
  it("creates a user-confirmed revision with normalized UTC time", () => {
    const intent = confirmIntent(input, "intent-calendars", now);
    expect(intent).toMatchObject({
      status: "confirmed",
      revision: 1,
      source: { kind: "user_confirmed" },
      updatedAt: now.toISOString(),
    });
    expect(IntentV1Schema.safeParse(intent).success).toBe(true);
  });

  it("invalidates earlier references on edit and leaves the old record intact", () => {
    const original = confirmIntent(input, "intent-calendars", now);
    const revised = reviseIntent(
      original,
      {
        ...input,
        statement:
          "Use IANA time zones, including daylight-saving transitions.",
      },
      now,
    );
    expect(original.revision).toBe(1);
    expect(revised.revision).toBe(2);
    expect(
      isCurrentIntentReference({ intentId: original.id, revision: 1 }, [
        revised,
      ]),
    ).toBe(false);
    expect(
      isCurrentIntentReference({ intentId: original.id, revision: 2 }, [
        revised,
      ]),
    ).toBe(true);
  });

  it("revokes the intent and rejects even a matching revision as current", () => {
    const original = confirmIntent(input, "intent-calendars", now);
    const revoked = revokeIntent(original, now);
    expect(revoked.status).toBe("rejected");
    expect(revoked.revision).toBe(2);
    expect(
      isCurrentIntentReference({ intentId: revoked.id, revision: 2 }, [
        revoked,
      ]),
    ).toBe(false);
    expect(
      isCurrentIntentReference({ intentId: "unknown", revision: 1 }, [
        original,
      ]),
    ).toBe(false);
  });

  it("does not accept empty input or overflowing revision numbers", () => {
    expect(() =>
      confirmIntent({ ...input, statement: "  " }, "intent-empty", now),
    ).toThrow();
    expect(() =>
      reviseIntent(
        { ...confirmIntent(input, "intent-max", now), revision: 2_147_483_647 },
        input,
        now,
      ),
    ).toThrow();
  });
});

describe("strict intent contracts", () => {
  const make = () => confirmIntent(input, "intent-calendars", now);
  it("rejects unknown top-level and nested properties", () => {
    expect(
      IntentV1Schema.safeParse({ ...make(), command: "run-me" }).success,
    ).toBe(false);
    expect(
      IntentV1Schema.safeParse({
        ...make(),
        source: { ...make().source, approved: true },
      }).success,
    ).toBe(false);
  });
  it("cannot promote a model suggestion into confirmed authority", () => {
    expect(
      IntentV1Schema.safeParse({
        ...make(),
        source: { kind: "meta_suggestion", reference: "response-1" },
      }).success,
    ).toBe(false);
    expect(
      IntentDraftV1Schema.safeParse({
        id: "draft-1",
        ...input,
        uncertainty: "Calendar source is unknown.",
        source: { kind: "meta_suggestion", reference: "response-1" },
        status: "confirmed",
      }).success,
    ).toBe(false);
  });
  it.each([[-1], [0], [1.5]])("rejects invalid revisions %s", (revision) => {
    expect(IntentV1Schema.safeParse({ ...make(), revision }).success).toBe(
      false,
    );
  });
  it("rejects non-UTC timestamps, duplicate dependencies and self references", () => {
    expect(
      IntentV1Schema.safeParse({
        ...make(),
        updatedAt: "2026-10-26T16:30:00-04:00",
      }).success,
    ).toBe(false);
    expect(
      IntentV1Schema.safeParse({ ...make(), dependencies: ["other", "other"] })
        .success,
    ).toBe(false);
    expect(
      IntentV1Schema.safeParse({ ...make(), dependencies: [make().id] })
        .success,
    ).toBe(false);
  });
  it("requires explicit consent for model interpretation requests", () => {
    expect(
      InterpretRequestSchema.safeParse({
        text: "Support waiting lists.",
        consent: true,
      }).success,
    ).toBe(true);
    for (const consent of [false, undefined, "true"]) {
      expect(
        InterpretRequestSchema.safeParse({
          text: "Support waiting lists.",
          consent,
        }).success,
      ).toBe(false);
    }
  });
});
