import { describe, expect, it } from "vitest";
import {
  classifyProjectPath,
  MAX_PROJECT_FILE_BYTES,
  MAX_PROJECT_FILES,
  MAX_PROJECT_TOTAL_BYTES,
  parseLocalProject,
  type ProjectFile,
} from "@/lib/projects/local-project";

const file = (path: string, source = "export {};"): ProjectFile => ({
  path,
  source,
});

describe("local project path classification before reads", () => {
  it.each([
    ".env",
    ".env.local",
    ".env.example",
    ".envrc",
    "nested/.env.production",
    ".git/config",
    "nested/.git/hooks/pre-commit.ts",
    "node_modules/pkg/index.ts",
    "nested/node_modules/lib.ts",
    "vendor/library.ts",
    "dist/app.js",
    ".next/server/app.js",
    "build/generated.ts",
    "coverage/report.js",
    ".aws/config",
    ".ssh/id_rsa",
    "src/credentials.ts",
    "src/secret.json",
    "src/private-key.ts",
    "service-account.json",
    "src/token.ts",
    "key.pem",
    ".npmrc",
    "../outside.ts",
    "src/../../outside.ts",
    "/absolute.ts",
    "C:\\Users\\person\\file.ts",
    "src//index.ts",
    "src/./index.ts",
    "src/evil\u0000.ts",
    "image.png",
    "package-lock.json",
    "package.json",
    "README.md",
    "styles.css",
    "data.json",
    "src/file.ts/",
  ])("excludes %s", (path) => {
    expect(classifyProjectPath(path)).toMatchObject({
      included: false,
      reason: expect.any(String),
    });
  });

  it.each([
    "src/app.ts",
    "src/app.tsx",
    "src/app.js",
    "src/app.jsx",
    "src/app.mts",
    "src/app.cts",
    "src/app.mjs",
    "src/app.cjs",
    "types/index.d.ts",
    "tsconfig.json",
    "tsconfig.app.json",
    "nested/jsconfig.json",
    "src\\app.ts",
  ])("includes %s", (path) =>
    expect(classifyProjectPath(path)).toEqual({ included: true }),
  );

  it("never accesses excluded source and normalizes accepted Windows separators", () => {
    const forbidden: ProjectFile = {
      path: "node_modules/lib.ts",
      get source(): string {
        throw new Error("Excluded contents must never be read");
      },
    };
    const result = parseLocalProject("  Example  ", [
      forbidden,
      file("src\\app.ts"),
    ]);
    expect(result.name).toBe("Example");
    expect(result.files).toEqual([file("src/app.ts")]);
    expect(result.issues).toHaveLength(1);
  });
});

