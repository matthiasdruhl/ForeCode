import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  META_LIMITS,
  PROMPT_VERSION,
  buildMetaPayload,
} from "@/lib/foresight/prompts";
import type { FlowRequest, Step } from "@/lib/foresight/flow";
import { ProviderInfoSchema } from "@/lib/contracts/provider";
import { canonicalJson } from "@/lib/report/canonical";
import { RequestFailure } from "../http/errors";
import { foresightConfiguration, META_ENDPOINT } from "./configuration";

export const digest = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
const tokenCount = z.number().int().nonnegative().max(10_000_000);
const envelopeSchema = z.strictObject({
  id: z.string().min(1).max(256),
  object: z.literal("chat.completion"),
  model: z.string().min(1).max(160),
  created: z.number().int().nonnegative(),
  choices: z
    .array(
      z.strictObject({
        index: z.literal(0),
        finish_reason: z.literal("stop"),
        logprobs: z.null().optional(),
        message: z.strictObject({
          role: z.literal("assistant"),
          content: z.string().min(2).max(META_LIMITS.outputBytes),
          refusal: z.null().optional(),
          annotations: z.array(z.never()).optional(),
          reasoning_content: z
            .string()
            .max(META_LIMITS.outputBytes)
            .nullable()
            .optional(),
        }),
      }),
    )
    .length(1),
  usage: z
    .object({
      prompt_tokens: tokenCount,
      completion_tokens: tokenCount,
      total_tokens: tokenCount,
      completion_tokens_details: z
        .object({ reasoning_tokens: tokenCount.optional() })
        .optional(),
      prompt_tokens_details: z
        .object({ cached_tokens: tokenCount.optional() })
        .optional(),
    })
    .nullable()
    .optional(),
  system_fingerprint: z.string().max(256).nullable().optional(),
  service_tier: z.string().max(128).nullable().optional(),
});
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted)
    return Promise.reject(new RequestFailure("PROVIDER_UNAVAILABLE"));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new RequestFailure("PROVIDER_UNAVAILABLE"));
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
async function boundedJson(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (
    !response.ok ||
    response.redirected ||
    response.headers.get("content-type")?.split(";")[0]?.trim() !==
      "application/json" ||
    (length !== null &&
      (!/^\d+$/.test(length) || Number(length) > META_LIMITS.outputBytes)) ||
    !response.body
  ) {
    void response.body?.cancel().catch(() => {});
    throw new RequestFailure("PROVIDER_UNAVAILABLE");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > META_LIMITS.outputBytes)
        throw new RequestFailure("PROVIDER_UNAVAILABLE");
      chunks.push(value);
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export type TransportObservation = {
  step: Step;
  model: string;
  promptVersion: string;
  responseIdentity: string;
  requestIdentity: string | null;
  contextIdentity: string;
  payloadIdentity: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    reasoningTokens: number | null;
  } | null;
  cost: null;
};
export function createMetaTransport(options: {
  env: () => Record<string, string | undefined>;
  fetch: typeof fetch;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let active = false,
    total = 0,
    lastCall = -Infinity;
  const attempts: { step: Step; at: number }[] = [];
  // Bounded process memory only: no raw prompts/responses, files or public logs.
  const observations: TransportObservation[] = [];
  async function call(step: Step, request: FlowRequest, signal: AbortSignal) {
    const config = foresightConfiguration(options.env());
    if (config.status !== "configured" || signal.aborted)
      throw new RequestFailure("PROVIDER_UNAVAILABLE");
    const model = config.credentials.META_MODEL;
    const payload = buildMetaPayload(step, request, model);
    const body = JSON.stringify(payload);
    if (new TextEncoder().encode(body).byteLength > META_LIMITS.inputBytes)
      throw new RequestFailure("PAYLOAD_TOO_LARGE");
    const approval = options.env();
    if (
      approval.META_APPROVED_PAYLOAD_SHA256 &&
      approval.META_APPROVED_PAYLOAD_SHA256 !== digest(payload)
    )
      throw new RequestFailure("PROVIDER_UNAVAILABLE");
    const approvedLimit =
      approval.META_APPROVED_CALL_LIMIT === undefined
        ? META_LIMITS.totalPerProcess
        : Number(approval.META_APPROVED_CALL_LIMIT);
    if (
      !Number.isInteger(approvedLimit) ||
      approvedLimit < 1 ||
      approvedLimit > META_LIMITS.totalPerProcess
    )
      throw new RequestFailure("PROVIDER_UNAVAILABLE");
    const at = now();
    while (attempts.length && attempts[0]!.at <= at - 3_600_000)
      attempts.shift();
    if (
      active ||
      total >= approvedLimit ||
      at - lastCall < META_LIMITS.intervalMs ||
      attempts.filter((item) => item.step === step).length >=
        META_LIMITS.perEndpointPerHour
    )
      throw new RequestFailure("RATE_LIMITED");
    active = true;
    total++;
    lastCall = at;
    attempts.push({ step, at });
    const controller = new AbortController();
    const deadline = setTimeout(
      () => controller.abort(),
      META_LIMITS.timeoutMs,
    );
    const combined = AbortSignal.any([signal, controller.signal]);
    try {
      const response = await abortable(
        options.fetch(META_ENDPOINT, {
          method: "POST",
          redirect: "error",
          cache: "no-store",
          signal: combined,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.credentials.META_MODEL_API_KEY}`,
          },
          body,
        }),
        combined,
      );
      const envelope = envelopeSchema.parse(
        await boundedJson(response, combined),
      );
      if (
        envelope.model !== model ||
        combined.aborted ||
        (envelope.usage &&
          (envelope.usage.completion_tokens > META_LIMITS.outputTokens ||
            (envelope.usage.completion_tokens_details?.reasoning_tokens ?? 0) >
              envelope.usage.completion_tokens ||
            (envelope.usage.prompt_tokens_details?.cached_tokens ?? 0) >
              envelope.usage.prompt_tokens ||
            envelope.usage.total_tokens !==
              envelope.usage.prompt_tokens + envelope.usage.completion_tokens))
      )
        throw new RequestFailure("PROVIDER_UNAVAILABLE");
      const responseIdentity = `meta-${digest(envelope.id)}`;
      const requestId = response.headers.get("x-request-id");
      if (requestId !== null && requestId.length > 256)
        throw new RequestFailure("PROVIDER_UNAVAILABLE");
      const observation: TransportObservation = {
        step,
        model,
        promptVersion: PROMPT_VERSION,
        responseIdentity,
        requestIdentity: requestId ? digest(requestId) : null,
        contextIdentity: digest(request),
        payloadIdentity: digest(payload),
        usage: envelope.usage
          ? {
              inputTokens: envelope.usage.prompt_tokens,
              outputTokens: envelope.usage.completion_tokens,
              totalTokens: envelope.usage.total_tokens,
              reasoningTokens:
                envelope.usage.completion_tokens_details?.reasoning_tokens ??
                null,
            }
          : null,
        cost: null,
      };
      observations.push(observation);
      if (observations.length > META_LIMITS.totalPerProcess)
        observations.shift();
      return {
        content: JSON.parse(envelope.choices[0]!.message.content) as unknown,
        provider: ProviderInfoSchema.parse({
          provider: "meta",
          model,
          mode: "live",
          promptVersion: PROMPT_VERSION,
          sourceEvidenceId: responseIdentity,
        }),
      };
    } catch {
      throw new RequestFailure("PROVIDER_UNAVAILABLE");
    } finally {
      clearTimeout(deadline);
      controller.abort();
      active = false;
    }
  }
  return { call, observations: () => structuredClone(observations) };
}
