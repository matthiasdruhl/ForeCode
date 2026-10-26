import { randomUUID } from "node:crypto";
import {
  baselineBookings,
  CreateBookingInputSchema,
  resources,
  type Booking,
} from "../domain/booking";
import { BookingError } from "../domain/errors";
import { BookingStore } from "./booking-store";

export function createBookingService(
  options: {
    initialBookings?: readonly Booking[];
    now?: () => Date;
    newId?: () => string;
  } = {},
) {
  const store = new BookingStore(options.initialBookings ?? baselineBookings);
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? randomUUID;
  function viewer(id: string | null): string {
    if (id === null || !["u-alice", "u-bob", "u-cara"].includes(id))
      throw new BookingError("UNAUTHENTICATED");
    return id;
  }
  function owned(viewerId: string, id: string): Booking {
    const row = store.get(id);
    if (!row || row.ownerId !== viewerId) throw new BookingError("NOT_FOUND");
    return row;
  }
  return {
    createBooking(viewerId: string | null, input: unknown): Booking {
      const ownerId = viewer(viewerId);
      const parsed = CreateBookingInputSchema.safeParse(input);
      if (!parsed.success) throw new BookingError("INVALID_INPUT");
      const id = newId();
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id))
        throw new BookingError("INVALID_INPUT");
      return store.insert({
        ...parsed.data,
        id,
        ownerId,
        status: "active",
        startAt: new Date(parsed.data.startAt).toISOString(),
        endAt: new Date(parsed.data.endAt).toISOString(),
        createdAt: now().toISOString(),
      });
    },
    listBookings(viewerId: string | null): Booking[] {
      const ownerId = viewer(viewerId);
      return store
        .all()
        .filter((row) => row.ownerId === ownerId)
        .sort(
          (left, right) =>
            Date.parse(left.startAt) - Date.parse(right.startAt) ||
            (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
        );
    },
    getBooking(viewerId: string | null, id: string): Booking {
      return owned(viewer(viewerId), id);
    },
    cancelBooking(viewerId: string | null, id: string): Booking {
      const row = owned(viewer(viewerId), id);
      return store.cancel(row.id);
    },
    listResources() {
      return resources.map((resource) => ({ ...resource }));
    },
  };
}
export type BookingService = ReturnType<typeof createBookingService>;
