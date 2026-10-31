"""Disposable filesystem and inert upstream only; no sockets/VM/provider/candidate."""
import hashlib
import json
import pathlib
import tempfile
import time
import types
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[2]
file = ROOT / 'scripts/experiments/agent/team-supervisor.py'
team = types.ModuleType('contract_controls')
team.__file__ = str(file)
exec(compile(file.read_bytes(), str(file), 'exec'), team.__dict__)
stop_observations = []


def keep_stop(root):
    raw = (root/'broker-refusal.json').read_bytes()
    refusal = json.loads(raw)
    stop_observations.append({'reasonCode': refusal['reasonCode'],
        'requestCount': refusal['requestCount'], 'refusalSha256': hashlib.sha256(raw).hexdigest()})


def refused(action):
    try:
        action()
    except ValueError:
        return
    raise AssertionError('expected refusal')


def request(count=20):
    return {'model': 'muse-spark-1.3-contributor', 'deadline': time.time()+60,
            'maxRequests': count, 'maxIterations': count, 'completionReserveRequests': min(3, count),
            'tokenLimit': 32_000_000, 'spendMicroUsd': 32_000_000,
            'provider': {'endpoint': 'https://api.meta.ai/v1/responses', 'maxOutputTokens': 16,
                         'inputMicroUsdPerToken': 1, 'outputMicroUsdPerToken': 1}}


def body():
    return json.dumps({'model': 'muse-spark-1.3-contributor', 'input': 'synthetic control',
        'tools': [{'type': 'function', 'name': 'exec_command'}]}).encode()


