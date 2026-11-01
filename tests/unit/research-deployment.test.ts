import { describe, expect, it, vi } from "vitest";
import { assertLocalResearchDeployment } from "@/server/meta/deployment";
import { createForesightHttp } from "@/server/meta/http";
import { proposalRequest } from "../support/foresight";
const origin = "http://127.0.0.1:3189";
const env = {
  FORECODE_ORIGIN: origin,
  FORECODE_RESEARCH_MODE: "local-single-operator",
  FORECODE_RESEARCH_PROCESSES: "1",
};
const request = (url = origin) =>
  new Request(url + "/api/foresight/propose", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(proposalRequest()),
  });
describe("enforced local single-operator research deployment", () => {
  it("accepts explicit loopback single-process operation", () => {
    expect(() => assertLocalResearchDeployment(env, request())).not.toThrow();
    for (const host of ["localhost", "[::1]"]) {
      const url = `http://${host}:3189`;
      expect(() =>
        assertLocalResearchDeployment(
          { ...env, FORECODE_ORIGIN: url },
          request(url),
        ),
      ).not.toThrow();
    }
  });
  it("accepts Next's equivalent loopback request alias but rejects another port", () => {
    expect(() =>
      assertLocalResearchDeployment(env, request("http://localhost:3189")),
    ).not.toThrow();
    expect(() =>
      assertLocalResearchDeployment(env, request("http://localhost:3190")),
    ).toThrow();
  });
  it.each(["FORECODE_RESEARCH_MODE", "FORECODE_RESEARCH_PROCESSES"])(
    "rejects missing %s",
    (key) => {
      expect(() =>
        assertLocalResearchDeployment({ ...env, [key]: undefined }, request()),
      ).toThrow();
    },
  );
  it.each(["multiuser", "2", "0", "", "01"])(
    "rejects unsupported mode/count %s",
    (value) => {
      expect(() =>
        assertLocalResearchDeployment(
          { ...env, FORECODE_RESEARCH_MODE: value },
          request(),
        ),
      ).toThrow();
      expect(() =>
        assertLocalResearchDeployment(
          { ...env, FORECODE_RESEARCH_PROCESSES: value },
          request(),
        ),
      ).toThrow();
    },
  );
  it.each([
    "VERCEL",
    "AWS_LAMBDA_FUNCTION_NAME",
    "K_SERVICE",
    "NETLIFY",
    "RENDER_SERVICE_ID",
  ])("rejects hosted indicator %s", (key) => {
    expect(() =>
      assertLocalResearchDeployment({ ...env, [key]: "active" }, request()),
    ).toThrow();
  });
  it.each([
    "https://public.example.test",
    "https://localhost:3189",
    "http://192.168.1.1:3189",
  ])("rejects unsupported origin %s", (url) => {
    expect(() =>
      assertLocalResearchDeployment(
        { ...env, FORECODE_ORIGIN: url },
        request(url),
      ),
    ).toThrow();
  });
  it("rejects proxy origin mismatches and ignores client identity headers", async () => {
    const run = vi.fn(),
      interpret = vi.fn(),
      http = createForesightHttp({ run, interpret }, () => ({
        ...env,
        FORECODE_RESEARCH_MODE: "multiuser",
      }));
    const r = request();
    r.headers.set("x-session-id", "trusted-admin");
    r.headers.set("x-forwarded-for", "127.0.0.1");
    expect((await http("propose", r)).status).toBe(503);
    expect(run).not.toHaveBeenCalled();
    expect(() =>
      assertLocalResearchDeployment(
        env,
        request("https://public.example.test"),
      ),
    ).toThrow();
  });
  it("withholds in-flight results if operating declarations change", async () => {
    const state = { ...env };
    const run = vi.fn(async () => {
      state.FORECODE_RESEARCH_PROCESSES = "2";
      return {} as never;
    });
    const http = createForesightHttp({ run, interpret: vi.fn() }, () => state);
    expect((await http("propose", request())).status).toBe(503);
    expect(run).toHaveBeenCalledOnce();
  });
});
