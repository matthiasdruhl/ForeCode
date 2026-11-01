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
        except team.base.budget.ReservationCapacityError as error:
            assert str(error) == 'hard reservation exhausted'
        else:
            raise AssertionError('original capacity refusal must survive diagnostic disk failure')
    assert broker.local_refused and not broker.value['requests']
    try:
        broker.reserve(raw())
    except ValueError:
        pass
    else:
        raise AssertionError('logging failure cannot enable a later send')


def growth(token_limit, spend, near_envelope=False, maximum=20, opaque=True):
    with tempfile.TemporaryDirectory() as temp:
        broker = team.TeamReservations(pathlib.Path(temp), request(tokenLimit=token_limit, spendMicroUsd=spend, maxRequests=maximum, maxIterations=maximum))
        history = [{'role': 'user', 'content': 'harmless ' * 2700}]
        for index in range(maximum):
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
            output_cap = json.loads(sent)['max_output_tokens']
            assert 16 <= output_cap <= 32768
            item = {'id': f'inert-{index}', 'type': 'reasoning', 'encrypted_content': f'{index}:' + 'c' * 4096}
            output = {'object': 'response', 'model': broker.request['model'], 'service_tier': 'auto',
                      'status': 'completed', 'output': [item], 'usage': {
                          'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2}}
            broker.observe(team.base.budget.canonical(output), 'application/json', sent)
            # Even with observed output=1, every replay remains bound to32768.
            assert broker.value['opaqueInputs'][hashlib.sha256(item['encrypted_content'].encode()).hexdigest()] == output_cap
            if opaque: history += [item, {'type': 'function_call_output', 'call_id': f'inert-{index}', 'output': 'r' * 12000}]
        return {'completedRequests': maximum, 'reservedTokens': broker.value['reservedTokens'],
                'reservedMicroUsd': broker.value['reservedMicroUsd'], 'refusal': None}

old = growth(4_000_000, 6_000_000)
new = growth(32_000_000, 32_000_000)
envelope = growth(32_000_000, 32_000_000, True)
assert old['completedRequests'] < 20 and old['refusal'] == 'token-capacity'
assert new['completedRequests'] == envelope['completedRequests'] == 20
assert new['reservedTokens'] < 32_000_000 and envelope['reservedTokens'] < 32_000_000
print(json.dumps({'origin': 'synthetic-no-upstream', 'old': old, 'new': new, 'nearByteEnvelope': envelope}))
compact60 = growth(32_000_000, 32_000_000, maximum=60, opaque=False)
growing60 = growth(32_000_000, 32_000_000, maximum=60)
assert compact60['completedRequests'] == 60
assert growing60['completedRequests'] < 60 and growing60['refusal'] in ('token-capacity', 'token-and-money-capacity'), growing60
print(json.dumps({'unregistered60RequestProposal': {'compact': compact60, 'growingReplay': growing60}, 'otherCeilingsRemainBinding': True}))

# Last round is an ordinary paid reservation, with no tools and no hidden21st
# send. Uncooperative tool output is still refused rather than executed.
with tempfile.TemporaryDirectory() as temp:
    broker = team.TeamReservations(pathlib.Path(temp), request(maxRequests=2, maxIterations=2, completionReserveRequests=2))
    first = broker.reserve(raw(tools=[{'type': 'function', 'name': 'exec_command'}]))
    assert json.loads(first)['tools']
    final = broker.reserve(raw(tools=[{'type': 'function', 'name': 'exec_command'}], instructions=None))
    assert json.loads(final)['tool_choice'] == 'auto' and json.loads(final)['tools'] == []
    assert isinstance(json.loads(final)['instructions'], str)
    assert len(broker.value['requests']) == 2
    refusal(broker, raw(), 'request-count')
with tempfile.TemporaryDirectory() as temp:
    broker = team.TeamReservations(pathlib.Path(temp), request(maxRequests=1, maxIterations=1, completionReserveRequests=1))
    sent = broker.reserve(raw())
    response = {'object': 'response', 'model': broker.request['model'], 'service_tier': 'auto', 'status': 'completed', 'output': [{'type': 'function_call', 'name': 'exec_command', 'arguments': '{}'}], 'usage': {'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2}}
    try: broker.observe(team.base.budget.canonical(response), 'application/json', sent)
    except ValueError: pass
    else: raise AssertionError('final-round tools must never execute')
    assert broker.value['blockedReason'] == 'provider-outcome-unverified'

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
            assert response.getheader('X-Forecode-Stop') == ('token-capacity' if changes else None)
print('durable numeric refusal diagnostics, latch, fixed envelope and zero-send negative controls passed')

# Exercise the actual HTTP admission boundary after twenty successful local
# sends, independently of whether the native CLI chooses to stop at its final.
for limit in ['maxRequests', 'maxIterations']:
    with tempfile.TemporaryDirectory() as temp:
        broker = team.TeamReservations(pathlib.Path(temp), request(
            maxRequests=20 if limit == 'maxRequests' else 21,
            maxIterations=20 if limit == 'maxIterations' else 21,
            completionReserveRequests=3))
        seen = []
        def upstream(sent):
            seen.append(sent)
            return team.base.budget.canonical({'object': 'response', 'model': broker.request['model'],
                'service_tier': 'auto', 'status': 'completed', 'output': [],
                'usage': {'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2}}), 'application/json'
        socket_path = pathlib.Path(temp) / 'gateway.sock'
        server = team.serve_team(socket_path, broker, upstream)
        for index in range(21):
            thread = threading.Thread(target=server.handle_request); thread.start()
            client = UnixHTTP(socket_path)
            client.request('POST', '/v1/responses', raw(), {'Content-Type': 'application/json'})
            response = client.getresponse(); response.read(); client.close(); thread.join()
            assert response.status == (200 if index < 20 else 403)
        server.server_close()
        assert len(seen) == len(broker.value['requests']) == 20
        assert json.loads((pathlib.Path(temp) / 'broker-refusal.json').read_bytes())['reasonCode'] == (
            'request-count' if limit == 'maxRequests' else 'iteration-count')
        assert broker.value['reservedTokens'] == sum(x['inputTokenUpperBound'] + x['maximumOutputTokens'] for x in broker.value['requests'])
print('HTTP request21 and independent iteration21 refused before local upstream; reservations retained')

for failure_stage in ['admission', 'observation']:
    with tempfile.TemporaryDirectory() as temp:
        broker = team.TeamReservations(pathlib.Path(temp), request(
            maxRequests=2, maxIterations=2, completionReserveRequests=2))
        seen = []
        def upstream(sent):
            seen.append(sent)
            return team.base.budget.canonical({'object': 'response', 'model': broker.request['model'],
                'service_tier': 'auto', 'status': 'completed', 'output': [],
                'usage': {'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2}}), 'application/json'
        save = broker.contract_event
        def fail_storage(stage, sent, details=None):
            if stage == ('admitted' if failure_stage == 'admission' else 'response-received'):
                with patch.object(team.os, 'link', side_effect=OSError('synthetic diagnostic storage failure')):
                    return save(stage, sent, details)
            return save(stage, sent, details)
        socket_path = pathlib.Path(temp) / 'gateway.sock'
        server = team.serve_team(socket_path, broker, upstream)
        with patch.object(broker, 'contract_event', side_effect=fail_storage):
            thread = threading.Thread(target=server.handle_request); thread.start()
            client = UnixHTTP(socket_path)
            client.request('POST', '/v1/responses', raw(), {'Content-Type': 'application/json'})
            response = client.getresponse(); response.read(); client.close(); thread.join()
            assert response.status == 403
        server.server_close()
        assert len(seen) == int(failure_stage == 'observation')
        assert len(broker.value['requests']) == 1
        assert 'observedUsage' not in broker.value['requests'][0]
        assert broker.value['reservedTokens'] > 0 and broker.value['reservedMicroUsd'] > 0
        if failure_stage == 'observation':
            assert (pathlib.Path(temp) / 'unverified-response.bin').is_file()
        try: broker.reserve(raw())
        except ValueError: pass
        else: raise AssertionError('storage recovery must not reopen admission')
print('HTTP diagnostic-storage failures refuse before delivery, retain unknown usage and latch admission')

# Provider Content-Type parameters are never copied into the local HTTP envelope.
with tempfile.TemporaryDirectory() as temp:
    broker = team.TeamReservations(pathlib.Path(temp), request())
    def upstream(sent):
        return team.base.budget.canonical({'object': 'response', 'model': broker.request['model'],
            'service_tier': 'auto', 'status': 'completed', 'output': [],
            'usage': {'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2}}), 'application/json; charset=utf-8\r\nX-Provider-Canary: private'
    socket_path = pathlib.Path(temp) / 'gateway.sock'
    server = team.serve_team(socket_path, broker, upstream)
    thread = threading.Thread(target=server.handle_request); thread.start()
    client = UnixHTTP(socket_path)
    client.request('POST', '/v1/responses', raw(), {'Content-Type': 'application/json'})
    response = client.getresponse(); response.read(); client.close(); thread.join(); server.server_close()
    assert response.status == 200 and response.getheader('Content-Type') == 'application/json'
    assert response.getheader('X-Provider-Canary') is None
print('provider header parameters excluded from local HTTP response')
