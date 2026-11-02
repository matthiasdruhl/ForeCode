"""Real local broker transport; synthetic upstream only, no credentials or model."""
import http.client
import json
import pathlib
import socket
import tempfile
import threading
import time
import types
import urllib.error
from unittest.mock import patch

source = pathlib.Path(__file__).resolve().parents[2] / 'scripts/experiments/agent/team-supervisor.py'
team = types.ModuleType('transient_controls')
team.__file__ = str(source)
exec(compile(source.read_bytes(), str(source), 'exec'), team.__dict__)


class LocalHTTP(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__('localhost', timeout=5)
        self.path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(str(self.path))


cases = [
    ('one503', [503, 200], 2, 20, 60, 200, 2),
    ('two503', [503, 503, 200], 2, 20, 60, 200, 3),
    ('exhausted', [503, 503, 503], 2, 20, 60, 503, 3),
    ('legacy', [503, 200], 0, 20, 60, 403, 1),
    ('quota', [503, 200], 2, 1, 60, 403, 1),
    ('deadline', [503, 200], 2, 20, 1, 503, 1),
    ('non503', [400, 200], 2, 20, 60, 403, 1),
    ('transport', ['timeout', 200], 2, 20, 60, 403, 1),
    ('invalid-response', ['invalid', 200], 2, 20, 60, 403, 1),
]
for name, sequence, retry_limit, requests, seconds, expected_status, expected_calls in cases:
    with tempfile.TemporaryDirectory() as temporary:
        directory = pathlib.Path(temporary)
        request = {'model': 'muse-spark-1.3-contributor', 'deadline': time.time()+seconds,
                   'maxRequests': requests, 'maxIterations': requests, 'tokenLimit': 32_000_000,
                   'spendMicroUsd': 40_000_000, 'maxTransientRetries': retry_limit,
                   'provider': {'endpoint': 'https://api.meta.ai/v1/responses', 'maxOutputTokens': 65536,
                                'inputMicroUsdPerToken': 1, 'outputMicroUsdPerToken': 1}}
        broker = team.TeamReservations(directory, request)
        calls = []

        def upstream(body):
            outcome = sequence[len(calls)]
            calls.append(body)
            if outcome == 'timeout':
                raise TimeoutError('PRIVATE_FAILURE_CANARY')
            if outcome == 'invalid':
                return b'not json', 'application/json'
            if outcome != 200:
                raise urllib.error.HTTPError('https://api.meta.ai/v1/responses', outcome, 'PRIVATE_FAILURE_CANARY', {}, None)
            return team.base.budget.canonical({'object': 'response', 'model': request['model'], 'service_tier': 'auto',
                'status': 'completed', 'output': [], 'usage': {'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2}}), 'application/json'

        path = directory/'gateway.sock'
        server = team.serve_team(path, broker, upstream)
        with patch.object(team.time, 'sleep', lambda _: None):
            thread = threading.Thread(target=server.handle_request)
            thread.start()
            client = LocalHTTP(path)
            client.request('POST', '/v1/responses', json.dumps({'model': request['model'], 'input': 'inert'}), {'Content-Type': 'application/json'})
            response = client.getresponse()
            payload = response.read()
            client.close()
            thread.join(timeout=5)
            server.server_close()
        assert not thread.is_alive(), name
        assert response.status == expected_status, (name, response.status, payload)
        assert len(calls) == expected_calls, (name, len(calls))
        assert len(broker.value['requests']) == expected_calls, name
        assert broker.value['reservedTokens'] == sum(x['inputTokenUpperBound']+x['maximumOutputTokens'] for x in broker.value['requests']), name
        assert broker.value['reservedMicroUsd'] == sum(x['reservedMicroUsd'] for x in broker.value['requests']), name
        if expected_status == 200:
            assert response.getheader('X-Forecode-Admitted-Requests') == str(expected_calls), name
            assert broker.value['blockedReason'] is None, name
            assert sum('observedUsage' in x for x in broker.value['requests']) == 1, name
            assert all(x.get('transientHttpStatus') == 503 for x in broker.value['requests'][:-1]), name
        else:
            assert 'observedUsage' not in broker.value['requests'][-1], name
        for file in directory.iterdir():
            if file.is_file():
                assert b'PRIVATE_FAILURE_CANARY' not in file.read_bytes(), (name, file.name)
print('nine transient503 broker controls passed; every retry reserved; unknown usage retained; no provider calls')
