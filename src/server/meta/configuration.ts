import "server-only";
import { readMetaConfiguration } from "../config/meta";

export const META_BASE_URL = "https://api.meta.ai/v1";
export const META_ENDPOINT = `${META_BASE_URL}/chat/completions`;
const models = new Set(["muse-spark-1.3", "muse-spark-1.3-contributor"]);
export function foresightConfiguration(
  env: Record<string, string | undefined>,
) {
  const config = readMetaConfiguration(env);
  if (config.status !== "configured") return config;
  if (
    config.credentials.META_API_BASE_URL !== META_BASE_URL ||
    !models.has(config.credentials.META_MODEL)
  )
    return { status: "invalid" as const };
  // A key or the old enable flag alone is never spending approval.
  if (env.META_SPENDING_APPROVED !== "true")
    return { status: "disabled" as const };
  return config;
}
export function publicForesightConfiguration(
  env: Record<string, string | undefined>,
) {
  const config = foresightConfiguration(env);
  // Show the server-selected model even while calls are disabled, only if it is
  // allowlisted. Never serialize the credentials object or arbitrary env values.
  const model = models.has(env.META_MODEL ?? "") ? env.META_MODEL! : null;
  return { status: config.status, model, endpoint: META_ENDPOINT };
}
export type PublicForesightConfiguration = ReturnType<
  typeof publicForesightConfiguration
>;
export function configuredOrigin(
  env: Record<string, string | undefined>,
): string | null {
  try {
    const raw = env.FORECODE_ORIGIN;
    if (!raw) return null;
    const url = new URL(raw);
    if (url.origin !== raw) return null;
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      )
    )
      return null;
    return raw;
  } catch {
    return null;
  }
}
