# App improvement audit — September 30, 2026

## F01–F05 implementation review — September 30, 2026

GPT-6 Luna implemented the five authorized P0 fixes in the shared checkout on top of `26387c52`. The orchestrator reviewed the changes, requested corrections, and independently ran regression checks. The original audit below remains a baseline review, not an exhaustive audit of this patch.

| Finding | Implemented behavior | Validation |
|---|---|---|
| F01 | Projection and per-input acquisition failures emit unavailable/stale quality, preserve later input recovery, and do not publish a current widget amount. Empty books clear stale success; unavailable cards hide numerical output. | Failure/recovery, empty/cache reset, card amount absence, widget ready → unavailable/stale clearing. |
| F02 | Future automatic occurrences remain planned. Due occurrences settle once even after the generation cursor advances or the finite schedule completes. The new settlement path honors cancellation before commit. | Exact current-balance assertions, finite future → due posting, due-today posting, paused-state guard, repeated processing, staged cancellation. |
| F03 | Budget, scopes and creation audit stage in one database batch. | Failure leaves no budget/scopes/audit; successful creation publishes the complete graph in one batch. |
| F04 | Budget and planned-payment commands validate account references inside the repository's owning writer. Existing deletion-side validation remains intact. | Creator-first/deletion-first interleavings, budget scope/funding refs, planned source/target refs, rejected replacement-reference updates. |
| F05 | Persisted identity checks occur inside the writer. In-session reservations cover device IDs, exact full-content/time identity and compatible reference claims, without overwriting earlier amounts. | Duplicate reference/exact-content siblings, repeated device ID, scan replay, distinct similar entries, audit correlation, R/100 → R/200 → R/100 produces two journals. |

Verification evidence:

- A completed full `bun run verify` passed **422 suites / 2,565 tests**, architecture/privacy/type checks and lint before the last isolated UI tests and final SMS reservation correction. The orchestrator directly inspected its completed output. That run had four duplicate-import warnings subsequently removed, plus the two baseline journal-hook warnings. A later redundant run was interrupted; its partial output in `/tmp/full-frills-p0-verify.log` is not additional completed full-suite evidence.
- Independent final focused review passed **7 suites / 95 tests**, including the new card/widget consumer tests: `/tmp/full-frills-p0-parent-final-focused.log`.
- After the final reservation correction, independent SMS review passed **29/29 tests**, including the added mixed-amount reference regression: `/tmp/full-frills-p0-parent-final-sms.log`. The worker first reproduced that regression before fixing it.
- Existing audit/undo integration independently passed **11/11 tests**: `/tmp/full-frills-p0-audit-undo-review.log`. Final typecheck and lint passed; only the two baseline journal-hook warnings remain. Final static output is `/tmp/full-frills-p0-final-static-checks.log`. `git diff --check` is clean.

Limits: no native device/SQLite parity validation was performed. Previously persisted future `POSTED` occurrences were not migrated; the recurrence fix governs subsequent generation/settlement. Existing persisted SMS fingerprint lookup remains compatible with its older scheme; only in-session content reservations use the stricter complete-content/exact-time identity. F21 and F22 remain parked for the next P1 scope decision.

## Implementation preflight — September 30, 2026

The original review below describes baseline `935a5250`. Before delegation, the four newer commits through `26387c52` were checked: `cb287b9b`, `8b52df0a`, `b7a3ac33`, and `26387c52`. They expand audit history, undo safety, and audit display. The original verification results are baseline evidence, not verification of this newer checkout.

- F01 and F02 remain applicable. Recurring generation now carries audit correlation; fixes must preserve it.
- F03 remains applicable: budget creation persists the budget before the scope/audit batch. Failure of that later batch can leave both missing.
- F04 is partially resolved: account deletion validates blockers inside its writer. Budget and planned-payment commands still validate references before their own writers, leaving the creator/deletion interleaving open. Preserve the deletion-side fix and finish validation at publication.
- F05 remains applicable. SMS scan serialization and newly added audit correlation must be preserved while fixing within-batch duplicate acceptance.

### F21 — P1: Budget edits lose their original values in audit history

**New, reproduced at `26387c52`; outside the authorized F01–F05 implementation scope.** In [BudgetRepository.ts](../../src/data/repositories/BudgetRepository.ts:286), `prepareUpdate` mutates the model before the `before` snapshot is captured at line 319. For a scalar amount edit, both snapshots therefore contain the new amount. [Audit payload construction](../../src/types/auditEvents.ts:266) drops that equal-value delta.

A temporary isolated-database diagnostic created a budget at 100, updated it to 200, confirmed neither emitted snapshot contained an amount delta, and confirmed audit undo failed while the budget remained at 200. The diagnostic was removed from the source tree; scratch source is `/tmp/audit-preflight-budget-snapshot.test.ts` and output is `/tmp/full-frills-audit-preflight.log`. This was a characterization of the defect, not a passing fix regression.

**Action: RELOCATE.** Capture the full original budget snapshot before any preparation mutates the model. Acceptance: amount 100 → 200 emits `before.amount = 100` and `after.amount = 200`, then undo restores 100; equivalent scalar edits retain truthful history. Keep this finding parked for the next scope decision.

