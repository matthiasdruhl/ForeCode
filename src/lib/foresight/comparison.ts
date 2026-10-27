import type { IntentV1 } from "../contracts/intents";
import type { ResearchContext } from "../contracts/validation";
import type { ProposeResponse } from "./flow";
import { validateSliceContext } from "./flow";
import { bookingGraph } from "./booking-context";

export function comparisonContext(
  intents: IntentV1[],
  proposal: ProposeResponse,
): ResearchContext {
  const context = {
    intents,
    graph: bookingGraph,
    candidates: proposal.candidates,
    scenarios: proposal.scenarios,
  };
  validateSliceContext(context);
  return context;
}