describe("inert AST dependency extraction", () => {
  it("recognizes static imports, side effects, reexports and type imports without comment/string false positives", () => {
    const result = parseLocalProject("AST", [
      file(
        "src/main.ts",
        `
        // import "./imaginary-comment";
        /* export * from "./imaginary-block"; */
        const text = 'import "./imaginary-string"';
        const template = \`export * from "./imaginary-template"\`;
        import { value } from "./value";
        import type { Shape } from "./shape";
        import "./effects";
        export { value } from "./value";
        export type { Shape } from "./shape";
        export * from "./other";
        type Lazy = import("./lazy").Value;
        import legacy = require("./legacy");
      `,
      ),
      ...["value", "shape", "effects", "other", "lazy", "legacy"].map((name) =>
        file(`src/${name}.ts`),
      ),
    ]);
    expect(result.edges.map((edge) => edge.to).sort()).toEqual(
      ["effects", "lazy", "legacy", "other", "shape", "value"]
        .map((name) => `src/${name}.ts`)
        .sort(),
    );
    expect(result.issues).toEqual([]);
    expect(result.edges).toHaveLength(6);
  });

  it("does not execute imported source or configuration", () => {
    const result = parseLocalProject("Inert", [
      file(
        "main.ts",
        'throw new Error("executed"); globalThis.__projectExecuted = true; import "./dep";',
      ),
      file("dep.ts", "while (true) {}"),
      file(
        "tsconfig.json",
        '{"compilerOptions":{"plugins":[{"name":"malicious-plugin"}]}}',
      ),
    ]);
    expect(result.edges).toEqual([
      { from: "main.ts", to: "dep.ts", specifier: "./dep" },
    ]);
    expect(
      (globalThis as Record<string, unknown>).__projectExecuted,
    ).toBeUndefined();
  });

  it("resolves directory indexes, explicit JS extensions to TS, JSX and module extensions", () => {
    const result = parseLocalProject("Extensions", [
      file(
        "src/main.tsx",
        'import "./dir"; import "./value.js"; import "./module.mjs"; import "./common.cjs"; import "./view";',
      ),
      file("src/dir/index.ts"),
      file("src/value.ts"),
      file("src/value.js"),
      file("src/module.mts"),
      file("src/common.cts"),
      file("src/view.jsx", "export const view = <main/>;"),
    ]);
    expect(result.edges.map((edge) => edge.to).sort()).toEqual(
      [
        "src/dir/index.ts",
        "src/value.ts",
        "src/module.mts",
        "src/common.cts",
        "src/view.jsx",
      ].sort(),
    );
    expect(result.issues).toEqual([]);
  });

  it("reports unresolved, external, dynamic, CommonJS and triple-slash coverage", () => {
    const result = parseLocalProject("Coverage", [
      file(
        "main.ts",
        `
        /// <reference path="./types.d.ts" />
        import "./missing";
        import "react";
        import "./styles.css";
        import "./.env.local";
        import(variable);
        import("./lazy");
        import(\`./lazy\`);
        require("./common");
      `,
      ),
      file("lazy.ts"),
      file("common.ts"),
      file("styles.css", "body {}"),
    ]);
    expect(result.edges).toEqual([
      { from: "main.ts", to: "lazy.ts", specifier: "./lazy" },
    ]);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          specifier: "./missing",
          message: expect.stringContaining("Unresolved local"),
        }),
        expect.objectContaining({
          specifier: "react",
          message: expect.stringContaining("External package"),
          kind: "external",
        }),
        expect.objectContaining({
          specifier: "./styles.css",
          message: expect.stringContaining("Unresolved local"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("Dynamic import expression"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("Literal dynamic import"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("CommonJS"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("Triple-slash"),
        }),
      ]),
    );
    expect(result.coverage.join(" ")).toContain("Partial static");
  });

  it("reports syntax recovery and survives deeply nested invalid input", () => {
    const result = parseLocalProject("Malformed", [
      file("bad.ts", "const = ; import './dep';"),
      file("deep.ts", "(".repeat(15_000)),
      file("dep.ts"),
    ]);
    expect(
      result.issues.some(
        (issue) =>
          issue.path === "bad.ts" && issue.message.includes("syntax errors"),
      ),
    ).toBe(true);
    expect(result.issues.some((issue) => issue.path === "deep.ts")).toBe(true);
  });
});

