# Private online backup and synchronization

Date: 13 October 2026. Status: local foundations, Settings setup and fresh-install recovery implemented; online service and enrollment remain unavailable.

[The documentation guide](./README.md) maps the current documents. [Key management](./key-management.md) defines the encryption architecture. [Preparation](./preparation.md) records implementation scope and verification gates. Domain ownership follows [User, Device and Workplace](../user-device-workplace/spec.md) and [CONTEXT.md](../../../CONTEXT.md).

## V1 decisions

- Existing local books remain usable without login or upload consent. Encryption setup is a deliberate creation/upgrade step; backup cannot create or replace missing keys implicitly.
- Preserve the stable application User UUID when binding a future login account. Provider subjects and email addresses are account attributes, not replacement User identities. Supabase Auth and backend storage are the current Phase 2 direction; no project, repository placement or schema has been created.
- Generate independent User/Device encryption pairs, an independent User signing pair, and one random 256-bit Workplace DEK. Pin the complete versioned User public identity before distributing credentials; later online signing reuses it. Device private key → local encrypted User bundle → User-addressed encrypted DEK → financial ciphertext.
- Only the Device private key persists in the dedicated native vault. Readable User private keys and DEKs exist in memory during use, with no persisted DEK cache. Device bundles remain local and are excluded from app-managed exports/uploads.
- The existing app-lock policy gates key use. The native vault uses device-only protection (iOS when-unlocked Keychain; AndroidKeyStore-wrapped keys in backup-excluded preferences), without requiring fresh biometrics for every private-key read. With app lock disabled, device unlock is the remaining user-authentication boundary.
- Generate, export and verify separate User and Workplace recovery credentials. Ordinary snapshot encryption and upload require neither secret.
- User recovery restores the same encryption/signing keys onto a fresh Device through a provider-neutral ciphertext source, independent of the lost installation. Missing/orphan local keys route to recovery; they never authorize a new root. It does not replace the User identity, register an online Device, change membership or authorize a second writer by itself.
- Workplace emergency material only decrypts a dump. The client receives the encrypted DEK recovery envelope and encrypted Workplace snapshot, then produces readable data locally. Any subsequent import creates a new Workplace through import-as-copy. No old User/owner authority is recovered. The externally saved credential pins SHA-256 of the single DEK; forged different-DEK dumps fail even if the server substitutes matching metadata and ciphertext.
- A future dump API or support workflow may locate ciphertext using the Workplace ID. The service never receives the decryption phrase or decrypts the dump. Hosted delivery, retention and access policy are separate implementation work.
- Rotation, root replacement, multi-writer operation budgets, writer handover and concurrent editing are outside the delivered local slice. V1 uses one stable DEK; encryption stops when its bounded invocation budget is exhausted.

## Cryptographic and persistence boundaries

The local implementation uses HPKE base mode with X25519/HKDF-SHA256/AES-256-GCM for key envelopes. Recovery credentials reconstruct independent recovery pairs through the library's versioned seed API. HPKE context binds purpose, recipient, User, Device or Workplace, and key identity. HPKE does not authenticate a sender. Local recovery packages now carry a User signature verified against the independently saved full identity pin before mutation; online authorization and signed publication protocols remain separate gates.

Snapshot wire format 2 uses AES-256-GCM, random 96-bit nonces and 128-bit tags. Its routing binds Workplace, snapshot ID, schema and stable DEK fingerprint. It carries no recovery wrapper, plaintext key or caller-selected generation. Format versions do not represent different key hierarchies.

Snapshot capture holds a database reader while source records are copied, then encrypts after release. Source accounting data travels; running balances/projections and Device-owned SMS/settings do not. Primitive/enum/reference checks, balanced posted-journal validation, currency interpretation and collision checks apply before publication. Current snapshot parsing supports database schema 35 only; cloud persistence requires a reviewed evolution policy.

Ordinary User-chain restore preserves shared IDs and commits a snapshot receipt with the graph. Exact retries are idempotent; an existing different Workplace/snapshot is not overwritten. Publication returns a preferences/activation handoff rather than enrolling a Device or changing app settings. Emergency dump decryption never calls this publication path.

