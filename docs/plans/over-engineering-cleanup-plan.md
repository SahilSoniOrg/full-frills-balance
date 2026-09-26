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

**Known pre-existing failures** (same on base `462b671d`, not caused by this cleanup): `launchCoordinatorRouting.test.ts` (Jest cannot parse `@shopify/flash-list` ESM), `useBulkJournalEditor.test.ts` (5 FX tests), `historicalExchangeRateBackfill.test.ts`. 3 suites / 7 tests. Everything else in `verify` passes.

## Progress

### Phase A: dead code and trivial cuts

| # | Item | Status | Commit |
| --- | --- | --- | --- |
| 29 | Delete `invalidateAccountArchiveCaches` (test-only caller) | done | `dbb2e852` |
| 30 | Delete unused `CurrencyInitService.getAllCurrencies` / `getCurrencyByCode` / `COMMON_CURRENCY_CODES` | done | `44f758e7` |
| 21 | Delete `currencyConversion.review.test.ts` (both cases already in `currencyConversion.test.ts`) | done | `ed6b110d` |
| 11 | Delete unused `AccountTileList`, plus orphaned `accountTilePolicy` and `getArchivedAccountTilePresentation` | done | `615e2eb2` |
| 32 | Scheduler: drop unused `delay` and a stale test mock. Kept the `requestIdleCallback` branch: `InteractionManager` is deprecated in RN 0.86 | done | `4842519c` |
| 34 | Drop `test:detox:build` alias script (done after item 7: `record-onboarding-ios.sh` called it) | done | `d7e5d615` |
| 22 | Delete `Bleed` (single caller) and `negateSpace` | done | `0e2b6a61` |
| 25 | Replace `reloadApp` wrapper with `reloadAppAsync` at its call site | kept | see Log |
| 28 | Drop unused `ReportsV2Engine` type alias. Kept the interface: it is the injection seam for view-model test mocks | done | `e4b1e18b` |

### Phase B: tooling

| # | Item | Status | Commit |
| --- | --- | --- | --- |
| 2 | Remove Playwright web E2E (specs, page objects, config, workflow, scripts, `@playwright/test`, `serve`, the Playwright-only dashboard benchmark doc). `e2e/pages/setup-page.ts` is Detox and moved under `tsconfig.e2e.json` | done | `ad3f7e9e` |
| 7 | Remove Maestro stack (`.maestro/`, `maestro/`, `record-onboarding-ios.sh`, scripts) | done | `3e238d83` |
| 13 | Replace hand-rolled cycle detector with `madge` + baseline (adds `madge` devDependency) | done | `84e753bf` |
| 19 | Run `check-service-database-access` once in `verify` (dropped from `typecheck`; `check:architecture-ratchets` already enforces it with an empty baseline; standalone script kept) | done | `24ecfb24` |

### Phase C: small consolidations

| # | Item | Status | Commit |
| --- | --- | --- | --- |
| 33 | Merge one-export files into existing helpers: `snakeToCamel` into `utils/serialization.ts`, `MAX_BULK_JOURNAL_ROWS` into `constants/ledger-constants.ts`. `use-color-scheme` deleted: its only user (design preview) now uses RN `useColorScheme` like `RootLayout` and `useThemePrefs` | done | `cb206a57` |
| 24 | Remove `journalMetadataModule` / `journalPlannedModule` / `journalSmsModule` (one re-export each); import repositories directly. Kept `journalTimelineModule`: it aggregates four repositories plus `journalsQuery` | done | `8aa3c8be` |
| 10 | Merge single-caller micro-hooks into their only caller: `useSelectedItemMap`, `usePressScale`, `useScreenPrivacyMode`, `useDebounce`, `useExpandableSearch`. `useDeviceMotionPrefs` moves to item 5; `useExchangeRate` and the `useJournalEditor` sub-hooks move to item 6. Account-form `hooks/form/*` split: **needs decision** (see Log) | partial | `01b72416` |
| 27 | Static-only classes to plain functions: `mapSafeToSpendViewModel`, `resolveLeafAccountIds`, `generateSimulationReport` / `generateAccountSummaries`, `projectBudgetCapacities` | done | `980d2c55` |
| 12 | Remove `sms-service` facade; import SMS pipeline/repositories directly | kept | see Log |

