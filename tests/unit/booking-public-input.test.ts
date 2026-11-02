// Reviewed baseline source only. No captured/generated tournament source loads.
import { describe, expect, it } from "vitest";
import { createBookingService } from "../../fixtures/booking-v1/src/server/booking-service";
import { createBookingHttp } from "../../fixtures/booking-v1/src/server/http";

const slot = {
  resourceId: "room-1",
  title: "Public validation",
  startAt: "2026-11-10T13:00:00Z",
  endAt: "2026-11-10T14:00:00Z",
};
const origin = "http://127.0.0.1:3006";
function subject() {
  let ids = 0;
  const service = createBookingService({
    initialBookings: [],
    now: () => new Date("2026-11-01T00:00:00Z"),
    newId: () => `public-${++ids}`,
  });
  return {
    service,
    http: createBookingHttp(service, () => "u-alice"),
    ids: () => ids,
  };
}
function request(title: string) {
  return new Request(origin + "/api/bookings", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ ...slot, title }),
  });
}

describe("public baseline title validation and atomic rejection", () => {
  it.each([
    "",
    " ",
    "x".repeat(121),
    "A\u0000B",
    "A\u001fB",
    "A\u007fB",
    "A\u200bB",
    "A\ufeffB",
  ])(
    "rejects %j through domain and HTTP without consuming an ID or occupying the slot",
    async (title) => {
      const domain = subject();
      expect(() =>
        domain.service.createBooking("u-alice", { ...slot, title }),
      ).toThrowError(expect.objectContaining({ code: "INVALID_INPUT" }));
      expect(domain.ids()).toBe(0);
      expect(domain.service.listBookings("u-alice")).toEqual([]);
      expect(domain.service.createBooking("u-alice", slot).id).toBe("public-1");
      const wire = subject();
      const rejected = await wire.http.collection(request(title));
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({
        error: {
          code: "INVALID_INPUT",
          message: "Check the resource, title and UTC time interval.",
        },
      });
      expect(wire.ids()).toBe(0);
      expect(wire.service.listBookings("u-alice")).toEqual([]);
      const accepted = await wire.http.collection(request(slot.title));
      expect(accepted.status).toBe(201);
      expect((await accepted.json()).booking.id).toBe("public-1");
    },
  );
  it.each(["A", "x".repeat(120), "Café 東京", " Public title "])(
    "accepts and preserves baseline-valid title %j",
    async (title) => {
      const wire = subject();
      const result = await wire.http.collection(request(title));
      expect(result.status).toBe(201);
      expect((await result.json()).booking.title).toBe(title);
      expect(wire.ids()).toBe(1);
    },
  );
});
