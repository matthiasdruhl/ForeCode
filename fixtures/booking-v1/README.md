# Booking v1 — controlled baseline A

Newly authored during the hackathon from the external baseline requirements, not copied from planning code. This package is the agent-visible experimental subject. Forecode's controller, evaluator and protected artifacts belong outside it.

## Standalone development

Use Node 24.

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run build
npm run start
```

The local demo binds 127.0.0.1:3006. From the parent workspace, use `npm run dev --workspace @forecode/booking-v1` instead. If changing the port, explicitly set `BOOKING_DEMO_ORIGIN` to the exact HTTP loopback origin as well as passing `--port`. Public origins are rejected by this fixture's runtime configuration.

## Behavior

- Synthetic users: Alice, Bob and Cara. The domain service accepts a trusted viewer identity from its caller. Anonymous/unknown viewers fail with `UNAUTHENTICATED`.
- Resource catalog: room-1 and room-2. Alice initially has b-a1 in room-1 on November 10, 2026, 10:00–11:00 UTC; Bob has b-b1 in room-2 at the same time. Cara has none.
- Create/list/get/cancel enforce owner access inside service operations. Other-owner and missing records both produce `NOT_FOUND`. Only the server assigns owner, ID, status and creation time.
- Active bookings use half-open UTC intervals, so adjacent bookings are allowed. The store performs conflict detection and insertion synchronously and atomically within one process. Cancellation is idempotent and frees the slot.
- Lists include active/cancelled status and sort by start time, then ID. Reads return copies.

HTTP: `GET/POST /api/bookings`, `GET/DELETE /api/bookings/:id`, public `GET /api/resources`. Business failures map to 400/409/401/404; malformed/oversized JSON and cross-origin mutations are rejected. Untrusted identity headers and extra ownership fields grant no authority.

`POST /api/session` is an explicit local demo bootstrap for **synthetic Alice only**. It issues an opaque, HTTP-only, SameSite=Strict session cookie mapped by the server. This is not production authentication, arbitrary user registration, or a multi-user deployment. State resets when the process restarts; the runtime uses an injected fixed clock and ID counter for reproducibility.

## Experimental boundaries

Baseline A deliberately keeps normal owner checks in the service. No speculative team policy boundary has been introduced. A future B must retain the same current behavior and pass the same independent checks; no superiority is asserted for either design.

Only `tests/visible/` travels with this subject. The independent public **baseline** oracle is outside the package in the parent controller. No hidden future holdout is authored or exposed here. Never mount the parent Forecode checkout, environment configuration, evaluator source, host credentials or protected outputs into an agent workspace.

These development tests do not establish microVM containment, independent grading of an agent-modified tree, model benefit or a completed architecture experiment. Package dependencies retain their upstream licenses; repository-level licensing remains an owner release decision.
