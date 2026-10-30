"""Explicit no-upstream Codex protocol probe in the owned maintenance VM.

Uses the pinned real confined CLI/bridge, but rejects every captured request
before send. Outer deny-all remains mandatory. Never a model experiment.
"""
import base64
import json
import os
import pathlib
import sys
import time
import types
import uuid

file = pathlib.Path('/opt/forecode-agent/team-supervisor.py')
team = types.ModuleType('team_protocol_probe')
team.__file__ = str(file)
exec(compile(file.read_bytes(), str(file), 'exec'), team.__dict__)
root = pathlib.Path('/var/lib/forecode-team-protocol-controls') / str(uuid.uuid4())
metadata = root / 'protocol.json'


def forbid_upstream(*args, **kwargs):
    (root / 'UPSTREAM_FORBIDDEN').write_text('unexpected local probe transport entry')
    raise AssertionError('Protocol probe must never enter upstream transport')


class CaptureAndReject(team.TeamReservations):
    def reserve(self, raw):
        body = json.loads(raw)
        value = {'requestSha256': team.hashlib.sha256(raw).hexdigest(),
                 'tools': [{'type': t.get('type'), 'name': t.get('name')} for t in body.get('tools', [])],
                 'model': body.get('model'), 'acceptedByPinnedBroker': False}
        try:
            forwarded = json.loads(super().reserve(raw))
            value['forwardedTools'] = [{'type': t.get('type'), 'name': t.get('name')} for t in forwarded.get('tools', [])]
            value['acceptedByPinnedBroker'] = True
        except ValueError as error:
            value['rejection'] = str(error)
        metadata.write_text(json.dumps(value, sort_keys=True, separators=(',', ':')))
        raise ValueError('INERT_LOCAL_CAPTURE_NO_UPSTREAM')


def main():
    if sys.platform != 'linux' or os.geteuid() != 0:
        raise ValueError('explicit trusted Linux/root maintenance only')
    template = json.load(sys.stdin)
    root.parent.mkdir(mode=0o700, exist_ok=True)
    root.mkdir(mode=0o700)
    team.base.budget.Reservations = CaptureAndReject
    serve = team.base.budget.serve
    team.base.budget.serve = lambda socket, reservations: serve(socket, reservations, upstream=forbid_upstream)
    supervisor = team.TeamSupervisor(root)
    run_id, nonce = str(uuid.uuid4()), str(uuid.uuid4())
    files = [{'path': 'package.json', 'base64': base64.b64encode(b'{}').decode()},
             {'path': 'src/main.ts', 'base64': base64.b64encode(b'export const value = 1;').decode()}]
    manifest = [{'path': f['path'], 'sha256': team.hashlib.sha256(base64.b64decode(f['base64'])).hexdigest()} for f in files]
    enforcement = template['enforcement']
    enforcement.update(maxSeconds=35, spendMicroUsd=1_000_000)
    enforcement['resources']['outputBytes'] = 1_048_576
    request = {'runId': run_id, 'nonce': nonce, 'studyId': 'maintenance-local-protocol-probe',
               'variant': 'A', 'sourceCommit': '0' * 40, 'sourceTreeSha256': team.base.digest(manifest),
               'sharedTaskSha256': team.base.digest({'scope': 'local-protocol-only-no-upstream'}),
               'enforcement': enforcement, 'candidate': {'runId': run_id, 'files': files}}
    prepared = False
    try:
        supervisor.prepare_team(request, template['provider'])
        prepared = True
        supervisor.start(run_id, nonce)
        until = time.monotonic() + 45
        while time.monotonic() < until:
            observed = supervisor.status(run_id, nonce)
            if observed['stage'] in ['terminated', 'failed']:
                break
            time.sleep(.1)
        assert observed['stage'] == 'terminated' and observed['terminationConfirmed']
        assert team.base.digest(team.base.capture(supervisor.directory(run_id) / 'source', run_id)) == team.base.digest(request['candidate'])
        captured = json.loads(metadata.read_bytes())
        assert not (root / 'UPSTREAM_FORBIDDEN').exists()
        if captured['acceptedByPinnedBroker']:
            assert captured['forwardedTools'] and all(t['name'] in team.TOOLS for t in captured['forwardedTools'])
        ack = supervisor.cleanup(run_id, nonce)
        assert ack['absent'] and ack['scratchRemoved'] and not supervisor.owned(run_id)
        value = {'schemaVersion': 'team-installed-local-protocol-probe.v1', 'origin': 'actual_local_cli_probe',
                 'runId': run_id, 'controlRoot': str(root), 'upstreamCalls': 0, 'modelInference': 'NOT_RUN',
                 'studyExecution': 'NOT_RUN', 'sourceChanged': False, 'cleanupConfirmed': True,
                 'request': captured, 'process': {k: observed['agent'][k] for k in ['reason', 'exitCode', 'signal']}}
        (root / 'observations.json').write_text(json.dumps(value, sort_keys=True, separators=(',', ':')))
        print(json.dumps(value, sort_keys=True, separators=(',', ':')), flush=True)
        if not captured['acceptedByPinnedBroker']:
            raise SystemExit(3)
    finally:
        if prepared:
            supervisor.cleanup(run_id, nonce)


if __name__ == '__main__':
    main()
