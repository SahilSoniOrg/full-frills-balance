# Reduce application knowledge in payload crypto

Status: implemented; validation results and remaining platform gates are recorded below.

## Objective

Keep the existing key-management APIs and working native/WASM engines. Separate the generic encrypted-record protocol from the financial backup profile so that the engine does not hardcode accounts, journals, budgets, or their schemas.

Success means a new record type can be added through app profile definitions and generated compression assets, without editing handwritten encryption code. Shipping new dictionaries still requires rebuilding native/WASM artifacts. This is an internal refactor, not a new backup format or a general-purpose crypto SDK.

## Pre-refactor boundaries

- `modules/expo-key-crypto/cpp` owns keys, cryptographic operations, row compression, authenticated headers and manifest signing. `RowCodec.cpp` also hardcodes the 12 financial table names. `RowCrypto.cpp` checks dictionary membership using the `<table>/...` naming convention.
- `src/services/backup/nativeKeyApi.ts` validates bridge requests/results. `localKeyHierarchy.ts` resolves identity-bound encrypted key records, manages references, serializes state changes and exposes the app-facing key operations. Both import row contracts from `services/sync`.
- `src/services/sync/codec` defines envelope/header/manifest encoding. Its `rowHeader.ts` combines generic encoding with an app table allowlist. `rowTables.ts` separately defines the financial table union and app schema.
- `src/services/sync/shortKeys`, `rowSource.ts`, dictionaries and row validation describe the financial payload. `buildCommit.ts`, `backupFile.ts` and `restoreBackup.ts` coordinate backup/sync preparation and recovery.
- `RowDictionaries.cpp` is already generated. Improve its contract and ownership rather than introducing a second dictionary pipeline.

## Target ownership

| Owner | Responsibilities | Must not depend on |
| --- | --- | --- |
| Generic protocol and crypto | Bounded identifiers/payloads, exact header/TLV/manifest encoding, authenticated context, key derivation, encryption, signatures, bounded compression/decompression | Financial schemas, short-key field maps, repositories, preferences, screens |
| Financial backup profile | Supported record types, schema support, short-key maps, canonical app-record serialization, immutable dictionary descriptors and type-to-dictionary bindings | Screens or native vault internals |
| App workflows and data preparation | Workplace-scoped capture, privacy sanitization, financial validation, archive assembly/parsing, recovery ordering, database publication and receipts | Raw private keys |

Keep Device → User → Workplace identity/key binding, recovery confirmation, app-lock enforcement and reference lifetime checks in the protected subsystem. These are security invariants. This work does not generalize the key hierarchy.

## Contracts and compatibility

1. Introduce generic record/header/envelope/manifest contracts under `src/services/crypto/protocol/`. Preserve the established request field names (`table`, `workplaceId`, `rowId`, `schemaVersion`, `dictId`, `plaintext`) and operation names. A record type is an opaque bounded string at this boundary; the app narrows it to its `RowTable` union.
2. Move generic codecs to that boundary, with compatibility re-exports while callers migrate. The crypto protocol may depend on security utilities/providers, but must not import `services/sync`, financial schema definitions, repositories or UI.
3. Keep the financial profile in `src/services/sync`, with one authoritative app record-type list. App codecs and validators consume it. Do not introduce a second competing schema registry.
4. Define trusted dictionary descriptors that associate an immutable dictionary ID with its record type and bytes. Generate native lookup/binding data from the existing checked-in assets and lock metadata. Generic crypto requests a validated dictionary for `(recordType, dictionaryId)` and treats names as opaque. The generated provider is wired in at build time; callers and archives cannot register or replace dictionaries.
5. Unsupported app record types are rejected by app-profile validation on export and restore, before records reach the database. The engine continues rejecting missing dictionaries, dictionary/type mismatches, malformed identifiers, oversized inputs and invalid cryptographic bindings. Removing a financial allowlist must not remove these checks.

Preserve all existing wire bytes and interpretations: format/version markers, field names, TLV tags/order, HKDF inputs/domain strings, AAD, salts, signatures, Merkle leaf ordering, schema versions, dictionary IDs/bytes and ZIP entries. Generic internal names must not alter serialized data. No format-version bump or database migration is expected. If byte compatibility cannot be preserved, stop this refactor and design that protocol change separately.

## Implementation sequence

### 1. Establish compatibility evidence before changing behavior

- Retain the current shared row/header/manifest vectors as fixed expectations; do not regenerate them merely to accommodate refactoring.
- Capture a synthetic encrypted archive and matching synthetic recovery credential using the pre-refactor engine as compatibility fixtures. Explicitly identify them as public test-only data; use no real financial data or credentials.
- Exercise restoration of that archive with the refactored app and decryption/verification of new output with the pre-refactor implementation. Compare deterministic encodings and signatures against fixed vectors; do not compare fresh randomized ciphertext for equality.
- Record current unknown-table, dictionary mismatch, integrity and size-limit behavior so validation can move deliberately without becoming weaker.

