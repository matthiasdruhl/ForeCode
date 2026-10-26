import assert from "node:assert/strict";
import type { BaselineOracleResult } from "./oracle";

export type BookingHttpSubject = {
  collection(request: Request): Promise<Response>;
  item(request: Request, id: string): Promise<Response>;
  resources(): Response;
};
export type BookingHttpSubjectFactory = (
  trustedViewer: string | null,
) => BookingHttpSubject;
const origin = "http://booking-fixture.test";
const input = {
  resourceId: "room-1",
  title: "HTTP baseline oracle",
  startAt: "2026-11-10T11:00:00Z",
  endAt: "2026-11-10T12:00:00Z",
};
function request(
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`${origin}/api/bookings`, {
    method,
    headers: { origin, "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
export async function runHttpOracle(
  factory: BookingHttpSubjectFactory,
): Promise<BaselineOracleResult[]> {
  const cases = [
    {
      id: "HTTP-IDENTITY",
      scope: "Trusted session resolution, never a viewer header",
      async run() {
        const subject = factory(null);
        assert.equal(
          (
            await subject.collection(
              request("GET", undefined, { "x-user-id": "u-alice" }),
            )
          ).status,
          401,
        );
        assert.equal(
          (await subject.collection(request("POST", input))).status,
          401,
        );
      },
    },
    {
      id: "HTTP-OWNER",
      scope: "404 parity for missing and other-owner bookings",
      async run() {
        const subject = factory("u-bob");
        const other = await subject.item(request("GET"), "b-a1");
        const missing = await subject.item(request("GET"), "no-such-booking");
        assert.equal(other.status, 404);
        assert.equal(missing.status, 404);
        assert.deepEqual(await other.json(), await missing.json());
        assert.equal(
          (await subject.item(request("DELETE"), "b-a1")).status,
          404,
        );
      },
    },
    {
      id: "HTTP-CREATE",
      scope: "Strict creation, conflict and idempotent cancellation",
      async run() {
        const subject = factory("u-alice");
        assert.equal(
          (
            await subject.collection(
              request("POST", { ...input, ownerId: "u-bob" }),
            )
          ).status,
          400,
        );
        const created = await subject.collection(request("POST", input));
        assert.equal(created.status, 201);
        const body = await created.json();
        assert.equal(body.booking.ownerId, "u-alice");
        assert.equal(
          (await subject.collection(request("POST", input))).status,
          409,
        );
        const first = await subject.item(request("DELETE"), body.booking.id);
        const again = await subject.item(request("DELETE"), body.booking.id);
        assert.equal(first.status, 200);
        assert.deepEqual(await first.json(), await again.json());
      },
    },
    {
      id: "HTTP-INPUT",
      scope: "Malformed/oversized JSON, CSRF and content type rejection",
      async run() {
        const subject = factory("u-alice");
        assert.equal(
          (
            await subject.collection(
              request("POST", input, { origin: "https://other.test" }),
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await subject.collection(
              request("POST", input, { "Content-Type": "text/plain" }),
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await subject.collection(
              request("POST", { ...input, title: "x".repeat(9000) }),
            )
          ).status,
          400,
        );
        const malformed = new Request(origin, {
          method: "POST",
          headers: { origin, "Content-Type": "application/json" },
          body: "{",
        });
        const result = await subject.collection(malformed);
        assert.equal(result.status, 400);
        assert.doesNotMatch(await result.text(), /SyntaxError|stack|\/Users\//);
      },
    },
    {
      id: "HTTP-RESOURCES",
      scope: "Read-only catalog remains public",
      async run() {
        const result = factory(null).resources();
        assert.equal(result.status, 200);
        const body = await result.json();
        assert.deepEqual(
          body.resources.map((resource: { id: string }) => resource.id),
          ["room-1", "room-2"],
        );
      },
    },
  ];
  const results: BaselineOracleResult[] = [];
  for (const check of cases) {
    try {
      await check.run();
      results.push({ id: check.id, scope: check.scope, status: "pass" });
    } catch {
      results.push({ id: check.id, scope: check.scope, status: "fail" });
    }
  }
  return results;
}
