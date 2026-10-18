# Row-envelope sync: per-row encryption with short-key JSON + gzip

Status: local encrypted backup/recovery, native row crypto and web WASM support are implemented. Physical-device and full cross-device release gates remain open. Online sync transport and conflict review are not implemented (see [implementation status](./preparation.md)).

## Why

Each financial row is encrypted independently. This creates a verifiable row
format for offline backups and supports future per-row transfer without exposing
financial contents.

## Payload encoding and compression

Each row is compressed independently with ordinary gzip before encryption. The
row envelope separates payload encoding (`enc: "shortkey1"`) from compression
(`compression: "gzip"`); both selectors are authenticated. Android/iOS use platform
zlib and WASM uses Emscripten's zlib port.

The initial row format is version 1. Manifest and key-envelope versions are
independent. Readers accept only the supported format, encoding and compression.

Future compression additions extend the explicit selector and native dispatch;
unknown values fail closed with `FFB_ROW_UNSUPPORTED_COMPRESSION`. Never infer a
codec from file extensions, database schema versions or trial decompression. New
writers require readers that support their selected codec. A gzip member's bytes
need not be identical across zlib versions; AAD and manifest bytes remain canonical.

## Row envelope

```ts
RowEnvelope {
  format: 'full-frills-encrypted-row',
  formatVersion: 1,
  enc: 'shortkey1',       // payload encoding
  compression: 'gzip',    // compression, authenticated independently
  workplaceId,             // plaintext, routing
  table,                   // plaintext, e.g. 'transactions'
  rowId,                   // plaintext, conflict key
  updatedAt,               // plaintext, informational (ordering comes from manifest seq)
  deleted,                 // plaintext tombstone flag
  keyId,                   // workplace DEK generation
  salt,                    // 16B random per row, base64; HKDF salt (see Security invariants)
  ciphertext,              // base64, includes the 16B GCM tag
}
+ Manifest { id, seq, prevHash, authorUserId, authorDeviceId, rowCount, root, createdAt, signature }
```

Row pipeline: `DB row → short-key map → canonical JSON (sorted keys) → gzip → inner TLV {schemaVersion, body} → HKDF-SHA256(DEK, salt, info) → AES-GCM(key=rowKey, nonce=12 zero bytes, aad=TLV header) → envelope`.

`schemaVersion` stays inside the ciphertext. The decrypted plaintext is TLV
version `0x04`: `0x01 schemaVersion` uvarint · `0x02 body` gzip member. A tombstone
has an empty body and is not compressed; an empty live row has a valid gzip member.
The outer `compression` selector is used only after AES-GCM authentication and
is included in Merkle leaves through the authenticated header.

Manifest: an Ed25519 signature by the User key through `signRowManifest`, using the dedicated domain `FFB-MANIFEST/1`. The signed bytes are TLV from the same writer (version byte `0x03`), never JSON: `0x01 domain` utf8 `"FFB-MANIFEST/1"` · `0x02 formatVersion` uvarint · `0x03 workplaceId` utf8 · `0x04 keyId` utf8 · `0x05 id` utf8 · `0x06 seq` uvarint · `0x07 prevHash` raw 32 bytes · `0x08 authorUserId` utf8 · `0x09 authorDeviceId` utf8 · `0x0A rowCount` uvarint · `0x0B root` raw 32 bytes · `0x0C createdAt` 8-byte big-endian int64 ms. `authorUserId` names whose key signed, so sharing a Workplace later adds verifiers, not a format break. `workplaceId` and `keyId` are bound explicitly so an empty manifest (no leaves to carry them) is still Workplace-scoped. The manifest hash is `sha256` of these signed bytes; `prevHash` is the previous manifest's hash (genesis: `seq` 0, `prevHash` all zeros). `seq` increases by exactly one per commit and is the only ordering; `createdAt` is a device clock, display only.

