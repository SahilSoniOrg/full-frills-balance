# Specialist pass reconciliation

The three delegated passes were read and reviewed by the orchestrator. Their source memos are preserved at:

- [`docs/audits/ui-performance-memo-2026-08-25.md`](../docs/audits/ui-performance-memo-2026-08-25.md)
- persistence/reactivity memo: captured in `hypotheses.csv`, `report.md`, and the source paths below
- compute/native/lifecycle memo: captured in `hypotheses.csv`, `report.md`, and the source paths below

## Persistence/reactivity

The shared aggregate stream combines workplace accounts, journal metadata, active transaction count, and exchange rates, then performs raw metrics mapping, precision lookup, hierarchy aggregation, wealth conversion, and synchronous snapshot persistence. It fans into dashboard, accounts, and account-detail consumers. This is E2 structural risk; duration, rows, emissions, and React participation remain unknown.

The same pass established E2 memory growth in import preparation and export representation retention. Import chunking limits database batch size after all prepared operations exist. Export retains fetched tables, transformed arrays, full JSON, ZIP output, and Base64. These are the strongest deterministic static-risk candidates.

Positive controls: debounced/distinct streams, explicit replay disposal, workplace scoping, generation leases, queue coalescing, and bounded retries. They prevent generic leak claims.

## React/UI

The UI pass identified four E2 static risks: uncapped bulk-entry rows in `ScrollView`, bar-chart `setState` on every 16 ms scroll event with full SVG mapping, `runOnJS` for every account-tree gesture update, and broad eager startup/font/module evaluation. It found no evidence to promote generic lists, inline callbacks, or missing memoization into findings.

## Compute/native/lifecycle

The compute/native pass identified E2 static risks in Safe-to-Spend simulation (`O(D × A)` map snapshots plus budget/recurrence cardinality), delayed stabilization concurrency, complete export/import representation retention, large opt-in LiteRT models and up to three inference passes, report range loading/conversion, SMS full-body/concurrent analysis, sequential rebuild contention, and widget/native model lifecycle boundaries.

Positive controls: cache invalidation, single-flight SMS, debounced widget sync, cancellable bootstrap leases, explicit AI dispose, and bounded rebuild queue state. Native claims remain blocked without device traces.

## Orchestrator review

The export/import memory risk is merged into one root cause (`H-007`/`H-015`) because one intervention and verification protocol can address representation peak. Startup stabilization and eager module evaluation remain separate: one is post-mount contention, the other is pre-first-route evaluation. Safe-to-Spend recomputation is separate from the shared balance stream because the simulator and budget/recurrence ownership differ. No static UI risk is promoted to a measured finding.
