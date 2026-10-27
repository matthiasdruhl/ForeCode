// Owner maintenance only. Installed bytes must be verified before this runs.
// No candidate, arbitrary source, command, model or provider input.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = "/opt/forecode-booking";
if (process.argv.length !== 2 || process.execPath !== `${root}/bin/node`)
  throw new Error("Fixed installed smoke invocation required");
const pkg = JSON.parse(await readFile(`${root}/package.json`, "utf8"));
const lock = JSON.parse(await readFile(`${root}/package-lock.json`, "utf8"));
if (
  pkg.type !== "module" ||
  pkg.name !== "@forecode/protected-booking-toolchain"
)
  throw new Error("Installed ESM scope missing");
const dependencies = {};
for (const [name, expected] of Object.entries(pkg.dependencies)) {
  const installed = JSON.parse(
    await readFile(`${root}/node_modules/${name}/package.json`, "utf8"),
  );
  if (
    installed.version !== expected ||
    lock.packages[`node_modules/${name}`]?.version !== expected
  )
    throw new Error("Installed dependency resolution differs");
  dependencies[name] = installed.version;
}
// Import relative to the actual installed controller package scope.
for (const name of ["server-only", "typescript", "esbuild"])
  if (
    !fileURLToPath(import.meta.resolve(name)).startsWith(
      `${root}/node_modules/`,
    )
  )
    throw new Error("Dependency resolved outside installed scope");
await import("server-only");
const sample = await import("./installed-sample.ts");
if (
  sample.smoke !== 73 ||
  sample.moduleUrl !== `${new URL("./installed-sample.ts", import.meta.url)}`
)
  throw new Error("Installed tsx/ESM sample failed");
const ts = (await import("typescript")).default;
if (
  !ts
    .transpileModule("export const smoke: number = 73", {
      compilerOptions: { module: ts.ModuleKind.ESNext },
    })
    .outputText.includes("73")
)
  throw new Error("TypeScript smoke failed");
const esbuild = await import("esbuild");
if (
  !esbuild
    .transformSync("export const smoke: number = 73", { loader: "ts" })
    .code.includes("73")
)
  throw new Error("esbuild smoke failed");
const libc = process.report.getReport().header.glibcVersionRuntime
  ? "gnu"
  : "musl";
const swc = createRequire(`${root}/package.json`)(
  `@next/swc-linux-${process.arch === "arm64" ? "arm64" : "x64"}-${libc}`,
);
const target = swc.getTargetTriple();
if (typeof target !== "string" || !target.includes("linux"))
  throw new Error("Native Next smoke failed");
const next = spawnSync(
  process.execPath,
  [`${root}/node_modules/next/dist/bin/next`, "--version"],
  {
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 65536,
  },
);
if (
  next.error ||
  next.signal ||
  next.status !== 0 ||
  next.stdout.trim() !== `Next.js v${dependencies.next}`
)
  throw new Error("Next CLI smoke failed");
process.stdout.write(
  JSON.stringify({
    schemaVersion: "booking-installed-smoke.v1",
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    nodeExecutable: process.execPath,
    dependencies,
    esbuildVersion: esbuild.version,
    swcTarget: target,
    smoke: {
      esm: true,
      serverOnly: true,
      typescript: true,
      tsx: true,
      esbuild: true,
      nextNative: true,
      nextCli: true,
    },
  }),
);
