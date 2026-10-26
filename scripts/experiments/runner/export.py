# Runs only in the agent microVM. Output is untrusted, bounded data on the host.
import base64,json,os,pathlib,stat,sys
root=pathlib.Path(sys.argv[1]); files=[]; total=0
for directory, dirs, names in os.walk(root, followlinks=False):
    dirs[:]=sorted(d for d in dirs if d not in ('.git','node_modules','.next','coverage','test-results'))
    if len(pathlib.Path(directory).relative_to(root).parts)>16: raise ValueError('depth')
    for name in dirs+names:
        st=os.lstat(pathlib.Path(directory)/name)
        if stat.S_ISLNK(st.st_mode): raise ValueError('link')
    for name in sorted(names):
        if name.endswith('.tsbuildinfo'): continue
        p=pathlib.Path(directory)/name; st=p.stat()
        if not stat.S_ISREG(st.st_mode) or st.st_nlink!=1 or st.st_size>2097152: raise ValueError('file')
        total+=st.st_size
        if len(files)>=100 or total>8000000: raise ValueError('size')
        data=p.read_bytes()
        if len(data)!=st.st_size or p.stat().st_mtime_ns!=st.st_mtime_ns: raise ValueError('mutation')
        files.append({'path':p.relative_to(root).as_posix(),'base64':base64.b64encode(data).decode()})
print(json.dumps({'runId':sys.argv[2],'files':sorted(files,key=lambda f:f['path'])},separators=(',',':')))
