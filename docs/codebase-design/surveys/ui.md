# Codebase Design Survey — UI / Hooks / Design System

Scope: `src/components/**`, `src/design-system/**`, `src/hooks/**`, `src/constants/**`, report widgets, sharing. Vocabulary only: Module, Interface, Implementation, Depth, Seam, Adapter, Leverage, Locality.

---

## Cross-cutting findings

1. **Two layout/typography stacks coexist.** Callers learn both `AppText` (~145 files) and `design-system` (~67 files). `design-system/Text` and `AppText` share utils (`processTextChildren`, color resolve) but diverge on variants, font loading, and tabular defaults → split Locality.
2. **Privacy masking is reimplemented**, not owned by one Module. `AppConfig.privacyMask` exists, but most UI hardcodes `'••••'` and reimplements controlled/override/global privacy in NetWorth/CashFlow/DashboardSummary.
3. **Date-range complexity is split across three Seams** with overlapping Interfaces: `useDateRangeFilter` (list screens), `useDateRangePicker` + fat menu UI, `useReportDateFilter` (ALL_TIME → earliest txn). Period math lives in `dateUtils`; UI still owns draft/apply rules.
4. **Domain rules hide in “common” UI** — account sectioning/parent exclusion, net cash-flow, import orchestration, insight dismiss/navigation.
5. **Report widgets are mostly shallow Adapters** over precomputed props; real report Depth lives in feature hooks/services (outside this survey’s core dirs, but widgets themselves don’t earn keep).

---

## `src/hooks/**` — significant Modules

### `useObservable`
| | |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/hooks/useObservable.ts` |
| **Depth** | **Deep** |
| **Interface** | `(factory, deps, initialValue, options?) → { data, isLoading, error, version }` |
| **Deletion test** | Fail. Subscription lifecycle, loading heuristics, versioning, keepPreviousData, comparators would scatter across every reactive screen. High Leverage. |
| **Smells** | Interface docs warn about WatermelonDB reference stability — that invariant is part of the Interface callers must know. Empty-array/Map/Set ⇒ “loading” is a surprising rule. |

### `usePaginatedObservable`
| | |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/hooks/usePaginatedObservable.ts` |
| **Depth** | **Deep** |
| **Interface** | Options bag: `pageSize`, `filter`, `observe`, optional `enrich`, filter keys, suppressReset… |
| **Deletion test** | Fail. Pagination + filter-reset + enrich + loadMore is concentrated here. |
| **Smells** | Large options Interface (borderline shallow *surface*, deep *behaviour*). `DateRange` / `AccountDateRange` types live here — odd Locality for domain filters. |

### `useDateRangeFilter`
| | |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/hooks/useDateRangeFilter.ts` |
| **Depth** | **Moderate–deep** |
| **Interface** | Small: options → range, periodFilter, picker visibility, setFilter, month nav |
| **Deletion test** | Fail for journal/account list patterns; month nav + dual state (range + PeriodFilter) would duplicate. |
| **Smells** | Parallel to `useReportDateFilter` and picker Module — three Seams for “pick a period.” Doesn’t know ALL_TIME bounding. |

### `useTransactionGrouping`
| | |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/hooks/useTransactionGrouping.ts` |
| **Depth** | **Moderate** |
| **Interface** | Generic: items + getDate/getStats/renderItem → flat `TransactionListItem[]` with collapse |
| **Deletion test** | Fail — day bucketing + separator injection + collapse state would reappear in journal/account lists. |
| **Smells** | Mixes list-model construction with UI callbacks (`onToggle` on separators). `renderItem` in Interface pushes presentation into callers while still owning grouping rules. Good seam idea; Interface could be smaller (return groups, let list view map). |

### `useSelection`
| | |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/hooks/useSelection.ts` |
| **Depth** | **Moderate–deep** |
| **Interface** | Multi-select mode + haptics + Android back + nav focus |
| **Deletion test** | Fail for selection UX Locality. |
| **Smells** | Couples to `expo-router` navigation + `BackHandler` — hard to test without RN. Deprecated `clearSelection` alias. Options object in deps can churn callbacks. |

### `useChartInteraction`
| | |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/hooks/useChartInteraction.ts` |
| **Depth** | **Deep** |
| **Interface** | Touch→`InteractionState` + gesture config → gesture handlers / layout |
| **Deletion test** | Fail — gesture composition, global interact flag, haptic throttle used by multiple charts. Strong Leverage. |
| **Smells** | Module-level globals (`globalIsInteracting`) are hidden Implementation that leak across charts (part of effective Interface). |

