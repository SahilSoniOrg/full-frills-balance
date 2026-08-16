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
- [ ] Add ratcheted checks for unscoped raw queries, feature model imports, and direct database writes.
- [x] Align README and architecture documentation with enforced rules.

Exit: new violations fail locally and in CI without requiring all historical debt to disappear at once.

### WP-1: Workplace isolation

Goal: eliminate cross-workplace read and mutation paths.

- [x] Scope raw transaction count queries.
- [x] Scope rebuild data queries and ORM fallback paths.
- [x] Scope recurring-pattern/insight acquisition.
- [ ] Scope SMS preview, suggestions, ID lookup, and linked-journal lookup.
- [ ] Scope budget-scope deletion.
- [ ] Audit every query over workplace-scoped tables.
- [ ] Add two-workplace regression coverage for balances, rebuilds, insights, SMS, and budgets.

Exit: every scoped persistence operation requires and enforces `workplaceId`.

### WP-2: Workplace runtime lifecycle

Goal: make cancellation and disposal explicit.

- [ ] Introduce a workplace generation/cancellation mechanism.
- [ ] Make bootstrap stages generation-aware.
- [ ] Dispose reactive cache subscriptions on eviction.
- [ ] Terminate insight timers for inactive workplaces.
- [ ] Sequence widget synchronization writes.

Exit: no old-workplace stream, timer, cache, or task survives a workplace switch.

### WP-3: Concurrency integrity

Goal: make completion truthful and repeated operations safe.

- [ ] Model rebuild retries as tracked queue state.
- [ ] Make rebuild `flush()` await scheduled retries.
- [ ] Requeue/reconcile batches after unexpected processing errors.
- [ ] Add per-workplace SMS single-flight coordination.
- [ ] Recheck SMS processing state in the final write boundary.
- [ ] Add SMS auto-post idempotency protection.
- [ ] Serialize or generation-order notification scheduling.

Exit: concurrent triggers produce one deterministic final result.

### WP-4: Persistence and transaction ownership

Goal: remove competing write protocols.

- [ ] Inventory and classify direct database writes, batches, raw model mutation, and private adapter access.
- [ ] Move service-owned database mechanics into repositories.
- [ ] Define transaction coordinators for journal, account, planned-payment, SMS, and import flows.
- [ ] Isolate raw SQL and private adapter access behind named infrastructure interfaces.
- [ ] Document atomicity ownership for cross-domain mutations.

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
