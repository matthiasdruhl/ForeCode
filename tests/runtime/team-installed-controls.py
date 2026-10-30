"""Explicit Linux/root team maintenance controls; never ordinary unit CI.

Executes only the committed harmless Node worker under the installed team
supervisor. No coding agent or provider is invoked. Test state is separate
from the production team root; UUID-labelled workers are exclusively owned.
"""
import base64
import json
import os
import pathlib
import sys
import time
import types
import uuid

HERE = pathlib.Path(__file__).resolve().parent
file = pathlib.Path('/opt/forecode-agent/team-supervisor.py')
team = types.ModuleType('installed_team_control')
team.__file__ = str(file)
exec(compile(file.read_bytes(), str(file), 'exec'), team.__dict__)
ROOT = pathlib.Path('/var/lib/forecode-team-inert-controls') / str(uuid.uuid4())


class InertTeam(team.TeamSupervisor):
    def __init__(self, mode):
        super().__init__(ROOT)
        self.mode = mode

    def worker_args(self, run_id, request):
        args = super().worker_args(run_id, request)
        # Explicit control-only substitution. All Docker isolation flags and
        # production validate_worker readbacks remain unchanged.
        mount = args.index('type=bind,src=/home/agent/.codex/config.toml,dst=/home/agent/.codex/config.toml,readonly')
        del args[mount - 1:mount + 1]
        at = args.index('--entrypoint')
        fixture = HERE / ('team-denial-probe.mjs' if self.mode == 'boundary' else 'harmless-agent.mjs')
        args[at:at] = ['--mount', 'type=bind,src=' + str(fixture) + ',dst=/run/harmless-agent.mjs,readonly']
        args[-1] = '/run/harmless-agent.mjs'
        args.append(self.mode)
        return args


def wait(supervisor, run_id, nonce, heartbeat=False):
    until = time.monotonic() + 35
    while time.monotonic() < until:
        state = supervisor.status(run_id, nonce)
        if heartbeat:
            if (supervisor.directory(run_id) / 'source/src/heartbeat.ts').exists():
                return state
        elif state['stage'] in ['terminated', 'failed']:
            return state
        time.sleep(.05)
    raise AssertionError('bounded inert control timed out')


def main():
    if sys.platform != 'linux' or os.geteuid() != 0:
        raise ValueError('explicit trusted Linux/root maintenance only')
    template = json.load(sys.stdin)
    if set(template) != {'enforcement', 'provider'}:
        raise ValueError('fixed inert control input')
    ROOT.parent.mkdir(mode=0o700, exist_ok=True)
    ROOT.mkdir(mode=0o700)  # Exclusive operation: a failed root is never reused.
    rows = []
    for case in ['normal', 'fail', 'timeout', 'flood', 'detached', 'boundary', 'SIGINT', 'SIGTERM']:
        run_id, nonce = str(uuid.uuid4()), str(uuid.uuid4())
        mode = 'hang' if case in ['timeout', 'SIGINT', 'SIGTERM'] else case
        supervisor = InertTeam(mode)
        files = [{'path': 'package.json', 'base64': base64.b64encode(b'{}').decode()},
                 {'path': 'src/main.ts', 'base64': base64.b64encode(b'export const value = 1;').decode()}]
        manifest = [{'path': f['path'], 'sha256': team.hashlib.sha256(base64.b64decode(f['base64'])).hexdigest()} for f in files]
        enforcement = json.loads(json.dumps(template['enforcement']))
        enforcement['maxSeconds'] = 1 if case == 'timeout' else 12
        request = {'runId': run_id, 'nonce': nonce, 'studyId': 'maintenance-inert-control', 'variant': 'A',
                   'sourceCommit': '0' * 40, 'sourceTreeSha256': team.base.digest(manifest),
                   'sharedTaskSha256': team.base.digest({'scope': 'maintenance-only-no-inference'}),
                   'enforcement': enforcement, 'candidate': {'runId': run_id, 'files': files}}
        print(json.dumps({'case': case, 'stage': 'STARTING_INERT_CONTROL', 'runId': run_id}), flush=True)
        cleaned = False
        try:
            supervisor.prepare_team(request, template['provider'])
            supervisor.start(run_id, nonce)
            if case in ['SIGINT', 'SIGTERM']:
                observed = wait(supervisor, run_id, nonce, heartbeat=True)
                supervisor.docker(['kill', '--signal', case, observed['containerId']])
            observed = wait(supervisor, run_id, nonce)
            assert observed['stage'] == 'terminated' and observed['terminationConfirmed']
            agent = observed['agent']
            if case == 'timeout':
                assert agent['reason'] == 'timed_out'
            elif case == 'flood':
                assert agent['reason'] == 'output_limit'
            elif case in ['SIGINT', 'SIGTERM']:
                assert agent['exitCode'] != 0
            else:
                assert agent['reason'] == 'completed' and agent['exitCode'] == (7 if case == 'fail' else 0)
                sealed = supervisor.finalize(run_id, nonce)
                assert sealed['terminationConfirmed'] and sealed['exportWithoutGuestExecution']
                before = team.base.digest(sealed['candidate'])
                time.sleep(.15)
                assert team.base.digest(team.base.capture(supervisor.directory(run_id) / 'sealed', run_id)) == before
            # Reservations are durably retained separately; no response/send is
            # fabricated by these harmless worker controls.
            budget = supervisor.directory(run_id) / 'budget.json'
            assert budget.is_file()
            reservations = json.loads(budget.read_bytes())
            assert not reservations['requests'] and reservations['reservedTokens'] == 0 and reservations['reservedMicroUsd'] == 0
            ack = supervisor.cleanup(run_id, nonce)
            cleaned = bool(ack['absent'] and ack['scratchRemoved'] and ack['restartAbsenceConfirmed'])
            assert cleaned and not supervisor.owned(run_id)
            p = supervisor.directory(run_id)
            assert all(not (p / name).exists() for name in ['source', 'sealed', 'gateway', 'task.json'])
            assert (p / 'state.json').exists()
            rows.append({'case': case, 'runId': run_id, 'worker': observed['containerId'],
                         'process': {key: agent[key] for key in ['reason', 'exitCode', 'signal']},
                         'cleanupConfirmed': True, 'providerRequests': 0})
        finally:
            if not cleaned:
                supervisor.cleanup(run_id, nonce)
    if supervisor.docker(['ps', '-aq', '--filter', 'label=forecode.booking.team.agent']).strip():
        raise ValueError('team worker survives')
    output = {'schemaVersion': 'team-installed-inert-controls.v1', 'origin': 'actual_inert_guest_controls',
              'codingAgent': 'NOT_RUN', 'inference': 'NOT_RUN', 'providerRequests': 0,
              'studyExecution': 'NOT_RUN', 'controls': rows}
    output['controlRoot'] = str(ROOT)
    (ROOT / 'observations.json').write_text(json.dumps(output, sort_keys=True, separators=(',', ':')))
    print(json.dumps(output, sort_keys=True, separators=(',', ':')), flush=True)


if __name__ == '__main__':
    main()
