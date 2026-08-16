# Architecture Refactor Roadmap

Status: Active
Owner: Codex orchestration task
Started: 2026-08-16
Branch policy: small local commits on `main`; subagents use isolated worktrees; completed work is reviewed and squash-merged; never push.

## Objective

Make the application architecture enforce its financial-integrity promises:

- workplace data never crosses workplace boundaries;
- background work cannot outlive or mutate after its workplace runtime ends;
- queues and ingestion flows report truthful completion and are idempotent under concurrency;
- persistence and transaction ownership are explicit;
- WatermelonDB models do not define presentation contracts;
- feature state has one cohesive owner;
- CI enforces the architecture described by the repository.

Behavior preservation is mandatory unless a tracked integrity defect requires a behavior change.

## Execution Rules

1. Integrity work precedes structural UI cleanup.
2. Each commit closes one invariant or prepares one narrowly defined migration.
3. Subagent work must have a disjoint write scope and an explicit acceptance contract.
4. Every subagent branch is reviewed before squash merge.
5. No remote push is permitted.
6. Existing unrelated changes are preserved.
7. Verification is proportional to the changed surface; repeated full-suite runs are avoided.
8. Compatibility layers require an owner and deletion condition.

## Architectural Invariants

### Workplace isolation

- Every query over a workplace-scoped table accepts `workplaceId`.
- SQL and ORM fallback paths enforce the same scope.
- Callers cannot construct an unscoped ledger, SMS, budget, insight, or rebuild query.

### Lifecycle ownership

- Workplace-specific asynchronous work carries a generation or cancellation signal.
- Switching workplaces prevents old work from publishing data or causing mutations.
- Cache eviction disposes subscriptions and timers; deleting a map entry is insufficient.

### Concurrency

- Queue `flush()` means no active or scheduled retry work remains.
- SMS ingestion is single-flight and idempotent per workplace/message.
- Notification and widget synchronization are ordered; stale work cannot win.

### Persistence

- Services express domain intent.
- Repositories and named transaction coordinators own database mechanics.
- Cross-domain mutations have one documented atomicity owner.
- Private WatermelonDB adapter access is isolated behind one infrastructure seam.

### Presentation

- Components consume feature-owned DTOs, not WatermelonDB model instances.
- Screens parse routes, compose controllers, and render views.
- Contexts and view-models own cohesive state machines.

## Work Packages

### WP-0: Guardrails and enforcement

Goal: prevent new entropy while migrations are in flight.

- [x] Add `check:architecture` to the canonical verification and CI path.
- [x] Document the actual read boundary: feature-facing read services are preferred over repositories.
- [x] Close the cross-feature barrel-import loophole or define explicit public contracts.
- [x] Add ratcheted checks for unscoped raw queries, feature model imports, and direct database writes.
- [x] Align README and architecture documentation with enforced rules.

Exit: new violations fail locally and in CI without requiring all historical debt to disappear at once.

### WP-1: Workplace isolation

Goal: eliminate cross-workplace read and mutation paths.

- [x] Scope raw transaction count queries.
- [x] Scope rebuild data queries and ORM fallback paths.
- [x] Scope recurring-pattern/insight acquisition.
- [x] Scope SMS preview, suggestions, ID lookup, and linked-journal lookup.
- [x] Scope budget-scope deletion.
- [x] Audit every query over workplace-scoped tables.
- [x] Add two-workplace regression coverage for balances, rebuilds, insights, SMS, and budgets.
- [x] Close direct cross-workplace export, SMS collision, and large-query paths (WP-1A through WP-1C).
- [x] Scope journal enrichment and recent-suggestion joins in raw and fallback paths (WP-1D/WP-1F).
- [x] Scope every workplace-owned table in transaction metrics, rebuild, pattern, metadata, and account-list joins (WP-1E).
- [x] Scope rebuild and integrity follow-up mutations (WP-1G).
- [x] Scope account-merge source mutations (WP-1H).
- [x] Enforce planned-payment workplace/model agreement (WP-1I).
- [ ] Remove or constrain generic unscoped repository escape hatches (WP-1J).
- [x] Scope journal-save SMS metadata lookup by workplace (WP-1L).
- [ ] Enforce budget model, scope-account, transaction, and journal ownership (WP-1M).
- [ ] Scope account-resolution transaction and account follow-up reads (WP-1N).
- [ ] Scope every owned side of common transaction/journal ORM joins (WP-1O).
- [ ] Add scoped balance-snapshot join and equivalent ORM fallback (WP-1P).
- [ ] Harden remaining account, transaction, and SMS model-writer contracts (WP-1Q).
- [x] Make the integrity null-account scan require a workplace (WP-1R).
- [ ] Repeat the 12-table exit audit with no open findings.

