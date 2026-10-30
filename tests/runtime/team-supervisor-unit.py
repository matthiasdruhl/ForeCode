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
with tempfile.TemporaryDirectory() as temp:
    r = team.preparation_request(request)
    r.update(deadline=time.time()+10, provider={'endpoint': 'https://api.meta.ai/v1/responses',
             'maxOutputTokens': 16, 'inputMicroUsdPerToken': 1, 'outputMicroUsdPerToken': 1})
    reservations = team.TeamReservations(pathlib.Path(temp), r)
    sent = reservations.reserve(json.dumps({'model': r['model'], 'input': 'inert', 'tools': [
        {'type': 'function', 'name': 'request_user_input', 'parameters': {'type': 'object'}},
        {'type': 'function', 'name': 'exec_command'}]}).encode())
    assert [t['name'] for t in json.loads(sent)['tools']] == ['exec_command']

for name in ['request_user_input', 'view_image', 'spawn_agent', 'mcp']:
    with tempfile.TemporaryDirectory() as temp:
        r = team.preparation_request(request)
        r.update(deadline=time.time()+10, provider={'endpoint': 'https://api.meta.ai/v1/responses',
                 'maxOutputTokens': 16, 'inputMicroUsdPerToken': 1, 'outputMicroUsdPerToken': 1})
        reservations = team.TeamReservations(pathlib.Path(temp), r)
        denied(lambda: reservations.reserve(json.dumps({'model': r['model'], 'input': [
            {'type': 'function_call', 'name': name, 'call_id': 'inert', 'arguments': '{}'}]}).encode()))
        assert not reservations.value['requests']

