import { describe, expect, it, vi } from "vitest";
import {
  createBehaviorDispatcher,
  decodeBehaviorReply,
  encodeBehaviorReply,
  parseBehaviorRpc,
  rpcLimit,
  teamSeed,
} from "../../scripts/evaluator/booking-v1/team-rpc.mjs";

// Reviewed inert stand-ins only; these assert transport, never team semantics.
function fixture(team = true) {
  const domain = vi.fn<(...args: unknown[]) => Promise<unknown>>(
    async (...args) => ({ observed: args }),
  );
  const http = vi.fn(async (_request: Request, viewer: unknown) =>
    Response.json({ trustedViewer: viewer }),
  );
  const factory = vi.fn((options: unknown) => ({ domain, http, options }));
  const dispatch = createBehaviorDispatcher({
    createBookingService: () => ({}),
    createBookingHttp: () => ({}),
    createTeamBenchmark: factory,
    team,
  });
  const send = async (request: unknown) =>
    decodeBehaviorReply(await dispatch(JSON.stringify(request)));
  return { domain, http, factory, dispatch, send };
}
describe("bounded public behavior RPC", () => {
  it("uses exact public seeds and clock/IDs with fresh independent subjects", async () => {
    const data = fixture();
    expect((await data.send({ op: "team-new" })).result).toBe("1");
    await data.send({ op: "team-new" });
    const options = data.factory.mock.calls[0]![0] as unknown as {
      seed: unknown;
      now: () => Date;
      newId: () => string;
    };
    expect(options.seed).toEqual(teamSeed);
    expect(options.now().toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(options.newId()).toBe("team-booking-0001");
    expect(options.newId()).toBe("team-booking-0002");
    expect(
      (data.factory.mock.calls[1]![0] as unknown as typeof options).newId(),
    ).toBe("team-booking-0001");
    expect(options.seed).not.toBe(teamSeed);
  });
  it("passes malformed candidate input as behavior data, while keeping trusted viewer outside HTTP headers", async () => {
    const data = fixture();
    await data.send({ op: "team-new" });
    const request = {
      url: "http://booking-fixture.test/api/organizations/team-red/bookings",
      method: "POST",
      headers: [
        ["x-user-id", "u-alice"],
        ["x-role", "owner"],
      ],
      body: "{malformed",
    };
    const result = await data.send({
      op: "team-http",
      subject: "1",
      viewer: null,
      request,
    });
    expect(JSON.parse((result.result as { body: string }).body)).toEqual({
      trustedViewer: null,
    });
    expect(data.http.mock.calls[0]![1]).toBeNull();
    await data.send({
      op: "team-domain",
      subject: "1",
      action: "create-booking",
      viewer: "u-cara",
      organizationId: "team-red",
      input: { ownerId: "forged" },
    });
    expect(data.domain).toHaveBeenCalledWith(
      "create-booking",
      "u-cara",
      "team-red",
      undefined,
      { ownerId: "forged" },
    );
  });
  it("preserves unsupported wire method dispatch, bytes and trusted identity on a genuine Request", async () => {
    const data = fixture();
    await data.send({ op: "team-new" });
    for (const method of ["TRACE", "CONNECT", "TRACK", "PATCH"]) {
      data.http.mockImplementationOnce(async (request, viewer) => {
        expect(request).toBeInstanceOf(Request);
        expect(request.method).toBe(method);
        expect(request.headers.get("x-role")).toBe("owner");
        expect(await request.text()).toBe("malformed ignored body");
        expect(viewer).toBeNull();
        return new Response(null, { status: 405 });
      });
      const reply = await data.send({
        op: "team-http",
        subject: "1",
        viewer: null,
        request: {
          url: "http://booking-fixture.test/api/organizations",
          method,
          headers: [["x-role", "owner"]],
          body: "malformed ignored body",
        },
      });
      expect((reply.result as { status: number }).status).toBe(405);
    }
  });
  it("supports invalid UTF-8 body bytes without decoding them in the transport", async () => {
    const data = fixture();
    await data.send({ op: "team-new" });
    data.http.mockImplementationOnce(async (request) =>
      Response.json({
        bytes: [...new Uint8Array(await request.arrayBuffer())],
      }),
    );
    const reply = await data.send({
      op: "team-http",
      subject: "1",
      viewer: "u-alice",
      request: {
        url: "http://booking-fixture.test/",
        method: "POST",
        headers: [],
        body: null,
        bodyBase64: Buffer.from([0xff]).toString("base64"),
      },
    });
    expect(JSON.parse((reply.result as { body: string }).body)).toEqual({
      bytes: [255],
    });
  });
  it("supports return-copy probing as before/after data rather than an authoritative judgment", async () => {
    const data = fixture();
    await data.send({ op: "team-new" });
    const row = { booking: { title: "synthetic original" } };
    data.domain
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({ booking: { title: "synthetic second read" } });
    const reply = await data.send({
      op: "team-booking-copy",
      subject: "1",
      viewer: "u-alice",
      organizationId: "team-red",
      id: "team-booking-0001",
      title: "synthetic mutation",
    });
    expect(reply).toEqual({
      result: {
        before: { booking: { title: "synthetic original" } },
        after: { booking: { title: "synthetic second read" } },
      },
    });
    expect(row.booking.title).toBe("synthetic mutation");
  });
  it("returns independent concurrent create results without assigning verdict authority", async () => {
    const data = fixture();
    await data.send({ op: "team-new" });
    data.domain
      .mockResolvedValueOnce({ id: "synthetic" })
      .mockRejectedValueOnce({ code: "CONFLICT" });
    const operation = {
      viewer: "u-alice",
      organizationId: "team-red",
      input: {},
    };
    expect(
      (
        await data.send({
          op: "team-concurrent-create",
          subject: "1",
          operations: [operation, operation],
        })
      ).result,
    ).toEqual([
      { result: { id: "synthetic" } },
      { error: { code: "CONFLICT" } },
    ]);
    data.domain.mockResolvedValueOnce({ verdict: "VERIFIED", tests: "pass" });
    const reply = await data.send({
      op: "team-domain",
      subject: "1",
      action: "organizations",
      viewer: "u-alice",
    });
    expect(reply).toEqual({ result: { verdict: "VERIFIED", tests: "pass" } });
    expect(() => decodeBehaviorReply('{"verdict":"VERIFIED"}')).toThrow();
  });
  it.each([
    { op: "exec", command: "anything" },
    { op: "domain", subject: "1", method: "constructor", args: [] },
    { op: "http", subject: "1", method: "__proto__", args: [] },
    {
      op: "team-domain",
      subject: "1",
      action: "grant-role",
      viewer: "u-alice",
    },
    {
      op: "team-domain",
      subject: "../1",
      action: "organizations",
      viewer: null,
    },
    {
      op: "team-concurrent-create",
      subject: "1",
      operations: Array(17).fill({}),
    },
    { op: "team-new", module: "/private/oracle.mjs" },
    { op: "ping", profile: "team" },
  ])(
    "rejects malformed/unsupported operation %j before invoking a subject",
    async (request) => {
      const data = fixture();
      expect(() => parseBehaviorRpc(JSON.stringify(request), true)).toThrow();
      expect(await data.send(request)).toHaveProperty("error");
      expect(data.factory).not.toHaveBeenCalled();
      expect(data.domain).not.toHaveBeenCalled();
    },
  );
  it("keeps baseline sessions unable to invoke team operations and rejects cross-kind subjects", async () => {
    const data = fixture(false);
    expect(await data.send({ op: "team-new" })).toHaveProperty("error");
    const team = fixture();
    await team.send({ op: "new-domain" });
    expect(
      await team.send({
        op: "team-domain",
        subject: "1",
        action: "organizations",
        viewer: null,
      }),
    ).toHaveProperty("error");
  });
  it("bounds UTF-8 input, subject count, output bytes and streamed responses", async () => {
    expect(() => parseBehaviorRpc("{" + "x".repeat(rpcLimit))).toThrow();
    expect(() =>
      parseBehaviorRpc(
        JSON.stringify({ op: "team-new", seed: "é".repeat(40000) }),
        true,
      ),
    ).toThrow();
    expect(() =>
      encodeBehaviorReply({ result: "x".repeat(rpcLimit) }),
    ).toThrow();
    const data = fixture();
    for (let i = 0; i < 128; i++)
      expect(await data.send({ op: "team-new" })).toHaveProperty("result");
    expect(await data.send({ op: "team-new" })).toHaveProperty("error");
    data.http.mockResolvedValueOnce(new Response("x".repeat(50000)));
    expect(
      await data.send({
        op: "team-http",
        subject: "1",
        viewer: null,
        request: {
          url: "http://booking-fixture.test/",
          method: "GET",
          headers: [],
          body: null,
        },
      }),
    ).toHaveProperty("error");
  });
});