### Phase D: larger refactors

| # | Item | Status | Commit |
| --- | --- | --- | --- |
| 4 | Design preview: keep out of production navigation/bundle | already done | see Log |
| 5 | Generic `usePreference` helper for the preference hooks | kept | owner decision: keep preference hooks separate |
| 15 | Migrate design-system `Text` users to `AppText`; delete `Text` | **needs decision** | see Log |
| 16 | Remove `TransactionRawRepository` pass-through methods | partial | `83b83507` |
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
| 5 | Preference hooks (`use*Prefs`) | Keep separate (owner decision after review). `useDeviceMotionPrefs` stays too. |

## Later (after everything above)

- **Onboarding and setup merge.** `features/onboarding` (~3.7k prod lines) and `features/setup` (~10.6k) are two first-run flows that already call into each other (`commitCashClarity.ts`, `mapToWorkplaceOutput.ts`, `startFirstRunRestoreFromDeviceName`). `OnboardingRoute.tsx` switches between them via `shouldShowCashClarity`. Candidate: one setup journey with cash clarity as setup slices. Not started; needs its own plan.

## Log

- 2026-09-26: Plan written.
- 2026-09-26: Phase A done except 34. Item 25 kept: `runtimeVersion` is pinned to `'1.0.0'`, so OTA bundles can land on older native binaries without the Expo reload bridge; the `Updates.reloadAsync` fallback is a real compatibility path, not a wrapper.
- 2026-09-26: Phase B done. `verify` passes architecture, typecheck and lint; tests match the pre-existing failure baseline. Fixed a read-boundary violation from item 30's test change (`38232874`).
- 2026-09-26: Phase C done. Item 12 kept: every `smsService` method has a production caller, and the facade maps inbox/rule models to plain DTOs (`toPlainInboxRecord`, `toPlainSmsRule`). Removing it would push model imports into ~10 feature files against the presentation-model boundary.
- 2026-09-26: Item 10 account-form split left as is pending a decision: `hooks/form/*` (5 files, 540 lines) splits one reducer-backed form by concern (core, pickers, metadata, balance classify). Merging into `useAccountFormViewModel` gives an ~870-line hook and saves only ~60 lines of glue.
- 2026-09-27: Item 4 needs no change. Production Android export (`APP_VARIANT=production`) contains none of the preview screen's strings even before any change: the screen's `if (!__DEV__) return <Redirect/>` early return lets the minifier drop the body. A `__DEV__`-gated route saved ~1 KB and added a file, so it was reverted.
- 2026-09-27: Item 5 dropped by owner: keep preference hooks separate.
- 2026-09-27: Item 15 left pending a decision. 49 usages rely on `Text`-only props (size variants `xs`..`xxl`, margins, opacity) across BudgetCard, AppTabs, SetupStsPreview, PlannedPaymentHistoryCard, PlannedPaymentDetailsView (17), PlannedPaymentCard, SafeToSpendLedger, SafeToSpendHeader, AccountCard (8). `AppText` has no equivalent variants and adds tabular numerals, so a migration means picking a mapping per usage and risks visual regressions.
- 2026-09-27: Item 16: deleted `getAccountDeltasGroupedRaw` (no production caller) from the facade and the metrics query module. The other pass-throughs stay: nothing outside `src/data` imports `repositories/raw/*`, so `transactionRawRepository` is the single raw-SQL entry point for services, and 12 test files mock it. Removing them would widen the data-layer surface services depend on to save ~60 lines.
