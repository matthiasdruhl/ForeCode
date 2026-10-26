# Read-only trusted inventory. Emits identities, never file contents.
import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import sys
import time

started = time.monotonic()
total = 0
count = 0


def hashed(filename):
    global total, count
    p = pathlib.Path(filename).resolve(strict=True)
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        total += before.st_size
        count += 1
        if (not stat.S_ISREG(before.st_mode) or before.st_size > 256 * 1024**2
                or total > 1024**3 or count > 25000
                or time.monotonic() - started > 12):
            raise ValueError('runtime inventory bound')
        digest = hashlib.sha256()
        used = 0
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            used += len(chunk)
            if used > before.st_size or time.monotonic() - started > 12:
                raise ValueError('runtime changed or inventory deadline')
        after = os.fstat(fd)
        if used != before.st_size or (before.st_mtime_ns, before.st_ctime_ns) != (after.st_mtime_ns, after.st_ctime_ns):
            raise ValueError('runtime changed')
        return digest.hexdigest()
    finally:
        os.close(fd)


role = sys.argv[1]
if role == 'agent':
    paths = ['/home/agent/.codex/config.toml', '/usr/local/bin/codex']
elif role == 'grader':
    paths = ['/opt/forecode-booking/bin/node', '/opt/forecode-booking/package-lock.json', '/opt/forecode-booking/package.json']
    names = ['guest.ts', 'oracle-driver.ts', 'oracle.ts', 'http-oracle.ts', 'remote-oracles.ts', 'probe.mjs', 'worker.mjs', 'client.mjs', 'runtime.mjs', 'lifecycle.mjs']
    paths += ['/opt/forecode-booking/controller/' + name for name in names]
else:
    raise ValueError('invalid inventory role')
result = {p: hashed(p) for p in paths}
if role == 'grader':
    root = pathlib.Path('/opt/forecode-booking/node_modules')
    if root.resolve() != root:
        raise ValueError('toolchain root alias')
    rows = []
    for p in sorted(root.rglob('*')):
        if time.monotonic() - started > 12 or len(rows) > 25000:
            raise ValueError('runtime inventory bound')
        if p.is_symlink():
            if not p.resolve().is_relative_to(root):
                raise ValueError('toolchain link escapes')
            rows.append([str(p.relative_to(root)), 'link', str(p.readlink())])
        elif p.is_file():
            rows.append([str(p.relative_to(root)), hashed(p)])
        elif not p.is_dir():
            raise ValueError('nonregular toolchain file')
    result['node_modules'] = hashlib.sha256(json.dumps(rows, separators=(',', ':')).encode()).hexdigest()
    for name in ['docker', 'python3', 'ldd']:
        executable = shutil.which(name, path='/usr/local/bin:/usr/bin:/bin')
        if not executable:
            raise ValueError('missing trusted executable')
        result['executable:' + name] = hashed(executable)
    # ldd can invoke an ELF interpreter: never use it on unreviewed Node bytes.
    # Hash-only owner inventory without the optional reviewed pin does not execute it.
    if len(sys.argv) > 2:
        if result['/opt/forecode-booking/bin/node'] != sys.argv[2]:
            raise ValueError('unreviewed Node bytes')
        observed = subprocess.run(['/usr/bin/ldd', '/opt/forecode-booking/bin/node'], capture_output=True, timeout=5, check=True)
        if len(observed.stdout) > 32768:
            raise ValueError('native inventory bound')
        libraries = sorted(set(re.findall(rb'(/[A-Za-z0-9_./+\-]+)', observed.stdout)))
        if not libraries:
            raise ValueError('missing native loader closure')
        for raw in libraries:
            p = raw.decode()
            result['native:' + p] = hashed(p)
print(json.dumps(result, sort_keys=True, separators=(',', ':')))
