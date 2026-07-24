# Codebase-design audit: `src/services/**` (+ utils facades)

Scope: ~98 production `.ts` files under `/Users/sahilsoni/me/projects/full-frills-balance/src/services`, plus closely related facades in `src/utils` (`journalPresenter`, `SnapshotService`, `TraceService`). Call-site counts are prod file approximates (excluding `__tests__` / `*.test.ts` unless noted). Vocabulary used exactly as specified.

---

## Cross-cutting smells (layer-wide)

| Smell | Where it shows up |
|---|---|
| **Dual import paths** | `ledger` vs `ledger/ledgerWriteService`; Safe-to-Spend types via `NotificationService` not `SafeToSpendReadModel`; `insightService` via Notification barrel; SMS types re-exported from `sms-service` |
| **Create-own-deps (singletons)** | Nearly every Module exports `new X()` and reaches into repositories / `database` / sibling singletons — seams are mostly hypothetical |
| **Fat return types** | `SafeToSpendResult`, `ReportSnapshot`, `DashboardData`, `ExportData` leak large internal shapes to UI |
| **Alias dual naming** | `accountingDomainService` / `accountingService`; `AccountingDomainService` still tested as `AccountingService` |
| **Pass-through barrels** | `NotificationService` re-exports insight + STS; `sms-service` re-exports pipeline/rules/matcher |

---

## 1. Accounting cluster

### `AccountingDomainService`
- **Path:** `/Users/sahilsoni/me/projects/full-frills-balance/src/services/accounting/AccountingDomainService.ts`
- **Interface size:** ~7 methods (+ alias export)
- **Depth:** shallow / mostly pass-through (delegates to `accountingHelpers`)
- **Deletion test:** complexity mostly already lives in helpers — deleting this Module barely hurts callers; helpers still needed
- **Deps:** in-process
- **Seams:** hypothetical (1 adapter: singleton)
- **Call sites:** ~4 prod (journal, rebuild, import balance, prepareJournalData)
- **Smells:** duplicate methods (`getImpactMultiplier` / `getBalanceImpactMultiplier`); dual alias; thin wrapper over helpers

### `accountingHelpers`
- **Path:** `.../accounting/accountingHelpers.ts`
- **Interface size:** ~14 exports (+ 4 types); callers must know debit/credit × account-type matrix, SQL snippets, period-flow shapes
- **Depth:** deep (small pure functions, lots of financial meaning)
- **Deletion test:** complexity reappears across ~8 prod callers (repos, reports, wealth, rebuild paths)
- **Deps:** in-process
- **Seams:** N/A (functions); real Leverage already
- **Call sites:** ~8 prod
- **Smells:** dual with DomainService; `JournalLineInput` also defined on Calculator (type drift risk)

### `JournalCalculator`
- **Path:** `.../accounting/JournalCalculator.ts`
- **Interface size:** ~8 static methods
- **Depth:** medium–deep (FX/base conversion + balance math)
- **Deletion test:** reappears in ~4 UI entry editors + validator
- **Deps:** in-process
- **Seams:** hypothetical
- **Call sites:** ~4 prod UI + validator
- **Smells:** UI imports calculator directly (domain leak into features); overlaps DomainService/Helpers validation

### `JournalValidator`
- **Path:** `.../accounting/JournalValidator.ts`
- **Interface size:** small class wrapping Calculator
- **Depth:** pass-through
- **Deletion test:** complexity vanishes — **zero external prod callers**
- **Deps:** in-process
- **Seams:** hypothetical
- **Call sites:** 0 prod (self + test only)

### Related: `journalPresenter` (utils facade)
- **Path:** `/Users/sahilsoni/me/projects/full-frills-balance/src/utils/journalPresenter.ts`
- **Interface size:** ~6 methods + label/color maps + types
- **Depth:** deep (semantic matrix is non-trivial)
- **Deletion test:** reappears across ~7 call sites (enrichment, prepareJournalData, feature VMs)
- **Deps:** in-process
- **Seams:** hypothetical
- **Smells:** test lives under `services/accounting/JournalPresenter.test.ts` while Implementation is in utils (Locality broken)

---

## 2. Journal cluster

