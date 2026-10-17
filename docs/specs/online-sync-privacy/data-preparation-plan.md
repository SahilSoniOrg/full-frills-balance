# Separate financial data capture, preparation and restore validation

Status: implemented; validation results are recorded below.

## Objective

Make the financial data boundary easy to inspect and test: exactly which records and fields leave the app, which privacy transformations apply, and what must be valid before restored records enter the database.

Extract the mixed responsibilities in `src/services/sync/rowSource.ts` into a small number of modules. Retain existing crypto/protocol APIs, versioned short-key codecs, repositories and backup/restore workflows. Success is independently testable data policy, not a larger number of services.

## Data flow

Export/commit preparation:

```text
Repository pages + Workplace + preferences + currency reference data
  → field selection / normalization / privacy sanitization / inclusion policy
  → complete Workplace validation
  → existing canonical short-key codecs
  → existing crypto and manifest construction
```

Restore:

```text
Existing archive and crypto verification/decryption
  → existing versioned payload decoding
  → complete Workplace and financial-reference validation
  → local currency-precision compatibility check
  → existing atomic publication / receipt / key installation / balance rebuild
```

Before extraction, `rowSource.ts` combined paginated repository access, physical-schema lookup, a column allowlist, boolean/null normalization, SMS metadata/audit sanitization, fingerprint hashing, pending-SMS exclusion, metadata assembly, field/enum/reference validation and `BatchImportData` mapping. `restoreBackup.ts` imported its validators, so restore validation also loaded the module's database/preferences dependencies.

## Target ownership

Files under the existing `src/services/sync` directory:

| Module | Owns | Inputs / outputs |
| --- | --- | --- |
| `rowSource.ts` | Repository capture, pagination, Workplace lookup, preference/currency reads and orchestration of preparation under the existing consistency boundary | Workplace ID → prepared and validated `RowSourceRecord[]` |
| `rowPreparation.ts` | Export projection policy, normalization, inclusion rules, sanitization and metadata assembly | Plain projected records and explicitly supplied metadata/reference values → included prepared rows or explicit exclusion |
| `workplaceRowValidation.ts` | Complete-state shape/identity/enum/reference validation, precision-map completeness and mapping to `BatchImportData` | Unknown/decoded row state + Workplace ID → validated rows / import data |
| Existing `rowTables.ts`, `shortKeys`, `rowUpgrades.ts` | Financial field schema, versioned mapping, canonical encoding/decoding and row upgrades | Keep their current contracts |

Put the shared record type in a small type-only module if necessary to prevent preparation/validation importing the database-owning module. Do not add a service per table or a new schema/plugin registry.

The preparation and validation modules must not import repository/database instances, preferences singletons, React, file adapters, native bridges or key hierarchy operations. Immutable profile definitions and existing pure domain validators/sanitizers are allowed. Inspect transitive dependencies as well: moving a function is insufficient if its imports still initialize storage or the database.

Reuse the existing financial schema and physical projection definitions. Preserve the current schema-column existence/type checks and boolean conversion behavior. If a pure helper needs physical type information, supply plain descriptors resolved by the capture owner rather than importing the database runtime or maintaining a second hand-written type schema.

## Preserve these semantics

- The same 12 logical source types, fields, record IDs, audit history, timestamps and Workplace metadata travel. Derived balances, reference caches and Device-local settings remain excluded.
- SQL null/undefined omission and optional-field behavior remain unchanged; no invented zero/false/empty-string defaults. Preserve legacy boolean normalization exactly during this extraction.
- Export continues sanitizing structured SMS metadata/audit changes and hashing legacy fingerprints. Arbitrary user-authored text is not automatically scrubbed. Restore validates received content; do not silently repair untrusted financial records or introduce new sanitization rules.
- Pending Device SMS rows remain excluded under the existing channel/status rule. Preserve exactly which completed SMS/inbox rows travel.
- Pagination advances using the last raw row even when every row on a page is excluded. Preparation must not own or mutate the pagination cursor.
- Preserve all current duplicate, enum, reference, reversal-link, single-Workplace and currency-precision checks. Source/live-state validation continues rejecting tombstones; future incremental apply is outside this work.
- Canonical payload bytes, short-key assignments, dictionary assets/IDs, schema versions, content hashes and archive format remain unchanged.
- `readWorkplaceRows` retains its current consistency wrapper. `readWorkplaceRowsInWriter` still requires the caller's existing writer. `buildCommit`/`buildBackupCommit` retain transaction ownership; no nested writer, lock shortening, snapshot redesign or movement of encryption outside the current lock.
- Database consistency does not make preference/reference-service reads part of the same transaction. Preserve current timing and avoid claiming a stronger snapshot guarantee.
- Restore checks remain before financial publication. Keep cryptographic verification, identity recovery, publication receipts, post-publication key installation, warning behavior and the new durable recovery workflow unchanged.

