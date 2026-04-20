# Full Frills Balance

A double-entry personal finance app built with React Native and Expo.  
Track your net worth with proper accounting semantics — offline-first, no cloud account required.

---

## Philosophy

> **"Balances are derived, never cached"**

- All balances are computed from transaction sums — never stored as editable totals.
- Every journal must balance (`debits == credits`) before it can be persisted.
- Offline-first — the full accounting engine runs locally on-device.
- Every mutation is logged to an immutable audit trail.
- Silent numerical mistakes are treated as higher severity than crashes.

See [principles.md](.agent/rules/principles.md) for the complete decision framework.

---

## Features

| Area | Highlights |
|------|------------|
| **Double-Entry Ledger** | Create journals with multi-line transactions. Supports Income, Expense, Transfer, and Mixed entry types. |
| **Accounts** | Five account types (Asset, Liability, Equity, Income, Expense) with hierarchical grouping and reordering. |
| **Dashboard** | Net worth card, privacy toggle, "Safe to Spend" projection, and a paginated transaction feed. |
| **Budgets** | Budget creation with scoped tracking per account/category. |
| **Planned Payments** | Recurring and one-off scheduled payments with history tracking. |
| **Reports** | Net worth trends, income vs. expense charts, category breakdowns with interactive tap-and-scrub gestures. |
| **Cash Flow Simulation** | Forward-looking projection engine that models future balances from planned payments and past patterns. |
| **Multi-Currency** | Per-account currencies with live exchange rates via ExchangeRate-API. |
| **SMS Auto-Import** | (Android) Read bank SMS, extract transaction data, and auto-post via configurable rules. |
| **Insights & Notifications** | Proactive financial insights and daily "Safe to Spend" notifications. |
| **Data Portability** | Full JSON export/import, shareable transaction summaries in multiple formats. |
| **Widgets** | Android home-screen widget for quick journal entry. |
| **Audit Log** | Every data mutation is recorded with before/after state for full auditability. |
| **Biometric Lock** | Optional device authentication via `expo-local-authentication`. |
| **Theming** | System / Light / Dark theme with a custom design token system. |

---

## 💡 Safe to Spend

The headline feature. Safe to Spend answers the question every finance app should but rarely does:

> **"How much can I actually spend right now without going broke before payday?"**

It isn't your bank balance. It's what's left after the engine accounts for every upcoming bill, budget commitment, and liability payment over the next 30 days.

### How it works

```
  Liquid Assets          (cash, checking, savings — right now)
+ Upcoming Income        (planned salary, transfers into liquid accounts)
− Committed Spending     (bills, budgets, planned payments due within 30 days)
− Outstanding Debt       (credit card balances and near-term liability payments)
──────────────────────
= Safe to Spend          (what you can actually spend today)
```

### The Simulation Engine

Under the hood, a full **cash-flow simulation** runs forward day-by-day through a 30-day window. Three specialized flow generators feed into a single simulation pass:

| Generator | What it models |
|-----------|---------------|
| **PlannedFlowGenerator** | Recurring and one-off planned payments, scheduled journal entries (income, bills, transfers) |
| **BudgetFlowGenerator** | Remaining budget burn spread across the month, spilling into next month if needed |
| **LiabilityFlowGenerator** | Credit card statement cycles, due dates, minimum payments, and settlement tracking |

The `FlowResolver` then merges overlapping obligations (e.g. a budget and a planned payment covering the same expense) to avoid double-counting. All amounts are **currency-normalized** to a single display currency using cached exchange rates.

The `Simulator` walks each day, applies every flow, and tracks the **global minimum balance** across the projection. Safe to Spend is clamped to `min(starting balance, lowest projected balance)` — if your balance dips to ₹700 before your salary arrives on day 15, you can safely spend ₹700, not your full ₹5,000 balance.

### Shortfall Detection

If the projected minimum goes **negative**, the engine flips to **Shortfall mode** — showing exactly how much you're short and which obligations are pushing you under. The UI highlights this prominently so you can act before it happens.

### What you see on the Dashboard

- **Safe to Spend Card** — The primary number, front and center, with a stacked breakdown bar (safe / committed / debts)
- **Projection Chart** — A 30-day line chart showing your projected liquid balance, with tap-and-scrub interaction for daily details
- **Explanation Modal** — An interactive ledger breakdown with expandable sections for each component (assets, income, committed, debts), drilling down to individual planned payments and budget allocations
- **Legend Modal** — Per-account safe-to-spend breakdown showing each liquid account's contribution
- **Daily Notification** — A scheduled notification with today's Safe to Spend number and a nudge to record recent activity

### Why it matters

Most apps tell you what you *have*. Safe to Spend tells you what you can *use*. The difference prevents overdrafts, credit card surprises, and the false confidence of seeing a big balance when half of it is already spoken for.

---

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Runtime** | React Native (New Architecture) | 0.83 |
| **Framework** | Expo SDK | 55 |
| **Language** | TypeScript (strict mode) | 6.x |
| **Navigation** | Expo Router (file-based routing) | 55.x |
| **Database** | WatermelonDB → SQLite | 0.28 |
| **Lists** | `@shopify/flash-list` | 2.0 |
| **Animations** | React Native Reanimated 4 + Moti | |
| **Gestures** | React Native Gesture Handler | 2.30 |
| **Compiler** | React Compiler (beta) | 19.x |
| **JS Engine** | Hermes | |
| **State** | React Context + WatermelonDB observable hooks | |
| **Analytics** | PostHog + Expo Insights | |
| **CI** | Playwright (E2E on web export), Jest (unit/integration) | |
| **Builds** | EAS Build (development / preview / production) | |
| **Code Quality** | ESLint, Prettier, Husky + lint-staged | |

