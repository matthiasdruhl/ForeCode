import { describe, expect, it } from "vitest";
import { bookingGraph } from "@/lib/foresight/booking-context";
import { tracedSource } from "@/components/change-trace";

describe("Change Trace source contract", () => {
  it("presents only the four reviewed modules and three verified static imports", () => {
    expect(tracedSource.map((item) => item.path)).toEqual([
      "src/app/api/bookings/route.ts",
      "src/server/runtime.ts",
      "src/server/booking-service.ts",
      "src/server/booking-store.ts",
    ]);
    const ids = tracedSource.map((item) => item.id);
    for (const id of ids) {
      expect(bookingGraph.modules.some((module) => module.id === id)).toBe(true);
    }
    for (let index = 0; index < ids.length - 1; index++) {
      expect(
        bookingGraph.edges.some(
          (edge) =>
            edge.from === ids[index] &&
            edge.to === ids[index + 1] &&
            edge.kind === "static_import",
        ),
      ).toBe(true);
    }
    expect(bookingGraph.unknowns.length).toBeGreaterThan(0);
  });
});
