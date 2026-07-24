# Codebase-design audit: data / features / contexts / hooks

Scope: `/Users/sahilsoni/me/projects/full-frills-balance/src/{data,features,contexts,hooks}`.  
Dual ownership with `src/services/**` is flagged where the same rules live twice (feature + domain Modules outside this scope).

---

## Cluster A — `src/data/database`

### Database Adapter
| | |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/data/database/adapter.ts` (+ `.native.ts`, `.web.ts`) |
| **Interface size** | Tiny: default export of a WatermelonDB adapter instance |
| **Depth** | **pass-through** (factory only) |
| **Deletion test** | Delete → Metro platform resolution breaks; no domain complexity vanishes |
| **Dependency category** | **Local-substitutable** (SQLite native / LokiJS web+tests) |
| **Seams** | **Real**: three Adapters (native SQLite+JSI, web, LokiJS default). Classic multi-Adapter seam. |

### Schema + Migrations
| | |
|---|---|
| **Path** | `schema.ts` (~368), `migrations.ts` (~875) |
| **Interface size** | Schema table definitions; migration step list |
| **Depth** | **medium** (schema) / **deep** (migrations encode historical invariants) |
| **Deletion test** | Complexity reappears as broken upgrades and lost columns — earning keep |
| **Dependency category** | Local-substitutable |
| **Seams** | Hypothetical alone; real only via adapter platform split |

### Database / DatabaseUtils / idGenerator
| Module | Path | Interface | Depth | Notes |
|---|---|---|---|---|
| Database | `Database.ts` (~50) | singleton DB handle | shallow | Wiring |
| DatabaseUtils | `DatabaseUtils.ts` (~38) | raw-SQL capability helpers | shallow | Supports raw-query Adapters |
| idGenerator | `idGenerator.ts` (+ `.native.ts`) | ID creation | shallow | Real platform seam (2 Adapters) |

---

## Cluster B — `src/data/models`

Models are mostly **anemic record shapes** (WatermelonDB `@field` bags). Domain enums/helpers on `Account` are the exception.

### Account (+ subtype catalog)
| | |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/data/models/Account.ts` (~195) |
| **Interface size** | Large enum surface + 6 helpers (`getAccountSubtypesForType`, `isSubtypeAllowedForType`, …) + record fields |
| **Depth** | **medium** for catalog helpers; record class itself **shallow** |
| **Deletion test** | Subtype rules scatter into ImportRepository, forms, simulation — helpers earn keep; record class does not |
| **Dependency category** | In-process |
| **Seams** | Hypothetical (no second Adapter) |
| **Leakage** | Catalog is co-located with persistence model — good Locality for subtype rules |

### Other models (anemic)
`Journal`, `Transaction`, `Budget`, `BudgetScope`, `PlannedPayment`, `AuditLog`, `Currency`, `ExchangeRate`, `Workplace`, `BalanceSnapshot`, `AccountMetadata`, `JournalMetadata`, `TransactionInboxRecord`, `TransactionAutoPostRule`, `BaseScopedModel`

| | |
|---|---|
| **Interface size** | Field surface only |
| **Depth** | **shallow** / anemic |
| **Deletion test** | Schema mapping vanishes; behaviour lives elsewhere |
| **Note** | `Journal` denormalizes `totalAmount` / `displayType` / `transactionCount` — computation owned by callers (`src/services`), not the model |

---

## Cluster C — `src/data/repositories` (deep vs anemic)

### Deep repositories

#### JournalRepository — **DEEP** (fat persistence Module)
| | |
|---|---|
| **Path** | `.../JournalRepository.ts` (~1018) |
| **Interface size** | **Large** (~32 public methods): observe*, find*, SMS fingerprint lookups, `prepareCreateJournalWithTransactions`, create/update/softDelete, reverse/replace, enrichment raw |
| **Depth** | **Deep** Implementation; Interface is **wide** (depth-as-leverage still high for atomic journal+tx+metadata batches) |
| **Deletion test** | Soft-delete/replace/SMS linkage/batch prep reappear across ledger write paths — earns keep |
| **Dependency category** | Local-substitutable |
| **Seams** | Hypothetical port; singleton export. Internal seam: prepare* vs write* for batch composition |
| **Flag** | Persistence + operational domain (reversal, SMS dedupe) mixed. Callers must know `PrepareCreateJournalData` already has `totalAmount`/`displayType`/`calculatedBalances` — those rules live in `src/services`, not here |

