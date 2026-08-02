# Full Frills Balance

**Double-entry personal finance on your device — offline-first, no cloud account, accounting that actually balances.**

[![CI](https://github.com/SahilSoniOrg/full-frills-balance/actions/workflows/ci.yml/badge.svg)](https://github.com/SahilSoniOrg/full-frills-balance/actions/workflows/ci.yml)
[![Expo SDK 57](https://img.shields.io/badge/Expo-SDK%2057-000020?style=flat&logo=expo&logoColor=white)](https://expo.dev/)
[![React Native 0.86](https://img.shields.io/badge/React%20Native-0.86-61DAFB?style=flat&logo=react&logoColor=white)](https://reactnative.dev/)
[![TypeScript 6](https://img.shields.io/badge/TypeScript-6-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![WatermelonDB](https://img.shields.io/badge/WatermelonDB-SQLite-6C5CE7?style=flat)](https://watermelondb.dev/)

---

## Why this app

Most finance apps optimize for speed of entry. **Full Frills Balance** optimizes for **correct books**: every journal balances, balances are derived from transactions, and the ledger is yours on-device.

| Principle | What it means in practice |
|-----------|---------------------------|
| **Derived balances** | Totals come from transaction sums; `running_balance` is a reconciled cache. |
| **Double-entry** | Debits equal credits before anything is saved. |
| **Offline-first** | SQLite via WatermelonDB; no backend required for core flows. |
| **Audit trail** | Mutations logged with before/after state. |
| **Numerical honesty** | Silent money mistakes are treated as higher severity than crashes. |

---

## Safe to Spend

> **How much can you spend today without going broke before payday?**

Not your bank balance — what's left after bills, budgets, and liabilities in the next 30 days.

```text
  Liquid assets now
+ Upcoming income (planned)
− Committed spending (budgets, bills, planned payments)
− Near-term debt / liability payments
────────────────────────────────────────
= Safe to Spend
```

The projection runs a day-by-day cash-flow simulation, merges overlapping obligations, normalizes currencies, and clamps to the lowest projected liquid balance in the window.

---

## Features

| | |
|---|---|
| **Ledger** | Simple and advanced journal entry; income, expense, transfer, multi-line; search, void, share |
| **Accounts** | Asset, liability, equity, income, expense; hierarchy, reorder, per-account currency |
| **Dashboard** | Net worth, privacy mask, transaction feed, Safe to Spend |
| **Budgets & plans** | Scoped budgets; recurring and one-off planned payments |
| **Reports** | Net worth, income vs expense, categories; interactive charts |
| **Multi-currency** | ExchangeRate-API with local cache |
| **Android SMS** | Optional inbox import and rule-based auto-post (`expo-sms-inbox`) |
| **Data** | JSON export/import (native + Ivy Wallet + Cashew plugins), audit log + restore |
| **Trust & UX** | Biometric lock, themes, insights, widgets, workplaces |

---

## Tech stack

| Layer | Choice |
|-------|--------|
| App | **Expo SDK 57**, **React Native 0.86**, **React 19**, **TypeScript 6** (strict) |
| Navigation | Expo Router (file-based) |
| Data | **WatermelonDB 0.28** → SQLite (native) / LokiJS (web & tests) |
| UI | FlashList, Reanimated, Gesture Handler, design tokens |
| Quality | Jest, Playwright (web export), ESLint, Prettier, Husky |
| Ship | EAS Build (dev / preview / production) |
| Telemetry | PostHog (no session replay), Sentry (errors/traces, no session replay) |

---

## Quick start

**Prerequisites:** Node 22+ ([`.nvmrc`](.nvmrc)), [Bun](https://bun.sh), optional [EAS CLI](https://docs.expo.dev/eas/) for native builds.

```bash
bun install
cp .env.example .env.local   # optional — app runs without secrets
npx expo start
```

| Command | Purpose |
|---------|---------|
| `npx expo run:ios` | Native iOS dev client |
| `npx expo run:android` | Native Android dev client |
| `npx expo start --web` | Web (limited; primary target is mobile) |

**Build variants** (`APP_VARIANT` or EAS profile): `development` (`.dev`), `preview` (`.preview`), `production`.

**Try it with data:** Settings → Data Management → **Setup Demo Workspace** (isolated sample workplace, leaves your data untouched).

---

## Development

```bash
bun run typecheck    # tsc --noEmit
bun run test         # Jest + coverage thresholds
bun run lint         # expo lint
bun run verify       # typecheck + test:ci + lint (CI gate)
```

Component gallery (dev client): [`/_design-preview`](app/_design-preview.tsx).

```text
app/ (Expo Router)  →  src/features/*  →  src/services/*  →  repositories  →  WatermelonDB / SQLite
```

Five tabs: **Dashboard · Accounts · Activity · Commitments · Settings**.

Feature boundaries are enforced in `eslint.config.js`. Business logic lives in `src/services/`, not in route files.

---

## Testing

```bash
bun run verify                    # same as CI on PRs

# E2E (Playwright, web export)
bun run test:e2e:build
bun run serve:e2e
bun run test:e2e
```

---

## Privacy

Financial data stays on your device. SMS processing (Android) is local. Analytics are pseudonymous event counts — not amounts, merchants, or balances. PostHog and Sentry session replay are **disabled**.

Details: [PRIVACY.MD](PRIVACY.MD).

---

## License

Private — not open source.
