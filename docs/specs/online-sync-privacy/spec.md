# Spec — Private Cloud Backup, Device Sync, and Workplace Access

**Product:** Full Frills Balance  
**Date:** 2026-09-06  
**Status:** Draft architecture  
**Related:** [`CONTEXT.md`](../../../CONTEXT.md), [`docs/specs/user-device-workplace/spec.md`](../user-device-workplace/spec.md)

## 1. Decision summary

Full Frills Balance will use a privacy-first online service for encrypted Workplace backup and synchronization.

The backend may authenticate Users, register Devices, enforce Workplace membership, store encrypted changes, and coordinate synchronization. It must not be able to decrypt Workplace financial data.

The first online product is **one User across multiple Devices**. Collaborative multi-user Workplaces are a later extension of the same key model, not part of the first sync release.

The first online entry point is an upgrade flow. After upgrading, the User is offered online authentication. After authentication, the User must explicitly agree to sync before any Workplace data is uploaded. The app then creates the User key, Device key, and recovery material locally before enabling sync.

The initial backend recommendation is:

- Supabase Auth for User sessions;
- Supabase Postgres for Users, Devices, Workplaces, memberships, sync metadata, and the operation log;
- Supabase Storage or Cloudflare R2 for encrypted snapshots;
- authenticated Edge Functions or API endpoints for device enrollment, sync, and recovery operations;
- client-side encryption in the mobile app.

Supabase is an infrastructure choice, not a privacy boundary. Privacy comes from encrypting data before upload and keeping decryption keys out of the backend.

## 2. Terminology

| Term | Meaning |
| --- | --- |
| User | Human identity authenticated by the online service. One User may have multiple Devices and memberships in multiple Workplaces. |
| Device | One app installation. It owns a device key pair and local encrypted state. |
| User key pair | Long-lived User-level asymmetric identity key pair. The private key is held by trusted client Devices and is used to authorize Device enrollment or handover. |
| Workplace | The tenancy containing one set of financial books. |
| Workplace DEK | Random symmetric key used to encrypt Workplace data. One Workplace has one active DEK generation. |
| Device key pair | Per-installation asymmetric key pair used to authenticate one Device and receive wrapped Workplace keys. |
| Recovery key | High-entropy recovery secret or key-encryption key used to recover the User key and/or Workplace keys. It is not the User key, Device key, or Workplace DEK. |
| Wrapped key | A Workplace DEK encrypted to a Device public key or recovery key. |
| Operation | One encrypted, idempotent change to a Workplace record. |
| Snapshot | An encrypted backup of a consistent Workplace state. |
| Membership | A User's role and status for a Workplace. |

Avoid calling every key a DEK. The Workplace DEK encrypts financial data. A device-local key, if used, protects local storage and is a separate concern.

## 3. Goals

- Restore encrypted Workplace books on a replacement Device.
- Keep one User's books synchronized across multiple Devices.
- Allow the backend to enforce read/write access without seeing financial contents.
- Preserve the local-first behavior of the current app.
- Recompute derived balances and projections locally.
- Make uploads retry-safe and downloads resumable.
- Support future Workplace membership and roles.
- Make device revocation and key recovery explicit.

## 4. Non-goals for v1

- Collaborative multi-user editing.
- Tax, legal, or regulatory workflows.
- Server-side reporting over plaintext financial data.
- Uploading the WatermelonDB SQLite file as the sync format.
- Automatic password-based recovery with no user-visible tradeoff.
- Background SMS processing on the server.
- Full metadata privacy. The service will necessarily see some account, device, size, and timing metadata unless a later padding/mixing design is added.

## 5. Key hierarchy

The core hierarchy is:

```text
Workplace DEK
  ├── wrapped for Device A
  ├── wrapped for Device B
  ├── wrapped for recovery key
  └── wrapped for each future Workplace member
```

The identity hierarchy is separate:

```text
User key pair
  ├── authorizes Device A
  ├── authorizes Device B
  └── protected/recoverable using recovery material

Device A key pair → authenticates Device A
Device B key pair → authenticates Device B
```

The User key is not used to encrypt every financial record. The Workplace DEK remains the data-encryption key. The Device key is not shared between Devices.

### 5.1 Workplace DEK

The Workplace DEK is generated on a trusted client using a cryptographically secure random source. It encrypts Workplace records, operation payloads, and snapshots with an authenticated-encryption algorithm such as AES-GCM or XChaCha20-Poly1305.

