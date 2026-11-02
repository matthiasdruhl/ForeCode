// Diagnostic only: execute exclusively in a newly confined network-off guest.
// Public baseline title semantics; no private oracle source or input is used.
import { cp, mkdir, symlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
await mkdir("/work/subject");
await cp("/workspace", "/work/subject", { recursive: true });
await symlink("/toolchain/node_modules", "/work/subject/node_modules");
const { createTeamBenchmark } = await import(
  pathToFileURL("/work/subject/src/server/team-benchmark.ts").href
);
const seed = {
  organizations: [
    { id: "team-red", name: "Red" },
    { id: "team-blue", name: "Blue" },
  ],
  memberships: [
    {
      organizationId: "team-red",
      userId: "u-alice",
      role: "owner",
      status: "active",
    },
    {
      organizationId: "team-red",
      userId: "u-bob",
      role: "admin",
      status: "active",
    },
    {
      organizationId: "team-red",
      userId: "u-cara",
      role: "member",
      status: "active",
    },
    {
      organizationId: "team-blue",
      userId: "u-bob",
      role: "owner",
      status: "active",
    },
    {
      organizationId: "team-blue",
      userId: "u-cara",
      role: "admin",
      status: "active",
    },
  ],
  resources: [
    { id: "room-red", name: "Red room", organizationId: "team-red" },
    { id: "room-blue", name: "Blue room", organizationId: "team-blue" },
  ],
};
const slot = {
  resourceId: "room-red",
  title: "Public same-slot recovery",
  startAt: "2026-11-10T13:00:00Z",
  endAt: "2026-11-10T14:00:00Z",
};
const observations = [];
for (const [label, title] of [
  ["Cc-NUL", "A\u0000B"],
  ["Cf-ZWSP", "A\u200bB"],
]) {
  for (const transport of ["domain", "http"]) {
    let allocated = 0;
    const subject = await createTeamBenchmark({
      seed: structuredClone(seed),
      now: () => new Date("2026-11-01T00:00:00.000Z"),
      newId: () => `team-booking-${String(++allocated).padStart(4, "0")}`,
    });
    let invalid;
    if (transport === "domain") {
      try {
        invalid = {
          returned: await subject.domain(
            "create-booking",
            "u-alice",
            "team-red",
            undefined,
            { ...slot, title },
          ),
        };
      } catch (error) {
        invalid = { errorCode: error.code };
      }
    } else {
      const response = await subject.http(
        new Request(
          "http://127.0.0.1:3006/api/organizations/team-red/bookings",
          {
            method: "POST",
            headers: {
              origin: "http://127.0.0.1:3006",
              "content-type": "application/json",
            },
            body: JSON.stringify({ ...slot, title }),
          },
        ),
        "u-alice",
      );
      invalid = { status: response.status, returned: await response.json() };
    }
    const afterInvalid = {
      allocated,
      state: await subject.domain("bookings", "u-alice", "team-red"),
    };
    let recovery;
    try {
      recovery = {
        returned: await subject.domain(
          "create-booking",
          "u-alice",
          "team-red",
          undefined,
          slot,
        ),
      };
    } catch (error) {
      recovery = { errorCode: error.code };
    }
    observations.push({ label, transport, invalid, afterInvalid, recovery });
  }
}
console.log(
  JSON.stringify({
    schemaVersion: "public-title-reproduction.v1",
    pid: process.pid,
    uid: process.getuid(),
    observations,
  }),
);
