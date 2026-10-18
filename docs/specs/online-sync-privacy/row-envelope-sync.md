# Row-envelope sync: per-row encryption with short-key JSON + gzip

Status: local encrypted backup/recovery, native row crypto and web WASM support are implemented. Physical-device and end-to-end release gates remain open. Online sync transport and conflict review remain unfinished (see Rollout task list).

## Why

Each financial row is encrypted independently so upload, download, retry and
conflict resolution can happen per item while data stays encrypted end to end.

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

Plaintext headers carry what sync needs without decrypting (routing, conflict keys, tombstones) plus `table` and `updatedAt`. Amounts, notes, SMS metadata, audit `changes`, names and schema versions stay in ciphertext. Visible metadata — row counts, per-table churn, timing, deletes — is disclosed to users and may feed consented, aggregate analytics (see Header metadata and analytics); `rowId` values are random.

## Workplace metadata row

The 12 logical source tables are the 11 physical financial tables listed under Sync semantics plus `workplace`. Every complete state contains exactly one live `workplace` row, with `rowId` equal to `workplaceId`. Its plaintext contains exactly `name`, `icon`, `defaultCurrencyCode`, `safeToSpendDays` and `currencyPrecisions` (a currency-code to integer-precision map for every currency used by the book). The Workplace id comes from the authenticated header. This row is encrypted, short-key encoded and included in the Merkle root like other rows, with its own conflict group. It carries book settings, never Device settings. Restore and sync validation refuse currency precisions that differ from the locally supported precision; they never silently reinterpret stored amounts. Missing, duplicate or deleted Workplace metadata is invalid.

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

## Sync semantics

- **Every Device of the User may write.** Commits are serialised by the server, not by a writer role: the server accepts a manifest only if `prevHash` equals its current head hash and `seq` is head + 1 (compare-and-swap), so the chain stays linear and never forks. `authorUserId`/`authorDeviceId` record who committed; they grant nothing.
- **Scan cost.** If the full commit scan is too slow on device, pre-filter: hash only rows with `updated_at` after the last commit (every synced table has it except insert-only `audit_logs`, where new ids suffice) and find deletes by diffing id sets. Keep a periodic full scan as the correctness backstop, since raw SQL writes may skip `updated_at`.
- **Pull.** Fetch manifests after the last verified `seq`, check each signature and `prevHash` link, fetch envelopes with a newer `seq`, decrypt and validate, and recompute the root against the local index. Only when it equals the head's `root` is the change set applied, in one database batch, together with any conflicts it raises. Any mismatch leaves the Device on its last verified state with a recoverable integrity error.
- **Commit (pull, then push).** Pull first. Then, under the database writer lock, scan `accounts`, `journals`, `transactions`, `audit_logs`, `budgets`, `budget_scopes`, `account_metadata`, `planned_payments`, `journal_metadata`, `transaction_auto_post_rules` and `transaction_inbox_records`, plus the singleton `workplace` logical row, and compare each row's content hash with the local row index (see Local state). These are the 11 physical financial source tables plus one logical metadata table; the field definitions live in `rowTables.ts`. Changed rows are re-encrypted; index keys missing from the database become tombstones, which covers hard-deleted tables such as `budgets` and `budget_scopes`. Run journal-balance validation over the result, upload the changed envelopes in batches (staged under the pending manifest `id`, invisible until accepted), then the manifest. If the compare-and-swap fails because another Device committed first, pull again and retry; staged envelopes from the failed attempt are discarded by the server.
- **Conflict unit is the group, not the row.** A journal with its `transactions` legs and `journal_metadata`; an account with its `account_metadata`; a budget with its `budget_scopes`; every other row alone. A row whose group key changes belongs to both groups. A pulled change conflicts when the same group also has uncommitted local changes, including a remote tombstone against a local edit.
- **Conflicts never merge silently.** The remote group is applied, since other Devices may already have it, and the local version of the whole group is saved to a device-local conflict record. The user picks "keep mine", which re-applies the local group as a new local change committed next, or "keep theirs", which drops it. Groups apply whole, so journals stay balanced either way. Audit rows are insert-only with fresh ids and never conflict.
- **Server storage.** Latest envelope per `(table, rowId)`, tagged with the `seq` that wrote it, plus every manifest. No row history: conflict detection compares against the local index, so no common base is fetched. Tombstones are kept indefinitely (~350B each).
- **No sync-generated audit rows.** Offline restore uses `ImportRepository.batchInsertRowRestore`, which keeps the author's audit rows and fabricates none. Incremental sync apply remains to be implemented.
- **Derived data rebuilds locally.** `balance_snapshots`, running balances, rate caches and other data outside the 12 logical financial source tables never travel; readers rebuild them after applying.

## Local state

Device-local SQLite tables, never synced or exported:

- **Row index** `(table, rowId) → contentHash, leafHash, seq`, plus the last verified checkpoint `(seq, manifestHash)`. `contentHash` is SHA-256 of the canonical short-key JSON at the last sync; a row whose current hash differs has an uncommitted local change. ~19k rows ≈ 1.5 MiB. No encrypted row copies are kept; envelopes are regenerated from SQLite only for rows that changed.
- **Conflict records**: the local version of each conflicting group, kept until the user resolves it.

