// Offline only. Never loads environment files, credentials, admission helpers,
// or a real fetch implementation. Historical approvals are evidence, not authority.
import { strict as assert } from "node:assert";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { requestSchemas } from "../../src/lib/foresight/flow";
import {
  buildMetaPayload,
  contentSchemas,
  META_LIMITS,
} from "../../src/lib/foresight/prompts";
import { canonicalJson } from "../../src/lib/report/canonical";
import { META_ENDPOINT } from "../../src/server/meta/configuration";
import { createMetaTransport, digest } from "../../src/server/meta/transport";
import type { ScientistFailureObservation } from "../../src/server/meta/failure-observation";
import { RequestFailure } from "../../src/server/http/errors";

const recordSchema = z.object({
  step: z.literal("propose"),
  request: z.unknown(),
  payload: z
    .object({
      model: z.enum(["muse-spark-1.3", "muse-spark-1.3-contributor"]),
    })
    .passthrough(),
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export async function reproduceScientistFailure(
  input: unknown,
  status: 403 | 500 = 500,
) {
  const record = recordSchema.parse(input);
  const request = requestSchemas.propose.parse(record.request);
  assert.equal(canonicalJson(request), canonicalJson(record.request));
  assert.equal(
    digest(record.payload),
    record.payloadSha256,
    "Record digest mismatch",
  );
  const payload = buildMetaPayload("propose", request, record.payload.model);
  const currentPayloadSha256 = digest(payload);
  if (currentPayloadSha256 !== record.payloadSha256) {
    // Recognize only the exact pre-fix encoding. Historical identity remains
    // separate from the repaired production payload exercised below.
    const historical = structuredClone(payload);
    historical.response_format.json_schema.schema = z.toJSONSchema(
      contentSchemas.propose,
    );
    assert.equal(
      digest(historical),
      record.payloadSha256,
      "Current builder differs from historical request",
    );
  }
  const failures: ScientistFailureObservation[] = [];
  let calls = 0;
  let wire = "";
  let responseCancelled = false;
  const transport = createMetaTransport({
    env: () => ({
      META_MODEL_API_KEY: "offline-diagnostic-sentinel",
      META_MODEL: payload.model,
      META_API_BASE_URL: "https://api.meta.ai/v1",
      META_CALLS_ENABLED: "true",
      META_SPENDING_APPROVED: "true",
      META_APPROVED_PAYLOAD_SHA256: currentPayloadSha256,
      META_APPROVED_CALL_LIMIT: "1",
    }),
    fetch: async (url, init) => {
      calls++;
      assert.equal(url, META_ENDPOINT);
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      assert.equal(init?.cache, "no-store");
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer offline-diagnostic-sentinel",
      );
      assert.equal(typeof init?.body, "string");
      wire = init.body as string;
      assert.equal(digest(JSON.parse(wire)), currentPayloadSha256);
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                '{"error":{"message":"synthetic-detail","code":"synthetic-code"}}',
              ),
            );
          },
          cancel() {
            responseCancelled = true;
          },
        }),
        {
          status,
          headers: {
            "content-type": "application/json",
            "x-request-id": "synthetic-request-id",
          },
        },
      );
    },
    observeFailure: (failure) => {
      failures.push(failure);
    },
  });
  await assert.rejects(
    transport.call("propose", request, new AbortController().signal),
    (error: unknown) =>
      error instanceof RequestFailure && error.code === "PROVIDER_UNAVAILABLE",
  );
  assert.equal(calls, 1);
  assert.equal(failures.length, 1);
  assert.equal(failures[0]?.stage, "response");
  assert.equal(failures[0]?.httpStatus, status);
  assert.equal(responseCancelled, true);
  assert.deepEqual(transport.observations(), []);
  assert(!JSON.stringify(failures).includes("synthetic-"));

  // Unsent diagnostic candidates. Only response_format varies across probes.
  // Their outputs could never be admitted as tournament proposals/evidence.
  const { response_format: fullFormat, ...parameters } = payload;
  const minimal = {
    ...parameters,
    messages: [
      {
        role: "user",
        content:
          "Return one JSON value matching the supplied response schema, if any. This is a diagnostic with no real-world measurements.",
      },
    ],
  };
  const probes = [
    { name: "minimal", payload: minimal },
    {
      name: "simple-schema",
      payload: {
        ...minimal,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "diagnostic",
            strict: true,
            schema: {
              type: "object",
              properties: { ok: { type: "boolean" } },
              required: ["ok"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      name: "proposal-schema",
      payload: { ...minimal, response_format: fullFormat },
    },
  ];
  const countNodes = (value: unknown): number =>
    value !== null && typeof value === "object"
      ? 1 +
        Object.values(value).reduce<number>((sum, v) => sum + countNodes(v), 0)
      : 1;
  const reservations = probes.map(({ name, payload: probe }) => {
    const bytes = Buffer.byteLength(JSON.stringify(probe));
    const nodes = countNodes(probe);
    assert(bytes <= META_LIMITS.inputBytes && nodes <= 256);
    return {
      name,
      payloadSha256: digest(probe),
      bytes,
      nodes,
      proposedMicroUsd: bytes + META_LIMITS.outputTokens + 16384 + nodes * 32,
    };
  });
  return {
    wire,
    probes,
    summary: {
      mode: "OFFLINE_ONLY",
      providerRequests: 0,
      credentialsRead: false,
      historicalApprovalReused: false,
      providerAcceptance: "NOT_TESTED",
      endpoint: META_ENDPOINT,
      method: "POST",
      model: payload.model,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer [REDACTED]",
      },
      apiVersion: "v1 URL path; no version header",
      timeoutMs: META_LIMITS.timeoutMs,
      redirect: "error",
      retries: 0,
      payloadSha256: digest(payload),
      historicalPayloadSha256: record.payloadSha256,
      historicalEncodingDiffers: currentPayloadSha256 !== record.payloadSha256,
      wireBytes: Buffer.byteLength(wire),
      schemaSha256: digest(fullFormat.json_schema.schema),
      simulation: {
        httpStatus: status,
        fetchCalls: calls,
        responseCancelled,
        failures,
        successfulObservations: transport.observations(),
        errorBodyAndRequestIdRetained: false,
      },
      unsentProbeReservations: reservations,
      proposedTotalMicroUsd: reservations.reduce(
        (sum, r) => sum + r.proposedMicroUsd,
        0,
      ),
      authority:
        "NONE: separate current diagnostic admission and durable reservation required before any send",
    },
  };
}

async function main(args: string[]) {
  if (args.length !== 4 || args[0] !== "--request" || args[2] !== "--out")
    throw new Error(
      "Usage: --request <retained-exact-propose-request.json> --out <NEW-private-directory>; offline only, no live option",
    );
  const result = await reproduceScientistFailure(
    JSON.parse(await readFile(resolve(args[1]!), "utf8")),
  );
  const directory = resolve(args[3]!);
  await mkdir(directory, { mode: 0o700 }); // Refuse existing directories.
  const save = (name: string, value: string) =>
    writeFile(resolve(directory, name), value, { flag: "wx", mode: 0o600 });
  await save("request.json", result.wire);
  await save(
    "schema.json",
    JSON.stringify(
      JSON.parse(result.wire).response_format.json_schema.schema,
      null,
      2,
    ),
  );
  for (const [index, probe] of result.probes.entries())
    await save(
      `probe-${index + 1}-${probe.name}.json`,
      JSON.stringify(probe.payload, null, 2),
    );
  await save("summary.json", JSON.stringify(result.summary, null, 2));
  console.log(JSON.stringify(result.summary, null, 2));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main(process.argv.slice(2)).catch(() => {
    console.error(
      "Offline diagnostic refused: use --request <retained-exact-propose-request.json> --out <NEW-private-directory>; check record digest, current source, and paths. No provider call was made.",
    );
    process.exitCode = 1;
  });
