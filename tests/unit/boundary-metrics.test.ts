import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
    { boundaryRules: rules, externalPackages: [], stylesheetPaths: [] },
  );
describe("prospective static observation collector", () => {
  it("accepts the complete reviewed booking fixture, including its dynamic route and stylesheet", () => {
    const root = "fixtures/booking-v1";
    function inventory(directory: string): [string, string][] {
      return readdirSync(join(root, directory), {
        withFileTypes: true,
      }).flatMap((entry) => {
        const path = `${directory}/${entry.name}`;
        return entry.isDirectory()
          ? inventory(path)
          : /\.(?:tsx?|css)$/.test(entry.name)
            ? [[path, readFileSync(join(root, path), "utf8")]]
            : [];
      });
    }
    const files = Object.fromEntries(inventory("src"));
    const route = "src/app/api/bookings/[id]/route.ts";
    expect(Object.hasOwn(files, route)).toBe(true);
    const result = collectBoundaryMetrics(files, {
      boundaryRules: [
        { id: "route-runtime", from: route, to: "src/server/runtime.ts" },
      ],
      externalPackages: ["react", "next", "server-only", "zod", "node:crypto"],
      stylesheetPaths: ["src/app/style.css"],
    });
    expect(result.complete).toBe(true);
    expect(result.unresolvedImports).toBe(0);
    expect(result.edges).toContainEqual({
      from: route,
      to: "src/server/runtime.ts",
    });
  });
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
    'module.require("./booking-store")',
    'module["require"]("./booking-store")',
    'globalThis["require"]("./booking-store")',
    'globalThis[`require`]("./booking-store")',
    'const load = require; load("./booking-store")',
    'import {createRequire as factory} from "node:module"; factory(import.meta.url)("./booking-store")',
    '/// <reference path="./booking-store.ts" />',
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
        { boundaryRules: rules, externalPackages: [], stylesheetPaths: [] },
      ),
    ).toThrow();
    expect(() =>
      collectBoundaryMetrics(
        { "../secret.ts": "" },
        { boundaryRules: rules, externalPackages: [], stylesheetPaths: [] },
      ),
    ).toThrow();
  });
  it("ignores only explicitly frozen external packages", () => {
    expect(
      collectBoundaryMetrics(
        { "src/a.ts": 'import React from "react";' },
        {
          boundaryRules: rules,
          externalPackages: ["react"],
          stylesheetPaths: [],
        },
      ).unresolvedImports,
    ).toBe(0);
  });
  it("excludes only present, predeclared side-effect CSS imports from source edges", () => {
    const policy = {
      boundaryRules: rules,
      externalPackages: [],
      stylesheetPaths: ["src/app/style.css"],
    };
    const files = {
      "src/server/http.ts": 'import "@/app/style.css";',
      "src/server/booking-store.ts": "",
      "src/app/style.css": "body { color: black; }",
    };
    expect(collectBoundaryMetrics(files, policy)).toMatchObject({
      complete: true,
      unresolvedImports: 0,
      edges: [],
    });
    const { "src/app/style.css": css, ...missingAsset } = files;
    expect(css).toContain("body");
    expect(collectBoundaryMetrics(missingAsset, policy)).toMatchObject({
      complete: false,
      unresolvedImports: 1,
    });
    expect(
      collectBoundaryMetrics(missingAsset, { ...policy, stylesheetPaths: [] })
        .unresolvedImports,
    ).toBe(1);
    for (const source of [
      'import styles from "@/app/style.css";',
      'export * from "@/app/style.css";',
    ])
      expect(
        collectBoundaryMetrics(
          { ...files, "src/server/http.ts": source },
          policy,
        ).unresolvedImports,
      ).toBe(1);
    expect(() =>
      collectBoundaryMetrics(files, { ...policy, stylesheetPaths: [] }),
    ).toThrow("Invalid source inventory");
    expect(() =>
      collectBoundaryMetrics(files, {
        ...policy,
        stylesheetPaths: ["src/app/style.css", "src/app/style.css"],
      }),
    ).toThrow("Invalid stylesheet policy");
    expect(() =>
      collectBoundaryMetrics(files, {
        ...policy,
        stylesheetPaths: ["src/server/http.ts"],
      }),
    ).toThrow("Invalid stylesheet policy");
  });
});