`root` is a Merkle tree hash (RFC 6962 §2.1) over the **full live state** — every current row and tombstone of the Workplace, not just the change set — with leaves `TLV-header-bytes ‖ ciphertext-bytes`. These are the exact AAD bytes, not the JSON envelope, so server re-serialization cannot break verification. Leaves sort by `(table, rowId)` (`rowId` is unique per table only); leaf hash `sha256(0x00 ‖ leaf)`, node hash `sha256(0x01 ‖ left ‖ right)`; an odd count splits at the largest power of two below n, so no node is ever duplicated (Bitcoin-style duplication is rejected: `[a,b,c]` and `[a,b,c,c]` share a root, CVE-2012-2459). The empty tree's root is `sha256("")`. Verifiers reject duplicate `(table, rowId)` keys and a leaf count ≠ `rowCount`. Unchanged rows keep their existing envelope, so their leaves do not change between commits. Verification needs only the User public identity — no decryption.

Plaintext headers carry routing fields, tombstones, `table` and `updatedAt`. Amounts, notes, SMS metadata, audit `changes`, names and schema versions stay in ciphertext. Row counts, per-table churn, timing and deletes remain visible metadata; `rowId` values are random. This implementation collects no analytics.

## Workplace metadata row

The 12 logical source tables are the 11 financial tables and `workplace`, as listed in `src/services/sync/rowTables.ts`. Every complete state contains exactly one live `workplace` row, with `rowId` equal to `workplaceId`. Its plaintext contains exactly `name`, `icon`, `defaultCurrencyCode`, `safeToSpendDays` and `currencyPrecisions` (a currency-code to integer-precision map for every currency used by the book). The Workplace id comes from the authenticated header. This row is encrypted, short-key encoded and included in the Merkle root like other rows. It carries book settings, never Device settings. Restore validation refuses currency precisions that differ from the locally supported precision; it never silently reinterprets stored amounts. Missing, duplicate or deleted Workplace metadata is invalid.

JS and C++ are the only byte-level encoders. Shared vectors live in `modules/expo-key-crypto/tests/fixtures/row-vectors.json`, generated deliberately by `scripts/sync/generate-row-vectors.mjs`. Both languages read the same checked-in vectors; their gzip members are generated by the independent Node stdlib oracle and decoded by the native engine.

## Security invariants

- Per-row key, not per-row nonce: `rowKey = HKDF-SHA256(DEK, salt, info)` (see TLV and `info` below), then AES-GCM with a fixed 12-zero-byte nonce. With overwhelming probability each (key, nonce) pair is used once (see the next point), so no nonce state exists to misuse and any number of writer Devices needs zero cryptographic coordination. Cost: 16B salt per row (~22 base64 chars), one HKDF per row in native code (~µs; ~19k rows ≈ tens of ms). This derives ephemeral row keys; Device and User key pairs remain independently generated.
- Safety rests on salt uniqueness, not on reuse being harmless: a repeated salt within the same table reproduces the same key with the same zero nonce — textbook AES-GCM nonce reuse (plaintext-XOR leak plus GHASH-key recovery enabling forgeries). With a 16B CSPRNG salt from native code the collision probability is ≈ n²/2¹²⁹ (≈ 2⁻⁶⁵ even at four billion rows), which is the entire safety margin. Deliberately no extra 12B random nonce on top: it would cost ~12B/row for no practical gain given the salt comes from the same native CSPRNG a nonce would.
- The salt is generated inside native `encryptRows`, never picked by JS callers. There is no random nonce at all.
- The Workplace DEK derives independent row keys; it does not directly encrypt rows. No per-row encryption counter or persistent nonce state is required.
- AAD binds every plaintext header field as GCM associated data in TLV binary encoding — one leading version byte `0x01`, then fields in fixed tag order, each `tag(1B) ‖ uvarint-len ‖ value`. Field byte forms:
  `0x01 format` utf8 `"full-frills-encrypted-row"` · `0x02 formatVersion` uvarint · `0x03 enc` utf8 · `0x04 workplaceId` utf8 · `0x05 table` utf8 · `0x06 rowId` utf8 · `0x07 updatedAt` 8-byte big-endian int64 ms · `0x08 deleted` one byte `0x00`/`0x01` · `0x09 keyId` utf8 · `0x0A salt` raw 16 bytes · `0x0B compression` utf8 `"gzip"`.
  (`format` is included so the AAD is self-describing; the HKDF `info` gives the separate KDF domain.) Byte-identical across JS and C++ by construction; Swift and Kotlin only pass native operation names and JSON requests through, with shared cross-platform test vectors gating merge. Deliberately not canonical JSON: key-sorting and number-formatting parity across the two encoders is an avoidable risk.