### F22 — P1: Planned-payment creation publishes before its audit event

**New during implementation review; source-established at `26387c52`, outside F01–F05.** [PlannedPaymentRepository.create](../../src/data/repositories/PlannedPaymentRepository.ts:166) first calls the collection's `create` (which publishes a database batch), then publishes the audit event in a second batch. Both calls are inside one writer, but writer serialization does not roll back an earlier batch if the later audit batch fails. The payment can remain saved while its creation command rejects and history is absent. This finding has not been fault-injected independently.

**Action: MERGE.** Stage payment and audit creation in one batch. Acceptance: injected publication failure leaves neither payment nor audit; success publishes both together. Park this for the next scope decision; do not expand the current five-fix implementation.

## Audit coverage

Repository: `full-frills-balance`

| Measure | Result |
|---|---:|
| Inventoried source, configuration, platform and test files | 1,647 |
| Conservatively recorded as manually analyzed | 131 |
| Excluded within that inventory | 0 |
| Pending manual analysis (`BLOCKED` inventory status) | 1,516 |
| Unaccounted within that inventory | 0 |
| Recorded manual coverage | 7.95% |
| Major flows traced at selected boundaries | 11 |
| Outstanding validation areas | 3 |
| Exhaustive audit status | **AUDIT INCOMPLETE** |

This is a decision-ready review of the app's core contracts, with a repository inventory, rather than a claim that every implementation has been audited. The remaining files are pending review, not inaccessible. The three outstanding validation areas are native runtime behavior, native SQLite parity for concurrency/failure scenarios, and physical-device performance/accessibility. Passing the existing test suite does not resolve these areas.

Inventory: `/tmp/full-frills-audit-inventory.json`. It records paths, categories, imports, exports, dependents and analysis status. Import resolution is static and approximate; it does not completely resolve platform variants or dynamic imports. Documentation was read as context, not counted as application source. Vendored dependencies, Pods, build output, coverage, caches, binary assets and package-manager lock files were excluded at discovery. The inventory captures the inspected checkout before adding this report.

Pending scope includes most individual account/journal/settings components, most utilities and hooks, detailed report calculators, individual import adapters, the full native/plugin surface, and most tests. A full exhaustive pass must return to those partitions; the inventory gives the exact file list. No claims of absence of defects are made for them.

## Verdict and intended product

**Fixable. The product has a useful core, but its confidence exceeds its guarantees.**

This is an offline-first, workplace-scoped personal finance app built on double-entry books. Its differentiator is a daily spending decision derived from cash, recurring income, commitments, budgets and debt. Journal capture, SMS ingestion, recurring schedules, account hierarchies, reports and backups support that decision.

The app should make four things easy: record what happened, see what is actually due, understand how much cash remains safe to spend and why, and recover one's books. A visually convincing number must carry its valuation date, assumptions and availability. Estimated income is an assumption, not cash already received. A failed calculation is unavailable, not zero.

| Stress test | Judgment |
|---|---|
| Single point of failure | A plausible but incorrect financial number destroys the core promise on day one. |
| So what? | The app is useful when it answers a spending decision quickly. Additional chart surfaces are secondary to that answer. |
| Break at scale | More accounts, imported history and automatic writers increase reference races, duplicate ingestion and conflicting read semantics. Runtime performance still needs measurement. |
| Incentives | People avoid repeated financial data entry. Capture and review should be quick, recoverable and explicit about uncertainty. Mock AI labels and lost onboarding drafts work against this. |
| Verdict | Keep the existing foundation. Fix financial contracts, then simplify the experience. |

## Actual architecture

```text
Expo Router route façades
  → feature screens / views
  → hooks, controllers and view models
  → command services / reactive read models / pure domain calculations
  → repositories
  → WatermelonDB (native SQLite; web/tests use a different adapter)

MMKV: preferences + setup identity + persisted paint snapshots
RxJS: observation, keyed replay and read-model caching
Native modules: SMS, widgets and other platform integration
External services: FX rate lookup, product analytics, crash reporting
```

The useful boundaries already exist. Routes are thin. Journal balance evaluation and FX rules have pure domain modules. `AccountingWriteSession` stages mutations for one database batch. Workplace transitions, restore publication and reactive cache ownership are deliberate. These are reasons to improve the current architecture, not replace the framework or database.

The 11 traced flows were launch, dashboard forecasting, journal entry/FX, recurring generation, budget creation, account deletion/reference checks, SMS auto-post, onboarding preview/commit, reporting, restore publication and widget/reset lifecycle. Depth varies by boundary; tracing a flow does not certify every file beneath it.

The static graph's biggest hubs are identifiers, enums, constants, component façades and theme access. High fan-in alone is not a defect. Architecture verification passes its existing dependency-cycle baseline of five cycles; that baseline mixes model/type relationships with other imports and is not proof of five runtime cycles.

