// Trusted grader child. The candidate cannot choose commands or write this file.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { evaluateRemoteDomain, evaluateRemoteHttp } from "./remote-oracles";
import {
  teamOnlyCheckIds,
  validateTeamProfile,
  TeamGradeProfileSchema,
  GradeIdentitySchema,
  validateProfileIdentity,
} from "./grade-profile";
import { z } from "zod";
import { runInstalledTeamCheck } from "./team-installation";
import { decodeBehaviorReply, parseBehaviorRpc } from "./team-rpc.mjs";
import { AssertionError } from "node:assert";
import { privateTeamFailure } from "./team-diagnostics";
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
  const future = (teamOnlyCheckIds as readonly string[]).includes(kind ?? "");
  if (
    (!["baseline-domain", "http-integration"].includes(kind ?? "") &&
      !future) ||
    !/^forecode-booking-[a-f0-9-]{36}-[a-f0-9-]{36}$/.test(name ?? "")
  )
    throw new Error("Invalid oracle operation.");
  let profile;
  let authorizationIdentity;
  if (future) {
    const bytes = readFileSync(0);
    if (bytes.length > 8192) throw new Error("Profile input bound.");
    const value = z
      .union([
        TeamGradeProfileSchema,
        z.strictObject({
          profile: TeamGradeProfileSchema,
          authorizationIdentity: GradeIdentitySchema,
        }),
      ])
      .parse(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      );
    profile = validateTeamProfile("profile" in value ? value.profile : value);
    if ("authorizationIdentity" in value) {
      authorizationIdentity = value.authorizationIdentity;
      validateProfileIdentity(authorizationIdentity, profile);
      if (!name!.startsWith(`forecode-booking-${authorizationIdentity.runId}-`))
        throw new Error("Cross-run authorization identity.");
    }
  }
  const context = {
    kind: kind!,
    teamNewOrdinal: 0,
    rpcOrdinal: 0,
    lastOp: null as string | null,
  };
  const rpc = (data: unknown) => {
    const input = JSON.stringify(data);
    const parsed = parseBehaviorRpc(input, future);
    context.lastOp = String(parsed.op);
    context.rpcOrdinal++;
    if (parsed.op === "team-new") context.teamNewOrdinal++;
    const result = spawnSync(
      "docker",
      ["exec", "-i", name!, "/usr/local/bin/node", "/bridge/client.mjs"],
      {
        encoding: "utf8",
        input,
        timeout: 5000,
        maxBuffer: 65536,
        env: { NODE_ENV: "production", PATH: "/usr/local/bin:/usr/bin:/bin" },
      },
    );
    if (result.error || result.signal || result.status !== 0)
      throw new Error("Worker RPC failed.");
    const body = decodeBehaviorReply(result.stdout);
    if (body.error)
      throw Object.assign(new Error("Candidate error"), {
        code: body.error.code,
      });
    return body.result;
  };
  if (future && profile) {
    let authorizationAvailable = true;
    try {
      await runInstalledTeamCheck(
        kind!,
        profile,
        rpc,
        authorizationIdentity,
        (available) => {
          authorizationAvailable = available;
        },
      );
      process.stdout.write("Protected team check completed.");
      process.exitCode = 0;
    } catch (error) {
      // This child is outside every worker. guest.ts retains stderr privately;
      // public receipts and behavior RPCs keep their fixed safe envelopes.
      process.stderr.write(privateTeamFailure(error, context));
      process.stdout.write("Protected team check did not pass.");
      process.exitCode = error instanceof AssertionError ? 1 : 2;
    } finally {
      if (!authorizationAvailable)
        process.stdout.write(" Authorization telemetry unavailable.");
    }
  } else {
    const rows = await (
      kind === "baseline-domain" ? evaluateRemoteDomain : evaluateRemoteHttp
    )(rpc);
    process.stdout.write(
      rows.map((row) => `${row.id}:${row.status}`).join(","),
    );
    process.exitCode = rows.every((row) => row.status === "pass") ? 0 : 1;
  }
}
