# Private online backup and synchronization

Date: 16 October 2026. Status: Device → User → Workplace key substrate implemented in native and service APIs; V1 whole-snapshot backup never shipped and was removed from this branch; [V2 row-envelope backup and sync](./row-envelope-sync.md) is in progress; no online service or account enrollment.

[The documentation guide](./README.md) maps the current documents. [Key management](./key-management.md) defines the encryption architecture. [Preparation](./preparation.md) records what remains on the branch and open gates. Payload format, sync semantics and offline backup ZIP layout are authoritative in [row-envelope sync](./row-envelope-sync.md). Domain ownership follows [User, Device and Workplace](../user-device-workplace/spec.md) and [CONTEXT.md](../../../CONTEXT.md).

## Agreed decisions

- Existing local books remain usable without login or upload consent. Creating User/Device/Workplace keys is deliberate; backup and sync must not generate or replace missing roots implicitly.
- Preserve the stable application User UUID when binding a future login account. Provider subjects and email addresses are account attributes, not replacement User identities. Supabase Auth and backend storage are the current Phase 2 direction; no project, repository placement or schema has been created.
- Generate independent User/Device encryption pairs, an independent User signing pair, and one random 256-bit Workplace DEK per Workplace. Pin the complete versioned User public identity before distributing credentials; later online signing reuses it. Device private key → local encrypted User bundle → User-addressed encrypted DEK → financial ciphertext.
- Only the Device private key persists in the dedicated native vault. Readable User private keys and DEKs exist in memory during use, with no persisted DEK cache. Device bundles remain local and are excluded from app-managed exports/uploads.
- The existing app-lock policy gates key use. The native vault uses device-only protection (iOS when-unlocked Keychain; AndroidKeyStore-wrapped keys in backup-excluded preferences), without requiring fresh biometrics for every private-key read. With app lock disabled, device unlock is the remaining user-authentication boundary.
- Generate, export and verify separate User and Workplace recovery credentials. Creating or uploading encrypted backups must not require typing those secrets on every operation.
- User recovery restores the same encryption/signing keys onto a fresh Device through a provider-neutral ciphertext source, independent of the lost installation. Missing or orphan local keys route to recovery; they never authorize a new root. It does not replace the User identity, register an online Device, change membership or authorize server writes by itself.
- Workplace emergency material decrypts salvage ciphertext only (see [row-envelope sync — local backup file](./row-envelope-sync.md#local-backup-file) and [key management §8](./key-management.md#8-user-recovery-and-workplace-emergency-export)). Importing recovered data creates a new Workplace through import-as-copy. No old User/owner authority is recovered. The externally saved Workplace credential pins SHA-256 of the single DEK.
- Rotation, root replacement, multi-writer budgets, writer handover and collaborative sharing are outside the current branch. Financial payloads use the V2 per-row model in [row-envelope sync](./row-envelope-sync.md); the removed unshipped whole-snapshot format and 2^20 DEK invocation cap are not part of the tree.

## Cryptographic boundaries

Key envelopes use HPKE base mode with X25519/HKDF-SHA256/AES-256-GCM. Recovery credentials reconstruct independent recovery pairs through the library's versioned seed API. HPKE context binds purpose, recipient, User, Device or Workplace, and key identity. HPKE does not authenticate a sender.

Financial rows use AES-256-GCM with per-row HKDF subkeys, zstd dictionaries and signed manifest chains as specified in [row-envelope sync](./row-envelope-sync.md). Row manifest signatures use a dedicated domain string; they must not reuse the removed local-recovery signing domain.

Only listed financial source tables and audit history travel in encrypted backup/sync; derived balances, rate caches, Device SMS, Device switches and navigation preferences do not. Validation and publication rules for restore/sync live with the V2 implementation (restore publication path still to be written).

## Manual publication and online service

Online upload, account binding, Device registration, consent, checkpoints and backend storage are deferred. A future coordinator must require verified account/User-key/registered-Device identity, explicit Workplace upload consent, staged immutable ciphertext and idempotent retries. HPKE base mode and server-provided content hashes do not authenticate the sender; hosted restore requires verified signed manifests against pinned User identity.

There is no deployed endpoint, sign-in provider, online setup surface or Supabase migration. Supabase is the current planned provider; its schema and integration still require design.

## Later synchronization

Do not synchronize SQLite files or mistake the existing audit log for a causal operation log. [Row-envelope sync](./row-envelope-sync.md) defines the first encrypted multi-Device protocol on this branch. Broader causal-operation requirements that extend beyond that doc:

- Define cross-Device recurring-occurrence identity and generate/post/skip behavior, including schedule/time-zone changes and competing FX quotes.
- Shared book preferences currently live outside the accounting database. Define a durable capture/reconciliation boundary for synced settings while retaining navigation and Device preferences locally.

Merge independent financial changes only after whole-journal validation. Preserve competing edits and ask for confirmation when a safe merge is unavailable. Never silently last-write-wins edited money records.

Sharing adds User-addressed member DEK envelopes, invitations and roles. Device enrollment adds a local User bundle, not another per-Device DEK. Removal cannot retract previously copied User roots or plaintext. Protecting future data after root compromise requires a separately reviewed root-replacement and Workplace-rotation protocol ([key management §10](./key-management.md#10-owner-controlled-freeze-rotation-and-access-removal)).

Accounting history supplies reusable write boundaries and display helpers (`AccountingWriteSession`, `deriveAuditFieldDeltas`, guarded undo). It is not a complete causal operation log. Existing UPDATE deltas omit unchanged fields; timestamps do not establish revision ancestry; SMS privacy remediation and import remapping can rewrite historical bytes.

## Release order

1. Complete physical-device and interruption gates for the key substrate and for V2 offline backup/restore per [preparation](./preparation.md#verification-and-remaining-gates) and [row-envelope rollout](./row-envelope-sync.md#rollout-task-list). Recovery secrets stay client-side; file-backed ciphertext may later be replaced by authorized backend retrieval.
2. Bind the existing local User UUID to a provider-neutral account; implement signed Device registration, authenticated envelope delivery, authorization and explicit upload consent. Prove end-to-end User recovery before enabling manual online backup.
3. Ship multi-Device sync (manifest chain, conflicts, fake then real transport), then sharing, rotation and root replacement as separate reviewed work.

Automatic uploads, billing, quotas and vendor choice do not resolve local correctness or identity gates.
