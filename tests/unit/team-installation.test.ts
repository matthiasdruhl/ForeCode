import { afterEach, describe, expect, it } from "vitest";
import {
  chmod,
  link,
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { inspectTeamInstallation } from "../../scripts/evaluator/booking-v1/team-installation";
import { authorizationInstrumentationDigest } from "../../scripts/evaluator/booking-v1/team-authorization";
import {
  syntheticOracleBytes,
  teamGradeData,
} from "../support/team-grade-data";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
async function fixture() {
  const parent = await realpath(
    await mkdtemp(path.join(tmpdir(), "forecode-team-package-unit-")),
  );
  temporary.push(parent);
  const root = path.join(parent, "synthetic-package");
  await mkdir(root, { mode: 0o700 });
  const { profile } = teamGradeData();
  const manifest = path.join(root, "manifest.json"),
    oracle = path.join(root, "oracle.mjs");
  await writeFile(
    manifest,
    JSON.stringify({
      schemaVersion: "booking-team-oracle-installation.v1",
      profile,
    }),
    { mode: 0o400 },
  );
  await writeFile(oracle, syntheticOracleBytes, { mode: 0o400 });
  return {
    parent,
    root,
    manifest,
    oracle,
    profile,
    inspect: () => inspectTeamInstallation(root, profile, process.getuid!()),
  };
}
describe("private-installation custody using inert synthetic files, never importing a suite", () => {
  it("checks exact immutable source/profile bytes without installing or executing them", async () => {
    const data = await fixture();
    expect((await data.inspect()).oracleSha256).toBe(
      data.profile.testSuiteSha256,
    );
  });
  it("pins additive case instrumentation in the same immutable two-file package", async () => {
    const data = await fixture();
    const authorization = {
      schemaVersion: "booking-team-authorization-instrumentation.v1",
      semanticsSha256: "a".repeat(64),
      cases: [{ caseId: "synthetic-case", checkId: "team-permissions-domain" }],
    };
    await chmod(data.manifest, 0o600);
    await writeFile(
      data.manifest,
      JSON.stringify({
        schemaVersion: "booking-team-oracle-installation.v1",
        profile: data.profile,
        authorization,
      }),
    );
    await chmod(data.manifest, 0o400);
    expect(await data.inspect()).toMatchObject({
      authorizationInstrumentationSha256:
        authorizationInstrumentationDigest(authorization),
    });
    await chmod(data.manifest, 0o600);
    await writeFile(
      data.manifest,
      JSON.stringify({
        schemaVersion: "booking-team-oracle-installation.v1",
        profile: data.profile,
        authorization: {
          ...authorization,
          cases: [...authorization.cases, ...authorization.cases],
        },
      }),
    );
    await chmod(data.manifest, 0o400);
    await expect(data.inspect()).rejects.toThrow();
  });
  it.each([
    "changed-source",
    "wrong-profile",
    "extra-file",
    "writable-file",
    "public-directory",
    "symlink",
    "hardlink",
    "missing",
    "wrong-owner",
  ])("refuses %s", async (defect) => {
    const data = await fixture();
    if (defect === "changed-source") {
      await chmod(data.oracle, 0o600);
      await writeFile(data.oracle, "changed inert bytes");
      await chmod(data.oracle, 0o400);
    }
    if (defect === "wrong-profile")
      data.profile.descriptorSha256 = "0".repeat(64);
    if (defect === "extra-file")
      await writeFile(path.join(data.root, "sidecar.mjs"), "");
    if (defect === "writable-file") await chmod(data.oracle, 0o600);
    if (defect === "public-directory") await chmod(data.root, 0o755);
    if (defect === "symlink") {
      await rm(data.oracle);
      await symlink(data.manifest, data.oracle);
    }
    if (defect === "hardlink")
      await link(data.oracle, path.join(data.parent, "oracle-alias"));
    if (defect === "missing") await rm(data.oracle);
    const inspect =
      defect === "wrong-owner"
        ? () =>
            inspectTeamInstallation(
              data.root,
              data.profile,
              process.getuid!() + 1,
            )
        : data.inspect;
    await expect(inspect()).rejects.toThrow();
  });
});
