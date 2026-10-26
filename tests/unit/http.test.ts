import { describe, expect, it } from "vitest";
import { ApiErrorSchema } from "@/lib/contracts/errors";
import { InterpretRequestSchema } from "@/lib/contracts/intents";
import { apiErrorResponse, RequestFailure } from "@/server/http/errors";
import { MAX_REQUEST_BYTES, readJsonRequest } from "@/server/http/request";

const origin = "https://forecode.example.test";
function request(body: string, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/intents/interpret`, {
    method: "POST",
    headers: { origin, "Content-Type": "application/json", ...headers },
    body,
  });
}

describe("bounded JSON ingestion", () => {
  it("accepts only a schema-valid consented payload", async () => {
    const payload = { text: "Support team calendars.", consent: true };
    await expect(
      readJsonRequest(
        request(JSON.stringify(payload)),
        InterpretRequestSchema,
        origin,
      ),
    ).resolves.toEqual(payload);
  });
  it.each([
    ['{"text":"draft","consent":false}', {}],
    ['{"text":"draft","consent":true,"command":"whoami"}', {}],
    ['{"text":', {}],
    ["{}", { origin: "https://attacker.example.test" }],
    ["{}", { "Content-Type": "text/plain" }],
  ])(
    "rejects malformed, unconsented and cross-origin input",
    async (body, headers) => {
      await expect(
        readJsonRequest(request(body, headers), InterpretRequestSchema, origin),
      ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    },
  );
  it("rejects missing Origin and unsupported methods", async () => {
    const noOrigin = request("{}");
    noOrigin.headers.delete("origin");
    await expect(
      readJsonRequest(noOrigin, InterpretRequestSchema, origin),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      readJsonRequest(new Request(origin), InterpretRequestSchema, origin),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
  it("checks actual UTF-8 bytes when content length is absent or false", async () => {
    const body = JSON.stringify({ text: "🌍".repeat(17_000), consent: true });
    expect(new TextEncoder().encode(body).length).toBeGreaterThan(
      MAX_REQUEST_BYTES,
    );
    await expect(
      readJsonRequest(request(body), InterpretRequestSchema, origin),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    await expect(
      readJsonRequest(
        request(body, { "Content-Length": "1" }),
        InterpretRequestSchema,
        origin,
      ),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });
  it("rejects a declared oversized body before parsing it", async () => {
    await expect(
      readJsonRequest(
        request("{}", { "Content-Length": "65537" }),
        InterpretRequestSchema,
        origin,
      ),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });
  it("rejects malformed UTF-8 instead of silently replacing it", async () => {
    const invalid = new Request(origin, {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: new Uint8Array([0xff]),
    });
    await expect(
      readJsonRequest(invalid, InterpretRequestSchema, origin),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});

describe("safe API errors", () => {
  it("never serializes raw exceptions or secrets", async () => {
    const response = apiErrorResponse(
      new Error("provider rejected synthetic-test-secret"),
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(ApiErrorSchema.safeParse(body).success).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(
      /synthetic-test-secret|stack|provider rejected/,
    );
  });
  it.each([
    ["INVALID_REQUEST", 400],
    ["PAYLOAD_TOO_LARGE", 413],
    ["INVALID_REFERENCE", 422],
    ["UNSUPPORTED_OPERATION", 422],
    ["UNTRUSTED_EVIDENCE", 422],
    ["RATE_LIMITED", 429],
    ["PROVIDER_UNAVAILABLE", 503],
  ] as const)("maps %s to HTTP %d", (code, status) => {
    expect(apiErrorResponse(new RequestFailure(code)).status).toBe(status);
  });
});