The primary entropy sources are **validation separated from commit**, **financial state lacking an explicit quality/freshness contract**, **schedule cursors reused as user-facing obligations**, and **side effects whose lifecycle ends at the screen instead of the domain transition**. Parallel report paths and duplicated onboarding rule construction add semantic drift.

## Verification

- `bun run verify` passed: architecture checks, privacy-policy version check, TypeScript checks, **417 suites / 2,524 tests**, and lint with two warnings.
- Coverage reported 60.43% statements, 50.63% branches, 60.18% functions and 61.69% lines. This is execution coverage, not proof of financial contracts.
- Five temporary diagnostic probes passed by **asserting the current defective behavior**: forecast failure terminating input observation; KWD precision loss; weekly date drift; budget partial commit; and future auto-post appearing in account metrics. They are reproductions, not regression tests proving fixes. Temporary tests were removed from the source tree.
- The budget and future-posting probes used the isolated Jest database, not the user's saved app data. Forecast dependencies were controlled to force a projection rejection while retaining the real observable/read-model code.
- Read-only development-web walkthrough at a 393×852 viewport: dashboard/explanation, expense-entry opening/cancel, accounts, commitments, activity, settings and both reports paths. No entries were submitted, no exports shared, and no saved financial data was deliberately edited. Native hardware behavior was not tested.
- Two existing lint warnings remain: the `isCopy` memo dependency in `useJournalEditor.ts:224`, and the unstable suggestions expression in `useJournalSuggestions.ts:78`.
- Diagnostic logs and probe sources remain in `/tmp/full-frills-audit-*` and `/tmp/audit-*.test.ts`. They are local scratch artifacts, not permanent project tests.

## Confirmed findings

Priorities: P0 = financial integrity or correctness failures; P1 = major ownership, availability or privacy boundary; P2 = significant product/maintenance drift. Each finding names one primary refactoring action. Reproduced findings are distinguished from source-established defects.

### F01 — P0: Forecast failures masquerade as valid zero

Files: [SafeToSpendReadModel.ts](../../src/services/simulation/SafeToSpendReadModel.ts:113), [safeToSpendDashboardProjection.ts](../../src/services/simulation/safeToSpendDashboardProjection.ts:248), [useDashboardViewModel.ts](../../src/features/dashboard/hooks/useDashboardViewModel.ts:67).

**Evidence:** reproduced. The outer `catchError` returns an empty dashboard. It unsubscribes from financial inputs for the current currency; a subsequent input change does not retry projection. The payload says zero, no shortfall and a null safe-days count. The dashboard consumes `data` without exposing this failure.

**Action: RELOCATE.** The financial read model should own an explicit result state: loading, ready, stale, incomplete or failed, with retry and last successful value. Catch projection errors within the per-input operation so the upstream observation survives. Views format this state; they do not manufacture numeric fallbacks.

```diff
- failure → empty successful dashboard → cached zero
+ failure → failed/stale result; input observation survives → retry or new input
```

Acceptance: force one projection failure, update an account, and observe recovery without changing workplace or currency. Zero cash must remain distinct from unavailable cash.

### F02 — P0: Auto-post creates actual entries before their due date

Files: [plannedPaymentOrchestration.ts](../../src/services/planned-payment/plannedPaymentOrchestration.ts:133), [plannedOccurrenceSettlement.ts](../../src/services/planned-payment/plannedOccurrenceSettlement.ts:118), [AccountListMetricsQueries.ts](../../src/data/repositories/account/AccountListMetricsQueries.ts:34), [balanceReadService.ts](../../src/services/balance/balanceReadService.ts:109).

**Evidence:** reproduced. The generator scans through a future horizon, and `isAutoPost` marks every generated occurrence `POSTED`, including a bill ten days ahead. Account-list period metrics count that posted future expense. Latest-balance queries also lack a current-date cutoff. Safe-to-Spend uses an explicit current cutoff, so surfaces can disagree about actual cash.

**Action: RELOCATE.** Occurrence settlement should own the scheduled-versus-actual transition. Future generation creates planned entries; automatic posting applies only to occurrences due by an explicit `asOf` date. Current account reads should have an explicit time basis.

```diff
- generation horizon + auto flag → future POSTED journals
+ future generation → PLANNED; due settlement(asOf) → POSTED
```

Acceptance: run generation with an auto-post bill ten days ahead; current cash and actual spending remain unchanged, forecast includes the bill, and due-day processing posts it once.

### F03 — P0: Budget creation is not atomic with its scopes

File: [BudgetRepository.ts](../../src/data/repositories/BudgetRepository.ts:92).

**Evidence:** reproduced. `budgets.create()` commits the budget before the separate scope batch. Rejecting the scope batch leaves one budget and zero scopes. A Watermelon writer serializes operations; it does not make separate batches one atomic transaction.

**Action: MERGE.** Prepare the budget and scope records for one database batch under the existing accounting write discipline. The repository owns this publication boundary.

```diff
- create budget batch → create scope batch
+ prepare budget + scopes → one batch
```

Acceptance: inject a scope preparation/batch failure and find no published budget or scopes afterward. Then verify successful creation still publishes both together.

