import { z } from "zod";
import { HorizonSchema, PrioritySchema } from "../contracts/common";
import {
  classifyProjectPath,
  MAX_PROJECT_FILES,
  MAX_PROJECT_FILE_BYTES,
  MAX_PROJECT_TOTAL_BYTES,
} from "./project-files";

export const STORAGE_PREFIX = "forecode.workspace.v1:";
export const MAX_WORKSPACE_BYTES = 2 * 1024 * 1024;
/** Conservative UTF-16 key/value budget, below typical localStorage quotas. */
export const MAX_TOTAL_STORAGE_BYTES = 4 * 1024 * 1024;
export const MAX_WORKSPACES = 10;
const MAX_STORAGE_KEYS = 10_000;
const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const draftSchema = z.strictObject({
  title: z.string().max(120),
  statement: z.string().max(2000),
  priority: PrioritySchema,
  horizon: HorizonSchema,
});
export type DraftInput = z.infer<typeof draftSchema>;
const draftsSchema = z.strictObject({
  editor: draftSchema,
  requirements: z.array(draftSchema).max(32),
});
export type BookingDraftState = z.infer<typeof draftsSchema>;
const snapshotSchema = z
  .strictObject({
    project: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("booking") }),
      z.strictObject({
        kind: z.literal("local"),
        name: z.string().min(1).max(200),
        files: z
          .array(
            z.strictObject({
              path: z.string().min(1).max(1024),
              source: z.string().max(MAX_PROJECT_FILE_BYTES),
            }),
          )
          .min(1)
          .max(MAX_PROJECT_FILES),
      }),
    ]),
    bookingDrafts: draftsSchema,
    localRequirements: z.string().max(20_000),
    notes: z.string().max(20_000),
    navigation: z.strictObject({
      chapter: z.enum([
        "case",
        "lab",
        "tournament",
        "time",
        "evidence",
        "report",
        "projects",
      ]),
      selectedPath: z.string().max(1024),
      query: z.string().max(200),
    }),
  })
  .superRefine((snapshot, ctx) => {
    if (snapshot.project.kind === "booking") {
      if (snapshot.localRequirements !== "")
        ctx.addIssue({ code: "custom", message: "Project draft mismatch" });
      return;
    }
    if (
      snapshot.bookingDrafts.requirements.length ||
      snapshot.bookingDrafts.editor.title ||
      snapshot.bookingDrafts.editor.statement
    )
      ctx.addIssue({ code: "custom", message: "Project draft mismatch" });
    let total = 0;
    const paths = new Set<string>();
    for (const file of snapshot.project.files) {
      const size = new TextEncoder().encode(file.source).byteLength;
      const normalized = file.path.replaceAll("\\", "/");
      total += size;
      if (
        !classifyProjectPath(file.path).included ||
        normalized !== file.path ||
        paths.has(normalized) ||
        file.source.includes("\0") ||
        size > MAX_PROJECT_FILE_BYTES ||
        total > MAX_PROJECT_TOTAL_BYTES
      )
        ctx.addIssue({ code: "custom", message: "Invalid project source" });
      paths.add(normalized);
    }
    if (
      snapshot.navigation.selectedPath &&
      !paths.has(snapshot.navigation.selectedPath)
    )
      ctx.addIssue({ code: "custom", message: "Unknown selected module" });
  });
export type WorkspaceSnapshot = z.infer<typeof snapshotSchema>;
const recordSchema = z.strictObject({
  version: z.literal(1),
  id: idSchema,
  name: z.string().trim().min(1).max(120),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  snapshot: snapshotSchema,
});
export type WorkspaceRecord = z.infer<typeof recordSchema>;
export type WorkspaceStorage = Pick<
  Storage,
  "length" | "key" | "getItem" | "setItem" | "removeItem"
>;

function safe<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof WorkspaceError) throw error;
    throw new WorkspaceError(
      "Device storage is unavailable or full. Existing workspaces were not replaced.",
    );
  }
}
class WorkspaceError extends Error {}
function fail(message: string): never {
  throw new WorkspaceError(message);
}
function validId(id: string): string {
  if (!idSchema.safeParse(id).success) fail("Invalid workspace identifier.");
  return id;
}
function entries(
  storage: WorkspaceStorage,
): { key: string; value: string | null }[] {
  if (storage.length > MAX_STORAGE_KEYS)
    fail("Device storage contains too many entries to inspect safely.");
  const result: { key: string; value: string | null }[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(STORAGE_PREFIX))
      result.push({ key, value: storage.getItem(key) });
  }
  return result.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
