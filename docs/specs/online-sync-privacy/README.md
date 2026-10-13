# Private backup and synchronization

Start with [the overview](./spec.md). There is one V1 key hierarchy: Device → User → Workplace. Local setup and recovery are implemented; cloud backup and synchronization remain unavailable.

| Document                                                                       | Purpose                                                                               |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| [Overview](./spec.md)                                                          | Agreed scope, data boundaries and release order.                                      |
| [Key management](./key-management.md)                                          | Authoritative key hierarchy, identity pins, recovery and future security protocols.   |
| [Implementation scope and remaining work](./preparation.md)                    | What exists locally and what must pass before online release.                         |
| [Current verification](../../reviews/human-key-setup-2026-10-13.md)            | Latest automated/native results, their limits and unresolved build-artifact incident. |
| [Audit-log reuse assessment](../../reviews/audit-log-sync-reuse-2026-10-12.md) | Separate analysis of accounting history and future conflict handling.                 |

Superseded implementation reports and simulator screenshots have been removed. Current native results are retained in one [verification summary](../../reviews/key-management-verification-2026-10-13.json). Earlier simulator runs do not validate the present hierarchy; physical-device, cross-platform, real-file-picker and complete interruption gates remain open.
