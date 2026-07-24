# Module Design Inventory

Vocabulary per `.agents/skills/codebase-design`: **Depth** = leverage at interface; **deletion test** = delete module → complexity vanishes (shallow) vs reappears across callers (earns keep); dep cats: **in-process** / **local-substitutable** / **remote-owned** / **true-external**.

---

## Cluster map

```
UI/hooks
  ├─ reportService ──► reportingDeltaEngine + accountingHelpers + repos
  ├─ wealthService ──► BalanceService + exchange + repos
  ├─ reactiveDataService ──► BalanceService + wealthService + repos
  ├─ notificationService ──► SafeToSpendReadModel ──► CashFlowSimulationService
  │                              │                         ├─ FlowGenerators
  │                              │                         ├─ FlowResolver
  │                              │                         ├─ Simulator
  │                              └─ BalanceService          └─ ReportGenerator
  ├─ budgetRead/Write
  └─ plannedPaymentService ──► rebuildQueue ──► AccountingRebuild
integrityService ──► AccountingRebuild (+ reset/cleanup side door)
accountingDomainService ≈ thin wrapper over accountingHelpers
```

---

## 1. `report-service` + `reportingDeltaEngine`

| Field | Assessment |
|---|---|
| **Paths** | `/Users/sahilsoni/me/projects/full-frills-balance/src/services/report-service.ts` (737), `.../reports/reportingDeltaEngine.ts` (153) |
| **Module** | Report aggregation façade + extracted delta pipeline |
| **Depth** | ReportService: **medium-shallow**. Engine: **deep** (in-process core behind 4 fns) |
| **Interface size** | ReportService ~**12 public methods** + 5 DTOs + `ReportSnapshot` mega-type. Engine: **4 exports**, params still heavy (`fetchRaw` callback) |
| **Dep category** | **Local-substitutable** (repos/DB) + FX cache |
| **Seams** | External: `ReportService` methods. Internal (good): delta convert/normalize/map/getScoped. Calculators (heatmap/sankey/history) already behind ReportService |
| **Deletion test** | Delete ReportService → callers reassemble FX + account scoping + period math. Delete engine alone → logic snaps back into ReportService. **Both earn keep**; ReportService interface is too wide for leverage |
| **Top smell** | **Wide menu interface**: production uses mainly `getReportSnapshot` / observe breakdown / one `getIncomeVsExpense`; rest is near-duplicate surface. Snapshot method is the deep entry; peers dilute it |
| **Priority** | **P1** — collapse callers onto snapshot/observe; keep engine as internal seam (don’t export more) |

---

## 2. `wealth-service`

| Field | Assessment |
|---|---|
| **Path** | `.../wealth-service.ts` (301) |
| **Depth** | **Split**: `calculateSummary(Sync)` deep-ish; `getNetWorthHistory` medium-deep but pulls I/O |
| **Interface size** | **3 methods**, 2 DTOs — small |
| **Dep category** | Summary: **in-process** (+ FX). History: **local-substitutable** |
| **Seams** | Object literal singleton; history couples to `balanceService` + raw txs |
| **Deletion test** | Summary logic would scatter (ReactiveData, wealth hooks). History rewind would scatter worse. **Earns keep** |
| **Top smell** | **Dual sync/async summary** forces callers to know cache-warm invariant (`getRateSafe`). Pure claim in comment vs repo I/O in history |
| **Priority** | **P2** — one summary entry (async or pre-warmed sync behind one fact); optional pure core for history rewind |

---

## 3. `simulation/*`

### 3a. `CashFlowSimulationService` (orchestrator)

| Field | Assessment |
|---|---|
| **Path** | `.../simulation/CashFlowSimulationService.ts` (573) |
| **Depth** | **Deep behaviour, shallow interface shape** — one method hides pipeline, but signature is a **12-arg bag** |
| **Interface size** | **1 method**, ~**12 params**, rich `SimulationRunResult`. Callers must assemble balances/PPs/journals/usages/accounts |
| **Dep category** | **Local-substitutable** (+ FX) |
| **Seams** | External: `simulate(...)`. Internal: generators → resolver → Simulator → report (good locality) |
| **Deletion test** | Complexity reappears everywhere. **Strong keep** |
| **Top smell** | **Param explosion / missing input DTO** — interface complexity ≈ assembly cost at SafeToSpendReadModel |
| **Priority** | **P1** — `SimulationInput` (or accept only workplace+currency and fetch internally — deepen by shrinking caller knowledge) |

