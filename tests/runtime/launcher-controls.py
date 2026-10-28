"""Actual production Node launcher with an inert stand-in binary, no inference.

Explicit disposable Linux/Docker environment only. This proves argument/env and
bootstrap mechanics, not Codex/provider/model availability or runtime admission.
"""
import base64
import hashlib
import importlib.util
import json
import pathlib
import sys
import time
import uuid

project = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('launcher_supervisor', project/'scripts/experiments/agent/supervisor.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
root = pathlib.Path(sys.argv[1])
image = sys.argv[2]
# Fixed harmless executable checks the real launcher's arguments/environment.
stand_in = b'''#!/usr/local/bin/node
const assert = require('node:assert/strict');
const http = require('node:http');
const args = process.argv.slice(2);
assert.equal(args[0], 'exec');
assert.ok(args.includes('--ephemeral') && args.includes('--ignore-rules'));
assert.equal(args[args.indexOf('--model')+1], 'gpt-5.6-sol');
assert.equal(args[args.indexOf('--sandbox')+1], 'danger-full-access');
assert.equal(args[args.indexOf('-C')+1], '/workspace');
assert.ok(args.includes('approval_policy="never"'));
assert.ok(args.includes('model_auto_compact_token_limit=2000000'));
assert.ok(args.includes('model_providers.forecode_budget.request_max_retries=0'));
assert.ok(args.includes('model_providers.forecode_budget.stream_max_retries=0'));
assert.equal(args.at(-1), 'HARMLESS LAUNCHER CONTROL');
for (const key of Object.keys(process.env)) assert.ok(['PATH','HOME','CODEX_HOME','LANG'].includes(key));
assert.equal(process.env.CODEX_HOME, '/home/agent/.codex');
const fs = require('node:fs');
fs.mkdirSync(process.env.CODEX_HOME + '/startup-control');
fs.writeFileSync(process.env.CODEX_HOME + '/startup-control/state', 'inert');
assert.throws(() => fs.writeFileSync(process.env.CODEX_HOME + '/config.toml', 'denied'));
http.get('http://127.0.0.1:8787/v1/responses', res => {
 assert.equal(res.statusCode, 403); // No provider POST or credentials.
 console.log('HARMLESS_LAUNCHER_ASSERTIONS_PASSED');
}).on('error', () => process.exit(2));
'''
config = b'# Inert test-only configuration; no credentials or model call.\n'
node_hash = m.command(['run','--rm','--pull=never','--network=none','--read-only','--entrypoint','sha256sum',image,'/usr/local/bin/node']).decode().split()[0]

class Control(m.Supervisor):
    def worker_args(self, run_id, selected):
        args = super().worker_args(run_id, selected)
        position = args.index('type=bind,src=/home/agent/.codex/config.toml,dst=/home/agent/.codex/config.toml,readonly')
        args[position] = 'type=bind,src='+str(self.directory(run_id)/'config.toml')+',dst=/home/agent/.codex/config.toml,readonly'
        at = args.index('--entrypoint')
        args[at:at] = ['--mount','type=bind,src='+str(self.directory(run_id)/'codex')+',dst=/usr/local/bin/codex,readonly']
        return args

for changed in [False, True]:
    run_id, nonce = str(uuid.uuid4()), str(uuid.uuid4())
    s = Control(root)
    request = {'runId':run_id,'nonce':nonce,'candidate':{'runId':run_id,'files':[
        {'path':'package.json','base64':base64.b64encode(b'{}').decode()},
        {'path':'src/main.ts','base64':base64.b64encode(b'export const value = 1;').decode()}]},
        'workerImage':image,'prompt':'HARMLESS LAUNCHER CONTROL',
        'codexBinarySha256': 'a'*64 if changed else hashlib.sha256(stand_in).hexdigest(),
        'agentConfigSha256': hashlib.sha256(config).hexdigest(), 'workerNodeSha256':node_hash,
        'maxSeconds':10,'maxOutputBytes':4096,'model':'gpt-5.6-sol','tokenLimit':100000,'spendMicroUsd':1000000,
        'provider':{'endpoint':'https://api.openai.com/v1/responses','maxOutputTokens':32,'inputMicroUsdPerToken':1,'outputMicroUsdPerToken':1}}
    s.prepare(request)
    p=s.directory(run_id)
    (p/'codex').write_bytes(stand_in); (p/'codex').chmod(0o555)
    (p/'config.toml').write_bytes(config); (p/'config.toml').chmod(0o444)
    try:
        s.start(run_id, nonce)
        end=time.monotonic()+20
        while time.monotonic()<end:
            state=s.status(run_id,nonce)
            if state['stage'] in ['failed','terminated']:
                break
            time.sleep(.1)
        assert state['stage']=='terminated', state
        if changed:
            assert state['agent']['reason']=='spawn_error' and state['agent']['exitCode']==125, state
            try:
                s.finalize(run_id,nonce)
                raise AssertionError('changed bootstrap sealed')
            except ValueError:
                pass
        else:
            assert state['agent']['reason']=='completed' and state['agent']['exitCode']==0, state
            assert 'HARMLESS_LAUNCHER_ASSERTIONS_PASSED' in state['agent']['stdout'], state
            s.finalize(run_id,nonce)
        assert json.loads((p/'budget.json').read_text())['requests']==[]
        print(json.dumps({'case':'changed-binary' if changed else 'fixed-launcher','status':'PASS','actualAgent':'NOT_RUN','providerRequests':0}), flush=True)
    finally:
        s.cleanup(run_id,nonce)
