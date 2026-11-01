# Local project exploration and saved workspaces

Implemented in the isolated `ForeCode-Project-Workspaces` checkout on `codex/project-workspaces`, based on `94a0a20`. The separate tournament checkout/runtime is not used for feature validation. All implementation and synthetic tests are event-authored; external planning is read-only context.

## Project import

Open **Local Projects**, choose a directory (supported browsers) or individual files, review paths/sizes/exclusions, and explicitly import. The preview does not read file contents. Individual-file selection flattens paths to file names; choose a folder to retain relative paths. Duplicate paths are explicitly excluded. Imported content is untrusted text and is never executed, installed, built, or uploaded. Import does not approve any provider payload.

Limits: 5,000 picker entries, 500 retained files, 512 KiB per file, 10 MiB total source. The parser independently enforces UTF-8 byte limits, validates relative paths, and caps diagnostics and AST traversal. Environment/credential names, dependency directories, build outputs and version-control internals are excluded before file reads. Exclusions are not a secret scan: source code may itself contain secrets. Only JS/TS/JSX/TSX/module variants and tsconfig/jsconfig JSON are retained; unsupported assets and package manifests are not read.

The TypeScript parser is lazy-loaded only on explicit import. Static imports, re-exports, import types and literal dynamic references are inspected locally. Relative paths, extension substitution, directory indexes and nearest tsconfig/jsconfig `baseUrl` and exact/single-wildcard `paths` aliases are resolved against selected source only. JSONC is supported. Named configs, inheritance/references, package resolution/exports, framework conventions, custom bundler aliases and CommonJS calls are not resolved. Unsupported resolution-changing configuration is reported and speculative edges are suppressed. Literal dynamic imports are possible edges, never proof of runtime execution. Nonliteral dynamic imports, parser failures and truncation are visible limitations. External package references are unverified, distinct from unresolved references and resolved project edges.

Search, source inspection and incoming/outgoing lists accompany a scrollable graph of the selected module and up to six neighbors per side; the full dependency lists remain available. Keyboard buttons and scroll regions work at narrow widths. Source is rendered as escaped text. Coverage always says partial.

Booking remains available through its labeled chapters. Imported sources cannot use booking templates, experiments or evidence. Crossing between local and booking contexts, or replacing source, clears dependent model results and exact-payload approval. Booking requirements remain scoped to booking. Historical booking evidence still uses existing server authentication and is never reassigned to imported source.

## Validation and progress

Priority 1 parser: 78 focused tests and strict TypeScript passed before integration. Full integration checks and browser acceptance results are recorded in `IMPLEMENTATION-LOG.md`. Priority 2 begins only after Priority 1 integration acceptance.
