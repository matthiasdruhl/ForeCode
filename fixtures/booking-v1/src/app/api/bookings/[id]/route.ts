import { bookingHttp } from "../../../../server/runtime";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export const GET = async (request: Request, context: Context) =>
  bookingHttp.item(request, (await context.params).id);
export const DELETE = async (request: Request, context: Context) =>
  bookingHttp.item(request, (await context.params).id);