Every encrypted item requires a unique nonce and authenticated associated data containing at least:

- Workplace ID;
- entity or operation ID;
- schema/version identifier;
- key generation.

The Workplace DEK is never sent to the backend in plaintext.

### 5.2 Device keys

Each Device generates its own key material locally during enrollment:

- an encryption key pair for receiving wrapped Workplace DEKs;
- a signing key pair for authenticating submitted operations.

Private keys remain in platform secure storage where possible. Public keys may be registered with the backend.

If the platform or selected crypto library supports a secure hardware-backed key, use it. Hardware backing is defense in depth, not a replacement for the protocol.

### 5.3 User key and recovery material

After the User agrees to sync, the trusted client generates a long-lived User key pair. The User private key must not be stored on the backend in plaintext. It may be encrypted locally and wrapped for recovery.

The app also creates recovery material. The recovery material should be generated or confirmed in an explicit setup surface and tested before cloud sync is enabled. The recovery secret can remain stable while Workplace DEK generations change; the recovery envelope is updated to wrap the current Workplace DEK or User private key.

The User key is the User-level trust anchor. A new Device is accepted only after either:

- an existing trusted Device authorizes and wraps the required key material for it; or
- the User completes recovery on the new Device.

### 5.4 Local database key

A separate device-local key may encrypt the local SQLite database or sensitive cache. It must not be the Workplace DEK and must not be required by other Devices.

## 6. Authentication and authorization

Encryption and authorization solve different problems:

```text
User session       → who is making the request?
Device key         → which registered installation is making it?
Membership role    → may this identity read or write this Workplace?
Workplace DEK      → can this Device understand the returned ciphertext?
```

### 6.1 User authentication

The User authenticates through the identity provider and receives a short-lived session token plus a refresh mechanism. The domain model remains provider-neutral.

### 6.2 Upgrade and sync-consent flow

The upgrade flow must preserve the current local-only app until the User opts in:

1. Upgrade the app and migrate local data normally.
2. Present the online login mechanism.
3. Explain what syncing uploads and what the backend cannot decrypt.
4. Ask for explicit sync consent.
5. Generate the User key pair locally.
6. Generate the Device key pair locally.
7. Generate and verify recovery material.
8. Register the User and Device public keys with the backend.
9. Wrap the User private key and each Workplace DEK for the appropriate recovery/device key.
10. Upload encrypted Workplace data only after the User completes consent and key setup.

Declining login or sync must leave local books usable. Consent must be revocable for future uploads, but stopping sync does not delete data already uploaded unless the User explicitly requests account/backup deletion.

### 6.3 Device authentication

The backend registers a Device public key after enrollment. Sensitive requests should include a challenge or nonce signed by the Device signing key. The backend verifies:

- valid User session;
- active registered Device;
- signature over a canonical request or operation;
- request freshness and replay protection.

### 6.3 Workplace authorization

The backend checks an active Workplace membership before returning or accepting ciphertext.

Initial roles:

| Role | Read | Write | Invite/revoke | Delete Workplace |
| --- | --- | --- | --- | --- |
| Owner | yes | yes | yes | yes |
| Editor | yes | yes | no | no |
| Viewer | yes | no | no | no |

Supabase Row Level Security can enforce coarse access to rows. Edge Functions or an equivalent API layer should handle device signatures, canonical request verification, sync cursors, and security-sensitive transitions.

## 7. Device enrollment and decryption

### 7.1 First Device

1. User authenticates.
2. Device generates its key pairs.
3. Backend registers the Device public keys.
4. Device creates or imports a Workplace.
5. Device generates or obtains the Workplace DEK.
6. Device encrypts books locally and uploads ciphertext.
7. Device uploads a copy of the Workplace DEK wrapped to its own public key.

### 7.2 Second Device pairing

Preferred flow:

1. User signs in on Device B.
2. Device B generates new key pairs.
3. Device B displays a QR code or short pairing code containing an enrollment challenge.
4. Device A scans or confirms the challenge.
5. Device A verifies that the pairing is intentional and authenticates the request.
6. Device A encrypts the Workplace DEK to Device B's public encryption key.
7. Backend records Device B as active and stores the wrapped Workplace DEK.
8. Device B downloads encrypted operations/snapshots and decrypts locally.

Device B never receives Device A's private keys or a plaintext Workplace DEK over the network.

