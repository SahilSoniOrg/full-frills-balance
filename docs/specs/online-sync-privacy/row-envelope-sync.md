# V2 row-envelope sync: per-row encryption with short-key JSON + dictionary compression

Status: local V2 encrypted backup/recovery, native row crypto and web WASM support are implemented. Physical-device and end-to-end release gates remain open. Online sync transport and conflict review remain unfinished (see Rollout task list). V1 whole-snapshot backup never shipped and was removed.

## Why

The removed V1 implementation encrypted the entire serialized workplace as one blob. That forced all-or-nothing behavior, with `FFB_KEY_SNAPSHOT_LIMIT` capping snapshots at 100,000 records / 32 MiB (`workplaceSnapshot.ts` is in git history). V1 could not stream, resume, retry partially, or resolve conflicts per item: every edit re-encrypted and re-uploaded everything.

V2 encrypts each row independently so upload, download, retry, and conflict resolution happen per item while data stays encrypted end to end.

## Measurements (real user backup, 2026-10-05, 19,422 rows, 9.09 MiB plaintext)

| Strategy (wire = compress → AES-256-GCM → base64) | MiB |
|---|---:|
| Plain payload | 9.09 |
| V1 whole-blob encrypted, no compression | 12.13 |
| Per-row encrypted, no compression (~250B header/row) | 17.47 |
| Encrypt-then-gzip row envelopes | 9.82 (compression fails on ciphertext) |
| Per-row gzip-then-encrypt | 9.64 (rows too small, no cross-row dictionary) |
| Per-row zstd-dict-then-encrypt | 10.17 |
| Whole gzip-then-encrypt | 1.56 |
| Whole zstd-12-then-encrypt | 1.23 |
| 500-row chunks zstd-12-then-encrypt | 1.47 |

Per-table wire (bytes): transactions 8,604,636 → 5,321,188 with dict; journals 4,434,608 → 2,016,360; inbox 2,458,238 → 1,441,770; audit 1,903,930 → 1,248,478.

Compression-algorithm ranking holds after encryption (base64 adds a flat ~33% on compressed bytes). zstd-12 is the balanced pick; zstd-19/lzma save ~0.2–0.4 MiB at ~2s encode cost — rejected for the mobile backup path.

Key structural findings:

- JSON key/punctuation overhead is 19–48% per table (transactions 36%, journals 48%). Short-keys remove it pre-encryption.
- Hand-packed binary saves 67% plain on transactions but lands within ~5% of short-key JSON + zstd-dict on the wire — rejected in favor of staying in JSON (keeps `parseObject`/`assertAllowedKeys` validators, logging, debuggability; no hand-owned codec).
- Short-keys save 19% raw but 0% inside the gzipped plaintext export (gzip already deduplicates repeated keys). Short-keys apply to the encrypted row path only, not the export container.
- A dictionary trained on English-only rows still halves Hindi (Devanagari) rows via structure (234B → 118B); a mixed-script corpus matches English performance (→ 36B). Hinglish is unaffected (shared byte patterns).


Host prototype (2026-10-15, Apple Silicon, OpenSSL 3 + zstd, 19,422 synthetic rows shaped like the real tables, 3.52 MiB plaintext; throwaway, not in the repo):

- Per-row zstd-12 with per-table 16 KB dictionaries + HKDF + AES-GCM: encrypt ~100 ms total (zstd 64, HKDF 30, GCM 5), decrypt ~33 ms; all rows round-trip. Phones are expected to be a few times slower — still well under a second.
- The JSON envelope header is ~341B per row against ~120B of ciphertext: 8.60 MiB raw on the wire. Compressing each 500-row page as a whole (gzip or zstd) brings it to 2.28 MiB, because repeated header fields and base64 compress well. Hence the transport rule under Limits; no format change needed.
- Commit scan (canonical JSON + SHA-256 per row): ~37 ms in V8. Hermes is likely several times slower; measure on device (see Sync semantics).

## V2 row envelope

