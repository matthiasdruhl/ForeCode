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
  it.each(["[id]", "[...slug]", "[[...slug]]"])(
    "resolves exact Next path %s and unique index/.js references",
    (segment) => {
      const from = `src/app/${segment}/route.ts`,
        to = "src/server/store/index.tsx";
      const result = collectBoundaryMetrics(
        {
          [from]:
            'import type {T} from "@/server/store/index.js"; export * from "../../server/store";',
          [to]: "",
        },
        {
          boundaryRules: [{ id: "dynamic-store", from, to }],
          externalPackages: [],
          stylesheetPaths: [],
        },
      );
      expect(result.edges[0]).toEqual({ from, to });
      expect(result.edges).toEqual([
        { from, to },
        { from, to },
      ]);
      expect(result.unresolvedImports).toBe(0);
    },
  );
  it("resolves a unique index module and rejects module/index ambiguity", () => {
    const from = "src/server/http.ts",
      to = "src/server/store/index.ts";
    const policy = {
      boundaryRules: [{ id: "index", from, to }],
      externalPackages: [],
      stylesheetPaths: [],
    };
    const files = { [from]: 'export * from "./store";', [to]: "" };
    expect(collectBoundaryMetrics(files, policy)).toMatchObject({
      unresolvedImports: 0,
      edges: [{ from, to }],
    });
    expect(
      collectBoundaryMetrics({ ...files, "src/server/store.ts": "" }, policy)
        .unresolvedImports,
    ).toBe(1);
  });
  it.each([
    'import "./image.svg";',
    'import "./booking-store?raw";',
    'import "raw-loader!./booking-store";',
    'import data from "./booking-store" with { type: "json" };',
    'import x = require("./booking-store");',
    'export * from "./missing.css";',
  ])("abstains for unsupported asset/loader %s", (code) => {
    expect(collect(code).unresolvedImports).toBeGreaterThan(0);
  });
  it("bounds files, bytes, total inventory and output edges", () => {
    expect(() => collect(" ".repeat(262145))).toThrow();
    expect(() =>
      collect(
        "",
        Object.fromEntries(
          Array.from({ length: 1001 }, (_, i) => [`src/a${i}.ts`, ""]),
        ),
      ),
    ).toThrow();
    expect(() =>
      collect(
        "",
        Object.fromEntries(
          Array.from({ length: 20 }, (_, i) => [
            `src/a${i}.ts`,
            " ".repeat(220000),
          ]),
        ),
      ),
    ).toThrow();
    expect(collect('import "./booking-store";'.repeat(10001))).toMatchObject({
      complete: false,
      unresolvedImports: 1,
      edges: [],
    });
  });
  it("rejects duplicate direct-helper rules and packages", () => {
    const files = {
      "src/server/http.ts": "",
      "src/server/booking-store.ts": "",
    };
    const p = {
      boundaryRules: [...rules, { ...rules[0]!, to: "src/other.ts" }],
      externalPackages: [],
      stylesheetPaths: [],
    };
    expect(() => collectBoundaryMetrics(files, p)).toThrow("Duplicate");
    expect(() =>
      collectBoundaryMetrics(files, {
        ...p,
        boundaryRules: rules,
        externalPackages: ["react", "react"],
      }),
    ).toThrow("Duplicate");
  });
  it("parses the reviewed fixture TS/CSS view; full sealed inventory is tested separately", () => {
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