### 3b. `Simulator`

| Field | Assessment |
|---|---|
| **Path** | `.../simulation/Simulator.ts` (235) |
| **Depth** | **Deep** — day loop, cascade OUTFLOW, mins, safe-to-spend |
| **Interface size** | **1 static method**, ~8 params (still chunky) |
| **Dep category** | **In-process** |
| **Seams** | Internal to simulation cluster; tests sometimes pierce it (OK as internal seam) |
| **Deletion test** | Cascade/min logic would duplicate. **Keep** |
| **Top smell** | Slightly large param list; otherwise model deep module |
| **Priority** | **P3** |

### 3c. Engines (`Planned` / `Budget` / `Liability` FlowGenerator)

| Field | Assessment |
|---|---|
| **Paths** | `engines/*` (~151–302 each) |
| **Depth** | **Deep** each (domain-specific flow truth) |
| **Interface size** | **1× `static generate(...)`** each; Liability’s arg list is heaviest |
| **Dep category** | **In-process** (context + maps) |
| **Seams** | Internal; correctly not UI-facing |
| **Deletion test** | Liability/planned/budget rules explode across orchestrator. **Keep** |
| **Top smell** | Liability generator + statement fetch in orchestrator = **split locality** for liability truth |
| **Priority** | **P2** — co-locate statement/settlement fetch with Liability generator or one Liability submodule |

### 3d. `FlowResolver` + `SimulationReportGenerator`

| Field | Assessment |
|---|---|
| **Depth** | Resolver: **medium-deep**. ReportGenerator: **medium** |
| **Interface size** | 1 static each |
| **Dep** | **In-process** |
| **Deletion** | Conflict policy / report shape would leak into Simulator or UI. **Keep** |
| **Smell** | ReportGenerator + UI selectors both interpret flows → **two report vocabularies** |
| **Priority** | **P2** |

### 3e. Selectors (`committed` / `debt` / `income`)

| Field | Assessment |
|---|---|
| **Paths** | `selectors/*.ts` (17–63) |
| **Depth** | **Shallow-medium** — pure projections; small impl |
| **Interface size** | **1 fn each**, flow+accountMap knowledge |
| **Dep** | **In-process** |
| **Seams** | Consumed by `SafeToSpendMapper` (feature), not ReadModel — **seam sits in wrong layer** |
| **Deletion** | Mapping would move into mapper/UI. Mild keep |
| **Smell** | Simulation report incomplete for UI; selectors are **compensating seams outside the module** |
| **Priority** | **P2** — fold into simulation report or ReadModel projection |

### 3f. `SafeToSpendReadModel`

| Field | Assessment |
|---|---|
| **Path** | `.../SafeToSpendReadModel.ts` (437) |
| **Depth** | **Deep** product module — observe → assemble → simulate → history/projection |
| **Interface size** | **2 methods** (`observe`, `clearCache`) + fat `SafeToSpendResult` |
| **Dep category** | **Local-substitutable** |
| **Seams** | Ideal external seam for “safe to spend”. Wired through NotificationService instead |
| **Deletion** | Dashboard/widgets would rebuild pipeline. **Critical keep** |
| **Smell** | **Wrong host**: product path imported via notifications; also does too much assembly that could deepen `CashFlowSimulationService` |
| **Priority** | **P0** (with NotificationService) |

---

## 4. Budget: `budgetReadService` + `budgetWriteService`