### 7.3 Decryption on Device B

```text
Device B private key
  decrypts wrapped Workplace DEK
      ↓
Workplace DEK
  decrypts encrypted snapshot/operations
      ↓
Local WatermelonDB records
  rebuilds balances and projections
```

## 8. Backup and sync protocol

Backup and sync share encryption but use different transport semantics.

### 8.1 Encrypted backup

An export job creates a consistent local snapshot, encrypts it on-device, and uploads:

- ciphertext;
- schema version;
- key generation;
- ciphertext hash;
- size and timestamps;
- Workplace and Device identifiers needed for authorization.

The backend stores the blob but cannot inspect its contents.

### 8.2 Incremental sync

Do not sync raw SQLite files. Sync encrypted operations using a server cursor:

```text
Device A → encrypted operation + signature → backend
Device B ← operations after cursor        ← backend
Device B → decrypts and applies locally
Device B → rebuilds derived balances
```

Each operation needs:

- globally unique operation ID;
- Workplace ID;
- Device ID;
- entity type and entity ID;
- encrypted payload;
- key generation;
- client-created timestamp;
- causal/version metadata;
- signature;
- idempotency status.

Uploads must be safe to retry. The backend must treat a repeated operation ID as the same operation, not a second mutation.

### 8.3 What is authoritative

Sync source data:

- Accounts;
- Journals and transactions;
- Budgets and scopes;
- Planned payments;
- Workplace preferences that affect book meaning;
- Workplace-owned SMS rules and consumed records.

Rebuild locally:

- Account balances;
- Net worth;
- Budget usage;
- Safe to Spend projections;
- Reports;
- Other caches and snapshots.

The server must not become authoritative for derived balances.

## 9. Conflict handling

Conflict policy is per entity, not global.

- Journal creation: append-only where possible.
- Journal edits: create revisions or explicit conflict records; do not silently last-write-wins financial changes.
- Account names, icons, colors: last-write-wins may be acceptable.
- Budgets and planned payments: versioned edit with conflict UI when both Devices changed the same record.
- Deletes: represent as tombstones and replicate them before garbage collection.
- Membership and security changes: server-authoritative and audited.

If an operation cannot be safely merged, preserve both versions and require a user decision. Losing a financial mutation silently is worse than showing a conflict.

## 10. Recovery

Device pairing is not sufficient. Users can lose every Device.

The Workplace DEK should also be wrapped by a recovery key. Candidate recovery mechanisms:

- user-generated recovery phrase;
- password-derived key using a memory-hard KDF such as Argon2id or scrypt;
- trusted-device recovery, where an existing Device approves a replacement.

Recommended product behavior:

1. Require the User to create or confirm a recovery method before enabling cloud backup.
2. Generate recovery material for the User and require them to confirm that it has been saved or otherwise made recoverable.
3. Test recovery during setup.
4. Make clear that losing both Devices and the recovery method can make encrypted books unrecoverable.
5. Never imply that a server password reset can recover plaintext books.

## 11. Revocation and key rotation

Authorization and key rotation solve different problems:

```text
Auth layer → may this identity fetch ciphertext?
Workplace DEK → can a device decrypt ciphertext it already possesses?
```

For the one-User, multiple-Device MVP, backend revocation may be sufficient for normal access control: an inactive Device or membership cannot download old or new ciphertext. Key rotation is the stronger defense if ciphertext escapes the authorization layer.

For multi-user Workplaces, or after suspected key compromise, rotate the Workplace DEK. Use key generations (epochs):

```text
epoch 1 → members/devices A, B, C
C removed
epoch 2 → members/devices A, B
```

When a Device or User is removed:

1. Mark the Device revoked on the backend.
2. Mark the membership revoked when removal is a User action.
3. Reject new sync requests from the revoked identity or Device.
4. Stop returning ciphertext to it.
5. For a security rotation, generate a new Workplace DEK for future writes.
6. Wrap the new DEK for remaining active Devices and the recovery key.

Revocation cannot erase data already downloaded by a compromised or removed Device. A removed User who still has an old DEK can decrypt any old ciphertext they possess. DEK rotation makes that old key useless for future ciphertext obtained after the rotation, but it cannot recall plaintext.

### 11.1 Scheduled rotation — deferred

Automatic monthly or User-selected rotation is explicitly out of scope for the initial sync system. It remains a future option only.

If later introduced, it will require:

- all active Devices to receive the new key;
- a pending-rotation state for offline Devices;
- retention of old keys for historical data;
- key-generation metadata on every operation and snapshot;
- resumable and idempotent rotation.

Event-driven rotation after Device/member removal or suspected compromise is also deferred from the first one-User, multi-Device MVP unless the accepted threat model requires it.

### 11.2 Recovery key behavior

The recovery secret is separate from the Workplace DEK. It may remain stable across Workplace DEK generations, but the recovery envelope must be updated for each new generation:

```text
Recovery key → wrapped Workplace DEK v1
Recovery key → wrapped Workplace DEK v2
Recovery key → wrapped Workplace DEK v3
```

If the recovery secret is changed or suspected compromised, generate a new recovery key and re-wrap the current Workplace DEK. Recovery-secret replacement is separate from Workplace DEK rotation.

For future multi-user Workplaces, each member receives a wrapped copy of the current Workplace DEK. Removing a member prevents future access through the backend and, after rotation, prevents the old key from decrypting future ciphertext. Previously downloaded plaintext cannot be remotely recalled.

## 12. Backend shape

Initial logical tables:

```text
users
devices
device_sessions
workplaces
workplace_members
workplace_device_keys
sync_operations
sync_cursors
backup_snapshots
recovery_key_envelopes
audit_events
```

The backend should store ciphertext as opaque bytes or text. It may store non-sensitive routing metadata required for authorization and synchronization.

Suggested service boundaries:

- `IdentityService` — User sessions and account lifecycle.
- `DeviceService` — key registration, pairing, heartbeat, revocation.
- `WorkplaceAccessService` — memberships and roles.
- `WorkplaceKeyService` — wrapped-key envelopes and generation rotation.
- `SyncService` — push, pull, cursors, idempotency, tombstones.
- `BackupService` — encrypted snapshot upload, retention, download, deletion.

Keep these separate from current local accounting services. Local journal and balance logic should remain usable without network access.

## 13. Threat model

The design protects against:

- database/storage compromise where the attacker obtains ciphertext;
- backend operators reading financial contents;
- unauthorized Devices attempting to access a Workplace;
- replayed or duplicated operations;
- accidental duplicate uploads;
- a lost Device after revocation, for future data.

It does not fully protect against:

- malware on an unlocked Device;
- a compromised operating system or secure-storage implementation;
- a User intentionally sharing recovery material;
- a Device that downloaded plaintext before revocation;
- traffic analysis and all metadata leakage;
- a malicious backend withholding or delaying data.

## 14. Phased delivery

### Phase 1 — Encrypted manual backup

- Upgrade-time User authentication.
- Explicit sync consent.
- User key-pair and Device key-pair generation.
- Recovery-material generation, verification, and restore.
- Workplace DEK generation or adoption for existing local Workplaces.
- Encrypted snapshot upload/download.
- Restore on a second Device through trusted-device handover or recovery.
- Device registration and revocation.

### Phase 2 — One-user multi-device sync

- Device pairing.
- Encrypted operation log.
- Cursor-based pull/push.
- Idempotency and tombstones.
- Local rebuild after sync.
- Conflict detection for edited financial records.

### Phase 3 — Reliability and paid service

- Automatic backup scheduling.
- Retention/version history.
- Storage quotas.
- Sync diagnostics.
- Offline queue visibility.
- Subscription or paid backup tiers.

### Phase 4 — Multi-user Workplaces

- Invitations and membership roles.
- Wrapped key per member.
- Key rotation on removal.
- Collaboration conflict UI.
- Shared audit history.

Tax and other legal workflows remain separate product lines and should not block private backup/sync.

## 15. Open decisions before implementation

- Exact mobile crypto library and platform support for Expo/native builds.
- AES-GCM versus XChaCha20-Poly1305.
- Whether local SQLite is encrypted separately from synced payloads.
- Recovery phrase versus password-derived recovery, or both.
- Snapshot frequency and retention limits.
- Whether sync operations are per record, per domain command, or per transaction batch.
- Whether event-driven key rotation is required when the first multi-user model is introduced; scheduled automatic rotation is not part of v1.
- How much metadata the service is allowed to retain.
- Whether Supabase Storage is sufficient or R2 is preferred for backup economics.
- Whether a managed sync product can support WatermelonDB without weakening the protocol.

No backend implementation should begin until the key lifecycle, recovery behavior, and operation/conflict model are accepted.