### `JournalService` (`journalDomainService`)
- **Path:** `.../journal/journalDomainService.ts` (~733 LOC)
- **Interface size:** ~11 methods (`update/delete/recover/duplicate/reversal/post/revert/save/saveBulk/observeEnriched/suggestions`)
- **Depth:** medium (orchestration depth, but Interface is wide: audit + rebuild + ledger + status machine)
- **Deletion test:** complexity reappears across ~8–10 feature/hooks callers
- **Deps:** local-substitutable (WatermelonDB / repos)
- **Seams:** hypothetical (creates own deps via imported singletons)
- **Call sites:** ~8–10 prod
- **Smells:** create-own-deps; fat workflow surface; `observeEnrichedJournals` thin-delegates to observer Module

### `observeEnrichedJournals` (`journalEnrichedObserver`)
- **Path:** `.../journal/journalEnrichedObserver.ts`
- **Interface size:** 1 function
- **Depth:** medium
- **Deletion test:** reappears in ReactiveData, ledger read, journal hooks, JournalRepository
- **Deps:** local-substitutable
- **Seams:** hypothetical
- **Call sites:** ~6 prod
- **Smells:** also reachable via `journalService.observeEnrichedJournals` (dual path)

---

## 3. Accounts / balances / rebuild

### `AccountService` (`accountDomainService`)
- **Path:** `.../accounts/accountDomainService.ts` (~719 LOC)
- **Interface size:** ~11 methods (CRUD, reconcile, merge, opening balances, order, adjust)
- **Depth:** medium (deep Implementation, large Interface)
- **Deletion test:** reappears across accounts hooks, onboarding, audit handlers (~5+ prod)
- **Deps:** local-substitutable
- **Seams:** hypothetical; create-own-deps (balance, budget write, planned payment, rebuild, ledger)
- **Call sites:** ~5 prod (+ many tests)
- **Smells:** god-orchestrator; merge path fans out to many Modules

### `BalanceService`
- **Path:** `.../BalanceService.ts` (~492 LOC)
- **Interface size:** ~2 public methods (`getAccountBalance`, `getAccountBalances`) — small surface, heavy Implementation
- **Depth:** deep
- **Deletion test:** reappears in ReactiveData, wealth, accounts, SafeToSpend (~6 prod)
- **Deps:** local-substitutable (+ FX)
- **Seams:** hypothetical
- **Call sites:** ~6 prod
- **Smells:** hierarchy cache mutate-in-place; couples to workplace + exchange rates

### `AccountingRebuildService`
- **Path:** `.../AccountingRebuildService.ts`
- **Interface size:** ~2 methods
- **Depth:** medium–deep
- **Deletion test:** reappears in queue, integrity, import (~3 prod)
- **Deps:** local-substitutable
- **Seams:** hypothetical
- **Call sites:** ~3 prod

### `RebuildQueueService`
- **Path:** `.../RebuildQueueService.ts`
- **Interface size:** ~4 methods (`enqueue`, `enqueueMany`, `flush`, `stop`)
- **Depth:** medium (batching/locking policy hidden)
- **Deletion test:** reappears at every write path (~5 prod: journal, account, ledger write, planned, SMS pipeline)
- **Deps:** in-process + local-substitutable
- **Seams:** hypothetical
- **Call sites:** ~5 prod
- **Smells:** write Modules must know rebuild semantics (ordering constraint is part of Interface)

---

## 4. Ledger cluster

### `LedgerWriteService`
- **Path:** `.../ledger/ledgerWriteService.ts`
- **Interface size:** ~3 methods
- **Depth:** medium (thin but central)
- **Deletion test:** reappears across ~6 prod write callers
- **Deps:** local-substitutable
- **Seams:** hypothetical
- **Call sites:** ~6 prod
- **Smells:** dual import (`@/services/ledger` vs direct file); always pulls rebuild + prepare

### `LedgerReadService`
- **Path:** `.../ledger/ledgerReadService.ts`
- **Interface size:** ~12 methods (repo-shaped)
- **Depth:** shallow–medium (many methods ≈ repository façade)
- **Deletion test:** some vanish into repos; metrics helpers would reappear (~3 prod)
- **Deps:** local-substitutable
- **Seams:** hypothetical
- **Call sites:** ~3 prod
- **Smells:** large Interface; dual import path

