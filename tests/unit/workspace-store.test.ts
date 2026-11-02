import { describe, it, expect, vi } from "vitest";
import {
  saveWorkspace,
  openWorkspace,
  listWorkspaces,
  renameWorkspace,
  deleteWorkspace,
  clearWorkspaces,
  STORAGE_PREFIX,
  MAX_WORKSPACE_BYTES,
  MAX_WORKSPACES,
  type WorkspaceSnapshot,
  type WorkspaceStorage,
} from "@/lib/projects/workspace-store";
class MemoryStorage implements WorkspaceStorage {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}
function snapshot(): WorkspaceSnapshot {
  return {
    project: {
      kind: "local",
      name: "Example",
      files: [{ path: "src/app.ts", source: "export const x = 1;" }],
    },
    bookingDrafts: {
      editor: {
        title: "",
        statement: "",
        priority: "medium",
        horizon: "unspecified",
      },
      requirements: [],
    },
    localRequirements: "Support search",
    notes: "Explore a cache",
    navigation: {
      chapter: "projects",
      selectedPath: "src/app.ts",
      query: "app",
    },
  };
}
describe("local versioned workspace records", () => {
  it("saves, reopens, replaces, renames and deletes without affecting unrelated data", () => {
    const storage = new MemoryStorage();
    storage.setItem("unrelated", "keep");
    const first = saveWorkspace(storage, " My workspace ", snapshot());
    expect(first.name).toBe("My workspace");
    expect(openWorkspace(storage, first.id)).toEqual(first);
    const changed = snapshot();
    changed.notes = "Updated";
    const updated = saveWorkspace(storage, "Updated", changed, first.id);
    expect(updated.createdAt).toBe(first.createdAt);
    expect(listWorkspaces(storage).records).toHaveLength(1);
    expect(openWorkspace(storage, first.id).snapshot.notes).toBe("Updated");
    expect(renameWorkspace(storage, first.id, "Renamed").name).toBe("Renamed");
    deleteWorkspace(storage, first.id);
    expect(listWorkspaces(storage)).toEqual({ records: [], problems: [] });
    expect(storage.getItem("unrelated")).toBe("keep");
  });
  it("retains booking requirements only as drafts", () => {
    const storage = new MemoryStorage();
    const state = snapshot();
    state.project = { kind: "booking" };
    state.localRequirements = "";
    state.navigation.selectedPath = "";
    state.bookingDrafts.requirements = [
      {
        title: "Cache",
        statement: "Reduce duplicate work",
        priority: "high",
        horizon: "later",
      },
    ];
    const saved = saveWorkspace(storage, "Booking", state);
    expect(
      openWorkspace(storage, saved.id).snapshot.bookingDrafts.requirements,
    ).toEqual(state.bookingDrafts.requirements);
    expect(JSON.stringify(saved)).not.toContain("confirmed");
  });
  it("rejects extra consent, authorization, evidence and result fields at every relevant level", () => {
    const storage = new MemoryStorage();
    const saved = saveWorkspace(storage, "Clean", snapshot());
    for (const extra of ["consent", "authorization", "evidence", "results"]) {
      const poisoned = { ...snapshot(), [extra]: true };
      expect(() => saveWorkspace(storage, "Bad", poisoned, saved.id)).toThrow(
        "invalid or unsupported",
      );
      const raw = JSON.parse(storage.getItem(STORAGE_PREFIX + saved.id)!);
      raw[extra] = true;
      storage.setItem(STORAGE_PREFIX + saved.id, JSON.stringify(raw));
      expect(() => openWorkspace(storage, saved.id)).toThrow("invalid");
      storage.setItem(STORAGE_PREFIX + saved.id, JSON.stringify(saved));
    }
    const draft = snapshot();
    Object.assign(draft.bookingDrafts.editor, { status: "confirmed" });
    expect(() => saveWorkspace(storage, "Bad draft", draft)).toThrow("invalid");
  });
  it("reports malformed, incompatible and oversized records without losing valid records; all are removable", () => {
    const storage = new MemoryStorage();
    const good = saveWorkspace(storage, "Good", snapshot());
    storage.setItem(STORAGE_PREFIX + "broken", "{");
    storage.setItem(STORAGE_PREFIX + "future", '{"version":2}');
    storage.setItem(
      STORAGE_PREFIX + "large",
      "x".repeat(MAX_WORKSPACE_BYTES + 1),
    );
    storage.setItem(STORAGE_PREFIX + "invalid/id", "{}");
    const listed = listWorkspaces(storage);
    expect(listed.records).toEqual([good]);
    expect(listed.problems).toHaveLength(4);
    expect(
      listed.problems.map((problem) => problem.message).join(" "),
    ).toContain("unsupported");
    for (const problem of listed.problems) deleteWorkspace(storage, problem.id);
    expect(listWorkspaces(storage).problems).toEqual([]);
  });
  it.each(
    [
      [{ path: ".env.local", source: "secret" }],
      [{ path: "node_modules/pkg.ts", source: "export {}" }],
      [{ path: "../outside.ts", source: "export {}" }],
      [{ path: "src\\app.ts", source: "export {}" }],
      [
        { path: "a.ts", source: "export {}" },
        { path: "a.ts", source: "export {}" },
      ],
      [{ path: "a.ts", source: "\0" }],
      [{ path: "a.ts", source: "é".repeat(262145) }],
    ].map((files) => ({ files })),
  )("rejects invalid source selection $files", ({ files }) => {
    const state = snapshot();
    state.project = { kind: "local", name: "Bad", files };
    state.navigation.selectedPath = "";
    expect(() => saveWorkspace(new MemoryStorage(), "Bad", state)).toThrow(
      "invalid",
    );
  });
  it("rejects project draft leakage and invalid navigation", () => {
    const local = snapshot();
    local.bookingDrafts.editor.title = "Booking draft";
    expect(() => saveWorkspace(new MemoryStorage(), "Bad", local)).toThrow(
      "invalid",
    );
    const booking = snapshot();
    booking.project = { kind: "booking" };
    expect(() => saveWorkspace(new MemoryStorage(), "Bad", booking)).toThrow(
      "invalid",
    );
    const navigation = snapshot();
    navigation.navigation.selectedPath = "missing.ts";
    expect(() => saveWorkspace(new MemoryStorage(), "Bad", navigation)).toThrow(
      "invalid",
    );
  });
  it("bounds record size, count and aggregate size while preserving earlier records", () => {
    const storage = new MemoryStorage();
    for (let i = 0; i < MAX_WORKSPACES; i++)
      saveWorkspace(storage, `Record ${i}`, snapshot());
    expect(() => saveWorkspace(storage, "Overflow", snapshot())).toThrow(
      "Ten workspaces",
    );
    expect(listWorkspaces(storage).records).toHaveLength(MAX_WORKSPACES);
    const large = snapshot();
    large.navigation.selectedPath = "";
    large.project = {
      kind: "local",
      name: "Large",
      files: Array.from({ length: 5 }, (_, i) => ({
        path: `${i}.ts`,
        source: "x".repeat(500_000),
      })),
    };
    expect(() => saveWorkspace(new MemoryStorage(), "Large", large)).toThrow(
      "2 MiB",
    );
    const aggregate = new MemoryStorage();
    large.project.files = large.project.files.slice(0, 3);
    saveWorkspace(aggregate, "First", large);
    expect(() => saveWorkspace(aggregate, "Second", large)).toThrow(
      "storage budget",
    );
    expect(listWorkspaces(aggregate).records).toHaveLength(1);
  });
  it("handles read denial and quota errors with safe messages and preserves old record", () => {
    const storage = new MemoryStorage();
    const saved = saveWorkspace(storage, "Original", snapshot());
    storage.setItem = () => {
      throw new Error("Sensitive implementation detail");
    };
    expect(() => renameWorkspace(storage, saved.id, "Replacement")).toThrow(
      "storage is unavailable or full",
    );
    expect(openWorkspace(storage, saved.id).name).toBe("Original");
    storage.getItem = () => {
      throw new Error("Sensitive implementation detail");
    };
    expect(() => openWorkspace(storage, saved.id)).toThrow(
      "storage is unavailable or full",
    );
    expect(() => listWorkspaces(storage)).toThrow(
      "storage is unavailable or full",
    );
  });
  it("bounds list parsing by record count including malformed records and still exposes removal", () => {
    const storage = new MemoryStorage();
    for (let i = 0; i < MAX_WORKSPACES + 3; i++)
      storage.setItem(STORAGE_PREFIX + `bad${String(i).padStart(2, "0")}`, "{");
    const parser = vi.spyOn(JSON, "parse");
    const result = listWorkspaces(storage);
    expect(parser).toHaveBeenCalledTimes(MAX_WORKSPACES);
    parser.mockRestore();
    expect(result.problems).toHaveLength(MAX_WORKSPACES + 3);
    expect(
      result.problems.filter((problem) =>
        problem.message.includes("not parsed"),
      ),
    ).toHaveLength(3);
    for (const problem of result.problems) deleteWorkspace(storage, problem.id);
    expect(storage.length).toBe(0);
  });
  it("counts malformed record bytes against the aggregate parsing budget", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      STORAGE_PREFIX + "a-large",
      "x".repeat(MAX_WORKSPACE_BYTES),
    );
    storage.setItem(STORAGE_PREFIX + "b-small", "{}");
    const parser = vi.spyOn(JSON, "parse");
    const result = listWorkspaces(storage);
    expect(parser).not.toHaveBeenCalled();
    parser.mockRestore();
    expect(result.problems).toHaveLength(2);
    expect(
      result.problems.every((problem) =>
        problem.message.includes("not parsed"),
      ),
    ).toBe(true);
  });
  it("rejects more than32 restored requirements", () => {
    const state = snapshot();
    state.project = { kind: "booking" };
    state.localRequirements = "";
    state.bookingDrafts.requirements = Array.from({ length: 33 }, () => ({
      ...state.bookingDrafts.editor,
    }));
    expect(() =>
      saveWorkspace(new MemoryStorage(), "Too many drafts", state),
    ).toThrow("invalid");
  });
  it("clear removes only namespaced data including malformed records", () => {
    const storage = new MemoryStorage();
    saveWorkspace(storage, "Saved", snapshot());
    storage.setItem(STORAGE_PREFIX + "bad", "{");
    storage.setItem("other", "keep");
    clearWorkspaces(storage);
    expect([...storage.data.entries()]).toEqual([["other", "keep"]]);
  });
});
