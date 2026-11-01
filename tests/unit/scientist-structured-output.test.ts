import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  buildMetaPayload,
  contentSchemas,
  META_LIMITS,
  PROMPT_VERSION,
} from "@/lib/foresight/prompts";
import { requestSchemas } from "@/lib/foresight/flow";
import { jsonDigest } from "@/lib/report/digests";
import { createMetaTransport } from "@/server/meta/transport";
import {
  buildRecordedMetaPayloadV1,
  RECORDED_PROMPT_VERSION_V1,
} from "../../scripts/meta/historical-scientist-payload-v1";
import {
  envelope,
  proposalRequest,
  syntheticContent,
} from "../support/foresight";

const stages = ["propose", "hypothesize", "challenge"] as const;
const directory = resolve("docs/recordings/live-meta-scientist-20261101");
const recorded = (name: string) =>
  JSON.parse(readFileSync(resolve(directory, name), "utf8"));
const env = {
  META_CALLS_ENABLED: "true",
  META_SPENDING_APPROVED: "true",
  META_MODEL_API_KEY: "synthetic-structured-output-key",
  META_MODEL: "muse-spark-1.3-contributor",
  META_API_BASE_URL: "https://api.meta.ai/v1",
};

// Check actual generated schemas, including every nested object, against the
// documented strict subset. Never rewrite a schema or normalize model output.
function inspectSchema(schema: Record<string, unknown>) {
  let objects = 0;
  function visit(value: unknown): void {
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    const node = value as Record<string, unknown>;
    for (const key of ["allOf", "oneOf", "not"])
      expect(node).not.toHaveProperty(key);
    if (node.type === "object") {
      objects++;
      expect(node.additionalProperties).toBe(false);
      expect([...(node.required as string[])].sort()).toEqual(
        Object.keys(node.properties as object).sort(),
      );
    }
    Object.values(node).forEach(visit);
  }
  expect(schema.type).toBe("object");
  expect(schema).not.toHaveProperty("anyOf");
  visit(schema);
  return objects;
}