- HKDF `info` is TLV-encoded with the same writer (version byte `0x02`): `0x01 domain` utf8 `"FFB-ROW/1"` · `0x02 table` utf8. Plain concatenation would let the parts blur together.
- `keyId` is the Workplace DEK SHA-256 fingerprint. Native `encryptRows`/`decryptRows` process bounded row batches; `signRowManifest` authenticates the complete state.
- Compression and encryption run in the same native call; the short-key JSON is built in JS, where the books are already readable. The compression selector is explicit and authenticated; the current native implementation accepts only gzip.
- Compression-before-encryption length leakage (CRIME-style) is accepted; see Decisions.

## Limits

- Per-row plaintext cap 64 KiB (observed max 2.1 KB). Decrypt rejects ciphertext over the cap before allocating, and decompression writes into a fixed 64 KiB output cap with a one-byte overflow detector. Gzip trailers never control allocation. Invalid/truncated members, checksum failures, concatenated members and trailing bytes are rejected.
- Per-batch cap: 500 rows or 4 MiB of plaintext, whichever comes first. One batch is one native call and one upload page.
- No total-size cap — pagination makes it unnecessary.
- The backup ZIP deflates its NDJSON. A future backend may additionally use HTTP `Content-Encoding: gzip` for envelope batches; this is independent of the gzip member encrypted inside each row.

## Online synchronization is deferred

The manifest contains sequence, predecessor, author, and full-state root fields that can support a future server-backed chain. The branch does not implement server compare-and-swap, pull/apply, conflict review, or multi-device synchronization. Proposed alternatives and the reasons for deferring them are summarized in [considered approaches](./decisions.md); this document specifies the implemented row format and offline backup behavior.

## Local sync state

The database contains a local row index, checkpoint, pending-commit, and conflict tables. Commit construction and row-index updates exist, but online upload, pull, conflict review, and server checkpoint advancement do not. These records are local foundations, not evidence of a working sync client. Offline backups use a separate fresh genesis manifest (see Local backup file).

## Short-key maps and compression

- Per-table short-key maps are checked in and versioned by schema version. Maps are additive-only: old assignments cannot move or be reused. Retained schema maps decode older payloads independently of the compression codec.
- The native engine writes a standard gzip member per live row. Compression requires no per-table assets or generation pipeline.
- The authenticated outer `compression` field selects the decoder. Future codecs require explicit reader support before enabling new writes; unknown selectors are rejected.

## Local backup file

The offline backup is a ZIP (fflate, already a dependency) containing the signed head manifest, the row envelopes as NDJSON, the Workplace DEK recovery envelope and the encrypted User-recovery package. The recovery credential stays a separate file.

There is no compare-and-swap, pull, or cross-Device sync. Each backup file is a complete, self-verifying signed state of one Device's books; restoring it replaces local books rather than merging. Every offline backup freshly encrypts the complete current state into an independent genesis manifest (`seq = 0`, zero `prevHash`) and includes every live row and the Workplace metadata row, even when no local rows changed. Backup creation does not depend on retained sync ciphertext and does not advance the local server-sync row index or checkpoint. Last successful backup time is device-local status recorded after the full ZIP is written. A future server chain would need to establish its own accepted head.

Offline recovery: pick the backup file, then the User recovery credential (native pickers, existing order); verify the package identity pin and manifest signature before persisting a recovered User; validate the credential pins and recover the User; open a transient native Workplace reference from the backup’s validated member envelope (without persisting Workplace keys); stream batches through `decryptRows`, recomputing the root; validate with `validateImportedData`; and publish through `ImportRepository.batchInsertRowRestore`. The durable row-restore receipt is keyed by manifest hash; launch completion is handled by the setup flow. Restoring an offline genesis backup does not establish a server-sync checkpoint or mark its rows as accepted by a server; the initial sync must reconcile its independent local state. Persist Workplace keys only after validated database publication. Transient references are released on failure or cancellation. Before publication, an interrupted restore starts again from the file. Publication saves a device-local completion handoff atomically with the rows and receipt. After publication, launch finishes key installation, restored settings, required balances and session/launch setup from that handoff after unlock, without selecting the archive or recovery credential again. Required completion failures keep the Workplace gated and expose retry; exact receipt retries never overwrite financial rows.

