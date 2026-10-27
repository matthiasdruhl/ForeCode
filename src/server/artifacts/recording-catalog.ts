import "server-only";
import { loadRecordedVerifications } from "./recorded-verification";

// NOT_PROVISIONED. Nonempty registration and publication require separate
// approval of genuine source records, exact public metadata and custody pins.
// This is the sole production composition seam; never derive it from a client.
export function loadApprovedRecordings() {
  return loadRecordedVerifications({ recordings: [], store: null });
}
