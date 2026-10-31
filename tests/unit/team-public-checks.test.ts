// Runs only the reviewed checker with synthetic filesystem/process seams.
// No candidate code, subprocess, container or provider is executed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { publicBoundaryDiagnostics } from "../../scripts/experiments/agent/team-public-boundary.mjs";

const state = vi.hoisted(() => ({
  files: new Map<string, Buffer>(),
  commands: [] as string[][],
  boundary: "scan",
  sessionMarker: true,
}));
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return {
    ...fs,
    lstat: async (file: string) => {
      const directory = [...state.files.keys()].some((name) =>
        name.startsWith(file + "/"),
      );
      if (!state.files.has(file) && !directory)
        throw new Error("synthetic missing file");
      return {
        isFile: () => !directory,
        isDirectory: () => directory,
        isSymbolicLink: () => false,
        nlink: 1,
        size: state.files.get(file)?.length ?? 0,
      };
    },
    readdir: async (root: string) => {
      const names = new Map<string, boolean>();
      for (const file of state.files.keys()) {
        if (!file.startsWith(root + "/")) continue;
        const relative = file.slice(root.length + 1);
        names.set(relative.split("/")[0]!, relative.includes("/"));
      }
      return [...names].map(([name, directory]) => ({
        name,
        isDirectory: () => directory,
      }));
    },
    mkdtemp: async () => "/work/public-check-unit",
    chmod: async () => {},
    rm: async () => {},
    symlink: async () => {},
    cp: async (from: string, to: string) => {
      for (const [file, bytes] of [...state.files])
        if (file.startsWith(from + "/"))
          state.files.set(to + file.slice(from.length), bytes);
    },
    readFile: async (file: string, encoding?: string) => {
      const bytes = state.files.get(file);
      if (!bytes) throw new Error("synthetic missing file");
      return encoding ? bytes.toString("utf8") : bytes;
    },
    writeFile: async (file: string, bytes: Buffer) => {
      state.files.set(file, bytes);
    },
  };
});
vi.mock("node:child_process", () => ({
  spawnSync: (_command: string, args: string[]) => {
    state.commands.push(args);
    let status = 0,
      stdout = "";
    if (args[0] === "/run/team-public-boundary.mjs") {
      const root = args[1]!;
      const diagnostics = [...state.files]
        .filter(([file]) => file.startsWith(root + "/"))
        .flatMap(([file, bytes]) =>
          publicBoundaryDiagnostics(
            file.slice(root.length + 1),
            bytes.toString(),
            ts,
          ),
        );
      status = diagnostics.length || state.boundary === "nonzero" ? 1 : 0;
      stdout = status
        ? diagnostics
            .map((row) => "PUBLIC_BOUNDARY " + JSON.stringify(row))
            .join("\n")
        : "PUBLIC_BOUNDARY_CHECK_COMPLETED\n";
      if (state.boundary === "missing-marker") stdout = "";
      if (state.boundary === "nonzero")
        stdout = "PUBLIC_BOUNDARY_CHECK_COMPLETED\n";
    } else if (
      args.includes("/run/team-public-session.mjs") &&
      state.sessionMarker
    ) {
      stdout = args.includes("--interface-only")
        ? "PUBLIC_INTERFACE_CHECK_COMPLETED\n"
        : "PUBLIC_SESSION_CHECK_COMPLETED\n";
    }
    return {
      status,
      signal: null,
      stdout: Buffer.from(stdout),
      stderr: Buffer.alloc(0),
    };
  },
}));
let argv: string[], exit: typeof process.exitCode;
let log: ReturnType<typeof vi.spyOn>;
const adapter = "/workspace/src/server/team-benchmark.ts";
beforeEach(() => {
  vi.resetModules();
  argv = process.argv;
  exit = process.exitCode;
  process.argv = [argv[0]!, "/run/team-public-checks.mjs"];
  state.files.clear();
  state.commands = [];
  state.boundary = "scan";
  state.sessionMarker = true;
  state.files.set(
    adapter,
    Buffer.from(
      'import { schema } from "../domain/booking"; export const control = schema;',
    ),
  );
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
});
afterEach(() => {
  process.argv = argv;
  process.exitCode = exit;
  vi.restoreAllMocks();
});
const run = () =>
  import("../../scripts/experiments/agent/team-public-checks.mjs");
const output = () => log.mock.calls.flat().join("\n");

describe("confined public checker orchestration with inert process/filesystem seams", () => {
  it.each([
    { flags: [] },
    { flags: ["--quick"] },
    { flags: ["--interface-only"] },
  ])(
    "blocks dynamic imports before candidate execution: %j",
    async ({ flags }) => {
      process.argv.push(...flags);
      state.files.set(
        adapter,
        Buffer.from('export const load = () => import("../domain/booking");'),
      );
      await run();
      expect(process.exitCode).toBe(1);
      expect(output()).toContain("PUBLIC_READINESS BLOCKED");
      expect(state.commands.map((args) => args[0])).toEqual([
        "/run/team-public-boundary.mjs",
      ]);
      expect(
        vi
          .mocked(process.stdout.write)
          .mock.calls.map(([chunk]) => String(chunk))
          .join("\n"),
      ).toContain("DYNAMIC_IMPORT_USE_STATIC_IMPORT");
    },
  );
  it("allows static imports through the full public pipeline", async () => {
    await run();
    expect(process.exitCode).toBe(0);
    expect(output()).toContain("PUBLIC_READINESS READY");
    expect(state.commands).toHaveLength(6);
    expect(state.commands[0]![0]).toBe("/run/team-public-boundary.mjs");
    expect(state.commands[1]).toContain("/run/team-public-session.mjs");
    expect(state.commands[4]).toContain("build");
  });
  it.each(["missing-marker", "nonzero"])(
    "refuses boundary %s even if the other completion signal succeeds",
    async (mode) => {
      state.boundary = mode;
      await run();
      expect(process.exitCode).toBe(1);
      expect(output()).toContain("PUBLIC_READINESS BLOCKED");
      expect(state.commands).toHaveLength(1);
    },
  );
  it("checks proposed adapter bytes without replacing the current source", async () => {
    const original = state.files.get(adapter);
    state.files.set(
      "/work/proposed.ts",
      Buffer.from('export const load = () => import("../domain/booking");'),
    );
    process.argv.push(
      "--interface-only",
      "--proposed-adapter",
      "/work/proposed.ts",
    );
    await run();
    expect(process.exitCode).toBe(1);
    expect(state.files.get(adapter)).toEqual(original);
    expect(state.commands).toHaveLength(1);
  });
  it("retains the candidate early-exit completion-marker guard", async () => {
    state.sessionMarker = false;
    await run();
    expect(process.exitCode).toBe(1);
    expect(output()).toContain("PUBLIC_READINESS BLOCKED");
    expect(state.commands).toHaveLength(2);
  });
});