| Field | Read | Write |
|---|---|---|
| **Path** | `budgetReadService.ts` (203) | `budgetWriteService.ts` (110) |
| **Depth** | **Medium-deep** (scope→leaves→usage) | **Shallow** (repo + analytics) |
| **Interface** | 2 observes + `BudgetUsage` | 4 methods |
| **Dep** | Local-substitutable | Local-substitutable (+ analytics external-ish) |
| **Seams** | Clean CQRS split | Merge ops are account-merge concern |
| **Deletion** | Read: usage math scatters (sim + UI). Write: mostly vanishes into repo | Write largely **pass-through** |
| **Smell** | Write is **adapter-thin**; `prepareMergeOperations` is wrong home | |
| **Priority** | Read **P3**; Write **P2** — merge into repo or account-merge module; keep analytics as side-effect adapter |

---

## 5. `BalanceService`

| Field | Assessment |
|---|---|
| **Path** | `.../BalanceService.ts` (492) |
| **Depth** | **Deep** — snapshots, hierarchy rollup, FX, batch |
| **Interface size** | **3 methods**; `aggregateBalances` needs maps/precision callers must prepare |
| **Dep** | **Local-substitutable** |
| **Seams** | Shared by ReactiveData, SafeToSpend, wealth history, import |
| **Deletion** | Hierarchy/FX/snapshot logic reappears widely. **Keep** |
| **Smell** | High leverage but **caller must know hierarchy fingerprint / precision maps** for aggregate |
| **Priority** | **P2** — deepen `aggregateBalances` to take accounts only (fetch internals) |

---

## 6. `PlannedPaymentService`

| Field | Assessment |
|---|---|
| **Path** | `.../PlannedPaymentService.ts` (701) |
| **Depth** | **Medium** — real posting/skip/due logic, but wide surface |
| **Interface size** | **~8 public methods** mixing pure schedule math + ledger writes + merge + toggle |
| **Dep** | **Local-substitutable** (+ rebuild queue) |
| **Seams** | One class = calendar + journal posting + account merge |
| **Deletion** | Occurrence/posting rules would scatter. Merge/toggle less so |
| **Smell** | **God module / mixed seams** — pure `calculateNextOccurrence` buried with DB writes |
| **Priority** | **P1** — extract pure recurrence module; keep posting as deep write module |

---

## 7. `ReactiveDataService`

| Field | Assessment |
|---|---|
| **Path** | `.../ReactiveDataService.ts` (617) |
| **Depth** | **Medium** — caching leverage high; each observe is a composition façade |
| **Interface size** | **~8 public methods** + 4 DTOs + cache clear/preWarm |
| **Dep** | **Local-substitutable** |
| **Seams** | Multicast observables; good locality for dashboard | overlaps SafeToSpend’s own account/journal observes |
| **Deletion** | Duplicate combineLatest returns to every screen. **Keep** |
| **Smell** | **Parallel reactive hubs** (this vs SafeToSpendReadModel) — two places own “live workplace streams” |
| **Priority** | **P1** — one reactive substrate; ReadModel consumes shared base observes only |

---

## 8. Integrity / Rebuild cluster

### `integrity-service`

| Field | Assessment |
|---|---|
| **Path** | `integrity-service.ts` (567) |
| **Depth** | **Medium-shallow** — verify/repair deep-ish; reset/cleanup are ops dump |
| **Interface** | **~9 methods** spanning scan → verify → repair → startup → **reset workplace/DB/cleanup** |
| **Dep** | Local-substitutable (+ analytics/sms/prefs) |
| **Deletion** | Verify/repair earns keep; reset tools would live in settings/admin anyway |
| **Smell** | **Kitchen-sink**: integrity ≠ nuclear reset |
| **Priority** | **P1** — split verify/repair vs destructive maintenance |

### `AccountingRebuildService`

| Field | Assessment |
|---|---|
| **Path** | `AccountingRebuildService.ts` (213) |
| **Depth** | **Deep** — checkpointed running-balance rewrite |
| **Interface** | **2 methods** (locked write vs internal) — small; callers must know lock/write nesting |
| **Dep** | Local-substitutable |
| **Deletion** | Balance correctness logic reappears. **Keep** |
| **Smell** | Dual public/internal entry = **ordering/write-context facts** in interface |
| **Priority** | **P2** |

### `RebuildQueueService`