for name in ['exec_command', 'apply_patch', 'request_user_input', 'view_image', 'spawn_agent']:
    for streaming in [False, True]:
        with tempfile.TemporaryDirectory() as temp:
            r = team.preparation_request(request)
            r.update(deadline=time.time()+10, provider={'endpoint': 'https://api.meta.ai/v1/responses',
                     'maxOutputTokens': 16, 'inputMicroUsdPerToken': 1, 'outputMicroUsdPerToken': 1})
            reservations = team.TeamReservations(pathlib.Path(temp), r)
            sent = reservations.reserve(json.dumps({'model': r['model'], 'input': 'inert'}).encode())
            call = {'type': 'function_call', 'name': name, 'call_id': 'inert', 'arguments': '{}'}
            response = {'object': 'response', 'model': r['model'], 'service_tier': 'auto',
                        'status': 'completed', 'output': [call],
                        'usage': {'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2}}
            output = json.dumps(response).encode()
            content_type = 'application/json'
            if streaming:
                output = b'data: ' + json.dumps({'type': 'response.output_item.done', 'item': call}).encode() + b'\n\ndata: ' + json.dumps({'type': 'response.completed', 'response': response}).encode() + b'\n\n'
                content_type = 'text/event-stream'
            if name in team.TOOLS:
                reservations.observe(output, content_type, sent)
                assert reservations.value['requests'][0]['observedUsage']['totalTokens'] == 2
            else:
                denied(lambda: reservations.observe(output, content_type, sent))
                assert (pathlib.Path(temp) / 'unverified-response.bin').read_bytes() == output
                assert (pathlib.Path(temp) / 'unverified-response.bin').stat().st_mode & 0o777 == 0o400
                diagnostic = json.loads((pathlib.Path(temp) / 'provider-failure.json').read_bytes())
                assert diagnostic['exceptionClass'] == 'ValueError' and diagnostic['httpStatus'] is None
                assert reservations.value['blockedReason'] == 'provider-outcome-unverified'
                denied(lambda: reservations.reserve(json.dumps({'model': r['model'], 'input': 'inert'}).encode()))

denied(team.main)
print('team controls passed: source custody, replay, confinement arguments, request/tool/token/spend limits; no runtime or inference')

# Exercise the production dispatch grammar/custody with test-only policy bytes.
# No command, provider or worker is launched by this fixed recording stand-in.
class RecordingSupervisor:
    def __init__(self):
        self.calls = []
    def prepare_team(self, body, provider):
        self.calls.append((body['runId'], provider))
        return {'stage': 'prepared'}
    def cleanup(self, run_id, nonce):
        self.calls.append((run_id, nonce))
        return {'absent': True}
policy = {'schemaVersion': 'supervised-team-installed-policy.v1', 'enabled': True,
          'implementationSha256': '1'*64, 'enforcementSha256': team.base.digest(request['enforcement']),
          'studyId': request['studyId'], 'provider': {'inputMicroUsdPerToken': 1, 'outputMicroUsdPerToken': 1},
          'arms': [{key: request[key] for key in ['variant', 'runId', 'sourceCommit', 'sourceTreeSha256', 'sharedTaskSha256']},
                   {'variant': 'B', 'runId': nonce, 'sourceCommit': '2'*40, 'sourceTreeSha256': '3'*64, 'sharedTaskSha256': '4'*64}]}
with tempfile.TemporaryDirectory() as temp:
    directory = pathlib.Path(temp).resolve() / 'installed'
    directory.mkdir(mode=0o700)
    file = directory / 'team-policy.json'
    file.write_bytes(team.base.budget.canonical(policy))
    file.chmod(0o400)
    loaded = team.load_policy(file, team.os.getuid())
    inventory = types.ModuleType('team_inventory_control')
    inventory_file = ROOT / 'scripts/experiments/isolation/team-runtime-files.py'
    exec(compile(inventory_file.read_bytes(), str(inventory_file), 'exec'), inventory.__dict__)
    shared = types.ModuleType('shared_inventory_control')
    shared_file = ROOT / 'scripts/experiments/isolation/runtime-files.py'
    exec(compile(shared_file.read_bytes(), str(shared_file), 'exec'), shared.__dict__)
    digest, body = inventory.read_team_policy(shared, file, team.os.getuid())
    assert digest == team.hashlib.sha256(file.read_bytes()).hexdigest() and body == policy
    shared.assert_unchanged()
    file.chmod(0o444)
    denied(lambda: inventory.read_team_policy(shared, file, team.os.getuid()))
    file.chmod(0o400)
    alias = directory / 'policy-alias.json'
    alias.symlink_to(file)
    denied(lambda: inventory.read_team_policy(shared, alias, team.os.getuid()))
    alias.unlink()
    team.os.link(file, alias)
    denied(lambda: inventory.read_team_policy(shared, file, team.os.getuid()))
    alias.unlink()
    with patch.object(shared.os, 'read', return_value=b'{}'):
        denied(lambda: inventory.read_team_policy(shared, file, team.os.getuid()))
    file.chmod(0o600)
    file.write_bytes(b'x' * 1_048_577)
    file.chmod(0o400)
    denied(lambda: inventory.read_team_policy(shared, file, team.os.getuid()))
    file.chmod(0o600)
    file.write_bytes(team.base.budget.canonical(policy))
    file.chmod(0o400)
    recorded = RecordingSupervisor()
    assert team.dispatch({'operation': 'prepare', 'request': request}, recorded, loaded)['stage'] == 'prepared'
    assert team.dispatch({'operation': 'cleanup', 'runId': run, 'nonce': nonce}, recorded, loaded)['absent']
    assert len(recorded.calls) == 2
    for key, value in [('studyId', 'wrong'), ('runId', nonce), ('sourceCommit', '0'*40),
                       ('sourceTreeSha256', '0'*64), ('sharedTaskSha256', '0'*64)]:
        changed = json.loads(json.dumps(request)); changed[key] = value
        denied(lambda: team.dispatch({'operation': 'prepare', 'request': changed}, recorded, loaded))
    denied(lambda: team.dispatch({'operation': 'shell', 'runId': run, 'nonce': nonce}, recorded, loaded))
    denied(lambda: team.dispatch({'operation': 'cleanup', 'runId': run, 'nonce': nonce, 'command': 'arbitrary'}, recorded, loaded))
    assert len(recorded.calls) == 2
    for mutate in [lambda p: p.update(enabled=False), lambda p: p.update(admitted=True),
                   lambda p: p['provider'].update(inputMicroUsdPerToken=0),
                   lambda p: p['arms'][0].update(runId='wrong')]:
        changed = json.loads(json.dumps(policy)); mutate(changed)
        file.chmod(0o600); file.write_bytes(team.base.budget.canonical(changed)); file.chmod(0o400)
        denied(lambda: team.load_policy(file, team.os.getuid()))
print('team production dispatch grammar/custody passed with inert stand-in only')

# Fixed trusted HTTP transport only; fake opener records timeout and endpoint.
class InertResponse:
    status = 200
    headers = {'Content-Type': 'application/json'}
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, size):
        assert size == 8_000_001
        return b'{}'
class InertOpener:
    def __init__(self): self.calls = []
    def open(self, request, timeout):
        assert request.full_url == 'https://api.meta.ai/v1/responses'
        assert request.get_header('Authorization') == 'Bearer forecode-meta-sandbox'
        self.calls.append(timeout)
        return InertResponse()
opener = InertOpener()
with patch.dict(team.os.environ, {'HTTPS_PROXY': 'http://synthetic.invalid'}, clear=True), \
        patch.object(team.time, 'time', return_value=100), \
        patch.object(team.urllib.request, 'build_opener', return_value=opener):
    body = json.dumps({'model': 'muse-spark-1.3-contributor'}).encode()
    assert team.team_provider_request(body, 500) == (b'{}', 'application/json')
    assert team.team_provider_request(body, 105) == (b'{}', 'application/json')
    denied(lambda: team.team_provider_request(body, 100))
    denied(lambda: team.team_provider_request(b'{"model":"arbitrary"}', 500))
    assert opener.calls == [120, 5]
print('team deadline-bounded provider transport and protected failure diagnostics passed; no upstream')

# Match the actual overrun shape: optional summaries must be omitted, and
# reported output above the original reservation is still rejected.
with tempfile.TemporaryDirectory() as temp:
    r = team.preparation_request(request)
    r.update(deadline=time.time()+10, tokenLimit=200000, provider={
        'endpoint': 'https://api.meta.ai/v1/responses', 'maxOutputTokens': 8192,
        'inputMicroUsdPerToken': 1, 'outputMicroUsdPerToken': 1})
    reservations = team.TeamReservations(pathlib.Path(temp), r)
    sent = reservations.reserve(json.dumps({'model': r['model'], 'input': 'inert',
        'reasoning': {'effort': 'high', 'summary': 'auto'}}).encode())
    assert json.loads(sent)['reasoning'] == {'effort': 'high'}
    assert json.loads(sent)['max_output_tokens'] == 8192
    response = {'object': 'response', 'model': r['model'], 'service_tier': 'auto',
        'status': 'incomplete', 'output': [{'type': 'reasoning', 'id': 'synthetic'}],
        'usage': {'input_tokens': 1, 'output_tokens': 8403, 'total_tokens': 8404}}
    denied(lambda: reservations.observe(json.dumps(response).encode(), 'application/json', sent))
    assert reservations.value['blockedReason'] == 'provider-outcome-unverified'
    assert 'observedUsage' not in reservations.value['requests'][0]
    denied(lambda: reservations.reserve(json.dumps({'model': r['model'], 'input': 'inert'}).encode()))
print('team summary omission and actual-shape over-reservation refusal passed; no upstream')

with tempfile.TemporaryDirectory() as temp:
    body = json.loads(json.dumps(request))
    body['enforcement']['tokenLimit'] = 32_000_000
    body['enforcement']['nativeRolloutTokenLimit'] = 1_000_000
    body['enforcement']['restrictions']['maxOutputTokens'] = 32768
    supervisor = team.TeamSupervisor(pathlib.Path(temp), lambda args: b'', lambda: 'synthetic-boot')
    with patch.object(team.base.os, 'chown'):
        supervisor.prepare_team(body, {'inputMicroUsdPerToken': 1, 'outputMicroUsdPerToken': 1})
    p, state = supervisor.state(run, nonce)
    assert state['request']['tokenLimit'] == 32_000_000
    assert json.loads((p / 'task.json').read_bytes())['tokenLimit'] == 1_000_000
    assert (p / 'task.json').stat().st_mode & 0o777 == 0o444
    body['enforcement']['nativeRolloutTokenLimit'] = 4_000_000
    denied(lambda: team.preparation_request(body))
print('separate32M conservative broker /1M native rollout guards passed; no upstream')

for field, value in [('tokenLimit', 32_000_001), ('spendMicroUsd', 40_000_001)]:
    changed = json.loads(json.dumps(request))
    changed['enforcement'][field] = value
    denied(lambda: team.preparation_request(changed))

# Failed source preparation retains cleanup identity before any source writes.
with tempfile.TemporaryDirectory() as temp:
    supervisor = team.TeamSupervisor(pathlib.Path(temp), lambda args: b'', lambda: 'synthetic-boot')
    broken = json.loads(json.dumps(request))
    broken['candidate']['files'].append({'path':'src/../unsafe.ts', 'base64':encoded('inert')})
    broken['sourceTreeSha256'] = team.base.digest(sorted([{'path':f['path'],'sha256':team.hashlib.sha256(base64.b64decode(f['base64'])).hexdigest()} for f in broken['candidate']['files']], key=lambda f:f['path']))
    with patch.object(team.base.os, 'chown'):
        denied(lambda: supervisor.prepare_team(broken, {'inputMicroUsdPerToken':1,'outputMicroUsdPerToken':1}))
    p,state = supervisor.state(run, nonce)
    assert state['stage']=='failed' and state['terminalFailure']=='driver-error.json'
    assert supervisor.cleanup(run, nonce)['scratchRemoved']
    denied(lambda: supervisor.prepare_team(broken, {'inputMicroUsdPerToken':1,'outputMicroUsdPerToken':1}))
print('partial preparation terminal state and cleanup passed; no runtime/inference')
