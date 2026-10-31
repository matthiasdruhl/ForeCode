// Public static development feedback only. Never executes source or imports a
// grader. Keep parity with the frozen public oracle-driver boundary policy.
import path from "node:path";

export function publicBoundaryDiagnostics(file, source, ts) {
  if (!/\.[cm]?[jt]sx?$/.test(file)) return [];
  const diagnostics = [];
  const unit = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  function report(node, rule) {
    if (diagnostics.length >= 20) return;
    const { line, character } = unit.getLineAndCharacterOfPosition(
      node.getStart(unit),
    );
    diagnostics.push({ file, line: line + 1, column: character + 1, rule });
  }
  function inspect(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const name = node.moduleSpecifier.text;
      if (
        /^(node:)?(fs|child_process|net|tls|vm|worker_threads|module|cluster)(\/|$)/.test(
          name,
        ) ||
        /(^|\/)(experiments|evaluator|holdout)(\/|$)/.test(name)
      )
        report(node, "FORBIDDEN_MODULE");
      if (
        name.startsWith(".") &&
        path.posix
          .normalize(path.posix.join(path.posix.dirname(file), name))
          .startsWith("..")
      )
        report(node, "IMPORT_OUTSIDE_SOURCE");
    }
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword)
        report(node, "DYNAMIC_IMPORT_USE_STATIC_IMPORT");
      else if (
        ["require", "eval", "Function", "process.getBuiltinModule"].includes(
          node.expression.getText(unit),
        )
      )
        report(node, "FORBIDDEN_LOADER_OR_EVALUATION");
    }
    if (
      ts.isNewExpression(node) &&
      node.expression.getText(unit) === "Function"
    )
      report(node, "FORBIDDEN_LOADER_OR_EVALUATION");
    ts.forEachChild(node, inspect);
  }
  inspect(unit);
  return diagnostics;
}

// Separate process: release the compiler/parser before Next builds so the
// existing combined container memory limit is preserved.
if (process.argv[1]?.endsWith("/team-public-boundary.mjs")) {
  const { readFile, readdir } = await import("node:fs/promises");
  const { default: ts } =
    await import("/toolchain/node_modules/typescript/lib/typescript.js");
  async function scan(root, relative = "") {
    let safe = true;
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!(await scan(`${root}/${entry.name}`, file))) safe = false;
      } else if (/\.[cm]?[jt]sx?$/.test(file)) {
        const diagnostics = publicBoundaryDiagnostics(
          file,
          await readFile(`${root}/${entry.name}`, "utf8"),
          ts,
        );
        if (diagnostics.length) safe = false;
        for (const diagnostic of diagnostics)
          console.log("PUBLIC_BOUNDARY " + JSON.stringify(diagnostic));
      }
    }
    return safe;
  }
  const safe = await scan(process.argv[2]);
  if (safe) console.log("PUBLIC_BOUNDARY_CHECK_COMPLETED");
  process.exitCode = safe ? 0 : 1;
}