---

## Getting Started

### Prerequisites

- Node.js 22+ (see `.nvmrc`)
- [EAS CLI](https://docs.expo.dev/eas/) for native builds

### Install & Run

```bash
# Install dependencies
npm install

# Start Expo dev server
npx expo start

# Run on device/simulator
npx expo run:ios
npx expo run:android
```

### Environment Variants

| Variant | Bundle ID suffix | Usage |
|---------|-----------------|-------|
| `development` | `.dev` | Dev client with hot reload |
| `preview` | `.preview` | Internal testing builds |
| `production` | *(none)* | Store release |

Set via `APP_VARIANT` environment variable or EAS build profile.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                    App Layer (Expo Router)                     │
│  Dashboard · Accounts · Activity · Commitments · Settings     │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌────────────────────────────┴──────────────────────────────────┐
│                    Feature Layer                               │
│  accounts · journal · reports · budget · planned-payments      │
│  dashboard · hub · wealth · settings · onboarding · audit      │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌────────────────────────────┴──────────────────────────────────┐
│                    Service Layer                               │
│  BalanceService · PlannedPaymentService · ReportService        │
│  CashFlowSimulationService · NotificationService · InsightService│
│  SmsService · ExchangeRateService · IntegrityService           │
│  SharingService · ExportService · WealthService                │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌────────────────────────────┴──────────────────────────────────┐
│                    Hooks Layer                                 │
│  useObservable · usePaginatedObservable · useJournals          │
│  useAccounts · useNetWorth · useExchangeRates · useSelection   │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌────────────────────────────┴──────────────────────────────────┐
│                Repository Layer + Raw SQL                      │
│  JournalRepository · AccountRepository · TransactionRawRepo    │
│  BalanceSnapshotRepository · ExchangeRateRepository            │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌────────────────────────────┴──────────────────────────────────┐
│                Data Layer (WatermelonDB / SQLite)              │
│  Journal · Transaction · Account · Budget · BudgetScope        │
│  PlannedPayment · Currency · ExchangeRate · BalanceSnapshot    │
│  SmsInboxRecord · SmsAutoPostRule · AuditLog                   │
└───────────────────────────────────────────────────────────────┘
```

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full technical deep-dive.

---

## Project Structure

```
├── app/                    # Expo Router routes & tab navigation
│   └── (tabs)/             # Bottom tab screens (dashboard, accounts, activity, commitments, settings)
├── src/
│   ├── features/           # Feature modules (accounts, journal, reports, budget, planned-payments, ...)
│   ├── services/           # Domain services (balance, simulation, integrity, SMS, ...)
│   ├── data/
│   │   ├── models/         # WatermelonDB model definitions (14 models)
│   │   ├── repositories/   # Data access layer
│   │   └── database/       # Schema, migrations, adapter
│   ├── design-system/      # Layout primitives (Box, Stack, Text, Page, Skeleton, ...)
│   ├── components/         # Shared UI (core, charts, layout, common)
│   ├── hooks/              # Global hooks and observable helpers
│   ├── contexts/           # React contexts (UIContext)
│   ├── types/              # Shared TypeScript types
│   ├── constants/          # App-wide constants
│   └── utils/              # Pure utilities (logger, formatting, money, preferences, ...)
├── modules/                # Custom native modules (expo-sms-inbox, expo-widgets)
├── plugins/                # Expo config plugins (Gradle, telephony, widgets, permissions)
├── e2e/                    # Playwright end-to-end tests
├── docs/                   # Architecture, conventions, feature matrix, roadmaps
├── guides/                 # Developer guides (components, data, testing, performance, ...)
└── scripts/                # Build & maintenance scripts
```

---

## Testing

### Unit & Integration Tests (Jest)

```bash
npm test               # Run all Jest tests with coverage
```

Tests cover: repositories, services, accounting invariants, money math, and currency formatting.

### End-to-End Tests (Playwright)

```bash
npm run test:e2e:build           # Export web build for E2E
npm run serve:e2e                # Serve the export locally
npm run test:e2e                 # Run Playwright suite
npm run test:e2e:ui              # Interactive Playwright UI
```

### Visual Testing

```bash
npx expo start --dev-client      # Open /_design-preview for component gallery
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System layers, data models, services, performance patterns |
| [CONVENTIONS.md](docs/CONVENTIONS.md) | Coding standards, naming, state management rules |
| [FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md) | Feature completeness tracker |
| [CHANGELOG.md](docs/CHANGELOG.md) | Version history |
| [KNOWN_GAPS_AND_RISKS.md](docs/KNOWN_GAPS_AND_RISKS.md) | Known issues and technical debt |
| [FUTURE_ROADMAP.md](docs/FUTURE_ROADMAP.md) | Planned features |
| [PRIVACY.MD](PRIVACY.MD) | Privacy policy |

### Developer Guides (`guides/`)

In-depth guides covering components, data & state, design tokens, performance optimization, testing strategy, error handling, security & audit, accessibility, and environment setup.

---

## Privacy

Full Frills Balance is primarily offline. Financial data stays on your device. Optional SMS access (Android) is processed locally and not uploaded.  
Analytics (PostHog, Expo Insights) collect only pseudonymous usage events — never transaction amounts, merchant names, or balances.

See [PRIVACY.MD](PRIVACY.MD) for the full policy.

---

## License

Private — not open source.
