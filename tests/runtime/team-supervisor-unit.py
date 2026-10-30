"""Fixed harmless no-inference controls. Never accesses Docker, a VM or provider."""
import base64
import json
import pathlib
import tempfile
import time
import types
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[2]
file = ROOT / 'scripts/experiments/agent/team-supervisor.py'
team = types.ModuleType('team_controls')
team.__file__ = str(file)
exec(compile(file.read_bytes(), str(file), 'exec'), team.__dict__)


def denied(action):
    try:
        action()
    except (ValueError, FileExistsError, KeyError):
        return
    raise AssertionError('control should have refused')


def encoded(value):
    return base64.b64encode(value.encode()).decode()


task = json.loads((ROOT / 'benchmarks/booking-team-permissions/task.proposal.json').read_text())
assert team.base.digest(task) == team.TASK
run = '11111111-1111-4111-8111-111111111111'
nonce = '22222222-2222-4222-8222-222222222222'
candidate = {'runId': run, 'files': [{'path': 'package-lock.json', 'base64': encoded('{}')},
                                   {'path': 'src/control.ts', 'base64': encoded('// inert')}]}
manifest = [{'path': f['path'], 'sha256': team.hashlib.sha256(base64.b64decode(f['base64'])).hexdigest()}
            for f in candidate['files']]
request = {
    'runId': run, 'nonce': nonce, 'studyId': 'synthetic-control', 'variant': 'A',
    'sourceCommit': 'a' * 40, 'sourceTreeSha256': team.base.digest(manifest),
    'sharedTaskSha256': 'b' * 64, 'candidate': candidate,
    'enforcement': {
        'schemaVersion': 'supervised-team-enforcement.local.v1', 'taskSha256': team.TASK,
        'agent': 'codex-supervised-team-v1', 'model': 'muse-spark-1.3-contributor',
        'maxIterations': 1, 'iterationUnit': 'upstream_responses_request', 'tools': ['source-shell'], 'providerTools': sorted(team.TOOLS),
        'restrictions': {'writablePaths': ['src/'], 'network': 'none',
                         'credentials': 'trusted_broker_only', 'maxRequests': 1, 'maxOutputTokens': 16},
        'resources': {'cpus': 1, 'memoryMiB': 768, 'pids': 128, 'diskMiB': 1024, 'outputBytes': 4096},
        'maxSeconds': 10, 'tokenLimit': 1000000, 'spendMicroUsd': 1000000,
        'prompt': json.dumps({'task': task, 'prompt': 'Fixed no-inference control.',
                              'adapterInstructions': 'Fixed common interface.',
                              'scenario': {'request': 'Fixed common task.', 'assumptions': [], 'acceptanceIds': []}}),
        'runtime': {'workerImage': 'sha256:' + 'a' * 64, 'agentBinarySha256': 'b' * 64,
                    'nodeSha256': 'c' * 64}, 'agentConfigSha256': 'd' * 64,
    },
}
for mutate in [lambda r: r.update(sourceTreeSha256='0'*64),
               lambda r: r['candidate'].update(runId=nonce),
               lambda r: r['enforcement'].update(maxIterations=0),
               lambda r: r['enforcement'].update(agent='smoke'),
               lambda r: r['enforcement']['restrictions'].update(maxRequests=0),
               lambda r: r['enforcement']['restrictions'].update(maxOutputTokens=100000),
               lambda r: r['enforcement']['resources'].update(cpus=2),
               lambda r: r['enforcement']['restrictions'].update(network='host')]:
    changed = json.loads(json.dumps(request))
    mutate(changed)
    # Candidate ownership is also checked by the reused source preparer.
    if changed['candidate']['runId'] == run:
        denied(lambda: team.preparation_request(changed))