## Manual publication

Online publication is deferred to a later PR. Its coordinator must require a verified account/User-key/registered-Device identity and explicit Workplace upload consent, consume enrolled key envelopes, stage immutable ciphertext and retry the same bytes and snapshot ID. Consent/session/revocation checks must run after awaited work and at dispatch. Local opt-out does not replace server authorization or deletion.

A future HTTPS transport requires a trusted challenge/signature adapter. Backend JWT, Device registration, membership/role, challenge expiry/single-use, consent, schema/size/hash admission and atomic idempotent publication must be implemented and tested before enabling it. HPKE base mode and server-provided content hashes do not authenticate the sender. Hosted restore is blocked until signed initial Workplace and snapshot manifests are verified against trusted identity pins. Checkpoints separately address observed rollback; they cannot prove latest after total loss without an independent checkpoint.

There is no deployed endpoint, sign-in provider, online setup surface or Supabase migration. Supabase is the current planned provider, confirmed 13 October; its schema and integration still require design. The rejected placeholder SQL remains deleted.

## Later synchronization

Do not synchronize SQLite files or mistake the existing audit log for a causal operation log. Future encrypted operations need durable IDs, source mutation capture, parent revisions, idempotent receipts, tombstones, cursors and snapshot watermarks. Clients rebuild balances and projections from source records.

Accounting history supplies reusable write boundaries and display helpers: `AccountingWriteSession`, `deriveAuditFieldDeltas`, audit payload creators, guarded undo and before/after UI. It is not a complete causal operation log. Existing UPDATE deltas omit unchanged fields; timestamps do not establish revision ancestry; bulk account reassignment does not stage history; serialization can retain only an error summary. SMS privacy remediation and import remapping can rewrite historical bytes, and display pairing is unsuitable for split journals with repeated account legs.

A future sync implementation needs its own complete, immutable mutation payloads, authenticated authors, parent revisions and conflict lifecycle. Keep explanatory history in snapshots, reuse formatting after normalization, and validate the whole journal before merging. Remaining requirements:

- Capture a complete accounting mutation and its durable outgoing operation in the same commit. Apply incoming source rows, replay receipt and cursor atomically; avoid echo uploads. Bind bootstrap snapshots to a log watermark, and tie tombstone cleanup to acknowledged delivery or explicit stale-Device bootstrap.
- Define cross-Device recurring-occurrence identity and generate/post/skip behavior, including schedule/time-zone changes and competing FX quotes. Per-upload idempotency alone cannot prevent duplicate settlements. Device-local SMS IDs likewise do not identify a universal bank event; amount/date similarity must not silently merge records.
- Shared book preferences currently live outside the accounting database. Define a durable capture/reconciliation boundary for synced settings while retaining navigation and Device preferences locally. Bound incoming batches, quarantine invalid/newer payloads, and show queued/failed/conflicted work before enabling multiple writers.

Merge independent financial changes only after whole-journal validation. Preserve competing edits and ask for confirmation when a safe merge is unavailable. Never silently last-write-wins edited money records.

Sharing adds User-addressed member DEK envelopes, invitations and roles. Device enrollment adds a local User bundle, not another per-Device DEK. Removal cannot retract previously copied User roots or plaintext. Protecting future data after root compromise requires a separately reviewed root-replacement and Workplace-rotation protocol.

## Release order

1. Verify the implemented human local setup/upgrade, separate saved recovery files, resume/discard and Device-access removal on physical devices and under interruption. The file-backed recovery source is replaceable by authorized backend retrieval in Phase 2; recovery secrets stay client-side.
2. Bind the existing local User identity to a provider-neutral account, implement signed registrations/initial manifests, opaque storage, authorization and explicit single-writer handover. Prove end-to-end replacement recovery before enabling manual online backup.
3. Implement causal synchronization, financial conflict handling, multi-writer budgets and verified sharing/removal. Review future owner-controlled rotation separately.

Automatic uploads, billing, quotas and vendor choice do not resolve the local correctness or identity gates.
