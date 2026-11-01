import "server-only";
import { configuredOrigin } from "./configuration";
import { RequestFailure } from "../http/errors";

// Process-local research records and quotas support one trusted local operator.
// These declarations are operating constraints, never user authentication. The
// standard start/dev commands bind loopback; forwarding/proxying is unsupported.
// No hosted/multiuser mode, client intent/session header, or distributed fallback.
export function assertLocalResearchDeployment(
  env: Record<string, string | undefined>,
  request: Request,
) {
  const origin = configuredOrigin(env);
  if (
    !origin ||
    env.FORECODE_RESEARCH_MODE !== "local-single-operator" ||
    env.FORECODE_RESEARCH_PROCESSES !== "1" ||
    [
      "VERCEL",
      "AWS_LAMBDA_FUNCTION_NAME",
      "K_SERVICE",
      "NETLIFY",
      "RENDER_SERVICE_ID",
    ].some((k) => Boolean(env[k]))
  )
    throw new RequestFailure("PROVIDER_UNAVAILABLE");
  const url = new URL(origin),
    incoming = new URL(request.url);
  const loopback = (u: URL) =>
    u.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
  // Next normalizes loopback hosts in its internal Request URL. The exact
  // browser Origin remains checked by readJsonRequest; only local aliases at
  // the same listener port are equivalent here.
  if (!loopback(url) || !loopback(incoming) || incoming.port !== url.port)
    throw new RequestFailure("PROVIDER_UNAVAILABLE");
}
