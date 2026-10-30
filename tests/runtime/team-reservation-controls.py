"""Credential-free 20-request replay and durable pre-send refusal controls.

Only synthetic text and locally authenticated synthetic responses are used.
Never accesses an installed VM, candidate, protected assertion or provider.
"""
import hashlib
import http.client
import json
import pathlib
import socket
import tempfile
import threading
import time
import types
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[2]
file = ROOT / 'scripts/experiments/agent/team-supervisor.py'
team = types.ModuleType('team_reservation_controls')
team.__file__ = str(file)
exec(compile(file.read_bytes(), str(file), 'exec'), team.__dict__)


def request(**changes):
    return {'model': 'muse-spark-1.3-contributor', 'deadline': time.time() + 60,
            'maxRequests': 20, 'maxIterations': 20, 'tokenLimit': 32_000_000,
            'spendMicroUsd': 32_000_000, 'provider': {
                'endpoint': 'https://api.meta.ai/v1/responses', 'maxOutputTokens': 32768,
                'inputMicroUsdPerToken': 1, 'outputMicroUsdPerToken': 1}, **changes}


def raw(input='inert', **changes):
    return team.base.budget.canonical({'model': 'muse-spark-1.3-contributor', 'input': input, **changes})


def refusal(broker, body, code):
    before = team.base.budget.canonical(broker.value)
    try:
        broker.reserve(body)
    except ValueError:
        pass
    else:
        raise AssertionError('must refuse before send')
    file = broker.file.parent / 'broker-refusal.json'
    result = json.loads(file.read_bytes())
    assert result['reasonCode'] == code, result
    assert result['refusedRequestSha256'] == hashlib.sha256(body).hexdigest()
    assert result['requestBytes'] == len(body)
    assert file.stat().st_mode & 0o777 == 0o400
    assert before == team.base.budget.canonical(broker.value)
    original = file.read_bytes()
    try:
        broker.reserve(raw())
    except ValueError:
        pass
    else:
        raise AssertionError('no later send after refusal')
    assert original == file.read_bytes()
    assert before == team.base.budget.canonical(broker.value)
    return result


for changes, body, code in [
    ({'tokenLimit': 1}, raw(), 'token-capacity'),
    ({'spendMicroUsd': 1}, raw(), 'money-capacity'),
    ({'tokenLimit': 1, 'spendMicroUsd': 1}, raw(), 'token-and-money-capacity'),
    ({'maxRequests': 0}, raw(), 'request-count'),
    ({'maxIterations': 0}, raw(), 'iteration-count'),
    ({'deadline': 0}, raw(), 'deadline-or-request-bytes'),
    ({}, b'x' * 1_048_577, 'request-bytes'),
    ({}, raw(['inert'] * 4100), 'history-nodes'),
    ({}, raw([{'type': 'reasoning', 'encrypted_content': 'unknown'}]), 'unauthenticated-opaque-context'),
    ({}, raw(tools=[{'type': 'function', 'name': 'web_search'}]), 'tool-declaration'),
    ({}, raw([{'type': 'function_call', 'name': 'read_private_oracle'}]), 'history-tool'),
    ({}, raw('SECRET-CONTROL', arbitrary='NEVER-LOG-ME'), 'invalid-request'),
]:
    with tempfile.TemporaryDirectory() as temp:
        broker = team.TeamReservations(pathlib.Path(temp), request(**changes))
        diagnostic = refusal(broker, body, code)
        serialized = json.dumps(diagnostic)
        assert 'SECRET-CONTROL' not in serialized and 'NEVER-LOG-ME' not in serialized
        if diagnostic['projection']:
            assert diagnostic['projection']['inputTokenUpperBound'] > 16384

# A diagnostic write failure still latches; a worker cannot replace a private
# record or cause accounting to be resumed. Nothing follows a denied request.
with tempfile.TemporaryDirectory() as temp:
    broker = team.TeamReservations(pathlib.Path(temp), request(tokenLimit=1))
    with patch.object(team.os, 'open', side_effect=OSError('synthetic disk failure')):
        try:
            broker.reserve(raw())
        except OSError:
            pass
        else:
            raise AssertionError('disk failure expected')
    assert broker.local_refused and not broker.value['requests']
    try:
        broker.reserve(raw())
    except ValueError:
        pass
    else:
        raise AssertionError('logging failure cannot enable a later send')


