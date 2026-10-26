export type BookingFailure =
  "INVALID_INPUT" | "CONFLICT" | "UNAUTHENTICATED" | "NOT_FOUND";
export class BookingError extends Error {
  constructor(readonly code: BookingFailure) {
    super(code);
    this.name = "BookingError";
  }
}