## Implementation sequence

### 1. Characterize one complete financial example

Before moving functions, add a synthetic example containing a Workplace, relevant accounts, one balanced journal, its transaction legs and journal metadata. Follow it from repository projection through sanitization and canonical encoding, and back through decoding/validation/import mapping.

Include structured private metadata and representative nullable/optional fields. Fix expected selected fields and canonical bytes/hash from the current implementation; do not regenerate expectations to make the extraction pass. Extend with focused examples for audit sanitization, fingerprints and SMS inclusion/exclusion. No real financial or credential data in fixtures.

### 2. Extract pure preparation and validation

- Move existing pure field/enum/reference/full-state checks and import mapping into the validation owner. Keep `validateImportedData` as the existing financial-reference owner; do not reimplement it. Inspect its dependency graph before calling the new boundary independent of database initialization.
- Move `cleanPhysicalRow` behavior and the SMS inclusion rule into preparation helpers with explicit plain inputs. Capture remains responsible for resolving schema/reference/preference information and supplying it.
- Have pure metadata assembly consume Workplace values, `safeToSpendDays` and a supplied currency-precision map. Keep currency collection and map validation inspectable without service calls.
- Preserve the existing codecs; do not create a competing encode/decode implementation. Remove duplicate validation only if equivalence is demonstrated; eliminating repeated work is not a prerequisite for this extraction.
- Avoid retaining an additional full raw database copy: page-by-page pure preparation is sufficient, followed by existing complete-state validation.

### 3. Wire capture and restore to their owners

- Keep `rowSource` as the database-facing capture API used by commit builders. Reduce it to fetching pages/metadata, applying preparation, advancing cursors and invoking full-state validation.
- Update `restoreBackup.ts` to import validation/import mapping directly from the pure owner instead of `rowSource.ts`. Keep local currency-precision comparison in the restore workflow because it requires reference-service access.
- Update other callers and tests. Temporary re-exports may ease the move but must not leave restore depending on a module that initializes capture services.
- Keep source read scopes/deleted-row rules in existing repositories. No new raw SQL or database writer appears in preparation/validation code.

### 4. Enforce and verify the boundary

- Add or extend existing architecture checks to reject persistence/preferences/UI/crypto-engine imports in preparation/validation, including type-only imports of runtime models. Permit the generic protocol encoding utilities and plain app types they genuinely need.
- Test that loading and using the pure boundary does not initialize storage, database adapters or the crypto runtime. Account for transitive imports; a direct-import check alone does not establish this.
- Document where selected fields and privacy policy live, and how capture and restore use the same complete-state rules.

## Test coverage and acceptance

- Pure tests cover exact field projection, null omission, boolean normalization, enums, non-mutating transformations, structured metadata/audit sanitization, fingerprint hashing, SMS status filtering and metadata/precision assembly.
- Shared validation tests cover missing/duplicate/foreign Workplace metadata, duplicate record IDs, unsupported fields/types/enums, missing account/journal/metadata/reversal references, currency-map completeness and tombstone rejection. Preserve existing financial-validator coverage rather than copying its implementation into tests.
- Capture integration tests cover Workplace scoping, repository pagination, fully filtered pages followed by included rows, last-raw-ID cursor advancement and the existing in-writer/read consistency paths.
- The journal example produces the same canonical bytes/content hash before and after extraction and maps back to equivalent import records. Existing row/model/commit tests still detect changes and deletions as before.
- Existing restore/publication/receipt tests prove invalid data cannot publish or install Workplace keys and successful retries remain idempotent. Pure validator mocks are not sufficient evidence for that guarantee.
- Run type checking, architecture checks, focused preparation/validation/capture tests, existing sync/restore/publication tests and the recovery workflow/hook regressions. Run dictionary checks to demonstrate profile assets did not drift.
- Build web and E2E exports and run the existing browser scenarios, including fixed pre-refactor archive recovery. Add browser coverage only for a material behavior not already exercised at the appropriate lower boundary.
- No native/WASM rebuild should be needed because this work changes application preparation only. If codec/schema/dictionary/build-hashed inputs change, explain why, run the artifact freshness gate and complete the required rebuild/parity checks; do not bypass it.

