// Public behavior transport only. No oracle expectations or grading authority.
export const rpcLimit = 65536;
export const teamActions = Object.freeze([
  "organizations",
  "resources",
  "memberships",
  "bookings",
  "create-booking",
  "booking",
  "cancel-booking",
  "revoke-membership",
]);
export const teamSeed = Object.freeze({
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
function requireThat(value) {
  if (!value) throw new Error("Invalid behavior RPC.");
}
function keys(value, required, optional = []) {
  requireThat(value && typeof value === "object" && !Array.isArray(value));
  requireThat(
    required.every((key) => Object.hasOwn(value, key)) &&
      Object.keys(value).every((key) =>
        [...required, ...optional].includes(key),
      ),
  );
}
const text = (value, max = 256) =>
  typeof value === "string" && value.length <= max;
const viewer = (value) => value === null || text(value, 128);
function subject(value) {
  requireThat(
    typeof value === "string" &&
      /^[1-9][0-9]{0,2}$/.test(value) &&
      Number(value) <= 128,
  );
}
function request(value) {
  keys(value, ["url", "method", "headers", "body"], ["bodyBase64"]);
  requireThat(
    text(value.url, 2048) &&
      text(value.method, 16) &&
      Array.isArray(value.headers) &&
      value.headers.length <= 32 &&
      value.headers.every(
        (pair) =>
          Array.isArray(pair) &&
          pair.length === 2 &&
          pair.every((item) => text(item, 16384)),
      ) &&
      (value.body === null || text(value.body, 32768)),
  );
  if (value.bodyBase64 !== undefined)
    requireThat(
      value.body === null &&
        text(value.bodyBase64, 44000) &&
        Buffer.from(value.bodyBase64, "base64").toString("base64") ===
          value.bodyBase64,
    );
}
export function parseBehaviorRpc(bytes, team = false) {
  requireThat(
    typeof bytes === "string" && Buffer.byteLength(bytes) <= rpcLimit,
  );
  const input = JSON.parse(bytes);
  requireThat(input && typeof input.op === "string");
  if (input.op === "ping") keys(input, ["op"]);
  else if (input.op === "new-domain") {
    keys(input, ["op"], ["options"]);
    if (input.options !== undefined)
      keys(input.options, [], ["initialBookings"]);
  } else if (input.op === "new-http") {
    keys(input, ["op", "viewer"]);
    requireThat(viewer(input.viewer));
  } else if (input.op === "domain") {
    keys(input, ["op", "subject", "method", "args"]);
    subject(input.subject);
    requireThat(
      [
        "createBooking",
        "listBookings",
        "getBooking",
        "cancelBooking",
        "listResources",
      ].includes(input.method) && Array.isArray(input.args),
    );
    const count = {
      createBooking: 2,
      listBookings: 1,
      getBooking: 2,
      cancelBooking: 2,
      listResources: 0,
    }[input.method];
    requireThat(
      input.args.length === count && (count === 0 || viewer(input.args[0])),
    );
  } else if (input.op === "http") {
    keys(input, ["op", "subject", "method", "args"], ["request"]);
    subject(input.subject);
    requireThat(
      ["collection", "item", "resources"].includes(input.method) &&
        Array.isArray(input.args) &&
        input.args.length === (input.method === "item" ? 1 : 0),
    );
    if (input.method === "resources") requireThat(input.request === undefined);
    else request(input.request);
  } else if (team && input.op === "team-new") keys(input, ["op"], ["seed"]);
  else if (team && input.op === "team-domain") {
    keys(
      input,
      ["op", "subject", "action", "viewer"],
      ["organizationId", "id", "input"],
    );
    subject(input.subject);
    requireThat(teamActions.includes(input.action) && viewer(input.viewer));
    if (input.action !== "organizations")
      requireThat(text(input.organizationId));
    else requireThat(input.organizationId === undefined);
    if (
      ["booking", "cancel-booking", "revoke-membership"].includes(input.action)
    )
      requireThat(text(input.id));
    else requireThat(input.id === undefined);
    if (input.action === "create-booking")
      requireThat(Object.hasOwn(input, "input"));
    else requireThat(input.input === undefined);
  } else if (team && input.op === "team-booking-copy") {
    keys(input, ["op", "subject", "viewer", "organizationId", "id", "title"]);
    subject(input.subject);
    requireThat(
      viewer(input.viewer) &&
        text(input.organizationId) &&
        text(input.id) &&
        text(input.title, 320),
    );
  } else if (team && input.op === "team-http") {
    keys(input, ["op", "subject", "viewer", "request"]);
    subject(input.subject);
    requireThat(viewer(input.viewer));
    request(input.request);
  } else if (team && input.op === "team-concurrent-create") {
    keys(input, ["op", "subject", "operations"]);
    subject(input.subject);
    requireThat(
      Array.isArray(input.operations) &&
        input.operations.length > 0 &&
        input.operations.length <= 16,
    );
    for (const operation of input.operations) {
      keys(operation, ["viewer", "organizationId", "input"]);
      requireThat(viewer(operation.viewer) && text(operation.organizationId));
    }
  } else throw new Error("Unsupported behavior RPC.");
  return input;
}
export function encodeBehaviorReply(value) {
  const bytes = JSON.stringify(value);
  requireThat(
    typeof bytes === "string" && Buffer.byteLength(bytes) <= rpcLimit,
  );
  return bytes;
}
export function decodeBehaviorReply(bytes) {
  requireThat(
    typeof bytes === "string" && Buffer.byteLength(bytes) <= rpcLimit,
  );
  const reply = JSON.parse(bytes);
  const result = Object.hasOwn(reply, "result");
  keys(reply, [result ? "result" : "error"]);
  if (!result) {
    keys(reply.error, ["code"]);
    requireThat(text(reply.error.code, 128));
  }
  // A candidate's result remains untrusted data, even if it says VERIFIED.
  return reply;
}

// Dependencies are reviewed factories supplied only inside the restricted worker.
// Tests inject inert stand-ins; never load candidate modules on the host.
export function createBehaviorDispatcher({
  createBookingService,
  createBookingHttp,
  createTeamBenchmark,
  team = false,
}) {
  const subjects = new Map();
  let next = 0;
  const save = (kind, value) => {
    requireThat(next < 128);
    const id = String(++next);
    subjects.set(id, { kind, value });
    return id;
  };
  const find = (id, kind) => {
    const stored = subjects.get(id);
    requireThat(stored?.kind === kind);
    return stored.value;
  };
  const toRequest = (input) => {
    // Fetch forbids these wire method names at construction. Preserve a genuine
    // Request's URL/headers/body and expose the exact method to the candidate's
    // handler, so its unsupported-method dispatch is observable without a wire
    // server or any new network authority. This does not test a production proxy.
    const method = input.method.toUpperCase();
    const forbidden = ["TRACE", "CONNECT", "TRACK"].includes(method);
    const value = new Request(input.url, {
      method: forbidden ? "POST" : input.method,
      headers: input.headers,
      ...(input.bodyBase64 !== undefined
        ? { body: Buffer.from(input.bodyBase64, "base64") }
        : input.body === null
          ? {}
          : { body: input.body }),
    });
    if (forbidden) Object.defineProperty(value, "method", { value: method });
    return value;
  };
  const responseData = async (response) => {
    requireThat(response instanceof Response);
    const reader = response.body?.getReader();
    const chunks = [];
    let used = 0;
    try {
      if (reader)
        for (;;) {
          const item = await reader.read();
          if (item.done) break;
          used += item.value.byteLength;
          requireThat(used <= 49152);
          chunks.push(Buffer.from(item.value));
        }
    } finally {
      await reader?.cancel().catch(() => {});
      reader?.releaseLock();
    }
    return {
      status: response.status,
      body: Buffer.concat(chunks).toString("utf8"),
      headers: [...response.headers],
    };
  };
  return async (bytes) => {
    try {
      const input = parseBehaviorRpc(bytes, team);
      let result;
      if (input.op === "ping") result = true;
      else if (input.op === "new-domain" || input.op === "new-http") {
        let id = 0;
        const service = createBookingService({
          ...input.options,
          now: () => new Date("2026-11-01T00:00:00Z"),
          newId: () => `oracle-${++id}`,
        });
        result = save(
          input.op === "new-http" ? "http" : "domain",
          input.op === "new-http"
            ? createBookingHttp(service, () => input.viewer)
            : service,
        );
      } else if (input.op === "domain")
        result = await find(input.subject, "domain")[input.method](
          ...input.args,
        );
      else if (input.op === "http")
        result = await responseData(
          await find(input.subject, "http")[input.method](
            ...(input.request ? [toRequest(input.request), ...input.args] : []),
          ),
        );
      else if (input.op === "team-new") {
        requireThat(typeof createTeamBenchmark === "function");
        let id = 0;
        result = save(
          "team",
          await createTeamBenchmark({
            seed: structuredClone(
              input.seed === undefined ? teamSeed : input.seed,
            ),
            now: () => new Date("2026-11-01T00:00:00.000Z"),
            newId: () => `team-booking-${String(++id).padStart(4, "0")}`,
          }),
        );
      } else if (input.op === "team-domain")
        result = await find(input.subject, "team").domain(
          input.action,
          input.viewer,
          input.organizationId,
          input.id,
          input.input,
        );
      else if (input.op === "team-booking-copy") {
        const adapter = find(input.subject, "team");
        const row = await adapter.domain(
          "booking",
          input.viewer,
          input.organizationId,
          input.id,
        );
        const before = structuredClone(row);
        row.booking.title = input.title;
        result = {
          before,
          after: await adapter.domain(
            "booking",
            input.viewer,
            input.organizationId,
            input.id,
          ),
        };
      } else if (input.op === "team-http")
        result = await responseData(
          await find(input.subject, "team").http(
            toRequest(input.request),
            input.viewer,
          ),
        );
      else if (input.op === "team-concurrent-create")
        result = await Promise.all(
          input.operations.map(async (operation) => {
            try {
              return {
                result: await find(input.subject, "team").domain(
                  "create-booking",
                  operation.viewer,
                  operation.organizationId,
                  undefined,
                  operation.input,
                ),
              };
            } catch (error) {
              return {
                error: {
                  code:
                    typeof error?.code === "string" && error.code.length <= 128
                      ? error.code
                      : "BRIDGE_ERROR",
                },
              };
            }
          }),
        );
      return encodeBehaviorReply({ result });
    } catch (error) {
      return encodeBehaviorReply({
        error: {
          code:
            typeof error?.code === "string" && error.code.length <= 128
              ? error.code
              : "BRIDGE_ERROR",
        },
      });
    }
  };
}