### F04 — P0: Account-reference guards run before the owning writer

Files: [accountDeleteCommands.ts](../../src/services/accounts/accountDeleteCommands.ts:21), [accountReferenceGraph.ts](../../src/services/accounts/accountReferenceGraph.ts), [budgetWriteService.ts](../../src/services/budget/budgetWriteService.ts:16), [plannedPaymentCommands.ts](../../src/services/planned-payment/plannedPaymentCommands.ts:20), [AccountWriteRepository.ts](../../src/data/repositories/account/AccountWriteRepository.ts).

**Evidence:** source-established interleaving. Delete checks references outside its writer. Budget/planned-payment creation checks live accounts outside its writer. A creator can pass its guard, a deletion can commit, and the creator can then publish a reference to the deleted account. The registry is useful; its placement does not enforce the invariant atomically.

**Action: RELOCATE.** Perform live-account and delete-blocker checks inside the same owning write session that publishes the mutation. Reuse caller-owned sessions; avoid nested writers. Keep the reference-site registry as the single policy source.

```diff
- assert references → await → independent writer
+ owning writer → assert references → prepare → one commit
```

Acceptance: controlled create/delete interleavings must yield either a rejected create or a blocked delete, never a live reference to a deleted account. Repeat against native SQLite before release.

### F05 — P0: SMS deduplication does not account for earlier items in the same batch

Files: [smsSyncPipeline.ts](../../src/services/sms/pipeline/smsSyncPipeline.ts:191), [smsInboxRecordPreparer.ts](../../src/services/sms/pipeline/smsInboxRecordPreparer.ts:84), [smsFingerprint.ts](../../src/services/sms/pipeline/smsFingerprint.ts:10).

**Evidence:** source-established. Per-workplace scan serialization is present and useful. However, duplicate maps are snapshots from before the batch, and `latestProcessedIds` is never populated as items are accepted. Two duplicate notifications with different device IDs can both pass analysis and stage auto-posts within one scan.

**Action: RELOCATE.** The batch/session must own a reservation index for accepted ingestion identities and transaction references, alongside a final persisted check in the writer. Record accepted identities while staging.

```diff
- all items consult pre-batch maps
+ persisted identity check + session reservations → one accepted posting
```

Acceptance: duplicate notifications in one scan produce one journal; repeat scans remain idempotent. Also test two legitimate same-amount purchases. Do not turn the current punctuation-stripping, truncated-body fingerprint into an unquestioned unique transaction identity.

### F06 — P1: Currency precision and FX-rate precision have competing owners

Files: [money.ts](../../src/utils/money.ts:82), [currencyConversion.ts](../../src/services/currencyConversion.ts:62), [wealth-service.ts](../../src/services/wealth-service.ts:36), [Simulator.ts](../../src/services/simulation/Simulator.ts:131), [currencyPrecision.ts](../../src/utils/currencyPrecision.ts).

**Evidence:** KWD loss reproduced: same-currency `0.001 KWD` converts to zero; `1.001 + 0.001 KWD` becomes `1.00`. Money defaults to two decimals regardless of currency. Simulator results also round to two decimals. Wealth history obtains an exchange-rate multiplier by converting an amount of one, which rounds the multiplier before applying it to larger balances.

**Action: RELOCATE.** Currency precision belongs to the money/domain policy already represented by currency definitions. Keep rate lookup unrounded; round monetary amounts at explicit currency boundaries. Do not replace already-correct journal minor-unit evaluation with another general arithmetic framework.

```diff
- global 2-decimal money + rounded amount-of-one used as rate
+ currency-specific monetary rounding + unrounded FX multiplier
```

Acceptance: identity conversion, aggregation and simulation preserve KWD/BHD precision; zero-decimal currencies follow their policy; large-balance FX history does not amplify a rounded multiplier.

### F07 — P1: Weekly onboarding uses a day-of-month as a weekday

Files: [commitCashClarity.ts](../../src/features/setup/first-run/commitCashClarity.ts:139), [projectCashClarityDraft.ts](../../src/features/setup/first-run/projectCashClarityDraft.ts:140), [RecurrenceEngine.ts](../../src/services/forward-finance/recurrence/RecurrenceEngine.ts:78).

**Evidence:** recurrence calculation reproduced. Onboarding uses `.date()` for income recurrence. Weekly rules expect `.day()`, a weekday. Selecting Wednesday September 30, 2026 constructs recurrence day 30; the first-occurrence calculator returns Tuesday October 6. Preview directly starts at the selected date, while persistence computes alignment, so they can disagree.

**Action: MERGE.** One pure onboarding recurrence builder should serve preview and commit, distinguishing weekly weekday, monthly day and yearly month/day.

```diff
- preview rule builder ≠ persistence rule builder
+ shared typed recurrence rule → preview and persistence
```

Acceptance: weekly and fortnightly income on the 30th retains the selected weekday and first date across preview, committed schedule and generated occurrences.

### F08 — P1: Telemetry contradicts the app's stated financial privacy promise

