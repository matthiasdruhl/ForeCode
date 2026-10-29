export {
  GradeReportSchema,
  validateGradeReport,
} from "../../evaluator/booking-v1/grade-profile";
export type {
  GradeReport,
  GradeInput,
} from "../../evaluator/booking-v1/grade-profile";

export const fixedTask = {
  id: "booking-ownership-refactor-v1",
  prompt:
    "Refactor src/server/booking-service.ts to extract its viewer and ownership authorization helpers into a separate server module. Preserve all current booking behavior, public service and HTTP interfaces. Only edit src/. Read the service first and inspect immediate imports only if necessary; keep tool calls focused. This is a source-only worker without installed dependencies. Do not install packages or run tests/builds: the separate protected grader will check the sealed source after you exit. Finish once the extraction is complete. Do not change package/configuration/test files. The public baseline oracle checks behavior preservation; it does not certify refactor quality. Do not access host integrations or other workspaces.",
} as const;