def growth(token_limit, spend, near_envelope=False):
    with tempfile.TemporaryDirectory() as temp:
        broker = team.TeamReservations(pathlib.Path(temp), request(tokenLimit=token_limit, spendMicroUsd=spend))
        history = [{'role': 'user', 'content': 'harmless ' * 2700}]
        for index in range(20):
            body = raw(history)
            if near_envelope:
                # Exercise almost the full byte envelope while accumulating one
                # authenticated opaque reasoning item per preceding response.
                body = raw(history, instructions='x' * (1_048_000 - len(body)))
            try:
                sent = broker.reserve(body)
            except ValueError:
                return {'completedRequests': index, 'reservedTokens': broker.value['reservedTokens'],
                        'refusal': json.loads((pathlib.Path(temp) / 'broker-refusal.json').read_bytes())['reasonCode']}
            assert json.loads(sent)['max_output_tokens'] == 32768
            item = {'id': f'inert-{index}', 'type': 'reasoning', 'encrypted_content': f'{index}:' + 'c' * 4096}
            output = {'object': 'response', 'model': broker.request['model'], 'service_tier': 'auto',
                      'status': 'completed', 'output': [item], 'usage': {
                          'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2}}
            broker.observe(team.base.budget.canonical(output), 'application/json', sent)
            # Even with observed output=1, every replay remains bound to32768.
            assert set(broker.value['opaqueInputs'].values()) == {32768}
            history += [item, {'type': 'function_call_output', 'call_id': f'inert-{index}', 'output': 'r' * 12000}]
        return {'completedRequests': 20, 'reservedTokens': broker.value['reservedTokens'],
                'reservedMicroUsd': broker.value['reservedMicroUsd'], 'refusal': None}

old = growth(4_000_000, 6_000_000)
new = growth(32_000_000, 32_000_000)
envelope = growth(32_000_000, 32_000_000, True)
assert old['completedRequests'] < 20 and old['refusal'] == 'token-capacity'
assert new['completedRequests'] == envelope['completedRequests'] == 20
assert new['reservedTokens'] < 32_000_000 and envelope['reservedTokens'] < 32_000_000
print(json.dumps({'origin': 'synthetic-no-upstream', 'old': old, 'new': new, 'nearByteEnvelope': envelope}))

# Actual fixed HTTP path: refused reservation, malformed HTTP and valid local
# response. No networking except one private AF_UNIX test socket.
class UnixHTTP(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__('localhost', timeout=5)
        self.path = path
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(str(self.path))

for changes, body, path, expected, calls in [
    ({'tokenLimit': 1}, raw(), '/v1/responses', 403, 0),
    ({}, raw(), '/bad', 403, 0),
    ({}, raw(), '/v1/responses', 200, 1),
]:
    with tempfile.TemporaryDirectory() as temp:
        broker = team.TeamReservations(pathlib.Path(temp), request(**changes))
        seen = []
        def upstream(sent):
            seen.append(sent)
            return team.base.budget.canonical({'object': 'response', 'model': broker.request['model'],
                'service_tier': 'auto', 'status': 'completed', 'output': [],
                'usage': {'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2}}), 'application/json'
        file = pathlib.Path(temp) / 'gateway.sock'
        server = team.serve_team(file, broker, upstream)
        thread = threading.Thread(target=server.handle_request)
        thread.start()
        client = UnixHTTP(file)
        client.request('POST', path, body, {'Content-Type': 'application/json'})
        response = client.getresponse()
        assert response.status == expected
        payload = response.read()
        client.close(); thread.join(); server.server_close()
        assert len(seen) == calls
        if expected == 403:
            assert payload == b'{"error":{"message":"Bounded provider request unavailable"}}'
            assert (pathlib.Path(temp) / 'broker-refusal.json').is_file()
print('durable numeric refusal diagnostics, latch, fixed envelope and zero-send negative controls passed')
