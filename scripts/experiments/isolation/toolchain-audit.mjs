// Fixed trusted-tooling smoke/inventory. Never reads or runs candidate source.
import { createHash } from "node:crypto";
import {
  open,
  lstat,
  readdir,
  readFile,
  readlink,
  realpath,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
export function dependencyRowsJson(rows) {
  const compare = (a, b) => {
    const x = Array.from(a[0]),
      y = Array.from(b[0]);
    for (let n = 0; n < Math.min(x.length, y.length); n++) {
      const d = x[n].codePointAt(0) - y[n].codePointAt(0);
      if (d) return d;
    }
    return x.length - y.length;
  };
  return JSON.stringify([...rows].sort(compare)).replace(
    /[\u007f-\uffff]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
export async function auditToolchain() {
  const started = Date.now(),
    root = "/toolchain/node_modules";
  const sha = (value) => createHash("sha256").update(value).digest("hex");
  let total = 0,
    count = 0;
  async function hashed(filename) {
    const handle = await open(filename, "r");
    try {
      const before = await handle.stat();
      total += before.size;
      if (
        !before.isFile() ||
        before.size > 256 * 1024 ** 2 ||
        total > 1024 ** 3 ||
        ++count > 25000 ||
        Date.now() - started > 90000
      )
        throw new Error("Tooling inventory bound");
      const digest = createHash("sha256");
      let used = 0;
      for await (const chunk of handle.createReadStream({ autoClose: false })) {
        used += chunk.length;
        digest.update(chunk);
      }
      const after = await handle.stat();
      if (
        used !== before.size ||
        before.mtimeMs !== after.mtimeMs ||
        before.ctimeMs !== after.ctimeMs
      )
        throw new Error("Tooling changed during inventory");
      return digest.digest("hex");
    } finally {
      await handle.close();
    }
  }
  const lockBytes = await readFile("/toolchain/package-lock.json"),
    lock = JSON.parse(lockBytes);
  const pkgBytes = await readFile("/toolchain/package.json"),
    pkg = JSON.parse(pkgBytes);
  if (
    pkg.type !== "module" ||
    pkg.name !== "@forecode/protected-booking-toolchain"
  )
    throw new Error("Wrong tooling package scope");
  const dependencies = {};
  for (const [name, expected] of Object.entries(pkg.dependencies)) {
    const installed = JSON.parse(
      await readFile(`${root}/${name}/package.json`, "utf8"),
    );
    if (
      installed.version !== expected ||
      lock.packages[`node_modules/${name}`]?.version !== expected
    )
      throw new Error("Installed dependency differs from lock");
    dependencies[name] = installed.version;
  }
  await import("server-only");
  const ts = (await import("typescript")).default;
  const compiled = ts.transpileModule("export const smoke: number = 73", {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  });
  if (!compiled.outputText.includes("73"))
    throw new Error("TypeScript tooling smoke failed");
  // Enum syntax requires transformation, rather than native Node type stripping.
  await writeFile(
    "/tmp/forecode-tooling-smoke.mts",
    "enum Smoke { Value = 73 }; export const smoke: Smoke = Smoke.Value;",
    { flag: "wx" },
  );
  if ((await import("file:///tmp/forecode-tooling-smoke.mts")).smoke !== 73)
    throw new Error("tsx/esbuild smoke failed");
  const esbuild = await import("esbuild");
  await esbuild.transform("const smoke: number = 73", { loader: "ts" });
  const libc = process.report.getReport().header.glibcVersionRuntime
    ? "gnu"
    : "musl";
  const swcName = `@next/swc-linux-${process.arch === "arm64" ? "arm64" : "x64"}-${libc}`;
  const swc = createRequire("/toolchain/package.json")(swcName);
  const target = swc.getTargetTriple();
  if (typeof target !== "string" || !target.includes("linux"))
    throw new Error("Next native binding smoke failed");
  const next = spawnSync(
    process.execPath,
    ["/toolchain/node_modules/next/dist/bin/next", "--version"],
    { encoding: "utf8", timeout: 10000, maxBuffer: 65536 },
  );
  if (
    next.error ||
    next.signal ||
    next.status !== 0 ||
    !next.stdout.includes(dependencies.next)
  )
    throw new Error("Next CLI tooling smoke failed");
  const rows = [];
  async function walk(directory) {
    for (const name of (await readdir(directory)).sort()) {
      const absolute = path.join(directory, name),
        relative = path.relative(root, absolute);
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) {
        const target = await realpath(absolute),
          rel = path.relative(root, target);
        if (rel === ".." || rel.startsWith("../") || path.isAbsolute(rel))
          throw new Error("Toolchain link escapes");
        rows.push([relative, "link", await readlink(absolute)]);
      } else if (info.isDirectory()) await walk(absolute);
      else if (info.isFile()) rows.push([relative, await hashed(absolute)]);
      else throw new Error("Nonregular tooling input");
      if (rows.length > 25000 || Date.now() - started > 90000)
        throw new Error("Tooling inventory bound");
    }
  }
  await walk(root);
  const encoded = dependencyRowsJson(rows);
  const ldd = spawnSync("/usr/bin/ldd", [process.execPath], {
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 32768,
  });
  if (ldd.error || ldd.signal || ldd.status !== 0)
    throw new Error("Native Node closure inventory failed");
  const native = {};
  for (const file of [
    ...new Set(ldd.stdout.match(/\/[A-Za-z0-9_./+\-]+/g)),
  ].sort())
    native[file] = await hashed(await realpath(file));
  if (!Object.keys(native).length)
    throw new Error("Missing native Node closure");
  return {
    schemaVersion: "booking-toolchain-audit.v1",
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    nodeSha256: await hashed(process.execPath),
    lockSha256: sha(lockBytes),
    packageSha256: sha(pkgBytes),
    modulesSha256: sha(encoded),
    dependencies,
    native,
    esbuildVersion: esbuild.version,
    swcTarget: target,
    smoke: {
      typescript: true,
      tsx: true,
      esbuild: true,
      nextNative: true,
      nextCli: true,
    },
    inventoriedFiles: count,
    inventoriedBytes: total,
  };
}
if (process.argv[1] === "forecode-toolchain-audit")
  process.stdout.write(JSON.stringify(await auditToolchain()));