### `prepareJournalData`
- **Path:** `.../ledger/prepareJournalData.ts`
- **Interface size:** 1 function + fat `PreparedJournalData`
- **Depth:** medium–deep
- **Deletion test:** reappears in journal, ledger write, SMS pipeline (~3)
- **Deps:** local-substitutable + accounting
- **Seams:** hypothetical
- **Call sites:** ~3 prod
- **Smells:** callers must understand prepared shape (displayType, balances, accountsToRebuild)

### `AccountResolutionService` (+ `LocalTransactionClassifier`)
- **Path:** `.../ledger/AccountResolutionService.ts` (~629 LOC)
- **Interface size:** ~1 method (`resolve`) — deep Implementation
- **Depth:** deep
- **Deletion test:** reappears in ingestion pipeline steps (~2)
- **Deps:** local-substitutable
- **Seams:** hypothetical (classifier is internal)
- **Call sites:** ~2 prod

### `TransactionExtractor` registry + `SmsExtractor` / `VoiceExtractor` / `SmsParser`
- **Paths:** `.../ledger/TransactionExtractor.ts`, `SmsExtractor.ts`, `VoiceExtractor.ts`, `SmsParser.ts`
- **Interface size:** small seam (`canExtract`/`extract`) + channel adapters
- **Depth:** medium–deep per adapter; registry is shallow
- **Deletion test:** extraction logic reappears in SMS + voice ingestion
- **Deps:** in-process (parsers) / true-external only at SMS device edge
- **Seams:** **real** (2+ adapters: SMS + Voice registered)
- **Call sites:** registry ~4–5; SmsParser ~3
- **Smells:** good seam example for this layer

### `RuleMatcher`
- **Path:** `.../ledger/RuleMatcher.ts`
- **Interface size:** many exported types + match helpers (~8 type exports dominate Interface)
- **Depth:** medium
- **Deletion test:** type/match knowledge spreads to SMS, rules repo, settings (~4)
- **Deps:** in-process
- **Seams:** hypothetical
- **Call sites:** ~4 prod
- **Smells:** type surface is the Interface tax

---

## 5. Simulation / Safe-to-Spend cluster

### `CashFlowSimulationService`
- **Path:** `.../simulation/CashFlowSimulationService.ts` (~573 LOC)
- **Interface size:** 1 method but **~12 parameters** + heavy domain types — Interface is fat despite method count
- **Depth:** medium (orchestrates generators/resolver/simulator; param list is the cost)
- **Deletion test:** orchestration reappears in SafeToSpendReadModel only (~1 prod consumer) — but Implementation complexity is real
- **Deps:** local-substitutable + in-process engines
- **Seams:** hypothetical externally; internal static engines
- **Call sites:** 1 prod (+ many tests)
- **Smells:** create-own-deps inside `simulate`; callers must assemble all inputs

### `SafeToSpendReadModel`
- **Path:** `.../simulation/SafeToSpendReadModel.ts` (~437 LOC)
- **Interface size:** 2 methods + **fat `SafeToSpendResult`** (~10 fields including `report`, `accountMap`, full simulation dump)
- **Depth:** medium–deep Implementation; Interface shallowed by fat return
- **Deletion test:** complexity reappears across dashboard/widget (~8 UI files) — but they import via Notification
- **Deps:** local-substitutable
- **Seams:** hypothetical
- **Call sites:** **0 direct UI** — all via Notification re-export (~8–10)
- **Smells:** dual import path; fat return; create-own-deps (reactive, balance, budget, FX, snapshot, sim)

### `Simulator` / `FlowResolver` / flow engines / `TimeContext` / `SimulationReportGenerator` / selectors
- **Paths:** under `.../simulation/`
- **Interface size:** typically 1 static method each (`simulate`, `resolveConflicts`, `generate`, …); selectors 1 fn each
- **Depth:** Simulator/FlowResolver/engines = **deep**; TimeContext = shallow–medium; ReportGenerator = medium; selectors = medium
- **Deletion test:** engines’ complexity would reappear inside CashFlowSimulationService (Locality currently good)
- **Deps:** in-process
- **Seams:** hypothetical externally (only used by CashFlowSimulationService) — good *internal* composition
- **Call sites:** ~1 each (parent Module)
- **Smells:** none major — this is the healthiest internal depth pattern in the tree

