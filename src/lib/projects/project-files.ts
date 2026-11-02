export interface ProjectFile {
  path: string;
  source: string;
}

export interface LocalProject {
  name: string;
  files: ProjectFile[];
  edges: { from: string; to: string; specifier: string }[];
  issues: {
    path: string;
    specifier?: string;
    message: string;
    kind?: "external" | "unresolved" | "limitation";
  }[];
  coverage: string[];
}

export const MAX_PROJECT_FILES = 500;
export const MAX_PROJECT_FILE_BYTES = 512 * 1024;
export const MAX_PROJECT_TOTAL_BYTES = 10 * 1024 * 1024;
export const SOURCE_EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
export const CONFIG_NAME = /^(?:tsconfig|jsconfig)(?:\.[\w-]+)?\.json$/i;
const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".aws",
  ".ssh",
  ".azure",
  ".gcloud",
  ".config",
  ".npm",
  ".yarn",
  ".pnpm",
  ".venv",
  "venv",
  "node_modules",
  "bower_components",
  "vendor",
  "__pycache__",
  ".next",
  ".nuxt",
  ".output",
  ".cache",
  ".turbo",
  ".vercel",
  "dist",
  "build",
  "out",
  "target",
  "coverage",
  "playwright-report",
  "test-results",
  "secrets",
  "credentials",
]);

/** Call on File.webkitRelativePath before calling File.text() or File.arrayBuffer(). */
export function classifyProjectPath(path: string): {
  included: boolean;
  reason?: string;
} {
  const normalized = path.replaceAll("\\", "/");
  if (
    !normalized ||
    normalized.length > 1_024 ||
    normalized.startsWith("/") ||
    /^[a-z]:/i.test(normalized) ||
    /[\u0000-\u001f\u007f]/.test(normalized) ||
    normalized.split("/").some((part) => !part || part === "." || part === "..")
  )
    return { included: false, reason: "Invalid or non-relative project path." };
  const parts = normalized.toLowerCase().split("/");
  if (parts.some((part) => EXCLUDED_DIRECTORIES.has(part))) {
    return {
      included: false,
      reason:
        "Dependency, generated, version-control, or credential directory.",
    };
  }
  const filename = parts.at(-1)!;
  if (
    parts.some((part) => /^\.env/.test(part)) ||
    /(?:^|[._-])(?:credentials?|secrets?|private[-_]?key|service[-_]?account|tokens?)(?:[._-]|$)/.test(
      filename,
    ) ||
    /^(?:\.npmrc|\.netrc|\.pypirc|id_rsa|id_ed25519)(?:\.|$)/.test(filename) ||
    /\.(?:pem|key|p12|pfx|keystore|jks|crt|cer)$/i.test(filename)
  )
    return { included: false, reason: "Environment or credential file." };
  if (SOURCE_EXTENSION.test(filename) || CONFIG_NAME.test(filename))
    return { included: true };
  return {
    included: false,
    reason: "Unsupported file type; not read or retained.",
  };
}
