# Over-engineering cleanup plan

**Status:** In progress
**Date:** 2026-09-26
**Origin:** Repo-wide over-engineering audit (ponytail-audit). Item numbers match the audit's ranked list so decisions stay traceable.

Delete dead code, collapse single-caller layers, and drop duplicate tooling. No behavior changes. One logical commit per item (or small group), on `main`, not pushed.

## How to resume

1. Read the **Progress** table below; pick the first row that is `todo`.
2. Each commit must pass: `bunx tsc --noEmit`, the Jest tests touching the changed files, and `bunx eslint <changed files>`.
3. After each commit, flip the row to `done` and record the short SHA.
4. Run `bun run verify` at the end of each phase.

## Progress

### Phase A: dead code and trivial cuts

| # | Item | Status | Commit |
| --- | --- | --- | --- |
| 29 | Delete `invalidateAccountArchiveCaches` (test-only caller) | todo | |
| 30 | Delete unused `CurrencyInitService.getAllCurrencies` / `getCurrencyByCode` / `COMMON_CURRENCY_CODES` | todo | |
| 21 | Merge `currencyConversion.review.test.ts` into `currencyConversion.test.ts` | todo | |
| 11 | Delete unused `AccountTileList` | todo | |
| 32 | Scheduler: drop unused `delay` and the `requestIdleCallback` branch | todo | |
| 34 | Drop `test:detox:build` alias script | todo | |
| 22 | Delete `Bleed` (single caller) | todo | |
| 25 | Replace `reloadApp` wrapper with `reloadAppAsync` at its call site | todo | |
| 28 | Drop single-implementation `ReportsV2QueryEngine` interface | todo | |

### Phase B: tooling

| # | Item | Status | Commit |
| --- | --- | --- | --- |
| 2 | Remove Playwright web E2E (specs, pages, config, workflow, scripts, `@playwright/test`, `serve`) | todo | |
| 7 | Remove Maestro stack (`.maestro/`, `maestro/`, `record-onboarding-ios.sh`, scripts) | todo | |
| 13 | Replace hand-rolled cycle detector with `madge --circular` + baseline | todo | |
| 19 | Run `check-service-database-access` once in `verify` | todo | |

### Phase C: small consolidations

| # | Item | Status | Commit |
| --- | --- | --- | --- |
| 33 | Merge one-export files into existing helpers (keep helpers, not inline): `stringUtils.ts`, `limits.ts`, `use-color-scheme.ts` | todo | |
| 24 | Remove journal `*Module.ts` re-export files; import repositories directly | todo | |
| 10 | Merge single-caller micro-hooks into their only caller | todo | |
| 27 | Static-only classes to plain functions (`SafeToSpendMapper`, `ScopeResolver`, `SimulationReportGenerator`, `BudgetProjectionProvider`) | todo | |
| 12 | Remove `sms-service` facade; import SMS pipeline/repositories directly | todo | |

### Phase D: larger refactors

| # | Item | Status | Commit |
| --- | --- | --- | --- |
| 4 | Design preview: keep out of production navigation/bundle | todo | |
| 5 | Generic `usePreference` helper for the preference hooks | todo | |
| 15 | Migrate design-system `Text` users to `AppText`; delete `Text` | todo | |
| 16 | Remove `TransactionRawRepository` pass-through methods | todo | |
| 17 | `dateUtils` boundary math on dayjs | todo | |
| 6 | Shared core for the three journal editor hooks | todo | |

## Kept on purpose

| # | Item | Why |
| --- | --- | --- |
| 1 | Reports v1 UI | Both reports surfaces are needed. |
| 3 | `performance-audit/` | Keep for now. |
| 8 | `check-feature-boundaries.mjs` | Keep for now. |
| 9 | `moti` | Leave for now. |
| 14 | Revert registry + audit handlers | Hold. |
| 18 | AsyncStorage to MMKV migration | Keep for now. |
| 20 | `Box as={Pressable}` | Leave as is. |
| 23 | `check-read-boundaries.mjs` | Keep. |
| 26 | `check-rules.sh` | Used separately. |
| 31 | Duplicate `.so` `pickFirst` | Leave as is. |
| 35 | `expo-image`, `expo-web-browser` deps | Leave for now. |

## Later (after everything above)

- **Onboarding and setup merge.** `features/onboarding` (~3.7k prod lines) and `features/setup` (~10.6k) are two first-run flows that already call into each other (`commitCashClarity.ts`, `mapToWorkplaceOutput.ts`, `startFirstRunRestoreFromDeviceName`). `OnboardingRoute.tsx` switches between them via `shouldShowCashClarity`. Candidate: one setup journey with cash clarity as setup slices. Not started; needs its own plan.

## Log

- 2026-09-26: Plan written.