---

## 6. Notification cluster

### `NotificationService`
- **Path:** `.../notification/NotificationService.ts`
- **Interface size:** ~8 methods + **barrel re-exports** (Insight, insightService, SafeToSpend types/model)
- **Depth:** shallow for STS/insight; medium for scheduling (expo-notifications)
- **Deletion test:** reminder scheduling vanishes; STS/insight complexity does **not** (lives elsewhere) — classic pass-through barrel
- **Deps:** true-external (OS notifications) + local-substitutable for STS
- **Seams:** hypothetical for STS; true-external for notifications (only 1 adapter)
- **Call sites:** ~12–14 prod (many only want STS types)
- **Smells:** dual import path; wrong Module owning Safe-to-Spend Interface; hub imports insight *through* Notification

---

## 7. Ingestion cluster (voice/AI pipeline + TransactionService)

### `TransactionIngestionService`
- **Path:** `.../transaction-ingestion/TransactionIngestionService.ts`
- **Interface size:** 2 methods (`ingest`, `setAiProvider`)
- **Depth:** medium–deep (pipeline orchestration)
- **Deletion test:** reappears in VoiceInputModal (+ index)
- **Deps:** true-external (on-device LLM) + in-process steps
- **Seams:** **real** for AI provider (`NativeAIProvider` / mock / `setAiProvider`); pipeline steps are internal adapters
- **Call sites:** ~1–2 prod
- **Smells:** create-own-deps (hardcodes step list + preference-driven provider); good seam otherwise

### Pipeline steps (`ContextGatheringStep`, `DeterministicStep`, `AiFallbackStep`)
- **Interface size:** `PipelineStep` seam (~1 method each)
- **Depth:** medium each
- **Deps:** local-substitutable / true-external (AI)
- **Seams:** real internally (3 adapters on `PipelineStep`)
- **Call sites:** only via TransactionIngestionService

### `TransactionService`
- **Path:** `.../transaction-ingestion/TransactionService.ts`
- **Interface size:** ~5 methods
- **Depth:** shallow–medium (read/enrich + merge ops)
- **Deletion test:** some would reappear in journal hooks (~2–3)
- **Deps:** local-substitutable
- **Seams:** hypothetical
- **Call sites:** ~2–3 prod
- **Smells:** name collision risk with “transaction ingestion”; lives beside AI pipeline but is mostly journal read

### `NativeAIProvider` / `TransactionFallbackAIProvider` / `SmallModelProvider` / `ModelManagementService`
- **Paths:** under `transaction-ingestion/` and `ai/`
- **Interface sizes:** Native ~3; SmallModel ~6; ModelManagement ~11
- **Depth:** medium–deep
- **Deps:** true-external (model download / on-device inference)
- **Seams:** **real** (native vs mock fallback); ModelManagement is separate download/registry Module
- **Call sites:** SmallModel ~4; ModelManagement ~2 UI + SmallModel; Native ~2–3
- **Smells:** preferences + AppConfig create-own-deps inside ingestion

---

## 8. SMS cluster

