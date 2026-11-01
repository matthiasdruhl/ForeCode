"""Guest-only scripted real-CLI controls. Synthetic responses, no model or upstream.
Input: public fixture envelope, enforcement and tariffs. Fresh UUIDs only.
The deliberately minimal adapter passes public bootstrap only, never protected correctness.
"""
import json,pathlib,types,sys,uuid,time,base64,re,shlex
f=pathlib.Path('/opt/forecode-agent/team-supervisor.py');t=types.ModuleType('native_repro');t.__file__=str(f);exec(compile(f.read_bytes(),str(f),'exec'),t.__dict__)
r=json.load(sys.stdin); mode=r.get('controlMode','repair')
full=mode.startswith('full-'); json_response=mode.endswith('-json')
assert mode in ('repair','final-response','final-tool-refused','full-final-response','full-final-tool-refused','full-final-mixed-refused','full-final-tool-refused-json','full-final-mixed-refused-json')
exhausted=mode=='final-tool-refused'; refused=exhausted or 'refused' in mode
root=pathlib.Path('/var/lib/forecode-native-nul-control-'+str(uuid.uuid4()));root.mkdir(mode=0o700)
# Explicit scripted local Responses control, never a provider transport.
bad='export function createTeamBenchmark(){return {domain(){return {};},http(){return Response.json({});}};}'
good='export function createTeamBenchmark(){return {domain(){return {};},http(){return Response.json({}, {headers:{"Set-Cookie":"booking_demo_session=synthetic; HttpOnly; SameSite=Strict; Path=/"}});}};}'
def write(content,previous):
 return "node /run/team-workflow.mjs write <<'FORECODE_JSON'\n"+json.dumps({'path':'src/server/team-benchmark.ts','expectedSha256':previous,'content':content})+"\nFORECODE_JSON"
commands=["printf 'before\\0after'\x00", "node /run/team-workflow.mjs task", "node /run/team-public-checks.mjs --quick",*(["true"]*8),write(bad,None),write(good,t.hashlib.sha256(bad.encode()).hexdigest()),"node /run/team-source-write-controls.mjs"]
if exhausted: commands=commands[:1]
if mode=='final-response':commands=[write(good,None)]
if full:commands=['node /run/team-workflow.mjs task',write(bad,None),'node /run/team-public-checks.mjs --quick',write(good,t.hashlib.sha256(bad.encode()).hexdigest()),'node /run/team-public-checks.mjs --quick']
if full:
 dynamic='export const load = () => import("./domain/booking");'
 def boundary_write(content,previous):
  return write(content,previous).replace('src/server/team-benchmark.ts','src/contract-control.ts')
 commands += [boundary_write(dynamic,None),boundary_write('export const control = 1;',t.hashlib.sha256(dynamic.encode()).hexdigest())]
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
  assert index<20,'request21 reached scripted upstream'
  if index==19:
   assert request.get('tools')==[] and request.get('tool_choice')=='auto'
   assert 'Final admitted request: tools are disabled.' in request['instructions']
   assert len(outputs)==19, 'native replay must contain nineteen previous tool results'
   assert any('adapterInstructions' in x and '"task"' in x for x in outputs), 'public task was not discovered'
   assert any('PUBLIC_CHECK adapter-session FAIL' in x for x in outputs), 'public failure missing from native history'
   assert any('PUBLIC_CHECK adapter-session PASS' in x for x in outputs), 'public repair missing from native history'
 if request.get('tools')==[] and not refused:
  output=[{'id':'msg_final','type':'message','role':'assistant','status':'completed','content':[{'type':'output_text','text':'Synthetic final response within existing allowance; no protected correctness claim.'}]}]
 elif full and index==19:
  output=[{'id':'fc_refused','type':'function_call','call_id':'call_refused','name':'exec_command','arguments':json.dumps({'cmd':write(bad,t.hashlib.sha256(good.encode()).hexdigest()),'yield_time_ms':10000,'max_output_tokens':3000})}]
  if 'mixed' in mode:
   output.insert(0,{'id':'msg_mixed','type':'message','role':'assistant','status':'completed','content':[{'type':'output_text','text':'Message must not excuse a prohibited call.'}]})
 elif session:
  output=[{'id':'fc_'+str(index),'type':'function_call','call_id':'call_'+str(index),'name':'write_stdin','arguments':json.dumps({'session_id':int(session.group(1)),'chars':'','yield_time_ms':10000,'max_output_tokens':3000})}]
 elif command_index<len(commands):
  output=[{'id':'fc_'+str(index),'type':'function_call','call_id':'call_'+str(index),'name':'exec_command','arguments':json.dumps({'cmd':commands[command_index],'yield_time_ms':10000,'max_output_tokens':3000})}]
  command_index+=1
 elif full:
  output=[{'id':'fc_'+str(index),'type':'function_call','call_id':'call_'+str(index),'name':'exec_command','arguments':json.dumps({'cmd':"node -e "+shlex.quote("console.log("+json.dumps('synthetic history '+str(index)+' '+('x'*2048))+");"),'yield_time_ms':10000,'max_output_tokens':3000})}]
 else:output=[{'id':'msg_control','type':'message','role':'assistant','status':'completed','content':[{'type':'output_text','text':'Synthetic no-model control complete.'}]}]
 index+=1
 response={'id':'resp_'+str(index),'object':'response','created_at':int(time.time()),'model':'muse-spark-1.3-contributor','service_tier':'auto','status':'completed','output':output,'usage':{'input_tokens':1,'output_tokens':1,'total_tokens':2}}
 # Exercise JSON refusal at the final boundary; preceding native rounds use
 # their requested stream transport and are unaffected by this negative case.
 if json_response and index==20:return t.base.budget.canonical(response),'application/json'
 events=[{'type':'response.created','response':{**response,'status':'in_progress','output':[]}}]
 for i,item in enumerate(output):
  events.extend([{'type':'response.output_item.added','output_index':i,'item':item},{'type':'response.output_item.done','output_index':i,'item':item}])
 events.append({'type':'response.completed','response':response})
 return b''.join(b'data: '+t.base.budget.canonical(x)+b'\n\n' for x in events),'text/event-stream'