Completion: a fixed compatibility baseline independent of newly generated output.

### 2. Extract generic TypeScript protocol contracts/codecs

- Separate generic identifier/structure validation from the financial table allowlist in `codec/rowHeader.ts` and related envelope/manifest codecs.
- Move generic row request/result types and limits out of the app sync module. Update `nativeKeyApi.ts` and `localKeyHierarchy.ts` to import from the new protocol boundary.
- Keep bridge result validation: returned scope, record identity, versions, error codes and payload bounds remain checked. Generic identifiers are not unchecked casts to app table types.
- Add explicit app-profile narrowing at app entry points: prepared export rows, parsed archive envelopes/manifests where applicable, and decoded restore records. Preserve full-state completeness, duplicate and membership checks.
- Migrate production imports, then remove transitional re-exports once no longer needed.

Completion: crypto contracts/codecs have no dependency on financial schema or `services/sync`; application code still rejects unsupported app records.

### 3. Separate native protocol validation from the app profile

- Replace the handwritten `TABLES`/`isTable` checks in `RowCodec.cpp` with generic identifier validation matching the existing wire constraints and bridge bounds.
- Apply that separation consistently to header encoding/decoding, row key-derivation input encoding, manifest/Merkle helpers and bridge parsing. Audit all table checks, not only the encrypt path.
- Keep domain separation, identity/key scope matching, duplicate-record checks, authenticated metadata and cryptographic failure handling unchanged.
- Add a test-only nonfinancial record type to show that generic protocol encoding does not require editing a financial table list.

Completion: handwritten crypto code treats record type names as opaque identifiers, and current vectors remain unchanged.

### 4. Make dictionary binding an explicit trusted provider

- Extend the existing dictionary embedding generator to emit immutable descriptors and record-type bindings, preserving existing dictionary bytes and identifiers.
- Replace the hardcoded dictionary naming-prefix policy in `RowCrypto.cpp` with provider lookup of the requested `(recordType, dictionaryId)` pair. Keep exact lookup and fail closed; no nearest-version or fallback selection.
- Supply the same generated provider to Android, iOS, host tests and WASM. Do not transfer dictionary bytes through every row request or add production runtime registration.
- Use a test-only provider/asset to round-trip a nonfinancial record through compression and encryption. Production must not include that fixture registration.
- Update generation checks and native/WASM build-input hashing so every provider source and input is covered. Retain all previously supported dictionary generations.

Completion: the application supplies profile assets; the core performs generic lookup, compression and encryption without a financial table list or naming policy.

### 5. Integrate, enforce and document

- Wire the financial profile into backup creation/restoration and incremental commit preparation. Keep existing key APIs and request/result shapes wherever possible.
- Preserve recovery checkpoint ordering, cancellation/lock behavior, atomic financial publication, manifest-hash receipts, post-publication key installation and balance rebuild warnings.
- Extend architecture checks to reject crypto imports of app sync/profile modules, repositories, financial models and UI. Include type-only imports. Add a check against reintroducing handwritten financial type lists in generic native codec/crypto files; generated profile assets are an explicit exception.
- Update the private backup documentation with the actual boundaries and data passed between them.

Completion: production callers use the intended boundary and automated checks prevent the dependency from returning.

## Validation and acceptance

- Fixed pre-refactor fixtures still restore; pre-refactor readers can verify/decrypt new output. Shared TS/C++/WASM vectors remain byte-identical.
- Nonfinancial record fixture works through the generic codec and crypto with its test-only trusted dictionary. The financial app rejects that record type before publication.
- Unknown dictionary, cross-record dictionary substitution, tampered header/manifest, wrong identity/Workplace, malformed identifier, batch/row limits and bounded decompression tests pass.
- Hierarchy/recovery, backup parser, row validation, restore retry/receipt and publication suites pass. No private-key bytes are exposed through new interfaces.
- Run `bun run typecheck`, `bun run typecheck:e2e:web`, `bun run check:architecture`, `bun run check:row-dictionaries`, the focused backup/sync tests and `bun run test:native-key-crypto` with HPKE-capable OpenSSL headers.
- Rebuild WASM after native changes, including the build-input lock, then run `FFB_REQUIRE_WASM_ARTIFACT=1 bun run test:wasm-key-crypto`. A stale or skipped artifact is not acceptance evidence.
- Build the web app and E2E export, then run all browser scenarios: fresh-context recovery, wrong credential, truncated/tampered archive, interrupted setup, repeated restore, collision rejection and independent Device proof.
- Compile the Android/iOS adapters against the changed core and run relevant platform checks before merge. Host/WASM results do not replace native vault/file-picker or physical-device release gates.

