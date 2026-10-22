# Considered approaches

This is a rationale index for the implementation on this branch. It records alternatives that shaped the current design, not a specification for deferred features. The detailed wire format is in [row-envelope format](./row-envelope-sync.md).

## Independent keys instead of deriving a Device from the User root

**Chosen:** generate independent Device and User key pairs. The Device key opens that Device's encrypted User bundle; the User key opens Workplace DEK envelopes.

**Considered:** derive Device keys from a User root. **Not chosen:** it would make an installation credential a derivative of the identity root. Independent keys keep Device vault storage and User recovery as separate layers; User recovery restores the same User keys, then a replacement Device gets fresh Device keys.

## Separate User recovery from Workplace data recovery

**Chosen:** User recovery restores the same User identity; Workplace recovery decrypts a retained backup and imports its rows as a new local Workplace.

**Considered:** one recovery path that also restored Workplace ownership and authority. **Not chosen:** data recovery must not silently recreate membership, owner keys, or online write authority. The two paths have different credentials, inputs, and security consequences.

## Per-row encryption instead of encrypting the SQLite database or one opaque snapshot

**Chosen:** canonicalize and encrypt each financial row under a Workplace DEK, then sign a manifest that covers the complete backup state.

**Considered:** encrypt the database file in place or keep a single opaque snapshot as the encrypted format. **Not chosen:** database-file encryption does not define a portable backup boundary; an opaque snapshot does not provide the row-level format needed for incremental transfer and conflict checks. Those online capabilities remain deferred, but the current backup uses the same independently verifiable row format.

## Native/shared crypto instead of JavaScript-owned key operations

**Chosen:** implement key and row operations in shared C++, with native platform adapters and a WebAssembly worker build.

**Considered:** perform private-key operations and HPKE directly in application JavaScript. **Not chosen:** the design keeps private-key bytes and readable DEKs out of the JS bridge on mobile and reuses one protocol implementation across native and web. The web threat boundary is weaker: same-origin script compromise can access plaintext while the app is active.

## Gzip instead of the dictionary/zstd experiment

**Chosen:** independently gzip each row and authenticate an explicit compression selector in the row header.

**Considered:** zstd with trained dictionaries and generated dictionary assets. **Not chosen:** the final implementation uses platform/Emscripten zlib already available to each target and needs no dictionary training or generated compression assets. This is a portability and maintenance choice; the branch does not claim gzip is faster or smaller than zstd.

## Local backup before online transport

**Chosen:** complete and verify offline backup/recovery first. Local checkpoint and commit-builder code is groundwork; it does not imply a running sync client or backend.

**Considered:** enable upload or hosted recovery before defining authorization, explicit consent, identity binding, and rollback verification. **Deferred:** the branch has no backend, and encryption alone cannot authenticate an uploader or guarantee that a server returns the latest valid state. Supabase Auth is the planned identity direction, not an implemented dependency.

## Recovery phrase separate from account authentication

**Chosen:** use an independently saved recovery credential to reconstruct the recovery key that opens a separately retained encrypted bundle.

**Considered:** treat a login passkey as the decryption key or as the only recovery route. **Not chosen:** account authentication alone does not decrypt the User bundle; passkey PRF wrapping has not been selected or verified across the target platforms. Login and cryptographic recovery remain separate responsibilities.

## Limits of this record

These decisions do not settle deferred sync, sharing, invitations, roles, key replacement, or rotation protocols. Those require implementation-specific design and security review before they are treated as product behavior.