with tempfile.TemporaryDirectory() as temp:
    calls = []
    def docker(args):
        calls.append(args)
        if args[0] == 'ps':
            return b''
        raise AssertionError('no actual worker operation authorized')
    supervisor = team.TeamSupervisor(pathlib.Path(temp), docker, lambda: 'synthetic-boot')
    # Local host is unprivileged: mock UID assignment only; this does not prove guest ownership.
    with patch.object(team.base.os, 'chown') as chown:
        prepared = supervisor.prepare_team(request, {'inputMicroUsdPerToken': 1, 'outputMicroUsdPerToken': 1})
        assert chown.call_count > 0
    assert prepared['requestSha256'] == team.base.digest(request)
    denied(lambda: supervisor.prepare_team(request, {'inputMicroUsdPerToken': 1, 'outputMicroUsdPerToken': 1}))
    args = supervisor.worker_args(run, request['enforcement']['runtime']['workerImage'])
    for arg in ['--network=none', '--read-only', '--cap-drop=ALL', '--restart=no', '1000:1000']:
        assert arg in args
    assert not any('docker.sock' in arg or '.ssh' in arg or '/future' in arg for arg in args)
    assert any('dst=/workspace,readonly' in arg for arg in args)
    assert any('dst=/workspace/src' in arg for arg in args)
    denied(lambda: supervisor.finalize(run, nonce))
    denied(lambda: supervisor.status(run, run))
    p, state = supervisor.state(run, nonce)
    # Exercise the actual serial durable reservation implementation with no send.
    r = state['request']
    r['deadline'] = time.time() + 10
    reservations = team.TeamReservations(p, r)
    body = {'model': r['model'], 'input': 'harmless', 'tools': [{'type': 'function', 'name': 'exec_command'}]}
    output = json.loads(reservations.reserve(json.dumps(body).encode()))
    assert output['max_output_tokens'] == 16
    assert reservations.value['reservedTokens'] > 0
    assert reservations.value['reservedMicroUsd'] > 0
    # Independent iteration cap still denies after loosening only request count.
    r['maxRequests'] = 3
    denied(lambda: reservations.reserve(json.dumps(body).encode()))
    denied(lambda: team.TeamReservations(p, r))
    assert supervisor.cleanup(run, nonce)['restartAbsenceConfirmed']
    assert all(args[0] == 'ps' for args in calls)

# Request ceiling is independent of a larger iteration ceiling.
with tempfile.TemporaryDirectory() as temp:
    r = team.preparation_request(request)
    r.update(deadline=time.time()+10, maxIterations=3,
             provider={'endpoint': 'https://api.meta.ai/v1/responses', 'maxOutputTokens': 16,
                       'inputMicroUsdPerToken': 1, 'outputMicroUsdPerToken': 1})
    reservations = team.TeamReservations(pathlib.Path(temp), r)
    body = {'model': r['model'], 'input': 'inert', 'max_output_tokens': 8192}
    assert json.loads(reservations.reserve(json.dumps(body).encode()))['max_output_tokens'] == 16
    denied(lambda: reservations.reserve(json.dumps(body).encode()))
    assert len(reservations.value['requests']) == 1

for name in ['web_search', 'browser', 'mcp', 'read_private_oracle']:
    with tempfile.TemporaryDirectory() as temp:
        r = team.preparation_request(request)
        r.update(deadline=time.time()+10, provider={'endpoint': 'https://api.meta.ai/v1/responses',
                 'maxOutputTokens': 16, 'inputMicroUsdPerToken': 1, 'outputMicroUsdPerToken': 1})
        reservations = team.TeamReservations(pathlib.Path(temp), r)
        denied(lambda: reservations.reserve(json.dumps({'model': r['model'], 'input': 'inert',
                                                       'tools': [{'type': 'function', 'name': name}]}).encode()))
        assert not reservations.value['requests']
# No production CLI admission can be manufactured with JSON.
denied(team.main)
print('team controls passed: source custody, replay, confinement arguments, request/tool/token/spend limits; no runtime or inference')