## Scope exclusions

No new export format, privacy-policy expansion, business-rule changes, generic backup manager, file-adapter rewrite, crypto changes, streaming redesign, concurrency/sync implementation, database migration or UI redesign. Preserve the separate uncommitted `app.config.ts` web-output change.

Completion means the app's outgoing data policy and incoming validation can be understood and tested with plain data, while capture, publication and crypto continue using their existing owners.

## Implemented boundary

- `rowPreparation.ts` owns the retained physical column allowlist, normalization, SMS inclusion/privacy rules, currency-code collection and plain Workplace metadata assembly. Capture resolves physical schema types into plain descriptors. Cleaning and enum checks still precede SMS exclusion; row identity/timestamp checks still follow it.
- `workplaceRowValidation.ts` owns complete live-state checks and import mapping. Call `validateWorkplaceRows` before `rowImportData`; mapping alone checks record shape, not complete-state identity/references. Both capture and restore keep that ordering, and restore keeps its existing additional financial validation.
- `rowSource.ts` owns repository pagination, metadata/reference/preference reads and the existing consistency APIs. It advances the cursor from the last raw row and never stores a second complete raw snapshot.
- `accountReferencePolicy.ts` contains the existing shared inventory and pure import checks; `importAccountReferences.ts` contains the existing plain import-to-reference mapping. Database-backed account operations and placeholder/remapping behavior retain their existing owners and public compatibility exports.
- `canonicalJsonData.ts` contains the unchanged canonical data operations used by `rowTables.ts`. The existing `canonicalJson.ts` API re-exports them and retains platform hashing, preventing validation from loading native crypto through schema definitions.
- `check:data-preparation-boundary`, included in `check:architecture`, follows transitive runtime imports and platform variants, rejects forbidden dependencies including type-only model imports, and has an independent Node loading test without app/platform mocks.

The frozen synthetic fixture in `src/services/sync/__tests__/fixtures/dataPreparation.v1.json` was captured with the pre-extraction implementation before moving functions. It fixes prepared rows, canonical short-key bytes, SHA-256 content hashes and import records. It must not be regenerated to accommodate extraction failures.

## Validation results

Validated on 2026-10-17 after completing the extraction:

- Application, native E2E and browser E2E TypeScript checks passed.
- `check:architecture` passed, including 42 architecture-script tests, transitive data-preparation checks and the unchanged five-cycle dependency baseline.
- Relevant Jest coverage passed: 372 tests across 49 distinct suites covering sync, restore/publication/receipts, recovery workflow/hook behavior, account-reference operations and import remapping. One new capture assertion was corrected to account for existing publication defaults and derived-balance mutation; its suite then passed. Frozen compatibility expectations were unchanged.
- Changed application TypeScript files passed ESLint; `git diff --check` passed.
- Dictionary artifact checks passed. Required-artifact WASM freshness and parity checks passed against all 12 shared row vectors plus manifest/malformed inputs. No build-hashed inputs changed and no native/WASM rebuild was needed.
- Normal web and development E2E exports passed.

All 11 existing Chromium scenarios passed (1.4 minutes), including fresh-browser recovery, truncated ZIP/signature/wrong-User rejection with clean retries, setup resumption, refusal to overwrite a local Workplace, independent Device approval/restore, the fixed pre-refactor archive and all three setup/dashboard smoke scenarios. Browser tests used the existing real WASM artifact. No additional browser scenarios were necessary for this application-layer extraction.
