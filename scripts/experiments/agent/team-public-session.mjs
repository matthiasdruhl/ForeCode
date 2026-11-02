// Public baseline/session checks and public task examples. Guest execution only:
// this module imports candidate source and must never run against it on the host.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const root = process.argv[2];
const interfaceOnly = process.argv.includes("--interface-only");
const behaviorOnly = process.argv.includes("--behavior-only");
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
if (!interfaceOnly && !behaviorOnly) {
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
}
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
assert.equal(
  typeof createTeamBenchmark,
  "function",
  "public createTeamBenchmark export required",
);
async function fresh() {
  let allocated = 0;
  const subject = await createTeamBenchmark({
    seed: structuredClone(seed),
    now: () => new Date("2026-11-01T00:00:00.000Z"),
    newId: () => `team-booking-${String(++allocated).padStart(4, "0")}`,
  });
  return { subject, allocated: () => allocated };
}
const { subject } = await fresh();
assert.ok(
  subject &&
    typeof subject.domain === "function" &&
    typeof subject.http === "function",
  "public domain/http interface required",
);
if (!interfaceOnly && !behaviorOnly)
  cookie(await subject.http(request(), "u-alice"));
if (behaviorOnly) {
  // All examples below derive from the visible task and reviewed baseline. They
  // do not import the protected oracle or assert anything about hidden failures.
  const slot = {
    resourceId: "room-red",
    title: "Public team booking",
    startAt: "2026-11-10T13:00:00Z",
    endAt: "2026-11-10T14:00:00Z",
  };
  const domain = (
    instance,
    action,
    viewer = "u-alice",
    org = "team-red",
    id,
    input,
  ) => instance.domain(action, viewer, org, id, input);
  const create = (instance, input, viewer = "u-alice") =>
    domain(instance, "create-booking", viewer, "team-red", undefined, input);
  const fail = async (operation, code, message) => {
    await assert.rejects(
      async () => operation(),
      (error) => error?.code === code,
      message,
    );
  };
  const http = (
    instance,
    method,
    path,
    viewer = "u-alice",
    input,
    headers = {},
  ) =>
    instance.http(
      new Request(origin + path, {
        method,
        headers: { origin, "content-type": "application/json", ...headers },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      }),
      viewer,
    );
  const teamPath = "/api/organizations/team-red/bookings";
  const invalidTitles = [
    "",
    " ",
    "x".repeat(121),
    "A\u0000B",
    "A\u001fB",
    "A\u007fB",
    "A\u200bB",
    "A\ufeffB",
  ];
  for (const title of invalidTitles) {
    for (const transport of ["domain", "http"]) {
      const test = await fresh();
      const input = { ...slot, title };
      const label = `public baseline title validation ${transport} ${JSON.stringify(title)}`;
      if (transport === "domain")
        await fail(() => create(test.subject, input), "INVALID_INPUT", label);
      else {
        const response = await http(
          test.subject,
          "POST",
          teamPath,
          "u-alice",
          input,
        );
        assert.equal(response.status, 400, label);
        assert.deepEqual(
          await response.json(),
          {
            error: {
              code: "INVALID_INPUT",
              message: "Check the resource, title and UTC time interval.",
            },
          },
          label,
        );
      }
      assert.equal(
        test.allocated(),
        0,
        `${label}: rejected create must not allocate an ID`,
      );
      assert.deepEqual(
        await domain(test.subject, "bookings"),
        { bookings: [] },
        `${label}: rejected create must not mutate`,
      );
      const accepted = await create(test.subject, slot);
      assert.equal(
        accepted.booking.id,
        "team-booking-0001",
        `${label}: valid same-slot recovery`,
      );
    }
  }
  console.log("PUBLIC_BEHAVIOR baseline-title-validation PASS");

  for (const viewer of ["u-alice", "u-bob", "u-cara"]) {
    const test = await fresh();
    const result = await create(test.subject, slot, viewer);
    assert.deepEqual(result.booking, {
      id: "team-booking-0001",
      organizationId: "team-red",
      createdBy: viewer,
      ...slot,
      startAt: "2026-11-10T13:00:00.000Z",
      endAt: "2026-11-10T14:00:00.000Z",
      status: "active",
      createdAt: "2026-11-01T00:00:00.000Z",
    });
    if (viewer === "u-cara") {
      await fail(
        () =>
          domain(
            test.subject,
            "cancel-booking",
            viewer,
            "team-red",
            result.booking.id,
          ),
        "FORBIDDEN",
        "public member cannot cancel own creation",
      );
      await fail(
        () =>
          domain(test.subject, "cancel-booking", viewer, "team-red", "missing"),
        "FORBIDDEN",
        "public role decision precedes target lookup",
      );
    } else {
      const cancelled = await domain(
        test.subject,
        "cancel-booking",
        viewer,
        "team-red",
        result.booking.id,
      );
      assert.equal(cancelled.booking.status, "cancelled");
      assert.deepEqual(
        await domain(
          test.subject,
          "cancel-booking",
          viewer,
          "team-red",
          result.booking.id,
        ),
        cancelled,
      );
      assert.equal(
        (await create(test.subject, slot)).booking.id,
        "team-booking-0002",
      );
    }
  }
  const conflicts = await fresh();
  const concurrent = await Promise.allSettled([
    Promise.resolve().then(() => create(conflicts.subject, slot, "u-alice")),
    Promise.resolve().then(() => create(conflicts.subject, slot, "u-bob")),
  ]);
  assert.equal(
    concurrent.filter((row) => row.status === "fulfilled").length,
    1,
  );
  const rejected = concurrent.find((row) => row.status === "rejected");
  assert.equal(rejected?.reason?.code, "CONFLICT");
  assert.equal(
    conflicts.allocated(),
    1,
    "public conflicting creates must not consume an ID",
  );
  assert.equal(
    (
      await create(conflicts.subject, {
        ...slot,
        startAt: slot.endAt,
        endAt: "2026-11-10T15:00:00Z",
      })
    ).booking.id,
    "team-booking-0002",
  );
  console.log("PUBLIC_BEHAVIOR roles-conflicts-cancellation PASS");

  const access = await fresh();
  await fail(
    () => domain(access.subject, "bookings", null),
    "UNAUTHENTICATED",
    "public anonymous identity",
  );
  await fail(
    () => domain(access.subject, "bookings", "u-unknown"),
    "UNAUTHENTICATED",
    "public unknown identity",
  );
  await fail(
    () => domain(access.subject, "bookings", "u-alice", "team-blue"),
    "NOT_FOUND",
    "public cross-team isolation",
  );
  await fail(
    () =>
      domain(
        access.subject,
        "revoke-membership",
        "u-bob",
        "team-red",
        "u-cara",
      ),
    "FORBIDDEN",
    "public admin cannot revoke",
  );
  await domain(
    access.subject,
    "revoke-membership",
    "u-alice",
    "team-red",
    "u-cara",
  );
  await fail(
    () => domain(access.subject, "bookings", "u-cara"),
    "NOT_FOUND",
    "public revocation applies on next operation",
  );
  const forged = await http(access.subject, "GET", teamPath, null, undefined, {
    "x-user-id": "u-alice",
    "x-role": "owner",
  });
  assert.equal(
    forged.status,
    401,
    "public headers cannot supply trusted identity",
  );
  const catalog = await http(access.subject, "GET", "/api/resources", null);
  assert.deepEqual((await catalog.json()).resources, [
    { id: "room-1", name: "Room 1" },
    { id: "room-2", name: "Room 2" },
  ]);
  const personal = await http(
    access.subject,
    "GET",
    "/api/bookings",
    "u-alice",
  );
  const personalRows = (await personal.json()).bookings;
  assert.ok(
    personalRows.length > 0 &&
      personalRows.every(
        (row) =>
          row.ownerId === "u-alice" && !Object.hasOwn(row, "organizationId"),
      ),
    "public personal baseline privacy and shape",
  );
  console.log("PUBLIC_BEHAVIOR identity-isolation-revocation PASS");
}
// A candidate may terminate its importing process with exit(0). The parent
// must observe completion of these public assertions as well as a zero exit.
process.stdout.write(
  behaviorOnly
    ? "PUBLIC_BEHAVIOR_CHECK_COMPLETED\n"
    : interfaceOnly
      ? "PUBLIC_INTERFACE_CHECK_COMPLETED\n"
      : "PUBLIC_SESSION_CHECK_COMPLETED\n",
);