## Export path: no change

Short-keys were measured at zero benefit inside the zipped plaintext export. That export retains ZIP + readable JSON for compatibility with existing readers. Its compression is separate from the encrypted-row codec.

## Implementation and release status

Implemented: row encoding, native/web crypto, signed offline manifests, complete ZIP export, and offline recovery. Physical-device recovery and full cross-device backup → wipe → restore remain release gates; see [implementation status](./preparation.md).

The local row index, checkpoint/pending-commit/conflict tables, and signed commit construction are foundations only. Server chain verification, pull/apply, compare-and-swap retries, conflict review, and analytics consent are deferred. No analytics are collected.

## Implementation validation targets

The execution owner approved the iOS simulator and Android emulator for native build and reinstall/restore gates. Record those targets honestly; simulator/emulator measurements do not count as physical mid-range phone performance evidence. Physical-device performance and native vault/file-picker validation remain separately recorded release checks.


## Implemented crypto/profile boundary

`src/services/crypto/protocol/` owns bounded opaque record identifiers, row request
and result contracts, exact TLV/header/HKDF-info encoding, envelope/manifest shape
and scope checks, and Merkle ordering. The existing wire field remains `table`;
the protocol does not interpret its name or import the financial profile. Record
types allow 1–128 UTF-8 bytes, consistently in TypeScript, native row preflight,
header/key-info codecs and WASM. The bound measures bytes, not UTF-16 code units
or Unicode characters.
`nativeKeyApi.ts` validates bridge scope, identity, error codes and payload bounds;
`localKeyHierarchy.ts` continues to protect Device → User → Workplace binding,
reference lifetimes, recovery confirmation, app lock and serialized key-state
changes. Neither imports `services/sync`.

The financial profile stays in `services/sync`: `rowTables.ts` supplies app table
narrowing and schemas; short-key maps and row upgrades select supported app
versions; `rowSource.ts` captures and sanitizes financial records. The app
`rowEnvelope.ts` wrapper rejects unsupported record types and enforces the live
singleton Workplace rule and complete-state membership before restore publication.
Restore also checks the returned decrypted type, schema and supported compression
before decoding short keys. Export and incremental preparation validate app types
before encryption. Archive assembly/parsing, financial validation, recovery
ordering, cancellation, atomic publication, receipts and post-publication key
installation remain in app workflows.

`RowCompression.cpp` dispatches using the authenticated compression selector and
owns bounded gzip encode/decode. It has no financial schema dependency.
WASM input hashing covers the shared core, JSON dependency and zlib build setting.

The architecture guard checks type-only imports as well as runtime dependencies,
and rejects financial type lists in handwritten native codec/crypto files.
Synthetic protocol fixtures live in
`modules/expo-key-crypto/tests/fixtures/README.md`. Generic nonfinancial-record checks require no special provider.

## Application workflow ownership

- `rowSource.ts` captures paginated repository data under the caller's consistency boundary. `rowPreparation.ts` owns pure projection, normalization, inclusion rules and privacy sanitization. `workplaceRowValidation.ts` validates complete financial state and maps decoded rows to import data.
- Preparation and validation consume explicit data and immutable profile definitions. They do not initialize repositories, preferences, UI, native bridges or key-hierarchy state.
- `encryptedRestoreWorkflow.ts` owns the recovery-attempt identity and archive publication. `encryptedRestoreCompletion.ts` owns post-publication keys, settings, balances and session checkpoints from the durable handoff; launch supplies the replayable setup-completion callback. The settings hook owns screen inputs, foreground state and user confirmation. Publication and its receipt remain atomic; key/session/launch checkpoints finish afterward.
- `nativeKeyApi.ts` checks bridge scope, supported compression, response shape and payload bounds. `localKeyHierarchy.ts` owns Device → User → Workplace key binding and recovery. Both depend on generic protocol contracts and stay independent of financial schemas.
