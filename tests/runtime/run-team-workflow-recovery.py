#!/usr/bin/env python3
"""Run the synthetic public-workflow control in one disposable local container.

This never calls a provider, operates a study runtime, or executes candidate
modules on the host. The image must already exist locally under its immutable ID.
"""

import argparse
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import uuid


def bounded_timeout(value):
    seconds = int(value)
    if not 1 <= seconds <= 300:
        raise argparse.ArgumentTypeError("timeout must be between 1 and 300 seconds")
    return seconds


def run(command, **kwargs):
    return subprocess.run(command, check=True, timeout=15, **kwargs)


def mount(source, target, readonly=True):
    if any(character in str(source) for character in [",", "\n", "\r"]):
        raise ValueError("mount paths cannot contain commas or line breaks")
    return "type=bind,src=" + str(source) + ",dst=" + target + (
        ",readonly" if readonly else ""
    )


def prepare_fixture(repository, destination):
    """Copy only committed fixture bytes named by the tracked-file inventory."""
    tracked = run(
        ["git", "ls-files", "-z", "--", "fixtures/booking-v1"],
        cwd=repository,
        stdout=subprocess.PIPE,
    ).stdout.split(b"\0")
    copied = 0
    for raw in filter(None, tracked):
        name = raw.decode("utf-8", errors="strict")
        relative = PurePosixPath(name).relative_to("fixtures/booking-v1")
        if (
            relative.is_absolute()
            or ".." in relative.parts
            or any(
                part in {"node_modules", ".next"} or part.startswith(".env")
                for part in relative.parts
            )
        ):
            raise ValueError("unexpected tracked fixture path")
        # HEAD bytes prevent a modified working-tree fixture from entering the
        # control. git show only reads source data; nothing is imported on host.
        mode = run(
            ["git", "ls-tree", "HEAD", "--", name],
            cwd=repository,
            stdout=subprocess.PIPE,
        ).stdout.split(b" ", 1)[0]
        if mode not in {b"100644", b"100755"}:
            raise ValueError("fixture must contain committed regular files only")
        content = run(
            ["git", "show", "HEAD:" + name],
            cwd=repository,
            stdout=subprocess.PIPE,
        ).stdout
        target = destination.joinpath(*relative.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        target.chmod(0o666 if relative.parts[0] == "src" else 0o644)
        copied += 1
    if not copied or not (destination / "src").is_dir():
        raise ValueError("tracked baseline fixture is unavailable")
    for directory, _, _ in os.walk(destination):
        path = Path(directory)
        source_directory = path == destination / "src" or destination / "src" in path.parents
        path.chmod(0o777 if source_directory else 0o755)
    if (destination / "src/server/team-benchmark.ts").exists():
        raise ValueError("baseline fixture must not contain a team adapter")
    return copied


def main():
    repository = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True, help="existing local sha256:<64 hex> image ID")
    parser.add_argument("--timeout", type=bounded_timeout, default=240, metavar="SECONDS")
    parser.add_argument(
        "--agent-source",
        type=Path,
        default=repository / "scripts/experiments/agent",
        help="reviewed production agent directory to mount read-only",
    )
    args = parser.parse_args()
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", args.image):
        parser.error("--image must be an immutable sha256:<64 lowercase hex> local image ID")
    agent_source = args.agent_source.resolve(strict=True)
    control = repository / "tests/runtime/team-workflow-recovery-controls.mjs"
    if not agent_source.is_dir():
        parser.error("--agent-source must be a directory")
    for path in [
        control,
        *(
            agent_source / name
            for name in [
                "team-workflow.mjs",
                "team-source-write.mjs",
                "team-public-checks.mjs",
                "team-public-session.mjs",
                "team-public-boundary.mjs",
            ]
        ),
    ]:
        if not stat.S_ISREG(path.lstat().st_mode):
            parser.error("control and production modules must be regular files")
    actual_image = run(
        ["docker", "image", "inspect", "--format", "{{.Id}}", args.image],
        stdout=subprocess.PIPE,
    ).stdout.decode().strip()
    if actual_image != args.image:
        parser.error("local image identity does not match --image")

    container = "forecode-workflow-recovery-" + uuid.uuid4().hex
    temporary = Path(tempfile.mkdtemp(prefix="forecode-workflow-recovery-"))
    temporary.chmod(0o755)
    try:
        fixture = temporary / "fixture"
        fixture.mkdir(mode=0o755)
        copied = prepare_fixture(repository, fixture)
        command = [
            "docker", "run", "--rm", "--name", container,
            "--pull=never", "--network=none", "--read-only", "--user=1000:1000",
            "--cap-drop=ALL", "--security-opt=no-new-privileges",
            "--cpus=2", "--memory=4g", "--memory-swap=4g", "--pids-limit=256",
            "--stop-timeout=1", "--log-driver=none", "--workdir=/workspace",
            "--env=HOME=/tmp", "--env=NEXT_TELEMETRY_DISABLED=1",
            "--tmpfs=/work:rw,nosuid,nodev,size=1073741824,uid=1000,gid=1000,mode=0700",
            "--tmpfs=/tmp:rw,nosuid,nodev,size=268435456,uid=1000,gid=1000,mode=0700",
            "--mount", mount(fixture, "/workspace"),
            "--mount", mount(fixture / "src", "/workspace/src", readonly=False),
            "--mount", mount(agent_source, "/run"),
            "--mount", mount(control, "/controls/control.mjs"),
            "--entrypoint=/usr/local/bin/node", args.image,
            "--input-type=module", "-e",
            'import {accessSync} from "node:fs"; '
            'for (const name of ["zod", "tsx", "typescript", "next"]) '
            'accessSync("/toolchain/node_modules/" + name); '
            'await import("/controls/control.mjs");',
        ]
        print(
            f"Disposable public-workflow control: {container}; "
            f"image={args.image}; fixtureFiles={copied}; timeout={args.timeout}s",
            flush=True,
        )
        result = subprocess.run(command, timeout=args.timeout, check=False)
        return result.returncode
    finally:
        # Remove only this invocation's UUID-named container, including when the
        # attached client times out or is interrupted. No global Docker cleanup.
        try:
            cleanup = subprocess.run(
                ["docker", "rm", "--force", container],
                timeout=15,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            absent = subprocess.run(
                ["docker", "container", "inspect", container],
                timeout=15,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                check=False,
            )
            if absent.returncode != 1 or b"No such" not in absent.stderr:
                raise RuntimeError("could not confirm disposable container removal")
            if cleanup.returncode not in {0, 1}:
                raise RuntimeError("disposable container cleanup failed")
        finally:
            shutil.rmtree(temporary)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except subprocess.TimeoutExpired as error:
        print(f"Disposable control timed out: {error.timeout}s", file=sys.stderr)
        sys.exit(124)
    except KeyboardInterrupt:
        sys.exit(130)