Files: [budgetWriteService.ts](../../src/services/budget/budgetWriteService.ts:20), [analyticsService.ts](../../src/services/analytics/analyticsService.ts:126), [logger.ts](../../src/utils/logger.ts), [PRIVACY.MD](../../PRIVACY.MD:94).

**Evidence:** source-established outgoing payload. Budget creation sends `amount`; deletion sends the user-entered `budget_name`. Generic tracking forwards arbitrary defined properties directly to PostHog. Error reporting forwards raw messages/stacks to PostHog and Sentry. The policy says financial amounts and user content are not intentionally sent. This review did not perform a production transmission capture.

**Action: RELOCATE.** A narrow observability boundary should own event schemas and sanitization. Allow event-specific counts/enums; prevent amounts, names, SMS and transcripts from reaching analytics or diagnostics unintentionally. Apply the policy before logs are buffered or errors captured, rather than relying on every caller.

```diff
- caller supplies arbitrary properties / raw errors → provider
+ typed allowed payload / sanitized diagnostic → provider
```

Acceptance: intercept outgoing SDK calls for budget creation/deletion and errors containing synthetic private strings. Prohibited fields and strings are absent. Review the complete logging surface before declaring compliance.

### F09 — P1: SMS retention and scanning differ from the written policy

Files: [smsInboxRecordPreparer.ts](../../src/services/sms/pipeline/smsInboxRecordPreparer.ts:40), [smsAutoPostAnalyzer.ts](../../src/services/sms/pipeline/smsAutoPostAnalyzer.ts:57), [useAppBootstrap.ts](../../src/features/app/hooks/useAppBootstrap.ts:119), [sms-service.ts](../../src/services/sms-service.ts:55), [PRIVACY.MD](../../PRIVACY.MD:59).

**Evidence:** source-established. Inbox records retain complete sender/body text, and auto-post metadata stores the original SMS body again. Bootstrap scans when Android SMS import is enabled. The policy instead describes manual-only processing and no raw content retained after processing. This is local storage behavior; it is not evidence that SMS bodies are uploaded.

**Action: RELOCATE.** The ingestion lifecycle should own retention, dedup identity and scan consent. Retain raw content only for an explicit review/debug purpose and defined lifetime. Reconcile the policy with actual behavior after making that product decision.

```diff
- inbox + journal independently retain raw text; bootstrap scans implicitly
+ ingestion policy owns scan mode, retained fields and purge lifecycle
```

Acceptance: inspect posted/dismissed records and journal metadata after retention expiry; raw text is gone where the selected policy says it should be. Consent copy matches launch behavior.

### F10 — P1: Forecast freshness has no visible or reactive time contract

Files: [safeToSpendInputAcquisition.ts](../../src/services/simulation/safeToSpendInputAcquisition.ts:134), [SnapshotService.ts](../../src/utils/SnapshotService.ts:191), [useDashboardViewModel.ts](../../src/features/dashboard/hooks/useDashboardViewModel.ts:73), [useAppForegroundMaintenance.ts](../../src/features/app/hooks/useAppForegroundMaintenance.ts), [useWidgetSync.ts](../../src/features/app/hooks/useWidgetSync.ts:187).

**Evidence:** source-established. Snapshot storage has a timestamp and a two-day TTL, but callers receive only data, and the dashboard does not expose its age. Forecast source ranges depend on current time at subscription construction and have no day-rollover trigger. Foreground maintenance flushes rebuilds without invalidating the time window. Widgets stamp synchronization time rather than projection time.

**Action: RELOCATE.** The forecast read model owns `asOf`, generation time, input revision, rate quality and refresh triggers. Snapshot and widget adapters preserve that provenance. A local-day/foreground signal should rebuild the window when its date basis changes.

```diff
- cached numeric payload + ambient Date.now()
+ dated projection result + time invalidation + preserved provenance
```

Acceptance: background across midnight with no database edits, resume, and observe a new forecast window. Old cached paint is visibly refreshing/stale; changing theme cannot make old financial data appear newly calculated.

### F11 — P1: Reset/deletion lifecycle does not clear every financial projection store

Files: [integrityMaintenance.ts](../../src/services/integrity/integrityMaintenance.ts:25), [WorkplaceService.ts](../../src/services/WorkplaceService.ts:121), [SnapshotService.ts](../../src/utils/SnapshotService.ts:221), [useWidgetSync.ts](../../src/features/app/hooks/useWidgetSync.ts:144), [ExpoWidgetsModule.swift](../../modules/expo-widgets/ios/ExpoWidgetsModule.swift:12), [ExpoWidgetsModule.kt](../../modules/expo-widgets/android/src/main/java/expo/modules/widgets/ExpoWidgetsModule.kt:28).

**Evidence:** source-established. Workplace deletion correctly clears its MMKV snapshots, but has no native widget clear. Reset paths remove database records and preferences without explicit snapshot/widget cleanup. Widget unmount cancels work rather than sending a clear snapshot; the native stores retain financial values until replaced. The general `clearSnapshots()` helper also does not recognize `safe_to_spend_<id>` keys.

