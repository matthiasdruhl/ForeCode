"""Guest-only actual native rollout guard; synthetic usage, never inference.

Supply the same private public-fixture/enforcement envelope as the workflow
controls. The broker keeps its ordinary 32M reservation ceiling and the native
CLI its unchanged 1M rollout ceiling. Long harmless shell comments grow replay;
synthetic usage is always below the actual canonical input-byte reservation.
"""
import json
import pathlib
import sys
import time
import types
import uuid

file = pathlib.Path('/opt/forecode-agent/team-supervisor.py')
team = types.ModuleType('native_limit_control')
team.__file__ = str(file)
exec(compile(file.read_bytes(), str(file), 'exec'), team.__dict__)
root = pathlib.Path('/var/lib/forecode-native-limit-' + str(uuid.uuid4()))
root.mkdir(mode=0o700)
template = json.load(sys.stdin)
index = 0


def synthetic(sent):
    global index
    index += 1
    assert index <= 20
    output = [{'id': 'fc_' + str(index), 'type': 'function_call',
               'call_id': 'call_' + str(index), 'name': 'exec_command',
               'arguments': json.dumps({'cmd': 'true # ' + 'x' * 60000,
                                        'yield_time_ms': 10000,
                                        'max_output_tokens': 100})}]
    response = {'id': 'resp_' + str(index), 'object': 'response',
                'created_at': int(time.time()), 'model': template['enforcement']['model'],
                'service_tier': 'auto', 'status': 'completed', 'output': output,
                'usage': {'input_tokens': len(sent), 'output_tokens': 1,
                          'total_tokens': len(sent) + 1}}
    events = [{'type': 'response.created', 'response': {**response, 'output': [], 'status': 'in_progress'}},
              {'type': 'response.output_item.added', 'output_index': 0, 'item': output[0]},
              {'type': 'response.output_item.done', 'output_index': 0, 'item': output[0]},
              {'type': 'response.completed', 'response': response}]
    return b''.join(b'data: ' + team.base.budget.canonical(x) + b'\n\n' for x in events), 'text/event-stream'


serve = team.base.budget.serve
team.base.budget.serve = lambda socket, reservations: serve(socket, reservations, upstream=synthetic)
supervisor = team.TeamSupervisor(root)
run_id, nonce = str(uuid.uuid4()), str(uuid.uuid4())
files = template['files']
manifest = sorted([{'path': f['path'], 'sha256': team.hashlib.sha256(team.base.base64.b64decode(f['base64'])).hexdigest()}
                   for f in files], key=lambda x: x['path'])
enforcement = template['enforcement']
assert enforcement['tokenLimit'] == 32_000_000
assert enforcement['maxIterations'] == enforcement['restrictions']['maxRequests'] == 20
request = {'runId': run_id, 'nonce': nonce, 'studyId': 'synthetic-native-rollout-limit',
           'variant': 'A', 'sourceCommit': '0' * 40, 'sourceTreeSha256': team.base.digest(manifest),
           'sharedTaskSha256': '0' * 64, 'enforcement': enforcement,
           'candidate': {'runId': run_id, 'files': files}}
try:
    supervisor.prepare_team(request, template['provider'])
    task = json.loads((root / run_id / 'task.json').read_bytes())
    assert task['tokenLimit'] == 1_000_000
    supervisor.start(run_id, nonce)
    until = time.monotonic() + 340
    while time.monotonic() < until:
        status = supervisor.status(run_id, nonce)
        if status['stage'] in ('terminated', 'failed'):
            break
        time.sleep(.1)
    assert status['stage'] == 'terminated', status
    budget = json.loads((root / run_id / 'budget.json').read_bytes())
    assert 1 < len(budget['requests']) < 20
    assert budget['blockedReason'] is None and not (root / run_id / 'broker-refusal.json').exists()
    usage = sum(x['observedUsage']['totalTokens'] for x in budget['requests'])
    assert usage >= 1_000_000, usage
    assert budget['reservedTokens'] < 32_000_000 and budget['reservedMicroUsd'] < enforcement['spendMicroUsd']
    # Exit and native error text are retained separately; this control must
    # prove an actual native guard event rather than just a supplied flag.
    native = status['agent']['stdout'] + status['agent']['stderr']
    assert 'budget' in native.lower() and ('exceed' in native.lower() or 'exhaust' in native.lower()), status['agent']
    print(json.dumps({'origin': 'synthetic-usage-actual-native-CLI', 'root': str(root),
                      'requests': len(budget['requests']), 'syntheticTotalTokens': usage,
                      'nativeExitCode': status['agent']['exitCode'], 'providerRequests': 0}))
finally:
    cleanup = supervisor.cleanup(run_id, nonce)
    assert cleanup['absent'] and cleanup['scratchRemoved']
    assert (root / run_id / 'cleanup-source.json').is_file()
