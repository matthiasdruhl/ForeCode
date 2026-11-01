import { z } from "zod";
import { RelativePathSchema } from "../contracts/common";

// Meta accepted this expression in a controlled live comparison where the
// original lookahead expression returned HTTP500. Both describe the same path
// language: no leading slash and no segment exactly '..'. Empty later segments,
// '.', three-or-more dots, and the original character set remain supported.
// Keep the frozen Zod validators and the schema embedded in the prompt intact.
const segment =
  "(?:[A-Za-z0-9_.*-]*[A-Za-z0-9_*-][A-Za-z0-9_.*-]*|\\.|\\.{3,})";
export const META_RELATIVE_PATH_PATTERN = `^${segment}(?:/${segment}?)*$`;

export function metaCompatibleSchema<T extends object>(original: T): T {
  const schema = structuredClone(original);
  const pathPattern = z.toJSONSchema(RelativePathSchema).pattern;
  function visit(value: unknown): void {
    if (value === null || typeof value !== "object") return;
    if (!Array.isArray(value)) {
      const node = value as Record<string, unknown>;
      if (node.type === "string" && node.pattern === pathPattern)
        node.pattern = META_RELATIVE_PATH_PATTERN;
    }
    Object.values(value).forEach(visit);
  }
  visit(schema);
  return schema;
}