serve=t.base.budget.serve;t.base.budget.serve=lambda socket,reservations:serve(socket,reservations,upstream=synthetic)
class AuditedReservations(t.TeamReservations):
 def reserve(self,raw):
  sent=super().reserve(raw)
  if full:
   ordinal=len(self.value['requests']); body=json.loads(sent)
   assert t.hashlib.sha256(sent).hexdigest()==self.value['requests'][-1]['requestSha256']
   if ordinal>=18:
    record=json.loads((root/run/f'request-{ordinal:04d}-admitted.json').read_bytes())['details']
    assert {k:v for k,v in record.items() if k!='deadlineRemainingMs'}=={k:v for k,v in self.request_contract(sent).items() if k!='deadlineRemainingMs'}
    assert record['toolNames']==sorted({x['name'] for x in body['tools']})
    assert record['toolTypes']==sorted({x['type'] for x in body['tools']})
  return sent
 def observe(self,output,content_type,sent):
  tokens,money=self.value['reservedTokens'],self.value['reservedMicroUsd']
  try:return super().observe(output,content_type,sent)
  finally:
   assert (tokens,money)==(self.value['reservedTokens'],self.value['reservedMicroUsd'])
t.base.budget.Reservations=AuditedReservations
class Control(t.TeamSupervisor):
 def validate_worker(self,cid,run,expected_user='1000:1000'):
  super().validate_worker(cid,run,expected_user)
  t.base.budget.atomic(self.directory(run)/'control-worker-inventory.json',json.loads(self.docker(['inspect',cid]))[0])
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
 if full:
  budget=json.loads((root/run/'budget.json').read_bytes())
  # The broker owns the responder counter in its child process. Durable
  # reservations and contract observations are the parent's evidence.
  assert len(budget['requests'])==20
  assert st['agent']['exitCode']==(1 if refused else 0),st['agent']
  assert (root/run/'source/src/server/team-benchmark.ts').read_text()==good,'refused call changed source or repair did not complete'
  assert 'PUBLIC_CHECK adapter-session FAIL' in st['agent']['stdout'],st['agent']
  contracts=[json.loads((root/run/f'request-{n:04d}-admitted.json').read_bytes()) for n in [18,19,20]]
  assert [x['ordinal'] for x in contracts]==[18,19,20]
  assert contracts[-1]['requestSha256']==budget['requests'][-1]['requestSha256']
  assert contracts[-1]['details']['toolCount']==0 and contracts[-1]['details']['phase']=='final'
  assert contracts[-1]['details']['toolNames']==contracts[-1]['details']['toolTypes']==[]
  for metadata in (root/run).glob('request-*.json'):
   assert metadata.stat().st_mode&0o777==0o400 and metadata.stat().st_uid==0
   assert metadata.stat().st_size<=8192
   assert not any(x in metadata.read_text() for x in ['"instructions":','"input":','"arguments":','booking_demo_session','synthetic;','adapterInstructions'])
  assert len(list((root/run).glob('request-*.json')))==80
  assert (root/run/'source/src/contract-control.ts').read_text()=='export const control = 1;'
  assert 'PUBLIC_BOUNDARY' in st['agent']['stdout']
  assert budget['reservedTokens']==sum(x['inputTokenUpperBound']+x['maximumOutputTokens'] for x in budget['requests'])
  assert budget['reservedMicroUsd']==sum(x['reservedMicroUsd'] for x in budget['requests'])
  if refused:
   assert sum('observedUsage' in x for x in budget['requests'])==19
   assert 'observedUsage' not in budget['requests'][-1]
   assert (root/run/'unverified-response.bin').is_file()
   failure=json.loads((root/run/'unverified-response.json').read_bytes())
   assert failure['requestSha256']==contracts[-1]['requestSha256']
   assert failure['contentType']==('application/json' if json_response else 'text/event-stream')
   observation=json.loads((root/run/'request-0020-response-received.json').read_bytes())
   assert observation['responseValidated'] is False
   types=observation['details']['outputItemKinds']['counts']
   assert types.get('function_call')==1 and types.get('message',0)==int('mixed' in mode)
   assert json.loads((root/run/'broker-refusal.json').read_bytes())['reasonCode']=='response-validation'
  else:assert budget['requests'][-1]['observedUsage']['totalTokens']==2
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
 finalized=s.finalize(run,nonce)
 assert finalized['publicReadiness']['status']==('BLOCKED' if exhausted else 'READY'),finalized['publicReadiness']
 if full:
  assert finalized['publicReadiness']['candidateSha256']==finalized['candidateSha256']
  sealed=next(x for x in finalized['candidate']['files'] if x['path']=='src/server/team-benchmark.ts')
  assert base64.b64decode(sealed['base64']).decode()==good
 print(json.dumps({'origin':'synthetic-scripted-real-native-CLI','providerRequests':0,'localScriptedRequests':len(json.loads((root/run/'budget.json').read_bytes())['requests']),'nulRejected':mode=='repair','subsequentWriteRecovered':mode=='repair' or full,'publicReadiness':finalized['publicReadiness'],'nativeExitCode':st['agent']['exitCode'],'failureFeedbackBeforeRepair':mode=='repair' or full,'repairAllowanceAtCheckpoint':None if full else 0 if exhausted else 8,'controlMode':mode,'stdout':st['agent']['stdout'],'stderr':st['agent']['stderr'],'root':str(root)}))
finally:
 cleanup=s.cleanup(run,nonce)
 assert cleanup['absent'] and cleanup['scratchRemoved']
 if full:
  assert (root/run/'request-0020-admitted.json').is_file() and (root/run/'cleanup-source.json').is_file()
  snapshot=json.loads((root/run/'cleanup-source.json').read_bytes())
  assert base64.b64decode(next(x['base64'] for x in snapshot['candidate']['files'] if x['path']=='src/server/team-benchmark.ts')).decode()==good
  assert not any((root/run/x).exists() for x in ['source','sealed','gateway','task.json','public-source'])
  if refused:assert (root/run/'unverified-response.bin').is_file()
  _,state=s.state(run,nonce)
  assert all(t.base.birth(state.get(k)) is None for k in ['supervisorPid','brokerPid'] if state.get(k))
  for cid in state.get('removedContainerIds',[]):
   try:s.docker(['start',cid])
   except ValueError:pass
   else:raise AssertionError('removed worker restarted')
 assert not s.docker(['ps','-aq','--filter','label='+t.base.LABEL+'='+run]).strip(), 'owned container survived cleanup'
