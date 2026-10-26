import { expect, it } from "vitest";
import { createBookingService } from "../../src/server/booking-service";

it("lists only Alice's initial booking and accepts an adjacent slot", () => {
  const service = createBookingService({
    now: () => new Date("2026-11-01T00:00:00Z"),
    newId: () => "b-smoke",
  });
  expect(service.listBookings("u-alice").map((row) => row.id)).toEqual([
    "b-a1",
  ]);
  const booking = service.createBooking("u-alice", {
    resourceId: "room-1",
    title: "Adjacent slot",
    startAt: "2026-11-10T11:00:00Z",
    endAt: "2026-11-10T12:00:00Z",
  });
  expect(booking).toMatchObject({
    id: "b-smoke",
    ownerId: "u-alice",
    status: "active",
  });
});
