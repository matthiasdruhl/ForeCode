import "server-only";
import { BookingError, type BookingFailure } from "../domain/errors";
import type { BookingService } from "./booking-service";

const codes: Record<BookingFailure, number> = {
  INVALID_INPUT: 400,
  CONFLICT: 409,
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
};
const messages: Record<BookingFailure, string> = {
  INVALID_INPUT: "Check the resource, title and UTC time interval.",
  CONFLICT: "This room is already booked for that interval.",
  UNAUTHENTICATED: "Start a demo session to manage bookings.",
  NOT_FOUND: "Booking not found.",
};
export function bookingErrorResponse(error: unknown): Response {
  const known = error instanceof BookingError;
  return Response.json(
    {
      error: {
        code: known ? error.code : "INTERNAL_ERROR",
        message: known
          ? messages[error.code]
          : "The booking request could not be completed.",
      },
    },
    {
      status: known ? codes[error.code] : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
async function inputJson(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
      "application/json" ||
    !request.body
  )
    throw new BookingError("INVALID_INPUT");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > 8192) {
        await reader.cancel();
        throw new BookingError("INVALID_INPUT");
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new BookingError("INVALID_INPUT");
  } finally {
    reader.releaseLock();
  }
}
export function requireSameOrigin(
  request: Request,
  expectedOrigin: string,
): void {
  if (request.headers.get("origin") !== expectedOrigin)
    throw new BookingError("INVALID_INPUT");
}
export function createBookingHttp(
  service: BookingService,
  resolveViewer: (request: Request) => string | null,
  expectedOrigin?: string,
) {
  return {
    async collection(request: Request): Promise<Response> {
      try {
        if (request.method === "GET")
          return json({
            bookings: service.listBookings(resolveViewer(request)),
          });
        if (request.method !== "POST")
          return new Response(null, { status: 405 });
        requireSameOrigin(
          request,
          expectedOrigin ?? new URL(request.url).origin,
        );
        const viewer = resolveViewer(request);
        if (viewer === null) throw new BookingError("UNAUTHENTICATED");
        return json(
          { booking: service.createBooking(viewer, await inputJson(request)) },
          201,
        );
      } catch (error) {
        return bookingErrorResponse(error);
      }
    },
    async item(request: Request, id: string): Promise<Response> {
      try {
        if (request.method === "GET")
          return json({
            booking: service.getBooking(resolveViewer(request), id),
          });
        if (request.method !== "DELETE")
          return new Response(null, { status: 405 });
        requireSameOrigin(
          request,
          expectedOrigin ?? new URL(request.url).origin,
        );
        return json({
          booking: service.cancelBooking(resolveViewer(request), id),
        });
      } catch (error) {
        return bookingErrorResponse(error);
      }
    },
    resources() {
      return json({ resources: service.listResources() });
    },
  };
}
