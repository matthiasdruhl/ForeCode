import "server-only";
import { InterpretRequestSchema } from "@/lib/foresight/interpretation/contracts";
import {
  requestSchemas,
  type FlowRequest,
  type Step,
} from "@/lib/foresight/flow";
import { apiErrorResponse, RequestFailure } from "../http/errors";
import { readJsonRequest } from "../http/request";
import { configuredOrigin } from "./configuration";
import type { createForesightService } from "./service";

export function createForesightHttp(
  service: ReturnType<typeof createForesightService>,
  env: () => Record<string, string | undefined>,
) {
  return async (
    step: Step | "interpret-evidence",
    request: Request,
  ): Promise<Response> => {
    try {
      const origin = configuredOrigin(env());
      if (!origin) throw new RequestFailure("PROVIDER_UNAVAILABLE");
      if (step === "interpret-evidence") {
        const input = await readJsonRequest(
          request,
          InterpretRequestSchema,
          origin,
        );
        const output = await service.interpret(input, request.signal);
        return Response.json(output, {
          headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      const input = await readJsonRequest<FlowRequest>(
        request,
        requestSchemas[step],
        origin,
      );
      const output = await service.run(step, input, request.signal);
      return Response.json(output, {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      return apiErrorResponse(error);
    }
  };
}
