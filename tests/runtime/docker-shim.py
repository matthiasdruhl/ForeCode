#!/usr/local/bin/python3
# TEST ONLY. Docker Desktop's shared named-volume layout differs from sbx's
# nested daemon filesystem. Translate only the fixed grader source/bridge paths.
# This file is never included in the runtime bundle or installed in a real VM.
import os
import pathlib
import re
import sys

root = pathlib.Path('/run/forecode-test-volume-root').read_text().strip()
if not re.fullmatch(r'/var/lib/docker/volumes/forecode-agent-controls-[A-Za-z0-9_-]+/_data', root):
    raise ValueError('explicit test-owned volume required')
args = []
for arg in sys.argv[1:]:
    if arg.startswith('type=bind,src=/tmp/booking-'):
        if not re.fullmatch(r'type=bind,src=/tmp/booking-(?:grade|lifecycle)-[A-Za-z0-9-]+/(?:source|bridge),dst=/[A-Za-z]+(?:,readonly)?', arg):
            raise ValueError('fixed test mount required')
        arg = arg.replace('src=/tmp/', 'src=' + root + '/', 1)
    args.append(arg)
if args and args[0] == 'run':
    # Match the real two-vCPU outer VM topology. CPU quota, memory, PID limit
    # and all unchanged protected checks remain enforced, not relaxed.
    args[1:1] = ['--cpuset-cpus', '0,1']
os.execv('/usr/local/bin/docker-real', ['docker-real', *args])
