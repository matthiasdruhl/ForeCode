"""Trusted root supervisor OUTSIDE the untrusted nested worker.

Production CLI has one fixed private root and finite operations. It never runs
agent commands in the outer VM namespace and never exports by restarting a
stopped untrusted VM. Importable mechanics are exercised with disposable Docker
containers; that is not admission of the owner's existing sandboxes.
"""
import base64
import contextlib
import fcntl
import hashlib
import types
import json
import os
import pathlib
import re
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import time
import uuid

HERE = pathlib.Path(__file__).resolve().parent
# Execute the exact inventoried source, never a timestamp-valid .pyc left by
# an older installation. Only this fixed root-owned helper path is compiled.
budget = types.ModuleType('booking_budget')
exec(compile((HERE / 'budget.py').read_bytes(), str(HERE / 'budget.py'), 'exec'), budget.__dict__)
ROOT = pathlib.Path('/var/lib/forecode-agent')
LABEL = 'forecode.booking.agent'
MAX = 8_000_000


def digest(value):
    return hashlib.sha256(budget.canonical(value)).hexdigest()


def boot_id():
    return pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip()


def birth(pid):
    try:
        fields = pathlib.Path('/proc/' + str(pid) + '/stat').read_text().rsplit(')', 1)[1].split()
        return None if fields[0] == 'Z' else fields[19]
    except FileNotFoundError:
        return None


def command(args, timeout=15):
    result = subprocess.run(['docker', *args], capture_output=True, timeout=timeout)
    if len(result.stdout) + len(result.stderr) > MAX or result.returncode != 0:
        raise ValueError('bounded Docker operation failed')
    return result.stdout


def read_regular(file, limit=MAX):
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > limit:
            raise ValueError('nonregular or oversized source')
        data = os.read(fd, limit + 1)
        after = os.fstat(fd)
        linked = os.lstat(file)
        signature = lambda s: (s.st_ino, s.st_dev, s.st_mtime_ns, s.st_ctime_ns, s.st_size)
        if len(data) != before.st_size or signature(before) != signature(after) or signature(before) != signature(linked):
            raise ValueError('source changed during capture')
        return data
    finally:
        os.close(fd)


def capture(root, run_id):
    files = []
    used = visited = 0
    pending = [(pathlib.Path(root), 0)]
    while pending:
        parent, depth = pending.pop()
        if depth > 20 or parent.is_symlink():
            raise ValueError('source directory alias or depth')
        # Stream directory entries; a hostile tree cannot force an unbounded
        # os.walk directory/name list into the trusted supervisor's memory.
        with os.scandir(parent) as entries:
            for entry in entries:
                visited += 1
                if visited > 512:
                    raise ValueError('source entry bound')
                p = pathlib.Path(parent) / entry.name
                if entry.is_symlink():
                    raise ValueError('source alias')
                if entry.is_dir(follow_symlinks=False):
                    pending.append((p, depth + 1))
                    continue
                relative = p.relative_to(root).as_posix()
                if not re.fullmatch(r'[A-Za-z0-9_().\[\]/-]+(?:\.[A-Za-z0-9_-]+)?', relative) or '..' in relative.split('/'):
                    raise ValueError('source path refused')
                data = read_regular(p, 2_097_152)
                used += len(data)
                if used > MAX or len(files) >= 100:
                    raise ValueError('source bound')
                files.append({'path': relative, 'base64': base64.b64encode(data).decode()})
    return {'runId': run_id, 'files': sorted(files, key=lambda f: f['path'])}


