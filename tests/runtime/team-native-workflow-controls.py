"""Guest-only scripted real-CLI controls. Synthetic responses, no model or upstream.
Input: public fixture envelope, enforcement and tariffs. Fresh UUIDs only.
The deliberately minimal adapter passes public bootstrap only, never protected correctness.
"""
import json,pathlib,types,sys,uuid,time,base64,re,shlex
f=pathlib.Path('/opt/forecode-agent/team-supervisor.py');t=types.ModuleType('native_repro');t.__file__=str(f);exec(compile(f.read_bytes(),str(f),'exec'),t.__dict__)
r=json.load(sys.stdin); mode=r.get('controlMode','repair');assert mode in ('repair','final-response','final-tool-refused','contract-final','contract-final-call-sse','contract-final-call-json');exhausted=mode=='final-tool-refused';full=mode.startswith('contract-');reject_final=mode in ('contract-final-call-sse','contract-final-call-json');root=pathlib.Path('/var/lib/forecode-native-nul-control-'+str(uuid.uuid4()));root.mkdir(mode=0o700)
# Explicit scripted local Responses control, never a provider transport.
bad='export function createTeamBenchmark(){return {domain(){return {};},http(){return Response.json({});}};}'
good='export function createTeamBenchmark(){return {domain(){return {};},http(){return Response.json({}, {headers:{"Set-Cookie":"booking_demo_session=synthetic; HttpOnly; SameSite=Strict; Path=/"}});}};}'
def write(content,previous):
 return "node /run/team-workflow.mjs write <<'FORECODE_JSON'\n"+json.dumps({'path':'src/server/team-benchmark.ts','expectedSha256':previous,'content':content})+"\nFORECODE_JSON"
def control_write(content,previous):
 return "node /run/team-workflow.mjs write <<'FORECODE_JSON'\n"+json.dumps({'path':'src/contract-control.ts','expectedSha256':previous,'content':content})+"\nFORECODE_JSON"
commands=["printf 'before\\0after'\x00", "node /run/team-workflow.mjs task", "node /run/team-public-checks.mjs --quick",*(["true"]*8),write(bad,None),write(good,t.hashlib.sha256(bad.encode()).hexdigest()),"node /run/team-source-write-controls.mjs"]
if exhausted: commands=commands[:1]
if mode=='final-response':commands=[write(good,None)]
if full:
 dynamic='export const load = () => import("./domain/booking");'
 commands=["node /run/team-workflow.mjs task",write(bad,None),write(good,t.hashlib.sha256(bad.encode()).hexdigest()),
           control_write(dynamic,None),control_write('export const control = 1;',t.hashlib.sha256(dynamic.encode()).hexdigest()),
           "node /run/team-workflow.mjs check"]
