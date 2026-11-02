import { describe, expect, it } from "vitest";
import { z } from "zod";
import { RelativePathSchema } from "@/lib/contracts/common";
import { contentSchemas } from "@/lib/foresight/prompts";
import {
  metaCompatibleSchema,
  META_RELATIVE_PATH_PATTERN,
} from "@/lib/foresight/provider-schema";

describe("Meta path schema compatibility", () => {
  it("preserves path acceptance across exhaustive short segments and separators", () => {
    const original = new RegExp(z.toJSONSchema(RelativePathSchema).pattern!);
    const portable = new RegExp(META_RELATIVE_PATH_PATTERN);
    let checked = 0;
    function visit(value: string, remaining: number): void {
      if (portable.test(value) !== original.test(value))
        throw new Error(`Path languages differ at ${JSON.stringify(value)}`);
      checked++;
      if (remaining)
        for (const char of ["a", "Z", "0", "_", ".", "/", "*", "-"])
          visit(value + char, remaining - 1);
    }
    visit("", 6);
    expect(checked).toBe(299593);
    for (const path of [
      "/src/a",
      "../src",
      "src/../a",
      "src/..",
      "..",
      ".",
      "...",
      "src/.../a",
      "src//a/",
      "src/./a",
      "src/a..b",
      "src/..a",
      "src/[id]",
      "src/a\\b",
      "src/é",
      "src/a\n",
      "a".repeat(513),
      "src/" + ".".repeat(500),
    ])
      expect(portable.test(path), path).toBe(original.test(path));
  });

  it("changes only the three proposal path patterns and leaves other schemas exact", () => {
    for (const step of ["propose", "hypothesize", "challenge"] as const) {
      const original = z.toJSONSchema(contentSchemas[step]);
      const before = structuredClone(original);
      const portable = metaCompatibleSchema(original);
      const frozenPattern = z.toJSONSchema(RelativePathSchema).pattern;
      let replaced = 0;
      function restore(value: unknown): void {
        if (!value || typeof value !== "object") return;
        if (!Array.isArray(value)) {
          const node = value as Record<string, unknown>;
          if (node.pattern === META_RELATIVE_PATH_PATTERN) {
            node.pattern = frozenPattern;
            replaced++;
          }
        }
        Object.values(value).forEach(restore);
      }
      restore(portable);
      expect(replaced).toBe(step === "propose" ? 3 : 0);
      expect(portable).toEqual(before);
      expect(original).toEqual(before);
    }
  });
});
