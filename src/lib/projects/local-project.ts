import ts from "typescript";
import {
  classifyProjectPath,
  MAX_PROJECT_FILES,
  MAX_PROJECT_FILE_BYTES,
  MAX_PROJECT_TOTAL_BYTES,
  SOURCE_EXTENSION,
  CONFIG_NAME,
  type LocalProject,
  type ProjectFile,
} from "./project-files";
export {
  classifyProjectPath,
  MAX_PROJECT_FILES,
  MAX_PROJECT_FILE_BYTES,
  MAX_PROJECT_TOTAL_BYTES,
  type LocalProject,
  type ProjectFile,
} from "./project-files";
const MAX_INPUT_ENTRIES = 10_000;
const MAX_ISSUES = 2_000;
const MAX_AST_NODES = 100_000;

function directory(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

function join(base: string, path: string): string | undefined {
  if (path.startsWith("/") || /^[a-z]:/i.test(path) || path.includes("\\"))
    return;
  const result: string[] = [];
  for (const part of `${base}/${path}`.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!result.length) return;
      result.pop();
    } else result.push(part);
  }
  return result.join("/");
}

interface AliasConfig {
  typescript: boolean;
  directory: string;
  base: string;
  baseUrl: boolean;
  paths: [string, string[]][];
  resolutionUnsupported?: boolean;
}

