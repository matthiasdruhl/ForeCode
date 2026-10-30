"""Explicit isolated Linux/root public preparation controls; no coding model/provider.
Input is the reviewed public fixture file envelope and immutable public worker image.
Do not invoke in an operator study or reuse its sources for a paid arm.
"""
import pathlib,sys,json,base64,subprocess,uuid,os,shutil,hashlib
assert sys.platform == 'linux' and os.geteuid() == 0
r=json.load(sys.stdin)
assert set(r) == {'files','image'}
root=pathlib.Path('/var/lib/forecode-public-controls-'+str(uuid.uuid4()));root.mkdir(mode=0o755)
for name,raw in r['files'].items():
 p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(base64.b64decode(raw));p.chmod(0o444)
rows=[]
adapter=root/'src/server/team-benchmark.ts'
positive='export function createTeamBenchmark(){return {domain(){return {};},http(){return Response.json({}, {headers:{"Set-Cookie":"booking_demo_session=synthetic; HttpOnly; SameSite=Strict; Path=/"}});}};}'
for case in ['missing-adapter','missing-export','unusable-interface','cookie-failure','compile-failure','positive']:
 if adapter.exists(): adapter.unlink()
 if case=='missing-export':adapter.write_text('export const somethingElse = 1;')
 elif case=='unusable-interface':adapter.write_text('export function createTeamBenchmark(){return {domain:1,http:1};}')
 elif case=='cookie-failure':adapter.write_text('export function createTeamBenchmark(){return {domain(){return {};},http(){return Response.json({});}};}')
 elif case!='missing-adapter':adapter.write_text(positive)
 if case=='compile-failure':
  (root/'src/public-control.ts').write_text('export const wrong: string = 1;')
 if case=='positive': (root/'src/public-control.ts').unlink()
 name='forecode-public-control-'+str(uuid.uuid4())
 args=['docker','run','--name',name,'--label','forecode.public.control=case09','--pull=never','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user','1000:1000','--cpus','1','--memory','768m','--memory-swap','768m','--pids-limit','128','--ulimit','nofile=256:256','--log-driver=none','--tmpfs','/tmp:rw,nosuid,nodev,size=32m,mode=1777','--tmpfs','/work:rw,nosuid,nodev,size=256m,mode=1777','--mount','type=bind,src='+str(root)+',dst=/workspace,readonly']
 for n in ['team-public-checks.mjs','team-public-session.mjs']:args+=['--mount','type=bind,src=/opt/forecode-agent/'+n+',dst=/run/'+n+',readonly']
 args+=['--entrypoint','/usr/local/bin/node',r['image'],'/run/team-public-checks.mjs']
 try:
  p=subprocess.run(args,capture_output=True,timeout=185)
  row={'case':case,'exitCode':p.returncode,'stdout':p.stdout.decode(),'stderr':p.stderr.decode()};rows.append(row)
  assert (p.returncode==0)==(case=='positive'),row
  if case in ['missing-adapter','missing-export','unusable-interface','cookie-failure']:assert 'PUBLIC_CHECK build' not in row['stdout'],row
  assert 'PUBLIC_READINESS '+('READY' if case=='positive' else 'BLOCKED') in row['stdout'],row
 finally:
  subprocess.run(['docker','rm','-f',name],check=True,stdout=subprocess.DEVNULL)
shutil.rmtree(root)

print(json.dumps({'controls':rows,'providerRequests':0}))
