"""Additive team inventory. The host supplies this exact frozen source plus the
unchanged runtime-files.py in a fixed module namespace, not a path from JSON.
No runtime helper or private oracle is executed by these additional reads.
"""
import contextlib
import io
import json
import pathlib
import stat


def read_team_policy(runtime, policy, owner_uid=0):
    # The shared installed-code reader requires 0444. Policy is deliberately
    # private 0400, so use a separate bounded no-follow descriptor read.
    policy = pathlib.Path(policy)
    info = policy.lstat()
    if (policy.resolve() != policy or not stat.S_ISREG(info.st_mode)
            or info.st_uid != owner_uid or info.st_nlink != 1
            or stat.S_IMODE(info.st_mode) != 0o400 or info.st_size > 1_048_576):
        raise ValueError('bounded immutable installed policy required')
    fd = runtime.os.open(policy, runtime.os.O_RDONLY | runtime.os.O_NOFOLLOW | runtime.os.O_NONBLOCK)
    try:
        before = runtime.os.fstat(fd)
        raw = runtime.os.read(fd, 1_048_577)
        if (runtime.signature(before) != runtime.signature(info)
                or runtime.signature(runtime.os.fstat(fd)) != runtime.signature(info)
                or runtime.signature(policy.lstat()) != runtime.signature(info)
                or len(raw) != info.st_size):
            raise ValueError('installed policy changed')
    finally:
        runtime.os.close(fd)
    runtime.remember(policy, info)
    runtime.metadata[str(policy)] = [info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)]
    return runtime.hashlib.sha256(raw).hexdigest(), json.loads(raw)


def collect_team_runtime(runtime):
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        runtime.main()
    result = json.loads(output.getvalue())
    role = runtime.sys.argv[1]
    if role == 'agent':
        extra = ['/opt/forecode-agent/team-supervisor.py', '/usr/local/bin/node']
        root = pathlib.Path('/var/lib/forecode-team-agent')
        info = root.lstat()
        if (root.is_symlink() or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700):
            raise ValueError('team state root custody')
        runtime.remember(root, info)
    elif role == 'grader':
        extra = ['/opt/forecode-booking/controller/team-profile-inventory.ts']
    else:
        raise ValueError('fixed team role required')
    for name in extra:
        p = pathlib.Path(name)
        if p.resolve() != p or p.lstat().st_uid != 0:
            raise ValueError('team installed alias/ownership')
        result[name] = runtime.hashed(name, trusted=True, executable=name.endswith('/bin/node'))
    if role == 'agent':
        policy = pathlib.Path('/opt/forecode-agent/team-policy.json')
        result[str(policy)], result['installedPolicy'] = read_team_policy(runtime, policy)
    # Bind all extra custody metadata as well as the inherited native/toolchain closure.
    result['team_runtime_metadata'] = runtime.hashlib.sha256(
        json.dumps(sorted(runtime.metadata.items()), separators=(',', ':')).encode()).hexdigest()
    if role == 'grader':
        # Dedicated VM: refuse foreign/orphan scratch rather than deleting it.
        result['scratchAbsent'] = not any(p.name.startswith(('booking-grade-', 'booking-lifecycle-'))
                                         for p in pathlib.Path('/tmp').iterdir())
    runtime.assert_unchanged()
    return result
