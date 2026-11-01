# Explicit disposable runtime controls

These scripts are excluded from normal test discovery and are never installed by the runtime bundle. They execute harmless fixed code only. They do not use Codex credentials, run a model, grant admission or operate the existing owner sandboxes. Ordinary Vitest runs `supervisor-unit.py` through `agent-supervision.test.ts`; those31 Python subcases require no Docker or external network. The broker tests bind a temporary local Unix socket; a desktop sandbox must permit that local capability.

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

Team public preparation controls: run `team-public-controls.py` only as root in the dedicated no-inference guest, with an envelope containing the reviewed fixture files and the audited immutable public-tooling image. It checks a harmless positive adapter, a TypeScript error and an omitted bootstrap cookie. It copies no private oracle or protected bridge. The team worker mounts only its three public bridge/check files; both coding arms receive the same command and dependencies. Checks use the existing 768MiB/one-CPU worker bounds, a 256MiB ephemeral work directory, and the same supervisor wall-clock deadline. Public preparation output cannot stand in for an authenticated protected grade.

The guest-only `team-native-workflow-controls.py` also accepts these full-history
`controlMode` values through its existing private stdin envelope:

- `full-final-response`: nineteen tool rounds, then a valid final message.
- `full-final-tool-refused` and `full-final-mixed-refused`: nineteen tool rounds,
  then a prohibited call alone or alongside a message, using SSE.
- `full-final-tool-refused-json` and `full-final-mixed-refused-json`: the same
  refusal controls using JSON responses.

Each full-history control discovers the public task, writes an adapter with a
missing cookie, observes public failure, repairs through the atomic writer and
uses the remaining requests before the reserved twentieth response. It asserts
the replay includes nineteen tool results, final declarations/instructions,
native exit, unchanged repaired source after refusal, unknown refused usage,
retained raw failure, sealed public READY and owned cleanup. Existing exact
binary/config/image enforcement still applies. Supply freshly reviewed pins;
this script does not install or admit changed source. Run every mode in a fresh
attempt. Check the observed VM boot ID for each invocation: a stable sandbox
name/ID does not establish a stable kernel boot. Before each control, run the
reviewed `scripts/experiments/isolation/vm-resources.py` in the test-owned guest,
using the team profile’s existing 512-task and 64GiB backing-device ceilings, then retain its
numeric readback and verify the boot remains unchanged through that control.
Recheck the exact installed source, configuration and immutable worker image
before executing the control. An earlier boot's resource readback is insufficient.

The team broker uses one append-only diagnostic schema:
`team-request-contract-observation.local.v1`, in private
`request-NNNN-{stage}.json` files beside `budget.json`, outside worker mounts.
Stages are admitted, upstream-started/upstream-failed, response-received, and
response-accepted/response-rejected. Admission projects the exact canonical
reserved bytes, including the selected output allowance. Its phase is work,
completion, validation or final. Instruction byte lengths/digests, allowlisted
tool names/types/choice, bounded history kinds and existing ceilings explain the
contract without retaining raw context. Response-received stores an explicitly
unvalidated shape once; terminal output, added-event and done-event counts remain
separate. Acceptance/rejection records carry only validation outcome or a fixed
reason, avoiding duplicate response projections. `responseValidated` is true only
on response-accepted; shape and echoed provider metadata remain observations, not
independent correctness or invoice evidence.

Each record is at most 8192 bytes, synced as a private temporary file and
atomically linked into its exclusive immutable 0400 final name, then the directory
is synced. Interrupted `.next` files are not observations. An existing name/alias,
partial write, unsupported event order or storage failure latches refusal before
delivery or another request. A complete record can survive a later directory-sync
failure; it does not prove delivery. Reservations never refund. Already validated
usage survives a later diagnostic failure; unknown usage stays unknown. The first
rejection survives secondary budget, response-retention and diagnostic failures.
Missing stages remain missing after interruption. Cleanup preserves diagnostics
and the existing failure/source stores; no historical report schema changes.

Filesystem-only `team-contract-controls.py` runs in ordinary Vitest and directly
with `python3 -I -B tests/runtime/team-contract-controls.py`. It exercises immutable
publication/collisions, write/chmod/fsync/link failures, order/hash substitution,
bounded privacy, terminal duplication/omission, sparse nonterminal envelopes, malformed/deep JSON, JSON/SSE
final-call refusal, retained usage and no retry. HTTP reservation controls also
prove request21/iteration21 refusal and diagnostic-failure refusal at the actual
local broker boundary. Ordinary Vitest partitions the broker suite into seven independent subprocess cases under its unchanged default timeout. Standalone `team-reservation-controls.py` without arguments still runs every assertion; its finite optional selections are `admission`, `replay4m`, `replay32m`, `envelope32m`, `compact60`, `growing60` and `http`. These are test-only selections, never production dispatch inputs. Provider Content-Type parameters are discarded before the local HTTP response, preventing raw header values from crossing that boundary. No provider, container or candidate executes in these tests.

Full-history modes additionally include a dynamic-import public-boundary failure,
atomic repair and growing harmless output history from PR #42. All five modes
from PR #43 and the three original short native controls remain. They use the
actual pinned CLI and broker, with scripted local responses; they do not prove
real-model instruction compliance. Do not expect the superseded mutable
`completion-contract.json` file in a new run.

`team-native-limit-controls.py` takes the same public-fixture/enforcement stdin
envelope and exercises the actual pinned CLI's unchanged 1M native rollout guard
with synthetic usage, while the broker keeps its 32M reservation and 20-request
ceilings. It requires a native budget error before either broker ceiling, retains
source/usage records and removes the worker. Synthetic token counts do not
validate provider accounting.

`resource-controls.py <IMMUTABLE_PUBLIC_WORKER_IMAGE>` uses only fixed harmless
Node code in separate disposable containers. It requires actual ENOSPC at the
32MiB tmpfs limit, EAGAIN at the 128-PID limit, and an inspected OOM kill at the
768MiB memory limit. CPU enforcement is checked through the actual Docker quota;
this is not a CPU performance benchmark or an attribution test for native OOMs.
Run only in the authorized test-owned Linux environment. Retain failed invocations
and expected negative results before removing owned containers or scratch.

Passing scripted controls establishes mechanisms only. A fresh zero-upstream
installed gate, independent source/inventory review and separately authorized
provider conformance evidence remain required before another experimental pair.
