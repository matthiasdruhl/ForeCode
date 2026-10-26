import "server-only";
import { randomBytes } from "node:crypto";
import { createBookingService, type BookingService } from "./booking-service";
import { createBookingHttp } from "./http";

// Explicit public origin: Next's internal request URL is not the CSRF authority.
export const demoOrigin =
  process.env.BOOKING_DEMO_ORIGIN ?? "http://127.0.0.1:3006";
const configuredOrigin = new URL(demoOrigin);
if (
  configuredOrigin.origin !== demoOrigin ||
  !["127.0.0.1", "localhost", "[::1]"].includes(configuredOrigin.hostname) ||
  configuredOrigin.protocol !== "http:"
)
  throw new Error("Booking demo requires an explicit HTTP loopback origin.");

const runtime = globalThis as typeof globalThis & {
  __forecodeBookingFixture?: { service: BookingService; sessionToken: string };
};
if (!runtime.__forecodeBookingFixture) {
  let nextId = 0;
  runtime.__forecodeBookingFixture = {
    service: createBookingService({
      now: () => new Date("2026-11-01T00:00:00.000Z"),
      newId: () => `b-demo-${++nextId}`,
    }),
    sessionToken: randomBytes(32).toString("hex"),
  };
}
export const fixtureRuntime = runtime.__forecodeBookingFixture;
export const bookingHttp = createBookingHttp(
  fixtureRuntime.service,
  (request) => {
    const cookie = request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("booking_demo_session="));
    return cookie?.slice("booking_demo_session=".length) ===
      fixtureRuntime.sessionToken
      ? "u-alice"
      : null;
  },
  demoOrigin,
);