#### AccountRepository — **DEEP** (mixed)
| | |
|---|---|
| **Path** | `.../AccountRepository.ts` (~708) |
| **Interface size** | **Large** (~27 pubs): CRUD, observe, hierarchy queries, `getAccountListItemsRaw`, `prepareMergeOperations`, subtype/name validation |
| **Depth** | **Deep** for `getAccountListItemsRaw` (running_balance + period increase/decrease SQL); CRUD portion more medium |
| **Deletion test** | List SQL + uniqueness/subtype validation would scatter — deep parts earn keep |
| **Dependency category** | Local-substitutable |
| **Seams** | Hypothetical; raw SQL gated by `supportsRawSql` (internal Adapter capability) |
| **Domain in repo** | `ensureUniqueName`, `validateSubtype` — real rules behind persistence Interface |

#### ImportRepository — **DEEP**
| | |
|---|---|
| **Path** | `.../ImportRepository.ts` (~860) |
| **Interface size** | **Small method count** (`batchInsert`, `applyChanges`) but **huge DTO Interface** (many `Imported*` types + coercion helpers) |
| **Depth** | **Deep** Implementation; Interface knowledge cost is the DTO zoo |
| **Deletion test** | Cross-table batch + enum coercion + running-balance prep reappear everywhere — earns keep |
| **Dependency category** | Local-substitutable |
| **Seams** | Hypothetical |

