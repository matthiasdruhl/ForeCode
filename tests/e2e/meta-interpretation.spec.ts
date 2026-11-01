import { webOrigin } from "../support/browser-origins";
import { expect, test } from "@playwright/test";

test("interpretation route fails closed without issued IDs and rejects browser evidence", async ({
  request,
}) => {
  const input = {
    schemaVersion: "scientist-interpret-request.v2",
    hypothesisId: "12dc6959-7579-43b7-8112-5b1e0a36eb22",
    evidenceSummaryId: "23dc6959-7579-43b7-8112-5b1e0a36eb22",
    consent: true,
  };
  const headers = { origin: webOrigin };
  const missing = await request.post("/api/foresight/interpret-evidence", {
    headers,
    data: input,
  });
  expect(missing.status()).toBe(422);
  expect(missing.headers()["cache-control"]).toBe("no-store");
  expect((await missing.json()).error.code).toBe("INVALID_REFERENCE");
  const forged = await request.post("/api/foresight/interpret-evidence", {
    headers,
    data: { ...input, evidence: { verdict: "VERIFIED" } },
  });
  expect(forged.status()).toBe(400);
  const noConsent = await request.post("/api/foresight/interpret-evidence", {
    headers,
    data: { ...input, consent: false },
  });
  expect(noConsent.status()).toBe(400);
  expect(
    (await request.get("/api/foresight/interpret-evidence")).status(),
  ).toBe(400);
});
