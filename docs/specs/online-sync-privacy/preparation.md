# Local foundations before online backup

Scope: the surviving local key-management APIs and the gates before V2 online backup.

[Key management](./key-management.md) is authoritative. V1 has one Device → User → Workplace hierarchy, one DEK per Workplace, and both independently saved recovery credentials. It uses the existing app lock; fresh biometric root authentication is not required. No readable DEK persists in storage.

## Delivered internal contracts

1. **Removed: consistent snapshot capture.** V1 snapshot capture and its database-reader contract were removed in the snapshot cleanup. Plaintext ZIP export remains a separate local feature.
2. **Removed: strict source snapshot.** The V1 snapshot format, field lists, schema-35 parser and snapshot size limits were removed. The V1 field lists remain in git history in `workplaceSnapshot.ts`.
3. **Scope/privacy direction.** V2 row sync is limited to its explicitly listed financial source tables and audit history; derived balances, rate caches, pending Device SMS, Device switches and navigation preferences do not travel. Structured metadata/audits use privacy sanitizers. Arbitrary user-authored text is not promised to be automatically detected.
4. **Local key enrollment substrate.** Independent User and Device X25519 encryption pairs and a User Ed25519 signing pair; a versioned public identity pin covering both User key roles; Device private key in the User/Device-scoped native vault; and a local Device-encrypted User bundle. The V1 snapshot recovery-package container and setup UI are removed; the surviving key APIs are listed in [key management](./key-management.md#11-current-implementation-and-release-gates).
5. **Local Workplace key enrollment.** Explicit creation or local-upgrade generates one random DEK, its User-addressed member envelope and its independent Workplace recovery envelope. Confirmation validates the externally saved credential and verifies that both envelopes yield the same DEK. Repeated enrollment refuses replacement; removed backup code does not create keys implicitly.
6. **Storage/unlock.** Only Device private keys persist as vault-protected secrets, opened only by native code. Public metadata and encrypted key envelopes live in private files with small nonsecret AsyncStorage locators. The app shell supplies existing app-lock state to the coordinator and native module; absent/locked policy fails closed. No persistent User-private-key/DEK cache exists, and neither crosses the JS boundary. Failed writes retain explicit partial state; unconfirmed setup may be deliberately discarded before established data depends on it.
7. **Recovery credential substrate.** Credential validation and native credential file pickers (`pickCredential`/`exportCredential`) remain available to the surviving key-management APIs. The V1 snapshot-bound User recovery-package, Workplace dump, snapshot-decryption and restore-publication flows were removed. The V2 recovery format is future work.
8. **Removed: payload encryption and budget.** V1 whole-snapshot encryption, wire format 1, durable invocation reservations and the 2^20 per-DEK limit were removed. V2 row encryption is not implemented.
9. **Removed: financial publication.** V1 snapshot restore, restore receipts and import-as-copy handoff were removed. V2 restore publication is to be written.
10. **Integration boundaries.** The surviving setup service has no UI caller. Online account binding, HTTP transport, consent/outbox stores, signed registration/manifest provisioning and schema admission remain future work; no online endpoint setting or backend exists.
11. **Removed: human setup and recovery UI.** The Settings setup flow and welcome-screen recovery entry were removed. The local key-management methods and credential file pickers remain API-level substrate.

## Native key-operation boundary

`ExpoKeyCrypto` is a local Expo module with one shared C++ implementation, thin Kotlin/Objective-C++/Swift adapters and native vault/file access. It uses HPKE with X25519/HKDF-SHA256/AES-256-GCM. JSON transport uses the vendored nlohmann/json header. Tests create disposable keys and data; no real credential or generated build binary is retained.

The surviving JS surface provides key generation/opening, reference-based recipient wrapping, scoped vault presence/removal, key confirmation, recovery validation and native credential file import/export. Only public metadata, ciphertext, opaque references and application data cross the transport. There is no raw-key read/write or key-borrow callback. Native credential pickers return expiring process-local handles; root keys and DEKs remain operation-scoped. This is ordinary native app memory, without an enclave, separate process or complete-memory-erasure guarantee.

Android uses a scoped AndroidKeyStore alias and encrypted preferences; iOS uses its dedicated Keychain service. Device private keys remain in the native vault. The shared core retains crypto primitives, protocol envelopes and the key engine; snapshot capture, snapshot cryptography, dump handling and publication are removed. Native bridges return allowlisted error codes rather than exception text. The per-store hierarchy queue and setup-workflow queue retain separate responsibilities.

The iOS provider binding uses QuickCrypto's OpenSSL headers and symbol-prefix layout. Installation checks the package version, HPKE header and pinned prefix-header hash. Moving to an independent iOS OpenSSL provider remains separate build/dependency work.

## Verification and remaining gates

The surviving substrate is covered by tests for the local key hierarchy, key-record validation, recovery credential validation, native vault references, storage failures and unconfirmed-enrollment discard. Native tests exercise the shared C++ key operations with disposable fixtures. The native recovery credential file pickers remain available; the removed snapshot, package, dump, restore and UI flows have no verification or release gate here.

Physical-device checks for the surviving key/vault substrate, cross-platform key interoperability, app-lock behavior, storage denial/corruption and interruption remain release gates. Simulator/emulator results do not close physical-device gates. Ordinary native memory and filesystem deletion do not guarantee complete erasure.

## Build-artifact incident

Two earlier Android builds used `SENTRY_DISABLE_AUTO_UPLOAD=1`; the installed integration requires the literal `true`. They uploaded JavaScript/source maps to Sentry project `full-frills-balance / react-native`, release `in.sahilsoni.fullfrillsbalance@1.0.0+1`, distribution 1. Recovery phrases and generated financial fixtures were not part of those artifacts. Bundle IDs `9a64ad56-a282-5ec3-8023-d9c69ee99281` and `9cee3dbf-a88e-5349-aa5b-aceee7d2ca0e` remain pending user-authorized deletion. E2E Release builds now set both upload-disable flags to `true`; no external deletion or backend provisioning occurred.

## Ordered remaining work

1. Complete physical iOS/Android checks for the surviving key hierarchy, native vault, app-lock behavior, credential file pickers and interruption handling.
2. Bind the same User UUID to online login; implement signed Device registration, authenticated envelope delivery, backend authorization/challenges, consent and authenticated checkpoints.
3. Design and implement V2 row encryption, manifest publication, restore publication, schema evolution and offline recovery.
4. Before concurrent editing/sharing, implement revisions/conflicts, durable mutations/receipts/cursors, tombstone retention, mixed-version behavior and verified invitations. Review rotation/root replacement separately.

Ordinary local SQLite and plaintext ZIP exports retain their existing behavior. Automatic backup, paid tiers and cloud vendor changes remain outside this work.
