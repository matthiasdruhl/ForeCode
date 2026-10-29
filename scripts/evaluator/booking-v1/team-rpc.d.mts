export const rpcLimit: number;
export const teamActions: readonly string[];
export const teamSeed: Readonly<{
  organizations: { id: string; name: string }[];
  memberships: {
    organizationId: string;
    userId: string;
    role: string;
    status: string;
  }[];
  resources: { id: string; name: string; organizationId: string }[];
}>;
export function parseBehaviorRpc(
  bytes: string,
  team?: boolean,
): Record<string, unknown>;
export function encodeBehaviorReply(value: unknown): string;
export function decodeBehaviorReply(bytes: string): {
  result?: unknown;
  error?: { code: string };
};
export function createBehaviorDispatcher(input: {
  createBookingService: (...args: never[]) => unknown;
  createBookingHttp: (...args: never[]) => unknown;
  createTeamBenchmark?: (...args: never[]) => unknown;
  team?: boolean;
}): (bytes: string) => Promise<string>;
