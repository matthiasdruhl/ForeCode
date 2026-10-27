import { GraphV1Schema } from "../contracts/architecture";

// Manually reviewed against this actual ForeCode Git object. Fixture-relative
// paths describe the standalone booking package, never a host path or importer.
export const BOOKING_REVIEW_COMMIT = "a564da2fe36a5de3ea95f777c1f5a60fd80ad6f0";
export const bookingSummary =
  "Standalone booking-v1: routes delegate to a shared runtime and HTTP adapter; booking-service checks a fixed demo viewer and owner-only access, validates creation and delegates synchronous writes to an in-memory BookingStore. The store rejects active room/time overlaps and cancels bookings. Domain data defines two rooms and synthetic initial bookings. No team membership, delegated permissions, durable storage or production authentication exists.";
export const bookingGraph = GraphV1Schema.parse({
  schemaVersion: "graph.v1",
  id: "booking-reviewed-20261027",
  repoCommit: BOOKING_REVIEW_COMMIT,
  modules: [
    { id: "booking", path: "src/domain/booking.ts", kind: "source" },
    { id: "errors", path: "src/domain/errors.ts", kind: "source" },
    { id: "store", path: "src/server/booking-store.ts", kind: "source" },
    { id: "service", path: "src/server/booking-service.ts", kind: "source" },
    { id: "http", path: "src/server/http.ts", kind: "source" },
    { id: "runtime", path: "src/server/runtime.ts", kind: "source" },
    { id: "collection", path: "src/app/api/bookings/route.ts", kind: "route" },
    { id: "resources", path: "src/app/api/resources/route.ts", kind: "route" },
    { id: "session", path: "src/app/api/session/route.ts", kind: "route" },
  ],
  edges: [
    ["store", "booking"],
    ["store", "errors"],
    ["service", "booking"],
    ["service", "errors"],
    ["service", "store"],
    ["http", "errors"],
    ["http", "service"],
    ["runtime", "service"],
    ["runtime", "http"],
    ["collection", "runtime"],
    ["resources", "runtime"],
    ["session", "runtime"],
    ["session", "http"],
  ].map(([from, to]) => ({ from, to, kind: "static_import" })),
  unknowns: [
    bookingSummary,
    "Partial manual static-import review only; includes type imports. External packages, UI, configuration and tests are omitted. No runtime graph completeness claim.",
    "The dynamic booking detail route exists but its bracketed path cannot be represented by the frozen v1 path grammar; omitted, not renamed. Its runtime behavior is outside this graph.",
    "Only these existing reviewed paths may be proposed in this slice. New file paths require a separately reviewed context. No repository scanning or execution occurs.",
    "No private evaluator diagnostics, heldout cases or Workstream A reports are included. Proposed visible scenarios are model-generated, never heldout or measured evidence.",
  ],
});
