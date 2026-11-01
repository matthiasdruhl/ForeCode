import "server-only";
import { loadRecordedVerifications } from "./recorded-verification";
import { approvedTournamentPublication } from "./approved-tournament-publication";
import { loadRecordedCertificates } from "./recorded-certificates";

// NOT_PROVISIONED. Nonempty registration and publication require separate
// approval of genuine source records, exact public metadata and custody pins.
// This is the sole production composition seam; never derive it from a client.
export function loadApprovedRecordings() {
  return loadRecordedVerifications({ recordings: [], store: null });
}

export function loadApprovedCertificates() {
  return loadRecordedCertificates({ certificates: [], store: null });
}

export function loadApprovedTournamentRecordings() {
  return approvedTournamentPublication.loadTournaments();
}

export function loadApprovedDecisionReports() {
  return approvedTournamentPublication.loadReports();
}

// Operator-only inspection; no protected metadata or projection is returned.
export function inspectApprovedTournamentPublication() {
  return approvedTournamentPublication.inspect();
}

export function loadApprovedProspectiveEvidence() {
  return approvedTournamentPublication.loadProspectiveEvidence();
}
