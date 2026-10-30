"""Explicit isolated Linux/root public preparation controls; no coding model/provider.
Input is the reviewed public fixture file envelope and immutable public worker image.
Do not invoke in an operator study or reuse its sources for a paid arm.
"""
import pathlib,sys,json,base64,subprocess,uuid,os,shutil,hashlib
assert sys.platform == 'linux' and os.geteuid() == 0
r=json.load(sys.stdin)
assert set(r) == {'files','image'}
root=pathlib.Path('/var/lib/forecode-public-controls-case09');root.mkdir(mode=0o755)
for name,raw in r['files'].items():
 p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(base64.b64decode(raw));p.chmod(0o444)
rows=[]
for case in ['positive','bridge','compile-failure','cookie-failure']:
 if case=='compile-failure':
  (root/'src/public-control.ts').write_text('export const wrong: string = 1;')
 if case=='cookie-failure':
  (root/'src/public-control.ts').unlink()
  p=root/'src/server/team-benchmark.ts';p.write_text('export function createTeamBenchmark() {return {http(){return Response.json({});}};}')
 name='forecode-public-control-'+str(uuid.uuid4())
 args=['docker','run','--name',name,'--label','forecode.public.control=case09','--pull=never','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user','1000:1000','--cpus','1','--memory','768m','--memory-swap','768m','--pids-limit','128','--ulimit','nofile=256:256','--log-driver=none','--tmpfs','/tmp:rw,nosuid,nodev,size=32m,mode=1777','--tmpfs','/work:rw,nosuid,nodev,size=256m,mode=1777','--mount','type=bind,src='+str(root)+',dst=/workspace,readonly']
 for n in ['team-public-checks.mjs','team-public-session.mjs']:args+=['--mount','type=bind,src=/opt/forecode-agent/'+n+',dst=/run/'+n+',readonly']
 if case == 'bridge':
  bridge=pathlib.Path('/var/lib/forecode-public-bridge-case09');bridge.mkdir(mode=0o755)
  native=bridge/'codex';native.write_bytes(b'#!/bin/sh\nexit 0\n');native.chmod(0o555)
  cfg=pathlib.Path('/home/agent/.codex/config.toml')
  task={'model':'muse-spark-1.3-contributor','tokenLimit':1000,'prompt':'Inert no-provider native stand-in',
        'codexBinarySha256':hashlib.sha256(native.read_bytes()).hexdigest(),
        'workerNodeSha256':hashlib.sha256(pathlib.Path('/usr/local/bin/node').read_bytes()).hexdigest(),
        'agentConfigSha256':hashlib.sha256(cfg.read_bytes()).hexdigest()}
  (bridge/'task.json').write_text(json.dumps(task));(bridge/'task.json').chmod(0o444)
  args+=['--tmpfs','/home/agent:rw,nosuid,nodev,size=32m,uid=1000,gid=1000',
         '--tmpfs','/home/agent/.codex:rw,nosuid,nodev,size=16m,uid=1000,gid=1000']
  for src,dst in [(native,'/usr/local/bin/codex'),(cfg,'/home/agent/.codex/config.toml'),(bridge/'task.json','/run/forecode-task.json'),(pathlib.Path('/opt/forecode-agent/worker.mjs'),'/run/forecode-worker.mjs'),(pathlib.Path('/opt/forecode-agent/team-worker.mjs'),'/run/team-worker.mjs')]:
   args+=['--mount','type=bind,src='+str(src)+',dst='+dst+',readonly']
 args+=['--entrypoint','/usr/local/bin/node',r['image'],'/run/'+('team-worker.mjs' if case=='bridge' else 'team-public-checks.mjs')]
 try:
  p=subprocess.run(args,capture_output=True,timeout=185)
  row={'case':case,'exitCode':p.returncode,'stdout':p.stdout.decode(),'stderr':p.stderr.decode()};rows.append(row)
  assert (p.returncode==0)==(case in ['positive','bridge']),row
  assert 'PUBLIC_CHECK session-cookie '+('FAIL' if case=='cookie-failure' else 'PASS') in row['stdout'],row
 finally:
  subprocess.run(['docker','rm','-f',name],check=True,stdout=subprocess.DEVNULL)
shutil.rmtree(root)
shutil.rmtree('/var/lib/forecode-public-bridge-case09')
print(json.dumps({'controls':rows,'providerRequests':0}))
