import "server-only";
import { createTournamentPublicationReader } from "./tournament-provisioning";

// NOT_PROVISIONED. The sole source-owned production registration for BOTH
// catalogs. A separately authorized deployment may compose an exact private
// ApprovedTournamentConfig here. Keep private paths/pins out of public Git.
// No env/JSON/request selector, key fallback or registration mutation endpoint.
// See docs/TOURNAMENT-PUBLICATION-HANDOFF.md before provisioning.
export const approvedTournamentPublication =
  createTournamentPublicationReader(null);