describe("local tsconfig aliases", () => {
  it("handles JSONC, wildcards, exact aliases, fallback targets and baseUrl", () => {
    const result = parseLocalProject("Aliases", [
      file(
        "tsconfig.json",
        `{
        // JSONC is supported without execution.
        "compilerOptions": { "baseUrl": ".", "paths": {
          "@/*": ["missing/*", "src/*"], "@/special/*": ["special/*"],
          "@/exact": ["exact.ts"],
        }, },
      }`,
      ),
      file(
        "src/main.ts",
        'import "@/value"; import "@/exact"; import "@/special/value"; import "src/direct";',
      ),
      file("src/value.ts"),
      file("exact.ts"),
      file("special/value.ts"),
      file("src/direct.ts"),
    ]);
    expect(result.edges.map((edge) => edge.to).sort()).toEqual(
      ["src/value.ts", "exact.ts", "special/value.ts", "src/direct.ts"].sort(),
    );
    expect(result.issues).toEqual([]);
  });

  it("resolves aliases without baseUrl and selects the nearest nested config", () => {
    const result = parseLocalProject("Nested", [
      file(
        "repo/tsconfig.json",
        '{"compilerOptions":{"paths":{"@/*":["src/*"]}}}',
      ),
      file("repo/src/main.ts", 'import "@/value";'),
      file("repo/src/value.ts"),
      file(
        "repo/packages/app/jsconfig.json",
        '{"compilerOptions":{"baseUrl":"src","paths":{"@/*":["*"]}}}',
      ),
      file("repo/packages/app/src/main.js", 'import "@/value";'),
      file("repo/packages/app/src/value.js"),
    ]);
    expect(result.edges).toEqual(
      expect.arrayContaining([
        {
          from: "repo/src/main.ts",
          to: "repo/src/value.ts",
          specifier: "@/value",
        },
        {
          from: "repo/packages/app/src/main.js",
          to: "repo/packages/app/src/value.js",
          specifier: "@/value",
        },
      ]),
    );
    expect(result.issues).toEqual([]);
  });

  it.each([
    ['{"compilerOptions":', "Malformed"],
    ["null", "Malformed"],
    ['{"compilerOptions":4}', "compilerOptions"],
    ['{"compilerOptions":{"baseUrl":4}}', "baseUrl"],
    ['{"compilerOptions":{"baseUrl":"../.."}}', "escapes"],
    ['{"compilerOptions":{"paths":[]}}', "paths"],
    ['{"compilerOptions":{"paths":{"@/*":4}}}', "malformed"],
    ['{"extends":"./base.json","references":[]}', "extends/references"],
  ])("reports unsupported/malformed config %s", (source, expected) => {
    const result = parseLocalProject("Invalid config", [
      file("tsconfig.json", source),
      file("main.ts", 'import "@/value";'),
      file("value.ts"),
    ]);
    expect(
      result.issues.some(
        (issue) =>
          issue.path === "tsconfig.json" && issue.message.includes(expected),
      ),
    ).toBe(true);
    expect(result.edges).toEqual([]);
  });

  it("does not traverse outside supplied root or guess inherited/named config aliases", () => {
    const result = parseLocalProject("Boundary", [
      file(
        "tsconfig.json",
        '{"extends":"./tsconfig.base.json","compilerOptions":{"paths":{"escape":["../outside"]}}}',
      ),
      file(
        "tsconfig.base.json",
        '{"compilerOptions":{"paths":{"hidden":["outside.ts"]}}}',
      ),
      file(
        "main.ts",
        'import "../../outside"; import "escape"; import "hidden";',
      ),
      file("outside.ts"),
    ]);
    expect(result.edges).toEqual([]);
    expect(
      result.issues.some((issue) => issue.message.includes("Named config")),
    ).toBe(true);
  });

  it("prefers tsconfig over jsconfig in the same directory regardless of input order", () => {
    const result = parseLocalProject("Config precedence", [
      file("jsconfig.json", '{"compilerOptions":{"paths":{"@/*":["js/*"]}}}'),
      file("tsconfig.json", '{"compilerOptions":{"paths":{"@/*":["ts/*"]}}}'),
      file("main.ts", 'import "@/value";'),
      file("ts/value.ts"),
      file("js/value.ts"),
    ]);
    expect(result.edges).toEqual([
      { from: "main.ts", to: "ts/value.ts", specifier: "@/value" },
    ]);
  });

  it("does not silently apply parent aliases through a malformed nearest config", () => {
    const result = parseLocalProject("Config boundary", [
      file("tsconfig.json", '{"compilerOptions":{"paths":{"@/*":["src/*"]}}}'),
      file("nested/tsconfig.json", '{"compilerOptions":'),
      file("nested/main.ts", 'import "@/value";'),
      file("src/value.ts"),
    ]);
    expect(result.edges).toEqual([]);
    expect(
      result.issues.some((issue) => issue.path === "nested/tsconfig.json"),
    ).toBe(true);
  });
});

