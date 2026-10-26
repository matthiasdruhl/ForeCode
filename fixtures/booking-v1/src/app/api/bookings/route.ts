import { bookingHttp } from "../../../server/runtime";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => bookingHttp.collection(request);
export const POST = (request: Request) => bookingHttp.collection(request);
