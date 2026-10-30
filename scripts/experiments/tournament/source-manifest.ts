import { z } from "zod";
import { Sha256Schema } from "../../../src/lib/contracts/common";

// Literal snapshot names, including Next dynamic routes. Public contract paths
// also describe policy globs; keep that frozen schema separate from this one.
const SnapshotPathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) =>
    value
      .split("/")
      .every(
        (part) =>
          part !== "." && part !== ".." && /^[A-Za-z0-9_.[\]-]+$/.test(part),
      ),
  );
export const SourceManifestSchema = z
  .array(z.strictObject({ path: SnapshotPathSchema, sha256: Sha256Schema }))
  .min(1)
  .max(100);
