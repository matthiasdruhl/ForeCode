import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Inspect every app dependency in src, including imports reached indirectly.
// This is a regression guard, not an attestation of sandbox containment.
function violations(code: string): string[] {
  const found: string[] = [];
  const source = ts.createSourceFile(
    "module.tsx",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function checkSpecifier(value: string) {
    if (
      /(^|\/)(scripts|experiments|evaluator)(\/|$)/.test(value) ||
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
    )
      checkSpecifier(node.moduleSpecifier.text);
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
    const findings = sourceFiles(path.resolve("src")).flatMap((file) =>
      violations(readFileSync(file, "utf8")).map(
        (problem) => `${file}: ${problem}`,
      ),
    );
    expect(findings).toEqual([]);
  });
  it.each([
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