Losing the row index is safe but not free. Online, the Device downloads and verifies the head state and rebuilds the index from it; any group whose local rows differ from the head becomes a conflict for review, because without the index local edits and stale rows look the same. Offline backups always start a separate fresh genesis chain (see Local backup file).

## Short-key maps and compression

- Per-table short-key maps are checked in and versioned by schema version. Maps are additive-only: old assignments cannot move or be reused. Retained schema maps decode older payloads independently of the compression codec.
- The native engine writes a standard gzip member per live row. Compression requires no per-table assets or generation pipeline.
- The authenticated outer `compression` field selects the decoder. Future codecs require explicit reader support before enabling new writes; unknown selectors are rejected.

## Local backup file

The offline backup is a ZIP (fflate, already a dependency) containing the signed head manifest, the row envelopes as NDJSON, the Workplace DEK recovery envelope and the encrypted User-recovery package. The recovery credential stays a separate file.

Until a backend exists there is no compare-and-swap, no pull and no cross-Device sync: each backup file is a complete, self-verifying signed state of one Device's books, and restoring one replaces local books rather than merging. Chain continuity (`seq`, `prevHash`) and the rollback checkpoint belong to server sync. Every offline backup freshly encrypts the complete current state into an independent genesis manifest (`seq = 0`, zero `prevHash`); it must include every live row and the Workplace metadata row, even when no local rows changed. It never depends on unchanged ciphertext being retained in the sync index. Creating or saving a backup never advances the server-sync row index or checkpoint. Only server acceptance or a verified server pull advances those records. Last successful backup time is separate device-local status, recorded after the complete backup file is written. The first upload to a future backend starts the server chain.

Offline recovery: pick the backup file, then the User recovery credential (native pickers, existing order); verify the package identity pin and manifest signature before persisting a recovered User; validate the credential pins and recover the User; open a transient native Workplace reference from the backup’s validated member envelope (without persisting Workplace keys); stream batches through `decryptRows`, recomputing the root; validate with `validateImportedData`; and publish through `ImportRepository.batchInsertRowRestore`. The durable row-restore receipt is keyed by manifest hash; launch completion is handled by the setup flow. Restoring an offline genesis backup does not establish a server-sync checkpoint or mark its rows as accepted by a server; the initial sync must reconcile its independent local state. Persist Workplace keys only after validated database publication. Transient references are released on failure or cancellation. Before publication, an interrupted restore starts again from the file. Publication saves a device-local completion handoff atomically with the rows and receipt. After publication, launch finishes key installation, restored settings, required balances and session/launch setup from that handoff after unlock, without selecting the archive or recovery credential again. Required completion failures keep the Workplace gated and expose retry; exact receipt retries never overwrite financial rows.

## Export path: no change

Short-keys were measured at zero benefit inside the zipped plaintext export. That export retains ZIP + readable JSON for compatibility with existing readers. Its compression is separate from the encrypted-row codec.

## Rollout task list

Merge gate: complete every in-scope verification task below before release. Backend transport, enrollment and consent remain separate work. The key-management substrate owns enrollment, vault references, recovery credentials and ciphertext state; payload encryption and backup/restore build on those APIs.

- [x] Use platform/Emscripten zlib to gzip independent rows.
- [x] Native `encryptRows`/`decryptRows` (Android+iOS): gzip + inner TLV + HKDF + AES-GCM in one call; per-row results on decrypt, all-or-nothing on encrypt; 64 KiB and batch caps; bounded decompression.
- [x] `signRowManifest` native op (Android+iOS) with its own domain string + JS verification against the User public identity; shared cross-platform TLV/AAD/HKDF/inner-TLV/Merkle test vectors gating merge.
- [x] Short-key maps for the 12 logical financial source tables listed above, additive-only, all versions retained, unknown keys rejected.
- [x] `rowEnvelope.ts`: envelope + manifest validators, header-as-AAD binding.
- [x] Explicit compression selector independent of the payload encoding and schema, authenticated in header TLV tag 11; unknown codecs rejected.
- [x] Local row index table and commit scan under the writer lock, including tombstones for hard deletes.
- [ ] Complete sync chain/pull verification (signed manifest construction is implemented): `seq`, `prevHash`, `authorUserId`, `authorDeviceId`, full-state RFC 6962 root; pulls verify the chain and root before applying.
- [ ] Pull-then-push commit with compare-and-swap retry; staged envelopes invisible until their manifest is accepted.
- [ ] Group conflict detection, device-local conflict records and the "keep mine / keep theirs" review UI.
- [ ] Incremental sync apply and pending unreadable-commit handling. Offline restore publication and derived-data rebuild are implemented; pending-commit storage exists.
- [x] Local backup ZIP and offline recovery keyed by manifest hash.
- [ ] Deferred with the real backend: analytics consent, opt-out enforcement, aggregate-first queries and retention limits. No analytics collection ships in this implementation.
- [ ] Verification: full backup → wipe → restore round-trip with the current format, cross-device, two Devices editing the same journal concurrently, compare-and-swap retry, plus interruption/resume coverage.

