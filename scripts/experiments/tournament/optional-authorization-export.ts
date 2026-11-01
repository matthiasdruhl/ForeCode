// Supplementary instrumentation cannot suppress an already validated grade.
export async function withOptionalAuthorizationExport<T extends object>(
  grade: T,
  collect: () => Promise<unknown>,
  retainFailure: (error: unknown) => Promise<void>,
  checks: readonly { detail: string }[] = [],
) {
  try {
    if (
      checks.some((check) =>
        check.detail.endsWith(" Authorization telemetry unavailable."),
      )
    ) {
      throw new Error("Protected authorization telemetry unavailable.");
    }
    return { ...grade, authorizationExport: await collect() };
  } catch (error) {
    try {
      await retainFailure(error);
    } catch {
      /* Preserve the protected grade even if diagnostic retention fails. */
    }
    return { ...grade, authorizationExport: undefined };
  }
}
