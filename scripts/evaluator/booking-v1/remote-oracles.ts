import { runBaselineOracle, type BookingSubjectFactory } from "./oracle";
import { runHttpOracle } from "./http-oracle";

export type BookingRpc = (data: unknown) => unknown;
// Oracle assertions remain outside the worker. The worker supplies behavior,
// never verdicts. Only bounded JSON data crosses this transport.
export function evaluateRemoteDomain(rpc: BookingRpc) {
  const factory: BookingSubjectFactory = (options) => {
    const subject = rpc({ op: "new-domain", options });
    return Object.fromEntries(
      [
        "createBooking",
        "listBookings",
        "getBooking",
        "cancelBooking",
        "listResources",
      ].map((method) => [
        method,
        (...args: unknown[]) => rpc({ op: "domain", subject, method, args }),
      ]),
    ) as ReturnType<BookingSubjectFactory>;
  };
  return runBaselineOracle(factory);
}
export function evaluateRemoteHttp(rpc: BookingRpc) {
  return runHttpOracle((viewer) => {
    const subject = rpc({ op: "new-http", viewer });
    const call = (method: string, args: unknown[], request?: unknown) => {
      const data = rpc({ op: "http", subject, method, args, request }) as {
        status: number;
        body: string;
        headers: [string, string][];
      };
      return new Response(data.body, {
        status: data.status,
        headers: data.headers,
      });
    };
    const requestCall = async (
      method: string,
      request: Request,
      args: unknown[] = [],
    ) =>
      call(method, args, {
        url: request.url,
        method: request.method,
        headers: [...request.headers],
        body: request.body ? await request.text() : null,
      });
    return {
      collection: (request) => requestCall("collection", request),
      item: (request, id) => requestCall("item", request, [id]),
      resources: () => call("resources", []),
    };
  });
}