### `SmsService` (façade)
- **Path:** `.../sms-service.ts`
- **Interface size:** ~21 methods + large type re-export barrel
- **Depth:** shallow–pass-through (delegates to bridge/pipeline/rules)
- **Deletion test:** much vanishes into pipeline/engine — Interface tax stays unless callers retarget
- **Deps:** true-external (device SMS) + local-substitutable
- **Seams:** hypothetical at façade; real underneath
- **Call sites:** ~10 prod
- **Smells:** fat façade; dual path (types also importable from ledger/sms/*)

### `SmsSyncPipeline` / `SmsRuleEngine` / `SmsInboxBridge`
- **Paths:** `.../sms/*`
- **Interface sizes:** ~6 / ~11 / ~1
- **Depth:** SyncPipeline medium–deep; RuleEngine medium–deep; Bridge shallow (device adapter)
- **Deletion test:** complexity reappears if façade deleted without retargeting
- **Deps:** Bridge = true-external; others local-substitutable
- **Seams:** Bridge is the real external adapter; RuleEngine/Pipeline mostly single-adapter
- **Call sites:** mostly via SmsService (~1–2 direct)

---

## 9. Budget cluster

### `BudgetReadService` / `BudgetWriteService` / `BudgetPeriodUtils`
- **Paths:** `.../budget/*`
- **Interface sizes:** Read ~2 (+ `BudgetUsage` type); Write ~4; PeriodUtils static helpers
- **Depth:** Read medium–deep (usage aggregation); Write medium; PeriodUtils deep-ish pure
- **Deletion test:** Read would reappear in UI + simulation (~6); Write in budget UI + accounts (~3)
- **Deps:** local-substitutable
- **Seams:** hypothetical
- **Call sites:** Read ~6; Write ~3; PeriodUtils ~4
- **Smells:** simulation depends on Read’s `BudgetUsage` shape (coupling)

---

## 10. Reports cluster

### `ReportService`
- **Path:** `.../report-service.ts` (~737 LOC)
- **Interface size:** ~14 methods + several DTOs; `ReportSnapshot` is fat
- **Depth:** medium (orchestrates calculators + FX + accounting helpers)
- **Deletion test:** reappears across reports hooks (~5–6)
- **Deps:** local-substitutable
- **Seams:** hypothetical
- **Call sites:** ~5–6 prod
- **Smells:** fat snapshot; calculators only used here (could be internal)

### `reportingDeltaEngine` / `sankeyCalculator` / `heatmapCalculators` / `historyCalculators`
- **Interface sizes:** ~1–4 functions each
- **Depth:** medium–deep pure
- **Deletion test:** would reappear inside ReportService only (~1 caller each)
- **Deps:** in-process
- **Seams:** hypothetical (good internal Locality)
- **Call sites:** 1 each (ReportService)

---

## 11. Exchange rates

### `ExchangeRateService`
- **Path:** `.../exchange-rate-service.ts`
- **Interface size:** ~6 methods
- **Depth:** medium–deep (cache, sync, convert)
- **Deletion test:** FX knowledge reappears across ~14 prod callers
- **Deps:** remote-owned / true-external for fetch + local-substitutable cache/DB
- **Seams:** hypothetical (single production path; tests new the class)
- **Call sites:** ~14 prod (hottest shared Module after analytics)
- **Smells:** create-own-deps; many Modules must know convert/preWarm ordering

---

## 12. Reactive data + snapshots

### `ReactiveDataService`
- **Path:** `.../ReactiveDataService.ts` (~617 LOC)
- **Interface size:** ~10 observe/preWarm methods + fat `DashboardData` / `AccountDashboardData`
- **Depth:** medium–deep (subscription Locality is the win)
- **Deletion test:** duplicate Rx chains would reappear across dashboard/accounts/wealth (~5–6)
- **Deps:** local-substitutable
- **Seams:** hypothetical
- **Call sites:** ~5–6 prod
- **Smells:** fat aggregates; create-own-deps (balance, wealth, journal, FX, snapshot)

### `SnapshotService` / `TraceService` (utils)
- **Paths:** `src/utils/SnapshotService.ts`, `src/utils/TraceService.ts`
- **Interface sizes:** Snapshot ~7; Trace ~5 (+ `Trace` type)
- **Depth:** medium / shallow–medium
- **Deletion test:** cache/telemetry boilerplate reappears (~4–7)
- **Deps:** local-substitutable (storage) / in-process
- **Seams:** hypothetical
- **Call sites:** Snapshot ~4; Trace ~7

---

## 13. Import cluster

### `ImportService` / `ImportRunner` / `orchestrator` / `ImportRegistry` + plugins
- **Paths:** `.../import/*`
- **Interface sizes:** ImportService 1 (`executeImport`); Runner 1; Registry register/detect; Plugin seam ~4 methods
- **Depth:** Service medium; plugins deep per format; orchestrator medium (zip/decode)
- **Deletion test:** format parsers would reappear; orchestration Locality is real
- **Deps:** local-substitutable + file I/O
- **Seams:** **real** (native / ivy / cashew plugins — 3 adapters)
- **Call sites:** ImportService ~1–2; registry via index; plugins registered at load
- **Smells:** side-effect registration on import; `index` vs `index.web` dual

### `ImportBalanceCalculator` / `MockDataSeederService`
- **Interface:** 1 function / 1 method
- **Depth:** medium / medium (seeder is large Implementation)
- **Call sites:** 1–2 each
- **Deps:** local-substitutable

---

## 14. Planned payments

### `PlannedPaymentService`
- **Path:** `.../PlannedPaymentService.ts` (~701 LOC)
- **Interface size:** ~8 methods
- **Depth:** medium–deep
- **Deletion test:** recurrence/posting logic reappears across planned-payment UI + bootstrap + ivy import (~6)
- **Deps:** local-substitutable
- **Seams:** hypothetical
- **Call sites:** ~6 prod
- **Smells:** create-own-deps (ledger write, rebuild); overlaps simulation PlannedFlowGenerator conceptually

---

## 15. Wealth / integrity / workplace / audit / export / sharing / analytics

### `wealthService` (object Module)
- **Path:** `.../wealth-service.ts`
- **Interface size:** ~3 methods + summary types
- **Depth:** medium–deep
- **Call sites:** ~2–3 (ReactiveData, reports)
- **Deps:** local-substitutable + accounting helpers
- **Depth verdict:** medium; good Locality for NW math

### `IntegrityService`
- **Path:** `.../integrity-service.ts` (~567 LOC)
- **Interface size:** ~10 methods (verify/repair/reset/cleanup)
- **Depth:** medium–deep
- **Call sites:** ~5–6 (bootstrap, settings, import, workplace, rebuild)
- **Deps:** local-substitutable
- **Smells:** destructive ops on same Interface as verify (Interface sprawl)

### `WorkplaceService`
- **Path:** `.../WorkplaceService.ts`
- **Interface size:** ~12 methods
- **Depth:** medium
- **Call sites:** ~15 (very hot)
- **Deps:** local-substitutable
- **Smells:** currency migration + CRUD on one Module

### `AuditService` + `revert-registry` + `audit-handlers`
- **Interface sizes:** Audit ~6; Registry 2; handlers registration
- **Depth:** medium / shallow registry
- **Seams:** **real** for revert handlers (register multiple)
- **Call sites:** audit ~5–6; handlers wired from RootLayout
- **Smells:** good registry pattern

### `ExportService` / `SharingService` / `TransactionShareProvider` / `BugReportService`
- **Interface sizes:** Export ~2 + many DTO types (Interface tax in types); Sharing ~4 + `ShareProvider` seam; ShareProvider 1; BugReport 2 static
- **Depth:** Export medium–deep; Sharing medium; ShareProvider medium
- **Seams:** Sharing **`ShareProvider` is real** (transaction + bug-report adapters)
- **Call sites:** Export ~1; Sharing ~6; ShareProvider ~3; BugReport ~2
- **Deps:** true-external (share sheet / filesystem) + local DB for export

### `AnalyticsService` (`analytics`)
- **Path:** `.../analytics-service.ts`
- **Interface size:** ~40+ methods (many `logX` wrappers)
- **Depth:** shallow (thin wrappers over PostHog/Sentry) with some init depth
- **Deletion test:** call sites keep tracking intent — complexity of SDK stays external; wrappers mostly vanish
- **Deps:** true-external
- **Seams:** hypothetical (single SDK adapter)
- **Call sites:** ~45 prod (hottest)
- **Smells:** Interface sprawl (`logAccountCreated` vs `track`); create-own-deps

### `InsightService` + `insightCalculator`
- **Interface:** Insight ~6; calculator 1
- **Depth:** medium / deep pure
- **Call sites:** Insight ~4–5 (often via Notification barrel)
- **Smells:** dual import path through Notification

### `CurrencyInitService`
- **Interface:** ~1 method (+ `COMMON_CURRENCY_CODES`)
- **Depth:** medium
- **Call sites:** ~3–4
- **Deps:** local-substitutable

---

## Cluster map (summary)

```
accounting ── helpers/calculator/domain/validator ──► journal / ledger / reports / wealth / rebuild
journal ──► ledger write + rebuild queue + audit
accounts ──► balance + budget write + planned + ledger + rebuild
ledger extract/rules ──► SMS + transaction-ingestion
simulation engines ──► CashFlowSimulation ──► SafeToSpendReadModel ──► Notification (barrel) ──► UI
reactive + balance + wealth + FX ──► dashboard
import plugins (real seam) ──► ImportService
sharing ShareProvider (real seam) ──► UI / bug report
analytics (true-external, shallow) ──► everywhere
```

---

## Top deepening candidates (this layer)

1. **Accounting helpers ∪ DomainService ∪ Calculator ∪ Validator** — three overlapping Interfaces for one debit/credit/FX truth; Validator has zero callers; DomainService is pass-through; UI imports Calculator directly.
2. **`NotificationService` barrel for Safe-to-Spend / Insight** — pass-through Interface; UI couples to the wrong Module; deleting Notification would not remove STS complexity (it would just force rewiring).
3. **`CashFlowSimulationService.simulate` parameter Interface** — one method, ~12 args; deepen by accepting a single simulation request / context object so SafeToSpend assembly + sim stay one Interface.
4. **`SafeToSpendResult` fat return** — callers learn simulation report/accountMap/details; deepen by returning a stable read-model (projection + summary) and keeping engine dumps internal.
5. **`SmsService` 21-method façade + type barrel** — collapse to a small inbox/sync/rules Interface over existing pipeline/engine/bridge adapters (already almost deep underneath).
6. **`ReportService` + private calculators** — already Internal Locality; deepen external Interface by shrinking `ReportSnapshot` / method count so UI doesn’t learn every chart shape.
7. **`ReactiveDataService` fat dashboard aggregates** — deepen by narrower observe Interfaces (balances vs journals vs wealth) so callers don’t subscribe to unused fields.
8. **`AnalyticsService` method sprawl** — deepen to `track(event, props)` (+ maybe screen/identify); ~45 call sites get Leverage from one Interface.
9. **`AccountService` / `JournalService` god-orchestrators** — Implementation is valuable (deletion fails), but Interfaces are wide; deepen by splitting write workflows behind fewer entry points (`submit`, `lifecycle`) and hiding audit/rebuild as internal.
10. **`journalPresenter` Locality** — already deep; move tests/ownership next to Implementation (or into accounting cluster) so the semantic matrix has one home.

---

## Real vs hypothetical seams (layer scorecard)

| Real seams (2+ adapters) | Hypothetical (1 adapter / singleton) |
|---|---|
| `ImportPlugin` (native/ivy/cashew) | Almost all domain singletons |
| `TransactionExtractor` (SMS/Voice) | `BalanceService`, `JournalService`, `ExchangeRateService`, … |
| `TransactionFallbackAIProvider` (native/mock) | `ReportService`, `ReactiveDataService`, … |
| `ShareProvider` (transactions/bug report) | `NotificationService` STS pass-through |
| `RevertHandler` registry | `SmsService` façade |
| `PipelineStep` (internal) | |

---

## Depth distribution (rough)

| Verdict | Examples |
|---|---|
| **Deep** | `accountingHelpers`, `BalanceService` (2-method surface), `JournalCalculator`, flow engines/`Simulator`/`FlowResolver`, `AccountResolutionService`, `journalPresenter`, import plugins |
| **Medium** | `JournalService`, `AccountService`, `CashFlowSimulationService`, `SafeToSpendReadModel`, `ReportService`, `PlannedPaymentService`, `IntegrityService`, budget Modules |
| **Shallow** | `AccountingDomainService`, `LedgerReadService` (repo-shaped), `AnalyticsService`, parts of `SmsService` |
| **Pass-through** | `JournalValidator`, Notification STS/insight re-exports, much of `sms-service` delegation, `accountingService` alias |

This layer already has strong *internal* depth in simulation engines and import/extractor seams; the highest-Leverage work is collapsing overlapping accounting Interfaces, removing barrel pass-throughs, and shrinking fat return/param Interfaces on STS, reports, and reactive data.