"""Pure/private mechanics; no Docker, provider, sandbox or agent invocation."""
import hashlib
import importlib.util
import json
import os
import pathlib
import py_compile
import socket
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

# These imports inspect trusted source. Never create bytecode beside it: that
# changes the source commitment while other tests authenticate producer records.
sys.dont_write_bytecode = True

project = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('booking_supervisor_unit', project / 'scripts/experiments/agent/supervisor.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class Mechanics(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='forecode-supervisor-unit-')
        self.root = pathlib.Path(self.temp.name)

    def tearDown(self):
        for parent, _, _ in os.walk(self.root):
            os.chmod(parent, 0o700)
        self.temp.cleanup()

    def budget_request(self, **changes):
        request = {'model': 'gpt-5.6-sol', 'deadline': time.time() + 60, 'tokenLimit': 100000, 'spendMicroUsd': 1000000,
                   'provider': {'endpoint': 'https://api.openai.com/v1/responses', 'maxOutputTokens': 4096, 'inputMicroUsdPerToken': 1, 'outputMicroUsdPerToken': 2}}
        request.update(changes)
        return request

    def budget(self, **changes):
        return m.budget.Reservations(self.root, self.budget_request(**changes))

    def raw(self, **changes):
        value = {'model': 'gpt-5.6-sol', 'input': 'Harmless synthetic text.'}
        value.update(changes)
        return json.dumps(value).encode()

    def response(self, **changes):
        value = {'object': 'response', 'model': 'gpt-5.6-sol', 'service_tier': 'default',
                 'status': 'completed', 'output': [],
                 'usage': {'input_tokens': 100, 'output_tokens': 20, 'total_tokens': 120,
                           'input_tokens_details': {'cached_tokens': 0, 'cache_write_tokens': 0}}}
        value.update(changes)
        return value

    def test_provider_response_mismatch_stops_further_paid_attempts(self):
        cases = [self.response(model='another-model'), self.response(service_tier='priority'),
                 self.response(usage=None), self.response(status='in_progress'),
                 self.response(usage={'input_tokens': 100001, 'output_tokens': 20, 'total_tokens': 100021}),
                 self.response(usage={'input_tokens': 100, 'output_tokens': 4097, 'total_tokens': 4197}),
                 self.response(usage={'input_tokens': 100, 'output_tokens': 20, 'total_tokens': 119}),
                 self.response(usage={'input_tokens': True, 'output_tokens': 20, 'total_tokens': 21}),
                 self.response(usage={'input_tokens': 100, 'output_tokens': 20, 'total_tokens': 120,
                                     'input_tokens_details': {'cached_tokens': 90, 'cache_write_tokens': 20}})]
        for index, response in enumerate(cases):
            with self.subTest(index=index):
                directory = self.root / str(index)
                directory.mkdir()
                b = m.budget.Reservations(directory, self.budget_request())
                sent = b.reserve(self.raw())
                reserved = b.value['reservedMicroUsd']
                with self.assertRaises(ValueError):
                    b.observe(json.dumps(response).encode(), 'application/json', sent)
                with self.assertRaises(ValueError):
                    b.reserve(self.raw())
                disk = json.loads((directory/'budget.json').read_text())
                self.assertEqual(disk['reservedMicroUsd'], reserved)
                self.assertEqual(disk['blockedReason'], 'provider-outcome-unverified')

    def test_stream_requires_one_complete_matching_terminal_response(self):
        complete = b'data: '+json.dumps({'type':'response.completed', 'response': self.response()}).encode()+b'\n\n'
        cases = [b'data: {"type":"response.created"}\n\ndata: [DONE]\n',
                 complete + complete, b'data: {"type":"error"}\n\n' + complete,
                 b'data: '+json.dumps({'type':'response.completed', 'response': self.response(status='incomplete')}).encode()+b'\n\n']
        for index, output in enumerate(cases):
            with self.subTest(index=index):
                directory = self.root / str(index)
                directory.mkdir()
                b = m.budget.Reservations(directory, self.budget_request())
                sent = b.reserve(self.raw(stream=True))
                with self.assertRaises(ValueError):
                    b.observe(output, 'text/event-stream', sent)
                with self.assertRaises(ValueError):
                    b.reserve(self.raw())

    def test_verified_incomplete_output_retains_full_reservation_and_can_continue(self):
        b = self.budget()
        sent = b.reserve(self.raw())
        reserved = b.value['reservedMicroUsd']
        b.observe(json.dumps(self.response(status='incomplete')).encode(), 'application/json', sent)
        self.assertEqual(b.value['reservedMicroUsd'], reserved)
        b.reserve(self.raw())

    def test_meta_reserves_exact_pair_and_accepts_bounded_usage_without_optional_cache_details(self):
        provider = {'endpoint':'https://api.meta.ai/v1/responses','maxOutputTokens':4096,
                    'inputMicroUsdPerToken':2,'outputMicroUsdPerToken':5}
        b = self.budget(model='muse-spark-1.3', provider=provider)
        sent = b.reserve(self.raw(model='muse-spark-1.3'))
        self.assertEqual(json.loads(sent)['model'], 'muse-spark-1.3')
        self.assertEqual(json.loads(sent)['service_tier'], 'auto')
        response=self.response(model='muse-spark-1.3',service_tier='auto',usage={'input_tokens':100,'output_tokens':20,'total_tokens':120})
        b.observe(json.dumps(response).encode(), 'application/json', sent)
        disk=json.loads((self.root/'budget.json').read_text())
        self.assertEqual(disk['requests'][0]['observedUsage'],{'inputTokens':100,'outputTokens':20,'totalTokens':120,'cachedTokens':0})
        self.assertEqual(disk['requests'][0]['serviceTier'],'auto')
        with self.assertRaises(ValueError):
            b.reserve(self.raw(model='gpt-5.6-sol'))
        self.assertLessEqual(b.value['reservedMicroUsd'],1000000)

    def test_meta_rejects_unreviewed_service_tiers_without_refunding_or_more_calls(self):
        for index,tier in enumerate(['default','priority','flex','scale',None]):
            with self.subTest(tier=tier):
                directory=self.root/str(index);directory.mkdir()
                request=self.budget_request(model='muse-spark-1.3',provider={'endpoint':'https://api.meta.ai/v1/responses','maxOutputTokens':256,'inputMicroUsdPerToken':2,'outputMicroUsdPerToken':5})
                b=m.budget.Reservations(directory,request)
                sent=b.reserve(self.raw(model='muse-spark-1.3'))
                reserved=b.value['reservedMicroUsd']
                response=self.response(model='muse-spark-1.3',service_tier=tier)
                with self.assertRaises(ValueError):b.observe(json.dumps(response).encode(),'application/json',sent)
                with self.assertRaises(ValueError):b.reserve(self.raw(model='muse-spark-1.3'))
                self.assertEqual(b.value['reservedMicroUsd'],reserved)
                self.assertNotIn('observedUsage',b.value['requests'][0])

    def test_model_endpoint_substitution_and_meta_subminimum_output_are_denied(self):
        for model, endpoint in [('muse-spark-1.3','https://api.openai.com/v1/responses'),
                                ('gpt-5.6-sol','https://api.meta.ai/v1/responses'),
                                ('muse-spark-1.3-contributor','https://api.meta.ai/v1/responses')]:
            with self.subTest(model=model), self.assertRaises(ValueError):
                m.budget.reviewed_profile({'model':model,'provider':{'endpoint':endpoint}})
        provider={'endpoint':'https://api.meta.ai/v1/responses','maxOutputTokens':15,
                  'inputMicroUsdPerToken':2,'outputMicroUsdPerToken':5}
        b=self.budget(model='muse-spark-1.3',provider=provider)
        with self.assertRaises(ValueError):b.reserve(self.raw(model='muse-spark-1.3'))
        self.assertEqual(b.value['requests'],[])

    def test_meta_multiple_explicit_context_turns_keep_full_reservations_and_same_spend_cap(self):
        b=self.budget(model='muse-spark-1.3',tokenLimit=500000,spendMicroUsd=900000,
                      provider={'endpoint':'https://api.meta.ai/v1/responses','maxOutputTokens':4096,
                                'inputMicroUsdPerToken':2,'outputMicroUsdPerToken':5})
        for _ in range(4):
            sent=b.reserve(self.raw(model='muse-spark-1.3',input='x'*30259))
            reserved=b.value['reservedMicroUsd']
            response=self.response(model='muse-spark-1.3',service_tier='auto',usage={'input_tokens':5000,'output_tokens':100,'total_tokens':5100})
            b.observe(json.dumps(response).encode(),'application/json',sent)
            self.assertEqual(b.value['reservedMicroUsd'],reserved)
        self.assertEqual(len(b.value['requests']),4)
        self.assertGreater(b.value['reservedTokens'],100000)
        self.assertLessEqual(b.value['reservedTokens'],500000)
        self.assertLessEqual(b.value['reservedMicroUsd'],900000)

    def test_each_provider_uses_only_its_fixed_endpoint_and_host_proxy_sentinel(self):
        calls=[]
        class Reply:
            status=200
            headers={'Content-Type':'application/json'}
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self,limit):return b'{}'
        class Opener:
            def open(self,request,timeout):
                calls.append((request.full_url,request.get_header('Authorization')))
                return Reply()
        with mock.patch.dict(m.budget.os.environ,{'HTTPS_PROXY':'http://proxy.invalid:3128'}), \
             mock.patch.object(m.budget.urllib.request,'build_opener',return_value=Opener()):
            for model in ['gpt-5.6-sol','muse-spark-1.3']:
                m.budget.provider_request(self.raw(model=model))
            with self.assertRaises(ValueError):m.budget.provider_request(self.raw(model='unapproved'))
        self.assertEqual(calls,[('https://api.openai.com/v1/responses','Bearer sk-sandbox'),
                                ('https://api.meta.ai/v1/responses','Bearer forecode-meta-sandbox')])

    def test_reserves_before_forwarding_and_preserves_integer_ceilings(self):
        b = self.budget()
        out = json.loads(b.reserve(self.raw(max_output_tokens=999999, service_tier='priority', prompt_cache_key='synthetic-cache', client_metadata={'untrusted':'text'}, stream_options={'include_obfuscation':True}, include=['reasoning.encrypted_content'])))
        for key in ['prompt_cache_key', 'client_metadata', 'stream_options']:
            self.assertNotIn(key, out)
        self.assertEqual(out['include'], ['reasoning.encrypted_content'])
        self.assertEqual(out['model'], 'gpt-5.6-sol')
        self.assertEqual(out['max_output_tokens'], 4096)
        self.assertEqual(out['service_tier'], 'default')
        self.assertIs(out['store'], False)
        disk = json.loads((self.root / 'budget.json').read_text())
        self.assertEqual(disk, b.value)
        self.assertEqual(disk['requests'][0]['requestSha256'], hashlib.sha256(m.budget.canonical(out)).hexdigest())

    def test_token_exhaustion_never_forwards_another_request(self):
        b = self.budget(tokenLimit=20000)
        b.reserve(self.raw())
        before = m.budget.canonical(b.value)
        with self.assertRaises(ValueError):
            b.reserve(self.raw())
        self.assertEqual(before, m.budget.canonical(b.value))
        self.assertLessEqual(b.value['reservedTokens'], 20000)

    def test_spend_exhaustion_is_independent_of_declared_token_limit(self):
        b = self.budget(spendMicroUsd=18000)
        out = json.loads(b.reserve(self.raw()))
        self.assertLess(out['max_output_tokens'], 4096)
        self.assertLessEqual(b.value['reservedMicroUsd'], 18000)
        with self.assertRaises(ValueError):
            b.reserve(self.raw())

    def test_crash_or_restart_cannot_reset_paid_reservations(self):
        self.budget().reserve(self.raw())
        with self.assertRaises(ValueError):
            self.budget()

    def test_expiry_denies_before_reservation(self):
        b = self.budget(deadline=time.time()-1)
        with self.assertRaises(ValueError):
            b.reserve(self.raw())
        self.assertEqual(b.value['requests'], [])

    def test_model_hidden_history_media_and_hosted_tools_are_denied(self):
        b = self.budget()
        for change in [{'model': 'unapproved'}, {'previous_response_id': 'old'}, {'conversation': 'old'},
                       {'tools': [{'type': 'web_search'}]}, {'input': [{'type': 'input_file', 'file_id': 'private'}]},
                       {'input': [{'type': 'input_image', 'image_url': 'https://unapproved'}]},
                       {'input': [{'type': 'reasoning', 'encrypted_content': 'opaque'}]},
                       {'input': [{'type': 'item_reference', 'id': 'hidden'}]}, {'background': True}, {'service_tier': {'bad': True}, 'unknown': True}]:
            with self.subTest(change=change), self.assertRaises((ValueError, TypeError)):
                b.reserve(self.raw(**change))
        self.assertEqual(b.value['requests'], [])

    def test_failed_upstream_is_charged_and_headers_are_not_forwarded(self):
        b = self.budget()
        called = []
        def upstream(body):
            called.append(body)
            self.assertGreater(json.loads((self.root/'budget.json').read_text())['reservedTokens'], 0)
            raise ValueError('PRIVATE_UPSTREAM_DIAGNOSTIC')
        socket_path = self.root / 'gateway.sock'
        server = m.budget.serve(socket_path, b, upstream)
        thread = threading.Thread(target=server.handle_request)
        thread.start()
        previous = os.getcwd()
        try:
            os.chdir(self.root)
            client = socket.socket(socket.AF_UNIX)
            client.connect('gateway.sock')
            body = self.raw()
            client.sendall(b'POST /v1/responses HTTP/1.1\r\nAuthorization: PRIVATE_HEADER\r\nContent-Length: '+str(len(body)).encode()+b'\r\n\r\n'+body)
            output = b''
            while True:
                chunk = client.recv(4096)
                if not chunk:
                    break
                output += chunk
            self.assertIn(b'403', output)
            self.assertNotIn(b'PRIVATE', output)
            self.assertEqual(len(called), 1)
            self.assertNotIn(b'PRIVATE_HEADER', called[0])
            self.assertGreater(b.value['reservedMicroUsd'], 0)
            self.assertEqual(b.value['blockedReason'], 'provider-outcome-unverified')
            with self.assertRaises(ValueError):
                b.reserve(self.raw())
            client.close()
        finally:
            os.chdir(previous)
            thread.join(2)
            server.server_close()

    def test_opaque_replay_requires_this_brokers_received_response_and_reserves_output_again(self):
        b = self.budget()
        sent = b.reserve(self.raw(include=['reasoning.encrypted_content']))
        opaque = {'type': 'reasoning', 'encrypted_content': 'SYNTHETIC_NOT_REAL_ENCRYPTION'}
        b.observe(b'data: '+json.dumps({'type':'response.completed','response':self.response(output=[opaque])}).encode()+b'\n\ndata: [DONE]\n', 'text/event-stream', sent)
        before = b.value['reservedTokens']
        repeated = self.raw(input=[opaque, opaque])
        b.reserve(repeated)
        self.assertGreaterEqual(b.value['reservedTokens'] - before, len(repeated) + 2*4096 + 16384)
        self.assertNotIn('SYNTHETIC_NOT_REAL_ENCRYPTION', (self.root/'budget.json').read_text())
        with self.assertRaises(ValueError):
            b.reserve(self.raw(input=[{**opaque, 'encrypted_content':'changed'}]))

    def test_upstream_binding_does_not_admit_remote_lookup_or_new_broker_replay(self):
        b = self.budget()
        sent = b.reserve(self.raw())
        with self.assertRaises(ValueError):
            b.observe(json.dumps({'type':'message','encrypted_content':'unsupported'}).encode(), 'application/json', sent)
        self.assertEqual(b.value['opaqueInputs'], {})
        with self.assertRaises(ValueError):
            b.reserve(self.raw(previous_response_id='server-owned-history'))

    def test_redirects_are_never_followed(self):
        with self.assertRaises(ValueError):
            m.budget.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://unapproved')

    def test_source_capture_has_stable_order_and_original_bytes(self):
        (self.root/'b.ts').write_text('b')
        (self.root/'a.ts').write_text('a')
        before = (self.root/'a.ts').read_bytes()
        output = m.capture(self.root, 'synthetic')
        self.assertEqual([f['path'] for f in output['files']], ['a.ts', 'b.ts'])
        self.assertEqual((self.root/'a.ts').read_bytes(), before)

    def test_source_symlink_is_not_followed(self):
        (self.root/'alias.ts').symlink_to('/etc/passwd')
        with self.assertRaises((ValueError, OSError)):
            m.capture(self.root, 'synthetic')

    def test_source_directory_alias_is_not_walked(self):
        (self.root/'alias').symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(ValueError):
            m.capture(self.root, 'synthetic')

    def test_source_hardlinks_are_rejected(self):
        (self.root/'a.ts').write_text('a')
        os.link(self.root/'a.ts', self.root/'b.ts')
        with self.assertRaises(ValueError):
            m.capture(self.root, 'synthetic')

    def test_source_fifo_is_rejected_without_blocking(self):
        os.mkfifo(self.root/'fifo.ts')
        with self.assertRaises(ValueError):
            m.capture(self.root, 'synthetic')

    def test_empty_directory_flood_is_bounded(self):
        for index in range(513):
            (self.root/str(index)).mkdir()
        with self.assertRaisesRegex(ValueError, 'entry bound'):
            m.capture(self.root, 'synthetic')

    def test_source_size_bound(self):
        (self.root/'large.ts').write_bytes(b'x'*2_097_153)
        with self.assertRaises(ValueError):
            m.capture(self.root, 'synthetic')

    def test_worker_policy_excludes_host_and_controller_capabilities(self):
        run_id = 'b9d0099e-72ed-4ea4-aa24-9a72a93bfe02'
        s = m.Supervisor(self.root)
        args = s.worker_args(run_id, 'sha256:'+'a'*64)
        self.assertIn('--network=none', args)
        self.assertIn('--read-only', args)
        self.assertIn('--cap-drop=ALL', args)
        self.assertIn('--restart=no', args)
        self.assertEqual(args[args.index('--user')+1], '1000:1000')
        self.assertIn('/home/agent/.codex:rw,nosuid,nodev,size=16m,uid=1000,gid=1000', args)
        self.assertIn('type=bind,src='+str(self.root/run_id/'source')+',dst=/workspace,readonly', args)
        self.assertIn('type=bind,src='+str(self.root/run_id/'source/src')+',dst=/workspace/src', args)
        self.assertFalse(any('docker.sock' in a or 'supervisor.py' in a or 'budget.py' in a for a in args))
        self.assertNotIn('--privileged', args)

    def test_exact_budget_source_ignores_timestamp_valid_poisoned_bytecode(self):
        original = (project/'scripts/experiments/agent/budget.py').read_bytes()
        cached = self.root/'budget.py'
        poison = b'raise RuntimeError("POISONED_CACHE")\n'
        cached.write_bytes(poison + b'#' + b'x'*(len(original)-len(poison)-1))
        os.utime(cached, (1700000000, 1700000000))
        py_compile.compile(str(cached), doraise=True)
        cached.write_bytes(original)
        os.utime(cached, (1700000000, 1700000000))
        helper = self.root/'supervisor.py'
        helper.write_bytes((project/'scripts/experiments/agent/supervisor.py').read_bytes())
        selected = importlib.util.spec_from_file_location('fresh_supervisor', helper)
        loaded = importlib.util.module_from_spec(selected)
        selected.loader.exec_module(loaded)
        self.assertEqual(loaded.budget.canonical({'ok': 1}), b'{"ok":1}')

    def test_root_path_alias_and_non_uuid_are_rejected(self):
        s = m.Supervisor(self.root)
        for value in ['../escape', 'arbitrary', 'b9d0099e-72ed-4ea4-aa24-9a72a93bfe02/child']:
            with self.assertRaises(ValueError):
                s.directory(value)


if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromTestCase(Mechanics))
    print(json.dumps({'classification': 'UNIT_NO_RUNTIME_OR_INFERENCE', 'tests': result.testsRun,
                      'failures': len(result.failures), 'errors': len(result.errors)}))
    sys.exit(0 if result.wasSuccessful() else 1)