/** Pure analysis of supplied strings. Never executes source, configuration, or imports. */
export function parseLocalProject(
  name: string,
  inputs: ProjectFile[],
): LocalProject {
  const project: LocalProject = {
    name: name.trim().slice(0, 200) || "Local project",
    files: [],
    edges: [],
    issues: [],
    coverage: [
      "Partial static dependency graph: JavaScript and TypeScript imports, exports, import types, and literal dynamic imports only.",
      "Relative paths and nearest tsconfig.json/jsconfig.json baseUrl and paths aliases are resolved against selected files only.",
      "Package dependencies, inherited/referenced configs, package exports, custom bundler aliases, runtime-generated paths, and CommonJS calls are not resolved.",
      "Only JavaScript, TypeScript, and tsconfig/jsconfig JSON files are retained. Stylesheets, assets, and other file types are excluded.",
      "Framework conventions such as Next.js routes, layouts, and server/client boundaries are not dependency edges or execution analysis.",
      "Excluded files are not retained. No imported source or configuration is executed, and no network or filesystem resolution is performed.",
    ],
  };
  let overflow = false;
  const issue = (
    path: string,
    message: string,
    specifier?: string,
    kind: "external" | "unresolved" | "limitation" = "limitation",
  ) => {
    if (project.issues.length < MAX_ISSUES) {
      project.issues.push({
        path,
        message,
        kind,
        ...(specifier === undefined ? {} : { specifier }),
      });
    } else overflow = true;
  };
  const paths = new Set<string>();
  let bytes = 0;
  const encoder = new TextEncoder();
  if (inputs.length > MAX_INPUT_ENTRIES)
    issue(
      "",
      "Input entry limit exceeded; remaining entries were not inspected.",
    );
  for (const input of inputs.slice(0, MAX_INPUT_ENTRIES)) {
    // Intentionally classify before accessing source, including when passed a getter.
    const classification = classifyProjectPath(input.path);
    if (!classification.included) {
      issue(input.path, classification.reason!);
      continue;
    }
    const path = input.path.replaceAll("\\", "/");
    if (paths.has(path)) {
      issue(path, "Duplicate path skipped; the first accepted file is used.");
      continue;
    }
    if (project.files.length >= MAX_PROJECT_FILES) {
      issue(path, "Project file count limit exceeded; file not retained.");
      continue;
    }
    const source = input.source;
    if (source.length > MAX_PROJECT_FILE_BYTES) {
      issue(path, "Per-file size limit exceeded; file not retained.");
      continue;
    }
    const size = encoder.encode(source).byteLength;
    if (
      size > MAX_PROJECT_FILE_BYTES ||
      bytes + size > MAX_PROJECT_TOTAL_BYTES
    ) {
      issue(
        path,
        "File or total project size limit exceeded; file not retained.",
      );
      continue;
    }
    if (source.includes("\0")) {
      issue(path, "Binary content is unsupported; file not retained.");
      continue;
    }
    paths.add(path);
    bytes += size;
    project.files.push({ path, source });
  }
  project.files.sort((a, b) => compare(a.path, b.path));
  const configs: AliasConfig[] = [];
  for (const file of project.files.filter((file) =>
    CONFIG_NAME.test(file.path.split("/").at(-1)!),
  )) {
    const filename = file.path.split("/").at(-1)!.toLowerCase();
    const selected: AliasConfig | undefined =
      /^(?:tsconfig|jsconfig)\.json$/.test(filename)
        ? {
            typescript: filename === "tsconfig.json",
            directory: directory(file.path),
            base: directory(file.path),
            baseUrl: false,
            paths: [],
          }
        : undefined;
    // Even an invalid nearest config forms a boundary; do not silently inherit a parent.
    if (selected) configs.push(selected);
    try {
      const parsed = ts.parseConfigFileTextToJson(file.path, file.source);
      if (parsed.error) {
        issue(
          file.path,
          "Malformed TypeScript/JavaScript config; aliases from this config are unavailable.",
        );
        continue;
      }
      const config: unknown = parsed.config;
      if (!isRecord(config)) {
        issue(file.path, "Config must be an object; aliases unavailable.");
        continue;
      }
      if (config.extends !== undefined || config.references !== undefined) {
        issue(
          file.path,
          "Config extends/references are unsupported; only directly declared aliases are considered.",
        );
      }
      const options = config.compilerOptions;
      if (options !== undefined && !isRecord(options)) {
        issue(file.path, "Invalid compilerOptions; aliases unavailable.");
        continue;
      }
      if (isRecord(options)) {
        const unsupported = [
          "rootDirs",
          "moduleSuffixes",
          "noResolve",
          "resolveJsonModule",
          "customConditions",
        ].filter((key) => options[key] !== undefined);
        if (unsupported.length) {
          issue(
            file.path,
            `Unsupported resolution options: ${unsupported.join(", ")}; dependency coverage may be incomplete.`,
          );
          // Suffixes and virtual roots can redirect apparently present relative files.
          // Do not assert ordinary-resolution edges under those configurations.
          if (
            selected &&
            (options.moduleSuffixes !== undefined ||
              options.rootDirs !== undefined ||
              options.noResolve === true)
          )
            selected.resolutionUnsupported = true;
        }
      }
      const dir = directory(file.path);
      const baseUrl = isRecord(options) ? options.baseUrl : undefined;
      if (baseUrl !== undefined && typeof baseUrl !== "string") {
        issue(file.path, "Invalid baseUrl; aliases unavailable.");
        continue;
      }
      const base = join(dir, typeof baseUrl === "string" ? baseUrl : ".");
      if (base === undefined) {
        issue(
          file.path,
          "Config baseUrl escapes the selected project; aliases unavailable.",
        );
        continue;
      }
      const aliases: [string, string[]][] = [];
      const rawPaths = isRecord(options) ? options.paths : undefined;
      if (rawPaths !== undefined && !isRecord(rawPaths)) {
        issue(file.path, "Invalid paths aliases; expected an object.");
      } else if (isRecord(rawPaths)) {
        for (const [pattern, targets] of Object.entries(rawPaths)) {
          if (
            !pattern ||
            pattern.split("*").length > 2 ||
            !Array.isArray(targets) ||
            !targets.length ||
            targets.some(
              (target) =>
                typeof target !== "string" || target.split("*").length > 2,
            )
          ) {
            issue(file.path, "Unsupported or malformed paths alias.", pattern);
            continue;
          }
          aliases.push([pattern, targets as string[]]);
        }
      }
      if (selected) {
        selected.base = base;
        selected.baseUrl = baseUrl !== undefined;
        selected.paths = aliases;
      } else {
        issue(
          file.path,
          "Named config is retained but not selected automatically; extends is unsupported.",
        );
      }
    } catch {
      issue(file.path, "Config parsing failed; aliases unavailable.");
    }
  }
  configs.sort(
    (a, b) =>
      b.directory.length - a.directory.length ||
      Number(b.typescript) - Number(a.typescript),
  );
  const extensions = [
    ".ts",
    ".tsx",
    ".d.ts",
    ".js",
    ".jsx",
    ".mts",
    ".cts",
    ".mjs",
    ".cjs",
  ];
  function resolveCandidate(candidate: string | undefined): string | undefined {
    if (candidate === undefined) return;
    const alternate: string[] = [];
    if (/\.jsx?$/.test(candidate))
      alternate.push(
        candidate.replace(/\.jsx?$/, ".ts"),
        candidate.replace(/\.jsx?$/, ".tsx"),
        candidate.replace(/\.jsx?$/, ".d.ts"),
      );
    if (/\.mjs$/.test(candidate))
      alternate.push(candidate.replace(/\.mjs$/, ".mts"));
    if (/\.cjs$/.test(candidate))
      alternate.push(candidate.replace(/\.cjs$/, ".cts"));
    return [
      ...alternate,
      candidate,
      ...extensions.map((extension) => candidate + extension),
      ...extensions.map((extension) => `${candidate}/index${extension}`),
    ].find((path) => SOURCE_EXTENSION.test(path) && paths.has(path));
  }
  const edgeKeys = new Set<string>();
  for (const file of project.files.filter((file) =>
    SOURCE_EXTENSION.test(file.path),
  )) {
    const config = configs.find(
      (config) =>
        !config.directory || file.path.startsWith(`${config.directory}/`),
    );
    function dependency(specifier: string) {
      let target: string | undefined;
      if (config?.resolutionUnsupported) {
        issue(
          file.path,
          "Unresolved dependency: selected config uses unsupported resolution options.",
          specifier,
          "unresolved",
        );
        return;
      }
      let local = specifier.startsWith("./") || specifier.startsWith("../");
      if (local)
        target = resolveCandidate(join(directory(file.path), specifier));
      else if (config) {
        // TypeScript prioritizes exact matches, then the longest wildcard prefix.
        const matching = config.paths
          .flatMap(([pattern, targets]) => {
            const star = pattern.indexOf("*");
            if (star < 0)
              return pattern === specifier
                ? [{ targets, match: "", rank: Number.MAX_SAFE_INTEGER }]
                : [];
            const prefix = pattern.slice(0, star);
            const suffix = pattern.slice(star + 1);
            return specifier.startsWith(prefix) &&
              specifier.endsWith(suffix) &&
              specifier.length >= prefix.length + suffix.length
              ? [
                  {
                    targets,
                    match: specifier.slice(
                      prefix.length,
                      specifier.length - suffix.length,
                    ),
                    rank: prefix.length,
                  },
                ]
              : [];
          })
          .sort((a, b) => b.rank - a.rank);
        const alias = matching[0];
        if (alias) {
          local = true;
          for (const replacement of alias.targets) {
            target = resolveCandidate(
              join(
                config.base,
                replacement.replace("*", () => alias.match),
              ),
            );
            if (target) break;
          }
        } else if (config.baseUrl)
          target = resolveCandidate(join(config.base, specifier));
      }
      if (!target) {
        issue(
          file.path,
          local
            ? "Unresolved local import: target absent, excluded, or unsupported."
            : /^(?:@\/|#|\/|[a-z]:|\\)/i.test(specifier)
              ? "Unresolved dependency: absolute path or unconfigured alias is unsupported."
              : "External package or builtin reference; package availability is not verified. A custom unconfigured alias cannot be ruled out.",
          specifier,
          local || /^(?:@\/|#|\/|[a-z]:|\\)/i.test(specifier)
            ? "unresolved"
            : "external",
        );
        return;
      }
      const key = JSON.stringify([file.path, target, specifier]);
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        project.edges.push({ from: file.path, to: target, specifier });
      }
    }
    try {
      const scriptKind = /\.tsx$/i.test(file.path)
        ? ts.ScriptKind.TSX
        : /\.jsx$/i.test(file.path)
          ? ts.ScriptKind.JSX
          : /\.[cm]?js$/i.test(file.path)
            ? ts.ScriptKind.JS
            : ts.ScriptKind.TS;
      const source = ts.createSourceFile(
        file.path,
        file.source,
        ts.ScriptTarget.Latest,
        false,
        scriptKind,
      );
      const diagnostics = (
        source as ts.SourceFile & {
          parseDiagnostics?: readonly ts.Diagnostic[];
        }
      ).parseDiagnostics;
      if (diagnostics?.length)
        issue(
          file.path,
          "Source contains syntax errors; recovered dependency coverage may be incomplete.",
        );
      const stack: ts.Node[] = [source];
      let visited = 0;
      while (stack.length) {
        const node = stack.pop()!;
        if (++visited > MAX_AST_NODES) {
          issue(
            file.path,
            "AST node limit reached; dependency coverage is incomplete.",
          );
          break;
        }
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteralLike(node.moduleSpecifier)
        ) {
          dependency(node.moduleSpecifier.text);
        } else if (
          ts.isImportTypeNode(node) &&
          ts.isLiteralTypeNode(node.argument) &&
          ts.isStringLiteralLike(node.argument.literal)
        ) {
          dependency(node.argument.literal.text);
        } else if (
          ts.isImportEqualsDeclaration(node) &&
          ts.isExternalModuleReference(node.moduleReference)
        ) {
          const expression = node.moduleReference.expression;
          if (expression && ts.isStringLiteralLike(expression))
            dependency(expression.text);
        } else if (ts.isCallExpression(node)) {
          if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            const argument = node.arguments[0];
            if (argument && ts.isStringLiteralLike(argument)) {
              dependency(argument.text);
              issue(
                file.path,
                "Literal dynamic import recorded as a possible dependency; runtime loading is not analyzed.",
                argument.text,
              );
            } else
              issue(
                file.path,
                "Dynamic import expression is unsupported; target cannot be resolved statically.",
              );
          } else if (
            ts.isIdentifier(node.expression) &&
            node.expression.text === "require"
          ) {
            const argument = node.arguments[0];
            issue(
              file.path,
              "CommonJS require calls are unsupported; dependency coverage is incomplete.",
              argument && ts.isStringLiteralLike(argument)
                ? argument.text
                : undefined,
            );
          }
        }
        ts.forEachChild(node, (child) => {
          stack.push(child);
        });
      }
      if (
        source.referencedFiles.length ||
        source.typeReferenceDirectives.length ||
        source.libReferenceDirectives.length
      ) {
        issue(
          file.path,
          "Triple-slash references are unsupported; dependency coverage is incomplete.",
        );
      }
    } catch {
      issue(
        file.path,
        "Source parsing failed or exceeded parser capacity; dependency coverage is incomplete.",
      );
    }
  }
  project.edges.sort(
    (a, b) =>
      compare(a.from, b.from) ||
      compare(a.to, b.to) ||
      compare(a.specifier, b.specifier),
  );
  project.issues.sort(
    (a, b) =>
      compare(a.path, b.path) ||
      compare(a.specifier ?? "", b.specifier ?? "") ||
      compare(a.message, b.message),
  );
  if (overflow)
    project.coverage.push(
      "Issue display limit reached; additional diagnostics were omitted.",
    );
  return project;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
