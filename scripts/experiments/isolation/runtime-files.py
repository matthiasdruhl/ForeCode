# Read-only inventory in an already reviewed guest. Never dumps file contents.
import hashlib,json,pathlib,sys
role=sys.argv[1]
if role=='agent':
    paths=['/home/agent/.codex/config.toml','/usr/local/bin/codex']
else:
    paths=['/opt/forecode-booking/bin/node','/opt/forecode-booking/package-lock.json']
    paths += ['/opt/forecode-booking/controller/'+name for name in ['guest.ts','oracle-driver.ts','oracle.ts','http-oracle.ts','remote-oracles.ts','worker.mjs','client.mjs']]
result={p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in paths}
if role=='grader':
    root=pathlib.Path('/opt/forecode-booking/node_modules'); rows=[]
    for p in sorted(root.rglob('*')):
        if p.is_symlink():
            if not p.resolve().is_relative_to(root): raise ValueError('toolchain link escapes')
            rows.append([str(p.relative_to(root)),'link',str(p.readlink())])
        elif p.is_file(): rows.append([str(p.relative_to(root)),hashlib.sha256(p.read_bytes()).hexdigest()])
    result['node_modules']=hashlib.sha256(json.dumps(rows,separators=(',',':')).encode()).hexdigest()
print(json.dumps(result,sort_keys=True,separators=(',',':')))