**Action: RELOCATE.** A domain transition should own projection teardown across database, reactive caches, MMKV and native widgets. Put native cleanup behind a service callable after successful publication, with explicit cleanup warnings/retry behavior. Keep the existing correct per-workplace snapshot clearing.

```diff
- reset DB / unmount hook → projections can remain persisted
+ published transition → coordinated projection invalidation and widget clear
```

Acceptance: delete the last workplace and factory reset with populated widgets. No former financial values remain in native widget storage or relevant MMKV snapshots. Verify both platforms; this was not exercised on hardware.

### F12 — P1: A launch error can keep native recovery UI behind the splash

Files: [RootLayout.tsx](../../src/features/app/RootLayout.tsx:145), [splashHandoff.ts](../../src/features/app/splashHandoff.ts:56), [LaunchCoordinator.tsx](../../src/features/app/LaunchCoordinator.tsx:510).

**Evidence:** source-established. `launch.kind === 'error'` maps to splash state `loading`, which never hides the native splash. The coordinator renders a retry screen, but the splash handoff does not treat that screen as displayable recovery. The update gate's separate error handling does not resolve a launch-coordinator error.

**Action: RELOCATE.** The launch state machine should own readiness for open, gated and failed recovery screens. Failed recovery must become a renderable handoff state once layout is ready.

```diff
- launch error → loading splash forever
+ launch error → measured recovery screen → hide splash → retry
```

Acceptance: cold-start with failed workplace discovery on iOS and Android; see and operate retry, without a successful books hydration.

### F13 — P1: Commitments cards show the generation cursor as the next obligation

Files: [plannedOccurrenceSettlement.ts](../../src/services/planned-payment/plannedOccurrenceSettlement.ts:204), [PlannedPaymentCard.tsx](../../src/features/planned-payments/components/PlannedPaymentCard.tsx:63), [plannedPaymentJournalLines.ts](../../src/services/planned-payment/plannedPaymentJournalLines.ts).

**Evidence:** observed in the web walkthrough and explained by source. Generation advances `nextOccurrence` even for a planned, unsettled journal. The card calls that cursor “Next,” bypassing the earlier outstanding journal. Cards also infer direction from amount sign even though expense and income transfer amounts are positive, so expenses get income styling.

**Action: RELOCATE.** The commitments read projection should supply the next unsettled obligation and a semantic inflow/outflow/transfer direction. The generator cursor remains an internal scheduling field.

```diff
- card reads raw schedule cursor and amount sign
+ card reads next unsettled occurrence and semantic direction
```

Acceptance: generate next month's journal without settling it; the card still shows that bill as next. Expense and salary colors/icons differ correctly. Sort active obligations by due date and place paused plans separately.

### F14 — P1: Safe-to-Spend explanation omits the binding timing constraint

Files: [SafeToSpendExplanationModal.tsx](../../src/features/dashboard/components/SafeToSpendExplanationModal.tsx:161), [Simulator.ts](../../src/services/simulation/Simulator.ts:131).

**Evidence:** observed/source-established. The explanation lists cash plus future income minus commitments/debt and then presents Safe-to-Spend. The engine instead limits spending by the minimum balance along the dated trajectory and the starting cash ceiling. Those are different explanations when salary arrives after rent.

**Action: RELOCATE.** The simulation output should own an explanation of the binding day, included assumptions and reserved cash. The UI renders that explanation rather than reconstructing a four-row formula independently.

```diff
- UI's aggregate formula → engine's timeline-constrained answer
+ engine's binding-day explanation → matching headline and timeline
```

Acceptance: with synthetic cash 1,000, rent 800 on day 5 and salary 1,500 on day 20, explain why only 200 is safely available before payday. Show horizon, expected-income assumptions and the constraining obligation.

### F15 — P2: Reporting has two exposed product paths and a misleading metric label

Files: [ReportsScreen.tsx](../../src/features/reports/screens/ReportsScreen.tsx:27), [NetWorthTrendWidget.tsx](../../src/features/reports/components/widgets/NetWorthTrendWidget.tsx:82), [useReportChartData.ts](../../src/features/reports/hooks/useReportChartData.ts:41), [reports-v2/reportQueryEngine.ts](../../src/services/reports-v2/reportQueryEngine.ts).

**Evidence:** observed/source-established. The original report exposes “Open Reports V2” as a product control. Its “Net Worth Change” header displays the last net-worth value, not change. V2 distinguishes stock/change and has data-quality warnings; legacy wealth reads can omit unvalued balances without that quality contract.

**Action: MERGE.** Choose one report product owner and a tested migration path. Define parity for periods, scopes, refunds, transfers, valuation and missing-rate behavior before retiring the old path. Keep labels explicit about level versus change.

```diff
- Reports → hidden V2 route; independently evolving metric semantics
+ one report entry point → authoritative measures and quality contract
```

Acceptance: unchanged synthetic net worth reports zero change and the correct level. Missing FX cannot silently look like complete wealth. Migration parity covers actual/planned status, split entries and comparison periods.

### F16 — P2: Production voice parsing invokes a mock AI fallback