index=0
command_index=0
def synthetic(body):
 global index,command_index
 request=json.loads(body)
 history=request.get('input',[])
 outputs=[x.get('output','') for x in history if isinstance(x,dict) and x.get('type')=='function_call_output']
 last=str(outputs[-1]) if outputs else ''
 session=re.search(r'(?:session ID|session id) (\d+)',last)
 if full:
  # Assert actual broker-transformed bytes before returning scripted output.
  ordinal=index+1
  assert ordinal<=20
  contract=json.loads((root/run/f'request-{ordinal:04d}-admitted.json').read_bytes())
  assert contract['requestSha256']==t.hashlib.sha256(body).hexdigest()
  assert contract['details']['phase']=={18:'completion',19:'validation',20:'final'}.get(ordinal,'work')
  if ordinal==20:
   assert request.get('tools')==[] and command_index==len(commands) and not session
  else:assert request.get('tools')
 if request.get('tools')==[] and mode!='final-tool-refused':
  output=[{'id':'msg_final','type':'message','role':'assistant','status':'completed','content':[{'type':'output_text','text':'Synthetic final response within existing allowance; no protected correctness claim.'}]}]
  if reject_final:
   output.append({'id':'fc_denied','type':'function_call','call_id':'call_denied','name':'exec_command','arguments':json.dumps({'cmd':'touch /workspace/src/contract-final-should-not-exist.ts'})})
 elif session:
  output=[{'id':'fc_'+str(index),'type':'function_call','call_id':'call_'+str(index),'name':'write_stdin','arguments':json.dumps({'session_id':int(session.group(1)),'chars':'','yield_time_ms':10000,'max_output_tokens':3000})}]
 elif command_index<len(commands):
  output=[{'id':'fc_'+str(index),'type':'function_call','call_id':'call_'+str(index),'name':'exec_command','arguments':json.dumps({'cmd':commands[command_index],'yield_time_ms':10000,'max_output_tokens':3000})}]
  command_index+=1
 elif full:
  # Grow real native tool-result history through all20 rounds, with harmless
  # public text only. No model compliance or protected correctness is claimed.
  filler="node -e "+shlex.quote("console.log("+json.dumps('synthetic history '+str(index)+' '+('x'*2048))+");")
  output=[{'id':'fc_'+str(index),'type':'function_call','call_id':'call_'+str(index),'name':'exec_command','arguments':json.dumps({'cmd':filler,'yield_time_ms':10000,'max_output_tokens':3000})}]
 else:output=[{'id':'msg_control','type':'message','role':'assistant','status':'completed','content':[{'type':'output_text','text':'Synthetic no-model control complete.'}]}]
 index+=1
 response={'id':'resp_'+str(index),'object':'response','created_at':int(time.time()),'model':'muse-spark-1.3-contributor','service_tier':'auto','status':'completed','output':output,'usage':{'input_tokens':1,'output_tokens':1,'total_tokens':2}}
 if full:
  response.update(tools=request.get('tools',[]),tool_choice=request.get('tool_choice'),instructions=request.get('instructions'))
  if mode=='contract-final-call-json' and request.get('tools')==[]:
   return t.base.budget.canonical(response),'application/json'
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
if mode=='final-response': e['maxIterations']=2;e['restrictions']['maxRequests']=2
e['completionReserveRequests']=min(3,e['maxIterations'],e['restrictions']['maxRequests'])
q={'runId':run,'nonce':nonce,'studyId':'synthetic-native-nul-control','variant':'A','sourceCommit':'0'*40,'sourceTreeSha256':t.base.digest(manifest),'sharedTaskSha256':'0'*64,'enforcement':e,'candidate':{'runId':run,'files':files}}
try:
 s.prepare_team(q,r['provider']);s.start(run,nonce)
 until=time.monotonic()+340
 while time.monotonic()<until:
  st=s.status(run,nonce)
  if st['stage'] in ['terminated','failed']:break
  time.sleep(.1)
 assert st['stage']=='terminated',st
 if mode=='repair':assert 'nul byte found in provided data' in st['agent']['stdout'],st['agent']
 if mode=='repair':
  assert (root/run/'source/src/server/team-benchmark.ts').read_text()==good
  assert 'SOURCE_WRITE_CONTROLS_PASS' in st['agent']['stdout'],st['agent']
  assert 'PUBLIC_CHECK build PASS' in st['agent']['stdout'],st['agent']
  assert 'requestsRemaining=8' in st['agent']['stdout'],st['agent']
  assert 'PUBLIC_INTERFACE_MILESTONE BLOCKED requestsRemaining=16' in st['agent']['stdout'],st['agent']
 elif exhausted:
  assert st['agent']['exitCode']==1
  assert json.loads((root/run/'broker-refusal.json').read_bytes())['reasonCode']=='response-validation'
 elif not full:
  assert st['agent']['exitCode']==0 and len(json.loads((root/run/'budget.json').read_bytes())['requests'])==2
  assert (root/run/'source/src/server/team-benchmark.ts').read_text()==good
 if full:
  budget=json.loads((root/run/'budget.json').read_bytes())
  assert len(budget['requests'])==20
  assert st['agent']['exitCode']==(1 if reject_final else 0)
  assert sum('observedUsage' in x for x in budget['requests'])==(19 if reject_final else 20)
  assert 'PUBLIC_CHECK adapter-session FAIL' in st['agent']['stdout']
  assert 'DYNAMIC_IMPORT_USE_STATIC_IMPORT' in st['agent']['stdout']
  assert 'PUBLIC_CHECK build PASS' in st['agent']['stdout']
  assert (root/run/'source/src/server/team-benchmark.ts').read_text()==good
  assert not (root/run/'source/src/contract-final-should-not-exist.ts').exists()
  records=[json.loads(p.read_bytes()) for p in sorted((root/run).glob('request-*.json'))]
  admitted=[x for x in records if x['stage']=='admitted']
  assert len(admitted)==20 and admitted[-1]['details']['toolCount']==0
  assert [x['details']['phase'] for x in admitted[-3:]]==['completion','validation','final']
  assert all(x['requestSha256']==budget['requests'][x['ordinal']-1]['requestSha256'] for x in records)
  if reject_final:
   assert (root/run/'unverified-response.bin').exists()
   rejected=json.loads((root/run/'request-0020-response-rejected.json').read_bytes())
   assert rejected['details']['reasonCode']=='final-tool-call'
   assert rejected['details']['outputItemKinds']['counts']=={'message':1,'function_call':1}
   assert json.loads((root/run/'broker-refusal.json').read_bytes())['reasonCode']=='response-validation'
 finalized=s.finalize(run,nonce)
 assert finalized['publicReadiness']['status']==('BLOCKED' if exhausted else 'READY'),finalized['publicReadiness']
 print(json.dumps({'origin':'synthetic-scripted-real-native-CLI','providerRequests':0,'localScriptedRequests':len(json.loads((root/run/'budget.json').read_bytes())['requests']),'nulRejected':mode=='repair','subsequentWriteRecovered':mode=='repair','publicReadiness':finalized['publicReadiness'],'nativeExitCode':st['agent']['exitCode'],'failureFeedbackBeforeRepair':True,'repairAllowanceAtCheckpoint':0 if exhausted else 8,'fullContractControl':full,'contractRecords':records if full else None,'controlMode':mode,'stdout':st['agent']['stdout'],'stderr':st['agent']['stderr'],'root':str(root)}))
finally:s.cleanup(run,nonce)
