import { demoOrigin, fixtureRuntime } from "../../../server/runtime";
import { bookingErrorResponse, requireSameOrigin } from "../../../server/http";

// Test-only local bootstrap. Every demo session maps to synthetic Alice.
// This endpoint is not production authentication and accepts no identity input.
export function POST(request: Request) {
  try {
    requireSameOrigin(request, demoOrigin);
    return Response.json(
      { viewer: "Alice", fixture: true },
      {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": `booking_demo_session=${fixtureRuntime.sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
        },
      },
    );
  } catch (error) {
    return bookingErrorResponse(error);
  }
}
