import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Inspect every app dependency in src, including imports reached indirectly.
// This is a regression guard, not an attestation of sandbox containment.
function violations(code: string, trustedArtifactModule = false): string[] {
  const found: string[] = [];
  const source = ts.createSourceFile(
    "module.tsx",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function checkSpecifier(value: string, approvedStaticImport = false) {
    if (
      trustedArtifactModule &&
      approvedStaticImport &&
      ["node:fs", "node:fs/promises"].includes(value)
    )
      return;
    if (
      /(^|\/)(scripts|experiments|evaluator|tests|fixtures)(\/|$)/.test(
        value,
      ) ||
      value === "@forecode/booking-v1" ||
      /^(node:)?(child_process|cluster|vm|worker_threads|fs|module|net|tls|repl)(\/|$)/.test(
        value,
      )
    )
      found.push(value);
  }
  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      checkSpecifier(node.moduleSpecifier.text, ts.isImportDeclaration(node));
      if (
        trustedArtifactModule &&
        ts.isImportDeclaration(node) &&
        ["node:fs", "node:fs/promises"].includes(node.moduleSpecifier.text)
      ) {
        const allowed =
          node.moduleSpecifier.text === "node:fs"
            ? ["constants"]
            : ["lstat", "open", "realpath"];
        const bindings = node.importClause?.namedBindings;
        if (
          !bindings ||
          !ts.isNamedImports(bindings) ||
          bindings.elements.some(
            (item) => !allowed.includes((item.propertyName ?? item.name).text),
          )
        )
          found.push("unreviewed filesystem capability");
      }
    }
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(source);
      if (
        ["eval", "Function", "require", "process.getBuiltinModule"].includes(
          expression,
        )
      )
        found.push(expression);
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteral(argument))
          checkSpecifier(argument.text);
        else found.push("dynamic import target");
      }
    }
    if (
      ts.isNewExpression(node) &&
      node.expression.getText(source) === "Function"
    )
      found.push("new Function");
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(full)
      : /\.tsx?$/.test(entry.name)
        ? [full]
        : [];
  });
}

describe("web execution boundary", () => {
  it("does not import execution, evaluator or host-filesystem capabilities anywhere in src", () => {
    const findings = [
      ...sourceFiles(path.resolve("src")),
      ...sourceFiles(path.resolve("fixtures/booking-v1/src")),
    ].flatMap((file) =>
      violations(
        readFileSync(file, "utf8"),
        file === path.resolve("src/server/artifacts/evaluation-store.ts"),
      ).map((problem) => `${file}: ${problem}`),
    );
    expect(findings).toEqual([]);
  });
  it("keeps the trusted loader exception restricted to reviewed read primitives", () => {
    expect(violations('export * from "node:fs";', true)).not.toEqual([]);
    expect(
      violations('const fs = import("node:fs/promises");', true),
    ).not.toEqual([]);
    expect(
      violations('import { writeFile } from "node:fs/promises";', true),
    ).toContain("unreviewed filesystem capability");
    expect(violations('import * as fs from "node:fs";', true)).toContain(
      "unreviewed filesystem capability",
    );
    expect(
      violations('import { open, realpath } from "node:fs/promises";', true),
    ).toEqual([]);
    expect(violations('import { open } from "node:fs/promises";')).not.toEqual(
      [],
    );
  });
  it.each([
    'import "../../tests/helper";',
    'import "@forecode/booking-v1";',
    'import { exec } from "node:child_process";',
    'export { run } from "../../scripts/experiments/run";',
    'const runner = import("@/experiments/run");',
    "const runner = import(userInput);",
    'const runner = require("child_process");',
    "eval(userInput);",
    "new Function(userInput);",
    'process.getBuiltinModule("child_process");',
  ])("detects forbidden execution paths in regression examples", (example) => {
    expect(violations(example).length).toBeGreaterThan(0);
  });
});
