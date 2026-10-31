// Public contract checks only; run exclusively INSIDE a confined guest.
import {
  cp,
  mkdtemp,
  symlink,
  rm,
  chmod,
  readdir,
  lstat,
  readFile,
  writeFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
const quick = process.argv.includes("--quick");
const interfaceOnly = process.argv.includes("--interface-only");
const began = Date.now();
const deadline = Math.min(
  began + (quick || interfaceOnly ? 20_000 : 170_000),
  Number(process.env.FORECODE_DEADLINE || Infinity) * 1000,
);
const rows = [];
let work;
async function validate(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = `${root}/${entry.name}`;
    const info = await lstat(file);
    if (
      info.isSymbolicLink() ||
      (!info.isFile() && !info.isDirectory()) ||
      (info.isFile() && info.nlink !== 1)
    )
      throw new Error("PUBLIC_SOURCE_ALIAS");
    if (info.isDirectory()) await validate(file);
  }
}
async function writable(root) {
  await chmod(root, 0o700);
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = `${root}/${entry.name}`;
    if (entry.isDirectory()) await writable(file);
    else await chmod(file, 0o600);
  }
}
function run(id, args, limit = 90_000, completionMarker) {
  const remaining = deadline - Date.now();
  const result =
    remaining > 0
      ? spawnSync("/usr/local/bin/node", args, {
          cwd: work,
          timeout: Math.min(limit, remaining),
          maxBuffer: 262144,
          env: {
            PATH: "/usr/local/bin:/usr/bin:/bin",
            NEXT_TELEMETRY_DISABLED: "1",
            NODE_ENV: "production",
          },
        })
      : null;
  const passed =
    !!result &&
    !result.error &&
    !result.signal &&
    result.status === 0 &&
    (!completionMarker ||
      result.stdout.toString("utf8").trimEnd().endsWith(completionMarker));
  rows.push({ id, passed });
  console.log(`PUBLIC_CHECK ${id} ${passed ? "PASS" : "FAIL"}`);
  if (!passed && result) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
  }
  return passed;
}
try {
  // Missing adapter is caught before copying, typegen or expensive builds.
  const proposed = process.argv.indexOf("--proposed-adapter");
  const adapter = await lstat(
    proposed !== -1 && interfaceOnly
      ? process.argv[proposed + 1]
      : "/workspace/src/server/team-benchmark.ts",
  );
  if (!adapter.isFile() || adapter.nlink !== 1 || adapter.size === 0)
    throw new Error("PUBLIC_ADAPTER_MISSING_OR_ALIAS");
  await validate("/workspace");
  work = await mkdtemp("/work/public-check-");
  await cp("/workspace", work, { recursive: true });
  await writable(work);
  if (proposed !== -1) {
    if (!interfaceOnly) throw new Error("PROPOSED_INTERFACE_ONLY");
    const bytes = await readFile(process.argv[proposed + 1]);
    if (bytes.length > 2_097_152) throw new Error("PROPOSED_SOURCE_BOUND");
    await writeFile(`${work}/src/server/team-benchmark.ts`, bytes);
  }
  // Inspect copied bytes before loading any candidate module or build tool.
  // Both quick and full checks include this public policy; no private tests.
  if (
    !run(
      "source-boundary",
      ["/run/team-public-boundary.mjs", work],
      20_000,
      "PUBLIC_BOUNDARY_CHECK_COMPLETED",
    )
  )
    throw new Error("PUBLIC_BOUNDARY_FAILED");
  await symlink("/toolchain/node_modules", `${work}/node_modules`);
  // Dynamic import and documented bootstrap exercise the public interface,
  // including cookies, before build. Source inspection alone cannot pass.
  const session = [
    "--conditions=react-server",
    "--import",
    "/toolchain/node_modules/tsx/dist/loader.mjs",
    "/run/team-public-session.mjs",
    work,
    ...(interfaceOnly ? ["--interface-only"] : []),
  ];
  const sessionCompletion = interfaceOnly
    ? "PUBLIC_INTERFACE_CHECK_COMPLETED"
    : "PUBLIC_SESSION_CHECK_COMPLETED";
  if (
    run(
      interfaceOnly ? "adapter-interface" : "adapter-session",
      session,
      15_000,
      sessionCompletion,
    ) &&
    !quick &&
    !interfaceOnly
  ) {
    if (
      run("typegen", [
        "/toolchain/node_modules/next/dist/bin/next",
        "typegen",
      ]) &&
      run("typecheck", [
        "/toolchain/node_modules/typescript/bin/tsc",
        "--noEmit",
      ]) &&
      run("build", [
        "/toolchain/node_modules/next/dist/bin/next",
        "build",
        "--webpack",
      ])
    ) {
      run("session-cookie", session, 15_000, sessionCompletion);
    }
  }
} catch (error) {
  rows.push({ id: "adapter-source", passed: false });
  console.log(
    error.message === "PUBLIC_BOUNDARY_FAILED"
      ? "PUBLIC_CHECK adapter-source FAIL (public source boundary)"
      : "PUBLIC_CHECK adapter-source FAIL (required source unavailable, invalid or check interrupted)",
  );
} finally {
  const passed = rows.length > 0 && rows.every((row) => row.passed);
  console.log(
    `PUBLIC_READINESS ${passed ? (interfaceOnly ? "INTERFACE_ONLY" : quick ? "QUICK_PASS" : "READY") : "BLOCKED"}`,
  );
  process.exitCode = passed ? 0 : 1;
  if (work) await rm(work, { recursive: true, force: true });
}