Files: [AiFallbackStep.ts](../../src/services/transaction-ingestion/pipeline/steps/AiFallbackStep.ts:18), [mockTransactionParser.ts](../../src/services/transaction-ingestion/mockTransactionParser.ts:4), [VoiceInputModal.tsx](../../src/features/journal/entry/components/VoiceInputModal.tsx:200).

**Evidence:** source-established. The AI step waits on a mock that only succeeds for a special phrase and then returns a synthetic 500 INR expense at 95% confidence. Other input falls back to deterministic parsing. The UI says “Resolving with on-device AI,” despite this path. The mock logs the transcript.

**Action: DELETE.** Remove the mock from the shipping ingestion path. Describe the actual parser capability and require review for uncertain fields. A real model is a separate product decision after deterministic capture is reliable.

```diff
- production fallback → mock delay / synthetic transaction / AI label
+ deterministic parsing → honest review state
```

Acceptance: no special transcript can synthesize a mock transaction in production; parser labels accurately describe the path used; transcripts do not enter unsanitized diagnostics.

### F17 — P1: Voice parsing does not own cancellation across close/reopen

Files: [useVoiceJournalParse.ts](../../src/features/journal/entry/hooks/useVoiceJournalParse.ts:50), [SimpleModePanel.tsx](../../src/features/journal/entry/modes/simple/SimpleModePanel.tsx:75), [VoiceInputModal.tsx](../../src/features/journal/entry/components/VoiceInputModal.tsx:41).

**Evidence:** source-established interleaving. The modal remains mounted with a visibility flag. Closing it does not abort speech recognition or invalidate an in-flight permission/parse request. Request A can finish after close/reopen or after request B and replace current output. Apply then pairs that output with current transcription.

**Action: RELOCATE.** A voice session controller owns recognition start/abort, request generation, captured input and output applicability. Only the current visible session can apply a result.

```diff
- independent visible/transcript/output state + unguarded async completion
+ current session token owns capture, parsing, cancellation and apply
```

Acceptance: resolve A after B; close during permission; close/reopen during parsing. No old session restarts recognition or supplies an applicable result. Pair displayed parsed fields with the transcript that produced them.

### F18 — P2: Cash-clarity onboarding loses its entered draft on process restart

Files: [OnboardingScreen.tsx](../../src/features/setup/first-run/OnboardingScreen.tsx:52), [pendingWorkplace.ts](../../src/features/setup/first-run/pendingWorkplace.ts).

**Evidence:** source-established. The draft, step and history are local React state. Storage preserves a pending workplace ID, not entered accounts, income and commitments. This specific first-run flow is distinct from the app's other resumable setup/restore work.

**Action: LIFT STATE.** A versioned first-run draft owner should preserve entered data and the resumable step outside screen lifetime, with explicit cleanup after successful publication or abandonment.

```diff
- screen state; only operation identity survives
+ resumable draft owner → screen; commit clears accepted draft
```

Acceptance: kill/relaunch halfway through onboarding and resume without re-entering balances or schedules. Offer a short initial setup and defer optional detail; measure drop-off before expanding the questionnaire.

### F19 — P2: Journal FX auto-fetch remembers an incomplete context key

File: [useJournalEditorExchangeRates.ts](../../src/features/journal/entry/hooks/useJournalEditorExchangeRates.ts:217).

**Evidence:** source-established. Current async completion guards correctly include valuation currency and request identity. However, the automatic-fetch key only includes line ID, account currency and date. Switching valuation currency clears the rate but can suppress the required new fetch. Returning to an earlier date also reuses an old attempted key. Failed attempts remain marked fetched.

**Action: RELOCATE.** Fetch state should be owned by the complete rate context—journal, line currency, valuation currency and date—with attempted, successful and failed states distinguished. Keep the existing current-request guard.

```diff
- incomplete attempted-key set suppresses required fetch
+ full context + explicit request outcome controls fetch/retry
```

Acceptance: change valuation currency, change date A→B→A, and retry a failed rate. Required automatic fetches occur without stale rates being applied.

### F20 — P2: Verification emphasizes architecture shape more than platform contracts

Files: [package.json](../../package.json:25), [ci.yml](../../.github/workflows/ci.yml:30), [detox.yml](../../.github/workflows/detox.yml:3), [jest.config.js](../../jest.config.js:29).

**Evidence:** source-established. Local `verify` and CI have different gates: CI adds production-bundle exclusion but omits the local privacy-policy check. Native CI is manual iOS; the Android-specific SMS feature has no corresponding automated workflow here. Selected accounting tests have strict thresholds while broader branch coverage remains near 50%.

**Action: MERGE.** Share the required verification definition across local/CI, with environment-specific additions explicit. Build a small contract suite around actual books, due dates, replay/idempotency, missing FX, failure recovery, privacy payloads and reset. Add a bounded native smoke gate for release-critical behavior rather than requiring the full expensive Detox suite on every commit.

```diff
- different gates + many isolated mocks + manual native coverage
+ shared verification contract + scenario tests + bounded native smoke
```

