import { z } from "zod";

export type Booking = {
  id: string;
  ownerId: string;
  resourceId: string;
  startAt: string;
  endAt: string;
  title: string;
  status: "active" | "cancelled";
  createdAt: string;
};
export type CreateBookingInput = {
  resourceId: string;
  startAt: string;
  endAt: string;
  title: string;
};
export const CreateBookingInputSchema = z
  .strictObject({
    resourceId: z.enum(["room-1", "room-2"]),
    startAt: z.iso.datetime({ offset: false }),
    endAt: z.iso.datetime({ offset: false }),
    title: z
      .string()
      .min(1)
      .max(120)
      .refine(
        (value) => value.trim().length > 0 && !/[\p{Cc}\p{Cf}]/u.test(value),
      ),
  })
  .refine((input) => Date.parse(input.startAt) < Date.parse(input.endAt));
export const resources = Object.freeze([
  Object.freeze({ id: "room-1", name: "Room 1" }),
  Object.freeze({ id: "room-2", name: "Room 2" }),
]);
export const baselineBookings: readonly Booking[] = Object.freeze([
  Object.freeze({
    id: "b-a1",
    ownerId: "u-alice",
    resourceId: "room-1",
    startAt: "2026-11-10T10:00:00.000Z",
    endAt: "2026-11-10T11:00:00.000Z",
    title: "Planning session",
    status: "active" as const,
    createdAt: "2026-11-01T00:00:00.000Z",
  }),
  Object.freeze({
    id: "b-b1",
    ownerId: "u-bob",
    resourceId: "room-2",
    startAt: "2026-11-10T10:00:00.000Z",
    endAt: "2026-11-10T11:00:00.000Z",
    title: "Project review",
    status: "active" as const,
    createdAt: "2026-11-01T00:00:00.000Z",
  }),
]);
