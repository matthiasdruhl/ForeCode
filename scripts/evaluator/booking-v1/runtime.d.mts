export type Observation = {
  status: number | null;
  signal: NodeJS.Signals | null;
  reason: string;
  stdout: string;
  stderr: string;
  elapsedMs: number;
};
export function command(
  executable: string,
  args: string[],
  options?: {
    input?: string;
    milliseconds?: number;
    maxBytes?: number;
    signal?: AbortSignal;
  },
): Promise<Observation>;
export function successful(result: Observation): boolean;
