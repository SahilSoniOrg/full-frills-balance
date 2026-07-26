# Architecture Entropy Audit — 2026-07-27

## Remediation status (updated 2026-07-27)

Tracked in `ARCHITECTURE_ENTROPY_REMEDIATION_PROGRESS.md`. Finding-level status:

| Finding | Status | Notes |
| --- | --- | --- |
| P0 — single owner for planned-payment commands | **Resolved** | Commands own create/update/delete/schedule; hooks build inputs and call the command interface. |
| P0 — stop preserving god-repository APIs (`JournalRepository`) | **Resolved for journal** | 39-method façade deleted; callers use `journal*Module` intent modules; CI guards re-appearance. `AccountRepository`/`TransactionRepository` intent inventory (commit 22) still open. |
| P1 — restore domain→UI dependency direction | **Resolved** | Service-owned timeline DTOs + feature adapters; service→UI import lint in place. The `transactionCardPresentation`/`transactionAccountBadges` UI-coupled modules are gone. |
| P1 — narrow Safe-to-Spend responsibilities | **Substantially done** | Input acquisition, projection, and snapshot writer split behind the unchanged public handle; transitional-cleanup (commit 36) open. |
| P1 — treat imported data as untrusted boundary | **In progress** | `CanonicalImport` landed for the native plugin; Ivy/Cashew, validation seam, and typed persistence (commits 26–30) open. |
| P2 — collapse trivial import facades / explicit workflow | **Partial** | `ImportRunner` deleted; named-phase `ImportRun` state (commit 30) open. |
| P2 — split account lifecycle by use case | **Substantially done** | `CreateAccount`, `UpdateAccountHierarchy`/reorder, `MergeAccounts`, `AdjustAccountBalance` are command modules sharing `accountRules`. `AccountService` is now a thin delegator (full façade deletion, commit 42, open). |
| P2 — reduce report/view-model surface around read contracts | **Partial** | Chart-neutral `ReportSnapshot` contract extracted; charts/feature hooks consume it. `ReportService` method consolidation and view-model extraction (44–47) open. |

## Verdict

The codebase has a strong accounting core and several genuinely deep modules: the ledger write path, balance calculation, import parsers, transaction-ingestion pipeline, and simulation engines all hide substantial complexity behind useful boundaries.

The architecture is nevertheless **accumulating entropy at its application boundaries**. The principal risk is not that the business logic is too abstract; it is that ownership is becoming diffuse again:

- feature hooks directly perform domain writes;
- repository façades retain broad, catch-all public APIs even after their internals were split;
- services expose or depend on UI contracts;
- a few read-model and workflow coordinators are taking on more unrelated responsibilities with each feature.

If this direction continues, new work will be implemented by adding another method to a repository or another branch to a view model. That makes the system progressively harder to change safely, despite the otherwise good domain core.

This is a full-repository structural audit, not a review of the current diff. It examined source layout, dependency direction, high-churn files from the last 120 commits, module sizes, type-boundary signals, the core accounting/simulation/import paths, feature view models, and the project architecture documents.

## What is expanding

| Expanding surface | Evidence | Why it matters |
| --- | --- | --- |
| Repository gateways | `JournalRepository` exposes 39 methods across observe, planned payments, persistence, metadata, SMS lookup, reversal, and enrichment; `AccountRepository` exposes 26 methods and `TransactionRepository` 27. | These names are becoming the default place to put unrelated data behaviour. Internal query modules exist, but the broad façade keeps the old dumping-ground interface alive. |
| Feature-owned commands | 24 production feature files import repositories directly. Planned-payment form/detail hooks directly create, update, and delete records while also selectively invoke `PlannedPaymentService`. | Lifecycle rules no longer have one owner. A future caller can persist a valid-looking payment without triggering the scheduling/rebuild behaviour that another UI path knows to invoke. |
| Coordinator/read-model responsibility | `SafeToSpendReadModel` owns cache lifecycle, preferences, six reactive inputs, raw queries, FX prefetching, balance reads, simulation invocation, projection assembly, error fallback, tracing, and snapshot persistence. `ImportService` coordinates nine phases from parsing through preferences activation. | These are legitimate orchestrators, but they are now the natural landing zone for every adjacent concern. Their complexity grows multiplicatively because each concern interacts with the rest. |
| View-model orchestration | `useAccountDetailsViewModel` (497 LOC), `useJournalEditor` (496), `useSimpleJournalEditor` (453), `useSmsRuleFormViewModel` (444), and `useAccountFormViewModel` (413) mix local state, navigation, mapping, persistence coordination, and domain policy. | These modules are already expensive to modify. They encourage duplicated validation and workflow logic because UI concerns and domain concerns share the same function. |
| UI/domain coupling | Four service modules import UI types from `components` or `hooks`: `transactionCardPresentation`, `transactionAccountBadges`, `ledgerEnrichedDisplay`, and `journalEnrichedObserver`. | Dependency direction is inverted. A card prop or pagination type can now force changes in domain/read services, so shared UI is no longer freely replaceable. |
| Weak external-data boundary | Production code contains 292 `any`, 91 `unknown`, and 925 explicit casts. `ImportRepository` alone contains 40 `any`/`unknown` occurrences. | Imported and persisted data cross a high-integrity accounting boundary. Unstructured shapes and casts defer validation mistakes to later balance/integrity flows. |
| Architecture documentation | The existing `docs/codebase-design/AUDIT.md` records several now-resolved Safe-to-Spend issues as active (for example, NotificationService ownership), while `docs/TEST_COVERAGE.md` still assigns Safe-to-Spend calculation to NotificationService. | An audit that is not retired or maintained becomes architectural misinformation and increases the chance of restoring deleted abstractions. |

