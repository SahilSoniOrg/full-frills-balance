# Architecture Overview

This document describes the technical architecture of Full Frills Balance, a double-entry personal finance app built with React Native 0.83 and Expo SDK 55.

## Core Principles

> **"Balances are derived, never cached"** — All account balances come from transaction sums, not stored values.

1. **Double-Entry Accounting**: Every transaction touches exactly two accounts (debit + credit)
2. **Journals Always Balance**: A journal entry must sum to zero (debits = credits)
3. **Offline-First**: All data lives locally on-device; no network required for core operations
4. **Audit Trail**: Every mutation is logged with before/after state for accountability
5. **Silent numerical mistakes are higher severity than crashes**

---

## System Layers

```
┌───────────────────────────────────────────────────────────────┐
│                    App Layer (Expo Router)                     │
│  Dashboard · Accounts · Activity · Commitments · Settings     │
│  + 25 route screens (journal, reports, hub, onboarding, ...)  │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌────────────────────────────┴──────────────────────────────────┐
│                    Feature Layer                               │
│  accounts · journal · reports · budget · planned-payments      │
│  dashboard · hub · wealth · settings · onboarding · audit      │
│  commitments · dev                                             │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌────────────────────────────┴──────────────────────────────────┐
│                    Service Layer                               │
│  BalanceService         — account balance computation          │
│  CashFlowSimulationService — 30-day forward projection         │
│  PlannedPaymentService  — recurring/one-off scheduling         │
│  ReportService          — income/expense/wealth analytics      │
│  SafeToSpendReadModel   — Safe to Spend watch/headline/preWarm │
│  NotificationService    — OS notifications + daily reminders   │
│  InsightService         — proactive financial insights         │
│  IntegrityService       — startup balance verification         │
│  SmsService             — bank SMS parsing + auto-posting      │
│  ExchangeRateService    — live currency rate management        │
│  SharingService         — multi-format transaction sharing     │
│  ExportService          — full data export/import              │
│  WealthService          — net worth tracking over time         │
│  AuditService           — mutation logging + restore           │
│  ReactiveDataService    — WatermelonDB → observable pipeline   │
│  AccountingRebuildService — running balance reconstruction     │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌────────────────────────────┴──────────────────────────────────┐
│                    Hooks Layer                                 │
│  useObservable · usePaginatedObservable — generic observable   │
│  useJournals · useAccounts — domain-specific data hooks        │
│  useExchangeRates · useMonthlyFlow — financial hooks           │
│  useDateRangeFilter · useSelection — interaction hooks         │
│  useChartInteraction · useChartTooltipPosition — chart hooks   │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌────────────────────────────┴──────────────────────────────────┐
│                Repository Layer + Raw SQL                      │
│  JournalRepository          TransactionRepository              │
│  TransactionRawRepository   AccountRepository                  │
│  BalanceSnapshotRepository  BudgetRepository                   │
│  PlannedPaymentRepository   CurrencyRepository                 │
│  ExchangeRateRepository     ImportRepository                   │
│  AuditRepository            ReconciliationRepository           │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌────────────────────────────┴──────────────────────────────────┐
│                Data Layer (WatermelonDB / SQLite)              │
│  Journal · Transaction · Account · AccountMetadata             │
│  Budget · BudgetScope · PlannedPayment · Currency              │
│  ExchangeRate · BalanceSnapshot · AuditLog                     │
│  SmsInboxRecord · SmsAutoPostRule                              │
└───────────────────────────────────────────────────────────────┘
```

---

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `app/` | Expo Router route wrappers (thin — no logic, no data access) |
| `app/(tabs)/` | Bottom tab navigation: dashboard, accounts, activity, commitments, settings |
| `src/features/` | Feature modules with components, hooks, screens, and local services |
| `src/services/` | Domain services — all business logic lives here |
| `src/data/models/` | WatermelonDB model definitions (14 models) |
| `src/data/repositories/` | Data access layer (WatermelonDB queries + raw SQL) |
| `src/data/database/` | Schema definition, migrations, adapter setup |
| `src/design-system/` | Layout primitives (Box, Stack, Text, Page, Skeleton, Separator, ...) |
| `src/components/` | Shared UI (core components, charts, layout, common) |
| `src/components/charts/` | Chart library (LineChart, BarChart, AreaChart, DonutChart, HeatmapChart, CalendarHeatmap, SankeyChart) |
| `src/hooks/` | Global hooks and observable helpers |
| `src/contexts/` | React contexts (UIContext — UI state only, no domain data) |
| `src/constants/` | App-wide constants, design tokens, app configuration |
| `src/utils/` | Pure utilities (logger, formatting, money math, preferences, auth, haptics, ...) |
| `modules/` | Custom native Expo modules (expo-sms-inbox, expo-widgets) |
| `plugins/` | Expo config plugins (Gradle optimization, telephony, widgets, permission removal) |
| `guides/` | Developer guides covering 12 engineering topics |

---

## Data Models

### Journal
The atomic unit of accounting. Groups 2+ transactions that must sum to zero.

| Field | Type | Notes |
|-------|------|-------|
| `journalDate` | timestamp | When the transaction occurred |
| `status` | POSTED/VOIDED | Only POSTED affects balances |
| `totalAmount` | number | Denormalized sum of debits |
| `displayType` | string | INCOME/EXPENSE/TRANSFER/MIXED |

