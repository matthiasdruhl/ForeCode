import { describe, expect, it } from "vitest";
import { collectBoundaryMetrics } from "../../scripts/experiments/tournament/boundary-metrics";
const rules = [
  {
    id: "http-store",
    from: "src/server/http.ts",
    to: "src/server/booking-store.ts",
  },
];
const collect = (code: string, extra: Record<string, string> = {}) =>
  collectBoundaryMetrics(
    {
      "src/server/http.ts": code,
      "src/server/booking-store.ts": "export const store=1;",
      ...extra,
    },
    { boundaryRules: rules, externalPackages: [] },
  );
describe("prospective static observation collector", () => {
  it("collects import, type and reexport dependencies without executing code", () => {
    const o = collect(
      'import {store} from "./booking-store";import type {X} from "@/server/booking-store";export * from "./booking-store.js";type T = import("./booking-store").T;throw new Error("MUST NOT EXECUTE");',
    );
    expect(o.unresolvedImports).toBe(0);
    expect(o.edges).toHaveLength(4);
    expect(o.edges.every((e) => e.to === rules[0]!.to)).toBe(true);
  });
  it.each([
    'import("./booking-store")',
    'require("./booking-store")',
    'import {x} from "./missing"',
    'import x from "unapproved"',
    "const = invalid",
  ])("marks unmeasurable syntax/edges %s", (code) => {
    expect(collect(code).unresolvedImports).toBeGreaterThan(0);
  });
  it("rejects ambiguous resolution and incomplete inventory instead of zero violations", () => {
    expect(
      collect('import "./booking-store"', {
        "src/server/booking-store.tsx": "",
      }).unresolvedImports,
    ).toBe(1);
    expect(() =>
      collectBoundaryMetrics(
        {},
        { boundaryRules: rules, externalPackages: [] },
      ),
    ).toThrow();
    expect(() =>
      collectBoundaryMetrics(
        { "../secret.ts": "" },
        { boundaryRules: rules, externalPackages: [] },
      ),
    ).toThrow();
  });
  it("ignores only explicitly frozen external packages", () => {
    expect(
      collectBoundaryMetrics(
        { "src/a.ts": 'import React from "react";' },
        { boundaryRules: rules, externalPackages: ["react"] },
      ).unresolvedImports,
    ).toBe(0);
  });
});
