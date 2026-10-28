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

    def budget(self, **changes):
        request = {'deadline': time.time() + 60, 'tokenLimit': 100000, 'spendMicroUsd': 1000000,
                   'provider': {'maxOutputTokens': 4096, 'inputMicroUsdPerToken': 1, 'outputMicroUsdPerToken': 2}}
        request.update(changes)
        return m.budget.Reservations(self.root, request)

    def raw(self, **changes):
        value = {'model': 'gpt-5.6-sol', 'input': 'Harmless synthetic text.'}
        value.update(changes)
        return json.dumps(value).encode()

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
            client.close()
        finally:
            os.chdir(previous)
            thread.join(2)
            server.server_close()

    def test_opaque_replay_requires_this_brokers_received_response_and_reserves_output_again(self):
        b = self.budget()
        sent = b.reserve(self.raw(include=['reasoning.encrypted_content']))
        opaque = {'type': 'reasoning', 'encrypted_content': 'SYNTHETIC_NOT_REAL_ENCRYPTION'}
        b.observe(b'data: '+json.dumps({'type':'response.output_item.done','item':opaque}).encode()+b'\n\ndata: [DONE]\n', 'text/event-stream', sent)
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
