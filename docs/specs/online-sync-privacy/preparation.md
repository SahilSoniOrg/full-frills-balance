# Encrypted backup implementation and release gates

Scope: implemented local encrypted backup/recovery and the remaining gates before release and online sync. [Key management](./key-management.md) defines the Device → User → Workplace hierarchy; [row-envelope sync](./row-envelope-sync.md) defines row payloads.

## Implemented on this branch

1. **Key enrollment and recovery.** Independent Device/User X25519 encryption pairs, a User Ed25519 signing pair and one random DEK per Workplace. Setup requires saving and reopening the independently exported User and Workplace recovery credentials. Existing app-lock policy applies; no fresh biometric prompt is required per operation.
2. **Mobile key boundary.** Device private keys persist through AndroidKeyStore-protected encrypted preferences or the dedicated iOS Keychain service. User private keys and DEKs are opened only for native operations and never returned to application JavaScript. Public metadata and encrypted envelopes use private files with nonsecret AsyncStorage locators. Unfinished enrollment can be explicitly discarded; established keys cannot be silently replaced.
3. **Web implementation.** The same C++ engine runs as WebAssembly in a dedicated worker. Its Device vault uses IndexedDB with a non-extractable Web Crypto wrapping key; public/ciphertext state lives separately. Missing WASM or worker capability fails closed. Clearing browser data removes Device access. This has a weaker isolation boundary than mobile and does not protect against compromised same-origin scripts.
4. **Row encryption and integrity.** Canonical short-key codecs, ordinary per-row gzip with an authenticated compression selector, native compression/encryption, per-row derived keys, authenticated headers, signed manifests and Merkle roots are implemented. Batch and decompression limits bound individual native operations.
5. **Local backup and restore.** `buildBackupCommit` captures a complete independent backup under the database writer lock. The ZIP contains encrypted rows, a signed manifest, Workplace key envelopes and an encrypted User recovery package. The User recovery credential remains a separate file. Restore verifies the signature and row integrity, validates financial references and currency precision, then publishes rows atomically with a manifest-hash receipt. Publication also saves a device-local completion handoff containing public identity references, encrypted Workplace key envelopes and restored settings. After publication, launch completes keys, settings, balances and session/launch checkpoints from that handoff without reopening the ZIP or recovery credential. Failures keep a retryable recovery gate closed; required balance rebuilding no longer degrades to a dashboard warning. The handoff is cleared only after completion and persistence acknowledgement. Exact archive retries retain the receipt and do not overwrite current records or restart completed work.
6. **Privacy scope.** Twelve logical financial source tables and audit history are included. Derived balances, rate caches, pending Device SMS, Device switches and navigation preferences do not travel. Structured metadata/audits use privacy sanitizers; arbitrary user-authored text is not promised to be automatically detected.
7. **User entry points.** Settings → Data → Encrypted backup supports enrollment, export and restore on mobile and web. Welcome → Restore encrypted backup completes setup and opens the restored Workplace. Plaintext import journeys and ZIP export remain separate; plaintext export captures each Workplace consistently.
8. **Sync foundations.** Schema 35 adds the row-restore receipt and local row index, checkpoint, conflict and pending-commit tables. `buildCommit` detects changed/deleted rows and builds signed proposed commits. Offline backup does not read or update server-sync checkpoints. These stores and builders do not provide an online sync loop. Schema 36 adds the device-local restore-completion JSON column; the encrypted financial row schema remains 35.

## Native implementation

`ExpoKeyCrypto` uses shared C++ with thin Kotlin/Objective-C++/Swift adapters and native vault/file access. Key envelopes use HPKE with X25519/HKDF-SHA256/AES-256-GCM. The core includes key operations, row crypto and codecs, with vendored nlohmann/json and platform/Emscripten zlib. Native bridges return allowlisted error codes. Credential pickers use expiring process-local references. This is ordinary app memory, without an enclave, separate trusted process or complete-memory-erasure guarantee.

The iOS provider uses QuickCrypto's OpenSSL headers and symbol-prefix layout. Installation checks the package version, HPKE header and pinned prefix-header hash. An independent iOS OpenSSL provider remains separate work.

## Verification and remaining gates

The current gzip row format requires runtime verification on native and web. Typechecking and WASM compilation do not establish round-trip or device behavior.

Automated coverage includes hierarchy and record validation, storage failures, recovery, codecs, manifests, backup parsing, row validation, restore retries and publication. Host-compiled C++ and WASM suites exercise the shared engine. Simulator/emulator evidence does not close physical-device gates.

