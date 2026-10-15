# V2 row-envelope sync: per-row encryption with short-key JSON + dictionary compression

Status: design agreed; not implemented. The V1 whole-snapshot backup on this branch is frozen — no V1 backup path merges (see Rollout task list). V2 is the only backup design going forward.

## Why

V1 encrypts the entire serialized workplace as one blob. That forces all-or-nothing behavior, which is why `FFB_KEY_SNAPSHOT_LIMIT` exists (100,000 records / 32 MiB in `src/services/backup/workplaceSnapshot.ts`). V1 cannot stream, resume, retry partially, or resolve conflicts per item: every edit re-encrypts and re-uploads everything.

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

Manifest: an Ed25519 signature by the User key via a new purpose-specific native op `signRowManifest` with its own domain string. The existing native `Engine::sign` hardcodes the `full-frills-local-recovery` v1 domain (`KeyEngine.cpp`) and must not be reused — signing a row manifest with it would mint a "local-recovery" message. The signed bytes are TLV from the same writer (version byte `0x03`), never JSON: `0x01 domain` utf8 `"FFB-MANIFEST/1"` · `0x02 formatVersion` uvarint · `0x03 workplaceId` utf8 · `0x04 keyId` utf8 · `0x05 id` utf8 · `0x06 seq` uvarint · `0x07 prevHash` raw 32 bytes · `0x08 authorUserId` utf8 · `0x09 authorDeviceId` utf8 · `0x0A rowCount` uvarint · `0x0B root` raw 32 bytes · `0x0C createdAt` 8-byte big-endian int64 ms. `authorUserId` names whose key signed, so sharing a Workplace later adds verifiers, not a format break. `workplaceId` and `keyId` are bound explicitly so an empty manifest (no leaves to carry them) is still Workplace-scoped. The manifest hash is `sha256` of these signed bytes; `prevHash` is the previous manifest's hash (genesis: `seq` 0, `prevHash` all zeros). `seq` increases by exactly one per commit and is the only ordering; `createdAt` is a device clock, display only.

`root` is a Merkle tree hash (RFC 6962 §2.1) over the **full live state** — every current row and tombstone of the Workplace, not just the change set — with leaves `TLV-header-bytes ‖ ciphertext-bytes`. These are the exact AAD bytes, not the JSON envelope, so server re-serialization cannot break verification. Leaves sort by `(table, rowId)` (`rowId` is unique per table only); leaf hash `sha256(0x00 ‖ leaf)`, node hash `sha256(0x01 ‖ left ‖ right)`; an odd count splits at the largest power of two below n, so no node is ever duplicated (Bitcoin-style duplication is rejected: `[a,b,c]` and `[a,b,c,c]` share a root, CVE-2012-2459). The empty tree's root is `sha256("")`. Verifiers reject duplicate `(table, rowId)` keys and a leaf count ≠ `rowCount`. Unchanged rows keep their existing envelope, so their leaves do not change between commits. Verification needs only the User public identity — no decryption.

Plaintext headers carry what sync needs without decrypting (routing, conflict keys, tombstones) plus `table` and `updatedAt`. Amounts, notes, SMS metadata, audit `changes`, names, schema versions and dictionaries stay in ciphertext. Visible metadata — row counts, per-table churn, timing, deletes — is disclosed to users and may feed consented, aggregate analytics (see Header metadata and analytics); `rowId` values are random.

## Security invariants