function decode(value: string | null, id: string): WorkspaceRecord {
  if (value === null) fail("Workspace was not found on this device.");
  if (
    value.length > MAX_WORKSPACE_BYTES ||
    new TextEncoder().encode(value).byteLength > MAX_WORKSPACE_BYTES
  )
    fail("Workspace exceeds the supported size limit.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail("Workspace data is malformed. You can delete this saved record.");
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "version" in parsed &&
    parsed.version !== 1
  )
    fail("Workspace version is unsupported. You can delete this saved record.");
  const result = recordSchema.safeParse(parsed);
  if (!result.success || result.data.id !== id)
    fail("Workspace data is invalid. You can delete this saved record.");
  return result.data;
}
export function listWorkspaces(storage: WorkspaceStorage): {
  records: WorkspaceRecord[];
  problems: { id: string; message: string }[];
} {
  return safe(() => {
    const records: WorkspaceRecord[] = [];
    const problems: { id: string; message: string }[] = [];
    let inspected = 0;
    let inspectedBytes = 0;
    for (const entry of entries(storage)) {
      const id = entry.key.slice(STORAGE_PREFIX.length);
      inspected += 1;
      inspectedBytes += 2 * (entry.key.length + (entry.value?.length ?? 0));
      if (
        inspected > MAX_WORKSPACES ||
        inspectedBytes > MAX_TOTAL_STORAGE_BYTES
      ) {
        problems.push({
          id,
          message:
            "Saved record was not parsed because the workspace count or total size limit was exceeded. Delete excess records to reopen remaining workspaces.",
        });
        continue;
      }
      try {
        validId(id);
        records.push(decode(entry.value, id));
      } catch (error) {
        problems.push({
          id,
          message:
            error instanceof WorkspaceError
              ? error.message
              : "Workspace data is invalid.",
        });
      }
    }
    records.sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    );
    return { records, problems };
  });
}
function write(
  storage: WorkspaceStorage,
  record: WorkspaceRecord,
): WorkspaceRecord {
  const checked = recordSchema.safeParse(record);
  if (!checked.success)
    fail("Workspace contains invalid or unsupported data. Nothing was saved.");
  const value = JSON.stringify(checked.data);
  if (new TextEncoder().encode(value).byteLength > MAX_WORKSPACE_BYTES)
    fail(
      "Workspace exceeds the 2 MiB saved-data limit. Select fewer or smaller source files.",
    );
  const key = STORAGE_PREFIX + record.id;
  const existing = entries(storage);
  if (
    !existing.some((entry) => entry.key === key) &&
    existing.length >= MAX_WORKSPACES
  )
    fail("Ten workspaces are already saved. Delete one before saving another.");
  const bytes =
    existing
      .filter((entry) => entry.key !== key)
      .reduce(
        (sum, entry) =>
          sum + 2 * (entry.key.length + (entry.value?.length ?? 0)),
        0,
      ) +
    2 * (key.length + value.length);
  if (bytes > MAX_TOTAL_STORAGE_BYTES)
    fail(
      "Saved workspaces exceed the device storage budget. Delete a workspace or select less source.",
    );
  storage.setItem(key, value);
  return checked.data;
}
export function saveWorkspace(
  storage: WorkspaceStorage,
  name: string,
  snapshot: WorkspaceSnapshot,
  id?: string,
): WorkspaceRecord {
  return safe(() => {
    const previous = id === undefined ? undefined : openWorkspace(storage, id);
    const now = new Date().toISOString();
    return write(storage, {
      version: 1,
      id: previous?.id ?? crypto.randomUUID(),
      name,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      snapshot,
    });
  });
}
export function openWorkspace(
  storage: WorkspaceStorage,
  id: string,
): WorkspaceRecord {
  return safe(() => decode(storage.getItem(STORAGE_PREFIX + validId(id)), id));
}
export function renameWorkspace(
  storage: WorkspaceStorage,
  id: string,
  name: string,
): WorkspaceRecord {
  return safe(() =>
    write(storage, {
      ...openWorkspace(storage, id),
      name,
      updatedAt: new Date().toISOString(),
    }),
  );
}
export function deleteWorkspace(storage: WorkspaceStorage, id: string): void {
  // Malformed identifiers from listing are removable too, but cannot escape this prefix.
  safe(() => {
    if (id.length > MAX_WORKSPACE_BYTES)
      fail("Workspace identifier exceeds the supported limit.");
    storage.removeItem(STORAGE_PREFIX + id);
  });
}
export function clearWorkspaces(storage: WorkspaceStorage): void {
  safe(() => {
    for (const entry of entries(storage)) storage.removeItem(entry.key);
  });
}
