# Private backup and synchronization

Start with [the overview](./spec.md). There is one V1 key hierarchy: Device → User → Workplace. Local setup and recovery are implemented; online code is deferred to a later PR.

| Document                                                    | Purpose                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [Overview](./spec.md)                                       | Agreed scope, future online boundaries, audit-history constraints and release order.        |
| [Key management](./key-management.md)                       | Authoritative key hierarchy, identity pins, recovery and future security protocols.         |
| [Implementation scope and remaining work](./preparation.md) | Local implementation, concise verification results, open gates and build-artifact incident. |

Physical-device, cross-platform, real-file-picker and complete interruption gates remain open. Earlier simulator runs do not validate the present hierarchy. Dated review reports, screenshots and per-run result files are omitted; implementation and design remain the reading path.
