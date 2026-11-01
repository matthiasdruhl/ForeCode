// Static parsing only. Never import/execute a candidate or read host files.
// A protected evaluator must supply the complete sealed src inventory and bind
// the result to its source manifest. This output has no authenticity by itself.
import ts from "typescript";
import { posix } from "node:path";
import { invariant } from "../../../src/lib/contracts/validation";
import {
  MetricSourcePathSchema,
  MetricStylesheetPathSchema,
  type MetricProtocol,
} from "../../../src/lib/experiment/prospective-metrics";
const loaderNames = new Set([
  "require",
  "module",
  "createRequire",
  "getBuiltinModule",
]);
export function collectBoundaryMetrics(
  files: Readonly<Record<string, string>>,
  protocol: Pick<
    MetricProtocol,
    "boundaryRules" | "externalPackages" | "stylesheetPaths"
  >,
) {
  const { boundaryRules: rules, externalPackages, stylesheetPaths } = protocol;
  invariant(
    externalPackages.every((p) =>
      /^(?:[a-z][a-z0-9-]*|@[a-z0-9-]+\/[a-z0-9-]+|node:[a-z_]+)$/.test(p),
    ),
    "Unsupported external package",
  );
  invariant(
    stylesheetPaths.every(
      (p) => MetricStylesheetPathSchema.safeParse(p).success,
    ) && new Set(stylesheetPaths).size === stylesheetPaths.length,
    "Invalid stylesheet policy",
  );
  invariant(
    new Set(rules.map((r) => r.id)).size === rules.length &&
      new Set(rules.map((r) => `${r.from}\0${r.to}`)).size === rules.length &&
      new Set(externalPackages).size === externalPackages.length,
    "Duplicate metric rules/packages",
  );
  const entries = Object.entries(files).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  invariant(
    entries.length > 0 &&
      entries.length <= 1000 &&
      entries.every(
        ([p, s]) =>
          (MetricSourcePathSchema.safeParse(p).success ||
            stylesheetPaths.includes(p)) &&
          Buffer.byteLength(s) <= 262144,
      ),
    "Invalid source inventory",
  );
  invariant(
    entries.reduce((n, [, s]) => n + Buffer.byteLength(s), 0) <= 4_194_304,
    "Source bound",
  );
  const edges: { from: string; to: string }[] = [];
  let unresolvedImports = 0;
  function dependency(from: string, value: string, sideEffect = false) {
    const packageName = value.startsWith("@")
      ? value.split("/").slice(0, 2).join("/")
      : value.split("/")[0]!;
    // Even a frozen external module package can manufacture a CommonJS loader.
    if (["module", "node:module"].includes(packageName)) {
      unresolvedImports++;
      return;
    }
    if (externalPackages.includes(packageName)) return;
    let base: string;
    if (value.startsWith("./") || value.startsWith("../"))
      base = posix.normalize(posix.join(posix.dirname(from), value));
    else if (value.startsWith("@/"))
      base = posix.normalize("src/" + value.slice(2));
    else {
      unresolvedImports++;
      return;
    }
    if (!base.startsWith("src/")) {
      unresolvedImports++;
      return;
    }
    if (
      sideEffect &&
      stylesheetPaths.includes(base) &&
      Object.hasOwn(files, base)
    )
      return;
    if (base.endsWith(".js")) base = base.slice(0, -3);
    const targets = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}/index.ts`,
      `${base}/index.tsx`,
    ].filter(
      (p) =>
        MetricSourcePathSchema.safeParse(p).success && Object.hasOwn(files, p),
    );
    const unique = [...new Set(targets)];
    if (unique.length !== 1) {
      unresolvedImports++;
      return;
    }
    edges.push({ from, to: unique[0]! });
  }
  for (const [file, text] of entries) {
    if (stylesheetPaths.includes(file)) continue; // Frozen non-source assets only.
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
    unresolvedImports +=
      diagnostics.length +
      ast.referencedFiles.length +
      ast.typeReferenceDirectives.length +
      ast.libReferenceDirectives.length;
    function visit(n: ts.Node) {
      if (
        (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
        n.moduleSpecifier
      ) {
        if (n.attributes) unresolvedImports++; // No custom asset/loader semantics.
        if (ts.isStringLiteral(n.moduleSpecifier))
          dependency(
            file,
            n.moduleSpecifier.text,
            ts.isImportDeclaration(n) && !n.importClause,
          );
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
      // Conservatively refuse loader references even when aliased or extracted;
      // this is not a runtime capability/alias analysis. Literal bracket access
      // is checked separately because its property is not an Identifier node.
      if (ts.isIdentifier(n) && loaderNames.has(n.text)) unresolvedImports++;
      if (
        ts.isElementAccessExpression(n) &&
        (ts.isStringLiteral(n.argumentExpression) ||
          ts.isNoSubstitutionTemplateLiteral(n.argumentExpression)) &&
        loaderNames.has(n.argumentExpression.text)
      )
        unresolvedImports++;
      if (
        ts.isCallExpression(n) &&
        n.expression.kind === ts.SyntaxKind.ImportKeyword
      )
        unresolvedImports++;
      ts.forEachChild(n, visit);
    }
    visit(ast);
  }
  // The calculator deduplicates source edges. Declared side-effect stylesheets
  // create no TS edge. Dynamic/CommonJS syntax makes coverage unknown.
  if (edges.length > 10_000)
    return {
      complete: false,
      unresolvedImports: unresolvedImports + 1,
      scannedRuleIds: rules.map((r) => r.id),
      edges: [],
    };
  return {
    complete:
      stylesheetPaths.every((p) => Object.hasOwn(files, p)) &&
      rules.every(
        (r) => Object.hasOwn(files, r.from) && Object.hasOwn(files, r.to),
      ),
    unresolvedImports,
    scannedRuleIds: rules.map((r) => r.id),
    edges,
  };
}