## Findings

### P0 — Re-establish a single owner for planned-payment commands

`usePlannedPaymentForm` directly reads and writes `PlannedPaymentRepository`, computes recurrence locally, and calls `PlannedPaymentService.processDuePayments` only on creation. `usePlannedPaymentDetails` directly deletes from the same repository, while status/post/skip operations go through the service.

This is a boundary failure: UI hooks own parts of the domain lifecycle and the service owns the rest. It invites lifecycle drift as more command paths are added.

**Code-judo move:** make `PlannedPaymentService` (or a narrowly named `PlannedPaymentCommands`) the only production command API: `create`, `updateSchedule`, `delete`, `toggleStatus`, `postOccurrence`, and `skipOccurrence`. It should own recurrence calculation, journal generation, rebuild/invalidation, and audit/analytics decisions. Hooks should only build an input DTO and call one command. Keep repository imports in hooks for reactive reads until a read-model boundary earns its keep.

This deletes a category of “did this caller remember the downstream lifecycle?” branching rather than merely moving it.

### P0 — Stop preserving god-repository APIs after splitting their internals

`JournalRepository` already delegates to intent-specific modules (`journalObserveQueries`, `journalPlannedQueries`, `SmsJournalQueries`, `journalWriteRepository`, and more). That is good internal decomposition, but its 39-method façade reconstitutes the same broad ownership boundary for every caller.

The façade is becoming an architectural dumping ground: journal persistence, planned-payment scheduling queries, SMS deduplication, metadata patches, reversals, and presentation enrichment all remain one public dependency. `AccountRepository` and `TransactionRepository` show the same trajectory.

**Code-judo move:** expose intent modules at the domain call sites instead of adding to general repositories:

- `JournalWriteStore` for atomic journal persistence;
- `JournalTimeline` for observe/list/read queries;
- `PlannedJournalStore` for scheduled journals;
- `SmsJournalLookup` for ingestion deduplication;
- `JournalMetadataStore` for metadata.

Keep the current Watermelon collections private to those adapters. Delete the compatibility façade incrementally as consumers migrate; do not add a replacement mega-interface. The objective is fewer things that a caller can accidentally depend on, not more folders.

### P1 — Restore the domain-to-UI dependency direction

`src/services/accounting/transactionCardPresentation.ts` imports `TransactionCardProps` and `IconName` from UI components. `transactionAccountBadges.ts` imports `TransactionBadge` from `TransactionCard`; `ledgerEnrichedDisplay.ts` and `journalEnrichedObserver.ts` import pagination/range types from hooks.

This makes services answer “how this particular component renders” instead of “what an accounting timeline entry is.” It will turn a card redesign or pagination-hook change into a service-layer change.

**Remedy:** define service-owned DTOs (`JournalTimelineItem`, `AccountBadge`, `TimelineRange`) under a domain/read-model module. Make UI adapters map those DTOs to component props at the feature boundary. `journalUiUtils` is already a useful migration point for the journal feature; move the component-specific mapping there and remove component imports from services.

### P1 — Keep Safe-to-Spend deep, but narrow its responsibility set

`SafeToSpendReadModel` is correctly the canonical Safe-to-Spend entry point and its public `forWorkplace(id).watch()/watchHeadline()/preWarm()` handle is good. Do not split the simulation engines or reintroduce a notification façade.

Its implementation is expanding into a reactive application coordinator, however: it owns preference observation, database source selection, raw historical deltas, currency warming, balance reads, simulation invocation, projection assembly, cache policy, tracing, error delivery, and durable snapshot writing.

**Remedy:** preserve the one public handle, but separate two private collaborators with explicit contracts:

1. `SafeToSpendInputs.observe(workplaceId, settings)` produces a typed, fully fetched simulation input plus history inputs.
2. `SafeToSpendProjection.run(inputs)` invokes the simulation and produces the dashboard projection.

Snapshot persistence belongs in a small subscriber/writer invoked after projection, not inside the calculation stream. This keeps the owner canonical while preventing cache, I/O, calculation, and persistence policies from co-evolving in a single 369-line pipeline.

### P1 — Treat imported data as an untrusted boundary, not a permissive batch shape