class Supervisor:
    def __init__(self, root=ROOT, docker=command, boot=boot_id):
        self.root, self.docker, self.boot = pathlib.Path(root), docker, boot

    def directory(self, run_id):
        if str(uuid.UUID(run_id)) != run_id:
            raise ValueError('invalid run ID')
        p = self.root / run_id
        if p.is_symlink() or p.parent.resolve() != self.root.resolve():
            raise ValueError('run path alias')
        return p

    @contextlib.contextmanager
    def lock(self, run_id):
        p = self.directory(run_id)
        fd = os.open(p / 'lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            yield p
        finally:
            os.close(fd)

    def state(self, run_id, nonce):
        p = self.directory(run_id)
        state = json.loads(read_regular(p / 'state.json'))
        if state['runId'] != run_id or state['nonce'] != nonce:
            raise ValueError('run custody mismatch')
        return p, state

    def owned(self, run_id):
        ids = self.docker(['ps', '-aq', '--filter', 'label=' + LABEL + '=' + run_id]).decode().split()
        if len(ids) > 1:
            raise ValueError('unexpected extra run containers')
        state_file = self.directory(run_id) / 'state.json'
        expected = json.loads(read_regular(state_file)).get('containerId') if state_file.exists() else None
        for cid in ids:
            info = json.loads(self.docker(['inspect', cid]))[0]
            if (info['Config']['Labels'].get(LABEL) != run_id or
                    info['Name'] != '/forecode-agent-' + run_id or
                    (expected is not None and info['Id'] != expected)):
                raise ValueError('container ownership changed')
        return ids

    def remove(self, run_id):
        ids = self.owned(run_id)
        for cid in ids:
            self.docker(['rm', '--force', cid])
        if self.owned(run_id):
            raise ValueError('worker termination unconfirmed')
        return ids

    def prepare(self, request):
        budget.reviewed_profile(request)
        run_id = request['runId']
        p = self.directory(run_id)
        if self.owned(run_id):
            raise ValueError('run collision')
        p.mkdir(mode=0o700)  # Existing state is never reused after a crash.
        baseline = request['candidate']
        if baseline['runId'] != run_id or len(baseline['files']) > 100:
            raise ValueError('source ownership or bound')
        work = p / 'source'
        work.mkdir(mode=0o755)
        seen = set()
        total = 0
        for file in baseline['files']:
            name = file['path']
            if (not re.fullmatch(r'(?:src/(?:[A-Za-z0-9_()[\].-]+/)*[A-Za-z0-9_()[\].-]+\.(?:ts|tsx|css|svg)|[A-Za-z0-9_.-]+|tests/visible/[A-Za-z0-9_.-]+\.ts)', name)
                    or any(part in ('.', '..') or part.startswith('.env') for part in name.split('/')) or name in seen):
                raise ValueError('unsafe source path')
            seen.add(name)
            data = base64.b64decode(file['base64'], validate=True)
            total += len(data)
            if total > MAX or len(data) > 2_097_152:
                raise ValueError('source too large')
            target = work / name
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            with target.open('xb') as out:
                out.write(data)
            os.chmod(target, 0o444)
        original = capture(work, run_id)
        if digest(original) != digest({'runId': run_id, 'files': sorted(baseline['files'], key=lambda f: f['path'])}):
            raise ValueError('source transfer mismatch')
        for parent, dirs, names in os.walk(work / 'src'):
            os.chown(parent, 1000, 1000)
            os.chmod(parent, 0o700)
            for name in names:
                os.chown(pathlib.Path(parent) / name, 1000, 1000)
                os.chmod(pathlib.Path(parent) / name, 0o600)
        gateway = p / 'gateway'
        gateway.mkdir(mode=0o755)
        task = {'prompt': request['prompt'], 'model': request['model'], 'codexBinarySha256': request['codexBinarySha256'],
                'agentConfigSha256': request['agentConfigSha256'], 'workerNodeSha256': request.get('workerNodeSha256')}
        (p / 'task.json').write_bytes(budget.canonical(task))
        os.chmod(p / 'task.json', 0o444)
        state = {'runId': run_id, 'nonce': request['nonce'], 'bootId': self.boot(),
                 'stage': 'prepared', 'requestSha256': digest(request), 'createdAt': time.time(),
                 'request': request, 'containerId': None, 'supervisorPid': None, 'supervisorBirth': None}
        budget.atomic(p / 'state.json', state)
        return {'runId': run_id, 'stage': 'prepared', 'requestSha256': state['requestSha256']}

    def worker_args(self, run_id, image):
        p = self.directory(run_id)
        return ['create', '--pull=never', '--name', 'forecode-agent-' + run_id,
                '--label', LABEL + '=' + run_id, '--restart=no', '--network=none',
                '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
                '--user', '1000:1000', '--cpus', '1', '--memory', '768m', '--memory-swap', '768m',
                '--pids-limit', '128', '--ulimit', 'nofile=256:256', '--log-driver=none',
                '--tmpfs', '/tmp:rw,nosuid,nodev,size=32m,mode=1777',
                '--tmpfs', '/home/agent:rw,nosuid,nodev,size=32m,uid=1000,gid=1000',
                # Docker creates bind-mount parents as root. Give CODEX_HOME
                # its own owned tmpfs so app-server state/aliases are writable,
                # while the exact reviewed config stays a read-only file bind.
                '--tmpfs', '/home/agent/.codex:rw,nosuid,nodev,size=16m,uid=1000,gid=1000',
                '--mount', 'type=bind,src=' + str(p / 'source') + ',dst=/workspace,readonly',
                '--mount', 'type=bind,src=' + str(p / 'source/src') + ',dst=/workspace/src',
                '--mount', 'type=bind,src=' + str(p / 'gateway') + ',dst=/run/forecode-gateway,readonly',
                '--mount', 'type=bind,src=' + str(p / 'task.json') + ',dst=/run/forecode-task.json,readonly',
                '--mount', 'type=bind,src=' + str(HERE / 'worker.mjs') + ',dst=/run/forecode-worker.mjs,readonly',
                '--mount', 'type=bind,src=/home/agent/.codex/config.toml,dst=/home/agent/.codex/config.toml,readonly',
                '--entrypoint', '/usr/local/bin/node', image, '/run/forecode-worker.mjs']

    def validate_worker(self, cid, run_id, expected_user='1000:1000'):
        info = json.loads(self.docker(['inspect', cid]))[0]
        host, config = info['HostConfig'], info['Config']
        request = json.loads(read_regular(self.directory(run_id) / 'state.json'))['request']
        if (info['Image'] != request['workerImage']
                or config['User'] != expected_user or host['NetworkMode'] != 'none'
                or not host['ReadonlyRootfs'] or host['Privileged']
                or host['Memory'] != 768*1024**2 or host['MemorySwap'] != 768*1024**2
                or host['NanoCpus'] != 1_000_000_000 or host['PidsLimit'] != 128
                or host['RestartPolicy']['Name'] != 'no' or host.get('PidMode')
                or host.get('CapAdd') or 'ALL' not in host.get('CapDrop', [])
                or not any(v.startswith('no-new-privileges') for v in host.get('SecurityOpt', []))):
            raise ValueError('observed worker enforcement differs')
        if any(v.get('Type') not in ('bind', 'tmpfs') for v in info['Mounts']):
            raise ValueError('unreviewed worker volume')
        for mount in info['Mounts']:
            if mount.get('RW') and mount.get('Destination') not in ('/workspace/src', '/tmp', '/home/agent', '/home/agent/.codex'):
                raise ValueError('unexpected writable mount')

    def start(self, run_id, nonce):
        with self.lock(run_id):
            p, state = self.state(run_id, nonce)
            if state['stage'] != 'prepared' or state['bootId'] != self.boot():
                raise ValueError('run cannot resume')
            state['stage'] = 'starting'
            budget.atomic(p / 'state.json', state)
            (p / 'heartbeat').write_text(str(time.time()))
            pid = os.fork()
            if pid == 0:
                os.setsid()
                null = os.open(os.devnull, os.O_RDWR)
                for fd in (0, 1, 2):
                    os.dup2(null, fd)
                # Close the inherited lock before acquiring it in the daemon.
                os.closerange(3, 256)
                try:
                    self.drive(run_id, nonce)
                except BaseException as error:
                    budget.atomic(p / 'driver-error.json', {'class': type(error).__name__, 'message': str(error)[:1000]})
                    # An unhandled driver error never authorizes export.
                    try:
                        self.remove(run_id)
                    except Exception:
                        pass
                os._exit(0)
            return {'runId': run_id, 'stage': 'starting'}

    def drive(self, run_id, nonce):
        with self.lock(run_id):
            p, state = self.state(run_id, nonce)
            if state['stage'] != 'starting':
                raise ValueError('cancelled before supervisor start')
            request = state['request']
            request['deadline'] = time.time() + request['maxSeconds']
            state.update(stage='running', supervisorPid=os.getpid(), supervisorBirth=birth(os.getpid()),
                         deadline=request['deadline'])
            budget.atomic(p / 'state.json', state)
        # The watchdog must never block on a slow provider stream. A separate
        # trusted child serves the broker; the parent independently enforces the
        # absolute deadline/heartbeat and kills its entire owned process group.
        reservations = budget.Reservations(p, request)
        broker = budget.serve(p / 'gateway/gateway.sock', reservations)
        broker_pid = os.fork()
        if broker_pid == 0:
            try:
                while time.time() < request['deadline']:
                    broker.handle_request()
            finally:
                os._exit(0)
        broker.server_close()
        with self.lock(run_id):
            _, state = self.state(run_id, nonce)
            state.update(brokerPid=broker_pid, brokerBirth=birth(broker_pid))
            budget.atomic(p / 'state.json', state)
        child = None
        output = [bytearray(), bytearray()]
        reason = 'completed'
        began = time.monotonic()
        try:
            with self.lock(run_id):
                _, state = self.state(run_id, nonce)
                # Cleanup holds this same lock, stops this exact supervisor
                # group, then removes containers. No late create can race it.
                cid = self.docker(self.worker_args(run_id, request['workerImage'])).decode().strip()
                self.validate_worker(cid, run_id)
                state['containerId'] = cid
                budget.atomic(p / 'state.json', state)
            child = subprocess.Popen(['docker', 'start', '--attach', cid], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     stdin=subprocess.DEVNULL, start_new_session=True)
            selector = selectors.DefaultSelector()
            for index, pipe in enumerate([child.stdout, child.stderr]):
                os.set_blocking(pipe.fileno(), False)
                selector.register(pipe, selectors.EVENT_READ, index)
            while child.poll() is None or selector.get_map():
                if time.time() >= request['deadline']:
                    reason = 'timed_out'
                elif time.time() - (p / 'heartbeat').stat().st_mtime > 15 or (p / 'cancel').exists():
                    reason = 'cancelled'
                if sum(map(len, output)) > request['maxOutputBytes']:
                    reason = 'output_limit'
                if reason != 'completed':
                    self.remove(run_id)
                    # A flooding docker-attach client may itself be blocked on
                    # its pipe after the worker is gone. Do not wait for it to
                    # flush unbounded diagnostics before closing that transport.
                    if child.poll() is None:
                        os.killpg(child.pid, signal.SIGKILL)
                        child.wait(timeout=5)
                    break
                for key, _ in selector.select(.05):
                    data = os.read(key.fileobj.fileno(), 65536)
                    if not data:
                        selector.unregister(key.fileobj)
                    else:
                        remaining = max(0, request['maxOutputBytes'] + 1 - sum(map(len, output)))
                        output[key.data].extend(data[:remaining])
            if child.poll() is None:
                child.wait(timeout=5)
            if reason == 'completed' and child.returncode == 125:
                reason = 'spawn_error'  # Pinned bootstrap failed; no agent-source grade.
            # The entire PID namespace, including detached/root descendants,
            # disappears on force-removal. No restartable container remains.
            removed = self.remove(run_id)
            with self.lock(run_id):
                _, state = self.state(run_id, nonce)
                state.update(stage='terminated', removedContainerIds=removed, agent={
                    'exitCode': child.returncode, 'signal': None, 'reason': reason,
                    'stdout': output[0][:request['maxOutputBytes']].decode('utf8', 'replace'),
                    'stderr': output[1][:request['maxOutputBytes']].decode('utf8', 'replace'),
                    'elapsedMs': int((time.monotonic() - began) * 1000)})
                budget.atomic(p / 'state.json', state)
        except BaseException as error:
            budget.atomic(p / 'driver-error.json', {'class': type(error).__name__, 'message': str(error)[:1000]})
            self.remove(run_id)  # Failure here leaves nonterminal state for owner recovery.
            with self.lock(run_id):
                _, state = self.state(run_id, nonce)
                state['stage'] = 'failed'
                budget.atomic(p / 'state.json', state)
        finally:
            try:
                os.kill(broker_pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            os.waitpid(broker_pid, 0)
            if child and child.poll() is None:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait(timeout=5)

    def status(self, run_id, nonce):
        p, state = self.state(run_id, nonce)
        if state['bootId'] != self.boot():
            raise ValueError('VM boot identity changed; cleanup only')
        (p / 'heartbeat').touch()
        if state['stage'] == 'running' and birth(state['supervisorPid']) != state['supervisorBirth']:
            raise ValueError('supervisor lost; cleanup only')
        return {k: v for k, v in state.items() if k not in ('request',)}

    def finalize(self, run_id, nonce):
        with self.lock(run_id):
            p, state = self.state(run_id, nonce)
            if (state['stage'] != 'terminated' or state['bootId'] != self.boot()
                    or state['agent']['reason'] != 'completed' or self.owned(run_id)):
                raise ValueError('trustworthy termination required')
            first = capture(p / 'source', run_id)
            # Check non-src content against the exact original source transfer.
            original = state['request']['candidate']
            before = {f['path']: f['base64'] for f in original['files'] if not f['path'].startswith('src/')}
            after = {f['path']: f['base64'] for f in first['files'] if not f['path'].startswith('src/')}
            if before != after:
                raise ValueError('unauthorized source modification')
            seal = p / 'sealed'
            seal.mkdir(mode=0o700)
            for file in first['files']:
                target = seal / file['path']
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                target.write_bytes(base64.b64decode(file['base64']))
                os.chmod(target, 0o400)
            captured = capture(seal, run_id)
            if digest(first) != digest(captured) or digest(first) != digest(capture(p / 'source', run_id)) or self.owned(run_id):
                raise ValueError('source mutation or resurrection')
            for parent, _, _ in os.walk(seal, topdown=False):
                os.chmod(parent, 0o500)
            state.update(stage='sealed', candidateSha256=digest(captured), sealedAt=time.time())
            budget.atomic(p / 'state.json', state)
            return {'runId': run_id, 'nonce': nonce, 'bootId': state['bootId'],
                    'containerId': state['containerId'], 'requestSha256': state['requestSha256'],
                    'stage': 'sealed', 'candidate': captured, 'candidateSha256': digest(captured)}

    def cleanup(self, run_id, nonce):
        with self.lock(run_id):
            p, state = self.state(run_id, nonce)
            (p / 'cancel').touch()
            pid = state.get('supervisorPid')
            if pid and state['bootId'] == self.boot() and birth(pid) == state['supervisorBirth']:
                if os.getpgid(pid) != pid:
                    raise ValueError('supervisor group identity changed')
                os.killpg(pid, signal.SIGKILL)
            broker_pid = state.get('brokerPid')
            if broker_pid and state['bootId'] == self.boot() and birth(broker_pid) == state.get('brokerBirth'):
                if os.getpgid(broker_pid) != pid:
                    raise ValueError('broker group identity changed')
                os.killpg(pid, signal.SIGKILL)
            self.remove(run_id)
            if self.owned(run_id):
                raise ValueError('owned cleanup unconfirmed')
            state['stage'] = 'cleaned'
            budget.atomic(p / 'state.json', state)
            return {'runId': run_id, 'absent': True, 'bootId': self.boot()}


def main():
    if sys.platform != 'linux' or os.geteuid() != 0:
        raise ValueError('trusted Linux root helper required')
    ROOT.mkdir(mode=0o700, exist_ok=True)
    info = ROOT.lstat()
    if ROOT.is_symlink() or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError('supervisor custody')
    raw = sys.stdin.buffer.read(12_000_001)
    if len(raw) > 12_000_000:
        raise ValueError('bounded request')
    request = json.loads(raw)
    supervisor = Supervisor()
    action = request['operation']
    if action == 'prepare':
        return supervisor.prepare(request['request'])
    run_id, nonce = request['runId'], request['nonce']
    if action not in ['start', 'status', 'finalize', 'cleanup']:
        raise ValueError('fixed operation required')
    return getattr(supervisor, action)(run_id, nonce)


if __name__ == '__main__':
    try:
        print(json.dumps(main(), separators=(',', ':')))
    except BaseException:
        print('{"error":"SUPERVISOR_REFUSED"}')
        sys.exit(1)
