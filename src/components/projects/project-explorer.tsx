"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  classifyProjectPath,
  MAX_PROJECT_FILES,
  MAX_PROJECT_FILE_BYTES,
  MAX_PROJECT_TOTAL_BYTES,
  type LocalProject,
} from "@/lib/projects/project-files";

type Candidate = {
  file: File;
  path: string;
  reason?: string;
  selected: boolean;
  unsupported: boolean;
};
const MAX_PICKER_ENTRIES = 5000;
function sizeLabel(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function shortName(path: string) {
  return path.split("/").at(-1) ?? path;
}

function DependencyGraph({
  project,
  selected,
  onSelect,
}: {
  project: LocalProject;
  selected: string;
  onSelect: (path: string) => void;
}) {
  const marker = `project-arrow-${useId().replace(/:/g, "")}`;
  const graphScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = graphScroll.current;
    if (!viewport) return;
    const center = () => {
      viewport.scrollLeft = Math.max(0, 420 - viewport.clientWidth / 2);
    };
    center();
    const observer = new ResizeObserver(center);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [selected]);
  const incoming = [
    ...new Set(
      project.edges
        .filter((edge) => edge.to === selected)
        .map((edge) => edge.from),
    ),
  ];
  const outgoing = [
    ...new Set(
      project.edges
        .filter((edge) => edge.from === selected)
        .map((edge) => edge.to),
    ),
  ];
  const left = incoming.slice(0, 6);
  const right = outgoing.slice(0, 6);
  const height = Math.max(left.length, right.length, 2) * 72 + 24;
  const centerY = height / 2;
  const rowY = (index: number, count: number) =>
    centerY + (index - (count - 1) / 2) * 72;
  const node = (path: string, x: number, y: number, current = false) => (
    <button
      key={`${x}-${path}`}
      type="button"
      className={`project-graph-node${current ? " is-selected" : ""}`}
      style={{ left: x, top: y - 25 }}
      title={path}
      aria-label={`Inspect ${path} in graph`}
      aria-pressed={current}
      onClick={() => onSelect(path)}
    >
      <span>{shortName(path)}</span>
      <small>
        {path.includes("/")
          ? path.slice(0, path.lastIndexOf("/"))
          : "project root"}
      </small>
    </button>
  );
  return (
    <div
      className="project-graph-scroll"
      ref={graphScroll}
      tabIndex={0}
      aria-label="Dependency graph, scroll horizontally for all nodes"
    >
      <div className="project-graph-labels">
        <span>Imported by</span>
        <span>Selected file</span>
        <span>Imports</span>
      </div>
      <div className="project-graph" style={{ height }}>
        <svg viewBox={`0 0 840 ${height}`} aria-hidden="true">
          <defs>
            <marker
              id={marker}
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <path d="M0,0 L7,3.5 L0,7" fill="currentColor" />
            </marker>
          </defs>
          {left.map((path, index) => (
            <path
              key={`in-${path}`}
              d={`M236 ${rowY(index, left.length)} C280 ${rowY(index, left.length)},280 ${centerY},318 ${centerY}`}
              markerEnd={`url(#${marker})`}
            />
          ))}
          {right.map((path, index) => (
            <path
              key={`out-${path}`}
              d={`M522 ${centerY} C560 ${centerY},560 ${rowY(index, right.length)},602 ${rowY(index, right.length)}`}
              markerEnd={`url(#${marker})`}
            />
          ))}
        </svg>
        {left.map((path, index) => node(path, 32, rowY(index, left.length)))}
        {node(selected, 318, centerY, true)}
        {right.map((path, index) => node(path, 604, rowY(index, right.length)))}
        {!left.length && (
          <p className="project-graph-empty project-graph-empty-left">
            No resolved incoming imports
          </p>
        )}
        {!right.length && (
          <p className="project-graph-empty project-graph-empty-right">
            No resolved outgoing imports
          </p>
        )}
      </div>
      {(incoming.length > 6 || outgoing.length > 6) && (
        <p className="project-graph-overflow">
          Showing up to six neighbors per side. All dependencies are listed
          below.
        </p>
      )}
    </div>
  );
}

const subscribeBrowserCapability = () => () => {};
const browserDirectorySupport = () =>
  "webkitdirectory" in document.createElement("input");
const serverDirectorySupport = () => false;

