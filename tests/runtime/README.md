# Explicit disposable runtime controls

These scripts are excluded from normal test discovery and are never installed by the runtime bundle. They execute harmless fixed code only. They do not use Codex credentials, run a model, grant admission or operate the existing owner sandboxes. Ordinary Vitest runs `supervisor-unit.py` through `agent-supervision.test.ts`; those20 Python subcases require no Docker/network.

Use an explicitly test-owned Linux Docker environment. Match the operational **two-vCPU** topology; Docker Desktop's larger CPU inventory causes unchanged Next builds to spawn too many workers for the fixed64-PID grader limit. Do not raise that limit, change fixture configuration or weaken checks. The observed follow-up used a fresh mountless shell sbx guest,2CPUs/4GiB, deny-all networking, skills off and no provider session. Existing `forecode-experiments` and `forecode-grader` stayed untouched. Creating/provisioning that test guest requires the task's disposable-environment authority; this is not a way to bypass operational admission.

`Dockerfile` builds the trusted test controller only. Supply a locally reviewed tooling **tag or repo@digest** and independently check its immutable ID first; bare `sha256:<ID>` is not a valid Dockerfile FROM reference. Public Python/DockerCLI bases are pinned. Build context contains only this recipe and `docker-shim.py`; app/configuration/evidence are excluded. No candidate executes during the build. The test controller owns the test daemon socket. The nested harmless workers do not receive it.

A test-owned named volume must be mounted at its actual daemon Mountpoint in the trusted controller. For the grader, mount that volume at `/tmp` too. Mount a read-only text file at `/run/forecode-test-volume-root` containing the exact Mountpoint. The shim accepts only `/var/lib/docker/volumes/forecode-agent-controls-<test-suffix>/_data`, and translates only fixed `/tmp/booking-{grade,lifecycle}-.../{source,bridge}` mounts. It preserves CPU/memory/PID/network/check policy and is never shipped to the operational guest. It adds CPU affinity for Docker Desktop controls; actual two-vCPU hardware was still necessary for Next's `os.cpus()` topology.

Transfer only trusted `scripts/experiments/agent`, `scripts/evaluator/booking-v1` and `tests/runtime` into the trusted test environment, at a consistent project-relative layout. They must be outside all untrusted worker mounts. The agent test controller needs read-only supervisor/tests mounts. The grader controller needs the unchanged evaluator directory mounted read-only at `/opt/forecode-booking/controller`, plus the immutable Node/modules closure from the tooling image.

Inside the trusted controller:

```sh
python3 <APP>/tests/runtime/supervisor-controls.py <TEST_VOLUME_MOUNTPOINT> <PINNED_HARMLESS_NODE_IMAGE>
python3 <APP>/tests/runtime/launcher-controls.py <TEST_VOLUME_MOUNTPOINT> <PINNED_HARMLESS_NODE_IMAGE>
```

The16 controls cover real process exits, limits, detached writers, capability-dropped UID0, signals, controller heartbeat loss, killed supervisor, immutable-copy behavior, unsafe export and worker identity substitution. Boot mismatch is explicitly simulated in that suite; cleanup refusal is deliberately injected. The two launcher controls exercise the actual `worker.mjs` with an inert stand-in binary and check arguments/environment/no provider requests and changed-binary refusal. They do not establish actual Codex/provider protocol availability.

For protected grading, the host Node24 driver accepts exactly one private test selection JSON and one Docker-transport executable. A finite test-owned wrapper can forward Docker arguments through `sbx exec -i -u root <TEST_SHELL> docker`; it must never target an operator VM. Selection fields are `agentControl` (`forecode-trusted-controls-...`), `graderControl` (`forecode-grader-controls-...`), `guestRoot` and immutable `workerImage`. No production flag/endpoint injects this data.

```sh
node --conditions=react-server --import tsx tests/runtime/grader-controls.ts <PRIVATE_TEST_SELECTION> <TEST_DOCKER_TRANSPORT>
```

The driver exports the reviewed baseline as inert bytes, runs the real supervisor with a fixed harmless source transformation, seals/freezes it, invokes the unchanged protected guest and worker, validates the report, cleans up, publishes test-only originals and requires actual protected-store authentication. Expected results are VERIFIED for a harmless comment change, REJECTED for the deliberately removed ownership guard, and refusal for both tampered tree digests. It asserts the evaluated tree differs from baseline. Its fresh private temporary records are **test artifacts**, not genuine agent evidence or catalog inputs. Host checks never execute those modified trees. The observed tooling worker used Node22.23.4; development/driver used Node24.16.0. Do not relabel versions.

For real restart coverage, hash all sealed copies in the test-owned volume, record removed container IDs, stop only the test shell, and restart it through trusted `exec`. Rehash copies and attempt `docker start` for the removed IDs; every start must fail. This follow-up observed a changed VM boot ID,53 unchanged sealed copies and96 unstartable removed workers in the final repeat. This is stronger than the simulated suite case, but does not admit an operational image/kernel/provider configuration.

Capture commands, exit codes and output privately. Do not copy source/diagnostic artifacts into Git. Clean up only the exact created controller IDs, test-labelled workers, volume and shell after confirming their identity and absence. No global prune, lease theft, existing-sandbox reset, production registration or paid smoke is permitted by these controls. Safe CLI refusal or synthetic transport success is never reported as actual sandbox admission.