| Field | Assessment |
|---|---|
| **Path** | `RebuildQueueService.ts` (311) |
| **Depth** | **Deep** — debounce, batch, disk persist, crash recover, retry |
| **Interface** | **enqueue / enqueueMany / flush / stop / pendingCount** — small |
| **Dep** | In-process queue + storage; rebuild is local-substitutable |
| **Deletion** | Queue/crash policy scatters. **Keep** — model deep module |
| **Smell** | Singleton + storage keys as implicit config |
| **Priority** | **P3** |

---

## 9. `NotificationService` vs `SafeToSpendReadModel`

| Field | NotificationService | SafeToSpendReadModel |
|---|---|---|
| **Path** | `notification/NotificationService.ts` (188) | see §3f |
| **Depth** | **Shallow for STS**; medium for OS notifications | **Deep** |
| **Interface** | Perms/schedule/test + **re-exports STS types & `observeSafeToSpend`/`clearCache`/`preWarm`** | observe + cache |
| **Dep** | **True-external** (expo-notifications) + passthrough to ReadModel | Local-substitutable |
| **Seams** | **False seam**: notifications façade for core product read model | Real product seam |
| **Deletion** | Delete NotificationService STS methods → call ReadModel; OS scheduling still needed. STS passthrough **fails deletion test** (complexity vanishes) | Earns keep |
| **Smell** | **Wrong module owns product interface**; dashboard/bootstrap import notifications to get balances | |
| **Priority** | **P0** — call `safeToSpendReadModel` from UI/bootstrap; NotificationService = schedule/permissions only |

---

## 10. `accountingHelpers` + `AccountingDomainService`

| Field | Helpers | DomainService |
|---|---|---|
| **Path** | `accounting/accountingHelpers.ts` (240) | `AccountingDomainService.ts` (90) |
| **Depth** | **Deep** pure accounting vocabulary | **Shallow** — mostly delegates + thin extras |
| **Interface** | **~15 exports** (multipliers, SQL snippets, category/IVS calculators) | **~7 methods**, 2 aliases for same multiplier |
| **Dep** | **In-process** | In-process |
| **Seams** | Two external seams for one domain | Duplicate `getImpactMultiplier` / `getBalanceImpactMultiplier` |
| **Deletion** | Helpers: truth reappears everywhere. DomainService: **mostly vanishes** into helpers + journal helpers | |
| **Smell** | **Layered indirection without second adapter**; DomainService is hypothetical seam (one production adapter) |
| **Priority** | **P1** — single module: keep helpers as implementation, DomainService as thin façade *or* delete façade and call helpers; drop duplicate method names |

---

## Priority board

| Pri | Module | Move |
|---|---|---|
| **P0** | NotificationService ↔ SafeToSpendReadModel | Unbundle STS seam from notifications |
| **P1** | CashFlowSimulationService | Shrink `simulate` interface (input DTO or self-fetch) |
| **P1** | ReportService | Prefer snapshot; starve unused methods |
| **P1** | PlannedPaymentService | Split pure recurrence vs posting |
| **P1** | ReactiveDataService ↔ STS | Shared base observes |
| **P1** | IntegrityService | Split verify vs destructive ops |
| **P1** | accountingHelpers / DomainService | One accounting interface |
| **P2** | Liability engine locality; selectors into report; BudgetWrite thinness; BalanceService aggregate deepen; wealth sync/async |
| **P3** | Simulator polish; RebuildQueue; BudgetRead |

---

## Depth snapshot (leverage vs interface)

| Deep (keep shape) | Medium | Shallow / mis-seamed |
|---|---|---|
| Simulator, Flow generators, RebuildQueue, AccountingRebuild, reportingDeltaEngine, accountingHelpers (core), SafeToSpendReadModel (behaviour) | CashFlowSim (deep body / fat params), BalanceService, PlannedPayment, ReactiveData, ReportService, BudgetRead, Integrity (verify slice) | NotificationService STS façade, AccountingDomainService, BudgetWrite, Integrity reset dump, UI-side flow selectors |

**Highest leverage win:** fix the **SafeToSpend external seam** (P0), then shrink **simulation input interface** (P1) so locality stays in one deep module instead of assembly knowledge in the ReadModel.