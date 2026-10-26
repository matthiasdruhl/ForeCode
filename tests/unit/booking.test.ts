import { describe, expect, it } from "vitest";
import { createBookingService } from "../../fixtures/booking-v1/src/server/booking-service";
import { createBookingHttp } from "../../fixtures/booking-v1/src/server/http";
import { runHttpOracle } from "../../scripts/evaluator/booking-v1/http-oracle";
import {
  runBaselineOracle,
  type BookingSubjectFactory,
} from "../../scripts/evaluator/booking-v1/oracle";

function subjectFactory(): BookingSubjectFactory {
  return (options) => {
    let id = 0;
    return createBookingService({
      ...options,
      now: () => new Date("2026-11-01T00:00:00Z"),
      newId: () => `oracle-${++id}`,
    });
  };
}
const origin = "http://127.0.0.1:3101";
const slot = {
  title: "Trusted API check",
  resourceId: "room-1",
  startAt: "2026-11-10T11:00:00Z",
  endAt: "2026-11-10T12:00:00Z",
};
function request(
  method: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  return new Request(`${origin}/api/bookings`, {
    method,
    headers: { origin, "Content-Type": "application/json", ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("independent booking baseline oracle", () => {
  it("passes the separate protected HTTP baseline oracle", async () => {
    const results = await runHttpOracle((viewer) =>
      createBookingHttp(createBookingService(), () => viewer),
    );
    expect(results).toHaveLength(5);
    expect(results.filter((result) => result.status !== "pass")).toEqual([]);
  });
  it("passes all 13 domain acceptance cases on newly authored baseline A", async () => {
    const results = await runBaselineOracle(subjectFactory());
    expect(results).toHaveLength(13);
    expect(results.filter((result) => result.status !== "pass")).toEqual([]);
  });
  it("detects owner-check regressions independently of visible tests", async () => {
    const create = subjectFactory();
    const results = await runBaselineOracle((options) => {
      const subject = create(options);
      return {
        ...subject,
        getBooking: (_viewer, id) => subject.getBooking("u-alice", id),
      };
    });
    expect(results.find((result) => result.id === "B002")?.status).toBe("fail");
    expect(results.find((result) => result.id === "B014")?.status).toBe("fail");
  });
});

describe("fixture HTTP boundary", () => {
  it("uses the configured public origin when Next rewrites its internal URL", async () => {
    const api = createBookingHttp(
      createBookingService(),
      () => "u-alice",
      origin,
    );
    const internal = new Request("http://internal-host:9999/api/bookings", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify(slot),
    });
    expect((await api.collection(internal)).status).toBe(201);
    const spoofed = new Request("http://internal-host:9999/api/bookings", {
      method: "POST",
      headers: {
        origin: "http://internal-host:9999",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(slot),
    });
    expect((await api.collection(spoofed)).status).toBe(400);
  });
  it("ignores client-supplied user IDs and requires trusted session resolution", async () => {
    const api = createBookingHttp(createBookingService(), () => null);
    expect(
      (
        await api.collection(
          request("GET", undefined, { "x-user-id": "u-alice" }),
        )
      ).status,
    ).toBe(401);
    expect((await api.collection(request("POST", slot))).status).toBe(401);
  });
  it("maps missing/other-owner reads to the same 404 without mutation", async () => {
    const service = createBookingService();
    const api = createBookingHttp(service, () => "u-bob");
    const other = await api.item(request("GET"), "b-a1");
    const missing = await api.item(request("GET"), "missing");
    expect(other.status).toBe(404);
    expect(await other.json()).toEqual(await missing.json());
    expect((await api.item(request("DELETE"), "b-a1")).status).toBe(404);
    expect(service.getBooking("u-alice", "b-a1").status).toBe("active");
  });
  it("validates strict input, overlapping creates and cancellation through the adapters", async () => {
    const api = createBookingHttp(
      createBookingService({ newId: () => "api-booking" }),
      () => "u-alice",
    );
    expect(
      (await api.collection(request("POST", { ...slot, ownerId: "u-bob" })))
        .status,
    ).toBe(400);
    expect(
      (
        await api.collection(
          request("POST", { ...slot, startAt: "2026-11-10T10:30:00Z" }),
        )
      ).status,
    ).toBe(409);
    expect((await api.collection(request("POST", slot))).status).toBe(201);
    const cancelled = await api.item(request("DELETE"), "api-booking");
    expect(cancelled.status).toBe(200);
    expect((await cancelled.json()).booking.status).toBe("cancelled");
  });
  it("rejects malformed, oversized and cross-origin bodies without raw errors", async () => {
    const api = createBookingHttp(createBookingService(), () => "u-alice");
    expect(
      (
        await api.collection(
          request("POST", slot, { origin: "https://attacker.example.test" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await api.collection(
          request("POST", { ...slot, title: "x".repeat(9000) }),
        )
      ).status,
    ).toBe(400);
    const invalid = new Request(origin, {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: "{bad",
    });
    const result = await api.collection(invalid);
    expect(result.status).toBe(400);
    expect(await result.text()).not.toMatch(/SyntaxError|stack|\/Users\//);
    expect(
      (
        await api.collection(
          request("POST", slot, { "Content-Type": "text/plain" }),
        )
      ).status,
    ).toBe(400);
  });
  it("keeps the allowlisted resource catalog public", async () => {
    const api = createBookingHttp(createBookingService(), () => null);
    const response = api.resources();
    expect(response.status).toBe(200);
    expect(
      (await response.json()).resources.map(
        (resource: { id: string }) => resource.id,
      ),
    ).toEqual(["room-1", "room-2"]);
  });
});
