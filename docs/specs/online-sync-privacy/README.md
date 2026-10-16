# Private backup and synchronization

Start with [the overview](./spec.md). There is one key hierarchy: Device → User → Workplace. That hierarchy is implemented as native and service APIs on this branch. Encrypted backup and sync use the [V2 row-envelope design](./row-envelope-sync.md). V1 whole-snapshot backup never shipped and was removed. Online account enrollment remains unavailable.

| Document | Purpose |
| --- | --- |
| [Overview](./spec.md) | Agreed scope, online boundaries, release order. |
| [Key management](./key-management.md) | Key hierarchy, identity pins, recovery routes, future sharing and rotation. |
| [Row-envelope sync](./row-envelope-sync.md) | V2 payload format, manifests, sync semantics, offline backup ZIP, rollout checklist. |
| [Implementation scope and remaining work](./preparation.md) | What survived the V1 snapshot removal, verification gates, ordered work. |
| [Web crypto WASM rollout](../../plans/web-crypto-wasm-rollout-plan.md) | WebAssembly engine, worker vault, and web backup/restore (Passkeys deferred to Phase 2). |

Native key and HPKE interoperability have Android emulator and iOS simulator proof. Physical-device, real-file-picker and complete interruption gates remain open; simulator results do not close them. Dated review reports and per-run artifacts are omitted; these documents are the reading path.
