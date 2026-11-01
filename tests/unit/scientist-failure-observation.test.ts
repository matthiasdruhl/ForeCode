import { describe, expect, it, vi } from "vitest";
import { createMetaTransport, digest } from "@/server/meta/transport";
import { createForesightService } from "@/server/meta/service";
import { META_LIMITS, buildMetaPayload } from "@/lib/foresight/prompts";
import {
  ScientistFailureObservationSchema,
  type ScientistFailureObservation,
} from "@/server/meta/failure-observation";
import {
  proposalRequest,
  syntheticContent,
  envelope,
} from "../support/foresight";
const secret = "NEVER_RETAIN_SECRET_BODY_HEADER_UNKNOWN_FIELD";
const env = {
  META_MODEL_API_KEY: secret,
  META_MODEL: "muse-spark-1.3-contributor",
  META_API_BASE_URL: "https://api.meta.ai/v1",
  META_CALLS_ENABLED: "true",
  META_SPENDING_APPROVED: "true",
  FORECODE_RESEARCH_MODE: "local-single-operator",
  FORECODE_RESEARCH_PROCESSES: "1",
};
function setup(
  response: () => Response | Promise<Response>,
  observer?: (v: Readonly<ScientistFailureObservation>) => void,
) {
  let at = 100000;
  const observations: ScientistFailureObservation[] = [];
  const observeFailure =
    observer ??
    ((v) => {
      observations.push(v);
    });
  const network = vi.fn<typeof fetch>(async () => response());
  const transport = createMetaTransport({
    env: () => env,
    fetch: network,
    now: () => at,
    observeFailure,
  });
  return {
    transport,
    network,
    observations,
    service: createForesightService(
      transport,
      () => at,
      undefined,
      undefined,
      observeFailure,
    ),
    advance: () => {
      at += META_LIMITS.intervalMs + 1;
    },
  };
}
describe("private sanitized Scientist failure observations", () => {
  it.each([
    ["fetch", () => Promise.reject(new Error(secret)), undefined],
    [
      "response",
      () =>
        new Response(secret, { status: 403, headers: { "x-secret": secret } }),
      403,
    ],
    ["envelope", () => Response.json({ [secret]: secret }), 200],
    [
      "identity_usage",
      () =>
        Response.json(
          envelope(syntheticContent("propose", proposalRequest()), {
            model: secret,
          }),
        ),
      200,
    ],
    [
      "content_json",
      () => {
        const e = envelope(syntheticContent("propose", proposalRequest()));
        e.choices[0]!.message.content = secret;
        return Response.json(e);
      },
      200,
    ],
  ] as const)(
    "classifies %s without leaking provider/error material",
    async (stage, response, httpStatus) => {
      const x = setup(response),
        request = proposalRequest();
      await expect(
        x.transport.call("propose", request, new AbortController().signal),
      ).rejects.toThrow("PROVIDER_UNAVAILABLE");
      expect(x.network).toHaveBeenCalledTimes(1);
      expect(x.observations).toHaveLength(1);
      const v = x.observations[0]!;
      expect(v).toEqual({
        schemaVersion: "scientist-failure-observation.local.v1",
        layer: "transport",
        stage,
        step: "propose",
        at: new Date(100000).toISOString(),
        payloadSha256: digest(
          buildMetaPayload("propose", request, env.META_MODEL),
        ),
        code: "PROVIDER_UNAVAILABLE",
        ...(httpStatus === undefined ? {} : { httpStatus }),
      });
      expect(Object.isFrozen(v)).toBe(true);
      expect(JSON.stringify(v)).not.toContain(secret);
      expect(
        ScientistFailureObservationSchema.safeParse({ ...v, [secret]: secret })
          .success,
      ).toBe(false);
    },
  );
  it("distinguishes content schema rejection from successful transport and preserves usage", async () => {
    const x = setup(() => Response.json(envelope({ [secret]: secret })));
    await expect(
      x.service.run("propose", proposalRequest(), new AbortController().signal),
    ).rejects.toThrow("PROVIDER_UNAVAILABLE");
    expect(x.observations).toHaveLength(1);
    expect(x.observations[0]).toMatchObject({
      layer: "flow",
      stage: "content_schema",
      payloadSha256: digest(
        buildMetaPayload("propose", proposalRequest(), env.META_MODEL),
      ),
      code: "INTERNAL_ERROR",
    });
    expect(JSON.stringify(x.observations)).not.toContain(secret);
    expect(x.transport.observations()).toHaveLength(1);
  });
  it("distinguishes semantic output rejection without retaining schema paths", async () => {
    const request = proposalRequest(),
      content = syntheticContent("propose", request) as {
        candidates: { baselineCommit: string }[];
      };
    content.candidates[1]!.baselineCommit = "f".repeat(40);
    const x = setup(() => Response.json(envelope(content)));
    await expect(
      x.service.run("propose", request, new AbortController().signal),
    ).rejects.toThrow("PROVIDER_UNAVAILABLE");
    expect(x.observations[0]).toMatchObject({
      layer: "flow",
      stage: "flow_validation",
    });
    expect(JSON.stringify(x.observations)).not.toContain("baselineCommit");
  });
  it("observer failure cannot replace provider failure or reset transport limits", async () => {
    const observer = vi.fn(() => {
        throw new Error(secret);
      }),
      x = setup(() => new Response(secret, { status: 429 }), observer);
    const request = proposalRequest();
    await expect(
      x.transport.call("propose", request, new AbortController().signal),
    ).rejects.toThrow("PROVIDER_UNAVAILABLE");
    await expect(
      x.transport.call("propose", request, new AbortController().signal),
    ).rejects.toThrow("RATE_LIMITED");
    expect(x.network).toHaveBeenCalledTimes(1);
    x.advance();
    await expect(
      x.transport.call("propose", request, new AbortController().signal),
    ).rejects.toThrow("PROVIDER_UNAVAILABLE");
    expect(x.network).toHaveBeenCalledTimes(2);
    expect(observer).toHaveBeenCalledTimes(3);
  });
  it("reports aborted entry before a network call with no invented payload identity", async () => {
    const x = setup(() => Response.json({})),
      signal = AbortSignal.abort(new Error(secret));
    await expect(
      x.transport.call("propose", proposalRequest(), signal),
    ).rejects.toThrow("PROVIDER_UNAVAILABLE");
    expect(x.network).not.toHaveBeenCalled();
    expect(x.observations[0]).toMatchObject({
      layer: "transport",
      stage: "configuration",
      payloadSha256: null,
    });
    expect(JSON.stringify(x.observations)).not.toContain(secret);
  });
  it("contains asynchronous observer rejection without changing the fixed public failure", async () => {
    const x = setup(
      () => new Response(secret, { status: 500 }),
      async () => {
        throw new Error(secret);
      },
    );
    await expect(
      x.transport.call(
        "propose",
        proposalRequest(),
        new AbortController().signal,
      ),
    ).rejects.toThrow("PROVIDER_UNAVAILABLE");
    await Promise.resolve();
    expect(x.network).toHaveBeenCalledTimes(1);
  });
  it("makes no diagnostic callback for valid responses", async () => {
    const request = proposalRequest(),
      x = setup(() =>
        Response.json(envelope(syntheticContent("propose", request))),
      );
    await x.service.run("propose", request, new AbortController().signal);
    expect(x.observations).toEqual([]);
    expect(x.network).toHaveBeenCalledTimes(1);
  });
});
