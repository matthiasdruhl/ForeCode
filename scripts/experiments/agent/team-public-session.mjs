// Public baseline cookie contract and the documented adapter bootstrap only.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const root = process.argv[2];
const load = (name) => import(pathToFileURL(`${root}/${name}`).href);
const origin = "http://127.0.0.1:3006";
const request = () =>
  new Request(origin + "/api/session", { method: "POST", headers: { origin } });
function cookie(response) {
  assert.equal(response.status, 200);
  const value = response.headers.get("set-cookie");
  assert.match(value ?? "", /booking_demo_session=[^;]+/);
  for (const flag of ["HttpOnly", "SameSite=Strict", "Path=/"])
    assert.ok(value.includes(flag));
  return value.split(";")[0];
}
const route = await load("src/app/api/session/route.ts");
const session = cookie(await route.POST(request()));
const runtime = await load("src/server/runtime.ts");
assert.equal(
  (
    await runtime.bookingHttp.collection(
      new Request(origin + "/api/bookings", { headers: { cookie: session } }),
    )
  ).status,
  200,
);
const seed = Object.freeze({
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
});
const { createTeamBenchmark } = await load("src/server/team-benchmark.ts");
const subject = createTeamBenchmark({
  seed,
  now: () => new Date("2026-11-01T00:00:00.000Z"),
  newId: () => "team-booking-0001",
});
cookie(await subject.http(request(), "u-alice"));
