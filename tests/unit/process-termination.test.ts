import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import {
  awaitProcessTermination,
  linuxProcessIsTerminated,
} from "../helpers/process-termination";
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(readFile).mockReset();
});
describe("Linux process-state assertion — synthetic kernel observations only", () => {
  it.each(["R", "S", "D", "T", "t", "W", "K", "P", "I"])(
    "keeps %s processes live",
    (state) => {
      expect(
        linuxProcessIsTerminated(
          `123 (a process) with parentheses) ${state} 1 2 3`,
        ),
      ).toBe(false);
    },
  );
  it.each(["Z", "X", "x"])("recognizes %s as terminated", (state) => {
    expect(linuxProcessIsTerminated(`123 (node) ${state} 1 2 3`)).toBe(true);
  });
  it("fails closed on malformed observations and unsafe process IDs", async () => {
    for (const value of ["", "123 node Z", "123 (node) ? 1", "123 (node)"])
      expect(() => linuxProcessIsTerminated(value)).toThrow();
    for (const pid of [0, 1, -1, NaN])
      await expect(awaitProcessTermination(pid)).rejects.toThrow("identity");
  });
});

describe("Linux process-exit races — synthetic kernel errors", () => {
  function linuxProbe() {
    const kill = vi.fn(() => true);
    vi.stubGlobal("process", { ...process, platform: "linux", kill });
    return kill;
  }
  it.each(["ENOENT", "ESRCH"])(
    "accepts %s only when the process disappears during proc stat reading",
    async (code) => {
      const kill = linuxProbe();
      vi.mocked(readFile).mockRejectedValueOnce(
        Object.assign(new Error("process disappeared during read"), { code }),
      );
      await expect(awaitProcessTermination(123)).resolves.toBeUndefined();
      expect(kill).toHaveBeenCalledWith(123, 0);
      expect(readFile).toHaveBeenCalledWith("/proc/123/stat", "utf8");
    },
  );
  it.each(["EACCES", "EPERM", "EIO"])(
    "preserves %s proc stat errors",
    async (code) => {
      linuxProbe();
      const error = Object.assign(new Error("unconfirmed process state"), {
        code,
      });
      vi.mocked(readFile).mockRejectedValueOnce(error);
      await expect(awaitProcessTermination(123)).rejects.toBe(error);
    },
  );
  it("keeps a live/stopped process unconfirmed through the bounded deadline", async () => {
    linuxProbe();
    vi.mocked(readFile).mockResolvedValue("123 (node) T 1 2 3");
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => (now += 1000));
    await expect(awaitProcessTermination(123)).rejects.toThrow("remains live");
  });
  it("does not read proc after an ESRCH existence probe and preserves permission failures", async () => {
    const kill = linuxProbe();
    kill.mockImplementationOnce(() => {
      throw Object.assign(new Error("gone"), { code: "ESRCH" });
    });
    vi.mocked(readFile).mockClear();
    await expect(awaitProcessTermination(123)).resolves.toBeUndefined();
    expect(readFile).not.toHaveBeenCalled();
    const denied = Object.assign(new Error("permission denied"), {
      code: "EPERM",
    });
    kill.mockImplementationOnce(() => {
      throw denied;
    });
    await expect(awaitProcessTermination(123)).rejects.toBe(denied);
  });
});
