# Private backup and synchronization

This branch implements local encrypted backup and recovery on mobile and web. Online enrollment, transport, multi-device synchronization, and sharing are not implemented. Physical-device recovery and full cross-device release verification remain open; see [implementation status](./preparation.md).

## Current behavior

- Independent Device, User, and Workplace keys form an envelope chain. Only encrypted User bundles and Workplace DEK envelopes persist outside the native Device vault.
- Offline backups contain independently encrypted financial rows and a signed manifest. The User recovery credential remains separate from the archive.
- User recovery restores the same User identity on a replacement Device. Workplace recovery imports verified financial data as a new local Workplace; it does not restore old ownership or online authority.
- Restore validates the archive and financial data before atomic publication. A durable local handoff resumes key installation, settings, balance rebuilding, and setup completion after interruption.
- Offline backups are complete snapshots. Local row indexes and signed commit construction are sync foundations only; no server checkpoints are advanced and no network sync occurs.

## Security and privacy boundaries

- Mobile private-key operations run in the native crypto module. The web implementation uses the shared crypto core in a worker and a non-extractable IndexedDB wrapping key; compromised same-origin scripts can access plaintext while the app is running.
- HPKE envelopes encrypt to a recipient but do not authenticate the sender. Backup authenticity depends on the pinned User identity and signed manifest.
- Only the documented financial source tables and audit history travel. Derived balances and device-specific state do not. See [row-envelope format](./row-envelope-sync.md).
- Recovery secrets are not sent to a service. Losing both the recovery credential and the encrypted material it opens makes recovery impossible.

## Deferred work

Online identity, upload consent, transport, checkpoint exchange, pull/apply, conflict review, sharing, and key rotation are not implemented. Supabase Auth is the planned identity direction; no backend project, schema, or integration exists. See [considered approaches](./decisions.md) for why related alternatives were not selected.

## Documentation map

- [Key management](./key-management.md): implemented key hierarchy, storage, recovery, and threat model.
- [Row-envelope format](./row-envelope-sync.md): wire format, manifest, offline backup ZIP, and sync boundary.
- [Implementation status](./preparation.md): shipped scope and release gates.
- [Decision record](./decisions.md): selected approaches and rejected alternatives.
- [Verification plans and runbooks](./README.md): evidence and repeatable checks.
