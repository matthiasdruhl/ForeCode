# Fixed trusted offline-grader supervisor. No candidate, network or shell input.
# Local sbx resets kernel/cgroup state at restart: run synchronously before work.
import json
import os
import pathlib
import re
import sys


def read_text(name):
    return pathlib.Path(name).read_text().strip()


def write_limit(name, limit):
    pathlib.Path(name).write_text(str(limit) + '\n')


def ensure_resources(pids, disk_bytes):
    if not isinstance(pids, int) or not 1 <= pids <= 4096:
        raise ValueError('invalid VM task ceiling')
    if not isinstance(disk_bytes, int) or not 1 <= disk_bytes <= 64 * 1024**3:
        raise ValueError('invalid VM disk ceiling')
    membership = read_text('/proc/self/cgroup')
    match = re.fullmatch(r'0::(/docker/[a-f0-9]{64})', membership)
    if not match:
        raise ValueError('unreviewed grader cgroup layout')
    parent = '/sys/fs/cgroup/docker'
    current = '/sys/fs/cgroup' + match.group(1)
    # Count backing virtio disks and fixed RAM disks once, not free space.
    # Loop devices alias files on these disks; zram uses the finite VM memory.
    devices = []
    names = sorted(os.listdir('/sys/block'))
    if len(names) > 1024:
        raise ValueError('unreviewed block device inventory')
    for name in names:
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,63}', name):
            raise ValueError('invalid block device')
        size = int(read_text('/sys/block/' + name + '/size')) * 512
        if size < 0:
            raise ValueError('invalid block capacity')
        if re.fullmatch(r'loop[0-9]+', name):
            if size and not read_text('/sys/block/' + name + '/loop/backing_file'):
                raise ValueError('unreviewed loop backing')
            continue
        if re.fullmatch(r'zram[0-9]+', name):
            continue
        if not re.fullmatch(r'(?:vd[a-z]+|ram[0-9]+)', name):
            raise ValueError('unreviewed backing disk class')
        if size:
            devices.append({'name': name, 'bytes': size})
        else:
            raise ValueError('unreviewed empty block device')
    if len(devices) > 64:
        raise ValueError('unreviewed nonempty block device inventory')
    total = sum(row['bytes'] for row in devices)
    if not devices or not 0 < total <= disk_bytes:
        raise ValueError('VM block capacity exceeds reviewed ceiling')
    for group in [parent, current]:
        if not 0 <= int(read_text(group + '/pids.current')) < pids:
            raise ValueError('insufficient task headroom for safe supervision')
    controls = ['/proc/sys/kernel/threads-max', parent + '/pids.max', current + '/pids.max']
    observed = []
    for name in controls:
        old = read_text(name)
        value = pids if old == 'max' else min(int(old), pids)
        if value <= 0:
            raise ValueError('invalid existing task control')
        # Never raise an existing tighter bound. Read back actual kernel state.
        if old == 'max' or int(old) > value:
            write_limit(name, value)
        actual = int(read_text(name))
        if not 0 < actual <= pids:
            raise ValueError('VM task enforcement readback failed')
        observed.append(actual)
    return {
        'schemaVersion': 'booking-vm-resources.v1',
        'kernelThreadsMax': observed[0],
        'parentPidsMax': observed[1],
        'sandboxPidsMax': observed[2],
        # PID allocation wrap is recorded separately, not treated as a task cap.
        'kernelPidAllocationMax': int(read_text('/proc/sys/kernel/pid_max')),
        'blockDevices': devices,
        'blockDeviceBytes': total,
    }


if __name__ == '__main__':
    if len(sys.argv) != 3 or os.geteuid() != 0:
        raise ValueError('fixed owner-authorized root supervisor required')
    print(json.dumps(ensure_resources(int(sys.argv[1]), int(sys.argv[2])), separators=(',', ':')))
