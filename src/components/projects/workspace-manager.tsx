"use client";

import { useId, useRef, useState } from "react";
import {
  MAX_WORKSPACE_BYTES,
  MAX_TOTAL_STORAGE_BYTES,
  MAX_WORKSPACES,
  clearWorkspaces,
  deleteWorkspace,
  listWorkspaces,
  openWorkspace,
  renameWorkspace,
  saveWorkspace,
  type WorkspaceRecord,
  type WorkspaceSnapshot,
} from "@/lib/projects/workspace-store";

export function WorkspaceManager({
  snapshot,
  onOpen,
  notes,
  onNotesChange,
  localRequirements,
  onLocalRequirementsChange,
  isLocal,
}: {
  snapshot: WorkspaceSnapshot | null;
  onOpen: (record: WorkspaceRecord) => Promise<void> | void;
  notes: string;
  onNotesChange: (value: string) => void;
  localRequirements: string;
  onLocalRequirementsChange: (value: string) => void;
  isLocal: boolean;
}) {
  const id = useId();
  const [records, setRecords] = useState<WorkspaceRecord[]>([]);
  const [problems, setProblems] = useState<{ id: string; message: string }[]>(
    [],
  );
  const [name, setName] = useState("");
  const [deviceConsent, setDeviceConsent] = useState(false);
  const [sourceConsentFiles, setSourceConsentFiles] = useState<
    Extract<WorkspaceSnapshot["project"], { kind: "local" }>["files"] | null
  >(null);
  const currentSourceFiles =
    snapshot?.project.kind === "local" ? snapshot.project.files : null;
  const sourceConsent =
    currentSourceFiles !== null && sourceConsentFiles === currentSourceFiles;
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const nameInput = useRef<HTMLInputElement>(null);
  const summary = useRef<HTMLElement>(null);

  function refresh() {
    const result = listWorkspaces(window.localStorage);
    setRecords(result.records);
    setProblems(result.problems);
  }
  function failure(cause: unknown) {
    setError(
      cause instanceof Error && !(cause instanceof DOMException)
        ? cause.message
        : "Saved workspaces are unavailable on this device.",
    );
  }
  async function action(work: () => Promise<void> | void) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await work();
      refresh();
    } catch (cause) {
      failure(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details
      className="workspace-manager"
      onToggle={(event) => {
        if (event.currentTarget.open) {
          try {
            refresh();
            setError("");
          } catch (cause) {
            failure(cause);
          }
        }
      }}
    >
      <summary ref={summary}>
        Saved workspaces <span>ON THIS DEVICE</span>
      </summary>
      <div className="workspace-manager-body">
        <p className="workspace-disclosure">
          Save a copy in this browser’s local storage. Local projects include
          selected source files; booking workspaces include your draft
          requirements. Notes and navigation are included. Anyone using this
          browser profile can read them. Sharing consent, execution
          authorization, spending approval and authenticated evidence are never
          saved. Remove saved data below.
        </p>
        <p className="workspace-disclosure">
          Up to {MAX_WORKSPACES} workspaces ·{" "}
          {MAX_WORKSPACE_BYTES / 1024 / 1024} MiB per workspace ·{" "}
          {MAX_TOTAL_STORAGE_BYTES / 1024 / 1024} MiB total. Browser storage may
          have less room available.
        </p>
        <div className="workspace-drafts">
          {isLocal && (
            <div>
              <label htmlFor={`${id}-requirements`}>
                Project requirement drafts
              </label>
              <textarea
                id={`${id}-requirements`}
                value={localRequirements}
                maxLength={20000}
                onChange={(event) =>
                  onLocalRequirementsChange(event.target.value)
                }
                placeholder="What should this project support next?"
              />
            </div>
          )}
          <div>
            <label htmlFor={`${id}-notes`}>Workspace notes</label>
            <textarea
              id={`${id}-notes`}
              value={notes}
              maxLength={20000}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder="Questions, observations, and next steps…"
            />
          </div>
        </div>
        <form
          className="workspace-save"
          onSubmit={(event) => {
            event.preventDefault();
            if (!snapshot || !deviceConsent || (isLocal && !sourceConsent))
              return;
            void action(() => {
              saveWorkspace(window.localStorage, name, snapshot);
              setStatus("Workspace saved on this device.");
              setName("");
              setDeviceConsent(false);
              setSourceConsentFiles(null);
              requestAnimationFrame(() => nameInput.current?.focus());
            });
          }}
        >
          <label htmlFor={`${id}-name`}>
            Workspace name
            <input
              ref={nameInput}
              id={`${id}-name`}
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className="workspace-check">
            <input
              type="checkbox"
              checked={deviceConsent}
              onChange={(event) => setDeviceConsent(event.target.checked)}
            />
            I understand this workspace is saved on this device
          </label>
          {isLocal && (
            <label className="workspace-check">
              <input
                type="checkbox"
                checked={sourceConsent}
                onChange={(event) =>
                  setSourceConsentFiles(
                    event.target.checked ? currentSourceFiles : null,
                  )
                }
              />
              Store project source on this device
            </label>
          )}
          <button
            className="project-button project-button-primary"
            disabled={
              busy ||
              !snapshot ||
              !name.trim() ||
              !deviceConsent ||
              (isLocal && !sourceConsent)
            }
          >
            Save workspace
          </button>
          {!snapshot && <p>Choose a project before saving.</p>}
        </form>
        {error && (
          <p className="project-error" role="alert">
            {error}
          </p>
        )}
        <p className="workspace-status" role="status">
          {busy ? "Updating saved workspaces…" : status}
        </p>
        <section aria-label="Saved workspace list" className="workspace-list">
          {!records.length && <p>No saved workspaces on this device.</p>}
          {records.map((record) => (
            <article key={record.id}>
              <div>
                <h3>{record.name}</h3>
                <p>
                  {record.snapshot.project.kind === "local"
                    ? record.snapshot.project.name
                    : "Booking example"}{" "}
                  · Saved {new Date(record.updatedAt).toLocaleString()}
                </p>
              </div>
              {renameId === record.id ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void action(() => {
                      renameWorkspace(
                        window.localStorage,
                        record.id,
                        renameName,
                      );
                      setRenameId(null);
                      setStatus("Workspace renamed.");
                      requestAnimationFrame(() => summary.current?.focus());
                    });
                  }}
                >
                  <label>
                    New workspace name
                    <input
                      autoFocus
                      value={renameName}
                      onChange={(event) => setRenameName(event.target.value)}
                      maxLength={100}
                      required
                    />
                  </label>
                  <button
                    className="project-button"
                    disabled={busy || !renameName.trim()}
                  >
                    Save name
                  </button>
                  <button
                    type="button"
                    className="project-text-button"
                    onClick={() => {
                      setRenameId(null);
                      requestAnimationFrame(() => summary.current?.focus());
                    }}
                  >
                    Cancel rename
                  </button>
                </form>
              ) : (
                <div className="workspace-record-actions">
                  <button
                    type="button"
                    className="project-button"
                    disabled={busy}
                    aria-label={`Open workspace ${record.name}`}
                    onClick={() =>
                      void action(async () => {
                        await onOpen(
                          openWorkspace(window.localStorage, record.id),
                        );
                        setDeviceConsent(false);
                        setSourceConsentFiles(null);
                        setStatus(
                          "Workspace reopened. Requirements are drafts; review and confirm them before research.",
                        );
                        requestAnimationFrame(() => summary.current?.focus());
                      })
                    }
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="project-text-button"
                    disabled={busy}
                    aria-label={`Rename workspace ${record.name}`}
                    onClick={() => {
                      setRenameId(record.id);
                      setRenameName(record.name);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="project-text-button"
                    disabled={busy}
                    aria-label={`Delete workspace ${record.name}`}
                    onClick={() => setConfirmDelete(record.id)}
                  >
                    Delete
                  </button>
                </div>
              )}
              {confirmDelete === record.id && (
                <div className="workspace-confirm">
                  <p>Delete “{record.name}” from this device?</p>
                  <button
                    type="button"
                    className="project-button"
                    disabled={busy}
                    onClick={() =>
                      void action(() => {
                        deleteWorkspace(window.localStorage, record.id);
                        setConfirmDelete(null);
                        setStatus("Workspace deleted.");
                        requestAnimationFrame(() => summary.current?.focus());
                      })
                    }
                  >
                    Confirm delete
                  </button>
                  <button
                    type="button"
                    className="project-text-button"
                    onClick={() => setConfirmDelete(null)}
                  >
                    Keep workspace
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
        {!!problems.length && (
          <div className="workspace-problems" role="alert">
            <p>Some saved records could not be opened:</p>
            <ul>
              {problems.map((problem) => (
                <li key={problem.id}>
                  {problem.message}
                  <button
                    type="button"
                    className="project-text-button"
                    disabled={busy}
                    onClick={() => setConfirmDelete(problem.id)}
                  >
                    Remove unreadable record
                  </button>
                  {confirmDelete === problem.id && (
                    <div className="workspace-confirm">
                      <span>Remove this unreadable saved record?</span>
                      <button
                        type="button"
                        className="project-button"
                        disabled={busy}
                        onClick={() =>
                          void action(() => {
                            deleteWorkspace(window.localStorage, problem.id);
                            setConfirmDelete(null);
                            setStatus("Unreadable saved record removed.");
                            requestAnimationFrame(() =>
                              summary.current?.focus(),
                            );
                          })
                        }
                      >
                        Confirm delete
                      </button>
                      <button
                        type="button"
                        className="project-text-button"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Keep workspace
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="workspace-remove-all">
          <button
            type="button"
            className="project-text-button"
            disabled={busy}
            onClick={() => setConfirmAll(true)}
          >
            Remove all saved workspaces
          </button>
          {confirmAll && (
            <div className="workspace-confirm">
              <p>
                Remove all ForeCode workspaces saved in this browser? This
                cannot be undone.
              </p>
              <button
                type="button"
                className="project-button"
                disabled={busy}
                onClick={() =>
                  void action(() => {
                    clearWorkspaces(window.localStorage);
                    setConfirmDelete(null);
                    setConfirmAll(false);
                    setStatus("All saved workspaces removed from this device.");
                    requestAnimationFrame(() => summary.current?.focus());
                  })
                }
              >
                Confirm remove all
              </button>
              <button
                type="button"
                className="project-text-button"
                onClick={() => setConfirmAll(false)}
              >
                Keep saved workspaces
              </button>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
