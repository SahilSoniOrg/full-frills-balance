# Codebase Design Audit

**Date:** 2026-07-24  
**Scope:** Whole repository (`src/`, `modules/`, related docs)  
**Vocabulary:** codebase-design skill — **Module**, **Interface**, **Implementation**, **Depth**, **Seam**, **Adapter**, **Leverage**, **Locality**  
**Related:** [ARCHITECTURE.md](../ARCHITECTURE.md) (layer map — partly stale), [CONTEXT.md](../../CONTEXT.md) (domain glossary), [README](./README.md), full cluster surveys in [surveys/](./surveys/)

This document is the durable review artifact for deep-module design across Full Frills Balance. It is meant to be re-read when picking the next deepening, planning a refactor, or reviewing a PR for Interface shape — not line counts.

**Companion artifacts**

| Artifact | Purpose |
|----------|---------|
| [AUDIT.md](./AUDIT.md) (this file) | Ranked backlog + cluster verdicts |
| [surveys/*.md](./surveys/) | Exhaustive per-cluster Module inventories from the 2026-07-24 sweep |
| Cursor canvas `codebase-design-audit` | Interactive overview beside chat |

---

## 1. How to read this

| Verdict | Meaning |
|---------|---------|
| **Deep** | Small Interface, large useful Implementation; deletion would force complexity back into N callers |
| **Medium** | Earns keep, but Interface is wider than ideal or Implementation leaks |
| **Shallow** | Interface nearly as complex as Implementation; thin wrapper |
| **Pass-through** | Deletion test fails — complexity vanishes; Module is indirection |

| Priority | Meaning |
|----------|---------|
| **P0** | Wrong seam / dual path / callers already hurting; next deepening |
| **P1** | Clear leverage if deepened; schedule soon |
| **P2** | Worthwhile when touching the cluster |
| **P3** | Acceptable; revisit only if call sites grow |

**Dependency categories** (from DEEPENING.md): in-process · local-substitutable · remote-owned · true-external.

**Seam rule:** one Adapter = hypothetical seam; two Adapters = real seam.

---

## 2. Executive summary

The codebase already has several **genuinely deep Modules** (balance aggregation, cash-flow simulation, journal write path, import plugins, ingestion Pipeline, LLMEngine). Recent work (`ff356245`) correctly killed utils accounting re-export facades and extracted `SafeToSpendReadModel`.

Remaining systemic issues:

1. **Wrong or leftover seams** — Safe-to-Spend still entered via `NotificationService`; SMS types re-exported through a façade; ARCHITECTURE.md still wrong about STS ownership.
2. **Dual import paths** — `accountingHelpers` vs `AccountingDomainService`; domain presentation living in `utils/journalPresenter` while accounting lives under `services/accounting`.
3. **Fat Interfaces** — `SafeToSpendResult`, `JournalRepository` (~30 methods), `preferences` (~40 surface points), `sms-service` re-export barrel.
4. **God view-models** — several 400–600 LOC feature hooks that mix orchestration, formatting, and domain rules (especially accounts + journal editors).
5. **Real seams that are healthy** — `ImportPlugin`, `ShareProvider`, `PipelineStep`, `LLMEngine` (+ mock), simulation engines behind `CashFlowSimulationService`.

**Recommended next deepenings (ordered):**

1. Safe-to-Spend Interface hybrid (dashboard-first handle + domain projection) — see §8  
2. `BalanceEffects` merge of helpers + DomainService — see §8  
3. Retire `NotificationService` / `sms-service` pass-through surfaces  
4. Split `preferences` by domain (theme / AI / SMS / STS / privacy)  
5. Carve use-case Modules out of `JournalRepository` / `AccountRepository` / `TransactionRepository`  
6. Thin journal/account view-models; delete `ledgerReadService` pass-throughs  
7. Fix CONTEXT drift (`LiteRTAdapter` named but absent — only `SmallModelProvider`)  

---

## 3. Layer map (as designed vs as lived)

```
app/                    thin routes (good)
features/               screens + view-models  ← often too deep (logic leak)
services/               domain Modules         ← primary depth home
data/repositories/      local-substitutable Adapters (+ some domain SQL)
data/models/            Watermelon models
utils/                  mixed: pure money/date (deep) vs preferences/navigation/presenter (wide)
modules/                native Adapters (sms-inbox, widgets)
```

**Invariant from ARCHITECTURE.md that still guides depth:** balances are derived, never cached as source of truth — `BalanceService` + rebuild Modules earn their keep here.

**Stale doc note:** ARCHITECTURE.md still lists Safe-to-Spend under NotificationService. Post-`ff356245` ownership is `SafeToSpendReadModel`; NotificationService is a pass-through.

---

## 4. Cluster inventory

Counts and LOC are approximate (2026-07-24). Depth is about leverage, not LOC.

### 4.1 Accounting & ledger math

| Module | Path | ~LOC | Interface (rough) | Depth | Deps | Priority |
|--------|------|------|-------------------|-------|------|----------|
| accountingHelpers | `services/accounting/accountingHelpers.ts` | 240 | ~15 free functions | Medium — one sign fact, many projections | in-process | P0 merge |
| AccountingDomainService | `services/accounting/AccountingDomainService.ts` | 90 | ~7 methods; duplicates helpers | Shallow wrapper | in-process | P0 merge |
| ImportBalanceCalculator | `services/import/ImportBalanceCalculator.ts` | 92 | 1 function | Medium — mutates batch in place | in-process + DB currencies | P2 purify |
| journalPresenter | `utils/journalPresenter.ts` | 298 | object of display/semantic helpers | Medium — domain in utils | in-process | P1 relocate |
| prepareJournalData | `services/ledger/prepareJournalData.ts` | — | prepare helpers | Medium | in-process | P2 |
| ledgerRead / ledgerWrite | `services/ledger/ledger*Service.ts` | ~90–190 | small | Medium–Deep | local-substitutable | P3 |
| AccountResolutionService | `services/ledger/AccountResolutionService.ts` | 629 | small entry, deep match logic | Deep | local-substitutable | P3 |
| SmsParser / RuleMatcher | `services/ledger/*` | — | parse/match | Deep | in-process | P3 |

**Deletion test:** utils accounting facades already deleted (good). DomainService alone would mostly vanish into helpers. Helpers encode normal-balance rules — deleting them reappears across reports, wealth, raw SQL, rebuild, import.

**Smell:** dual public seam for the same sign table; SQL CASE strings in AccountRepository can drift from JS multipliers.

**Deepening:** `BalanceEffects` with `effect` / `foldBalances` / `checkJournal` (Design-It-Twice 2026-07-24). Leave `isBackdated`, distinct-accounts, `constructSimpleJournal` with journal callers.

---

### 4.2 Safe-to-Spend & simulation

| Module | Path | ~LOC | Interface | Depth | Deps | Priority |
|--------|------|------|-----------|-------|------|----------|
| SafeToSpendReadModel | `services/simulation/SafeToSpendReadModel.ts` | 437 | observe + clearCache; fat `SafeToSpendResult` | Deep Impl, medium Interface | local-substitutable + FX external | P0 Interface |
| NotificationService (STS bits) | `services/notification/NotificationService.ts` | — | re-export + observe/clear/preWarm | **Pass-through** | n/a | P0 delete façade |
| CashFlowSimulationService | `services/simulation/CashFlowSimulationService.ts` | 573 | essentially `simulate(...)` | Deep | in-process | P3 internal |
| Simulator + flow engines | `simulation/Simulator.ts`, `engines/*` | 235–302 | internal | Deep internal Modules | in-process | P3 |
| FlowPolicy / selectors | `simulation/utils/*`, `selectors/*` | — | internal | Deep | in-process | P3 |

**Call sites today:** dashboard VM, widget sync, NotificationService tests — all still import types from NotificationService.

**Smell:** fat result leaks simulation report + `accountMap`; prefs/currency threaded by every caller; tests mock ~12 peers at the wrong seam.

**Deepening (recommended hybrid from Design-It-Twice):**

```
safeToSpend.forWorkplace(id)
  .watch()           → Observable<SafeToSpend>   // domain-shaped
  .watchHeadline()   → Observable<Headline>      // widget
  .preWarm()         → Promise<void>
```

Absorb selectors into projection; thin `SafeToSpendMapper` to format/privacy. Defer facet/delivery protocol until a fourth caller (insights multi-window) exists. FX: no port until a second rates Adapter is real.

---

### 4.3 Journal domain & repository

| Module | Path | ~LOC | Interface | Depth | Deps | Priority |
|--------|------|------|-----------|-------|------|----------|
| JournalService (journalDomainService) | `services/journal/journalDomainService.ts` | 733 | ~11 write/lifecycle methods + observe + suggestions | Deep | local-substitutable | P2 tighten |
| journalEnrichedObserver | `services/journal/journalEnrichedObserver.ts` | — | enrichment pipeline | Deep | local-substitutable | P3 |
| JournalRepository | `data/repositories/JournalRepository.ts` | 1018 | ~30 methods (CRUD + SMS fingerprint + enrich + meta) | **Wide** — many intents one Module | local-substitutable | P1 split by intent |
| Feature editors | `useJournalEditor` 545, `useSimpleJournalEditor` 512, `useBulkJournalEditor` 375, `useJournalEntryViewModel` 396 | — | huge hook Interfaces | Shallow–Medium (orchestration + rules) | mixes UI + domain | P1 push down |

**Smell:** repository is a catch-all for persistence *and* SMS-dedup *and* enrichment queries. Editors re-encode validation/flow that `prepareJournalData` / DomainService already know.

**Deepening:** keep JournalService as the write Interface; split repository into persistence vs SMS-lookup vs enrichment query Modules (or at least internal seams with separate test surfaces). Editors should call one save Interface, not assemble ledger rules.

---

### 4.4 Accounts & hierarchy

| Module | Path | ~LOC | Interface | Depth | Priority |
|--------|------|------|-----------|-------|----------|
| AccountService (accountDomainService) | `services/accounts/accountDomainService.ts` | 719 | create/update/reconcile/merge/adjust/… | Deep | P2 |
| AccountRepository | `data/repositories/AccountRepository.ts` | 708 | ~33 methods | Wide | P1 |
| accountMetadataDomain | `features/accounts/services/accountMetadataDomain.ts` | ~140 | form defaults/serialize | Medium — correctly feature-local? | P3 |
| useAccountDetailsViewModel | features | 594 | large | Shallow–Medium | P1 |
| useAccountFormViewModel | features | 432 | large | Medium | P2 |
| useAccountsListViewModel | features | 395 | large | Medium | P2 |
| BalanceService | `services/BalanceService.ts` | 492 | few public methods; heavy hierarchy FX | **Deep** | P3 |

**BalanceService** is a showcase deep Module: callers ask for balances; Implementation hides hierarchy cache, FX, snapshots, precision.

---

### 4.5 Budgets & planned payments

| Module | Path | Depth | Priority |
|--------|------|-------|----------|
| budgetReadService | `services/budget/budgetReadService.ts` | Deep (usage observation) | P3 |
| budgetWriteService | `services/budget/budgetWriteService.ts` | Medium | P3 |
| PlannedPaymentService | `services/PlannedPaymentService.ts` ~701 | Deep (schedule generation) | P2 — watch Interface width |
| BudgetRepository / PlannedPaymentRepository | data | Medium repositories | P3 |

---

### 4.6 Reports, wealth, insights

| Module | Path | ~LOC | Depth | Priority |
|--------|------|------|-------|----------|
| ReportService | `report-service.ts` | 737 | Medium–Deep; wide report surface | P1 coalesce entry points |
| reportingDeltaEngine | `reports/reportingDeltaEngine.ts` | — | Medium; depends on helpers | P0 after BalanceEffects |
| wealth-service | `wealth-service.ts` | 301 | Medium | P2 |
| InsightService + insightCalculator | `insight/*` | ~130 + calc | Deep observe Interface | P3 |
| ReactiveDataService | `ReactiveDataService.ts` | 617 | Medium–Deep dashboard orchestration; many observe* methods | P1 — possibly split dashboard vs accounts streams |

**Smell:** ReportService and ReactiveDataService both assemble “dashboard-ish” knowledge; risk of dual ownership with Safe-to-Spend / wealth.

---

### 4.7 Integrity, rebuild, workplace

| Module | Depth | Notes | Priority |
|--------|-------|-------|----------|
| IntegrityService ~567 | Deep | startup verification; SMS coupling | P2 |
| AccountingRebuildService | Deep | running balance rebuild | P3 |
| RebuildQueueService ~308 | Medium–Deep | queue/coordination | P3 |
| WorkplaceService ~224 | Medium | workplace + currency | P3 |
| currency-init-service | Medium | | P3 |

---

### 4.8 SMS & inbox

| Module | Path | Depth | Seam | Priority |
|--------|------|-------|------|----------|
| SmsInboxBridge | `sms/SmsInboxBridge.ts` | Thin Adapter | **Real** — native module vs stubs/tests | P3 |
| SmsRuleEngine | `sms/SmsRuleEngine.ts` ~343 | Deep | in-process | P3 |
| SmsSyncPipeline | `sms/SmsSyncPipeline.ts` ~504 | Deep | local + native | P2 |
| sms-service | `sms-service.ts` ~268 | **Shallow façade** — re-exports engines + types; delegates | Pass-through-ish | P0–P1 retire barrel |
| RuleMatcher / SmsParser | ledger | Deep | in-process | P3 |

**Callers** import almost exclusively from `sms-service`, which teaches a wide Interface (types + methods) without adding depth.

**Deepening:** make `SmsSyncPipeline` / `SmsRuleEngine` the external seams; delete re-export barrel; keep a tiny inbox façade only if it still earns keep after deletion test.

---

### 4.9 AI & transaction ingestion

| Module | Path | Depth | Seam | Priority |
|--------|------|-------|------|----------|
| LLMEngine / DynamicLLMEngine | `ai/types.ts` | Interface only | **Real** — SmallModelProvider + mocks in tests | P3 protect |
| SmallModelProvider | `ai/SmallModelProvider.ts` | Deep Adapter | true-external/native weights | P3 |
| ModelManagementService | `ai/ModelManagementService.ts` | Deep download/lifecycle | true-external | P3 |
| TransactionIngestionService | `transaction-ingestion/TransactionIngestionService.ts` | Deep — small `ingest()` | composes PipelineSteps | P3 |
| PipelineStep + 3 steps | `pipeline/steps/*` | Deep pattern | **Real** multi-step Adapters | P3 |
| NativeAIProvider | wraps LLMEngine | Medium Adapter | | P3 |
| TransactionFallbackAIProvider (mock) | second Adapter | | P3 |
| TransactionService | posting from parsed | Medium | | P2 |

**CONTEXT.md alignment:** Pipeline / PipelineStep / PipelineContext / LLMEngine match the code. Good locality.

**Smell:** `TransactionIngestionService` constructs steps and reaches into `preferences` + `smallModelProvider` internally (harder to test without globals). Prefer accepting AI provider at construction for tests (already partially via `setAiProvider`).

---

### 4.10 Import & export

| Module | Depth | Seam | Priority |
|--------|-------|------|----------|
| ImportPlugin Interface | **Real seam** — ivy, cashew, native (+ tests) | exemplar | P3 preserve |
| ImportRegistry / ImportRunner | Medium | | P3 |
| ImportService | Medium–Deep orchestration | | P2 |
| ImportRepository ~860 | Wide (batch persist) | local-substitutable | P1 |
| MockDataSeederService ~740 | Deep test/dev Module | | P3 |
| ExportService ~669 | Medium–Deep; many format methods | | P2 |
| SharingService + ShareProvider | Deep share orchestration; **Real** ShareProvider seam (TransactionShareProvider) | | P3 |

Import plugins are a textbook deep Module cluster: small detect/parse Interface, large per-format Implementation.

---

### 4.11 Exchange rates, analytics, prefs, navigation

| Module | Path | Depth | Deps | Priority |
|--------|------|-------|------|----------|
| ExchangeRateService | `exchange-rate-service.ts` ~298 | Medium–Deep | true-external + local cache | P2 — only add RatesPort when 2nd Adapter exists |
| analytics-service | ~501 | Medium | true-external | P3 |
| preferences | `utils/preferences.ts` ~557 | **Wide** bag of prefs + observe | local | P1 group by domain |
| navigation | `utils/navigation.ts` ~710 | Wide routing helpers | UI | P2 |
| money / dateUtils / logger / Trace / Snapshot | utils | Deep pure or cross-cutting | | P3 |
| SnapshotService | side-effect Module used by STS | Medium | | P3 keep internal to callers |

---

### 4.12 Data repositories (remaining)

| Repository | ~LOC | Depth note | Priority |
|------------|------|------------|----------|
| TransactionRepository | 645 | Wide CRUD/observe | P2 |
| TransactionRawRepository + raw/* | 426+ | Deep SQL metrics/rebuild/patterns — good locality for perf | P3 |
| Budget / PlannedPayment / Currency / ExchangeRate / BalanceSnapshot / Audit / Reconciliation / AutoPostRule / Workplace / Database | smaller | Mostly appropriate Adapters | P3 |

**Pattern:** the largest repositories accumulate unrelated query intents. Prefer intent Modules (`JournalSmsLookup`, `JournalEnrichmentQueries`) over one god repository — even if they share the same Watermelon collection Adapter internally.

---

### 4.13 Features / view-models / UI

~28 `use*ViewModel` Modules. Largest risk concentrations:

| View-model | ~LOC | Issue | Priority |
|------------|------|-------|----------|
| useAccountDetailsViewModel | 594 | Domain + presentation + data wiring | P1 |
| useJournalEditor / useSimpleJournalEditor | 545 / 512 | Editor state machines; risk of re-validating ledger rules | P1 |
| useSmsRuleFormViewModel | 447 | Rule domain in UI layer | P2 |
| useAccountFormViewModel | 432 | | P2 |
| useTransactionDetailsViewModel | 414 | | P2 |
| useTransactionInboxViewModel | 392 | | P2 |
| useDashboardViewModel | 272 | Wires STS via NotificationService | P0 retarget |
| SafeToSpendMapper | — | Selectors that should move into STS Module | P0 with STS |

**design-system / components / charts:** mostly presentational — depth is fine as UI primitives. Do not invent domain seams here.

**Contexts:** `UIContext`, `WorkplaceContext` — keep free of ledger math (current direction after prefs sync is good).

**Global hooks:** `useObservable`, pagination, charts — deep utilities. `useLedgerTransactions` / exchange hooks — thin adapters over services (acceptable).

---

### 4.14 Native modules

| Module | Role | Seam |
|--------|------|------|
| `modules/expo-sms-inbox` | Device SMS access | Real Adapter behind SmsInboxBridge |
| `modules/expo-widgets` | Home-screen widgets | Real Adapter; fed by STS headline |

These justify ports at the app edge. Do not mirror ports inward for in-process math.

---

## 5. Real seams vs hypothetical seams

### Real (preserve)

| Seam | Adapters |
|------|----------|
| `ImportPlugin` | native, ivy, cashew (+ tests) |
| `ShareProvider` | TransactionShare + BugReport (semi — more content Adapters welcome) |
| `TransactionExtractor` | SMS + Voice |
| `TransactionFallbackAIProvider` | NativeAIProvider, mock |
| `PipelineStep` | Context / Deterministic / AiFallback (**keep internal**) |
| `LLMEngine` | SmallModelProvider + test mocks (prod seam weak until 2nd engine) |
| `RevertHandler` registry | multiple audit handlers |
| Native SMS / widgets / DB / files | expo-sms-inbox, expo-widgets, native/web/Loki, platform file Adapters |
| WatermelonDB repositories | production DB vs test stand-ins |

### Hypothetical / pass-through (remove or don’t add)

| Surface | Why |
|---------|-----|
| NotificationService → SafeToSpend | One Adapter, zero added behaviour |
| sms-service re-export barrel | Teach types without depth |
| AccountingDomainService over helpers | Class-shaped re-export of pure functions |
| RatesPort (today) | Only one production rates path — add when mock Adapter is intentional |
| Extra ports around CashFlowSimulationService | In-process; internal seam only |

---

## 6. Ranked deepening backlog

| Rank | Candidate | Why | Dep category | Suggested Interface direction |
|------|-----------|-----|--------------|-------------------------------|
| 1 | Safe-to-Spend | Fat result + wrong entry seam | local-substitutable + FX | Hybrid handle + domain projection (§8) |
| 2 | BalanceEffects | Dual path; sign rules scatter | in-process | `effect` / `foldBalances` / `checkJournal` |
| 3 | SMS façade retirement | Pass-through barrel | n/a | Import engines directly; keep only inbox query if deletion test keeps it |
| 4 | preferences split | Classic shallow bag (~25 keys × getters) | local | Domain groups (sts, ai, ui, sms, privacy) |
| 5 | JournalRepository split | ~30-method catch-all | local-substitutable | Intent-shaped query/write Modules |
| 6 | AccountRepository / TransactionRepository | Shallow-wide CRUD bags | local-substitutable | Use-case Modules (hierarchy, merge, list-with-metrics) |
| 7 | SafeToSpendMapper / dashboard VMs | Selectors + wrong import path | — | Thin after STS reshape |
| 8 | ledgerReadService + JournalService read pass-throughs | Deletion test fails | local-substitutable | One journal read Module; drop mirrors |
| 9 | ReportService / ReactiveDataService | Wide observe surfaces; parallel hubs with STS | local-substitutable | Fewer entry points; shared base observes |
| 10 | CashFlowSimulationService.simulate | Deep body, ~12-arg Interface | in-process | `SimulationInput` DTO (or self-fetch) |
| 11 | PlannedPaymentService | Pure recurrence buried with posting/merge | local-substitutable | Split recurrence Module vs write Module |
| 12 | IntegrityService | Verify/repair mixed with nuclear reset | local-substitutable | Split verify vs destructive maintenance |
| 13 | Fat account/journal view-models | 400–600 LOC orchestration | — | Push rules to domain; keep UI state only |
| 14 | AnalyticsService | ~40 `logX` wrappers | true-external | `track(event, props)` (+ identify/screen) |
| 15 | ImportBalanceCalculator purity | Mutates batch | in-process | Return balances; caller assigns |
| 16 | journalPresenter home | Domain in utils; tests under accounting | in-process | Move next to accounting/journal |
| 17 | JournalValidator | Zero prod callers; pass-through | in-process | Delete |
| 18 | AppText vs design-system Text | Duplicate typography Modules | UI | One Module, one Interface |
| 19 | Date-range / privacy / use-import | Triple period seams; mask reimplemented; import in hooks | UI / local | Unify period + privacy; import → service + thin Adapter |
| 20 | CONTEXT LiteRTAdapter | Named Inference Adapter missing | docs | Align glossary with `SmallModelProvider` |

---

## 7. Testing posture (replace, don’t layer)

| Current smell | Target |
|---------------|--------|
| NotificationService tests mock 12 peers for STS | Tests at `safeToSpend.watch()` / headline |
| AccountingHelpers tests + DomainService tests overlapping | Tests at `BalanceEffects` only |
| Feature JournalService.test mocks DomainService | Prefer crossing JournalService seam with local DB stand-in |
| Sms tests via façade | Test SmsRuleEngine / SmsSyncPipeline Interfaces |

When a Module is deepened, **delete** shallow tests that only asserted pass-through.

---

## 8. Design-It-Twice outcomes already decided (2026-07-24)

### 8.1 Safe-to-Spend (hybrid)

- **From “common caller”:** `forWorkplace` → `watch` / `watchHeadline` / `preWarm`; currency + `safeToSpendDays` inside Implementation.  
- **From “minimize”:** domain-shaped `SafeToSpend` (answer / series / narrative / byAccount); absorb selectors; kill Notification re-exports.  
- **Deferred (“flexibility”):** facet + delivery protocol — revisit if insights need alternate windows as a first-class caller.

### 8.2 Accounting (`BalanceEffects`)

- Merge helpers + DomainService math into one pure Module.  
- Three entry points; journal scaffolding stays with journal.  
- No ports.

---

## 9. What is already deep (do not “fix”)

Protect these; deepen callers toward them instead of rewriting:

- `BalanceService` hierarchy + FX aggregation  
- `CashFlowSimulationService` + engines  
- `TransactionIngestionService` Pipeline  
- `LLMEngine` Adapter pair  
- `ImportPlugin` registry  
- `ShareProvider`  
- `InsightService.observePatterns`  
- `AccountResolutionService` matching  
- Raw transaction metrics/rebuild SQL Modules  

---

## 10. Documentation drift checklist

Update when implementing deepenings:

- [ ] ARCHITECTURE.md — Safe-to-Spend owner; NotificationService scope  
- [ ] CONTEXT.md — add Safe-to-Spend / BalanceEffects terms if they become domain language  
- [ ] This file — mark backlog items done; refresh LOC/priorities quarterly  
- [ ] FEATURE_MATRIX / TEST_COVERAGE if Interface changes move test surfaces  

---

## 11. Additional findings from full cluster surveys

Details live in [surveys/](./surveys/). Highlights not fully expanded above:

### Journal / ledger ([surveys/journal.md](./surveys/journal.md))
- `JournalService.observeEnrichedJournals` / `getJournalSuggestions` are shallow pass-throughs.
- Create goes through `ledgerWriteService`; update through `journalRepository` — callers must know the split (Interface smell).
- `ledgerReadService` ≈ repository mirror; deletion test fails for most methods.
- `prepareJournalData` is the right validation locality; editors still risk re-validating.

### AI / SMS ([surveys/ai_sms.md](./surveys/ai_sms.md), [surveys/sms_import.md](./surveys/sms_import.md))
- `LLMEngine` has **one** production Adapter (`SmallModelProvider`) → production seam is mostly hypothetical; test mocks justify an *internal* seam.
- CONTEXT’s `LiteRTAdapter` name is unused — glossary drift.
- `TransactionFallbackAIProvider` **is** a real seam (Native + mock).
- Pipeline steps are shallow individually; depth is in `ingest()` composition — keep steps internal, not a public export surface.
- `SmsSyncPipeline` tends toward god-class; façade collapse is higher leverage than rewriting the pipeline first.
- Duplicate `@processed_sms_ids` knowledge between SmsService and pipeline.

### Data / features ([surveys/data_features.md](./surveys/data_features.md))
- PlannedPaymentRepository correctly anemic (domain in PlannedPaymentService).
- `TransactionRawRepository` is partly façade over deep `raw/*` Modules — depth is in the right place.
- Account uniqueness dual ownership: repo throws + `useAccountValidation` mirrors.
- Feature hierarchy tree walks duplicate knowledge that `accountDomainService` also owns.

### UI / design-system ([surveys/ui.md](./surveys/ui.md))
- `useObservable` empty-array ⇒ loading is a surprising Interface invariant.
- AppConfig is a deep Module with an Interface that is too large (behaviour vs copy vs layout).
- `AppText` vs design-system `Text` — duplicate typography.
- Report widgets mostly shallow; depth stays in report hooks/services.
- Account picker embeds domain sectioning rules in common UI.

### Services overview ([surveys/services.md](./surveys/services.md), [surveys/reports_sim.md](./surveys/reports_sim.md))
- Reinforces BalanceService / simulation / import plugins as protect-list.
- ReactiveDataService and ReportService remain the wide orchestration risk for dashboard locality.

---

## 12. Method & coverage notes

**Surveyed:** `src/services/**` (~30k LOC TS), `src/data/repositories/**`, `src/features/**` view-models, `src/utils/**`, `src/hooks/**`, `src/contexts/**`, `src/components/**`, `src/design-system/**`, AI/ingestion pipeline, SMS, import plugins, native `modules/`, ARCHITECTURE + CONTEXT.

**Seven parallel cluster surveys** produced the files under [surveys/](./surveys/); this AUDIT reconciles them with direct reads and call-site greps. Where a survey and this AUDIT disagree on priority, **this AUDIT wins** (surveys are evidence; AUDIT is the decision log).

**Not a substitute for:** security review, performance profiling, or product prioritization — only Interface/depth design.

**Next review trigger:** after implementing STS hybrid or BalanceEffects; or when adding a fourth Safe-to-Spend caller / new import format / new inference backend (those extend *real* seams).

---

## 13. Quick reference — pass-through & shallow hit list

Delete or collapse when next touching the cluster:

1. `NotificationService.observeSafeToSpend` / type re-exports / `clearCache` STS  
2. `sms-service` type re-export block (engines/types barrel)  
3. `AccountingDomainService` duplicate multiplier methods + alias `accountingService`  
4. `JournalValidator` (0 prod callers)  
5. `ledgerReadService` one-line repo forwards  
6. `JournalService` observe/suggestions pass-throughs (or move to a dedicated read Module)  
7. Any new `utils/*` barrel that only re-exports `services/*`  
8. Dashboard/widget imports of STS types from NotificationService  
9. `DateRangeFilter` rename-only wrapper over Trigger (if still present)  
10. Insight imports via Notification barrel — import `insightService` directly  

---

*End of audit. Interactive overview: Cursor canvas `codebase-design-audit`.*
