import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { OfflineConfig } from "./offline-config";
import type { InventoryExec } from "./offline-inventory";

export const VmResourcesSchema = z.strictObject({
  schemaVersion: z.literal("booking-vm-resources.v1"),
  kernelThreadsMax: z.number().int().positive().max(4096),
  parentPidsMax: z.number().int().positive().max(4096),
  sandboxPidsMax: z.number().int().positive().max(4096),
  kernelPidAllocationMax: z.number().int().positive(),
  blockDevices: z
    .array(
      z.strictObject({
        name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/),
        bytes: z
          .number()
          .int()
          .positive()
          .max(64 * 1024 ** 3),
      }),
    )
    .min(1)
    .max(64),
  blockDeviceBytes: z
    .number()
    .int()
    .positive()
    .max(64 * 1024 ** 3),
});
export function validateVmResources(
  raw: unknown,
  config: Pick<OfflineConfig, "vmPids" | "vmDiskBytes">,
) {
  const result = VmResourcesSchema.parse(raw);
  const names = result.blockDevices.map((row) => row.name);
  if (
    [result.kernelThreadsMax, result.parentPidsMax, result.sandboxPidsMax].some(
      (value) => value > config.vmPids,
    ) ||
    result.blockDeviceBytes > config.vmDiskBytes ||
    result.blockDeviceBytes !==
      result.blockDevices.reduce((sum, row) => sum + row.bytes, 0) ||
    new Set(names).size !== names.length ||
    names.some((name, index) => index > 0 && name <= names[index - 1]!)
  )
    throw new Error("VM resource enforcement differs from reviewed bounds");
  return result;
}
// Owner authority/lease and source identity must be checked by the caller first.
// This is synchronous setup, never an asynchronous kit hook or candidate program.
export async function ensureOfflineVmResources(
  config: OfflineConfig,
  exec: InventoryExec,
  signal: AbortSignal,
) {
  const script = await readFile(
    new URL("./vm-resources.py", import.meta.url),
    "utf8",
  );
  const result = await exec(
    [
      "exec",
      "-u",
      "root",
      config.graderSandbox,
      "python3",
      "-I",
      "-c",
      script,
      String(config.vmPids),
      String(config.vmDiskBytes),
    ],
    signal,
  );
  return validateVmResources(JSON.parse(result), config);
}
