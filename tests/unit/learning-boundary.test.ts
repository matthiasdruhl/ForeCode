import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(path.join(root, e.name))
      : e.name.endsWith(".ts")
        ? [path.join(root, e.name)]
        : [],
  );
}
describe("learning sidecar capability boundary", () => {
  it("imports only reviewed trust adapters, local policy/data modules and non-executing builtins", () => {
    const imports: string[] = [],
      violations: string[] = [];
    for (const file of [
      ...files("scripts/learning"),
      ...files("src/lib/learning"),
    ]) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      function specifier(value: string) {
        imports.push(value);
        if (
          /(^|\/)(evaluator|runner|agent|meta)(\/|$)/.test(value) ||
          /^(node:)?(http|https|net|tls|child_process|vm|worker_threads|module)$/.test(
            value,
          )
        )
          violations.push(file + ":" + value);
        if (
          value.includes("experiments/") &&
          ![
            "../experiments/tournament/custody",
            "../experiments/artifacts/files",
          ].includes(value)
        )
          violations.push(value);
        if (
          value.includes("server/") &&
          value !== "../../src/server/artifacts/evaluation-store"
        )
          violations.push(value);
      }
      function visit(n: ts.Node) {
        if (
          (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
          n.moduleSpecifier &&
          ts.isStringLiteral(n.moduleSpecifier)
        )
          specifier(n.moduleSpecifier.text);
        if (ts.isCallExpression(n)) {
          const expression = n.expression.getText(source);
          if (
            [
              "fetch",
              "eval",
              "Function",
              "require",
              "process.getBuiltinModule",
            ].includes(expression)
          )
            violations.push(expression);
          if (n.expression.kind === ts.SyntaxKind.ImportKeyword) {
            const target = n.arguments[0];
            if (target && ts.isStringLiteral(target)) specifier(target.text);
            else violations.push("dynamic import");
          }
        }
        ts.forEachChild(n, visit);
      }
      visit(source);
    }
    expect(imports).toContain("../../src/server/artifacts/evaluation-store");
    expect(imports).toContain("../experiments/tournament/custody");
    expect(violations).toEqual([]);
  });
  it("adds no hosted training route and keeps offline code unreachable from src", () => {
    const sourceFiles = files("src");
    expect(
      sourceFiles.filter((f) => /app\/api\/.*(train|learning|execute)/.test(f)),
    ).toEqual([]);
    expect(
      sourceFiles.filter((f) =>
        /["'][^"']*scripts\/learning/.test(readFileSync(f, "utf8")),
      ),
    ).toEqual([]);
  });
});