The current machine lacks the HPKE-capable OpenSSL development headers required by the native host suite. Resolve that prerequisite or use a suitably configured runner; report this gate as open until it actually passes.

## Scope boundaries

No screen redesign, extraction of `usePrivateBackup`, repository/file-adapter rewrite, database-at-rest encryption, online sync implementation, new key hierarchy, cipher change, streaming redesign or writer-lock optimization. Those can be planned independently. The existing uncommitted `web.output` fix is unrelated and must remain separate from this refactor's review.

Implement and verify the steps in order. Keep changes reviewable by phase; do not claim completion from file moves alone. The final result must demonstrate reduced dependency and unchanged cryptographic/financial behavior.

## Implementation evidence (2026-10-16)

The protocol now lives in `src/services/crypto/protocol/`; production callers use
that boundary directly and the old sync codec/row-crypto exports were removed.
Financial narrowing and singleton/full-state rules stay in the sync profile.
Native crypto validates bounded opaque types and uses generated exact dictionary
descriptors. The host-only test provider proves that a nonfinancial type with an
unrelated dictionary ID requires no production crypto edits or registration API.
The protected key hierarchy and restore publication sequence are unchanged.

Compatibility was established before core edits: all 58 original native tests
passed, then a public synthetic archive and matching recovery file were captured
with the original engine. Their fixed hashes and provenance are documented in
`modules/expo-key-crypto/tests/fixtures/README.md`. The refactored engine restores
that archive, and a separately saved original host decrypts refactored ciphertext
and reproduces its new manifest signature. Shared row/header/manifest vectors,
dictionary IDs/bytes, schema versions and ZIP entry names were not regenerated or
changed.

Final checks passed:

- `bun run typecheck` and `bun run typecheck:e2e:web`.
- `bun run check:architecture` (including the new import/native-profile guard).
- `bun run check:row-dictionaries`.
- Focused protocol, sync and backup suites: 103 tests.
- Publication, restore receipts/claims, backup hook and setup completion: 18 tests.
- `FFB_OPENSSL_PREFIX=/tmp/pr86-openssl bun run test:native-key-crypto`: 59 tests;
  the fixture-capture case is intentionally skipped in normal validation.
- Reverse decryption and manifest-signature parity with the saved original host.
- Lint on changed source files (the duplicate-import warning was corrected).

Platform gates remain open: Android adapter compilation was attempted but this
runner has no Java installation (`JAVA_HOME`/`java` missing), and it has no macOS
SDK/Xcode for iOS compilation. Host/WASM coverage cannot close those gates or the
physical-device vault/file-picker release gates. The unrelated pre-existing
`app.config.ts` web-output change remains separate from this implementation.

WASM was rebuilt with pinned Emscripten 3.1.74 and HPKE-capable OpenSSL 3.3.2,
including the checked-in loader, binary and refreshed build-input lock.
`FFB_REQUIRE_WASM_ARTIFACT=1 bun run test:wasm-key-crypto` passed: all 12 shared
codec vectors plus manifest/malformed-input parity, five worker runtime tests and
the real WASM worker/vault integration test. `bun run build:web` also passed.

`bun run e2e:build:web` passed. The full browser run passed all ten existing
scenarios: fresh-context financial recovery, wrong credential, truncated/tampered
archive retries, interrupted setup, repeated restore, collision rejection,
independent Device proof and setup smoke coverage. The new fixed-archive scenario
successfully restored; its initial name assertion incorrectly looked on the
dashboard. After changing that assertion to Settings, the targeted scenario passed
(1/1), including reload persistence and the restored synthetic Workplace name.
All eleven browser scenarios therefore have passing results against the rebuilt
WASM and E2E export.

### Review follow-up: record-type byte limit

Review of `08598dbb` found that RowCrypto retained a 64-byte record-type limit
while the protocol codecs allowed 128. Encryption preflight, envelope parsing,
decryption preflight and per-record error identity handling now use the native
codec's shared 128-byte identifier bound. TypeScript also names its existing
128-byte bound explicitly. This widens native acceptance without changing any
wire encoding, financial record type, dictionary asset or existing backup.

Boundary tests cover ASCII and multibyte types at 64/65 and 127/128 UTF-8 bytes,
reject 129-byte types, exercise header/info decoders independently, and round-trip
records through actual compression/encryption using the host-only dictionary
provider. Malformed envelopes retain valid long types in their error results.
Validation passed: 40 focused TypeScript protocol/backup tests, 60 native tests
(including fixed pre-refactor backup recovery), typecheck, changed-file lint,
the native crypto boundary guard, and required WASM parity/worker tests after
rebuilding the binary, loader and build-input lock. The unrelated `app.config.ts`
edit remains outside this follow-up.
