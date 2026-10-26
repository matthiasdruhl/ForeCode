import { describe, expect, it } from "vitest";
import {
  metaConfigurationStatus,
  readMetaConfiguration,
} from "@/server/config/meta";

const credentials = {
  META_MODEL_API_KEY: "synthetic-test-secret",
  META_MODEL: "test-model",
  META_API_BASE_URL: "https://model.example.test/v1",
};

describe("server-only configuration", () => {
  it("returns a safe missing state without credentials", () => {
    expect(readMetaConfiguration({})).toEqual({ status: "missing" });
  });
  it("keeps inference disabled by default, even with keys", () => {
    expect(readMetaConfiguration(credentials)).toEqual({ status: "disabled" });
  });
  it("marks configuration as configured only after the explicit switch", () => {
    const env = { ...credentials, META_CALLS_ENABLED: "true" };
    expect(readMetaConfiguration(env).status).toBe("configured");
    expect(metaConfigurationStatus(env)).toBe("configured");
    expect(JSON.stringify(metaConfigurationStatus(env))).not.toContain(
      credentials.META_MODEL_API_KEY,
    );
  });
  it.each([
    "http://localhost:8000",
    "https://user:secret@example.test/v1",
    "not-a-url",
    "https://example.test/?key=secret",
    "https://example.test/#secret",
  ])("rejects unsafe endpoint %s", (endpoint) => {
    expect(
      readMetaConfiguration({ ...credentials, META_API_BASE_URL: endpoint }),
    ).toEqual({ status: "invalid" });
  });
  it("does not return malformed input or validation diagnostics", () => {
    const result = readMetaConfiguration({
      ...credentials,
      META_CALLS_ENABLED: "synthetic-secret",
    });
    expect(result).toEqual({ status: "invalid" });
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
  });
});
