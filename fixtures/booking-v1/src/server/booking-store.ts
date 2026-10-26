import type { Booking } from "../domain/booking";
import { BookingError } from "../domain/errors";

// All writes are synchronous, serialized operations in one process/isolate.
// There is no multi-process or durable persistence claim.
export class BookingStore {
  readonly #rows: Map<string, Booking>;
  constructor(initial: readonly Booking[]) {
    this.#rows = new Map(initial.map((row) => [row.id, { ...row }]));
  }
  all(): Booking[] {
    return [...this.#rows.values()].map((row) => ({ ...row }));
  }
  get(id: string): Booking | undefined {
    const row = this.#rows.get(id);
    return row ? { ...row } : undefined;
  }
  insert(row: Booking): Booking {
    if (
      this.#rows.has(row.id) ||
      [...this.#rows.values()].some(
        (other) =>
          other.status === "active" &&
          other.resourceId === row.resourceId &&
          Date.parse(other.startAt) < Date.parse(row.endAt) &&
          Date.parse(row.startAt) < Date.parse(other.endAt),
      )
    )
      throw new BookingError("CONFLICT");
    this.#rows.set(row.id, { ...row });
    return { ...row };
  }
  cancel(id: string): Booking {
    const row = this.#rows.get(id);
    if (!row) throw new BookingError("NOT_FOUND");
    const cancelled: Booking = { ...row, status: "cancelled" };
    this.#rows.set(id, cancelled);
    return { ...cancelled };
  }
}