- Per-row key, not per-row nonce: `rowKey = HKDF-SHA256(DEK, salt, info)` (see TLV and `info` below), then AES-GCM with a fixed 12-zero-byte nonce. With overwhelming probability each (key, nonce) pair is used once (see the next point), so no nonce state exists to misuse and any number of writer Devices needs zero cryptographic coordination. Cost: 16B salt per row (~22 base64 chars), one HKDF per row in native code (~µs; ~19k rows ≈ tens of ms). This is a payload-key construction; it does not reintroduce HKDF into the key hierarchy that `key-management.md` §9 removed.
- Safety rests on salt uniqueness, not on reuse being harmless: a repeated salt within the same table reproduces the same key with the same zero nonce — textbook AES-GCM nonce reuse (plaintext-XOR leak plus GHASH-key recovery enabling forgeries). With a 16B CSPRNG salt from native code the collision probability is ≈ n²/2¹²⁹ (≈ 2⁻⁶⁵ even at four billion rows), which is the entire safety margin. Deliberately no extra 12B random nonce on top: it would cost ~12B/row for no practical gain given the salt comes from the same native CSPRNG a nonce would.
- The salt is generated inside native `encryptRows`, never picked by JS callers. There is no random nonce at all.
- The 2^20 invocation counter does not apply to V2 rows: the DEK never directly encrypts, so the cap's safety intent (bound on GCM usage per key, `key-management.md` §9) holds by construction, with no per-row state writes. Any abuse-accounting counter is a separate decision. (For scale: per-row counting under the old cap would exhaust it after ~54 full backups of 19,422 rows.)
- AAD binds every plaintext header field as GCM associated data in TLV binary encoding — one leading version byte `0x01`, then fields in fixed tag order, each `tag(1B) ‖ uvarint-len ‖ value`. Field byte forms:
  `0x01 format` utf8 `"full-frills-encrypted-row"` · `0x02 formatVersion` uvarint · `0x03 enc` utf8 · `0x04 workplaceId` utf8 · `0x05 table` utf8 · `0x06 rowId` utf8 · `0x07 updatedAt` 8-byte big-endian int64 ms · `0x08 deleted` one byte `0x00`/`0x01` · `0x09 keyId` utf8 · `0x0A salt` raw 16 bytes.
  (`format` is included so the AAD is self-describing; the HKDF `info` gives the separate KDF domain.) Byte-identical across JS/C++/Swift/Kotlin by construction, with shared cross-platform test vectors gating merge. Deliberately not canonical JSON: key-sorting and number-formatting parity across four runtimes is an avoidable risk.
- HKDF `info` is TLV-encoded with the same writer (version byte `0x02`): `0x01 domain` utf8 `"FFB-ROW/1"` · `0x02 table` utf8. Plain concatenation would let the parts blur together.
- Same workplace DEK as V1; `keyId` is its existing SHA-256 fingerprint. New native `encryptRows`/`decryptRows` and `signRowManifest`; no whole-snapshot or single-row methods.
- Compression and encryption run in the same native call; the short-key JSON is built in JS, where the books are already readable. Dictionaries are compiled into the native binary, so JS cannot substitute one.
- Dictionary is public (ships in the app binary, contains training substrings). Train on synthetic multilingual corpora only — never on real user PII.
- Compression-before-encryption length leakage (CRIME-style) is accepted; see Decisions.

## Limits (replaces `FFB_KEY_SNAPSHOT_LIMIT`)

- Per-row plaintext cap 64 KiB (observed max 2.1 KB). Decrypt rejects ciphertext over the cap before allocating, and decompression writes into a fixed 64 KiB buffer, so a hostile zstd frame cannot expand past it.
- Per-batch cap: 500 rows or 4 MiB of plaintext, whichever comes first. One batch is one native call and one upload page.
- No total-size cap — pagination makes it unnecessary.
- Every upload/download page is compressed as a whole in transport (HTTP `Content-Encoding` zstd or gzip), and the backup ZIP deflates its NDJSON. Uncompressed pages cost ~3.8× more on the wire.

## Sync semantics

