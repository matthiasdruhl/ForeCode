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
metadata = {}
signatures = {}


def signature(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def remember(p, info):
    signatures[str(p)] = signature(info)


def assert_unchanged():
    for name, before in signatures.items():
        if time.monotonic() - started > 12 or signature(pathlib.Path(name).lstat()) != before:
            raise ValueError('runtime changed during inventory')


def trusted_metadata(filename, executable=False, directory=False):
    p = pathlib.Path(filename)
    info = p.lstat()
    if (p.is_symlink() or info.st_uid == 65534 or info.st_mode & 0o022
            or info.st_mode & 0o7000
            or (directory and not stat.S_ISDIR(info.st_mode))
            or (not directory and (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1))
            or (executable and info.st_mode & 0o111 != 0o111)
            or (directory and info.st_mode & 0o555 != 0o555)
            or (not directory and info.st_mode & 0o444 != 0o444)):
        raise ValueError('untrusted runtime custody or executable mode')
    remember(p, info)
    metadata[str(p)] = [info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)]
    return info


def hashed(filename, trusted=False, executable=False, maximum_bytes=256 * 1024**2):
    global total, count
    p = pathlib.Path(filename).resolve(strict=True)
    if trusted:
        identity = trusted_metadata(p, executable=executable)
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        if trusted and (before.st_ino, before.st_dev) != (identity.st_ino, identity.st_dev):
            raise ValueError('runtime path changed')
        total += before.st_size
        count += 1
        if (not stat.S_ISREG(before.st_mode) or before.st_size > maximum_bytes
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
        current = p.stat()
        if (before.st_ino, before.st_dev) != (current.st_ino, current.st_dev):
            raise ValueError('runtime path changed')
        if used != before.st_size or (before.st_mtime_ns, before.st_ctime_ns) != (after.st_mtime_ns, after.st_ctime_ns):
            raise ValueError('runtime changed')
        remember(p, after)
        return digest.hexdigest()
    finally:
        os.close(fd)


def main():
    role = sys.argv[1]
    if role == 'agent':
        paths = ['/home/agent/.codex/config.toml', '/usr/local/bin/codex',
                 '/opt/forecode-agent/supervisor.py', '/opt/forecode-agent/budget.py', '/opt/forecode-agent/worker.mjs']
        for p in ['/opt', '/opt/forecode-agent']:
            trusted_metadata(p, directory=True)
            if pathlib.Path(p).lstat().st_uid != 0:
                raise ValueError('supervisor must be root owned')
        state_root = pathlib.Path('/var/lib/forecode-agent')
        state_info = state_root.lstat()
        if state_root.is_symlink() or state_info.st_uid != 0 or stat.S_IMODE(state_info.st_mode) != 0o700:
            raise ValueError('private supervisor state custody')
        remember(state_root, state_info)
        for p in paths[2:]:
            trusted_metadata(p)
            if pathlib.Path(p).lstat().st_uid != 0:
                raise ValueError('supervisor must be root owned')
    elif role == 'grader':
        paths = ['/opt/forecode-booking/bin/node', '/opt/forecode-booking/package-lock.json', '/opt/forecode-booking/package.json']
        names = ['installed-smoke.mjs', 'installed-sample.ts', 'worker-policy.mjs', 'lifecycle-protocol.mjs', 'lifecycle-probes.mjs', 'lifecycle-driver.mjs', 'lifecycle-worker.mjs', 'guest.ts', 'oracle-driver.ts', 'oracle.ts', 'http-oracle.ts', 'remote-oracles.ts', 'probe.mjs', 'worker.mjs', 'client.mjs', 'runtime.mjs', 'lifecycle.mjs']
        paths += ['/opt/forecode-booking/controller/' + name for name in names]
    else:
        raise ValueError('invalid inventory role')
    if role == 'grader':
        for p in paths:
            if pathlib.Path(p).resolve() != pathlib.Path(p):
                raise ValueError('installed runtime alias')
        for p in ['/opt', '/opt/forecode-booking', '/opt/forecode-booking/bin', '/opt/forecode-booking/controller']:
            trusted_metadata(p, directory=True)
    # The pinned Linux Codex 0.165.0 executable is 269,094,232 bytes. Permit
    # up to 384MiB for that one fixed agent executable only. Grader/dependency
    # bounds, chunk size, aggregate 1GiB and 12-second inventory limits stay fixed.
    result = {p: hashed(p, trusted=role == 'grader' or p.startswith('/opt/forecode-agent/'),
                        executable=p.endswith('/bin/node'),
                        maximum_bytes=384 * 1024**2 if role == 'agent' and p == '/usr/local/bin/codex' else 256 * 1024**2)
              for p in paths}
    if role == 'grader':
        root = pathlib.Path('/opt/forecode-booking/node_modules')
        if root.resolve() != root:
            raise ValueError('toolchain root alias')
        trusted_metadata(root, directory=True)
        rows = []
        for p in sorted(root.rglob('*')):
            if time.monotonic() - started > 12 or len(rows) > 25000:
                raise ValueError('runtime inventory bound')
            if p.is_symlink():
                if p.lstat().st_uid == 65534 or not p.resolve(strict=True).is_relative_to(root):
                    raise ValueError('toolchain link escapes')
                remember(p, p.lstat())
                rows.append([str(p.relative_to(root)), 'link', str(p.readlink())])
            elif p.is_file():
                rows.append([str(p.relative_to(root)), hashed(p, trusted=True, executable=p.name == "esbuild" and "@esbuild" in p.parts)])
            elif p.is_dir():
                trusted_metadata(p, directory=True)
            else:
                raise ValueError('nonregular toolchain file')
        # pathlib orders path components; the image auditor orders full POSIX
        # relative strings (e.g. pkg.js precedes pkg/item.js). Bind the same rows.
        rows.sort(key=lambda row: row[0])
        result['node_modules'] = hashlib.sha256(json.dumps(rows, separators=(',', ':')).encode()).hexdigest()
        for name in ['docker', 'python3', 'ldd']:
            executable = '/usr/bin/ldd' if name == 'ldd' else shutil.which(name, path='/usr/local/bin:/usr/bin:/bin')
            if not executable:
                raise ValueError('missing trusted executable')
            result['executable:' + name] = hashed(executable, trusted=True, executable=True)
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
                result['native:' + p] = hashed(p, trusted=True)
        result['runtime_metadata'] = hashlib.sha256(json.dumps(sorted(metadata.items()), separators=(',', ':')).encode()).hexdigest()
    elif role == 'agent':
        for name in ['docker', 'python3']:
            executable = shutil.which(name, path='/usr/local/bin:/usr/bin:/bin')
            if not executable:
                raise ValueError('missing trusted supervisor executable')
            result['executable:' + name] = hashed(executable, trusted=True, executable=True)
        result['runtime_metadata'] = hashlib.sha256(json.dumps(sorted(metadata.items()), separators=(',', ':')).encode()).hexdigest()
    assert_unchanged()
    print(json.dumps(result, sort_keys=True, separators=(',', ':')))


if __name__ == "__main__":
    main()
