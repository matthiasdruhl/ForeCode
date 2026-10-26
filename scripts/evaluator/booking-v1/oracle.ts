import assert from "node:assert/strict";

// Public baseline oracle, held outside the task workspace. This is not a secret
// future-feature holdout. An isolated grader will supply the subject factory.
export type BookingRecord = {
  id: string;
  ownerId: string;
  resourceId: string;
  startAt: string;
  endAt: string;
  title: string;
  status: "active" | "cancelled";
  createdAt: string;
};
export type BookingSubject = {
  createBooking(viewer: string | null, input: unknown): BookingRecord;
  listBookings(viewer: string | null): BookingRecord[];
  getBooking(viewer: string | null, id: string): BookingRecord;
  cancelBooking(viewer: string | null, id: string): BookingRecord;
  listResources(): { id: string; name: string }[];
};
export type BookingSubjectFactory = (options?: {
  initialBookings?: readonly BookingRecord[];
}) => BookingSubject;
export type BaselineOracleResult = {
  id: string;
  status: "pass" | "fail";
  scope: string;
};
const slot = {
  resourceId: "room-1",
  startAt: "2026-11-10T11:00:00Z",
  endAt: "2026-11-10T12:00:00Z",
  title: "Baseline acceptance",
};
function fails(operation: () => unknown, code: string) {
  assert.throws(
    operation,
    (error) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === code,
  );
}
export async function runBaselineOracle(
  factory: BookingSubjectFactory,
): Promise<BaselineOracleResult[]> {
  const cases: {
    id: string;
    scope: string;
    run: () => void | Promise<void>;
  }[] = [
    {
      id: "B001",
      scope: "Owner-only listing and empty viewer state",
      run() {
        const subject = factory();
        assert.deepEqual(
          subject.listBookings("u-alice").map((row) => row.id),
          ["b-a1"],
        );
        assert.deepEqual(subject.listBookings("u-cara"), []);
        const copy = subject.listBookings("u-alice")[0]!;
        copy.ownerId = "u-bob";
        assert.equal(subject.getBooking("u-alice", "b-a1").ownerId, "u-alice");
      },
    },
    {
      id: "B002",
      scope: "Other-owner reads conceal existence",
      run() {
        fails(() => factory().getBooking("u-bob", "b-a1"), "NOT_FOUND");
      },
    },
    {
      id: "B003",
      scope: "Unauthorized cancellation leaves state unchanged",
      run() {
        const subject = factory();
        fails(() => subject.cancelBooking("u-bob", "b-a1"), "NOT_FOUND");
        assert.equal(subject.getBooking("u-alice", "b-a1").status, "active");
      },
    },
    {
      id: "B004",
      scope: "Creation assigns owner, identity and UTC timestamps",
      run() {
        const booking = factory().createBooking("u-cara", slot);
        assert.equal(booking.ownerId, "u-cara");
        assert.equal(booking.status, "active");
        assert.ok(booking.id);
        assert.equal(booking.startAt, "2026-11-10T11:00:00.000Z");
        assert.ok(Number.isFinite(Date.parse(booking.createdAt)));
      },
    },
    {
      id: "B005",
      scope: "Overlapping reservations reject atomically across owners",
      run() {
        const subject = factory();
        fails(
          () =>
            subject.createBooking("u-cara", {
              ...slot,
              startAt: "2026-11-10T10:30:00Z",
              endAt: "2026-11-10T11:30:00Z",
            }),
          "CONFLICT",
        );
        assert.deepEqual(subject.listBookings("u-cara"), []);
        assert.equal(subject.getBooking("u-alice", "b-a1").status, "active");
      },
    },
    {
      id: "B006",
      scope: "Cancellation frees the occupied interval",
      run() {
        const subject = factory();
        subject.cancelBooking("u-alice", "b-a1");
        assert.equal(
          subject.createBooking("u-cara", {
            ...slot,
            startAt: "2026-11-10T10:00:00Z",
            endAt: "2026-11-10T11:00:00Z",
          }).status,
          "active",
        );
      },
    },
    {
      id: "B007",
      scope: "Repeated cancellation is idempotent",
      run() {
        const subject = factory();
        assert.deepEqual(
          subject.cancelBooking("u-alice", "b-a1"),
          subject.cancelBooking("u-alice", "b-a1"),
        );
      },
    },
    {
      id: "B008",
      scope: "Missing or fabricated viewers are unauthenticated",
      run() {
        const subject = factory();
        for (const viewer of [null, "spoofed-user"]) {
          fails(() => subject.listBookings(viewer), "UNAUTHENTICATED");
          fails(() => subject.createBooking(viewer, slot), "UNAUTHENTICATED");
          fails(() => subject.getBooking(viewer, "b-a1"), "UNAUTHENTICATED");
          fails(() => subject.cancelBooking(viewer, "b-a1"), "UNAUTHENTICATED");
        }
      },
    },
    {
      id: "B009",
      scope: "Malformed inputs and client-owned authority fields reject",
      run() {
        const subject = factory();
        for (const mutation of [
          { resourceId: "missing" },
          { startAt: "invalid" },
          { endAt: slot.startAt },
          { startAt: "2026-11-10T13:00:00Z" },
          { title: " " },
          { title: "x".repeat(121) },
          { title: "control\ntext" },
          { ownerId: "u-bob" },
          { status: "cancelled" },
        ])
          fails(
            () => subject.createBooking("u-cara", { ...slot, ...mutation }),
            "INVALID_INPUT",
          );
        assert.deepEqual(subject.listBookings("u-cara"), []);
      },
    },
    {
      id: "B010",
      scope: "Listing sorts by start time and then identity, retaining status",
      run() {
        const createdAt = "2026-11-01T00:00:00Z";
        const seed: BookingRecord[] = ["z-last", "a-first"].map(
          (id, index) => ({
            ...slot,
            id,
            ownerId: "u-alice",
            resourceId: index === 0 ? "room-1" : "room-2",
            status: index === 0 ? "cancelled" : "active",
            createdAt,
          }),
        );
        const rows = factory({ initialBookings: seed }).listBookings("u-alice");
        assert.deepEqual(
          rows.map((row) => row.id),
          ["a-first", "z-last"],
        );
        assert.deepEqual(
          rows.map((row) => row.status),
          ["active", "cancelled"],
        );
      },
    },
    {
      id: "B011",
      scope: "Half-open adjacency and read-only resource catalog",
      run() {
        const subject = factory();
        assert.equal(subject.createBooking("u-alice", slot).status, "active");
        const resources = subject.listResources();
        assert.deepEqual(
          resources.map((resource) => resource.id),
          ["room-1", "room-2"],
        );
        resources.pop();
        assert.equal(subject.listResources().length, 2);
      },
    },
    {
      id: "B012",
      scope: "Concurrent conflicting creates admit exactly one booking",
      async run() {
        const subject = factory();
        const results = await Promise.allSettled(
          ["u-alice", "u-bob"].map((viewer) =>
            Promise.resolve().then(() => subject.createBooking(viewer, slot)),
          ),
        );
        assert.equal(
          results.filter((result) => result.status === "fulfilled").length,
          1,
        );
      },
    },
    {
      id: "B014",
      scope:
        "Missing identities and other-owner identities give identical failures",
      run() {
        const subject = factory();
        fails(() => subject.getBooking("u-alice", "missing"), "NOT_FOUND");
        fails(() => subject.cancelBooking("u-alice", "missing"), "NOT_FOUND");
        fails(() => subject.getBooking("u-cara", "b-a1"), "NOT_FOUND");
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