export interface ProjectExplorerState {
  project: LocalProject | null;
  selected: string;
  query: string;
}

export function ProjectExplorer({
  onSourceChange,
  initialState,
  onStateChange,
  getContextVersion,
}: {
  onSourceChange?: () => void;
  initialState?: ProjectExplorerState;
  onStateChange?: (state: ProjectExplorerState) => void;
  getContextVersion?: () => number;
}) {
  const directorySupported = useSyncExternalStore(
    subscribeBrowserCapability,
    browserDirectorySupport,
    serverDirectorySupport,
  );
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [name, setName] = useState("Local project");
  const [project, setProject] = useState<LocalProject | null>(
    initialState?.project ?? null,
  );
  const [selected, setSelected] = useState(initialState?.selected ?? "");
  const [query, setQuery] = useState(initialState?.query ?? "");
  useEffect(() => {
    onStateChange?.({ project, selected, query });
  }, [project, selected, query, onStateChange]);
  const [reviewQuery, setReviewQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [readAttempted, setReadAttempted] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const selectionTitle = useRef<HTMLHeadingElement>(null);
  const loadedTitle = useRef<HTMLHeadingElement>(null);
  const chooseFilesButton = useRef<HTMLButtonElement>(null);
  const included =
    candidates?.filter(
      (candidate) => candidate.selected && !candidate.reason,
    ) ?? [];
  const totalBytes = included.reduce(
    (total, candidate) => total + candidate.file.size,
    0,
  );
  const selectionLimit =
    included.length > MAX_PROJECT_FILES
      ? `Select at most ${MAX_PROJECT_FILES} files before importing.`
      : totalBytes > MAX_PROJECT_TOTAL_BYTES
        ? `Select no more than ${sizeLabel(MAX_PROJECT_TOTAL_BYTES)} of source before importing.`
        : "";
  const visibleFiles = useMemo(
    () =>
      project?.files.filter((file) =>
        file.path.toLowerCase().includes(query.toLowerCase()),
      ) ?? [],
    [project, query],
  );
  const currentFile = project?.files.find((file) => file.path === selected);
  const incoming = project?.edges.filter((edge) => edge.to === selected) ?? [];
  const outgoing =
    project?.edges.filter((edge) => edge.from === selected) ?? [];
  const dependencyNotes =
    project?.issues.filter(
      (issue) =>
        issue.path === selected &&
        (issue.kind === "external" || issue.kind === "unresolved"),
    ) ?? [];
  const currentIssues =
    project?.issues.filter((issue) => issue.path === selected) ?? [];

  function stage(files: FileList | null, directory: boolean) {
    if (!files?.length) return;
    setError("");
    setReadAttempted(false);
    if (files.length > MAX_PICKER_ENTRIES) {
      setCandidates(null);
      setError(
        `This selection contains more than ${MAX_PICKER_ENTRIES.toLocaleString()} entries. Choose a smaller source folder or individual files.`,
      );
      return;
    }
    const seen = new Set<string>();
    const next = Array.from(files, (file): Candidate => {
      const relative = (
        directory ? file.webkitRelativePath || file.name : file.name
      ).replaceAll("\\", "/");
      const path =
        directory && relative.includes("/")
          ? relative.slice(relative.indexOf("/") + 1)
          : relative;
      const originalClassification = classifyProjectPath(relative);
      const classification = originalClassification.included
        ? classifyProjectPath(path)
        : originalClassification;
      let reason = classification.included
        ? undefined
        : (classification.reason ?? "Unsupported source file");
      if (!reason && file.size > MAX_PROJECT_FILE_BYTES)
        reason = `Over the ${sizeLabel(MAX_PROJECT_FILE_BYTES)} per-file limit`;
      if (!reason && seen.has(path))
        reason =
          "Duplicate path; choose a folder to preserve unique file paths";
      seen.add(path);
      return {
        file,
        path: path.replaceAll("\\", "/"),
        reason,
        selected: !reason,
        unsupported: reason?.startsWith("Unsupported file type") ?? false,
      };
    });
    setCandidates(next);
    setReviewQuery("");
    setName(
      directory
        ? files[0]?.webkitRelativePath.split("/")[0] || "Local project"
        : "Local project",
    );
  }

  async function importSelection() {
    if (busy || !included.length || selectionLimit) return;
    const contextVersion = getContextVersion?.();
    const isCurrent = () =>
      alive.current && getContextVersion?.() === contextVersion;
    setBusy(true);
    setReadAttempted(true);
    setError("");
    try {
      const sourceFiles = [];
      for (const candidate of included) {
        const source = await candidate.file.text();
        if (!isCurrent()) return;
        if (source.includes("\u0000")) throw new Error("binary-file");
        sourceFiles.push({ path: candidate.path, source });
      }
      const { parseLocalProject } =
        await import("@/lib/projects/local-project");
      if (!isCurrent()) return;
      const result = parseLocalProject(
        name.trim() || "Local project",
        sourceFiles,
      );
      if (!result.files.length) {
        setError(
          "No supported source files could be imported. Review your selection and choose readable JavaScript or TypeScript files.",
        );
        return;
      }
      onSourceChange?.();
      setProject(result);
      setSelected(result.files[0]?.path ?? "");
      setQuery("");
      setCandidates(null);
      requestAnimationFrame(() => loadedTitle.current?.focus());
    } catch (cause) {
      if (!isCurrent()) return;
      setError(
        cause instanceof Error && cause.message === "binary-file"
          ? "A selected file contains binary data. Deselect it or choose a smaller set of plain-text source files, then try again."
          : "The selected files could not be read or parsed. Choose the files again and check that they are available on this device.",
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  function selectFile(path: string) {
    setSelected(path);
    selectionTitle.current?.focus({ preventScroll: true });
  }

  return (
    <section className="project-explorer" aria-label="Local project workspace">
      <header className="project-heading">
        <div>
          <span className="project-eyebrow">YOUR SOURCE / LOCAL WORKSPACE</span>
          <h2>Explore a project.</h2>
          <p>Follow the imports. Read the source. Start with your own files.</p>
        </div>
        <span className="project-local-badge">
          <span aria-hidden="true" /> Local source
        </span>
      </header>
      <div className="project-scope-note">
        <strong>Separate from the booking research.</strong> Imported files have
        no attached hypotheses, tournaments, or evidence claims. Use the booking
        chapters to return to that research.
      </div>
      <div className="project-import-bar">
        <div className="project-import-actions">
          {directorySupported && (
            <button
              className="project-button project-button-primary"
              type="button"
              disabled={busy}
              onClick={() => folderInput.current?.click()}
            >
              Choose folder <span aria-hidden="true">↗</span>
            </button>
          )}
          <button
            className="project-button"
            type="button"
            disabled={busy}
            ref={chooseFilesButton}
            onClick={() => filesInput.current?.click()}
          >
            Choose files
          </button>
          {project && (
            <button
              type="button"
              className="project-text-button"
              disabled={busy}
              onClick={() => {
                onSourceChange?.();
                setProject(null);
                setCandidates(null);
                setSelected("");
                setError("");
                requestAnimationFrame(() => chooseFilesButton.current?.focus());
              }}
            >
              Clear project
            </button>
          )}
          <input
            ref={(node) => {
              folderInput.current = node;
              node?.setAttribute("webkitdirectory", "");
            }}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose project folder"
            disabled={busy}
            onChange={(event) => {
              stage(event.currentTarget.files, true);
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={filesInput}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose source files"
            disabled={busy}
            onChange={(event) => {
              stage(event.currentTarget.files, false);
              event.currentTarget.value = "";
            }}
          />
        </div>
        <p>
          {!directorySupported &&
            "Folder selection is unavailable here. Choose individual source files instead. "}
          Import stays in this browser tab. Use Saved workspaces to explicitly
          store source on this device. Nothing is uploaded or executed. Source
          can contain secrets; exclusions are not a complete secret scan.
        </p>
      </div>
      {error && (
        <p className="project-error" role="alert">
          {error}
        </p>
      )}
      {candidates && (
        <section
          className="project-review"
          aria-labelledby="project-review-title"
        >
          <div className="project-section-heading">
            <div>
              <span className="project-eyebrow">01 / REVIEW SELECTION</span>
              <h3 id="project-review-title">Review files before import</h3>
            </div>
            <span className="project-step-status" role="status">
              {busy
                ? "Reading selected source"
                : readAttempted
                  ? "Review before retry"
                  : "No source read yet"}
            </span>
          </div>
          <p className="project-help">
            This preview uses file names and sizes only. Uncheck anything you do
            not want to read. Folder selection preserves relative paths;
            individual files are treated as project-root files.
          </p>
          <div className="project-review-controls">
            <label>
              Project name
              <input
                value={name}
                maxLength={100}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Filter selected paths
              <input
                type="search"
                value={reviewQuery}
                onChange={(event) => setReviewQuery(event.target.value)}
                placeholder="Find a file or folder…"
              />
            </label>
          </div>
          <div className="project-review-summary">
            <span>
              <strong>{included.length}</strong> included ·{" "}
              {sizeLabel(totalBytes)}
            </span>
            <span>
              {
                candidates.filter(
                  (candidate) => candidate.reason && !candidate.unsupported,
                ).length
              }{" "}
              excluded ·{" "}
              {candidates.filter((candidate) => candidate.unsupported).length}{" "}
              unsupported ·{" "}
              {
                candidates.filter(
                  (candidate) => !candidate.reason && !candidate.selected,
                ).length
              }{" "}
              unchecked
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setCandidates(
                  candidates.map((candidate) => ({
                    ...candidate,
                    selected: false,
                  })),
                )
              }
            >
              Uncheck all
            </button>
          </div>
          <div
            className="project-review-list"
            tabIndex={0}
            aria-label="File inclusion preview"
          >
            {candidates
              .map((candidate, index) => ({ candidate, index }))
              .filter(({ candidate }) =>
                candidate.path
                  .toLowerCase()
                  .includes(reviewQuery.toLowerCase()),
              )
              .map(({ candidate, index }) => (
                <label
                  key={`${index}-${candidate.path}`}
                  className={`project-review-row${candidate.reason ? " is-excluded" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={candidate.selected}
                    disabled={busy || !!candidate.reason}
                    aria-label={`Include ${candidate.path}`}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setCandidates(
                        candidates.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, selected: checked }
                            : item,
                        ),
                      );
                    }}
                  />
                  <span>
                    <code>{candidate.path}</code>
                    {candidate.reason && (
                      <small>
                        {candidate.unsupported ? "Unsupported: " : "Excluded: "}
                        {candidate.reason}
                      </small>
                    )}
                  </span>
                  <span>{sizeLabel(candidate.file.size)}</span>
                </label>
              ))}
          </div>
          <div className="project-review-footer">
            <p>
              Up to {MAX_PROJECT_FILES} files ·{" "}
              {sizeLabel(MAX_PROJECT_FILE_BYTES)} per file ·{" "}
              {sizeLabel(MAX_PROJECT_TOTAL_BYTES)} total. Only supported source
              and configuration files are eligible.
            </p>
            <div>
              <button
                className="project-text-button"
                type="button"
                disabled={busy}
                onClick={() => {
                  setCandidates(null);
                  setError("");
                }}
              >
                Cancel
              </button>
              <button
                className="project-button project-button-primary"
                type="button"
                disabled={busy || !included.length || !!selectionLimit}
                onClick={importSelection}
              >
                {busy ? "Reading selected files…" : "Import selected files"}
              </button>
            </div>
          </div>
          {selectionLimit && (
            <p className="project-error" role="alert">
              {selectionLimit}
            </p>
          )}
          {!included.length && (
            <p className="project-help">
              Select at least one supported file to import.
            </p>
          )}
        </section>
      )}
      {!project && !candidates && (
        <div className="project-empty">
          <div className="project-empty-index" aria-hidden="true">
            <span>01</span>
            <i />
            <span>02</span>
            <i />
            <span>03</span>
          </div>
          <div className="project-empty-copy">
            <h3>A source map, from your files.</h3>
            <p>
              Choose a folder, review exactly what will be read, then inspect
              files and their resolved local imports.
            </p>
            <span>
              JavaScript & TypeScript · static import graph · full source view
            </span>
          </div>
        </div>
      )}
      {project && (
        <div className="project-loaded">
          <header className="project-loaded-heading">
            <div>
              <span className="project-eyebrow">IMPORTED PROJECT</span>
              <h3 ref={loadedTitle} tabIndex={-1}>
                {project.name}
              </h3>
            </div>
            <p>
              <strong>{project.files.length}</strong> files <span>/</span>{" "}
              <strong>{project.edges.length}</strong> resolved imports{" "}
              <span>/</span> <strong>{project.issues.length}</strong> notes
            </p>
          </header>
          <details className="project-coverage">
            <summary>Import coverage & limitations</summary>
            <ul>
              {project.coverage.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
            <p>
              Paths and source are untrusted input, displayed as text. This
              graph describes static imports among the selected files; it is not
              proof of runtime behavior or complete architecture.
            </p>
          </details>
          <div className="project-workbench">
            <aside className="project-file-panel" aria-label="Project files">
              <label htmlFor="project-file-search">Search project files</label>
              <input
                id="project-file-search"
                maxLength={200}
                type="search"
                placeholder="Filter by path…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="project-file-count">
                {visibleFiles.length} of {project.files.length} files
              </div>
              <div className="project-file-list">
                {visibleFiles.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    aria-label={`Open ${file.path}`}
                    aria-pressed={selected === file.path}
                    onClick={() => selectFile(file.path)}
                  >
                    <span className="project-file-icon" aria-hidden="true">
                      {file.path.split(".").at(-1)?.slice(0, 3)}
                    </span>
                    <span>{file.path}</span>
                  </button>
                ))}
                {!visibleFiles.length && (
                  <p className="project-help">No files match “{query}”.</p>
                )}
              </div>
            </aside>
            {currentFile && (
              <div className="project-file-detail">
                <header className="project-source-heading">
                  <div>
                    <span className="project-eyebrow">SELECTED FILE</span>
                    <h4 ref={selectionTitle} tabIndex={-1}>
                      {currentFile.path}
                    </h4>
                  </div>
                  <span>
                    {currentFile.source.split("\n").length.toLocaleString()}{" "}
                    lines
                  </span>
                </header>
                <section
                  className="project-graph-section"
                  aria-label="Interactive dependency graph"
                >
                  <DependencyGraph
                    project={project}
                    selected={selected}
                    onSelect={selectFile}
                  />
                </section>
                <div className="project-dependencies">
                  <section>
                    <h5>
                      Incoming <span>{incoming.length}</span>
                    </h5>
                    {incoming.length ? (
                      <ul>
                        {incoming.map((edge, index) => (
                          <li key={`${edge.from}-${index}`}>
                            <button
                              type="button"
                              onClick={() => selectFile(edge.from)}
                            >
                              {edge.from}
                              <span aria-hidden="true">↗</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No resolved incoming imports.</p>
                    )}
                  </section>
                  <section>
                    <h5>
                      Outgoing <span>{outgoing.length}</span>
                    </h5>
                    {outgoing.length ? (
                      <ul>
                        {outgoing.map((edge, index) => (
                          <li key={`${edge.to}-${index}`}>
                            <button
                              type="button"
                              onClick={() => selectFile(edge.to)}
                              title={edge.specifier}
                            >
                              {edge.to}
                              <span aria-hidden="true">↗</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No resolved outgoing imports.</p>
                    )}
                  </section>
                </div>
                {dependencyNotes.length > 0 && (
                  <section
                    className="project-reference-notes"
                    aria-label="External and unresolved dependencies"
                  >
                    <h5>Other references</h5>
                    <ul>
                      {dependencyNotes.map((issue, index) => (
                        <li key={index}>
                          <span className="project-reference-kind">
                            {issue.kind === "external"
                              ? "External package"
                              : "Unresolved"}
                          </span>
                          <code>{issue.specifier}</code>
                          <p>{issue.message}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {currentIssues.length > 0 && (
                  <details className="project-file-notes">
                    <summary>
                      {currentIssues.length} import{" "}
                      {currentIssues.length === 1 ? "note" : "notes"} for this
                      file
                    </summary>
                    <ul>
                      {currentIssues.map((issue, index) => (
                        <li key={index}>
                          {issue.specifier && <code>{issue.specifier}: </code>}
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="project-code-title">
                  <h5>Source</h5>
                  <span>Read only · full file</span>
                </div>
                <pre
                  className="project-source"
                  tabIndex={0}
                  aria-label="Source code"
                >
                  <code>{currentFile.source}</code>
                </pre>
              </div>
            )}
          </div>
          {project.issues.length > 0 && (
            <details className="project-all-notes">
              <summary>All project notes ({project.issues.length})</summary>
              <ul>
                {project.issues.map((issue, index) => (
                  <li key={index}>
                    <strong>{issue.path || "Project"}</strong>
                    {issue.specifier && <code> {issue.specifier}</code>}
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
