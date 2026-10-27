import { foresightHttp } from "@/server/meta/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => foresightHttp("propose", request);

// Unsupported methods still use the frozen safe error envelope.
export const GET = POST;
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
export const OPTIONS = POST;
export const HEAD = POST;
