"""Linux/Docker-only fixed harmless resource probes; never ordinary CI.

Pass one immutable reviewed public worker image. No source or credentials are
mounted. Exercise the unchanged 1 CPU / 768MiB / 128 PID / 32MiB tmpfs bounds.
The memory case deliberately OOMs only its own disposable container.
"""
import json
import re
import subprocess
import sys
import uuid

image = sys.argv[1]
assert re.fullmatch(r'sha256:[a-f0-9]{64}', image)
programs = {
    'disk': "const f=require('node:fs'),a=require('node:assert/strict');a.throws(()=>f.writeFileSync('/tmp/bounded',Buffer.alloc(40*1024*1024,1)),{code:'ENOSPC'});console.log('TMPFS_ENOSPC');",
    'pids': """const {spawn}=require('node:child_process');const a=require('node:assert/strict');
const children=[];let denied=0;
(async()=>{
await Promise.all(Array.from({length:150},()=>new Promise(resolve=>{
 const p=spawn('/bin/sleep',['20']);children.push(p);
 p.once('spawn',resolve);p.once('error',e=>{a.equal(e.code,'EAGAIN');denied++;resolve();});
})));
for(const p of children)if(p.pid)p.kill('SIGKILL');
a.ok(denied>0);console.log('PIDS_EAGAIN '+denied);
})().catch(e=>{console.error(e);process.exitCode=1;});""",
    'memory': "const held=[];for(let i=0;i<64;i++)held.push(Buffer.alloc(32*1024*1024,1));process.exit(9);",
}
rows = []
for mode, program in programs.items():
    name = 'forecode-resource-control-' + str(uuid.uuid4())
    args = ['docker', 'create', '--name', name, '--label', 'forecode.readiness.resource=' + name,
            '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL',
            '--security-opt=no-new-privileges', '--user', '1000:1000', '--cpus', '1',
            '--memory', '768m', '--memory-swap', '768m', '--pids-limit', '128',
            '--log-driver=none', '--tmpfs', '/tmp:rw,nosuid,nodev,size=32m,mode=1777',
            '--entrypoint', '/usr/local/bin/node', image, '-e', program]
    cid = subprocess.check_output(args).decode().strip()
    try:
        before = json.loads(subprocess.check_output(['docker', 'inspect', cid]))[0]
        host = before['HostConfig']
        assert before['Image'] == image and host['NanoCpus'] == 1_000_000_000
        assert host['Memory'] == host['MemorySwap'] == 768 * 1024**2 and host['PidsLimit'] == 128
        result = subprocess.run(['docker', 'start', '--attach', cid], capture_output=True, timeout=45)
        observed = json.loads(subprocess.check_output(['docker', 'inspect', cid]))[0]
        row = {'mode': mode, 'id': cid, 'exitCode': result.returncode,
               'oomKilled': observed['State']['OOMKilled'],
               'stdout': result.stdout.decode(), 'stderr': result.stderr.decode()}
        rows.append(row)
        print(json.dumps(row), flush=True)
        if mode == 'memory':
            assert result.returncode == 137 and row['oomKilled']
        else:
            assert result.returncode == 0 and not row['oomKilled']
    finally:
        subprocess.run(['docker', 'rm', '--force', cid], check=True, capture_output=True)
        absent = subprocess.run(['docker', 'inspect', cid], capture_output=True)
        assert absent.returncode != 0
print(json.dumps({'providerRequests': 0, 'controls': rows}))