- **Every Device of the User may write.** Commits are serialised by the server, not by a writer role: the server accepts a manifest only if `prevHash` equals its current head hash and `seq` is head + 1 (compare-and-swap), so the chain stays linear and never forks. `authorUserId`/`authorDeviceId` record who committed; they grant nothing.
- **Scan cost.** If the full commit scan is too slow on device, pre-filter: hash only rows with `updated_at` after the last commit (every synced table has it except insert-only `audit_logs`, where new ids suffice) and find deletes by diffing id sets. Keep a periodic full scan as the correctness backstop, since raw SQL writes may skip `updated_at`.
- **Pull.** Fetch manifests after the last verified `seq`, check each signature and `prevHash` link, fetch envelopes with a newer `seq`, decrypt and validate, and recompute the root against the local index. Only when it equals the head's `root` is the change set applied, in one database batch, together with any conflicts it raises. Any mismatch leaves the Device on its last verified state with a recoverable integrity error.
- **Commit (pull, then push).** Pull first. Then, under the database writer lock, scan `accounts`, `journals`, `transactions`, `audit_logs`, `budgets`, `budget_scopes`, `account_metadata`, `planned_payments`, `journal_metadata`, `transaction_auto_post_rules` and `transaction_inbox_records`, and compare each row's content hash with the local row index (see Local state). These are the V2 source tables; the V1 field lists are in git history in `workplaceSnapshot.ts`. Changed rows are re-encrypted; index keys missing from the database become tombstones, which covers hard-deleted tables such as `budgets` and `budget_scopes`. Run journal-balance validation over the result, upload the changed envelopes in batches (staged under the pending manifest `id`, invisible until accepted), then the manifest. If the compare-and-swap fails because another Device committed first, pull again and retry; staged envelopes from the failed attempt are discarded by the server.
- **Conflict unit is the group, not the row.** A journal with its `transactions` legs and `journal_metadata`; an account with its `account_metadata`; a budget with its `budget_scopes`; every other row alone. A row whose group key changes belongs to both groups. A pulled change conflicts when the same group also has uncommitted local changes, including a remote tombstone against a local edit.
- **Conflicts never merge silently.** The remote group is applied, since other Devices may already have it, and the local version of the whole group is saved to a device-local conflict record. The user picks "keep mine", which re-applies the local group as a new local change committed next, or "keep theirs", which drops it. Groups apply whole, so journals stay balanced either way. Audit rows are insert-only with fresh ids and never conflict.
- **Server storage.** Latest envelope per `(table, rowId)`, tagged with the `seq` that wrote it, plus every manifest. No row history: conflict detection compares against the local index, so no common base is fetched. Tombstones are kept indefinitely (~350B each).
- **No sync-generated audit rows.** Applying a commit uses a restore publication path (to be written; V1's `restoreWorkplaceSnapshot.ts` is in git history), which keeps the author's audit rows and fabricates none.
- **Derived data rebuilds locally.** `balance_snapshots`, running balances, rate caches and other data outside the 11 V2 source tables never travel; readers rebuild them after applying.
- Steady-state cost is per changed row (~195B compressed + ~350B envelope ≈ 550B). The ~10 MiB full cost hits only on first sync, which is paginated and resumable; add parallelism before considering bulk-chunk transfer.
- Chunked compress-then-encrypt (~1.5 MiB) is documented but rejected: it reintroduces the all-or-nothing unit V2 exists to escape.

## Local state

Device-local SQLite tables, never synced or exported:

- **Row index** `(table, rowId) → contentHash, leafHash, seq`, plus the last verified checkpoint `(seq, manifestHash)`. `contentHash` is SHA-256 of the canonical short-key JSON at the last sync; a row whose current hash differs has an uncommitted local change. ~19k rows ≈ 1.5 MiB. No encrypted row copies are kept; envelopes are regenerated from SQLite only for rows that changed.
- **Conflict records**: the local version of each conflicting group, kept until the user resolves it.

Losing the row index is safe but not free. Online, the Device downloads and verifies the head state and rebuilds the index from it; any group whose local rows differ from the head becomes a conflict for review, because without the index local edits and stale rows look the same. Offline, the next backup file simply starts a fresh chain (see Local backup file).

## Short-key maps and dictionaries

- Per table, checked in, versioned by `schema.version`. Maps are additive-only: new columns get new keys, old keys are never reused. Every map version is retained, so any older row still decodes. Devices on different app versions may write concurrently; a newer Device's rows wait on older Devices per Decision 14.
- Dictionaries (~16KB/table) are trained at build time by a checked-in, seeded synthetic-corpus script and regenerated only when that table's columns change. `dictId` is `<table>/v<n>`, immutable once shipped and never removed from the binary.
- A new dictionary ships read-capable first and becomes the write default only in a later release, so Devices one release behind can still read new rows.
- Per-table dicts beat one global dict (tables share little structure).

## Local backup file

The offline backup is a ZIP (fflate, already a dependency) containing the signed head manifest, the row envelopes as NDJSON, the Workplace DEK recovery envelope and the encrypted User-recovery package. It replaces V1's `LocalRecoveryPackage` and `workplaceDump.ts` shapes. The recovery credential stays a separate file, as in V1.

Until a backend exists there is no compare-and-swap, no pull and no cross-Device sync: each backup file is a complete, self-verifying signed state of one Device's books, and restoring one replaces local books rather than merging. Chain continuity (`seq`, `prevHash`) and the rollback checkpoint matter only for server sync; an offline backup may start a fresh genesis chain, and the first upload to a future backend starts the server chain.

Offline recovery: pick the backup file, then the credential (native pickers, existing order); verify the credential pins; recover the User; verify the manifest signature against the pinned User identity; stream batches through `decryptRows`, recomputing the root; validate with `validateImportedData`; and publish through a restore publication path (to be written; V1's `restoreWorkplaceSnapshot.ts` is in git history). The restore receipt and `pendingCompletion` checkpoint are keyed by manifest hash. An interrupted restore starts again from the file; the receipt makes a repeat harmless.

## Export path: no change

Short-keys were measured at zero benefit inside the zipped plaintext export. The export stays zip + readable JSON for compatibility with older app versions reading user-shared files. A future gzip→zstd swap inside the zip (1.17 → 0.92 MiB) goes behind an export `formatVersion` bump with dual-read, if wanted.

## Rollout task list

Merge gate: **do not merge the V1 whole-snapshot backup path** (`encryptSnapshot`/`decryptSnapshot`, single-nonce whole-blob `EncryptedSnapshot`, `FFB_KEY_SNAPSHOT_LIMIT`) currently on `codex/v1-key-management-recovery`. It lands only as row-level V2 per this doc. Merging V1 first and migrating later means shipping the all-or-nothing unit, its size caps, and a migration users pay for — build V2 directly. Every task below must be complete before merge; no V1 backup path remains afterward.

Branch split: the key-management substrate on this branch has no snapshot-encryption dependency once the held items below are removed, and **may merge ahead** — User/Workplace enrollment and confirmation, vault and key references, recovery credentials, ciphertext state stores, and setup-status reporting minus backup verification. The setup UI stays hidden until V2 ships: without a backup, recovery secrets restore nothing, and a standalone User-recovery file would be a third format to support forever. **Held for V2**: the encrypt/decrypt snapshot methods, the `EncryptedSnapshot` envelope, `serialize`/`decodeWorkplaceSnapshot` with `MAX_SNAPSHOT_*` and `FFB_KEY_SNAPSHOT_LIMIT`, the `encryptionSetup` package save/verify steps, the `FFB_KEY_BACKUPS_REQUIRED` removal-device gate (it cannot be satisfied without backup), `forgetDevice` (same gate), the `LocalRecoveryPackage` V1 shape (it embeds an `EncryptedSnapshot`), the `recover()` snapshot-decrypt-and-publish path, native `SnapshotCrypto.cpp` plus the `KeyEngine` encrypt/decrypt/`decryptDump` branches, the `workplaceDump.ts` V1 shape, and the V1 dump/proof harness. `describeSetup`'s `writerAllowed`/`budgetExhausted` fields go away with the counter and the single-writer rule.

- [ ] Vendor zstd C sources (BSD) into the `ExpoKeyCrypto` C++ module, like `nlohmann/json`; compile per-table dictionaries into the binary.
- [ ] Native `encryptRows`/`decryptRows` (Android+iOS): zstd + inner TLV + HKDF + AES-GCM in one call; per-row results on decrypt, all-or-nothing on encrypt; 64 KiB and batch caps; bounded decompression.
- [ ] `signRowManifest` native op (Android+iOS) with its own domain string + JS verification against the User public identity; shared cross-platform TLV/AAD/HKDF/inner-TLV/Merkle test vectors gating merge.
- [ ] Short-key maps for the 11 V2 source tables listed above, additive-only, all versions retained, unknown keys rejected.
- [ ] `rowEnvelope.ts`: envelope + manifest validators, header-as-AAD binding. No `FFB_KEY_SNAPSHOT_LIMIT`.
- [ ] Dictionary pipeline: seeded synthetic multilingual corpus script + checked-in per-table `dict.vN.bin`, read-before-write rollout.
- [ ] Local row index table and commit scan under the writer lock, including tombstones for hard deletes.
- [ ] Signed chained manifests: `seq`, `prevHash`, `authorUserId`, `authorDeviceId`, full-state RFC 6962 root; pulls verify the chain and root before applying.
- [ ] Pull-then-push commit with compare-and-swap retry; staged envelopes invisible until their manifest is accepted.
- [ ] Group conflict detection, device-local conflict records and the "keep mine / keep theirs" review UI.
- [ ] Atomic apply via the restore path; pending commits for unreadable rows; derived-data rebuild.
- [ ] V2 local backup ZIP and offline recovery keyed by manifest hash.
- [ ] Analytics consent: disclosure copy, opt-out flag honoured server-side, aggregate-first queries, retention limit.
- [ ] Amend `key-management.md` §§9 and 11 to the V2 rules in the same PR that lands `encryptRows`.
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

10. **Where does zstd come from, and where does it run?** Vendored zstd C sources in the existing C++ module, called from `encryptRows`/`decryptRows`, so compression and encryption share one native call. Jest uses the host-compiled C++ tests; web needs nothing because private-key operations never run there.
11. **How are dictionaries managed?** Seeded synthetic corpus script, checked-in dictionary files, immutable `dictId`s kept forever, and read-capable one release before they become the write default.
12. **Is the compression length leak acceptable?** Yes, without padding. Each row compresses alone against a public dictionary, and an attacker-authored SMS row mostly contains the attacker's own text, so there is no secret to probe. Padding would cost ~300 KB per full sync for no practical gain.

### Schema and migrations

13. **What happens when the schema version changes?** Rows decode through their own retained short-key map; missing keys take column defaults. A non-additive change registers a per-version row upgrade function. Rows are re-encrypted only when their content changes. The exact-version check becomes "row `schemaVersion` ≤ app schema version".
14. **What does an older app do with newer rows?** A commit containing any row with an unknown `schemaVersion`, `dictId` or short key stays pending, unapplied, with an "Update the app to see recent changes" notice. Partial application could break journal balance, so the whole commit waits. Such a Device cannot commit until updated, because its next commit would have to build on that head.

### Limits and performance

15. **What are the batch and per-row limits?** 500 rows or 4 MiB per batch, through `encryptRows`/`decryptRows`. Uploads checkpoint per batch and the manifest goes last. A row over 64 KiB fails the commit with `FFB_ROW_TOO_LARGE` naming the table; rows are never split, and input caps on notes and similar fields should keep this unreachable.

### Header metadata and analytics

16. **What may the server see and use?** `workplaceId`, `table`, `rowId`, `updatedAt`, `deleted`, `keyId`, `salt` and manifest fields. They may be used for analytics only under a disclosed, separate consent with an opt-out that the server honours (the metadata stays readable either way, so exclusion is server-side). Queries are aggregate-first, and raw analytics copies have a retention limit. Marketing says contents are end-to-end encrypted and that sync activity is visible. Confirm the consent design against DPDP/GDPR with counsel before launch.

### Rollout and scope

17. **How does the merge gate apply?** Split the branch (see Rollout task list): the substrate merges ahead with setup UI hidden; everything snapshot-shaped is held and replaced.
18. **Which spec is authoritative?** This doc for payload format, limits, writer model and sync; `key-management.md` for the key hierarchy, recovery and online authority. `key-management.md` §§9 and 11 carry a pointer here now and get rewritten in the PR that lands `encryptRows`.
19. **What happens to existing V1 artifacts?** V1 never shipped, so V1 snapshot, package and dump formats are deleted with no reader. Test-generated V1 files become unreadable, which is acceptable.