Import is correctly staged, validated, backed up, integrity-checked, then swapped. That is an excellent durability workflow. But `ImportRepository` is an 864-line batch persistence module with 40 production `any`/`unknown` occurrences; `ImportService` also reaches directly into the Watermelon workplace collection as `any`.

The current design has validation and coercion distributed across plugins, `validateImportedData`, and persistence. As formats and versions grow, that will make corruption handling harder to reason about.

**Remedy:** make every plugin return a versioned, discriminated `CanonicalImport` DTO. Validate and normalize external data exactly once at the plugin-to-canonical boundary. Let batch persistence accept only canonical types; remove permissive strings/unions and `any` from the write path. This is not a generic abstraction: it makes the accounting import boundary explicit and testable.

### P2 — Collapse trivial orchestration facades and make the real workflow explicit

`ImportRunner.runImport` is a one-method pass-through to `ImportService.executeImport`; it adds no policy or substitution seam. Delete it and call `ImportService` directly.

`ImportService` itself has a real job, but it currently represents progress using locally declared percentage ranges and coordinates parse, backup, staging, native-currency initialization, persistence, integrity, swap, rate synchronization, snapshot rebuild, preference restoration, and activation in one method.

After the pass-through is deleted, model import as a small ordered workflow of named phases with one `ImportRun` state/progress object. Keep it as an application workflow, not a reusable generic pipeline. This gives failures and compensating cleanup a single vocabulary without turning import into a framework.

### P2 — Split account lifecycle by use case before `AccountService` becomes the next gateway

`AccountService` is 726 lines and coordinates account hierarchy constraints, creation, audit logging, balance initialization, merge/repair behaviour, budgets, planned payments, rules, rebuild queue, currency, and analytics. It imports a large portion of the application layer.

It has real domain depth, but not one coherent change axis. Account creation, hierarchy management, merge, and balance adjustment have different invariants and downstream effects.

**Remedy:** split into command-oriented use cases with a shared, small account rule module: `CreateAccount`, `UpdateAccountHierarchy`, `MergeAccounts`, and `AdjustOpeningBalance`. Each use case should own its transaction and side effects. Do not extract a generic "account workflow" base class.

### P2 — Reduce report and view-model surface area around stable read contracts

`ReportService` provides ten public report methods plus reactive mirrors, while presentation components import its chart types directly. The report calculators are well-localized; the expansion risk is a service API that grows one endpoint per chart.

Prefer a bounded `ReportSnapshot` read model for the dashboard/report screen and specialized query modules only where a screen truly needs independently refreshed data. Export chart-neutral domain data, then adapt it in the reports feature.

For the large view models, extract only decisions that are independently meaningful: editor state transitions, validation, and persistence commands. Leave screen-local formatting and ephemeral interaction state in the hook. Splitting a 500-line hook by JSX section would only redistribute its complexity.

## What should *not* be “cleaned up”

- The simulation engines, `Simulator`, and `FlowResolver` are appropriately specialized. Their size reflects financial rules, not an unnecessary abstraction layer.
- Import plugins are a real multi-format seam. Preserve the small plugin contract; focus type hardening at the canonical import boundary.
- Raw transaction SQL is intentionally localized for performance. Do not force it through ORM-shaped repositories.
- The Safe-to-Spend public handle is a good canonical seam. The concern is the growing implementation responsibility set, not its existence.
- The design system and chart components have large files, but their size alone is not enough evidence of architectural decay.

## Guardrails to add once the P0 migrations land

1. Extend lint boundaries: services/data must not import `components`, `features`, or hooks; app routes stay feature-only; command hooks must not mutate repositories directly.
2. Add a CI budget for new production `any` and explicit unsafe casts at import/persistence boundaries; ratchet downward rather than requiring a risky cleanup sweep.
3. Make repository intent modules the only permitted source for new journal/account query methods; prohibit new methods on the legacy façades.
4. Assign one owner and review cadence to architecture documents. Archive superseded audits or add a dated status section instead of leaving old recommendations active.

## Recommended sequencing

1. Move planned-payment create/update/delete into a single command owner and add lifecycle tests at that boundary.
2. Remove `ImportRunner`; set an import workflow state contract; then harden `CanonicalImport` before adding another import format.
3. Remove service-to-UI imports by introducing service-owned timeline DTOs and feature adapters.
4. Migrate journal callers from the broad repository façade to intent stores; forbid façade growth. Apply the same pattern to accounts only after the journal migration proves the seam.
5. Carve the Safe-to-Spend input/projection/snapshot responsibilities while retaining its current public handle.
6. Split account lifecycle commands and tackle view models opportunistically as those use cases move down.

## Verification baseline

`bun run typecheck` was run on 2026-07-27 and currently fails before this documentation-only change. Reported baseline failures include unused imports in an E2E test and `SafeToSpendCard`, incomplete `Account` test fixtures, a missing `mode` prop in `JournalModeToggle`, and branded-ID/type mismatches in `transactionCardPresentation` tests. These should be fixed separately; they are evidence that the type boundary needs active maintenance, not introduced by this audit.