## Decisions

### Crypto and keys

1. **How are independent row keys derived?** HKDF per-row subkeys with a native 16B salt (see Security invariants). No counter and no per-row state writes.
2. **Which header fields are authenticated, and how?** Every plaintext header field, TLV binary encoding, with shared cross-platform test vectors.
3. **What does `keyId` select?** The Workplace DEK fingerprint; one generation per Workplace. Rotation follows `key-management.md` §10 later; `keyId` in the AAD and the manifest means the format needs no change when it does.
4. **Who may write?** Every Device of the User may write; the server's compare-and-swap on the head serialises commits (see Sync semantics). Sharing a Workplace with other Users is outside the current scope. The row format already supports it (any member's Devices decrypt via their own DEK envelope; the manifest names `authorUserId`). What sharing adds lives in `key-management.md` §§7 and 10: an owner-signed member list that decides whose manifest signatures verify, invitations that verify the invitee's public key out of band, DEK rotation on removal, and server-enforced roles if read-only members exist. A compromised Device holding the User key can commit anything; stopping it requires User-key and DEK rotation, which is deferred.

### Integrity, replay and the manifest

5. **Is the manifest signed, and by which key?** Ed25519 by the User key via `signRowManifest`, over TLV-encoded manifest fields including `seq`, `authorUserId` and `authorDeviceId`.
6. **What does a manifest cover, and how are rollback and deletes protected?** Each commit is one manifest whose root covers the full live state, tombstones included. A server therefore cannot serve an old row version, drop a tombstone or invent one without the root failing. Readers keep the last verified `(seq, manifestHash)` and reject any head with a lower `seq` or a different hash at the same `seq`. Incremental sync verifies the chain plus the head root via the local index; no full download. After total Device loss, a fresh Device cannot prove it sees the latest head; restore shows the manifest's `createdAt` honestly.

### Sync semantics

7. **Whose clock orders changes, and is history kept?** No device clock orders anything: the server-serialised manifest `seq` does, and `updatedAt` is informational. Conflicts are detected against the local row index, so the server keeps only the latest envelope per row and no history.
8. **How is cross-row integrity kept, and how are conflicts resolved?** A commit is atomic: the author scans under the database writer lock and validates journal balance, so a journal and its legs land in the same commit, and a pull applies a verified commit in one database batch or not at all. Conflicts are per group (journal + legs + metadata, account + metadata, budget + scopes); the remote group wins on apply and the local group waits in a conflict record for the user to keep or drop. Nothing merges field by field.
9. **How are audit logs and derived data handled?** Audit rows are insert-only rows like any other and travel as written; applying a commit creates no new audit rows. Derived data never travels and is rebuilt locally.

### Compression and the codec

10. **Where does gzip run?** In shared C++ `RowCompression.cpp`, called by `encryptRows`/`decryptRows`. Android/iOS link platform zlib; WASM uses the Emscripten zlib port. Compression and encryption stay in the same native call.
11. **How are new codecs introduced?** Add an explicit supported compression identifier and native implementation; ship reader support before enabling writes. Keep encoding/schema evolution separate. Compression support is independent of the financial schema.
12. **Is the compression length leak acceptable?** The existing unpadded row-length policy remains. Each row compresses independently, without a shared mutable history across rows.

### Schema and migrations

13. **What happens when the schema version changes?** Rows decode through their own retained short-key map; missing keys take column defaults. A non-additive change registers a per-version row upgrade function. Rows are re-encrypted only when their content changes. The exact-version check becomes "row `schemaVersion` ≤ app schema version".
14. **What does an older app do with newer rows?** A commit containing any row with an unknown `schemaVersion`, compression codec or short key stays pending, unapplied, with an "Update the app to see recent changes" notice. Partial application could break journal balance, so the whole commit waits. Such a Device cannot commit until updated, because its next commit would have to build on that head.

### Limits and performance

15. **What are the batch and per-row limits?** 500 rows or 4 MiB per batch, through `encryptRows`/`decryptRows`. Uploads checkpoint per batch and the manifest goes last. A row over 64 KiB fails the commit with `FFB_ROW_TOO_LARGE` naming the table; rows are never split, and input caps on notes and similar fields should keep this unreachable.

### Header metadata and analytics

16. **What may a future server see and use?** `workplaceId`, `table`, `rowId`, `updatedAt`, `deleted`, `keyId`, `salt` and manifest fields are readable routing metadata. This implementation collects no analytics and has no analytics consent flow. A future backend must design consent and honor opt-outs server-side before collecting this metadata.

### Rollout and scope

17. **How does the release gate apply?** Complete the in-scope backup/recovery verification gates before release. Online sync, conflict review, analytics consent/collection, sharing and key rotation remain deferred until their backend and authorization boundaries are implemented.
18. **Which spec is authoritative?** This document defines payload format, limits, writer model and sync. `key-management.md` defines key hierarchy, recovery and online authority.

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
