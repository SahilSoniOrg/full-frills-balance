# Private backup and synchronization

Start with [the overview](./spec.md). There is one key hierarchy: Device → User → Workplace. Local encrypted backup/recovery is implemented on mobile and web using the shared native/WASM engine and the [V2 row-envelope design](./row-envelope-sync.md). Release verification gates remain open. V1 whole-snapshot backup never shipped and was removed. Online account enrollment, transport and the sync loop remain unfinished.

| Document | Purpose |
| --- | --- |
| [Overview](./spec.md) | Agreed scope, online boundaries, release order. |
| [Key management](./key-management.md) | Key hierarchy, identity pins, recovery routes, future sharing and rotation. |
| [Row-envelope sync](./row-envelope-sync.md) | V2 payload format, manifests, sync semantics, offline backup ZIP, rollout checklist. |
| [Implementation scope and remaining work](./preparation.md) | Implemented backup/recovery, verification gates, remaining sync work. |
| [Crypto boundary refactor plan](./crypto-boundary-plan.md) | Implemented separation of generic payload crypto from the financial profile, compatibility evidence and remaining platform gates. |
| [Recovery coordination cleanup plan](./recovery-coordination-plan.md) | Implemented extraction of durable recovery ID/session/checkpoint coordination from the screen hook. |
| [Web crypto WASM rollout](../../plans/web-crypto-wasm-rollout-plan.md) | WebAssembly engine, worker vault, and web backup/restore (Passkeys deferred to Phase 2). |

Native key and HPKE interoperability have Android emulator and iOS simulator proof. Physical-device, real-file-picker and complete interruption gates remain open; simulator results do not close them. Dated review reports and per-run artifacts are omitted; these documents are the reading path.