describe("Scientist2 schema-constrained requests (offline only)", () => {
  it.each(stages)(
    "sends the exact strict %s content schema with closed nested objects",
    (step) => {
      const request = requestSchemas[step].parse(
        recorded(`${step}-request.json`),
      );
      const payload = buildMetaPayload(step, request, env.META_MODEL);
      const format = payload.response_format;
      expect(format.type).toBe("json_schema");
      expect(format.json_schema.name).toBe(`forecode_${step}_v2`);
      expect(format.json_schema.strict).toBe(true);
      expect(format.json_schema.schema).toEqual(
        z.toJSONSchema(contentSchemas[step]),
      );
      expect(inspectSchema(format.json_schema.schema)).toBeGreaterThan(1);
      expect(payload.messages[0]!.content).toContain(
        JSON.stringify(format.json_schema.schema),
      );
      expect(payload.messages[0]!.content).toContain(
        "ForeCode booking-scientist-2;",
      );
      expect(payload.max_completion_tokens).toBe(META_LIMITS.outputTokens);
      expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThanOrEqual(
        META_LIMITS.inputBytes,
      );
      expect(payload.stream).toBe(false);
      expect(payload.store).toBe(false);
      expect(payload.n).toBe(1);
      expect(payload).not.toHaveProperty("tools");
    },
  );

  it.each(stages)(
    "retains the frozen %s content acceptance/rejection contract",
    (step) => {
      const schema = z.toJSONSchema(contentSchemas[step]);
      const validate = new Ajv2020({ strict: true }).compile(schema);
      const original = JSON.parse(
        recorded(`${step}-provider-observation.json`).originalAssistantContent,
      );
      expect(validate(original)).toBe(true);
      expect(contentSchemas[step].safeParse(original).success).toBe(true);
      for (const invalid of [
        null,
        {},
        { ...original, provider: { mode: "live" } },
      ]) {
        expect(validate(invalid)).toBe(false);
        expect(contentSchemas[step].safeParse(invalid).success).toBe(false);
      }
      const missing = structuredClone(original);
      delete missing[Object.keys(missing)[0]!];
      expect(validate(missing)).toBe(false);
      expect(contentSchemas[step].safeParse(missing).success).toBe(false);
    },
  );

  it.each(stages)(
    "preserves exact historicalV1 %s payload identity independently of the current builder",
    (step) => {
      const request = requestSchemas[step].parse(
        recorded(`${step}-request.json`),
      );
      const observation = recorded(`${step}-provider-observation.json`);
      const historical = buildRecordedMetaPayloadV1(
        step,
        request,
        observation.model,
      );
      expect(jsonDigest(historical)).toBe(observation.payloadIdentity);
      expect(historical.response_format).toEqual({ type: "json_object" });
      expect(historical.messages[0]!.content).toContain(
        "ForeCode booking-scientist-1;",
      );
      expect(RECORDED_PROMPT_VERSION_V1).toBe("booking-scientist-1");
      expect(PROMPT_VERSION).toBe("booking-scientist-2");
      expect(
        jsonDigest(buildMetaPayload(step, request, observation.model)),
      ).not.toBe(observation.payloadIdentity);
    },
  );

  it("bounds the added schema framing for a separately reviewed future reservation recipe", () => {
    function nodes(value: unknown): number {
      return value !== null && typeof value === "object"
        ? 1 + Object.values(value).reduce<number>((sum, v) => sum + nodes(v), 0)
        : 1;
    }
    const counts = stages.map((step) => {
      const request = requestSchemas[step].parse(
        recorded(`${step}-request.json`),
      );
      const payload = buildMetaPayload(step, request, env.META_MODEL);
      // All varying request data is one canonical JSON string. Nested request
      // data cannot add outer payload nodes; the generated schema is fixed.
      expect(typeof payload.messages[1]!.content).toBe("string");
      expect(nodes(payload)).toBeLessThanOrEqual(256);
      return nodes(payload);
    });
    expect(counts).toEqual([195, 142, 119]);
    // Arithmetic fact only, not a new spending permission or ledger change:
    // eighteen consumed reservations stay consumed, including unknown03 and
    // known-but-not-semantically-accepted07/08. Existing ceilings stay fixed.
    const proposedPerCallMaximum =
      META_LIMITS.inputBytes + META_LIMITS.outputTokens + 16_384 + 256 * 32;
    expect(proposedPerCallMaximum).toBe(77_824);
    expect(563_043 + 3 * proposedPerCallMaximum).toBe(796_515);
    expect(563_043 + 3 * proposedPerCallMaximum).toBeLessThanOrEqual(1_000_000);
  });

  it("the current transport sends Scientist2 only and establishes current provenance", async () => {
    const request = proposalRequest();
    const network = vi.fn<typeof fetch>(async (_url, options) => {
      const payload = JSON.parse(options!.body as string);
      expect(payload.response_format).toEqual(
        buildMetaPayload("propose", request, env.META_MODEL).response_format,
      );
      expect(payload.messages[0].content).toContain("booking-scientist-2");
      return Response.json(envelope(syntheticContent("propose", request)));
    });
    const transport = createMetaTransport({ env: () => env, fetch: network });
    const result = await transport.call(
      "propose",
      request,
      new AbortController().signal,
    );
    expect(result.provider.promptVersion).toBe("booking-scientist-2");
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("a provider refusal of strict output consumes one attempt with no json_object fallback or retry", async () => {
    const network = vi.fn<typeof fetch>(async () =>
      Response.json({ error: "synthetic unsupported format" }, { status: 400 }),
    );
    const transport = createMetaTransport({ env: () => env, fetch: network });
    await expect(
      transport.call(
        "propose",
        proposalRequest(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(network).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(network.mock.calls[0]![1]!.body as string).response_format
        .type,
    ).toBe("json_schema");
  });
});
