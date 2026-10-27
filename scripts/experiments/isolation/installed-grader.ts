// Read-only comparison of owner-supplied inventory; never starts a VM.
import { fileURLToPath } from "node:url";
import { protectedRead } from "../artifacts/files";
import { sha256 } from "../../../src/lib/report/digests";
import { controllerFiles } from "../../evaluator/booking-v1/installed";
import type { OfflineConfig } from "./offline-config";
export async function verifyInstalledGrader(
  files: Record<string, string>,
  images: {
    Id?: string;
    RepoDigests?: string[];
    Os?: string;
    Architecture?: string;
  }[],
  config: OfflineConfig,
) {
  for (const key of [
    "runtime_metadata",
    "executable:docker",
    "executable:python3",
    "executable:ldd",
  ])
    if (!/^[a-f0-9]{64}$/.test(files[key] ?? ""))
      throw new Error("Installed custody/executable inventory missing");
  if (!Object.keys(files).some((key) => key.startsWith("native:")))
    throw new Error("Installed native loader inventory missing");
  for (const [name, expected] of [
    ["/opt/forecode-booking/bin/node", config.graderNodeSha256],
    ["/opt/forecode-booking/package-lock.json", config.graderLockSha256],
    ["node_modules", config.graderModulesSha256],
  ])
    if (files[name!] !== expected)
      throw new Error("Installed toolchain tampering");
  const localPackage = await protectedRead(
    fileURLToPath(
      new URL(
        "../../evaluator/booking-v1/toolchain/package.json",
        import.meta.url,
      ),
    ),
  );
  if (files["/opt/forecode-booking/package.json"] !== sha256(localPackage))
    throw new Error("Installed module resolution changed");
  for (const name of controllerFiles) {
    const local = await protectedRead(
      fileURLToPath(
        new URL(`../../evaluator/booking-v1/${name}`, import.meta.url),
      ),
    );
    if (files[`/opt/forecode-booking/controller/${name}`] !== sha256(local))
      throw new Error("Installed controller tampering");
  }
  const image = images[0];
  if (
    images.length !== 1 ||
    !image ||
    image.Os !== "linux" ||
    !["arm64", "amd64"].includes(image.Architecture ?? "") ||
    (image.Id !== config.workerImage &&
      !image.RepoDigests?.includes(config.workerImage))
  )
    throw new Error("Installed worker image mismatch");
  return image;
}
