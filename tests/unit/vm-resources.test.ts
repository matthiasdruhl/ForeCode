import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { syntheticVmResources } from "../helpers/synthetic-vm-resources";
import { validateVmResources } from "../../scripts/experiments/isolation/vm-resources";

// Import only trusted Python functions with an entirely synthetic kernel map.
// These tests never read/write a host /proc or /sys control, fork, or run a VM.
function simulatedKernel(mode = "normal") {
  return spawnSync(
    "python3",
    [
      "-I",
      "-c",
      `
import importlib.util,sys,json
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('resources',sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
mode=sys.argv[2];group='/sys/fs/cgroup/docker/'+'a'*64
values={'/proc/self/cgroup':'0::/docker/'+'a'*64,'/proc/sys/kernel/threads-max':'32055','/proc/sys/kernel/pid_max':'4194304','/sys/fs/cgroup/docker/pids.max':'max',group+'/pids.max':'max','/sys/fs/cgroup/docker/pids.current':'24',group+'/pids.current':'24','/sys/block/vda/size':'2048'}
writes=[]
if mode=='tighter':
 for p in ['/proc/sys/kernel/threads-max','/sys/fs/cgroup/docker/pids.max',group+'/pids.max']:values[p]='128'
if mode=='full':values[group+'/pids.current']='4096'
if mode=='disk':values['/sys/block/vda/size']=str(2**30)
if mode=='layout':values['/proc/self/cgroup']='0::/unexpected'
def write(name,value):
 writes.append([name,value])
 if mode=='write-error':raise PermissionError('synthetic read-only control')
 if mode!='readback':values[name]=str(value)
m.read_text=lambda name:values[name]
m.write_limit=write
names=['vda']
if mode=='ram-disk':
 names+=['ram0'];values['/sys/block/ram0/size']='8192'
if mode=='unknown-disk':
 names+=['mystery0'];values['/sys/block/mystery0/size']='2048'
if mode in ['zero-devices','loop-aliases']:
 names+=['loop'+str(n) for n in range(64)]
 for name in names[1:]:
  values['/sys/block/'+name+'/size']='0' if mode=='zero-devices' else '2048'
  values['/sys/block/'+name+'/loop/backing_file']='/run/reviewed-image' if mode=='loop-aliases' else ''
m.os.listdir=lambda name:sorted(names)
try:
 first=m.ensure_resources(4096,8*1024**3)
 if mode=='restart':
  for p in ['/proc/sys/kernel/threads-max','/sys/fs/cgroup/docker/pids.max',group+'/pids.max']:values[p]='max'
  second=m.ensure_resources(4096,8*1024**3)
  assert first==second
 print(json.dumps({'observed':first,'writes':writes}))
except Exception as e:
 print(json.dumps({'error':type(e).__name__,'writes':writes}));sys.exit(1)
`,
      path.resolve("scripts/experiments/isolation/vm-resources.py"),
      mode,
    ],
    { encoding: "utf8", timeout: 2000, maxBuffer: 16384 },
  );
}
describe("VM resource supervision — synthetic kernel observations", () => {
  it("establishes actual readbacks and reapplies reset controls synchronously", () => {
    for (const mode of ["normal", "restart", "zero-devices", "loop-aliases"]) {
      const result = simulatedKernel(mode);
      expect(result.status, result.stderr).toBe(0);
      const value = JSON.parse(result.stdout);
      expect(value.observed).toEqual(syntheticVmResources());
      expect(value.writes).toHaveLength(mode === "restart" ? 6 : 3);
    }
  });
  it("never raises tighter existing controls", () => {
    const result = simulatedKernel("tighter");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      observed: syntheticVmResources(128),
      writes: [],
    });
  });
  it("includes fixed RAM disks in the finite capacity bound", () => {
    const result = simulatedKernel("ram-disk");
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).observed.blockDevices).toEqual([
      { name: "ram0", bytes: 4194304 },
      { name: "vda", bytes: 1048576 },
    ]);
    expect(JSON.parse(result.stdout).observed.blockDeviceBytes).toBe(5242880);
  });
  it.each([
    "full",
    "disk",
    "layout",
    "unknown-disk",
    "write-error",
    "readback",
  ])("fails closed for %s", (mode) => {
    const result = simulatedKernel(mode);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).observed).toBeUndefined();
    if (["full", "disk", "layout"].includes(mode))
      expect(JSON.parse(result.stdout).writes).toEqual([]);
  });
  it("validates real numeric limits and coherent finite capacity independently of labels", () => {
    const config = { vmPids: 4096, vmDiskBytes: 8 * 1024 ** 3 };
    expect(validateVmResources(syntheticVmResources(), config)).toEqual(
      syntheticVmResources(),
    );
    for (const raw of [
      { status: "PASS" },
      { ...syntheticVmResources(), kernelThreadsMax: "max" },
      { ...syntheticVmResources(), sandboxPidsMax: 8192 },
      { ...syntheticVmResources(), parentPidsMax: 0 },
      { ...syntheticVmResources(), blockDeviceBytes: 1 },
      {
        ...syntheticVmResources(),
        blockDevices: [
          { name: "vda", bytes: 1048576 },
          { name: "vda", bytes: 1048576 },
        ],
        blockDeviceBytes: 2097152,
      },
    ])
      expect(() => validateVmResources(raw, config)).toThrow();
    expect(() =>
      validateVmResources(syntheticVmResources(), { ...config, vmPids: 256 }),
    ).toThrow();
    expect(() =>
      validateVmResources(syntheticVmResources(), {
        ...config,
        vmDiskBytes: 512,
      }),
    ).toThrow();
  });
});
