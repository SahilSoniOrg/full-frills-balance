# Key management

Status: the key hierarchy and local encrypted backup/recovery are implemented. Physical-device release checks remain open. Online identity, authorization, synchronization, sharing, and key rotation are not implemented; see [implementation status](./preparation.md). For why this hierarchy and its recovery boundaries were selected, see [considered approaches](./decisions.md).

## Key hierarchy

```text
Device private key
  opens this Device's encrypted User-key bundle
    User private key opens the User-addressed Workplace DEK envelope
      Workplace DEK decrypts that Workplace's financial rows
```

| Material | Purpose | Persistent form |
| --- | --- | --- |
| Device X25519 pair | Opens the local encrypted User bundle. | Private key in the platform vault; public key in local metadata. |
| User X25519 pair | Opens Workplace DEK envelopes; receives User recovery. | Public key in a versioned, pinned User identity. Private key inside Device-encrypted and User-recovery bundles. |
| User Ed25519 pair | Signs backup manifests. | Public key in the pinned identity; private key inside the encrypted User bundles. |
| Workplace DEK | Encrypts one Workplace's financial rows. | Random 256-bit key. Persist only as encrypted User-member and Workplace-recovery envelopes. |
| User recovery seed/key pair | Opens the User-recovery bundle. | Seed in a user-held credential file; recovery private key reconstructed on the recovering Device. |
| Workplace recovery seed/key pair | Opens the Workplace recovery envelope. | Seed in a separate user-held credential file; recovery private key reconstructed for local recovery. |

The User and Device key pairs are generated independently. Recovery pairs are reconstructed from their own high-entropy seeds using the native HPKE implementation; no Device key derives from the User root. The versioned User identity pins the User UUID and public encryption/signing keys. The recovery credential binds its purpose and identity and includes a checksum. It is not an account password or system passkey.

The envelope suite is HPKE base mode with X25519, HKDF-SHA256, and AES-256-GCM. HPKE context binds purpose and the relevant identity/key scope. HPKE encrypts for a recipient but does not authenticate the sender. Backup authenticity is checked separately using the pinned User identity and signed manifest.

## Enrollment and normal access

For a new local User, setup creates the User encryption and signing pairs, pins the versioned public identity, creates the User recovery pair, and generates an independent Device pair. The Device private key is saved in the native vault; the local User bundle is encrypted to that Device. Setup requires exporting and verifying the User recovery credential before enrollment completes.

For each Workplace, setup creates or adopts one random DEK and stores envelopes for the User and the separate Workplace recovery key. It asks the user to export and verify the Workplace recovery credential. Financial rows are encrypted for backup; the SQLite database itself is not encrypted in place.

Normal access proceeds as follows:

1. The existing app-lock policy authorizes key use.
2. Native code reads the Device private key from the Device-scoped vault.
3. Native code opens the local encrypted User bundle.
4. Native code opens the selected Workplace's User-addressed DEK envelope.
5. Native code uses the DEK for the requested crypto operation and returns the result, not the key.

The service layer checks app-lock state before and after awaited operations. The native module owns private-key operations; JavaScript uses opaque references and receives ciphertext or operation results, not private-key bytes or plaintext DEKs. Readable keys exist in native memory while operations run and are cleared best-effort. There is no persistent plaintext key cache. This is not a hardware enclave or separate trusted process; a compromised app or OS can access secrets and plaintext while in use.

### Platform storage

- **iOS:** Device private key in a dedicated Keychain service with when-unlocked, this-device-only accessibility.
- **Android:** a dedicated Android Keystore wrapping key protects the Device private key in app preferences excluded from backup and device transfer. Unlock checks account for Android-version-specific Keystore behavior.
- **Web:** a non-extractable Web Crypto key wraps the Device key in IndexedDB; crypto runs in a dedicated worker. Same-origin script compromise can access plaintext while the app is running. Clearing browser storage removes Device access.

