"""Guest-only scripted real-CLI controls. Synthetic responses, no model or upstream.
Input: public fixture envelope, enforcement and tariffs. Fresh UUIDs only.
The deliberately minimal adapter passes public bootstrap only, never protected correctness.
"""
import json,pathlib,types,sys,uuid,time,base64,re
f=pathlib.Path('/opt/forecode-agent/team-supervisor.py');t=types.ModuleType('native_repro');t.__file__=str(f);exec(compile(f.read_bytes(),str(f),'exec'),t.__dict__)
r=json.load(sys.stdin); exhausted=r.get('controlMode')=='exhausted'; root=pathlib.Path('/var/lib/forecode-native-nul-control-'+str(uuid.uuid4()));root.mkdir(mode=0o700)
# Explicit scripted local Responses control, never a provider transport.
bad='export function createTeamBenchmark(){return {domain(){return {};},http(){return Response.json({});}};}'
good='export function createTeamBenchmark(){return {domain(){return {};},http(){return Response.json({}, {headers:{"Set-Cookie":"booking_demo_session=synthetic; HttpOnly; SameSite=Strict; Path=/"}});}};}'
def write(content,previous):
 return "node /run/team-workflow.mjs write <<'FORECODE_JSON'\n"+json.dumps({'path':'src/server/team-benchmark.ts','expectedSha256':previous,'content':content})+"\nFORECODE_JSON"
commands=["printf 'before\\0after'\x00", "node /run/team-workflow.mjs task", "node /run/team-public-checks.mjs --quick",*(["true"]*8),write(bad,None),write(good,t.hashlib.sha256(bad.encode()).hexdigest()),"node /run/team-source-write-controls.mjs"]
if exhausted: commands=commands[:1]
index=0
command_index=0
def synthetic(body):
 global index,command_index
 request=json.loads(body)
 history=request.get('input',[])
 outputs=[x.get('output','') for x in history if isinstance(x,dict) and x.get('type')=='function_call_output']
 last=str(outputs[-1]) if outputs else ''
 session=re.search(r'(?:session ID|session id) (\d+)',last)
 if session:
  output=[{'id':'fc_'+str(index),'type':'function_call','call_id':'call_'+str(index),'name':'write_stdin','arguments':json.dumps({'session_id':int(session.group(1)),'chars':'','yield_time_ms':10000,'max_output_tokens':3000})}]
 elif command_index<len(commands):
  output=[{'id':'fc_'+str(index),'type':'function_call','call_id':'call_'+str(index),'name':'exec_command','arguments':json.dumps({'cmd':commands[command_index],'yield_time_ms':10000,'max_output_tokens':3000})}]
  command_index+=1
 else:output=[{'id':'msg_control','type':'message','role':'assistant','status':'completed','content':[{'type':'output_text','text':'Synthetic no-model control complete.'}]}]
 index+=1
 response={'id':'resp_'+str(index),'object':'response','created_at':int(time.time()),'model':'muse-spark-1.3-contributor','service_tier':'auto','status':'completed','output':output,'usage':{'input_tokens':1,'output_tokens':1,'total_tokens':2}}
 events=[{'type':'response.created','response':{**response,'status':'in_progress','output':[]}}]
 for i,item in enumerate(output):
  events.extend([{'type':'response.output_item.added','output_index':i,'item':item},{'type':'response.output_item.done','output_index':i,'item':item}])
 events.append({'type':'response.completed','response':response})
 return b''.join(b'data: '+t.base.budget.canonical(x)+b'\n\n' for x in events),'text/event-stream'
serve=t.base.budget.serve;t.base.budget.serve=lambda socket,reservations:serve(socket,reservations,upstream=synthetic)
class Control(t.TeamSupervisor):
 def worker_args(self,run,image):
  args=super().worker_args(run,image);at=args.index('--entrypoint')
  args[at:at]=['--mount','type=bind,src=/opt/forecode-workflow-controls/team-source-write-controls.mjs,dst=/run/team-source-write-controls.mjs,readonly']
  return args
s=Control(root);run,nonce=str(uuid.uuid4()),str(uuid.uuid4());files=r['files'];manifest=[{'path':x['path'],'sha256':t.hashlib.sha256(base64.b64decode(x['base64'])).hexdigest()} for x in files]
e=r['enforcement'];e.update(maxSeconds=300,tokenLimit=32000000,spendMicroUsd=32000000,maxIterations=20);e['restrictions'].update(maxRequests=20,maxOutputTokens=32768);e['resources']['outputBytes']=1048576
if exhausted: e['maxIterations']=1;e['restrictions']['maxRequests']=1
q={'runId':run,'nonce':nonce,'studyId':'synthetic-native-nul-control','variant':'A','sourceCommit':'0'*40,'sourceTreeSha256':t.base.digest(manifest),'sharedTaskSha256':'0'*64,'enforcement':e,'candidate':{'runId':run,'files':files}}
try:
 s.prepare_team(q,r['provider']);s.start(run,nonce)
 until=time.monotonic()+340
 while time.monotonic()<until:
  st=s.status(run,nonce)
  if st['stage'] in ['terminated','failed']:break
  time.sleep(.1)
 assert st['stage']=='terminated',st
 assert 'nul byte found in provided data' in st['agent']['stdout'],st['agent']
 if not exhausted:
  assert (root/run/'source/src/server/team-benchmark.ts').read_text()==good
  assert 'SOURCE_WRITE_CONTROLS_PASS' in st['agent']['stdout'],st['agent']
  assert 'PUBLIC_CHECK build PASS' in st['agent']['stdout'],st['agent']
  assert 'requestsRemaining=8' in st['agent']['stdout'],st['agent']
 else:
  assert st['agent']['exitCode']==1
  assert json.loads((root/run/'broker-refusal.json').read_bytes())['reasonCode']=='request-count'
 finalized=s.finalize(run,nonce)
 assert finalized['publicReadiness']['status']==('BLOCKED' if exhausted else 'READY'),finalized['publicReadiness']
 print(json.dumps({'origin':'synthetic-scripted-real-native-CLI','providerRequests':0,'localScriptedRequests':len(json.loads((root/run/'budget.json').read_bytes())['requests']),'nulRejected':True,'subsequentWriteRecovered':True,'publicReadiness':finalized['publicReadiness'],'nativeExitCode':st['agent']['exitCode'],'failureFeedbackBeforeRepair':True,'repairAllowanceAtCheckpoint':0 if exhausted else 8,'controlMode':'exhausted' if exhausted else 'repair','stdout':st['agent']['stdout'],'stderr':st['agent']['stderr'],'root':str(root)}))
finally:s.cleanup(run,nonce)