Exit: every scoped persistence operation requires and enforces `workplaceId`.

### WP-2: Workplace runtime lifecycle

Goal: make cancellation and disposal explicit.

- [x] Introduce a workplace generation/cancellation mechanism.
- [ ] Make bootstrap stages generation-aware through completion, including already-started service work.
- [x] Expose an `AbortSignal` from each generation lease and abort the prior lease on replacement.
- [ ] Prevent evicted reactive projections from publishing stale snapshots.
- [ ] Carry cancellation through startup integrity and its rebuild commit boundary.
- [ ] Carry cancellation through planned-payment orchestration and the ledger batch boundary.
- [ ] Carry cancellation through SMS ingestion and its final write boundary.
- [x] Dispose reactive cache subscriptions on eviction.
- [x] Terminate insight timers for inactive workplaces.
- [x] Sequence widget synchronization writes.

Exit: no old-workplace stream, timer, cache, or task survives a workplace switch.

### WP-3: Concurrency integrity

Goal: make completion truthful and repeated operations safe.

- [x] Model rebuild retries as tracked queue state.
- [x] Make rebuild `flush()` await scheduled retries.
- [x] Requeue/reconcile batches after unexpected processing errors.
- [x] Add per-workplace SMS single-flight coordination.
- [x] Recheck SMS processing state in the final write boundary.
- [x] Add SMS auto-post idempotency protection.
- [x] Serialize or generation-order notification scheduling.

Exit: concurrent triggers produce one deterministic final result.

### WP-4: Persistence and transaction ownership

Goal: remove competing write protocols.

- [x] Inventory and classify direct database writes, batches, raw model mutation, and private adapter access.
- [ ] Move service-owned database mechanics into repositories.
- [ ] Define transaction coordinators for journal, account, planned-payment, SMS, and import flows.
- [ ] Isolate raw SQL and private adapter access behind named infrastructure interfaces.
- [x] Document atomicity ownership for cross-domain mutations.

Exit: every mutation has one obvious transaction owner and cannot bypass audit/rebuild obligations.

### WP-5: Presentation boundary

Goal: stop ORM models from acting as UI contracts.

Migration order:

1. accounts;
2. journal;
3. planned payments;
4. budgets;
5. settings/workplaces;
6. dashboard/reports.

- [ ] Define feature-owned DTOs.
- [ ] Map models at read-service/controller boundaries.
- [ ] Remove `src/data/models` imports from presentation code.
- [ ] Relocate pure enums and helpers into domain modules.
- [ ] Remove ORM relation access from hooks and components.

Exit: presentation code uses plain data and does not depend on WatermelonDB identity or relations.

### WP-6: Feature state simplification

Goal: give each state machine a cohesive owner.

- [ ] Split app readiness, lock/session, restart/import, and onboarding state.
- [ ] Split accounts-list data, interaction, and command/modal state.
- [ ] Extract budget and planned-payment form views from route/controller screens.
- [ ] Centralize journal selection and bulk-action state behind neutral contracts.
- [ ] Move import-selection orchestration into settings.
- [ ] Give telemetry and navigation one owner per feature.

Exit: screens orchestrate; view-model contracts are cohesive; cross-feature UI internals are not imported.

### WP-7: Cleanup and final verification

Goal: remove residue and prove the architecture holds.

- [ ] Split responsibility-heavy repositories/services where ownership—not line count—demands it.
- [ ] Delete obsolete façades and compatibility exports after callers migrate.
- [ ] Decide and document the authoritative mobile E2E contract.
- [ ] Typecheck the selected mobile E2E code through a dedicated configuration.
- [ ] Reduce the unsafe-type baseline with named owners for remaining exceptions.
- [ ] Repeat the exhaustive architecture audit and compare metrics.