describe("bounded project parsing", () => {
  it("enforces UTF-8 byte limits, rejects binary text and keeps first duplicate", () => {
    const result = parseLocalProject("Limits", [
      file("large.ts", "é".repeat(MAX_PROJECT_FILE_BYTES / 2 + 1)),
      file("binary.ts", "hello\0world"),
      file("same.ts", "export const first = 1;"),
      file("same.ts", "throw 1;"),
    ]);
    expect(result.files).toEqual([file("same.ts", "export const first = 1;")]);
    expect(result.issues).toHaveLength(3);
  });

  it("does not access sources after file count limit", () => {
    const overLimit: ProjectFile = {
      path: "unread.ts",
      get source(): string {
        throw new Error("Do not read overflow");
      },
    };
    const result = parseLocalProject("Count", [
      ...Array.from({ length: MAX_PROJECT_FILES }, (_, index) =>
        file(`file${index}.ts`),
      ),
      overLimit,
    ]);
    expect(result.files).toHaveLength(MAX_PROJECT_FILES);
    expect(result.issues.at(-1)?.message).toContain("count limit");
  });

  it("enforces total byte limit before retaining additional source", () => {
    const source = `//${"x".repeat(MAX_PROJECT_FILE_BYTES - 2)}`;
    const result = parseLocalProject(
      "Total",
      Array.from(
        { length: MAX_PROJECT_TOTAL_BYTES / MAX_PROJECT_FILE_BYTES + 1 },
        (_, index) => file(`${index}.ts`, source),
      ),
    );
    expect(result.files).toHaveLength(
      MAX_PROJECT_TOTAL_BYTES / MAX_PROJECT_FILE_BYTES,
    );
    expect(result.issues.at(-1)?.message).toContain("total project size");
  });
});

describe("honest dependency categories and configuration coverage", () => {
  it("does not turn retained configuration JSON into a source module edge", () => {
    const result = parseLocalProject("Config import", [
      file("main.ts", 'import config from "./tsconfig.json";'),
      file("tsconfig.json", "{}"),
    ]);
    expect(result.edges).toEqual([]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        specifier: "./tsconfig.json",
        kind: "unresolved",
      }),
    );
  });
  it("keeps only established project edges and distinguishes package references from unresolved paths", () => {
    const result = parseLocalProject("References", [
      file(
        "main.ts",
        'import "react"; import "@scope/pkg"; import "node:fs"; import "@/missing"; import "#internal"; import "/absolute"; import "./missing"; import "./value";',
      ),
      file("value.ts"),
    ]);
    expect(result.edges).toEqual([
      { from: "main.ts", to: "value.ts", specifier: "./value" },
    ]);
    expect(
      result.issues
        .filter((issue) => issue.kind === "external")
        .map((issue) => issue.specifier)
        .sort(),
    ).toEqual(["@scope/pkg", "node:fs", "react"]);
    expect(
      result.issues
        .filter((issue) => issue.kind === "unresolved")
        .map((issue) => issue.specifier)
        .sort(),
    ).toEqual(["#internal", "./missing", "/absolute", "@/missing"]);
    expect(
      result.issues.find((issue) => issue.specifier === "react")?.message,
    ).toContain("availability is not verified");
  });

  it.each([
    { moduleSuffixes: [".native", ""] },
    { rootDirs: ["src", "generated"] },
    { noResolve: true },
  ])(
    "does not guess edges under unsupported resolution options %j",
    (compilerOptions) => {
      const result = parseLocalProject("Unsupported resolution", [
        file("tsconfig.json", JSON.stringify({ compilerOptions })),
        file("main.ts", 'import "./value";'),
        file("value.ts"),
      ]);
      expect(result.edges).toEqual([]);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "tsconfig.json",
            kind: "limitation",
            message: expect.stringContaining("Unsupported resolution options"),
          }),
          expect.objectContaining({
            path: "main.ts",
            specifier: "./value",
            kind: "unresolved",
          }),
        ]),
      );
    },
  );

  it("produces stable files, edges and diagnostics regardless of selection order within limits", () => {
    const inputs = [
      file("z.ts", 'import "./a"; import "./missing";'),
      file("a.ts"),
      file("tsconfig.json", "{}"),
    ];
    expect(parseLocalProject("Stable", inputs)).toEqual(
      parseLocalProject("Stable", [...inputs].reverse()),
    );
  });
});