Acceptance: one documented command and corresponding CI contract cover the same required checks. The five reproduced defects become tests asserting the corrected behavior; Android scan/widget and native launch recovery have release evidence.

## UX and product improvements beyond defects

These are proposals grounded in the walkthrough, not measured conversion gains.

| Experience | Proposed change | Success criterion |
|---|---|---|
| Daily home | Lead with available cash, quality/as-of date, the binding obligation and the next decision. Keep detailed projections and history one step deeper. | A person can answer “how much, until when, and why?” without opening several screens. |
| Capture | Put amount, paying account and category first. Defer notes/date/advanced splits. Delay validation until interaction or submission; keep save availability clear. | A basic expense is recorded quickly with the keyboard open and without reviewing irrelevant advanced fields. |
| Accounts | Offer compact rows for larger hierarchies; keep detailed cards on account detail. Show when balance was reconciled with a readable label. | Compare several accounts in one viewport without losing hierarchy or currency context. |
| Commitments | Show overdue, due soon and later obligations; separate paused plans. Use “Recurring entry” for creation if income/transfer plans are supported. | Salary, rent and transfers have unambiguous direction, due date and settlement status. |
| Reports | Present one user-facing reporting experience. Prioritize cash movement, spending, net-worth level/change and actionable quality notices. | Totals reconcile with the activity drilldown and use matching periods/scopes. |
| Recovery | Make backup age and restore verification visible. Use synthetic round-trip fixtures before increasing backup scope. | Users know what can be restored and can verify a restore before adopting the books. |
| Accessibility/web | Audit amount contrast, dynamic text, chart alternatives, focus and keyboard use on actual devices. Web account cards produced nested-button warnings; the second reports route also produced handler warnings. | No runtime warning obscures the screen; nested actions have valid separate semantics. Native parity is tested independently. |

The pastel/card design has a recognizable direction. Replacing the entire visual system is low leverage. Density, hierarchy, truthful labels and error handling deserve attention first.

## Refactor order and highest-leverage work

| Phase | Slice | Findings | Reviewable outcome |
|---|---|---|---|
| 1: Integrity | Separate planned and actual recurrence | F02, F07 | Future bills never change actual books; preview and committed weekly schedules agree. |
| 1: Integrity | Publish commands atomically | F03, F04, F05 | Budget/scopes publish together; references remain live; ingestion is idempotent within a batch. |
| 1: Integrity | Make forecast failure explicit | F01 | Failure cannot look like valid zero, and a later input change recovers. |
| 1: Integrity | Enforce money precision and privacy boundaries | F06, F08, F09 | Currency units survive calculations; diagnostic payloads honor stated policy; retention is intentional. |
| 2: Structural | Give projections a dated quality contract | F10, F11, F14 | Dashboard, explanation and widget preserve provenance; teardown clears projections. |
| 2: Structural | Make recovery/session state authoritative | F12, F17, F18, F19 | Launch errors are actionable; voice and FX ignore stale work; onboarding resumes. |
| 2: Structural | Unify financial presentation | F13, F15 | Next obligation means unsettled obligation; one reports path uses defined semantics. |
| 3: Cleanup | Remove shipping mock and align gates | F16, F20 | Accurate parser copy, focused scenario tests and consistent required verification. |
| 3: Cleanup | Improve density and capture flow | UX proposals | Compact account comparison and a shorter basic entry path, validated with real usage. |

The three highest-leverage architectural changes are: **one atomic publication boundary for financial commands**, **one explicit quality/freshness contract for financial projections**, and **one semantic occurrence model separating generation from settlement**. All fit the architecture already present.

The smallest first implementation slice is F02: a future auto-post fixture, corrected generation/settlement policy and current-balance assertions. F01 and F03 are also contained fixes with reproduced failure cases. Do these before expanding AI or adding more report surfaces.

## Performance work that requires evidence

Prior performance documents contain useful static analysis and prior remediation, but they do not establish current physical-device performance. This review did not measure native frame times, memory, startup percentiles or power.

Use a release build on a mid-range Android device and an iPhone with synthetic datasets at 1k, 10k and 50k entries. Measure cold/warm launch, expense save-to-visible latency, account scrolling, report tab changes, recurring generation, bulk import and export peak memory. Reuse existing trace points. Set budgets from the measured baseline, then change only the measured bottleneck. Do not prescribe memoization, a state-library migration or a database rewrite from source size alone.

## Adversarial review and limits

Historical audits were treated as hypotheses, not copied as current findings. Backup-v2 restore decoding is now present. Journal FX has current-request guards. Per-workplace SMS scans are serialized. Workplace deletion clears its scoped MMKV snapshots. The corresponding old, broader claims were not repeated. The remaining findings describe narrower current failures.

Reproductions establish five behaviors in the test environment. Source traces establish the other listed contracts and interleavings; they do not prove frequency in production. Native splash, widget cleanup and concurrency remedies require native validation. The read-only web walkthrough validates visible product behavior, not a release-build accessibility or performance certification.

Production code was not changed. This report and the local inventory are the audit deliverables; no external issues, messages, PRs or deployments were created.
