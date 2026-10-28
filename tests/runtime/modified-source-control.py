"""Harmless source transform through the actual outside-worker supervisor."""
import importlib.util
import json
import pathlib
import sys

file = pathlib.Path(__file__).parent / 'supervisor-controls.py'
spec = importlib.util.spec_from_file_location('harmless_controls', file)
controls = importlib.util.module_from_spec(spec)
spec.loader.exec_module(controls)
input = json.loads(sys.stdin.buffer.read(12_000_001))
assert input['mode'] in ['booking-pass', 'booking-reject']
request = input['request']
s = controls.Controls(input['mode'], pathlib.Path(sys.argv[1]))
run_id, nonce = request['runId'], request['nonce']
try:
    s.prepare(request)
    s.start(run_id, nonce)
    state = controls.wait(s, run_id, nonce)
    assert state['stage'] == 'terminated' and state['agent']['exitCode'] == 0, state
    result = s.finalize(run_id, nonce)
    result['classification'] = 'HARMLESS_TRANSFORM_NO_CODING_AGENT'
    print(json.dumps(result))
finally:
    s.cleanup(run_id, nonce)
