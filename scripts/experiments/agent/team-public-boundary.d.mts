import type ts from "typescript";
export function publicBoundaryDiagnostics(
  file: string,
  source: string,
  compiler: typeof ts,
): { file: string; line: number; column: number; rule: string }[];