### Transaction
One leg of a journal entry.

| Field | Type | Notes |
|-------|------|-------|
| `amount` | number | Always positive |
| `transactionType` | DEBIT/CREDIT | Determines effect on account |
| `runningBalance` | number | Rebuildable cache for list display |
| `currencyCode` | string | Per-transaction currency |

### Account
Where money lives or flows. Supports hierarchical grouping via `parentAccountId`.

| Type | Debit Effect | Credit Effect |
|------|--------------|---------------|
| ASSET | +increase | -decrease |
| LIABILITY | -decrease | +increase |
| EQUITY | -decrease | +increase |
| INCOME | -decrease | +increase |
| EXPENSE | +increase | -decrease |

Accounts also carry `accountSubtype` (e.g. `CREDIT_CARD`, `CHECKING`, `SAVINGS`) and `AccountMetadata` for liability-specific fields like `statementDay` and `dueDay`.

### PlannedPayment
Recurring or one-off scheduled payments with `intervalType`, `intervalN`, `recurrenceDay`, `nextOccurrence`, and optional `endDate`.

### Budget & BudgetScope
Budget targets scoped to specific expense accounts via `BudgetScope` join records.

### BalanceSnapshot
Point-in-time balance snapshots for historical trend charts.

### SmsInboxRecord & SmsAutoPostRule
(Android) Raw SMS records and configurable rules for automatic transaction posting.

### ExchangeRate & Currency
Live exchange rate cache and currency metadata.

### AuditLog
Immutable mutation log with before/after state for every data change.

---

## Cash Flow Simulation Engine

The simulation engine powers the **Safe to Spend** feature. Architecture: `Generate truth → simulate once → read results`.

### Pipeline

1. **Normalize & Pre-fetch** — Batch-fetch exchange rates, metadata, statement balances. Currency-normalize all amounts.
2. **Generate Flows** — Three specialized generators produce typed `Flow` objects:
   - `PlannedFlowGenerator` — Recurring and one-off planned payments, scheduled journal entries
   - `BudgetFlowGenerator` — Remaining budget burn spread across days, month-boundary spillover
   - `LiabilityFlowGenerator` — Credit card statement cycles, due dates, settlement tracking
3. **Resolve Conflicts** — `FlowResolver` merges overlapping obligations (budget + planned payment for same expense) to prevent double-counting
4. **Simulate** — `Simulator` walks day-by-day, applies flows, tracks per-account and global minimum balances
5. **Post-process** — Generate per-account summaries, identify shortfalls, compute Safe to Spend = `min(starting balance, global minimum)`

### Flow Types
- `INFLOW` — Money entering a liquid account
- `OUTFLOW` — Money leaving a liquid account (supports cascade to fallback accounts)
- `TRANSFER` — Money moving between accounts

---

## Services

### IntegrityService
Runs on app startup. Recomputes actual balances from transaction sums, compares to cached `runningBalance`, and repairs discrepancies silently.

### SafeToSpendReadModel
Owns Safe to Spend. `forWorkplace(id)` → `watch()` / `watchHeadline()` / `preWarm()`; currency and horizon prefs live inside the Implementation. Feeds the dashboard and widgets.

### NotificationService
OS notification scheduling and local reminders (not Safe to Spend).

### ReportService
Analytics engine producing income vs. expense trends, net worth charts, category breakdowns (donut), spending heatmaps, and flow visualizations (Sankey). Supports date range filtering.

### ExportService / ImportRepository
Full JSON export/import. Import supports pluggable parsers via `ImportPluginRegistry`: native format, Ivy Wallet, and Cashew.

### SmsService
(Android) Parses bank SMS using configurable rule sets. Extracts amounts, merchants, and transaction types for auto-posting.

### SharingService
Multi-format transaction sharing (text, detailed, ledger) via `TransactionShareProvider` with configurable default format.

---

## Error Handling

- **ErrorBoundary**: Wraps root Stack, catches JS errors, shows fallback UI with recovery
- **IntegrityService**: Self-heals balance discrepancies at startup
- **Logger**: Structured logging via `src/utils/logger.ts` — debug logs stripped in production
- **TraceService**: Performance instrumentation for critical paths (simulation, boot, queries)
- **Alerts**: Formatted user-facing error/warning dialogs via `src/utils/alerts.ts`

---

## Performance Patterns

1. **Denormalization**: `Journal.totalAmount` and `displayType` avoid joins in list views
2. **Raw SQL**: `TransactionRawRepository` uses direct SQLite queries for hot paths (balance computation, period metrics, bulk counts)
3. **Pagination**: `usePaginatedObservable` with cursor-based infinite scroll
4. **FlashList**: Virtualized lists for all large datasets
5. **Exchange Rate Pre-warming**: Batch-fetch all needed rates before simulation runs
6. **Parallel I/O**: `Promise.all` for independent database fetches in simulation and boot
7. **React Compiler**: Beta compiler enabled for automatic memoization
8. **Hermes**: Optimized JS engine for faster cold boot and reduced memory
9. **Adaptive Boot**: `InteractionManager` + fallback scheduling for background initialization
10. **Debouncing**: Observable hooks debounce recalculation to avoid subscription churn
