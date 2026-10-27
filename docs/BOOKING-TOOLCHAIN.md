# Trusted booking tooling preparation

A real host-side tooling build, offline dependency smoke, installed-byte inventory and image export have now succeeded. This is preparation for the protected grader. Booking grading, guest lifecycle acceptance, guest-to-host containment, coding-agent execution and inference remain **NOT_RUN**. No `sbx` environment was started, installed, changed or stopped by this command.

This slice follows M2.3.1/M2.5.1 in the external [pinned planning reference](https://github.com/matthiasdruhl/AgentHarness-Planning/tree/695e68a40b5f5009c9b06b83a1181e18cd6d0223), especially the booking-first runbook, security boundary and canonical contract. Those documents are read-only design references; their code, schemas, fixtures, tests, workflows and history were not copied. The 49 frozen application contracts and required booking checks remain unchanged.

## Developer-local commands

```sh
npm run toolchain:booking -- --help
npm run toolchain:booking -- --output /new/absolute/private/prepared
npm run toolchain:booking -- --output /new/absolute/private/built --build
npm run toolchain:booking -- --verify /absolute/private/completed-artifact
```

Default preparation creates a new private output and a source-bound runtime bundle without calling Docker. Existing outputs, directory aliases, and application/planning-tree outputs are refused. The build command accepts no image, source, repository, shell, model, provider, registry or extra build flags. It never installs candidate dependencies on the host. Unknown flags fail parsing. CI uses explicitly synthetic Docker adapters and has no live Docker, sandbox, credential or paid-call requirement.

The build adapter selects the installed Docker CLI from fixed locations and requires the local Docker Desktop Unix endpoint for `desktop-linux`. It hashes the actual Docker and selected Buildx binaries, rechecks them before commands, records their versions and selects the existing local Docker builder explicitly. It changes no default context, builder settings, sandbox configuration, forwarding or network policy.

## What actually executes

Only the four checked files under `runtime/toolchain/` become the build context: Dockerfile, package.json, package-lock.json and the deny-by-default `.dockerignore`. The recipe still uses the reviewed immutable Node base and existing separate dependency lock. `npm ci --ignore-scripts` runs inside that tooling image build. The build may fetch pinned public npm dependencies; the protected grader's network is never opened. Candidate/application source, controllers, evaluator/oracles, private configuration, environment files and protected results never enter the image build context.

A uniquely named, labelled audit container then runs a fixed trusted tooling program under one CPU, 768 MB/no extra swap, 64 PIDs, 256 descriptors, network none, read-only root, no capabilities/escalation, UID 65534 and 32 MB temporary storage. There are no host binds or sockets. The effective CPU/memory/process/network/root/user/capability policy and stopped exit 0 are inspected, not inferred solely from command flags.

The fixed smoke checks:

- Load the `server-only` package with the reviewed `react-server` condition.
- Use the installed TypeScript compiler on a constant in-memory sample.
- Execute a constant reviewed TypeScript enum through the tsx loader, exercising esbuild rather than relying on native type stripping.
- Load the installed esbuild API and Next's actual platform-native SWC binary; run Next's version command.
- Compare installed root dependency versions with the exact package/lock inputs.
- Hash Node, package/lock, the complete installed dependency tree and native Node loader libraries. Dependency rows use the same compact ASCII JSON/path ordering as the existing protected Python inventory.

These are trusted tooling smoke programs, not booking/candidate execution or a benchmark oracle. They contain no model calls or arbitrary source entrypoint. The image archive itself contains only the public tooling/base dependencies; the controller bundle stays separate and operator-controlled. Neither archive nor bundle goes to the agent workspace.

The adapter verifies and removes only its exact run-labelled audit container, confirms absence, then exports the image by its actual immutable image ID. It never prunes Docker, removes an existing image, resets a builder/VM, or cleans up another operator's resources. A tag is a convenience name, never an identity. Actual repository digests are recorded if present; none are invented.

## Artifacts and meaning

The private output contains:

- `request.json`: immutable input scope, source/context/bundle pins, run UUID and configured bounds.
- `runtime/`: 21 allowlisted trusted tooling/controller/helper inputs plus their manifest. Only its four-file `toolchain/` subdirectory is a build context.
- `image.id`, `build-metadata.json`, `toolchain-image.tar`: actual build/export outputs.
- `command-N.json`: bounded observed command exits, signals, elapsed times and captured output; retain failures privately.
- `toolchain.json`: final build/audit/archive/cleanup observations, installed tooling identities, timestamps, unknown provider metrics as null and explicit limitations.

`--verify` rehashes the archive and exact required runtime/context inputs, checks current implementation identity and metadata bindings, and performs no Docker or image execution. `BOUND_BYTES_VALID` / `NONE_INTEGRITY_ONLY` means integrity of these bindings only. A digest, JSON success value, `driver` label or self-authored descriptor alone does not authenticate provenance, grant isolation review, register hosted evidence or issue a booking receipt. Independent owner review of custody, original observations and actual installed runtime is still required.

Build, audit, export and output bounds are fixed and recorded. Audit-container cleanup uses an independent 30-second budget; failed cleanup prevents a successful artifact. A failed/interrupted builder client does **not** prove that the shared BuildKit backend stopped. Such a run remains failed and grants no artifact admission; preserve its unique tag/label, metadata and diagnostics for operator recovery. Builder disk/PID hard caps and backend cancellation are not established by this preparation evidence. No blanket builder cleanup is attempted. The live acceptance VM's enforced disk/PID limits remain a separate missing admission requirement.

## Observed preparation and next owner action

The implementation log records the actual build/audit/export command exits, image and archive identities, Node/lock/dependency/native identities and artifact location. The first complete run exercised Docker/Engine 29.9.1, Buildx 0.38.0, Node 22.23.4 on Linux/arm64, TypeScript 5.9.3, tsx 4.23.15, esbuild 0.28.2 and native Next 16.4.3 SWC. No candidate fixture was executed or transferred. Current artifact identities are in the final `toolchain.json`; earlier source revisions remain historical.

The sandbox owner must now:

1. Agree on the shared lease and exclusive installation window; independently review the current request, source bundle, observed commands, image ID and archive digest. Use the read-only verifier as an integrity check, not as authority.
2. Load only that reviewed archive into the existing protected `forecode-grader`, keeping grader egress denied and preserving all existing environments. Installation/configuration authority has not transferred to this implementation agent.
3. Derive the protected Node, node_modules, package.json and lock from that same loaded image using an owner-created staging container. Provision only the reviewed controller layout. Preserve executable modes on Node and native/tool binary dependencies (Node must remain executable); controller/package text files may be 0644. Do not recursively remove executable bits from node_modules. Do not install candidate dependencies or copy global native libraries to force guest compatibility. Stop for owner review if the existing guest ABI differs.
4. Collect the actual guest Node/lock/module/controller/native/executable inventory using the existing runtime helper. The image's native-library identities describe the tooling image, not automatically the different guest filesystem. Bind the actual VM IDs/images/policy, custody/denial observations and enforced VM disk/process limits in a fresh offline review for the current implementation hash.
5. Only after admission, run probe-only and then full booking acceptance as described in [the owner handoff](BOOKING-OFFLINE-ACCEPTANCE.md). Keep `enabled=false`; real agent invocation/export remains hard-disabled. Provider hard caps, exact task/model/budget authorization and supervised agent export remain additional gates.

No hosted execution, upload or registration endpoint was added. No live Meta response, coding-agent experiment, architecture comparison, hidden holdout or completed certificate follows from tooling preparation.
