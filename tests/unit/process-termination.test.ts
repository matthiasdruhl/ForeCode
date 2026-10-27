import { describe, expect, it } from "vitest";
import {
  awaitProcessTermination,
  linuxProcessIsTerminated,
} from "../helpers/process-termination";
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
