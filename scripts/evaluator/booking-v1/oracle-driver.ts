// Trusted grader child. The candidate cannot choose commands or write this file.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { evaluateRemoteDomain, evaluateRemoteHttp } from "./remote-oracles";
function boundary(files: { path: string; base64: string }[]): boolean {
  return files
    .filter((f) => /\.[cm]?[jt]sx?$/.test(f.path))
    .every((file) => {
      let safe = true;
      const unit = ts.createSourceFile(
        file.path,
        Buffer.from(file.base64, "base64").toString(),
        ts.ScriptTarget.Latest,
        true,
        file.path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      function inspect(node: ts.Node) {
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
            safe = false;
          if (
            name.startsWith(".") &&
            path.posix
              .normalize(path.posix.join(path.posix.dirname(file.path), name))
              .startsWith("..")
          )
            safe = false;
        }
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            [
              "require",
              "eval",
              "Function",
              "process.getBuiltinModule",
            ].includes(node.expression.getText(unit)))
        )
          safe = false;
        if (
          ts.isNewExpression(node) &&
          node.expression.getText(unit) === "Function"
        )
          safe = false;
        ts.forEachChild(node, inspect);
      }
      inspect(unit);
      return safe;
    });
}

const kind = process.argv[2],
  name = process.argv[3];
if (kind === "boundary") {
  const safe = boundary(JSON.parse(readFileSync(0, "utf8")));
  process.stdout.write(
    "Trusted static command/import scan; not containment proof.",
  );
  process.exitCode = safe ? 0 : 1;
} else {
  if (
    !["baseline-domain", "http-integration"].includes(kind ?? "") ||
    !/^forecode-booking-[a-f0-9-]{36}$/.test(name ?? "")
  )
    throw new Error("Invalid oracle operation.");
  const rpc = (data: unknown) => {
    const result = spawnSync(
      "docker",
      ["exec", "-i", name!, "/usr/local/bin/node", "/bridge/client.mjs"],
      {
        encoding: "utf8",
        input: JSON.stringify(data),
        timeout: 5000,
        maxBuffer: 65536,
        env: { NODE_ENV: "production", PATH: "/usr/local/bin:/usr/bin:/bin" },
      },
    );
    if (result.error || result.signal || result.status !== 0)
      throw new Error("Worker RPC failed.");
    const body = JSON.parse(result.stdout);
    if (body.error)
      throw Object.assign(new Error("Candidate error"), {
        code: body.error.code,
      });
    return body.result;
  };
  const rows = await (
    kind === "baseline-domain" ? evaluateRemoteDomain : evaluateRemoteHttp
  )(rpc);
  process.stdout.write(rows.map((row) => `${row.id}:${row.status}`).join(","));
  process.exitCode = rows.every((row) => row.status === "pass") ? 0 : 1;
}
