import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { learningEvidenceCli } from "../../scripts/learning/cli";
import { unprovisionedEvidenceSource } from "../../scripts/learning/source";
import { openEvidenceLedger } from "../../scripts/learning/ledger";
import { learningSourceFixture } from "../support/learning-source";
import { t } from "../support/learning";
const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
function output() {
  const stdout: string[] = [],
    stderr: string[] = [];
  return {
    stdout,
    stderr,
    out: (s: string) => {
      stdout.push(s);
    },
    error: (s: string) => {
      stderr.push(s);
    },
  };
}
describe("operator-local learning evidence CLI", () => {
  it("provides honest unconfigured status without reading artifacts or creating an audit", async () => {
    const io = output(),
      deps = {
        ...io,
        source: unprovisionedEvidenceSource,
        ledger: null,
        now: () => t(30),
      };
    expect(await learningEvidenceCli(["--status"], deps)).toBe(2);
    expect(JSON.parse(io.stdout[0]!)).toMatchObject({
      sourceConfigured: false,
      sourceEntries: 0,
      training: "DISABLED",
      execution: "DISABLED",
    });
    expect(await learningEvidenceCli(["--help"], deps)).toBe(0);
    expect(await learningEvidenceCli(["--inspect", "missing"], deps)).toBe(2);
    expect(await learningEvidenceCli(["--admit", "missing"], deps)).toBe(2);
    expect(io.stderr).toEqual([]);
  });
  it.each(
    [
      ["--train"],
      ["--execute"],
      ["--sign"],
      ["--root", "/private/data"],
      ["--synthetic"],
      ["--inspect", "../private"],
      ["--admit", "id", "--force"],
    ].map((args) => ({ args })),
  )(
    "rejects unsafe/unsupported options %j before calling the source",
    async ({ args }) => {
      const io = output();
      const source = {
        configured: true,
        entryCount: 0,
        load: async () => {
          throw new Error("PRIVATE_SENTINEL");
        },
      };
      expect(
        await learningEvidenceCli(args, {
          ...io,
          source,
          ledger: null,
          now: () => t(30),
        }),
      ).toBe(1);
      expect(io.stdout).toEqual([]);
      expect(io.stderr.join("")).not.toContain("PRIVATE_SENTINEL");
    },
  );
  it("inspects, admits and records replay through actual synthetic trust stores without training", async () => {
    const f = await learningSourceFixture(cleanup),
      io = output(),
      root = path.join(f.parent, "ledger");
    await mkdir(root, { mode: 0o700 });
    const source = await f.source(),
      ledger = await openEvidenceLedger({
        root,
        excludedRoots: [f.sourceRoot],
        expectedHead: { sequence: 0, sha256: null },
        mode: "SYNTHETIC",
      });
    const deps = { ...io, source, ledger, now: () => t(30) };
    expect(
      await learningEvidenceCli(["--inspect", "approved-unit"], deps),
    ).toBe(0);
    expect((await ledger.inspect()).entries).toHaveLength(0);
    expect(await learningEvidenceCli(["--admit", "approved-unit"], deps)).toBe(
      0,
    );
    expect(await learningEvidenceCli(["--admit", "approved-unit"], deps)).toBe(
      2,
    );
    const last = JSON.parse(io.stdout.at(-1)!);
    expect(last).toMatchObject({
      status: "REPLAY",
      origin: "SYNTHETIC",
      rewardEligible: false,
      policyUpdated: false,
    });
    expect((await ledger.inspect()).entries).toHaveLength(2);
    expect(io.stdout.join("")).not.toContain("PRIVATE_GRADER_SENTINEL");
    expect(io.stdout.join("")).not.toContain(f.parent);
  });
  it("records blocked inputs and uses a fixed safe error envelope for unexpected loader failures", async () => {
    const f = await learningSourceFixture(cleanup, {
        mutate: (p) => {
          p.comparison = "BLOCKED";
        },
      }),
      io = output(),
      root = path.join(f.parent, "ledger");
    await mkdir(root, { mode: 0o700 });
    const source = await f.source(),
      ledger = await openEvidenceLedger({
        root,
        excludedRoots: [f.sourceRoot],
        expectedHead: { sequence: 0, sha256: null },
        mode: "SYNTHETIC",
      });
    expect(
      await learningEvidenceCli(["--admit", "approved-unit"], {
        ...io,
        source,
        ledger,
        now: () => t(30),
      }),
    ).toBe(2);
    expect(JSON.parse(io.stdout.at(-1)!).rewardEligible).toBe(false);
    expect(
      await learningEvidenceCli(["--admit", "unknown"], {
        ...io,
        source,
        ledger,
        now: () => t(31),
      }),
    ).toBe(2);
    expect((await ledger.inspect()).entries.at(-1)!.record.status).toBe(
      "BLOCKED",
    );
    const exploding = {
      configured: true,
      entryCount: 1,
      load: async () => {
        throw new Error("PRIVATE_SENTINEL host path");
      },
    };
    expect(
      await learningEvidenceCli(["--inspect", "approved-unit"], {
        ...io,
        source: exploding,
        ledger: null,
        now: () => t(30),
      }),
    ).toBe(1);
    expect(io.stderr.join("")).not.toContain("PRIVATE_SENTINEL");
  });
});