### `useImport`
| | |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/hooks/use-import.ts` |
| **Depth** | **Deep but misplaced** |
| **Interface** | Hook returning import handler + progress — looks UI-adjacent |
| **Deletion test** | Fail — file pick, zip, decode, plugin detect, workplace ensure, toast/confirm, restart. |
| **Smells** | **UI-named Module owning domain/import pipeline.** Should be a service Module with a thin React Adapter. Side effects dominate Interface (toast, restart, analytics). |

### `useLedgerTransactionsForAccount`
| | |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/hooks/useLedgerTransactions.ts` |
| **Depth** | **Shallow** (thin Adapter) |
| **Deletion test** | Pass-ish — mostly wires `ledgerReadService` into `usePaginatedObservable`. Complexity stays in those Modules. |
| **Smells** | Fine as Adapter; little Leverage beyond naming. |

### `useExchangeRate` / `useExchangeRates`
| | |
|---|---|
| **Paths** | `.../useExchangeRate.ts`, `.../useExchangeRates.ts` |
| **Depth** | **Shallow** / **moderate** |
| **Deletion test** | `useExchangeRate`: Pass (passthrough to service). `useExchangeRates`: Partial fail — rateMap “first wins = latest” rule would duplicate. |
| **Smells** | Two Modules for related concerns; map-building rule is domain Locality that belongs nearer the repository/service Seam. |

### `useCurrencies` / `useCurrencyPrecision`
| | |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/hooks/use-currencies.ts` |
| **Depth** | **Moderate** |
| **Deletion test** | Fail for init-on-mount + precision fallback Locality. |
| **Smells** | Side-effect init inside read hook. Precision fallback duplicates currency-definitions / formatter knowledge. |

### `useToastListener`
| | |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/hooks/useToastListener.ts` |
| **Depth** | **Moderate** |
| **Deletion test** | Fail for global toast queue Adapter. |
| **Smells** | Small; `removeQueue` ref looks unused for coordination. Fine Seam to alert utils. |

