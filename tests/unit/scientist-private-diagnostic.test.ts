import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMetaTransport, digest } from "@/server/meta/transport";
import { buildMetaPayload } from "@/lib/foresight/prompts";
import { apiErrorResponse, RequestFailure } from "@/server/http/errors";
import { createForesightService } from "@/server/meta/service";
import {
  ScientistFailureObservationSchema,
  ScientistPrivateFailureDiagnosticSchema,
  observeScientistPrivateFailure,
  type ScientistFailureObservation,
  type ScientistPrivateFailureDiagnostic,
  type ScientistPrivateFailureObserver,
} from "@/server/meta/failure-observation";
import {
  envelope,
  proposalRequest,
  syntheticContent,
} from "../support/foresight";

const secret = "PRIVATE_BODY_ERROR_PATH_UNKNOWN_KEY_MUST_NOT_ESCAPE";
const context = {
  stage: "content_parse" as const,
  step: "propose" as const,
  at: new Date(100000).toISOString(),
  payloadSha256: "a".repeat(64),
};
function setup(content: unknown, observer?: ScientistPrivateFailureObserver) {
  const observations: ScientistPrivateFailureDiagnostic[] = [];
  const legacy: ScientistFailureObservation[] = [];
  const network = vi.fn<typeof fetch>(async () =>
    Response.json(envelope(content)),
  );
  const transport = createMetaTransport({
    now: () => 100000,
    fetch: network,
    env: () => ({
      META_MODEL_API_KEY: secret,
      META_MODEL: "muse-spark-1.3-contributor",
      META_API_BASE_URL: "https://api.meta.ai/v1",
      META_CALLS_ENABLED: "true",
      META_SPENDING_APPROVED: "true",
      FORECODE_RESEARCH_MODE: "local-single-operator",
      FORECODE_RESEARCH_PROCESSES: "1",
    }),
  });
  const service = createForesightService(
    transport,
    () => 100000,
    undefined,
    undefined,
    (value) => {
      legacy.push(value);
    },
    observer ??
      ((value) => {
        observations.push(value);
      }),
  );
  return { service, transport, network, observations, legacy };
}
async function fail(service: ReturnType<typeof createForesightService>) {
  await expect(
    service.run("propose", proposalRequest(), new AbortController().signal),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
}
describe("separate private Scientist diagnostic grammar", () => {
  it("keeps valid prior-shaped output accepted with no diagnostic", async () => {
    const x = setup(syntheticContent("propose", proposalRequest()));
    await x.service.run(
      "propose",
      proposalRequest(),
      new AbortController().signal,
    );
    expect(x.observations).toEqual([]);
    expect(x.legacy).toEqual([]);
    expect(x.network).toHaveBeenCalledTimes(1);
  });
  it("distinguishes strict content rejection and retains only finite metadata", async () => {
    const x = setup({ [secret]: secret });
    await fail(x.service);
    expect(x.observations).toHaveLength(1);
    expect(x.observations[0]).toMatchObject({
      stage: "content_parse",
      errorClass: "ZOD_ERROR",
      issuesTruncated: false,
      issueCodes: expect.arrayContaining([
        { code: "unrecognized_keys", count: 1 },
      ]),
    });
    expect(x.legacy[0]).toMatchObject({
      stage: "content_schema",
      code: "INTERNAL_ERROR",
    });
    expect(x.observations[0]!.payloadSha256).toBe(
      digest(
        buildMetaPayload(
          "propose",
          proposalRequest(),
          "muse-spark-1.3-contributor",
        ),
      ),
    );
    expect(x.transport.observations()).toHaveLength(1);
    expect(JSON.stringify(x.observations)).not.toContain(secret);
    expect(x.network).toHaveBeenCalledTimes(1);
  });
  it("distinguishes semantic flow rejection from content parsing", async () => {
    const content = syntheticContent("propose", proposalRequest()) as {
      candidates: { baselineCommit: string }[];
    };
    content.candidates[1]!.baselineCommit = "f".repeat(40);
    const x = setup(content);
    await fail(x.service);
    expect(x.observations[0]).toMatchObject({
      stage: "flow_validation",
      errorClass: "ERROR",
      issueCount: 0,
      issueCodes: [],
    });
    expect(x.legacy[0]).toMatchObject({ stage: "flow_validation" });
  });
  it("classifies a mapping-only injected seam without claiming an actual provider cause", async () => {
    // Real transport returns validated plain metadata. This getter is an explicit
    // offline seam to exercise the otherwise defensive response-mapping catch.
    const transport = {
      call: vi.fn(async () => ({
        content: syntheticContent("propose", proposalRequest()),
        provider: {
          get model(): never {
            throw new TypeError(secret);
          },
        },
        payloadSha256: context.payloadSha256,
      })),
    } as unknown as ReturnType<typeof createMetaTransport>;
    const observed: ScientistPrivateFailureDiagnostic[] = [];
    const service = createForesightService(
      transport,
      () => 100000,
      undefined,
      undefined,
      undefined,
      (value) => {
        observed.push(value);
      },
    );
    await fail(service);
    expect(observed[0]).toMatchObject({
      stage: "response_mapping",
      errorClass: "TYPE_ERROR",
      issueCount: 0,
      issueCodes: [],
    });
    expect(JSON.stringify(observed)).not.toContain(secret);
  });
  it("bounds Zod traversal to 64 codes and recursively freezes emitted data", () => {
    const result = z.array(z.string()).safeParse(Array(70).fill(7));
    if (result.success)
      throw new Error("Expected synthetic validation failure");
    const poison = vi.fn(() => {
      throw new Error(secret);
    });
    Object.defineProperty(result.error.issues[64]!, "code", { get: poison });
    for (const issue of result.error.issues.slice(0, 64)) {
      Object.defineProperty(issue, "path", { get: poison });
      Object.defineProperty(issue, "message", { get: poison });
    }
    const observed: ScientistPrivateFailureDiagnostic[] = [];
    observeScientistPrivateFailure(
      (v) => {
        observed.push(v);
      },
      context,
      result.error,
    );
    expect(observed[0]).toMatchObject({
      errorClass: "ZOD_ERROR",
      issueCount: 64,
      issuesTruncated: true,
      issueCodes: [{ code: "invalid_type", count: 64 }],
    });
    expect(poison).not.toHaveBeenCalled();
    expect(Object.isFrozen(observed[0])).toBe(true);
    expect(Object.isFrozen(observed[0]!.issueCodes)).toBe(true);
    expect(Object.isFrozen(observed[0]!.issueCodes[0])).toBe(true);
    expect(JSON.stringify(observed)).not.toContain(secret);
  });
  it("maps unknown issue codes and hostile objects to fixed finite classifications", () => {
    const result = z.string().safeParse(7);
    if (result.success)
      throw new Error("Expected synthetic validation failure");
    Object.defineProperty(result.error.issues[0]!, "code", { value: secret });
    const observed: ScientistPrivateFailureDiagnostic[] = [];
    const observer = (v: ScientistPrivateFailureDiagnostic) => {
      observed.push(v);
    };
    observeScientistPrivateFailure(observer, context, result.error);
    expect(observed[0]!.issueCodes).toEqual([{ code: "OTHER", count: 1 }]);
    const poison = vi.fn(() => {
      throw new Error(secret);
    });
    observeScientistPrivateFailure(observer, context, {
      get message() {
        return poison();
      },
      get name() {
        return poison();
      },
    });
    const proxy = Proxy.revocable({}, {});
    proxy.revoke();
    observeScientistPrivateFailure(observer, context, proxy.proxy);
    expect(observed.slice(1).map((v) => v.errorClass)).toEqual([
      "UNKNOWN",
      "UNKNOWN",
    ]);
    expect(poison).not.toHaveBeenCalled();
    expect(JSON.stringify(observed)).not.toContain(secret);
  });
  it.each([
    [new RequestFailure("PROVIDER_UNAVAILABLE"), "REQUEST_FAILURE"],
    [new SyntaxError(secret), "SYNTAX_ERROR"],
    [new TypeError(secret), "TYPE_ERROR"],
    [new RangeError(secret), "RANGE_ERROR"],
    [new Error(secret), "ERROR"],
    [secret, "UNKNOWN"],
  ] as const)(
    "uses intrinsic finite classification without serializing the exception",
    (error, errorClass) => {
      const observed: ScientistPrivateFailureDiagnostic[] = [];
      observeScientistPrivateFailure(
        (value) => {
          observed.push(value);
        },
        context,
        error,
      );
      expect(observed[0]).toMatchObject({
        errorClass,
        issueCount: 0,
        issueCodes: [],
      });
      expect(JSON.stringify(observed)).not.toContain(secret);
    },
  );
  it("does not attribute a pre-content transport failure to a parse or mapping stage", async () => {
    const x = setup({});
    x.network.mockRejectedValue(new Error(secret));
    await fail(x.service);
    expect(x.observations).toEqual([]);
    expect(x.network).toHaveBeenCalledTimes(1);
  });
  it("preserves the fixed safe public error envelope", async () => {
    const x = setup({ [secret]: secret });
    let caught: unknown;
    try {
      await x.service.run(
        "propose",
        proposalRequest(),
        new AbortController().signal,
      );
    } catch (error) {
      caught = error;
    }
    const response = apiErrorResponse(caught);
    expect(response.status).toBe(503);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      schemaVersion: "api-error.v1",
      error: {
        code: "PROVIDER_UNAVAILABLE",
        message: "The model provider is unavailable.",
        retryable: true,
      },
    });
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(JSON.stringify(body)).not.toContain("issueCodes");
  });
  it.each([
    () => {
      throw new Error(secret);
    },
    async () => {
      throw new Error(secret);
    },
    (() => ({
      get then() {
        throw new Error(secret);
      },
    })) as unknown as ScientistPrivateFailureObserver,
    (() => ({
      then(_resolve: unknown, reject: (reason: unknown) => void) {
        reject(new Error(secret));
      },
    })) as unknown as ScientistPrivateFailureObserver,
  ])(
    "contains a failing observer without retrying or replacing the public failure",
    async (observer) => {
      const x = setup({ [secret]: secret }, observer);
      await fail(x.service);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(x.network).toHaveBeenCalledTimes(1);
      expect(x.legacy[0]).toMatchObject({
        stage: "content_schema",
        code: "INTERNAL_ERROR",
      });
    },
  );
  it("refuses unknown fields and inconsistent counts without extending v1", () => {
    const base = {
      schemaVersion: "scientist-private-failure-diagnostic.local.v2",
      ...context,
      errorClass: "ZOD_ERROR",
      issueCount: 1,
      issuesTruncated: false,
      issueCodes: [{ code: "invalid_type", count: 1 }],
    };
    expect(
      ScientistPrivateFailureDiagnosticSchema.safeParse(base).success,
    ).toBe(true);
    for (const altered of [
      { ...base, [secret]: secret },
      { ...base, issueCount: 65 },
      { ...base, issuesTruncated: true },
      { ...base, issueCount: 2 },
      { ...base, errorClass: "ERROR" },
      {
        ...base,
        issueCount: 2,
        issueCodes: [...base.issueCodes, ...base.issueCodes],
      },
      { ...base, issueCodes: [{ code: secret, count: 1 }] },
    ])
      expect(
        ScientistPrivateFailureDiagnosticSchema.safeParse(altered).success,
      ).toBe(false);
    expect(ScientistFailureObservationSchema.safeParse(base).success).toBe(
      false,
    );
  });
});
