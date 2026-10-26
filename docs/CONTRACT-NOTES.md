# Implementation decisions and conformance scope

All 49 frozen definitions were freshly implemented from the externally pinned interface requirements. `test:plan` exercises published positive/negative records, every named helper type and both published semantic regression sets directly from immutable external Git objects. It normalizes placeholder digests only in memory for algorithm tests. Those synthetic objects are never authenticated evidence or demo recordings.

The app's own unit inputs and tests are newly authored. Runtime code imports no external schema, fixture, validation script or planning package. CI fetches the public planning Git objects into runner temporary storage outside the entry; it does not materialize planning sources into the submitted checkout.

## Dependencies are not assumed to be intent references

The frozen examples use capability IDs such as `auth` in `IntentV1.dependencies`. Therefore these are not validated as foreign keys to the current intent collection. Explicit `intentIds` and revision references do receive identity/confirmation checks. Dependency values remain strict IDs, unique and non-self-referential under the existing intent validator.

## Next route brackets and source manifests

The frozen v1 relative-path regex cannot encode square brackets used by a Next dynamic route directory. This slice preserves the frozen regex. Independent tree manifests use normalized real relative filenames, including `[id]`, and expose only their SHA-256 identity through the frozen receipt fields. A future graph extractor must report this v1 representation limit explicitly or resolve it through a reviewed versioned contract change; it must not silently broaden the frozen path schema or invent projected routes.

## Internal protected-store format

The protected controller's `evaluation.json` groups the unchanged frozen `receipt` and `checks` records. Its exact file bytes are allowlisted externally, and individual evidence files are rehashed before use. The wrapper is an internal storage format, not a new public API envelope or an alteration to any v1 record. Freshness/required-policy pins come from trusted configuration, never request bodies.

Canonicalization follows [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785): ECMAScript primitive serialization, UTF-16 key sorting and rejection of invalid/non-finite JSON values. Receipt hashing omits only its self-digest leaf; certificate hashing omits only its self-digest field; check records sort by ID before digesting. Authentication still requires separate custody and source identity checks.

Contract conformance and developer oracle tests establish implemented behavior under those tests. They do not establish a deployed API, real inference, safe isolation, hidden-test secrecy, general architecture benefit or Meta incremental advantage.
