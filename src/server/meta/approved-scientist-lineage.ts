import "server-only";
import { createScientistRegistrationReader } from "./registration-reader";
import { createScientistEvidenceLinkReader } from "./evidence-link-reader";

// NOT_PROVISIONED. Only independently reviewed PRIVATE source composition may
// supply exact existing authority/original pins. Environment/client JSON cannot
// activate registration, disclosure, inference or experimental execution.
export const approvedScientistLineage = Object.freeze({
  ...createScientistRegistrationReader(null),
  ...createScientistEvidenceLinkReader(null),
});