Exit: documentation, CI, dependency rules, and implementation describe the same architecture.

## Initial Delivery Sequence

1. Roadmap and orchestration foundation.
2. Architecture checks in the canonical CI path.
3. Raw transaction and rebuild workplace scoping.
4. Insight, SMS, and budget workplace scoping.
5. Rebuild queue correctness.
6. Workplace lifecycle and reactive cache disposal.
7. SMS/notification/widget concurrency.
8. Persistence boundary migrations.
9. Feature-by-feature DTO migration.
10. Context and view-model decomposition.

## Progress Ledger

| Date | Work package | Result | Commit |
| --- | --- | --- | --- |
| 2026-08-16 | Roadmap | Execution plan and invariants recorded | `2ed8cb7f` |
| 2026-08-16 | WP-0 | Canonical architecture gate and explicit feature-edge ratchet | `91c755da` |
| 2026-08-16 | WP-1 | Raw rebuild and transaction-count workplace isolation | `2f759d9e` |
| 2026-08-16 | WP-1 | Recurring insight acquisition workplace isolation | `40fed24d` |
| 2026-08-16 | WP-1 | SMS and budget workplace isolation | `b37695c0` |
| 2026-08-16 | WP-0 | Ratchets for raw scope, presentation models, and direct writes | `337946e4` |
| 2026-08-16 | WP-1 | Exhaustive workplace-isolation inventory | `679b5739` |
| 2026-08-16 | WP-2 | Disposable reactive caches and inactive insight timers | `ec8a34d3` |
| 2026-08-16 | WP-2/3 | Bootstrap start gates and ordered widget writes | `54f24099`, `b3b7f003` |
| 2026-08-16 | WP-3 | Tracked rebuild retries, truthful flush, and batch recovery | `c5cb34b9`, `076f2401` |
| 2026-08-16 | WP-1 | SMS device-ID collision isolation | `cb26cd9a` |
| 2026-08-16 | WP-3 | Ordered notification scheduling | `cdf0d91e` |
| 2026-08-16 | WP-3 | Per-workplace SMS single-flight and final-write idempotency | `3dcef98` |
| 2026-08-16 | WP-1 | Scoped export fallback and large transaction chunks | `1564593`, `4f43602` |
| 2026-08-16 | WP-4 | Persistence ownership and atomicity inventory | `ccc40651` |
| 2026-08-16 | WP-1 | Account-merge source mutation isolation | `e87e9063` |
| 2026-08-16 | WP-1 | Raw transaction metrics workplace isolation | `80f6d793` |
| 2026-08-16 | WP-1 | Removed unused unscoped repository escape hatches | `3284437d` |
| 2026-08-16 | WP-1 | Journal enrichment and suggestion isolation; raw-query ratchet at zero | `042a629`, `32462018` |
| 2026-08-16 | WP-1 | Rebuild/integrity mutation isolation | `73d56859` |
| 2026-08-16 | WP-1 | Planned-payment workplace/model agreement | `53874cd2` |
| 2026-08-16 | WP-1 | Journal model-instance writer workplace validation | `faa4a91c` |
| 2026-08-16 | WP-1 | Raw rebuild, recurring-pattern, account-list, and repository-metrics isolation | `3878b5dc`, `926f10dd`, `16bbf6f7`, `5edf606a` |
| 2026-08-16 | WP-1 | SMS rule-history transaction isolation | `adf1378f` |
| 2026-08-16 | WP-2 | Bootstrap lifecycle audit and generation `AbortSignal` foundation | `889dec2f`, `0969745b` |

## Audit Evidence Index

Primary confirmed risks:

- unscoped raw transaction, rebuild, recurring-pattern, SMS, and budget queries;
- long-lived `shareReplay` streams and timers surviving cache eviction;
- bootstrap, notification, and widget work lacking generation ordering;
- rebuild retries not represented in flush completion;
- SMS ingestion lacking single-flight/idempotency;
- direct database and ORM access across multiple service boundaries;
- WatermelonDB models leaking through feature and component contracts;
- architecture checks and documented boundaries diverging from CI enforcement;
- large contexts/view-models owning unrelated state machines.

The detailed evidence remains in the originating Codex architecture-audit task. This roadmap is the durable execution source of truth.
