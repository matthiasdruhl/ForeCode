# Fixed owner-maintenance launcher. No caller source/command/environment input.
# A host exec timeout alone cannot establish guest descendant termination.
import json
import os
import selectors
import signal
import subprocess
import time

command = ['/opt/forecode-booking/bin/node', '--conditions=react-server', '--import',
           '/opt/forecode-booking/node_modules/tsx/dist/loader.mjs',
           '/opt/forecode-booking/controller/installed-smoke.mjs']
child = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                         start_new_session=True, cwd='/opt/forecode-booking',
                         env={'PATH': '/usr/bin:/bin', 'NODE_ENV': 'production',
                              'LANG': 'C.UTF-8', 'TSX_DISABLE_CACHE': '1',
                              'NEXT_TELEMETRY_DISABLED': '1'})
selector = selectors.DefaultSelector()
selector.register(child.stdout, selectors.EVENT_READ, 'stdout')
selector.register(child.stderr, selectors.EVENT_READ, 'stderr')
output = {'stdout': bytearray(), 'stderr': bytearray()}
started = time.monotonic()
reason = 'completed'
try:
    while selector.get_map():
        if time.monotonic() - started > 25:
            reason = 'timed_out'
            break
        for key, _ in selector.select(0.05):
            data = os.read(key.fd, 4096)
            if not data:
                selector.unregister(key.fileobj)
            else:
                output[key.data].extend(data)
                if sum(map(len, output.values())) > 65536:
                    reason = 'output_limit'
                    break
        if reason != 'completed':
            break
finally:
    selector.close()
    if reason == 'completed':
        try:
            child.wait(timeout=2)
        except subprocess.TimeoutExpired:
            reason = 'timed_out'
    # Reap the entire owned process group, including native tooling helpers.
    try:
        os.killpg(child.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    child.wait(timeout=2)
    child.stdout.close()
    child.stderr.close()
print(json.dumps({'guestMachine': os.uname().machine, 'reason': reason, 'exitCode': child.returncode,
                  'stdout': output['stdout'].decode('utf8', errors='replace'),
                  'stderr': output['stderr'].decode('utf8', errors='replace')}))