```ts
RowEnvelope {
  format: 'full-frills-encrypted-row',
  formatVersion: 1,
  enc: 'shortkey1+zstd',   // codec selector
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

Row pipeline: `DB row → short-key map → canonical JSON (sorted keys) → zstd(dict) → inner TLV {schemaVersion, dictId, body} → HKDF-SHA256(DEK, salt, info) → AES-GCM(key=rowKey, nonce=12 zero bytes, aad=TLV header) → envelope`.

`schemaVersion` and `dictId` travel inside the ciphertext, not in the header: they are needed only after decryption, and `dictId` (`'transactions/v3'`) would otherwise reveal the table. The decrypted plaintext is TLV with version byte `0x04`: `0x01 schemaVersion` uvarint · `0x02 dictId` utf8 · `0x03 body` zstd frame. A tombstone encrypts an empty body, so every leaf has the same shape.

Manifest: an Ed25519 signature by the User key via a new purpose-specific native op `signRowManifest` with its own domain string. The removed V1 `Engine::sign` used the `full-frills-local-recovery` v1 domain (`KeyEngine.cpp` is in git history) and must not be resurrected — signing a row manifest with it would mint a "local-recovery" message. The signed bytes are TLV from the same writer (version byte `0x03`), never JSON: `0x01 domain` utf8 `"FFB-MANIFEST/1"` · `0x02 formatVersion` uvarint · `0x03 workplaceId` utf8 · `0x04 keyId` utf8 · `0x05 id` utf8 · `0x06 seq` uvarint · `0x07 prevHash` raw 32 bytes · `0x08 authorUserId` utf8 · `0x09 authorDeviceId` utf8 · `0x0A rowCount` uvarint · `0x0B root` raw 32 bytes · `0x0C createdAt` 8-byte big-endian int64 ms. `authorUserId` names whose key signed, so sharing a Workplace later adds verifiers, not a format break. `workplaceId` and `keyId` are bound explicitly so an empty manifest (no leaves to carry them) is still Workplace-scoped. The manifest hash is `sha256` of these signed bytes; `prevHash` is the previous manifest's hash (genesis: `seq` 0, `prevHash` all zeros). `seq` increases by exactly one per commit and is the only ordering; `createdAt` is a device clock, display only.

`root` is a Merkle tree hash (RFC 6962 §2.1) over the **full live state** — every current row and tombstone of the Workplace, not just the change set — with leaves `TLV-header-bytes ‖ ciphertext-bytes`. These are the exact AAD bytes, not the JSON envelope, so server re-serialization cannot break verification. Leaves sort by `(table, rowId)` (`rowId` is unique per table only); leaf hash `sha256(0x00 ‖ leaf)`, node hash `sha256(0x01 ‖ left ‖ right)`; an odd count splits at the largest power of two below n, so no node is ever duplicated (Bitcoin-style duplication is rejected: `[a,b,c]` and `[a,b,c,c]` share a root, CVE-2012-2459). The empty tree's root is `sha256("")`. Verifiers reject duplicate `(table, rowId)` keys and a leaf count ≠ `rowCount`. Unchanged rows keep their existing envelope, so their leaves do not change between commits. Verification needs only the User public identity — no decryption.

Plaintext headers carry what sync needs without decrypting (routing, conflict keys, tombstones) plus `table` and `updatedAt`. Amounts, notes, SMS metadata, audit `changes`, names, schema versions and dictionaries stay in ciphertext. Visible metadata — row counts, per-table churn, timing, deletes — is disclosed to users and may feed consented, aggregate analytics (see Header metadata and analytics); `rowId` values are random.

## Workplace metadata row

The 12 logical source tables are the 11 physical financial tables listed under Sync semantics plus `workplace`. Every complete state contains exactly one live `workplace` row, with `rowId` equal to `workplaceId`. Its plaintext contains exactly `name`, `icon`, `defaultCurrencyCode`, `safeToSpendDays` and `currencyPrecisions` (a currency-code to integer-precision map for every currency used by the book). The Workplace id comes from the authenticated header. This row is encrypted, short-key encoded and included in the Merkle root like other rows, with its own conflict group. It carries book settings, never Device settings. Restore and sync validation refuse currency precisions that differ from the locally supported precision; they never silently reinterpret stored amounts. Missing, duplicate or deleted Workplace metadata is invalid.

JS and C++ are the only byte-level encoders. Shared vectors live in `modules/expo-key-crypto/tests/fixtures/row-vectors.json`, generated deliberately by `scripts/sync/generate-row-vectors.mjs`. Dictionary files live in `src/services/sync/dictionaries/<table>.v<n>.bin`; `scripts/sync/embed-dictionaries.mjs` generates the checked-in native `cpp/RowDictionaries.cpp`. Both languages read the same checked-in vectors; native compression dictionaries come only from the compiled lookup.

## Security invariants

- Per-row key, not per-row nonce: `rowKey = HKDF-SHA256(DEK, salt, info)` (see TLV and `info` below), then AES-GCM with a fixed 12-zero-byte nonce. With overwhelming probability each (key, nonce) pair is used once (see the next point), so no nonce state exists to misuse and any number of writer Devices needs zero cryptographic coordination. Cost: 16B salt per row (~22 base64 chars), one HKDF per row in native code (~µs; ~19k rows ≈ tens of ms). This is a payload-key construction; it does not reintroduce HKDF into the key hierarchy that `key-management.md` §9 removed.
- Safety rests on salt uniqueness, not on reuse being harmless: a repeated salt within the same table reproduces the same key with the same zero nonce — textbook AES-GCM nonce reuse (plaintext-XOR leak plus GHASH-key recovery enabling forgeries). With a 16B CSPRNG salt from native code the collision probability is ≈ n²/2¹²⁹ (≈ 2⁻⁶⁵ even at four billion rows), which is the entire safety margin. Deliberately no extra 12B random nonce on top: it would cost ~12B/row for no practical gain given the salt comes from the same native CSPRNG a nonce would.
- The salt is generated inside native `encryptRows`, never picked by JS callers. There is no random nonce at all.
- The 2^20 invocation counter does not apply to V2 rows: the DEK never directly encrypts, so the cap's safety intent (bound on GCM usage per key, `key-management.md` §9) holds by construction, with no per-row state writes. Any abuse-accounting counter is a separate decision. (For scale: per-row counting under the old cap would exhaust it after ~54 full backups of 19,422 rows.)
- AAD binds every plaintext header field as GCM associated data in TLV binary encoding — one leading version byte `0x01`, then fields in fixed tag order, each `tag(1B) ‖ uvarint-len ‖ value`. Field byte forms:
  `0x01 format` utf8 `"full-frills-encrypted-row"` · `0x02 formatVersion` uvarint · `0x03 enc` utf8 · `0x04 workplaceId` utf8 · `0x05 table` utf8 · `0x06 rowId` utf8 · `0x07 updatedAt` 8-byte big-endian int64 ms · `0x08 deleted` one byte `0x00`/`0x01` · `0x09 keyId` utf8 · `0x0A salt` raw 16 bytes.
  (`format` is included so the AAD is self-describing; the HKDF `info` gives the separate KDF domain.) Byte-identical across JS and C++ by construction; Swift and Kotlin only pass native operation names and JSON requests through, with shared cross-platform test vectors gating merge. Deliberately not canonical JSON: key-sorting and number-formatting parity across the two encoders is an avoidable risk.
- HKDF `info` is TLV-encoded with the same writer (version byte `0x02`): `0x01 domain` utf8 `"FFB-ROW/1"` · `0x02 table` utf8. Plain concatenation would let the parts blur together.
- Same workplace DEK as V1; `keyId` is its existing SHA-256 fingerprint. New native `encryptRows`/`decryptRows` and `signRowManifest`; no whole-snapshot or single-row methods.
- Compression and encryption run in the same native call; the short-key JSON is built in JS, where the books are already readable. Dictionaries are compiled into the native binary, so JS cannot substitute one.
- Dictionary is public (ships in the app binary, contains training substrings). Train on synthetic multilingual corpora only — never on real user PII.
- Compression-before-encryption length leakage (CRIME-style) is accepted; see Decisions.

## Limits (replaces the removed `FFB_KEY_SNAPSHOT_LIMIT`)

- Per-row plaintext cap 64 KiB (observed max 2.1 KB). Decrypt rejects ciphertext over the cap before allocating, and decompression writes into a fixed 64 KiB buffer, so a hostile zstd frame cannot expand past it.
- Per-batch cap: 500 rows or 4 MiB of plaintext, whichever comes first. One batch is one native call and one upload page.
- No total-size cap — pagination makes it unnecessary.
- Every upload/download page is compressed as a whole in transport (HTTP `Content-Encoding` zstd or gzip), and the backup ZIP deflates its NDJSON. Uncompressed pages cost ~3.8× more on the wire.

## Sync semantics

- **Every Device of the User may write.** Commits are serialised by the server, not by a writer role: the server accepts a manifest only if `prevHash` equals its current head hash and `seq` is head + 1 (compare-and-swap), so the chain stays linear and never forks. `authorUserId`/`authorDeviceId` record who committed; they grant nothing.
- **Scan cost.** If the full commit scan is too slow on device, pre-filter: hash only rows with `updated_at` after the last commit (every synced table has it except insert-only `audit_logs`, where new ids suffice) and find deletes by diffing id sets. Keep a periodic full scan as the correctness backstop, since raw SQL writes may skip `updated_at`.
- **Pull.** Fetch manifests after the last verified `seq`, check each signature and `prevHash` link, fetch envelopes with a newer `seq`, decrypt and validate, and recompute the root against the local index. Only when it equals the head's `root` is the change set applied, in one database batch, together with any conflicts it raises. Any mismatch leaves the Device on its last verified state with a recoverable integrity error.
- **Commit (pull, then push).** Pull first. Then, under the database writer lock, scan `accounts`, `journals`, `transactions`, `audit_logs`, `budgets`, `budget_scopes`, `account_metadata`, `planned_payments`, `journal_metadata`, `transaction_auto_post_rules` and `transaction_inbox_records`, plus the singleton `workplace` logical row, and compare each row's content hash with the local row index (see Local state). These are the 11 physical V2 source tables plus one logical metadata table; the V1 field lists are in git history in `workplaceSnapshot.ts`. Changed rows are re-encrypted; index keys missing from the database become tombstones, which covers hard-deleted tables such as `budgets` and `budget_scopes`. Run journal-balance validation over the result, upload the changed envelopes in batches (staged under the pending manifest `id`, invisible until accepted), then the manifest. If the compare-and-swap fails because another Device committed first, pull again and retry; staged envelopes from the failed attempt are discarded by the server.
- **Conflict unit is the group, not the row.** A journal with its `transactions` legs and `journal_metadata`; an account with its `account_metadata`; a budget with its `budget_scopes`; every other row alone. A row whose group key changes belongs to both groups. A pulled change conflicts when the same group also has uncommitted local changes, including a remote tombstone against a local edit.
- **Conflicts never merge silently.** The remote group is applied, since other Devices may already have it, and the local version of the whole group is saved to a device-local conflict record. The user picks "keep mine", which re-applies the local group as a new local change committed next, or "keep theirs", which drops it. Groups apply whole, so journals stay balanced either way. Audit rows are insert-only with fresh ids and never conflict.
- **Server storage.** Latest envelope per `(table, rowId)`, tagged with the `seq` that wrote it, plus every manifest. No row history: conflict detection compares against the local index, so no common base is fetched. Tombstones are kept indefinitely (~350B each).
- **No sync-generated audit rows.** Offline restore uses `ImportRepository.batchInsertRowRestore`, which keeps the author's audit rows and fabricates none. Incremental sync apply remains to be implemented.
- **Derived data rebuilds locally.** `balance_snapshots`, running balances, rate caches and other data outside the 12 logical V2 source tables never travel; readers rebuild them after applying.
- Steady-state cost is per changed row (~195B compressed + ~350B envelope ≈ 550B). The ~10 MiB full cost hits only on first sync, which is paginated and resumable; add parallelism before considering bulk-chunk transfer.
- Chunked compress-then-encrypt (~1.5 MiB) is documented but rejected: it reintroduces the all-or-nothing unit V2 exists to escape.

## Local state

Device-local SQLite tables, never synced or exported:

- **Row index** `(table, rowId) → contentHash, leafHash, seq`, plus the last verified checkpoint `(seq, manifestHash)`. `contentHash` is SHA-256 of the canonical short-key JSON at the last sync; a row whose current hash differs has an uncommitted local change. ~19k rows ≈ 1.5 MiB. No encrypted row copies are kept; envelopes are regenerated from SQLite only for rows that changed.
- **Conflict records**: the local version of each conflicting group, kept until the user resolves it.

Losing the row index is safe but not free. Online, the Device downloads and verifies the head state and rebuilds the index from it; any group whose local rows differ from the head becomes a conflict for review, because without the index local edits and stale rows look the same. Offline backups always start a separate fresh genesis chain (see Local backup file).

## Short-key maps and dictionaries

- Per table, checked in, versioned by `schema.version`. Maps are additive-only: new columns get new keys, old keys are never reused. Every map version is retained, so any older row still decodes. Devices on different app versions may write concurrently; a newer Device's rows wait on older Devices per Decision 14.
- Dictionaries (up to 16KB/table; size follows the synthetic corpus) are trained at build time by a checked-in, seeded synthetic-corpus script and regenerated only when that table's columns change. `dictId` is `<table>/v<n>`, immutable once shipped and never removed from the binary.
- A new dictionary ships read-capable first and becomes the write default only in a later release, so Devices one release behind can still read new rows.
- Per-table dicts beat one global dict (tables share little structure).

## Local backup file

The offline backup is a ZIP (fflate, already a dependency) containing the signed head manifest, the row envelopes as NDJSON, the Workplace DEK recovery envelope and the encrypted User-recovery package. It replaces the removed V1 `LocalRecoveryPackage` and `workplaceDump.ts` shapes. The recovery credential stays a separate file, as in V1.

Until a backend exists there is no compare-and-swap, no pull and no cross-Device sync: each backup file is a complete, self-verifying signed state of one Device's books, and restoring one replaces local books rather than merging. Chain continuity (`seq`, `prevHash`) and the rollback checkpoint belong to server sync. Every offline backup freshly encrypts the complete current state into an independent genesis manifest (`seq = 0`, zero `prevHash`); it must include every live row and the Workplace metadata row, even when no local rows changed. It never depends on unchanged ciphertext being retained in the sync index. Creating or saving a backup never advances the server-sync row index or checkpoint. Only server acceptance or a verified server pull advances those records. Last successful backup time is separate device-local status, recorded after the complete backup file is written. The first upload to a future backend starts the server chain.

Offline recovery: pick the backup file, then the User recovery credential (native pickers, existing order); verify the package identity pin and manifest signature before persisting a recovered User; validate the credential pins and recover the User; open a transient native Workplace reference from the backup’s validated member envelope (without persisting Workplace keys); stream batches through `decryptRows`, recomputing the root; validate with `validateImportedData`; and publish through `ImportRepository.batchInsertRowRestore`. The durable row-restore receipt is keyed by manifest hash; launch completion is handled by the setup flow. Restoring an offline genesis backup does not establish a server-sync checkpoint or mark its rows as accepted by a server; the initial sync must reconcile its independent local state. Persist Workplace keys only after validated database publication. Transient references are released on failure or cancellation. An interrupted restore starts again from the file; the receipt makes a repeat harmless.

## Export path: no change

Short-keys were measured at zero benefit inside the zipped plaintext export. The export stays zip + readable JSON for compatibility with older app versions reading user-shared files. A future gzip→zstd swap inside the zip (1.17 → 0.92 MiB) goes behind an export `formatVersion` bump with dual-read, if wanted.

## Rollout task list

Merge gate: **the V1 whole-snapshot backup was removed from this branch**; its implementation identifiers (`encryptSnapshot`/`decryptSnapshot`, `EncryptedSnapshot`, `FFB_KEY_SNAPSHOT_LIMIT`) remain in git history. V2 lands only as row-level sync per this doc. Every in-scope task below must be complete before V2 merges; deferred backend/consent tasks are excluded; no V1 backup path remains.

Delivery: the foundation and V2 implementation stay on this branch for one PR to main after all in-scope gates pass. The key-management substrate remains independent of payload encryption: User/Workplace enrollment and confirmation, vault and key references, recovery credentials and ciphertext state stores. The unshipped V1 Settings encryption-setup UI was removed; V2 backup/restore UI and onboarding wiring are part of this rollout ([preparation](./preparation.md)). **Removed from this branch (V2 replaces them)**: the encrypt/decrypt snapshot methods, the `EncryptedSnapshot` envelope, `serialize`/`decodeWorkplaceSnapshot` with `MAX_SNAPSHOT_*` and `FFB_KEY_SNAPSHOT_LIMIT`, the `encryptionSetup` package save/verify steps, the `FFB_KEY_BACKUPS_REQUIRED` removal-device gate, `forgetDevice`, the `LocalRecoveryPackage` V1 shape, the `recover()` snapshot-decrypt-and-publish path, native `SnapshotCrypto.cpp` plus the `KeyEngine` encrypt/decrypt/`decryptDump` branches, the `workplaceDump.ts` V1 shape, and the V1 dump/proof harness. `describeSetup`'s `writerAllowed`/`budgetExhausted` fields were removed with the counter and single-writer rule.

- [x] Vendor zstd C sources (BSD) into the `ExpoKeyCrypto` C++ module, like `nlohmann/json`; compile per-table dictionaries into the binary.
- [x] Native `encryptRows`/`decryptRows` (Android+iOS): zstd + inner TLV + HKDF + AES-GCM in one call; per-row results on decrypt, all-or-nothing on encrypt; 64 KiB and batch caps; bounded decompression.
- [x] `signRowManifest` native op (Android+iOS) with its own domain string + JS verification against the User public identity; shared cross-platform TLV/AAD/HKDF/inner-TLV/Merkle test vectors gating merge.
- [x] Short-key maps for the 12 logical V2 source tables listed above, additive-only, all versions retained, unknown keys rejected.
- [x] `rowEnvelope.ts`: envelope + manifest validators, header-as-AAD binding. The V1 `FFB_KEY_SNAPSHOT_LIMIT` was removed.
- [x] Dictionary pipeline: seeded synthetic multilingual corpus script + checked-in per-table `dict.vN.bin`, read-before-write rollout.
- [x] Local row index table and commit scan under the writer lock, including tombstones for hard deletes.
- [ ] Complete sync chain/pull verification (signed manifest construction is implemented): `seq`, `prevHash`, `authorUserId`, `authorDeviceId`, full-state RFC 6962 root; pulls verify the chain and root before applying.
- [ ] Pull-then-push commit with compare-and-swap retry; staged envelopes invisible until their manifest is accepted.
- [ ] Group conflict detection, device-local conflict records and the "keep mine / keep theirs" review UI.
- [ ] Incremental sync apply and pending unreadable-commit handling. Offline restore publication and derived-data rebuild are implemented; pending-commit storage exists.
- [x] V2 local backup ZIP and offline recovery keyed by manifest hash.
- [ ] Deferred with the real backend: analytics consent, opt-out enforcement, aggregate-first queries and retention limits. No analytics collection ships in this implementation.
- [x] Align `spec.md`, `README.md`, `preparation.md` and `key-management.md` §11 with branch reality (V1 snapshot never shipped, V2 authoritative for payloads). V2 payload crypto is implemented; online flows remain gated separately.
- [ ] Verification: full backup → wipe → restore round-trip on V2 only, cross-device, two Devices editing the same journal concurrently, compare-and-swap retry, plus interruption/resume coverage.

## Decisions

All former open questions are settled below. Removed as no longer meaningful: "who generates the nonce" (there is no nonce), "is compression in the same native call" (merged into 10), "is there a batch native API" (merged into 15), and "how are deletes protected" (merged into 6).

### Crypto and keys

1. **How is the 2^20 encryption cap lifted?** HKDF per-row subkeys with a native 16B salt (see Security invariants). No counter and no per-row state writes.
2. **Which header fields are authenticated, and how?** Every plaintext header field, TLV binary encoding, with shared cross-platform test vectors.
3. **What does `keyId` select?** The existing V1 DEK fingerprint; one generation per Workplace. Rotation follows `key-management.md` §10 later; `keyId` in the AAD and the manifest means the format needs no change when it does.
4. **What replaces the single-writer rule?** Every Device of the User may write; the server's compare-and-swap on the head serialises commits (see Sync semantics). Sharing a Workplace with other Users is out of V2 scope. The row format already supports it (any member's Devices decrypt via their own DEK envelope; the manifest names `authorUserId`). What sharing adds lives in `key-management.md` §§7 and 10: an owner-signed member list that decides whose manifest signatures verify, invitations that verify the invitee's public key out of band, DEK rotation on removal, and server-enforced roles if read-only members exist. A compromised Device holding the User key can commit anything; stopping it requires User-key and DEK rotation, which is deferred.

### Integrity, replay and the manifest

5. **Is the manifest signed, and by which key?** Ed25519 by the User key via `signRowManifest`, over TLV-encoded manifest fields including `seq`, `authorUserId` and `authorDeviceId`.
6. **What does a manifest cover, and how are rollback and deletes protected?** Each commit is one manifest whose root covers the full live state, tombstones included. A server therefore cannot serve an old row version, drop a tombstone or invent one without the root failing. Readers keep the last verified `(seq, manifestHash)` and reject any head with a lower `seq` or a different hash at the same `seq`. Incremental sync verifies the chain plus the head root via the local index; no full download. After total Device loss, a fresh Device cannot prove it sees the latest head; restore shows the manifest's `createdAt` honestly.

### Sync semantics

7. **Whose clock orders changes, and is history kept?** No device clock orders anything: the server-serialised manifest `seq` does, and `updatedAt` is informational. Conflicts are detected against the local row index, so the server keeps only the latest envelope per row and no history.
8. **How is cross-row integrity kept, and how are conflicts resolved?** A commit is atomic: the author scans under the database writer lock and validates journal balance, so a journal and its legs land in the same commit, and a pull applies a verified commit in one database batch or not at all. Conflicts are per group (journal + legs + metadata, account + metadata, budget + scopes); the remote group wins on apply and the local group waits in a conflict record for the user to keep or drop. Nothing merges field by field.
9. **How are audit logs and derived data handled?** Audit rows are insert-only rows like any other and travel as written; applying a commit creates no new audit rows. Derived data never travels and is rebuilt locally.

### Compression and the codec

10. **Where does zstd come from, and where does it run?** Vendored zstd C sources in the existing C++ module, called from `encryptRows`/`decryptRows`, so compression and encryption share one native call. Native tests use the host-compiled C++ engine; web runs the same engine as WASM in a dedicated worker with its own encrypted IndexedDB Device vault.
11. **How are dictionaries managed?** Seeded synthetic corpus script, checked-in dictionary files, immutable `dictId`s kept forever, and read-capable one release before they become the write default.
12. **Is the compression length leak acceptable?** Yes, without padding. Each row compresses alone against a public dictionary, and an attacker-authored SMS row mostly contains the attacker's own text, so there is no secret to probe. Padding would cost ~300 KB per full sync for no practical gain.

### Schema and migrations

13. **What happens when the schema version changes?** Rows decode through their own retained short-key map; missing keys take column defaults. A non-additive change registers a per-version row upgrade function. Rows are re-encrypted only when their content changes. The exact-version check becomes "row `schemaVersion` ≤ app schema version".
14. **What does an older app do with newer rows?** A commit containing any row with an unknown `schemaVersion`, `dictId` or short key stays pending, unapplied, with an "Update the app to see recent changes" notice. Partial application could break journal balance, so the whole commit waits. Such a Device cannot commit until updated, because its next commit would have to build on that head.

### Limits and performance

15. **What are the batch and per-row limits?** 500 rows or 4 MiB per batch, through `encryptRows`/`decryptRows`. Uploads checkpoint per batch and the manifest goes last. A row over 64 KiB fails the commit with `FFB_ROW_TOO_LARGE` naming the table; rows are never split, and input caps on notes and similar fields should keep this unreachable.

### Header metadata and analytics

16. **What may a future server see and use?** `workplaceId`, `table`, `rowId`, `updatedAt`, `deleted`, `keyId`, `salt` and manifest fields are readable routing metadata. This implementation collects no analytics and has no analytics consent flow. A future backend must design consent and honor opt-outs server-side before collecting this metadata.

### Rollout and scope

17. **How does the merge gate apply?** Implement the foundation and V2 on this branch and open one PR to main after the V2 gates pass. Encrypted backup and offline restore ship in production. Sync status, the fake transport and conflict review are development-only until a real backend exists; analytics consent/collection, sharing and key rotation are deferred. The removed V1 snapshot implementation stays in git history.
18. **Which spec is authoritative?** This doc for payload format, limits, writer model and sync; `key-management.md` for the key hierarchy, recovery and online authority. `key-management.md` §§9 and 11 carry a pointer here now and get rewritten in the PR that lands `encryptRows`.
19. **What happens to existing V1 artifacts?** V1 never shipped, so V1 snapshot, package and dump formats are deleted with no reader. Test-generated V1 files become unreadable, which is acceptable.

## Implementation validation targets

The execution owner approved the iOS simulator and Android emulator for this implementation’s native build, zstd self-test and reinstall/restore gates. Record those targets honestly; simulator/emulator measurements do not count as physical mid-range phone performance evidence. Physical-device performance and native vault/file-picker validation remain separately recorded release checks.

Phase 1 validation (2026-10-15): vendored zstd 1.5.7 built for iOS and Android and passed a temporary native round-trip proof on iPhone 17 / iOS 26.4 simulator and API 36 arm64 Android emulator. Each run compressed the fixed 44-byte input to 53 bytes and decompressed it back byte-for-byte to 44 bytes. The temporary proof operation and screen were removed when row crypto was integrated. These are simulated-device results, not physical-phone measurements.
