import "server-only";
import { loadApprovedCertificates } from "@/server/artifacts/recording-catalog";
import { apiErrorResponse, RequestFailure } from "./errors";

export async function demoHttp(
  request: Request,
  load = loadApprovedCertificates,
) {
  try {
    const url = new URL(request.url);
    if (request.method !== "GET")
      throw new RequestFailure("UNSUPPORTED_OPERATION");
    if (url.search || request.body !== null)
      throw new RequestFailure("INVALID_REQUEST");
    return Response.json((await load()).demo, {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