No fresh biometric or OS-authentication prompt is required for every key operation. When app lock is disabled, device unlock is the normal access boundary while the app is open. The app-lock signal is not an independent defense against a compromised application caller.

Credential files are selected and exported through native document pickers. JavaScript receives an expiring native handle or a save result, not the secret or its file URI. Keep User and Workplace credentials separate from the encrypted User-recovery bundle and backup ZIP they open.

## Recovery flows

### Recover the same User on a replacement Device

Required inputs: User UUID, saved User recovery credential, and matching encrypted User-recovery package. The client reconstructs the recovery key locally, opens the package, verifies the full versioned User identity pin, and verifies possession of the recovered private keys. It then creates fresh Device keys and saves the recovered User bundle encrypted to the new Device.

This restores the same User encryption/signing identity. It does not replace the identity, change Workplace membership, register an online Device, or authorize server writes. A holder of the User recovery material gains that User's normal key access; the credential is not limited to one Workplace.

### Recover Workplace data as a new local copy

Required inputs: separately saved Workplace recovery credential and retained encrypted backup ZIP. The client verifies the Workplace DEK pin, signed manifest, and row integrity; decrypts and validates the rows; then imports them as a new local Workplace. Import remaps record identities and internal references as required and creates fresh local Workplace keys.

This does not restore the old Workplace ID, membership, ownership, or online authority. The recovery credential alone cannot recreate missing ciphertext or establish that a valid archive is the newest backup. A valid older backup can still be recovered as a data copy.

After publication, a device-local completion handoff resumes key installation, settings, balance rebuilding, and setup completion after interruption. It contains no recovery secret, private key, plaintext DEK, or archive. See [offline backup and restore](./row-envelope-sync.md#local-backup-file) and the [interruption verification plan](./restore-interruption-verification-plan.md).

## Threat model and limits

Assume a trusted installed app and operating system while keys and plaintext are in use, and correctly implemented cryptographic primitives.

| Event | Protection | Limit |
| --- | --- | --- |
| Storage operator sees backup files | Financial row contents are encrypted; signatures and hashes detect unauthorized changes. | Metadata, sizes, timing, and availability remain visible. A signature does not prove a backup is newest. |
| Ciphertext or envelope is substituted | Identity pins, scope-bound envelopes, and signed manifests reject mismatched identities or altered rows. | HPKE alone does not authenticate the sender. |
| Device is lost or stolen while locked | Platform vault and app-lock policy protect persisted key access. | An unlocked or compromised approved Device exposes its User keys, DEKs, and accessible plaintext. Fresh OS authentication is not required per operation. |
| User recovery secret and package are stolen | None for that User identity. | The attacker can recover the User keys and open the User's Workplace envelopes. |
| Workplace recovery secret and backup are stolen | None for data in that backup. | The attacker can recover its DEK and contents, but not the User identity or online write authority. |
| All Devices and recovery routes are lost | None. | There is no server escrow or email-only decryption path; the data is unrecoverable. |

Removing access cannot revoke copied keys, ciphertext, or plaintext. Excluding a compromised User root from future data requires User-key replacement and rotation of affected Workplace DEKs; neither is implemented. Online Device registration, authenticated envelope delivery, sharing, hosted recovery, and rotation need separately reviewed authorization protocols.

## Implementation map

- `src/services/backup/localKeyHierarchy.ts`: User/Device/Workplace lifecycle and recovery coordination.
- `src/services/backup/encryptionSetup.ts`: setup validation and enrollment stages.
- `modules/expo-key-crypto/`: shared native crypto, platform vaults, credential pickers, and WebAssembly implementation.
- `src/services/sync/`: row format, signed manifests, backup archive, validation, restore publication, and local sync foundations.

The row encoding, encryption envelope, manifest, ZIP structure, and restore ordering are specified in [row-envelope format](./row-envelope-sync.md). Current release gates are in [implementation status](./preparation.md).