def reply(call=False, mixed=False, streaming=False, sent=None):
    message = {'type': 'message', 'role': 'assistant', 'content': [{'type': 'output_text', 'text': 'Synthetic final.'}]}
    tool = {'type': 'function_call', 'name': 'exec_command', 'call_id': 'inert', 'arguments': '{"cmd":"true"}'}
    items = [message, tool] if mixed else [tool] if call else [message]
    response = {'object': 'response', 'model': 'muse-spark-1.3-contributor', 'service_tier': 'auto',
                'status': 'completed', 'output': items,
                'usage': {'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2}}
    if sent:
        q = json.loads(sent)
        response.update(tools=q.get('tools', []), tool_choice=q.get('tool_choice'), instructions=q.get('instructions'))
    if not streaming:
        return json.dumps(response).encode(), 'application/json'
    events = [{'type': 'response.output_item.added', 'item': item} for item in items]
    events += [{'type': 'response.completed', 'response': response}]
    return b''.join(b'data: '+json.dumps(e).encode()+b'\n\n' for e in events), 'text/event-stream'


def event(root, ordinal, stage):
    p = root / f'request-{ordinal:04d}-{stage}.json'
    assert p.stat().st_mode & 0o777 == 0o400
    assert p.stat().st_size <= 8192
    return json.loads(p.read_bytes())


def upstream(reservations, callback):
    # Capture the real team's decorated upstream callable without creating a socket.
    captured = []
    def serve(socket, r, fn, refusal):
        assert r is reservations
        captured.append(fn)
        return types.SimpleNamespace(RequestHandlerClass=type('InertHandler', (), {}))
    with patch.object(team, '_base_serve', serve):
        team.serve_team(pathlib.Path('not-a-socket'), reservations, callback)
    return captured[0]


for streaming in (False, True):
    for final_call in (False, True):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            r = team.TeamReservations(root, request())
            forwarded = []
            for ordinal in range(1, 21):
                sent = r.reserve(body())
                q = json.loads(sent)
                admitted = event(root, ordinal, 'admitted')
                assert admitted['requestSha256'] == hashlib.sha256(sent).hexdigest()
                assert admitted['requestSha256'] == r.value['requests'][-1]['requestSha256']
                contract = admitted['details']
                assert contract['maxOutputTokens'] == 16
                assert contract['phase'] == ({18: 'completion', 19: 'validation', 20: 'final'}.get(ordinal, 'work'))
                assert contract['toolNames'] == ([] if ordinal == 20 else ['exec_command'])
                assert contract['toolTypes'] == ([] if ordinal == 20 else ['function'])
                assert contract['requestsRemainingAfterAdmission'] == 20-ordinal
                response = reply(call=ordinal < 20, mixed=ordinal == 20 and final_call,
                                 streaming=streaming, sent=sent)
                actual = upstream(r, lambda b: response)(sent)
                assert actual == response
                start = event(root, ordinal, 'upstream-started')
                tokens = r.value['reservedTokens'], r.value['reservedMicroUsd']
                if ordinal == 20 and final_call:
                    refused(lambda: r.observe(*actual, sent))
                    result = event(root, ordinal, 'response-rejected')
                    assert result['details']['reasonCode'] == 'final-tool-call'
                    assert result['details']['outputItemKinds']['counts'] == {'message': 1, 'function_call': 1}
                    assert result['details']['echoedToolsCount'] == 0
                    assert result['details']['echoedInstructionsSha256'] == contract['instructionsSha256']
                    assert 'observedUsage' not in r.value['requests'][-1]
                    assert (root/'unverified-response.bin').read_bytes() == actual[0]
                else:
                    r.observe(*actual, sent)
                    forwarded.append(actual)
                    result = event(root, ordinal, 'response-accepted')
                    assert r.value['requests'][-1]['observedUsage']['totalTokens'] == 2
                received = event(root, ordinal, 'response-received')
                assert admitted['brokerElapsedMs'] <= start['brokerElapsedMs'] <= received['brokerElapsedMs'] <= result['brokerElapsedMs']
                assert (r.value['reservedTokens'], r.value['reservedMicroUsd']) == tokens
            assert len(forwarded) == (19 if final_call else 20)
            refused(lambda: r.reserve(body()))
            assert len(r.value['requests']) == 20
            assert not list(root.glob('request-0021-*'))

# Original arbitrary input/response type strings, text, arguments, IDs, metadata,
# and instruction content cannot become diagnostic keys/values. Hashes only.
with tempfile.TemporaryDirectory() as temp:
    root = pathlib.Path(temp); r = team.TeamReservations(root, request())
    secret = 'PRIVATE_DIAGNOSTIC_CANARY_7c1965'
    q = json.loads(body())
    q.update(instructions=secret, input=[{'type': secret, 'text': secret}, {'type': 'message', 'content': secret}],
             client_metadata={'private': secret}, prompt_cache_key=secret)
    sent = r.reserve(json.dumps(q).encode())
    assert secret not in json.dumps(event(root, 1, 'admitted'))
    assert event(root, 1, 'admitted')['details']['inputItemKinds']['counts'] == {'other': 1, 'message': 1}
    output = json.loads(reply()[0]);output.update(tool_choice=secret, instructions=secret, id=secret)
    output['output'] = [{'type': secret, 'name': secret, 'arguments': secret}]
    refused(lambda: r.observe(json.dumps(output).encode(), 'application/json', sent))
    for p in root.glob('request-*.json'):
        assert secret not in p.read_text()
    assert event(root, 1, 'response-rejected')['details']['outputItemKinds']['counts'] == {'other': 1}
    assert team.TeamReservations.kind_counts([{'type': 'message'}]*4097) == {'counts': {'message': 4096}, 'truncated': True}

# Existing/aliased diagnostic entries never get overwritten, and failures after
# reservation never permit another send or refund any budget.
for link in (False, True):
    with tempfile.TemporaryDirectory() as temp:
        root = pathlib.Path(temp); r = team.TeamReservations(root, request())
        target = root/'preserved';target.write_text('original')
        path = root/'request-0001-admitted.json'
        if link: path.symlink_to(target)
        else: path.write_text('original')
        refused(lambda: r.reserve(body()))
        assert r.contract_failed and len(r.value['requests']) == 1
        assert json.loads((root/'broker-refusal.json').read_bytes())['reasonCode'] == 'invalid-request'
        keep_stop(root)
        assert target.read_text() == 'original' and path.read_text() == 'original'
        refused(lambda: r.reserve(body()))

with tempfile.TemporaryDirectory() as temp:
    root = pathlib.Path(temp);r = team.TeamReservations(root, request())
    sent = r.reserve(body());calls = []
    (root/'request-0001-upstream-started.json').mkdir()
    fn = upstream(r, lambda b: calls.append(b))
    try: fn(sent)
    except ValueError as error: r.record_refusal(error, 'upstream')
    else: raise AssertionError('diagnostic failure must prevent send')
    assert calls == [] and r.contract_failed
    assert json.loads((root/'broker-refusal.json').read_bytes())['reasonCode'] == 'upstream'
    keep_stop(root)
    refused(lambda: r.reserve(body()))

for stage in ('response-received', 'response-accepted', 'response-rejected'):
    with tempfile.TemporaryDirectory() as temp:
        root = pathlib.Path(temp);r = team.TeamReservations(root, request(1))
        sent = r.reserve(body());counts = r.value['reservedTokens'], r.value['reservedMicroUsd']
        (root/f'request-0001-{stage}.json').mkdir()
        output, media = reply(mixed=stage == 'response-rejected')
        try:
            r.observe(output, media, sent)
        except ValueError as error:
            if stage == 'response-rejected':
                assert str(error) == 'unverified provider outcome'
                failure = json.loads((root/'provider-failure.json').read_bytes())
                assert failure['reasonSha256'] == hashlib.sha256(b'tool call during final response reserve').hexdigest()
            r.record_refusal(error, 'response-validation')
            keep_stop(root)
        else:
            raise AssertionError('storage failure must not permit delivery')
        assert r.contract_failed and r.value['blockedReason'] == 'provider-outcome-unverified'
        assert (root/'unverified-response.bin').read_bytes() == output
        assert ('observedUsage' in r.value['requests'][0]) == (stage == 'response-accepted')
        assert (r.value['reservedTokens'], r.value['reservedMicroUsd']) == counts
        refused(lambda: r.reserve(body()))

with tempfile.TemporaryDirectory() as temp:
    root = pathlib.Path(temp);r = team.TeamReservations(root, request());sent = r.reserve(body())
    def fail(body): raise OSError('private transport diagnostic must not be stored')
    try: upstream(r, fail)(sent)
    except OSError: pass
    else: raise AssertionError('transport exception must survive')
    assert event(root, 1, 'upstream-failed')['details'] == {}
    assert 'private transport' not in (root/'request-0001-upstream-failed.json').read_text()

print('team contract controls passed: canonical shape, bounded privacy, phase timing, JSON/SSE refusal, storage latches; no sockets/runtime/upstream')
print(json.dumps({'brokerStops': stop_observations}))
