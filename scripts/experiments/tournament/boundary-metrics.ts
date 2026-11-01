// Static parsing only. Never import/execute a candidate or read host files.
// A protected evaluator must supply the complete sealed src inventory and bind
// the result to its source manifest. This output has no authenticity by itself.
import ts from "typescript";
import { posix } from "node:path";
import { invariant } from "../../../src/lib/contracts/validation";
import type { MetricProtocol } from "../../../src/lib/experiment/prospective-metrics";
const sourcePath = /^src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:ts|tsx)$/;
export function collectBoundaryMetrics(
  files: Readonly<Record<string, string>>,
  protocol: Pick<MetricProtocol, "boundaryRules" | "externalPackages">,
) {
  const { boundaryRules: rules, externalPackages } = protocol;
  invariant(
    externalPackages.every((p) =>
      /^(?:[a-z][a-z0-9-]*|@[a-z0-9-]+\/[a-z0-9-]+|node:[a-z_]+)$/.test(p),
    ),
    "Unsupported external package",
  );
  const entries = Object.entries(files);
  invariant(
    entries.length > 0 &&
      entries.length <= 1000 &&
      entries.every(
        ([p, s]) => sourcePath.test(p) && Buffer.byteLength(s) <= 262144,
      ),
    "Invalid source inventory",
  );
  invariant(
    entries.reduce((n, [, s]) => n + Buffer.byteLength(s), 0) <= 4_194_304,
    "Source bound",
  );
  const edges: { from: string; to: string }[] = [];
  let unresolvedImports = 0;
  function dependency(from: string, value: string) {
    const packageName = value.startsWith("@")
      ? value.split("/").slice(0, 2).join("/")
      : value.split("/")[0]!;
    if (externalPackages.includes(packageName)) return;
    let base: string;
    if (value.startsWith("./") || value.startsWith("../"))
      base = posix.normalize(posix.join(posix.dirname(from), value));
    else if (value.startsWith("@/")) base = "src/" + value.slice(2);
    else {
      unresolvedImports++;
      return;
    }
    if (base.endsWith(".js")) base = base.slice(0, -3);
    const targets = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}/index.ts`,
      `${base}/index.tsx`,
    ].filter((p) => Object.hasOwn(files, p));
    const unique = [...new Set(targets)];
    if (unique.length !== 1) {
      unresolvedImports++;
      return;
    }
    edges.push({ from, to: unique[0]! });
  }
  for (const [file, text] of entries) {
    const ast = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    // Public parser diagnostics do not execute source. Any parse failure makes
    // measurement unknown rather than counting only the parseable fragments.
    const diagnostics = (
      ast as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }
    ).parseDiagnostics;
    unresolvedImports += diagnostics.length;
    function visit(n: ts.Node) {
      if (
        (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
        n.moduleSpecifier
      ) {
        if (ts.isStringLiteral(n.moduleSpecifier))
          dependency(file, n.moduleSpecifier.text);
        else unresolvedImports++;
      }
      if (ts.isImportTypeNode(n)) {
        if (
          ts.isLiteralTypeNode(n.argument) &&
          ts.isStringLiteral(n.argument.literal)
        )
          dependency(file, n.argument.literal.text);
        else unresolvedImports++;
      }
      if (ts.isImportEqualsDeclaration(n)) unresolvedImports++;
      if (
        ts.isCallExpression(n) &&
        (n.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(n.expression) && n.expression.text === "require"))
      )
        unresolvedImports++;
      ts.forEachChild(n, visit);
    }
    visit(ast);
  }
  // Count a forbidden edge once, including type imports and reexports. Empty
  // imports do not create edges. Dynamic/CommonJS syntax makes coverage unknown.
  return {
    complete: rules.every(
      (r) => Object.hasOwn(files, r.from) && Object.hasOwn(files, r.to),
    ),
    unresolvedImports,
    scannedRuleIds: rules.map((r) => r.id),
    edges,
  };
}
