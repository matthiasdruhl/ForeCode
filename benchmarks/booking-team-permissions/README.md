# Proposed team-permissions task

The exact versioned task is [task.proposal.json](task.proposal.json): its `specification` contains the complete API, validation order, seed representation and invariants; its structured permission/acceptance rows are validated by `src/lib/experiment/future-task.ts`. The 20 role/action criteria plus seven invariant IDs fit the unchanged ScenarioV1 acceptance bound. This is public, newly authored event work, a **visible proposed benchmark**, never a blind holdout. It implements no team feature in booking-v1.

## Proposed permissions — owner review required

| Current role in target team | View bookings/resources/memberships | Create team booking | Cancel any team booking    | Revoke another nonowner |
| --------------------------- | ----------------------------------- | ------------------- | -------------------------- | ----------------------- |
| Owner                       | Yes                                 | Yes                 | Yes                        | Yes                     |
| Admin                       | Yes                                 | Yes                 | Yes                        | No                      |
| Member                      | Yes                                 | Yes                 | No, including own creation | No                      |
| Nonmember                   | No                                  | No                  | No                         | No                      |
| Revoked                     | No                                  | No                  | No                         | No                      |

Owner/admin authority is limited to that organization and never grants access to another user's personal bookings. Organization owners cannot be revoked. Current membership is checked even on repeated cancellation. Revocation preserves records and conflicts. Only an operator-controlled seed creates organizations and memberships; no public creation/login/invitation/role-editing service is requested.

These are **proposals**, resolving previously unspecified behavior explicitly. Owner decisions before freeze: approve member creation and denial of creator cancellation; approve owner-only nonowner revocation; approve seed-only organization creation and immutable owners; approve separate team resources, membership visibility and the exact endpoint/error/validation contract. V1 supports these choices only. A different decision requires a reviewed version of the task and validator, with a new commitment; changing JSON is not approval. Natural-language review remains necessary: the validator checks structured decisions, coverage and conflicting criterion outcomes, not arbitrary prose for logical consistency.

## Deterministic contract

Synthetic identities retain `u-alice`, `u-bob`, `u-cara`. Red: Alice owner, Bob admin, Cara member. Blue: Bob owner, Cara admin, Alice absent. Team resources are `room-red` and `room-blue`. Personal rooms/seed bookings stay unchanged. Creation clock is `2026-11-01T00:00:00.000Z`; team IDs start at `team-booking-0001` per fresh seed. No runtime wall-clock dependence is permitted. The proposal specifies trusted session-resolver injection for multiuser HTTP tests while keeping the existing Alice-only public demo bootstrap.

Public team routes are `/api/organizations`, organization-specific resources/memberships/bookings, booking GET/DELETE and owner-only membership DELETE. Personal routes retain exact shapes and owner-only behavior. Team records carry organization and creator identities assigned by the server. Inaccessible teams and wrong-team records return indistinguishable 404s; accessible-team role denial is 403; authentication is 401; invalid input is 400; overlap is 409. Exact response fields, mutation ordering, sorting, idempotency, malformed-input rules and half-open UTC atomic conflicts are in the JSON specification. Internal modules, classes, file organization and architecture are unconstrained.

## Same task for A and B

`futureTaskDigest` hashes the entire validated JSON value using the existing canonical digest. `futureTaskRequest` produces a bounded ScenarioV1 request pinning that full task document. Both agents must receive the identical complete JSON bytes/value and common prompt, not merely a digest or an acceptance outline. `validateFutureStudy` checks that scenario IDs, request and all acceptance IDs match it. The old scenario commitment remains intact and transitively pins the complete task through its digest.

The owner independently reviews the exact task **before selection/preparation**, together with the private evaluator and protocol. A generated hash or local timestamp is only a content commitment. See [operator preparation and custody](../../docs/BOOKING-FUTURE-EVALUATION.md). No task approval, private oracle, isolated behavioral evaluation or genuine experiment is supplied here.