The [2026-10-17 ARM64 host follow-up](./restore-interruption-verification-plan.md#arm64-host-toolchain-follow-up-2026-10-17) records 67 passing host C++ tests using HPKE-enabled OpenSSL 3.6.0, plus successful production Android/iOS Hermes bytecode exports and E2E marker exclusion checks. QEMU executes the project's pinned compiler on this host. Subsequent [Android preparation](./native-device-verification-plan.md#local-preparation-record-2026-10-17) produced normal/E2E Release-derived verification APKs and instrumentation, verified signatures and packaged Hermes bytecode, and passed normal-APK harness exclusion. Android installation/runtime and signed iOS application builds remain pending.

On 2026-10-17, the E2E Release app also built and passed `e2e/specs/backup/encryption-entrypoints.e2e.ts` on both the iOS 26.4.1 simulator and Android API 36 ARM64 emulator (2 scenarios passed per platform). The Android emulator used the disposable verification app ID. This covers the fresh-install restore entry and unfinished enrollment restart only; real picker recovery, durable restore, interruption, vault and physical-device gates remain open. See the [simulator evidence](./native-device-verification-plan.md#simulator-entry-point-smoke-checks-2026-10-17).

Physical iOS/Android checks remain required for key/vault behavior, app lock, real credential and backup file pickers, storage denial/corruption, and interruption/retry. Complete cross-device backup → wipe → restore verification remains a release gate. Large-workplace responsiveness also needs measurement: batch limits do not make the full ZIP/row pipeline streaming, and capture holds the database writer lock during encryption.

## Build-artifact incident

Two earlier Android builds used `SENTRY_DISABLE_AUTO_UPLOAD=1`; the installed integration requires the literal `true`. They uploaded JavaScript/source maps to Sentry project `full-frills-balance / react-native`, release `in.sahilsoni.fullfrillsbalance@1.0.0+1`, distribution 1. Recovery phrases and generated financial fixtures were not part of those artifacts. Bundle IDs `9a64ad56-a282-5ec3-8023-d9c69ee99281` and `9cee3dbf-a88e-5349-aa5b-aceee7d2ca0e` remain pending user-authorized deletion. E2E Release builds now set both upload-disable flags to `true`; no external deletion or backend provisioning occurred.

## Remaining work

1. Complete physical-device, real-file-picker, cross-device and interruption verification for the implemented backup flows; verify the browser file workflow end to end.
2. Finish the sync rollout tasks: pull/apply, compare-and-swap retries, conflict review and unreadable-row handling. Local tables alone do not complete those flows.
3. Phase 2 online identity and transport: bind User UUID to login, Passkeys/WebAuthn, signed Device registration, authorization, backend transport, consent, retention and deletion. No online endpoint or backend exists on this branch.
4. Before concurrent editing/sharing: complete conflict semantics, durable operations/receipts/cursors, tombstone retention and invitations. Review rotation/root replacement separately.

Ordinary local SQLite and plaintext ZIP exports retain their existing storage behavior. Automatic backup, paid tiers and cloud vendor changes remain outside this work.

## Durable restore completion (18 October 2026)

`restoreBackup` verifies/decrypts the archive and publishes records, the manifest receipt and a pending-completion handoff in one batch. `encryptedRestoreCompletion` owns all required post-publication work. Startup observes pending handoffs, waits for app unlock/foreground, confirms database durability, installs missing matching keys, restores preferences, rebuilds balances, merges the encryption session, and invokes feature-owned launch completion. Only then is the handoff cleared durably. Each required step can be repeated after interruption without reimporting financial rows. Temporary recovery-marker cleanup is best effort and does not turn a completed restore into a failure; leftover markers retry on startup, unlock or foreground entry. Clearing the device-only handoff preserves the financial Workplace timestamp.

The launch gate remains closed during uncertain browser persistence, key/session failures and balance rebuild failures. An empty in-memory pending query is insufficient to open the app until the clear is acknowledged. No recovery credential, plaintext DEK, private key or backup archive is persisted in the handoff. The handoff and receipt are device-local and excluded from row encoding and export.

Local verification on 18 October 2026 passed:

- 93 focused app/database tests across 13 suites, including completion-owner/repository/launch-hook regressions, migration, publication, setup routing and browser-persistence acknowledgement.
- 68 native C++ host tests across 7 suites, including gzip backup round trips, key hierarchy/interoperability and interrupted restore completion without reopening the archive.
- 14 Chromium backup/interruption scenarios against a fresh E2E web export. They cover fresh-context recovery, malformed/tampered/wrong-User rejection, setup reloads, collision protection, independent Device approval, and page/worker termination at recovery/publication/session/cleanup/launch boundaries. Published handoffs complete after reopening without selecting files again.

The native test host initially failed compilation because `TestVault.clear()` was defined twice; the duplicate was removed. The browser setup-reload scenario initially failed because seeded financial rows had no persisted IndexedDB chunks before reload. E2E bootstrap now explicitly acknowledges persistence before exposing the fixture; the isolated scenario and the complete browser matrix passed afterward. Temporary diagnostic probes were removed. These are local harness fixes, with no backend or external publishing action.

These results do not establish physical-device vault/file-picker behavior or native process-termination durability. Physical-device gates remain open.
