export const workerLimits: Readonly<{
  cpu: number;
  memoryBytes: number;
  pids: number;
  descriptors: number;
  workBytes: number;
  tempBytes: number;
  shmBytes: number;
}>;
export function workerArguments(input: {
  name: string;
  runId: string;
  image: string;
  source: string;
  bridge: string;
  script: "worker.mjs" | "lifecycle-worker.mjs";
  mode: string;
  detach?: boolean;
}): string[];
