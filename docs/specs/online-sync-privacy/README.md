# Private backup and synchronization

Start with [the overview](./spec.md). There is one key hierarchy: Device → User → Workplace. Local encrypted backup/recovery is implemented on mobile and web using the shared native/WASM engine and the [row-envelope design](./row-envelope-sync.md). Rows use format version 1 with explicit gzip compression. Release verification gates remain open. Online account enrollment, transport and the sync loop remain unfinished.

| Document | Purpose |
| --- | --- |
| [Overview](./spec.md) | Agreed scope, online boundaries, release order. |
| [Key management](./key-management.md) | Implemented key hierarchy, identity pins, recovery routes, and security limits. |
| [Considered approaches](./decisions.md) | Selected designs and why alternatives were not used. |
| [Row-envelope format](./row-envelope-sync.md) | Row payload format, manifests, offline backup ZIP, and the boundary between implemented and deferred sync. |
| [Implementation scope and remaining work](./preparation.md) | Implemented backup/recovery, verification gates, remaining sync work. |
| [Restore interruption verification plan](./restore-interruption-verification-plan.md) | Durable restore behavior, interruption scenarios, and verification evidence. |
| [Native device verification plan](./native-device-verification-plan.md) | Android host/build preparation completed; physical Android/iOS picker, vault and process-termination gates remain open. |
| [Native host verification runbook](./native-host-verification-runbook.md) | Code-change inventory, host setup, repeatable build/check commands, failures and evidence. |
| [Web crypto build](../../../modules/expo-key-crypto/web/README.md) | WebAssembly toolchain, build artifacts, worker vault and web asset staging. |

Native key and HPKE interoperability have Android emulator and iOS simulator proof. Physical-device, real-file-picker and complete interruption gates remain open; simulator results do not close them. Dated review reports and per-run artifacts are omitted; these documents are the reading path.
