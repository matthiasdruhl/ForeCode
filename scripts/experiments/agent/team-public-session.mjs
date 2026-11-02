// Public baseline/session checks and public task examples. Guest execution only:
// this module imports candidate source and must never run against it on the host.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const root = process.argv[2];
const interfaceOnly = process.argv.includes("--interface-only");
const behaviorOnly = process.argv.includes("--behavior-only");
const load = (name) => import(pathToFileURL(`${root}/${name}`).href);
const origin = "http://127.0.0.1:3006";
const secureOrigin = "https://127.0.0.1:3006";
const request = (urlOrigin = origin, trustedOrigin = urlOrigin) =>
  new Request(urlOrigin + "/api/session", {
    method: "POST",
    headers: { origin: trustedOrigin },
  });
function cookie(response, secure = false) {
  assert.equal(response.status, 200);
  const value = response.headers.get("set-cookie");
  assert.match(value ?? "", /booking_demo_session=[^;]+/);
  for (const flag of ["HttpOnly", "SameSite=Strict", "Path=/"])
    assert.ok(value.includes(flag));
  if (secure)
    assert.match(
      value,
      /(?:^|;\s*)Secure(?:;|$)/,
      "public HTTPS session cookie must use Secure",
    );
  return value.split(";")[0];
}
if (!interfaceOnly && !behaviorOnly) {
  const route = await load("src/app/api/session/route.ts");
  const session = cookie(await route.POST(request()));
  // The original handler trusts its configured demo origin, independently of
  // the incoming URL scheme. Exercise its existing HTTPS cookie branch too.
  cookie(await route.POST(request(secureOrigin, origin)), true);
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
if (!interfaceOnly && !behaviorOnly) {
  cookie(await subject.http(request(), "u-alice"));
  cookie(await subject.http(request(secureOrigin), "u-alice"), true);
}
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
  // Next decodes route parameters before invoking the original personal route.
  // The required adapter accepts a raw Request URL and must preserve that
  // observable behavior for percent-encoded unreserved ID characters.
  for (const encodedId of ["b%2Da1", "%62-a1"]) {
    const test = await fresh();
    const plainPath = "/api/bookings/b-a1";
    const encodedPath = `/api/bookings/${encodedId}`;
    const label = `public encoded personal booking ID ${encodedId}`;
    const plainResponse = await http(test.subject, "GET", plainPath);
    assert.equal(plainResponse.status, 200, `${label}: plain baseline control`);
    const original = await plainResponse.json();
    assert.equal(original.booking.id, "b-a1");
    assert.equal(original.booking.status, "active");
    const encodedResponse = await http(test.subject, "GET", encodedPath);
    assert.equal(encodedResponse.status, 200, `${label}: GET`);
    assert.deepEqual(await encodedResponse.json(), original, `${label}: GET`);
    const otherOwner = await http(test.subject, "DELETE", encodedPath, "u-bob");
    assert.equal(otherOwner.status, 404, `${label}: personal owner access`);
    assert.deepEqual(
      await (await http(test.subject, "GET", plainPath)).json(),
      original,
      `${label}: denied DELETE leaves the original unchanged`,
    );
    const cancelled = {
      booking: { ...original.booking, status: "cancelled" },
    };
    for (const attempt of ["first", "repeat"]) {
      const response = await http(test.subject, "DELETE", encodedPath);
      assert.equal(response.status, 200, `${label}: ${attempt} DELETE`);
      assert.deepEqual(
        await response.json(),
        cancelled,
        `${label}: ${attempt} DELETE preserves the booking`,
      );
    }
    for (const path of [plainPath, encodedPath]) {
      const response = await http(test.subject, "GET", path);
      assert.equal(response.status, 200, `${label}: cancelled history`);
      assert.deepEqual(await response.json(), cancelled);
    }
  }
  console.log("PUBLIC_BEHAVIOR encoded-personal-booking-id PASS");
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

  // Additional examples come exclusively from the frozen PUBLIC specification.
  // They do not describe, import or infer any private oracle assertion.
  const seedMutations = [
    (s) => s.organizations.push({ ...s.organizations[0] }),
    (s) => s.memberships.push({ ...s.memberships[0] }),
    (s) => (s.memberships[0].role = "superuser"),
    (s) => (s.memberships[0].status = "disabled"),
    (s) => (s.memberships[0].status = "revoked"),
    (s) => (s.memberships[0].role = "admin"),
    (s) => (s.memberships[1].role = "owner"),
    (s) => (s.memberships[0].userId = "u-unknown"),
    (s) => (s.resources[0].organizationId = "team-missing"),
    (s) => s.resources.push({ ...s.resources[0] }),
  ];
  for (const [index, mutate] of seedMutations.entries()) {
    const invalid = structuredClone(seed);
    mutate(invalid);
    await assert.rejects(
      async () =>
        createTeamBenchmark({
          seed: invalid,
          now: () => new Date(0),
          newId: () => "unused",
        }),
      (error) => error?.code === "INVALID_INPUT",
      `public invalid seed ${index} must be rejected before serving with INVALID_INPUT`,
    );
  }
  console.log("PUBLIC_BEHAVIOR invalid-seeds PASS");

  const catalogs = await fresh();
  const redMembers = [
    ...seed.memberships.filter((m) => m.organizationId === "team-red"),
  ].sort((a, b) => a.userId.localeCompare(b.userId));
  const expectedOrganizations = [
    { id: "team-blue", name: "Blue", role: "owner" },
    { id: "team-red", name: "Red", role: "admin" },
  ];
  assert.deepEqual(
    await domain(catalogs.subject, "organizations", "u-bob"),
    { organizations: expectedOrganizations },
    "public organization roles and sorting",
  );
  for (const viewer of ["u-alice", "u-bob", "u-cara"]) {
    assert.deepEqual(
      await domain(catalogs.subject, "resources", viewer),
      { resources: [{ id: "room-red", name: "Red room" }] },
      "public team catalog shape",
    );
    assert.deepEqual(
      await domain(catalogs.subject, "memberships", viewer),
      { memberships: redMembers },
      "public membership shape and sorting",
    );
  }
  for (const [action, key] of [
    ["organizations", "organizations"],
    ["resources", "resources"],
    ["memberships", "memberships"],
  ]) {
    const first = await domain(catalogs.subject, action, "u-bob");
    const original = structuredClone(first);
    Object.assign(first[key][0], {
      name: "tampered",
      role: "owner",
      status: "revoked",
    });
    first[key].splice(0);
    assert.deepEqual(
      await domain(catalogs.subject, action, "u-bob"),
      original,
      `public ${action} must return copies`,
    );
  }
  const externalSeed = structuredClone(seed);
  const seeded = await createTeamBenchmark({
    seed: externalSeed,
    now: () => new Date(0),
    newId: () => "unused",
  });
  externalSeed.organizations[0].name = "tampered";
  externalSeed.resources[0].name = "tampered";
  externalSeed.memberships[0].status = "revoked";
  assert.deepEqual(
    await domain(seeded, "resources"),
    { resources: [{ id: "room-red", name: "Red room" }] },
    "public input seed must be copied",
  );
  console.log("PUBLIC_BEHAVIOR catalogs-and-copies PASS");

  const revoke = await fresh();
  const made = (await create(revoke.subject, slot, "u-cara")).booking;
  for (const viewer of ["u-bob", "u-cara"]) {
    for (const id of ["u-bob", "missing"])
      await fail(
        () =>
          domain(revoke.subject, "revoke-membership", viewer, "team-red", id),
        "FORBIDDEN",
        "public revoke role precedes target",
      );
  }
  await fail(
    () =>
      domain(
        revoke.subject,
        "revoke-membership",
        "u-alice",
        "team-red",
        "u-alice",
      ),
    "FORBIDDEN",
    "public immutable owner",
  );
  const revoked = await domain(
    revoke.subject,
    "revoke-membership",
    "u-alice",
    "team-red",
    "u-cara",
  );
  assert.deepEqual(revoked, {
    membership: {
      organizationId: "team-red",
      userId: "u-cara",
      role: "member",
      status: "revoked",
    },
  });
  assert.deepEqual(
    await domain(
      revoke.subject,
      "revoke-membership",
      "u-alice",
      "team-red",
      "u-cara",
    ),
    revoked,
    "public repeated revocation",
  );
  await fail(
    () => create(revoke.subject, slot),
    "CONFLICT",
    "public revocation preserves conflict occupancy",
  );
  assert.equal(revoke.allocated(), 1);
  const cancelled = await domain(
    revoke.subject,
    "cancel-booking",
    "u-bob",
    "team-red",
    made.id,
  );
  const cancelledSnapshot = structuredClone(cancelled);
  assert.deepEqual(
    cancelled.booking,
    { ...made, status: "cancelled" },
    "public cancel another creator preserves fields",
  );
  await domain(
    revoke.subject,
    "revoke-membership",
    "u-alice",
    "team-red",
    "u-bob",
  );
  await fail(
    () =>
      domain(revoke.subject, "cancel-booking", "u-bob", "team-red", made.id),
    "NOT_FOUND",
    "public cancellation retry checks current membership",
  );
  assert.deepEqual(
    await domain(
      revoke.subject,
      "cancel-booking",
      "u-alice",
      "team-red",
      made.id,
    ),
    cancelled,
  );
  const returned = await domain(
    revoke.subject,
    "booking",
    "u-alice",
    "team-red",
    made.id,
  );
  returned.booking.title = "tampered";
  assert.deepEqual(
    await domain(revoke.subject, "booking", "u-alice", "team-red", made.id),
    cancelledSnapshot,
    "public booking return must be copied",
  );
  await domain(
    revoke.subject,
    "revoke-membership",
    "u-bob",
    "team-blue",
    "u-cara",
  );
  assert.deepEqual(
    await domain(revoke.subject, "organizations", "u-cara"),
    { organizations: [] },
    "public user with no active teams",
  );
  console.log("PUBLIC_BEHAVIOR revocation-retries-and-occupancy PASS");

  const httpCase = await fresh();
  const responseError = async (response, status, code, label) => {
    assert.equal(response.status, status, label);
    assert.equal(response.headers.get("cache-control"), "no-store", label);
    const value = await response.json();
    assert.deepEqual(Object.keys(value), ["error"], label);
    assert.deepEqual(
      Object.keys(value.error).sort(),
      ["code", "message"],
      label,
    );
    assert.equal(value.error.code, code, label);
    assert.equal(typeof value.error.message, "string", label);
  };
  for (const [path, expected] of [
    ["/api/organizations", { organizations: expectedOrganizations }],
    [
      "/api/organizations/team-red/resources",
      { resources: [{ id: "room-red", name: "Red room" }] },
    ],
    ["/api/organizations/team-red/memberships", { memberships: redMembers }],
  ]) {
    const response = await http(httpCase.subject, "GET", path, "u-bob");
    assert.equal(response.status, 200, `public GET ${path}`);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), expected);
  }
  for (const method of [
    "PUT",
    "PATCH",
    "OPTIONS",
    "HEAD",
    "TRACE",
    "CONNECT",
    "TRACK",
  ]) {
    const request = new Request(origin + "/api/organizations/%ZZ/bookings", {
      method: "GET",
    });
    Object.defineProperty(request, "method", { value: method });
    assert.equal(
      (await httpCase.subject.http(request, null)).status,
      405,
      "public unsupported method precedes all validation",
    );
  }
  for (const [path, viewer, headers, status, code] of [
    ["/api/organizations/%ZZ/bookings", null, {}, 400, "INVALID_INPUT"],
    [teamPath, null, {}, 401, "UNAUTHENTICATED"],
    ["/api/organizations/team-blue/bookings", "u-alice", {}, 404, "NOT_FOUND"],
    [
      "/api/organizations/%ZZ/bookings",
      null,
      { origin: "https://untrusted.invalid" },
      400,
      "INVALID_INPUT",
    ],
  ]) {
    await responseError(
      await http(httpCase.subject, "POST", path, viewer, {}, headers),
      status,
      code,
      "public mutation precedence",
    );
  }
  await responseError(
    await http(httpCase.subject, "DELETE", teamPath + "/missing", "u-cara"),
    403,
    "FORBIDDEN",
    "public role before missing target",
  );
  console.log("PUBLIC_BEHAVIOR http-routes-and-precedence PASS");

  const utf8Control = new TextEncoder().encode(
    JSON.stringify({ ...slot, title: "BAD_UTF8" }),
  );
  const utf8Offset = new TextDecoder().decode(utf8Control).indexOf("BAD_UTF8");
  const malformedUtf8 = new Uint8Array([
    ...utf8Control.slice(0, utf8Offset),
    0xc3,
    0x28,
    ...utf8Control.slice(utf8Offset + 8),
  ]);
  for (const [body, contentType] of [
    ["{", "application/json"],
    ["", "application/json"],
    [JSON.stringify(slot), "text/plain"],
    [malformedUtf8, "application/json"],
    [JSON.stringify(slot).padEnd(8193, " "), "application/json"],
  ]) {
    const test = await fresh();
    const response = await test.subject.http(
      new Request(origin + teamPath, {
        method: "POST",
        headers: { origin, "content-type": contentType },
        body,
      }),
      "u-alice",
    );
    await responseError(
      response,
      400,
      "INVALID_INPUT",
      "public malformed wire body",
    );
    assert.equal(test.allocated(), 0);
    assert.deepEqual(await domain(test.subject, "bookings"), { bookings: [] });
  }
  for (const input of [
    { ...slot, role: "owner" },
    { ...slot, createdBy: "u-bob" },
    { ...slot, resourceId: "room-blue" },
    { ...slot, resourceId: "room-1" },
    { ...slot, startAt: "2026-11-10T13:00:00+00:00" },
    { ...slot, endAt: slot.startAt },
  ]) {
    const test = await fresh();
    await responseError(
      await http(test.subject, "POST", teamPath, "u-alice", input),
      400,
      "INVALID_INPUT",
      "public strict create validation",
    );
    assert.equal(test.allocated(), 0);
  }
  const exact = await fresh();
  const exactResponse = await exact.subject.http(
    new Request(origin + teamPath, {
      method: "POST",
      headers: { origin, "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(slot).padEnd(8192, " "),
    }),
    "u-alice",
  );
  assert.equal(exactResponse.status, 201, "public exactly 8192 bytes accepted");
  const item = (await exactResponse.json()).booking;
  await responseError(
    await http(
      exact.subject,
      "GET",
      `/api/organizations/team-blue/bookings/${item.id}`,
      "u-bob",
    ),
    404,
    "NOT_FOUND",
    "public wrong-team record",
  );
  await responseError(
    await http(exact.subject, "GET", `/api/bookings/${item.id}`),
    404,
    "NOT_FOUND",
    "public team record hidden from personal route",
  );
  const ignored = await http(
    exact.subject,
    "DELETE",
    `${teamPath}/${item.id}`,
    "u-alice",
    { ignored: "body" },
    { "content-type": "text/plain" },
  );
  assert.equal(
    ignored.status,
    200,
    "public DELETE ignores body and content type",
  );
  assert.deepEqual((await ignored.json()).booking, {
    ...item,
    status: "cancelled",
  });
  console.log("PUBLIC_BEHAVIOR wire-input-and-isolation PASS");
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
