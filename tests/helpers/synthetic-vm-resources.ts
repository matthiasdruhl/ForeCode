// Development fixture only. Never use as observed runtime/admission evidence.
export function syntheticVmResources(pids = 4096) {
  return {
    schemaVersion: "booking-vm-resources.v1" as const,
    kernelThreadsMax: pids,
    parentPidsMax: pids,
    sandboxPidsMax: pids,
    kernelPidAllocationMax: 4194304,
    blockDevices: [{ name: "vda", bytes: 1048576 }],
    blockDeviceBytes: 1048576,
  };
}
