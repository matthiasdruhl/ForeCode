import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  META_LIMITS,
  PROMPT_VERSION,
  buildMetaPayload,
} from "@/lib/foresight/prompts";
import {
  buildInterpretationPayload,
  INTERPRET_PROMPT_VERSION,
} from "@/lib/foresight/interpretation/prompts";
import type { InterpretationContext } from "@/lib/foresight/interpretation/contracts";
import type { FlowRequest, Step } from "@/lib/foresight/flow";
import { ProviderInfoSchema } from "@/lib/contracts/provider";
import { canonicalJson } from "@/lib/report/canonical";
import { RequestFailure } from "../http/errors";
import {
  observeScientistFailure,
  scientistFailureCode,
  type ScientistFailureObserver,
  type ScientistFailureObservation,
} from "./failure-observation";
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
export type TransportStep = Step | "interpret-evidence";
export type TransportObservation = {
  step: TransportStep;
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
type TransportResult = {
  content: unknown;
  provider: z.infer<typeof ProviderInfoSchema>;
  payloadSha256: string;
};
export function createMetaTransport(options: {
  env: () => Record<string, string | undefined>;
  fetch: typeof fetch;
  now?: () => number;
  observeFailure?: ScientistFailureObserver;
}) {
  const now = options.now ?? Date.now;
  let active = false,
    total = 0,
    lastCall = -Infinity;
  const attempts: { step: TransportStep; at: number }[] = [];
  // Bounded process memory only: no raw prompts/responses, files or public logs.
  const observations: TransportObservation[] = [];
  // A provider response identity may authenticate only one observed invocation.
  // Reusing it for different stages would make sourceEvidenceId ambiguous.
  const responseIdentities = new Set<string>();
  function call(
    step: Step,
    request: FlowRequest,
    signal: AbortSignal,
  ): Promise<TransportResult>;
  function call(
    step: "interpret-evidence",
    request: InterpretationContext,
    signal: AbortSignal,
  ): Promise<TransportResult>;
  async function call(
    step: TransportStep,
    request: FlowRequest | InterpretationContext,
    signal: AbortSignal,
  ): Promise<TransportResult> {
    let stage: ScientistFailureObservation["stage"] = "configuration";
    let payloadSha256: string | null = null;
    let httpStatus: number | undefined;
    try {
      const config = foresightConfiguration(options.env());
      if (config.status !== "configured" || signal.aborted)
        throw new RequestFailure("PROVIDER_UNAVAILABLE");
      const model = config.credentials.META_MODEL;
      const promptVersion =
        step === "interpret-evidence"
          ? INTERPRET_PROMPT_VERSION
          : PROMPT_VERSION;
      stage = "request";
      const payload =
        step === "interpret-evidence"
          ? buildInterpretationPayload(request as InterpretationContext, model)
          : buildMetaPayload(step, request as FlowRequest, model);
      payloadSha256 = digest(payload);
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
      stage = "limits";
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
        stage = "fetch";
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
        stage = "response";
        if (response.status >= 100 && response.status <= 599)
          httpStatus = response.status;
        const responseJson = await boundedJson(response, combined);
        stage = "envelope";
        const envelope = envelopeSchema.parse(responseJson);
        stage = "identity_usage";
        if (
          envelope.model !== model ||
          combined.aborted ||
          (envelope.usage &&
            (envelope.usage.completion_tokens > META_LIMITS.outputTokens ||
              (envelope.usage.completion_tokens_details?.reasoning_tokens ??
                0) > envelope.usage.completion_tokens ||
              (envelope.usage.prompt_tokens_details?.cached_tokens ?? 0) >
                envelope.usage.prompt_tokens ||
              envelope.usage.total_tokens !==
                envelope.usage.prompt_tokens +
                  envelope.usage.completion_tokens))
        )
          throw new RequestFailure("PROVIDER_UNAVAILABLE");
        // Revoked spending approval or changed provider configuration invalidates
        // an in-flight reply as well. Never reuse a result after authorization changes.
        stage = "revalidation";
        const currentApproval = options.env();
        const currentConfig = foresightConfiguration(currentApproval);
        if (
          currentConfig.status !== "configured" ||
          currentConfig.credentials.META_MODEL !== model ||
          (currentApproval.META_APPROVED_PAYLOAD_SHA256 &&
            currentApproval.META_APPROVED_PAYLOAD_SHA256 !== digest(payload))
        )
          throw new RequestFailure("PROVIDER_UNAVAILABLE");
        stage = "identity_usage";
        const responseIdentity = `meta-${digest(envelope.id)}`;
        if (responseIdentities.has(responseIdentity))
          throw new RequestFailure("PROVIDER_UNAVAILABLE");
        const requestId = response.headers.get("x-request-id");
        if (requestId !== null && requestId.length > 256)
          throw new RequestFailure("PROVIDER_UNAVAILABLE");
        responseIdentities.add(responseIdentity);
        const observation: TransportObservation = {
          step,
          model,
          promptVersion,
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
        stage = "content_json";
        return {
          payloadSha256: digest(payload),
          content: JSON.parse(envelope.choices[0]!.message.content) as unknown,
          provider: ProviderInfoSchema.parse({
            provider: "meta",
            model,
            mode: "live",
            promptVersion,
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
    } catch (error) {
      observeScientistFailure(options.observeFailure, {
        schemaVersion: "scientist-failure-observation.local.v1",
        layer: "transport",
        stage,
        step,
        at: new Date(now()).toISOString(),
        payloadSha256,
        code: scientistFailureCode(error),
        ...(httpStatus === undefined ? {} : { httpStatus }),
      });
      throw error;
    }
  }
  return { call, observations: () => structuredClone(observations) };
}
