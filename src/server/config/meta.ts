import "server-only";
import { z } from "zod";

const MetaEnvironmentSchema = z.object({
  META_MODEL_API_KEY: z.string().trim().min(1).optional(),
  META_MODEL: z.string().trim().min(1).max(160).optional(),
  META_API_BASE_URL: z
    .url()
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        );
      } catch {
        return false;
      }
    })
    .optional(),
  META_CALLS_ENABLED: z.enum(["true", "false"]).default("false"),
});

type MetaEnvironment = z.infer<typeof MetaEnvironmentSchema>;
export type MetaConfiguration =
  | { status: "missing" | "invalid" | "disabled" }
  | {
      status: "configured";
      credentials: Required<
        Pick<
          MetaEnvironment,
          "META_MODEL_API_KEY" | "META_MODEL" | "META_API_BASE_URL"
        >
      >;
    };

export function readMetaConfiguration(
  env: Record<string, string | undefined>,
): MetaConfiguration {
  const parsed = MetaEnvironmentSchema.safeParse({
    META_MODEL_API_KEY: env.META_MODEL_API_KEY || undefined,
    META_MODEL: env.META_MODEL || undefined,
    META_API_BASE_URL: env.META_API_BASE_URL || undefined,
    META_CALLS_ENABLED: env.META_CALLS_ENABLED || undefined,
  });
  if (!parsed.success) return { status: "invalid" };
  const config = parsed.data;
  if (
    !config.META_MODEL_API_KEY ||
    !config.META_MODEL ||
    !config.META_API_BASE_URL
  )
    return { status: "missing" };
  if (config.META_CALLS_ENABLED !== "true") return { status: "disabled" };
  return {
    status: "configured",
    credentials: {
      META_MODEL_API_KEY: config.META_MODEL_API_KEY,
      META_MODEL: config.META_MODEL,
      META_API_BASE_URL: config.META_API_BASE_URL,
    },
  };
}

// Serialize only this projection across the server/client boundary.
// Even configured credentials are not proof of provider access or integration.
export function metaConfigurationStatus(
  env: Record<string, string | undefined>,
) {
  return readMetaConfiguration(env).status;
}