#### TransactionRawRepository + raw query Modules — **DEEP**
| Module | Path | Interface | Depth |
|---|---|---|---|
| TransactionRawRepository | `TransactionRawRepository.ts` (~426) | ~14 raw/observe methods (facade) | **deep** + some **pass-through** to raw/* |
| TransactionRawMetricsQueries | `raw/TransactionRawMetricsQueries.ts` (~328) | balances, daily/account deltas, unreconciled | **deep** |
| TransactionRawRebuildQueries | `raw/...Rebuild...ts` (~199) | sum + rebuild rows | **deep** |
| TransactionRawPatternQueries | `raw/...Pattern...ts` (~106) | recurring patterns | **medium–deep** |

| | |
|---|---|
| **Deletion test** | Balance/metrics SQL reappears in BalanceService / reports / account details — high Leverage |
| **Dependency category** | Local-substitutable (raw SQL may no-op on Loki) |
| **Seams** | Real capability seam: raw vs ORM fallbacks inside metrics queries |
| **Flag** | Facade is partly pass-through; depth lives in `raw/*` |

#### TransactionRepository — **medium–deep**
| | |
|---|---|
| **Path** | `.../TransactionRepository.ts` (~645) |
| **Interface size** | Large (~27): create/find/observe/count by account/journal/date |
| **Depth** | **Medium**: active-journal join rules + deterministic sort are real; mostly query plumbing |
| **Deletion test** | `buildActiveClauses` / sort contract would duplicate — partial earn |
| **Domain** | create validates required fields + amount precision; not full accounting |

### Medium repositories

| Module | Path | Interface | Depth | Deletion / notes |
|---|---|---|---|---|
| BudgetRepository | `BudgetRepository.ts` (~209) | ~11 CRUD+scope | **medium** | Scope sync on update is real; period math is *not* here (`BudgetPeriodUtils`) |
| BalanceSnapshotRepository | `BalanceSnapshotRepository.ts` (~177) | ~5 + raw latest | **medium** | Raw window-function query is deep island; rest CRUD |
| ReconciliationRepository | `ReconciliationRepository.ts` (~133) | 3 methods | **medium** | Variance/`isReconciled` domain **leaked into** data tier; depends on `balanceService` — odd dependency direction |
| TransactionAutoPostRuleRepository | `...AutoPostRule...ts` (~167) | ~7 | **medium** | `save` normalizes conditions; merge ops |
| ExchangeRateRepository | `ExchangeRateRepository.ts` (~153) | ~9 | **medium** | Cache/batch/delete |
| AuditRepository | `AuditRepository.ts` (~142) | ~7 | **medium** | JSON stringify safety in `applyEntryToRecord` |
| DatabaseRepository | `DatabaseRepository.ts` (~107) | 3 destructive ops | **medium** | Reset/purge; dangerous Interface |

### Anemic / shallow repositories

| Module | Path | Interface | Depth | Flag |
|---|---|---|---|---|
| PlannedPaymentRepository | `PlannedPaymentRepository.ts` (~164) | CRUD+observe | **anemic / shallow** | Scheduling domain lives in `PlannedPaymentService` (~701) — correct split |
| WorkplaceRepository | `WorkplaceRepository.ts` (~85) | CRUD+observe | **anemic** | Domain in `WorkplaceService` |
| CurrencyRepository | `CurrencyRepository.ts` (~135) | find/seed/precision | **shallow–medium** | Precision fallback is small depth |
| TransactionTypes | `TransactionTypes.ts` | DTOs only | n/a | Shared types for raw queries |

---

## Cluster D — `src/features` (by feature)

Pattern: most `*ViewModel` hooks are **orchestration shells** (observe → format → navigate → toast). Domain Modules usually sit in `src/services/**`; feature-local exceptions called out.

### D1 — accounts

#### accountMetadataDomain — **medium–deep** (feature-local domain Module)
| | |
|---|---|
| **Path** | `.../features/accounts/services/accountMetadataDomain.ts` (~142) |
| **Interface size** | Small: defaults / validate / serialize / icon |
| **Depth** | **medium** (APR↔bps, day ranges, category skip) |
| **Deletion test** | Form + persist paths reimplement conversion — earns keep |
| **Dependency category** | In-process |
| **Seams** | Hypothetical |
| **Dual ownership** | Simulation/`accountDomainService` also read metadata fields; validation Locality is feature-side only |

#### transformAccounts — **shallow mapper** with UI caching
| | |
|---|---|
| **Path** | `.../features/accounts/utils/transformAccounts.ts` (~272) |
| **Interface size** | One main fn + large options bag |
| **Depth** | **shallow** (format + section totals already computed upstream) |
| **Deletion test** | Formatting scatters into list UI — thin earn; cache is Implementation detail |
| **Flag** | Correct shallow mapper; balance aggregation **not** here (ReactiveDataService / BalanceService) |

#### useAccountValidation — **dual ownership**
| | |
|---|---|
| **Path** | `.../hooks/useAccountValidation.ts` |
| **Depth** | **shallow** UI mirror of `AccountRepository.ensureUniqueName` |
| **Flag** | Same uniqueness rule in repo (throw) + hook (toast/error state) — dual ownership |

#### useManageHierarchyViewModel / useAccountHierarchyTree — **domain leakage into VM**
| | |
|---|---|
| **Paths** | `useManageHierarchyViewModel.ts` (~267), `details/useAccountHierarchyTree.ts` |
| **Depth** | **medium** inside VM: descendant walk, “can take child if directTransactionCount===0” |
| **Dual ownership** | Hierarchy/move/merge rules also in `src/services/accounts/accountDomainService.ts` (~719). Feature VMs re-implement tree walks; write path correctly delegates merge/reconcile to domain |

#### useAccounts / useAccountDetails* / forms
| Module | Depth | Notes |
|---|---|---|
| `useAccounts.ts` | pass-through / shallow | Observable wiring to repos + `accountService` / `balanceService` / `reactiveDataService` |
| `useAccountDetailsViewModel.ts` (~594) | shallow orchestration, **large Interface** | Composes metrics/actions/tree |
| `useAccountDetailsMetrics.ts` | shallow | Net change / daily avg from raw metrics — light derived math |
| `useAccountFormViewModel.ts` (~432) | shallow–medium | Uses `accountMetadataDomain`; persistence via actions |
| `useAccountPersistence.ts` | shallow | Balance-adjust trigger when typed balance ≠ current — orchestration of domain |

**Accounts summary flags**
- Repositories: Account **deep**; PlannedPayment/Workplace anemic by design  
- VMs re-implement hierarchy eligibility  
- Unique-name rule duplicated (repo + hook)

---

### D2 — journal

#### Feature “services” folder
Only `__tests__` — domain is `src/services/journal/journalDomainService`, `ledger/*`, `accounting/JournalCalculator`. Tests live under feature for Locality of scenarios.

#### useAdvancedJournalSummary / useJournalEditor — **thin Adapters over deep Modules**
| | |
|---|---|
| **Paths** | `entry/hooks/useAdvancedJournalSummary.ts`, `useJournalEditor.ts` |
| **Depth** | **shallow** wrappers; real depth in `JournalCalculator` |
| **Leakage** | Editor encodes simple-mode source/dest heuristics (ASSET/LIABILITY vs EXPENSE/INCOME) — **domain rules in UI hook** |
| **Dual ownership** | Balancing math correctly centralized; display-type / line-role heuristics split |

#### journalUiUtils.mapJournalToCardProps — **shallow mapper**
| | |
|---|---|
| **Path** | `utils/journalUiUtils.ts` (~79) |
| **Depth** | **shallow** (icons/prefixes from `displayType`) |
| **Good** | Uses `journalPresenter` — presentation Locality outside VM |

#### List / entry / search VMs
| Module | Interface | Depth | Flag |
|---|---|---|---|
| `useJournalListViewModel.ts` (~372) | large | shallow | Income/expense totals from `displayType` — presentation aggregation |
| `useJournalSearchViewModel.ts` (~375) | large | shallow | Same pattern |
| `useJournalEntryViewModel.ts` (~396) | large | shallow orchestration | Delegates to editor + domain |
| `useTransactionDetailsViewModel.ts` (~414) | large | shallow | Planned-payment actions via `plannedPaymentService` |
| `useJournalActions.ts` | medium | pass-through | `journalService` / `ledgerWriteService` |
| `useAccountSelection.ts` | small | shallow | Filters via `isBalanceSheetAccount` utils |

---

### D3 — dashboard / safe-to-spend

#### SafeToSpendMapper — **medium** (UI derivation; not core finance)
| | |
|---|---|
| **Path** | `.../dashboard/mappers/SafeToSpendMapper.ts` (~210) |
| **Interface size** | One static `mapToViewModel` + options |
| **Depth** | **medium**: formatting, privacy mask, `effectiveTotal` bar normalization, selector wiring |
| **Deletion test** | UI normalization/`effectiveTotal` would leak into views — earns keep for UI; **not** the safe-to-spend engine |
| **Dual ownership** | Engine in `CashFlowSimulationService` / `NotificationService` / selectors under `src/services/simulation` |
| **Note** | Comment admits `effectiveTotal` is UI scale, not a financial metric — good seam awareness |

#### useDashboardViewModel / useSafeToSpendView
| | Depth | Notes |
|---|---|---|
| `useDashboardViewModel.ts` (~272) | shallow | Composes insights/SMS/analytics |
| `useSafeToSpendView.ts` | pass-through | Calls mapper + analytics |

---

### D4 — budget

| Module | Path | Depth | Dual ownership |
|---|---|---|---|
| `useBudgetListViewModel.ts` | ~35 | pass-through | → `budgetReadService` |
| `useBudgetEditViewModel.ts` | ~174 | shallow | Filters liquid assets via subtype helper |
| `useBudgetDetailViewModel.ts` | ~351 | **shallow–medium** | Period labels via `BudgetPeriodUtils`; usage via `budgetReadService`; list presentation (badges/grouping) local |
| BudgetRepository | data | medium anemic-on-math | Period/usage depth is in services |

**Flag:** Budget math Locality is good in services; VM does not re-implement period engines.

---

### D5 — planned-payments

| Module | Depth | Notes |
|---|---|---|
| `PlannedPaymentRepository` | **anemic** | Correct |
| Feature hooks (`usePlannedPaymentForm`, Details VM, etc.) | shallow | Schedule/post/skip via `plannedPaymentService` |
| Form `nextOccurrence` on interval change | light domain in form | Service owns recurrence math — watch for drift |

---

### D6 — reports / wealth / hub / commitments

| Module | Depth | Notes |
|---|---|---|
| `useReportsViewModel.ts` (~301) | **shallow**, **large Interface** | Chart/legend formatting; data from `reportService` / `wealthService` |
| `useWealthSummary.ts` | pass-through | Reactive wealth |
| `useHub.ts` / `useInsightDetailsViewModel.ts` | shallow | Insights from notification/insight Modules |
| commitments screens | thin | Mostly screens |

---

### D7 — settings / onboarding / audit / app

#### OnboardingService — **medium–deep** feature Module
| | |
|---|---|
| **Path** | `.../onboarding/services/OnboardingService.ts` (~198) |
| **Interface size** | Small (`completeOnboarding(OnboardingData)`) |
| **Depth** | **medium–deep**: workplace reuse, dedupe, system accounts, seeding |
| **Deletion test** | Bootstrapping complexity reappears — earns keep |
| **Dependency category** | Local-substitutable (via repos/services) |
| **Good** | Small Interface, large behaviour — textbook deep Module shape |

#### useTransactionInboxViewModel — **domain leakage**
| | |
|---|---|
| **Path** | `.../settings/hooks/useTransactionInboxViewModel.ts` (~392) |
| **Depth** | **medium** inside VM: debit/credit → income/expense/transfer, note templates, account matching navigation |
| **Flag** | Classification rules belong with ingestion/SMS Modules; VM re-owns posting intent |

#### useSmsRuleFormViewModel (~447)
Large form Interface; condition building — UI depth, some rule-shape knowledge overlapping `SmsRuleEngine` / auto-post repo.

#### Audit VMs
| Module | Depth |
|---|---|
| `useAuditLogViewModel.ts` | shallow → `auditService` |
| `useAuditLogDiffViewModel.tsx` (~499) | **medium**: change parsing, financial key formatting, React presentation helpers mixed into hook |

#### Settings VMs (appearance, privacy, personalization, data management, workplace)
Mostly **shallow** preference/analytics orchestration. `useDataManagementViewModel` (~274) coordinates export/integrity — orchestration, not domain.

#### App hooks (`useAppBootstrap`, `useAppLockEngine`, `useTelemetry`, `useWidgetSync`, `useFonts`)
Infrastructure / UX — out of domain depth discussion; **shallow**.

---

## Cluster E — `src/contexts`

### WorkplaceContext
| | |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/contexts/WorkplaceContext.tsx` (~129) |
| **Interface size** | Tiny: `{ workplaceId, defaultCurrencyCode, setWorkplaceId }` |
| **Depth** | **medium**: observe prefs → load workplace → recover missing → ensure default |
| **Deletion test** | Bootstrap/recovery logic scatters — earns keep |
| **Dependency category** | Local-substitutable |
| **Seams** | Hypothetical (React context as delivery, not a second Adapter) |

### UIContext
| | |
|---|---|
| **Path** | `.../UIContext.tsx` (~669) |
| **Interface size** | **Very large** preference bag (theme, privacy, lock, notifications, safe-to-spend days, restart, …) |
| **Depth** | **shallow–pass-through** to `preferences` (documented HARD RULES forbid domain) |
| **Deletion test** | Mostly pass-through; complexity is preference persistence Locality elsewhere |
| **Flag** | Interface bloat without depth — classic shallow Module |

---

## Cluster F — `src/hooks` (shared)

| Module | Path | Interface | Depth | Category |
|---|---|---|---|---|
| useObservable | `useObservable.ts` (~257) | subscribe helpers | **medium** | In-process / Local-substitutable |
| usePaginatedObservable | `usePaginatedObservable.ts` (~245) | paging | **medium** | same |
| useDateRangeFilter | `useDateRangeFilter.ts` (~117) | period UI state | shallow–medium | In-process |
| useTransactionGrouping | `useTransactionGrouping.ts` (~83) | day grouping | **shallow** | In-process |
| useSelection | `useSelection.ts` (~118) | multi-select | shallow | In-process |
| useChartInteraction (+ registry) | ~208 + 14 | chart UX | shallow | In-process |
| use-import | `use-import.ts` (~170) | import UX glue | shallow orchestration | Local-substitutable |
| useExchangeRate(s) / use-currencies | small | pass-through | → exchange/currency Modules |
| useLedgerTransactions | ~35 | pass-through | thin |
| use-theme / color-scheme / reduced-motion / toast | various | UI plumbing | shallow | — |

No significant domain Modules here; good separation.

---

## Cross-cutting flags

### Repositories: deep vs anemic

| Deep | Anemic / shallow by design |
|---|---|
| JournalRepository | PlannedPaymentRepository |
| AccountRepository (esp. list SQL) | WorkplaceRepository |
| ImportRepository | CurrencyRepository (mostly) |
| TransactionRaw* | Most Watermelon models |
| TransactionRepository (active-join rules) | |

**Odd deep island:** ReconciliationRepository embeds variance domain while depending upward on BalanceService.

### View-models that re-implement domain rules

1. **Hierarchy eligibility / descendant walks** — `useManageHierarchyViewModel`, `useAccountHierarchyTree` vs `accountDomainService`  
2. **Unique account name** — `useAccountValidation` vs `AccountRepository.ensureUniqueName`  
3. **Inbox debit/credit → journal type** — `useTransactionInboxViewModel` vs ingestion pipeline  
4. **Simple journal source/dest heuristics** — `useJournalEditor` vs accounting/presenter Modules  
5. **SafeToSpendMapper.effectiveTotal** — intentional UI rule (OK) vs finance engine (separate)

### Dual ownership (feature + `src/services`)

| Concern | Feature-side | Service-side |
|---|---|---|
| Account merge/hierarchy | VMs + feature tests under `accounts/services/__tests__` | `accountDomainService` |
| Journal create/balance | editors call Calculator | `journalDomainService` + `ledgerWriteService` |
| Budget usage/periods | VMs call through | `budgetReadService` / `BudgetPeriodUtils` |
| Planned recurrence | form scheduling fields | `PlannedPaymentService` |
| Safe-to-spend | Mapper + UI | simulation + NotificationService |
| Account metadata validate/serialize | `accountMetadataDomain` | consumers in simulation/export without shared validate |

### Seams: real vs hypothetical

| Real (multi-Adapter) | Hypothetical (single Adapter / singleton) |
|---|---|
| DB adapter native / web / Loki | Nearly all repositories (exported singletons) |
| idGenerator platform split | Feature “ports” to services |
| Raw SQL vs ORM fallback (capability) | React context as seam |

### Depth map (mental model)

```
Deep persistence: JournalRepo, AccountRepo(list SQL), ImportRepo, TransactionRaw*
Deep domain (outside survey, but callers): accountDomainService, journalDomainService,
  BalanceService, PlannedPaymentService, simulation, JournalCalculator
Feature deep-ish: OnboardingService, accountMetadataDomain, SafeToSpendMapper (UI)
Feature shallow: most *ViewModel hooks
Pass-through: UIContext→prefs, many use* data hooks, PlannedPaymentRepository
```

### Locality / Leverage takeaways

- **Leverage is strong** at raw balance/metrics SQL and journal batch prepare/write.  
- **Locality is weak** for hierarchy rules and inbox classification (split across feature VMs and services).  
- Many view-models have **large Interfaces** (hundreds of lines of returned props) with **shallow Implementation** — high learning cost, low depth. Deepening opportunity: shrink VM Interfaces by pushing derived presentation into small pure mappers (as SafeToSpendMapper / transformAccounts already hint), without pulling finance rules into UI.