# Private backup and synchronization

Start with [the overview](./spec.md). There is one V1 key hierarchy: Device → User → Workplace. Local setup and recovery are implemented; online code is deferred to a later PR.

| Document                                                    | Purpose                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [Overview](./spec.md)                                       | Agreed scope, future online boundaries, audit-history constraints and release order. |
| [Key management](./key-management.md)                       | Authoritative key hierarchy, identity pins, recovery and future security protocols.  |
| [Implementation scope and remaining work](./preparation.md) | Local implementation, verification commands and open release gates.                  |

The clean native vault and key-reference build has Android AVD/iOS simulator proof, including Android-to-iOS recovery. Host regressions, native builds and remaining gates are tracked in the implementation scope document. Physical-device, real-file-picker and complete interruption gates remain open; simulator interoperability does not close physical recovery gates. Dated review reports, screenshots and per-run result files are omitted; implementation and design remain the reading path.
