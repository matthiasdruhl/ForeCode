import "server-only";
import { z } from "zod";
import { RequestFailure } from "./errors";

export const MAX_REQUEST_BYTES = 65_536;

// expectedOrigin must come from deployment configuration, never a forwarded header.
export async function readJsonRequest<T>(
  request: Request,
  schema: z.ZodType<T>,
  expectedOrigin: string,
): Promise<T> {
  if (
    request.method !== "POST" ||
    request.headers.get("origin") !== expectedOrigin ||
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
      "application/json"
  ) {
    throw new RequestFailure("INVALID_REQUEST");
  }
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) ||
      Number(declaredLength) > MAX_REQUEST_BYTES)
  ) {
    throw new RequestFailure("PAYLOAD_TOO_LARGE");
  }
  if (!request.body) throw new RequestFailure("INVALID_REQUEST");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new RequestFailure("PAYLOAD_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return schema.parse(JSON.parse(text));
  } catch {
    throw new RequestFailure("INVALID_REQUEST");
  }
}