### `useExpandableSearch` (under components)
| | |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/components/core/hooks/useExpandableSearch.ts` |
| **Depth** | **Moderate** (UI behaviour) |
| **Deletion test** | Fail only if expandable search reused; else collocate with button. |
| **Smells** | Lives under components while other hooks are in `src/hooks` — Locality of “hooks” Seam is inconsistent. |

---

## `src/components/**` — Modules that look like UI but own rules

### `AccountPickerList` + private `useAccountPicker`
| | |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/components/common/AccountPickerList.tsx` (~461 lines) |
| **Depth** | **Deep Implementation, oversized Interface** |
| **Deletion test** | Fail — search debounce, parent-account exclusion, section collapse, create-intent, sectioning via `getAccountSections`. |
| **Smells** | **Domain rules in common UI** (parent exclusion, type sections). Private hook + `useDebounce` buried in file — no reuse Seam. Candidate to deepen: extract account-picker Module with small Interface (`accounts, mode → sections/selection`). |

### `CashFlowCard` / `NetWorthCard`
| | |
|---|---|
| **Paths** | `.../CashFlowCard.tsx`, `.../NetWorthCard.tsx` |
| **Depth** | **Shallow–moderate**; CashFlow owns a domain formula |
| **Deletion test** | Privacy-toggle duplication would remain; `netCashFlow = income - expense` and period labels (`overall`/`month`/`30days`) would scatter. |
| **Smells** | **Near-duplicate Modules** (hidden-state machine copy-pasted). CashFlow **computes net in the view**. Period options are domain vocabulary on a presentational card. Hardcoded copy (“Net Inflow”) vs AppConfig strings elsewhere. |

### `TransactionListView` + `TransactionCard` + `DaySeparator`
| | |
|---|---|
| **Paths** | `TransactionListView.tsx`, `TransactionCard.tsx`, `DaySeparator.tsx` |
| **Depth** | ListView **moderate** (FlashList Adapter); Card/Separator **moderate** presentation with privacy/reconcile rules |
| **Deletion test** | Fail as a cluster — shared list Seam for journal/account. |
| **Smells** | Presentation props (`cardProps`) vs domain (`EnrichedJournal` planned props unused in render path?). DaySeparator owns reconcile labeling + sign coloring. Privacy hardcodes mask. Good Leverage as a feature Seam if grouping stays behind one Interface. |

### Date-range cluster
| Module | Path | Depth | Deletion / smells |
|---|---|---|---|
| `DateRangeFilter` | `.../DateRangeFilter.tsx` | **Shallow** | Pass — pure rename to `DateRangeTrigger`. Delete and use Trigger. |
| `DateRangePicker` | `.../DateRangePicker.tsx` | **Shallow Adapter** | Orchestrates hook + view; keep if View stays dumb. |
| `useDateRangePicker` | `.../hooks/useDateRangePicker.ts` | **Deep** | Fail — draft filter, LAST_N, custom range, apply→`DateRange` labels. |
| `DateRangeMenuContent` | `.../DateRangeMenuContent.tsx` (~584) | **Shallow Interface, fat Implementation** | Fail for UI volume; little Domain Depth — mostly layout. Smell: huge presentational Module with many props (Interface ≈ Implementation). |

### `SelectableGrid`
| | |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/components/common/SelectableGrid.tsx` |
| **Depth** | **Moderate** |
| **Deletion test** | Fail for onboarding/workplace selection UX Locality. |
| **Smells** | Mixes selection UX with wizard chrome (`onContinue`/`onBack`/`isCompleting`) — Interface is a whole step, not a grid. |

### `EntityFormScreen` / `FormScreenScaffold`
| | |
|---|---|
| **Path** | `.../EntityFormScreen.tsx` |
| **Depth** | **Shallow–moderate** |
| **Deletion test** | Partial — thin compose of scaffold + footer. Earns keep only as convention Seam. |
| **Smells** | Good if it standardizes forms; otherwise pass-through. |

### Charts (`LineChart`, `BarChart`, `SankeyChart`, …)
| | |
|---|---|
| **Paths** | `/Users/sahilsoni/me/projects/full-frills-balance/src/components/charts/*` |
| **Depth** | **Deep** (esp. LineChart ~636, BarChart, heatmaps) |
| **Deletion test** | Fail — geometry, gestures via `useChartInteraction`, tooltips. High Leverage for reports. |
| **Smells** | Layout magic numbers duplicated with `REPORT_CHART_LAYOUT`. Privacy mask again in LineChart. Charts are genuine deep UI Modules (not domain). |

### Workplace-setup steps
| | |
|---|---|
| **Paths** | `.../workplace-setup/*` |
| **Depth** | **Moderate** (flow UI) |
| **Deletion test** | Fail for setup Locality; lean on `SelectableGrid` / defaults. |
| **Smells** | Feature-shaped Modules under `components/common` — Locality mismatch with `features/`. |

---

## Design system — deep Modules

### `Box` + `utils`
| | |
|---|---|
| **Paths** | `.../design-system/Box.tsx` (~364), `utils.ts` (~268) |
| **Depth** | **Deep** |
| **Interface** | Token-keyed layout props → View/Pressable styles |
| **Deletion test** | Fail — token resolution, opacity, radius, extractBoxProps used widely. Core Leverage Module. |
| **Smells** | Very wide prop Interface (many RN style mirrors) — Depth-as-leverage still holds because callers avoid StyleSheet soup; but learning cost is high. `unsafe_backgroundRaw` escape hatch is honest Seam. |

### Layout primitives (`Stack`, `Inline`, `Inset`, `Bleed`, `Separator`, `Skeleton`, `FadeIn`)
| | |
|---|---|
| **Depth** | **Moderate–deep** (small Interfaces over Box) |
| **Deletion test** | Fail as a family — Locality of spacing conventions. |
| **Smells** | Healthy deepening of Box. |

### `Page`
| | |
|---|---|
| **Path** | `.../design-system/Page.tsx` |
| **Depth** | **Moderate–deep** |
| **Interface** | safeArea/scroll/keyboard/header/footer screen shell |
| **Deletion test** | Fail for low-level screen shell; **but** most app screens use `layout/Screen` instead. |
| **Smells** | Parallel Seam with `Screen` — Page underused (~6 imports). Risk of two screen Modules. |

### `Text` (design-system) vs `AppText` (core)
| | |
|---|---|
| **Paths** | `design-system/Text.tsx`, `components/core/AppText.tsx` |
| **Depth** | Both **moderate**; together **shallow as a system** |
| **Deletion test** | Neither deletes cleanly; deleting one without merging increases churn. |
| **Smells** | **Duplicated typography Modules.** AppText wins adoption + font-ready awareness; DS Text is the “official” stack sibling. Classic deepen opportunity: one Module, one Interface. |

### `Screen` (layout Adapter over Page)
| | |
|---|---|
| **Path** | `.../components/layout/Screen.tsx` |
| **Depth** | **Moderate** — NavigationBar + Page |
| **Deletion test** | Fail for app navigation chrome Locality. |
| **Smells** | Correct Adapter pattern; documents that Page alone isn’t the product Seam. |

---

## Constants — domain rules vs copy

| Module | Path | Domain vs copy | Depth / smells |
|---|---|---|---|
| `AppConfig` | `constants/app-config.ts` | **Heavy domain**: SMS duplicate weights, system accounts, validation bounds, pagination, simulation thresholds, plus `strings` re-export | Deep grab-bag. Interface is “everything.” Locality suffers — behaviour constants mixed with layout/timing. |
| `currency-definitions` | `constants/currency-definitions.ts` | **Domain data** (precision/symbol) | Deep reference Module; good Seam for init/formatters. |
| `defaults` | `constants/defaults.ts` | **Domain suggestions** (account/category seeds + types) | Moderate. Couples to `IconMap` / `AccountType`. |
| `ledger-constants` | `constants/ledger-constants.ts` | **Domain keys/sources** | Small, deep enough. |
| `archetypes` | `constants/archetypes.ts` | Product copy + ids | Shallow data Module; fine. |
| `report-constants` | `constants/report-constants.ts` | Chart layout/colors — **presentation tokens**, not domain | Deep for charts; belongs nearer design-tokens or charts Module. |
| `design-tokens` | `constants/design-tokens.ts` (~949) | Visual system | Deep token Module; feeds DS. |
| `copy/ui-strings` | `constants/copy/ui-strings.ts` (~752) | **Copy only** | Correct Seam; accessed via `AppConfig.strings` (extra hop). |
| `theme-helpers` | `constants/theme-helpers.ts` | Presentation | Supporting. |

**Verdict:** `AppConfig` is the main smell — a deep Module whose Interface is too large (callers must know where behaviour vs copy vs layout lives). `defaults` + currency defs correctly encode domain; `report-constants` is design data mislabeled as report domain.

---

## Sharing / widget Modules

### Sharing
| Module | Path | Depth | Deletion / smells |
|---|---|---|---|
| `SharingService` | `services/SharingService.ts` | **Deep** | Fail — platform share, size guards, cleanup, analytics. Real Seam; `ShareProvider` Interface enables Adapters. |
| `TransactionShareProvider` | `services/sharing/TransactionShareProvider.ts` | **Deep Adapter** | Fail — TEXT/CSV/MD formatting, type meta, sort. Domain presentation for share, not React. Good Locality. |

### Report widgets (`features/reports/.../widgets`)
| Module | Depth | Notes |
|---|---|---|
| `MoneyFlowWidget` | **Shallow** | Pass-through to Sankey + card title. |
| `IncomeExpenseBalanceWidget` | **Shallow** | Pure presentational bars; flex ratios computed upstream (good). |
| `NetWorthTrendWidget` / `IncomeExpenseTrendWidget` | **Shallow–moderate** | Own selection + tooltip + analytics; data Interface is large (series/bar shapes). |

### Hub
| Module | Path | Depth | Smells |
|---|---|---|---|
| `HubWidget` | `features/hub/components/HubWidget.tsx` | **Moderate–deep** | **UI owns insight dismiss + navigation + emergency-fund special case** (`insight.id === 'no_emergency_fund'`). Domain branching in view. |

---

## Duplication map (features / Modules)

| Cluster | Modules | Issue |
|---|---|---|
| Privacy hide | NetWorthCard, CashFlowCard, DashboardSummary, TransactionCard, DaySeparator, LineChart, transformAccounts, SafeToSpendMapper | Same state/mask rules; only mapper consistently uses `AppConfig.privacyMask` |
| Date period | `useDateRangeFilter`, `useDateRangePicker`, `useReportDateFilter`, DateRange* UI | Overlapping Interfaces; ALL_TIME logic only in reports |
| Typography | `AppText`, `design-system/Text` | Two Interfaces for one job |
| Screen shell | `Page`, `Screen` | Page under-leveraged |
| Summary cards | NetWorthCard ≈ CashFlowCard | Copy-paste Implementation |
| Chart layout | `REPORT_CHART_LAYOUT` vs inline chart constants | Token Locality split |
| Account grouping | `accountCategory` utils + AccountPickerList | Rules correct in utils; picker still owns search/parent filter |

---

## Depth leaderboard (this survey)

**Earn their keep (deep / high Leverage)**  
`useObservable`, `usePaginatedObservable`, `useChartInteraction`, `Box`+`utils`, `SharingService`+`TransactionShareProvider`, chart Implementations, `useDateRangePicker`, `useImport` (misplaced), `AccountPickerList` (misplaced depth), `useTransactionGrouping`, `useSelection`.

**Shallow / delete-or-fold**  
`DateRangeFilter`, `useExchangeRate`, `useLedgerTransactionsForAccount`, `MoneyFlowWidget`, much of widget layer as currently shaped.

**Deepen candidates (UI owning domain)**  
`useImport` → service Seam + thin hook Adapter; `AccountPickerList` logic → account Module; CashFlow net/period → view-model; HubWidget insight special cases → insight Module; unify privacy Module; unify Text Module; collapse date-filter Seams.

---

## Skipped (pure presentational / no meaningful logic)

Core: `ColoredDot`, `Badge`, `FilterChipButton`, most of `AppButton`/`AppInput` chrome, `LoadingView`, `SectionLabel`, `StepIndicator`, `ProgressBar`, etc. Design-system: `FadeIn`, `Separator`, `Skeleton` (thin). Constants copy file itself (no rules). Widget files that only bind chart + title without branching beyond selection (still listed above where they add selection/analytics).