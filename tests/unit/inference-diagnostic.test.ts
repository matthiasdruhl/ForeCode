import { afterEach, describe, expect, it, vi } from "vitest";
import { reproduceScientistFailure } from "../../scripts/meta/diagnose-inference";
import { buildMetaPayload } from "@/lib/foresight/prompts";
import { digest } from "@/server/meta/transport";
import { proposalRequest } from "../support/foresight";

function record() {
  const request = proposalRequest();
  const payload = buildMetaPayload(
    "propose",
    request,
    "muse-spark-1.3-contributor",
  );
  return { step: "propose", request, payload, payloadSha256: digest(payload) };
}

afterEach(() => vi.unstubAllGlobals());
describe("offline inference reproduction", () => {
  it.each([403, 500] as const)(
    "reproduces HTTP%s masking without network or credentials",
    async (status) => {
      const realFetch = vi.fn(() => {
        throw new Error("Network forbidden");
      });
      vi.stubGlobal("fetch", realFetch);
      const source = record();
      const result = await reproduceScientistFailure(source, status);
      expect(realFetch).not.toHaveBeenCalled();
      expect(digest(JSON.parse(result.wire))).toBe(source.payloadSha256);
      expect(result.summary.providerRequests).toBe(0);
      expect(result.summary.simulation.fetchCalls).toBe(1);
      expect(result.summary.simulation.failures[0]).toMatchObject({
        stage: "response",
        httpStatus: status,
      });
      expect(JSON.stringify(result.summary)).not.toContain(
        "offline-diagnostic-sentinel",
      );
      expect(result.summary.proposedTotalMicroUsd).toBeLessThan(398025);
      for (const probe of result.probes) {
        const { response_format: format, ...rest } = probe.payload as Record<
          string,
          unknown
        >;
        expect(rest).toEqual(result.probes[0]!.payload);
        if (probe.name === "proposal-schema")
          expect(format).toEqual(source.payload.response_format);
      }
    },
  );

  it("refuses tampered artifacts and requests from a different builder version", async () => {
    const corrupted = record();
    corrupted.payload.n = 2;
    await expect(reproduceScientistFailure(corrupted)).rejects.toThrow(
      "Record digest mismatch",
    );
    corrupted.payloadSha256 = digest(corrupted.payload);
    await expect(reproduceScientistFailure(corrupted)).rejects.toThrow(
      "Current builder differs",
    );
  });
});
