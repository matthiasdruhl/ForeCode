import type ts from "typescript";
export function proposeAwaitedAuthorizationInstrumentation(
  parser: typeof ts,
  source: string,
  selection?: readonly string[],
): {
  source: string;
  mapping: {
    caseId: string;
    checkId:
      | "team-permissions-domain"
      | "team-permissions-http"
      | "team-permissions-adversarial";
    line: number;
    column: number;
  }[];
  patch: {
    originalStart: number;
    originalEnd: number;
    outputStart: number;
    outputEnd: number;
    before: string;
    after: string;
  }[];
  restorationVerified: boolean;
  scope: string;
  helperAssertions: number;
  classification: "UNCLASSIFIED_REJECTION_SITE_CANDIDATES";
  additionalAwaitBookkeeping: boolean;
};
