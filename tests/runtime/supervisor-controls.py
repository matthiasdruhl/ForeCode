"""Explicit Docker integration, NEVER run automatically by ordinary unit CI.

Trusted Linux test controller owns the Docker socket. Harmless nested workers
never receive it. Only the UUID-labelled test containers and supplied fresh
temporary root are touched. This is not sbx/host-containment admission.
"""
import base64
import importlib.util
import json
import os
import pathlib
import signal
import sys
import time
import uuid

project = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('agent_supervisor', project / 'scripts/experiments/agent/supervisor.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
root = None
image = None


class Controls(module.Supervisor):
    def __init__(self, mode, selected_root=None):
        super().__init__(selected_root or root)
        self.mode = mode

    def worker_args(self, run_id, selected):
        args = super().worker_args(run_id, selected)
        # The production invocation/broker/config remain separately unit-tested.
        # These controls execute harmless fixed Node code, no actual agent/key.
        config = args.index('type=bind,src=/home/agent/.codex/config.toml,dst=/home/agent/.codex/config.toml,readonly')
        del args[config-1:config+1]
        at = args.index('--entrypoint')
        args[at:at] = ['--mount', 'type=bind,src=' + str(project / 'tests/runtime/harmless-agent.mjs') + ',dst=/run/harmless-agent.mjs,readonly']
        args[-1] = '/run/harmless-agent.mjs'
        args.append(self.mode)
        if self.mode == 'root-detached':
            args[args.index('--user') + 1] = '0:0'
        return args

    def validate_worker(self, cid, run_id, expected_user='1000:1000'):
        # All actual limits/capability/mount readbacks remain enforced. This
        # explicit test-owned UID0 case is outside the production UID policy.
        return super().validate_worker(cid, run_id, '0:0' if self.mode == 'root-detached' else expected_user)


def setup(mode, seconds=8):
    run_id, nonce = str(uuid.uuid4()), str(uuid.uuid4())
    supervisor = Controls(mode)
    request = {'runId': run_id, 'nonce': nonce, 'candidate': {'runId': run_id, 'files': [
        {'path': 'package.json', 'base64': base64.b64encode(b'{}').decode()},
        {'path': 'src/main.ts', 'base64': base64.b64encode(b'export const value = 1;').decode()}]},
        'workerImage': image, 'prompt': 'HARMLESS TEST ONLY', 'codexBinarySha256': 'a'*64,
        'agentConfigSha256': 'b'*64, 'maxSeconds': seconds, 'maxOutputBytes': 4096,
        'model': 'gpt-5.6-sol', 'tokenLimit': 100000, 'spendMicroUsd': 1000000,
        'provider': {'endpoint': 'https://api.openai.com/v1/responses', 'maxOutputTokens': 32, 'inputMicroUsdPerToken': 1, 'outputMicroUsdPerToken': 1}}
    supervisor.prepare(request)
    if mode == 'root-detached':
        # Test-only UID0 in the same capability-dropped PID namespace. Give it
        # the test source access needed to exercise a real detached writer;
        # production remains UID1000 with source ownership fixed to that UID.
        os.chmod(supervisor.directory(run_id) / 'source/src', 0o777)
        os.chmod(supervisor.directory(run_id) / 'source/src/main.ts', 0o666)
    supervisor.start(run_id, nonce)
    return supervisor, run_id, nonce


def wait(supervisor, run_id, nonce, terminal=True):
    end = time.monotonic() + 25
    while time.monotonic() < end:
        state = supervisor.status(run_id, nonce)
        if terminal and state['stage'] in ['terminated', 'failed']:
            return state
        if not terminal and (supervisor.directory(run_id) / 'source/src/heartbeat.ts').exists():
            return state
        time.sleep(.05)
    raise AssertionError('supervision control deadline')


def main():
    global root, image
    root = pathlib.Path(sys.argv[1])
    image = sys.argv[2]
    results = []
    selected = sys.argv[3:] or ['normal', 'fail', 'timeout', 'flood', 'detached', 'root-detached', 'boundary', 'SIGINT', 'SIGTERM', 'controller-loss', 'supervisor-kill', 'boot-change', 'post-seal', 'export-failure', 'cleanup-refusal', 'identity-change']
    root.mkdir(mode=0o700, exist_ok=True)
    for case in selected:
        print(json.dumps({'case': case, 'stage': 'STARTING_HARMLESS_CONTROL'}), flush=True)
        mode = 'hang' if case in ['timeout', 'SIGINT', 'SIGTERM', 'controller-loss', 'supervisor-kill', 'cleanup-refusal'] else 'normal' if case in ['boot-change', 'post-seal', 'export-failure', 'identity-change'] else case
        s, run_id, nonce = setup(mode, 1 if case == 'timeout' else 25 if case == 'controller-loss' else 8)
        try:
            if case in ['SIGINT', 'SIGTERM']:
                state = wait(s, run_id, nonce, False)
                s.docker(['kill', '--signal', case, state['containerId']])
            if case in ['controller-loss', 'supervisor-kill', 'cleanup-refusal']:
                state = wait(s, run_id, nonce, False)
                if case == 'controller-loss':
                    time.sleep(16)  # No heartbeat; real outside-worker watchdog acts.
                elif case == 'supervisor-kill':
                    os.killpg(state['supervisorPid'], signal.SIGKILL)
                    time.sleep(.1)
                    try:
                        s.status(run_id, nonce)
                        raise AssertionError('dead supervisor accepted')
                    except ValueError:
                        pass
                    try:
                        s.finalize(run_id, nonce)
                        raise AssertionError('unconfirmed death sealed')
                    except ValueError:
                        pass
                    s.cleanup(run_id, nonce)
                    results.append({'case': case, 'status': 'PASS', 'scope': 'real Docker/process control'})
                    continue
                else:
                    actual = s.docker
                    s.docker = lambda args, **kw: (_ for _ in ()).throw(ValueError('TEST injected removal refusal')) if args[0] == 'rm' else actual(args, **kw)
                    try:
                        s.cleanup(run_id, nonce)
                        raise AssertionError('cleanup refusal accepted')
                    except ValueError:
                        pass
                    s.docker = actual
                    try:
                        s.finalize(run_id, nonce)
                        raise AssertionError('cleanup refusal sealed')
                    except ValueError:
                        pass
                    results.append({'case': case, 'status': 'PASS', 'scope': 'injected refusal, real Docker worker'})
                    continue
            state = wait(s, run_id, nonce)
            assert state['stage'] == 'terminated', state
            expected_reason = 'timed_out' if case == 'timeout' else 'output_limit' if case == 'flood' else 'cancelled' if case == 'controller-loss' else 'completed'
            assert state['agent']['reason'] == expected_reason, state
            if expected_reason != 'completed':
                try:
                    s.finalize(run_id, nonce)
                    raise AssertionError('interrupted run sealed')
                except ValueError:
                    pass
            else:
                assert state['agent']['exitCode'] == (7 if case == 'fail' else 130 if case == 'SIGINT' else 143 if case == 'SIGTERM' else 0), state
                if case == 'identity-change':
                    replacement = s.docker(['create', '--pull=never', '--name', 'forecode-agent-'+run_id,
                        '--label', module.LABEL+'='+run_id, '--network=none', '--read-only',
                        '--entrypoint', '/bin/true', image]).decode().strip()
                    try:
                        try:
                            s.finalize(run_id, nonce)
                            raise AssertionError('replaced worker identity sealed')
                        except ValueError:
                            pass
                        try:
                            s.cleanup(run_id, nonce)
                            raise AssertionError('replaced worker cleaned automatically')
                        except ValueError:
                            pass
                    finally:
                        # Explicitly test-owned replacement; owner recovery is
                        # outside the production cleanup path being tested.
                        s.docker(['rm', '--force', replacement])
                elif case == 'boot-change':
                    s.boot = lambda: 'SIMULATED-new-boot'
                    try:
                        s.finalize(run_id, nonce)
                        raise AssertionError('changed boot sealed')
                    except ValueError:
                        pass
                elif case == 'export-failure':
                    (s.directory(run_id) / 'source/src/alias.ts').symlink_to('/etc/passwd')
                    try:
                        s.finalize(run_id, nonce)
                        raise AssertionError('source alias exported')
                    except (ValueError, OSError):
                        pass
                else:
                    result = s.finalize(run_id, nonce)
                    assert result['candidateSha256'] == module.digest(result['candidate'])
                    assert result['candidate']['files'] != state['request']['candidate']['files'] if 'request' in state else True
                    # A destroyed worker cannot be restarted, even though its old
                    # Docker ID is known and the trusted outer controller remains up.
                    try:
                        s.docker(['start', result['containerId']])
                        raise AssertionError('removed worker resurrected')
                    except ValueError:
                        pass
                    snapshot = module.capture(s.directory(run_id) / 'sealed', run_id)
                    if case == 'post-seal':
                        (s.directory(run_id) / 'source/src/main.ts').write_text('SYNTHETIC later mutable-tree change')
                    time.sleep(.15)
                    assert module.digest(module.capture(s.directory(run_id) / 'sealed', run_id)) == module.digest(snapshot)
            results.append({'case': case, 'status': 'PASS', 'scope': 'simulated boot identity' if case == 'boot-change' else 'real Docker/process control'})
        finally:
            s.cleanup(run_id, nonce)
            try:
                os.waitpid(-1, os.WNOHANG)
            except ChildProcessError:
                pass
    print(json.dumps({'classification': 'DISPOSABLE_NO_INFERENCE_CONTROLS', 'results': results,
                      'sbxGuestIsolation': 'NOT_TESTED', 'realAgent': 'NOT_RUN'}))


if __name__ == '__main__':
    main()
