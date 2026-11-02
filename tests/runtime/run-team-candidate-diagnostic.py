#!/usr/bin/env python3
"""Inspect explicit candidate copies only inside a disposable network-off container.

No provider calls, protected tests, study runtime changes or host candidate execution.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--image', required=True)
    parser.add_argument('--mode', choices=['full', 'behavior', 'quick'], default='full')
    parser.add_argument('--agent-source', type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', args.image):
        parser.error('immutable existing image required')
    repository = Path(__file__).resolve().parents[2]
    spec = importlib.util.spec_from_file_location('reviewed_fixture', Path(__file__).with_name('run-team-workflow-recovery.py'))
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    candidate = args.candidate.resolve(strict=True)
    if args.output.exists():
        parser.error('fresh output directory required')
    args.output.mkdir(parents=True, mode=0o700)
    actual = helper.run(['docker', 'image', 'inspect', '--format', '{{.Id}}', args.image], stdout=subprocess.PIPE).stdout.decode().strip()
    if actual != args.image:
        parser.error('image identity mismatch')
    temporary = Path(tempfile.mkdtemp(prefix='forecode-candidate-diagnostic-'))
    temporary.chmod(0o755)
    name = 'forecode-candidate-diagnostic-' + uuid.uuid4().hex
    try:
        fixture = temporary / 'fixture'
        fixture.mkdir(mode=0o755)
        helper.prepare_fixture(repository, fixture)
        for file in sorted(candidate.rglob('*')):
            if file.is_symlink():
                raise ValueError('candidate alias refused')
            if not file.is_file():
                continue
            relative = file.relative_to(candidate)
            if any(part in ['.git', '.next', 'node_modules'] or part.startswith('.env') for part in relative.parts):
                raise ValueError('unexpected candidate file')
            if file.stat().st_nlink != 1 or file.stat().st_size > 2_097_152:
                raise ValueError('candidate file bounds')
            target = fixture / relative
            if relative.parts[0] != 'src':
                if not target.is_file() or target.read_bytes() != file.read_bytes():
                    raise ValueError('candidate may not replace tooling or configuration')
                continue
            if relative.suffix not in ['.ts', '.tsx', '.css', '.svg']:
                raise ValueError('unexpected source extension')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(file.read_bytes())
            target.chmod(0o644)
        files = [{'path': str(p.relative_to(fixture)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(fixture.rglob('*')) if p.is_file()]
        (args.output / 'source-manifest.json').write_text(json.dumps(files, indent=2)+'\n')
        command = ['docker', 'run', '--rm', '--name', name, '--pull=never', '--network=none', '--read-only', '--user=1000:1000', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--cpus=2', '--memory=4g', '--memory-swap=4g', '--pids-limit=256', '--stop-timeout=1', '--log-driver=none', '--workdir=/workspace', '--env=HOME=/tmp', '--env=NEXT_TELEMETRY_DISABLED=1', '--tmpfs=/work:rw,nosuid,nodev,size=1073741824,uid=1000,gid=1000,mode=0700', '--tmpfs=/tmp:rw,nosuid,nodev,size=268435456,uid=1000,gid=1000,mode=0700', '--mount', helper.mount(fixture, '/workspace'), '--mount', helper.mount(args.agent_source.resolve(strict=True) if args.agent_source else repository/'scripts/experiments/agent', '/run'), '--entrypoint=/usr/local/bin/node', args.image, '/run/team-public-checks.mjs']
        if args.mode != 'full':
            command.append('--behavior-only' if args.mode == 'behavior' else '--quick')
        result = subprocess.run(command, capture_output=True, timeout=200)
        (args.output/'stdout.txt').write_bytes(result.stdout)
        (args.output/'stderr.txt').write_bytes(result.stderr)
        summary = {'kind':'isolated-public-candidate-diagnostic', 'candidate':str(candidate), 'container':name, 'image':args.image, 'mode':args.mode, 'exitCode':result.returncode, 'providerCalls':0, 'protectedCorrectness':'NOT_MEASURED', 'sourceSha256':hashlib.sha256(json.dumps(files, separators=(',',':')).encode()).hexdigest()}
    finally:
        subprocess.run(['docker', 'rm', '--force', name], capture_output=True, timeout=15)
        absent = subprocess.run(['docker', 'container', 'inspect', name], capture_output=True, timeout=15)
        shutil.rmtree(temporary)
        if absent.returncode != 1 or b'no such' not in absent.stderr.lower():
            raise RuntimeError('owned container absence not confirmed')
    summary['cleanupConfirmed'] = True
    (args.output/'summary.json').write_text(json.dumps(summary, indent=2)+'\n')
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
