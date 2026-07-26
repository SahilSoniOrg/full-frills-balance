# PROJECT BIBLE — Full Frills Balance

The canonical knowledge base for this repository. When this file and any other
document disagree, **this file wins** — then fix the other document.

- **Last verified:** 2026-07-27 (against commit `4bf1f905`)
- **How to verify:** every count and claim below was measured by running the
  toolchain, not read from prose. Re-measure before trusting a stale date.

**Companion documents**

| Document | Role |
|---|---|
| `docs/ARCHITECTURE.md` | Layer map and subsystem detail |
| `docs/adr/` | Architecture decision records (why things are the way they are) |
| `docs/README.md` | Doc hierarchy and index |
| `docs/IMPLEMENTATION_PLAN.md` | Active phased work queue |
| `docs/codebase-design/AUDIT.md` | Module-depth / Interface design review |
| `CONTEXT.md` | Domain glossary |

---

## 1. System overview

A double-entry personal finance app. Offline-first: there is no backend and no
account. The on-device SQLite database is the user's only copy of their data.

| Property | Value (measured 2026-07-27) |
|---|---|
| Stack | Expo SDK 57, React Native 0.86, React 19.2, TypeScript 6 |
| Data | WatermelonDB 0.28 → SQLite (native) / LokiJS (web + tests) |
| Key-value | `react-native-mmkv` v4 (`src/utils/storage.ts`) |
| Source size | 790 TS/TSX files, ~113k LOC under `src/` |
| Schema version | **28**, with **27** migrations (`src/data/database/migrations.ts`, 875 lines) |
| Models | **16** files in `src/data/models/`, **15** registered in `Database.ts` (`BaseScopedModel` is abstract) |
| Routes | 43 route files in `app/` (includes 6 tab screens under `app/(tabs)/`) |
| Features | 14 under `src/features/` |
| Tests | 133 suites, 826 tests (825 passed, 1 skipped) — re-run `bun run test` to refresh |
| Coverage | Jest global + per-file thresholds in `jest.config.js`; `bun run verify` must pass |
| Typecheck | clean, ~6s |

> Anything that states "14 models", "RN 0.83" or "Expo SDK 55" is stale.

---

## 2. Architecture at a glance

```
app/                    Expo Router routes — thin, no logic, no data access
  (tabs)/               dashboard · accounts · activity · commitments · settings
src/features/<name>/    screens · components · hooks (use*ViewModel) [· services]
src/services/           domain logic — the primary home for business rules
src/data/repositories/  WatermelonDB queries + raw SQL hot paths
src/data/database/      schema.ts · migrations.ts · platform adapters
src/design-system/      layout primitives (Box, Stack, Text, Page, …)
src/components/         shared UI + charts
modules/                native Expo modules (expo-sms-inbox, expo-widgets)
plugins/                Expo config plugins
```

**Enforced boundaries.** `eslint.config.js` generates `no-restricted-imports`
rules per feature from the `src/features/` listing, and forbids `app/**` from
reaching into `src/**` internals. Lint reports **0 errors**, so these boundaries
genuinely hold. This is the strongest structural property of the codebase — a new
feature is protected the moment its folder exists.

---

## 3. Domain model

The atomic unit is the **Journal** — a group of **Transactions** (legs) that must
sum to zero.

| Entity | Role |
|---|---|
| `Journal` | Accounting unit. Statuses: `POSTED`, `REVERSED`, `PLANNED`, `SKIPPED`, `PAUSED`. Denormalises `total_amount`, `transaction_count`, `display_type` |
| `Transaction` | One leg: `amount` (always positive), `transactionType` DEBIT/CREDIT, `currencyCode`, `exchange_rate`, `running_balance` (cache) |
| `Account` | ASSET / LIABILITY / EQUITY / INCOME / EXPENSE, hierarchical via `parentAccountId` |
| `AccountMetadata` | Liability extras: `statementDay`, `dueDay`, credit limit |
| `Budget` / `BudgetScope` | Budget target scoped to expense accounts |
| `PlannedPayment` | Recurring/one-off schedule (`intervalType`, `intervalN`, `nextOccurrence`, `endDate`) |
| `Currency` / `ExchangeRate` | Currency metadata + rate cache |
| `BalanceSnapshot` | Point-in-time balances for trend charts |
| `AuditLog` | Append-only mutation log with before/after state |
| `JournalMetadata` | Links a journal to its source (e.g. `original_sms_id`) |
| `TransactionInboxRecord` | Raw ingested SMS (includes `raw_body`) |
| `TransactionAutoPostRule` | User-configurable SMS auto-post rules |
| `Workplace` | **Tenant boundary.** Scopes nearly every table and query |

### Terminology note

`Account` and `Category` are the *same table*. An "Account" is ASSET/LIABILITY/
EQUITY; a "Category" is INCOME/EXPENSE. Both are rows in `accounts`.

### Workplace is the most important undocumented concept

`workplaceId` is threaded through most service and repository signatures and has
its own model, service, repository, context and settings route. Before 2026-07-25
it appeared in **zero** project documents. If you are new: assume every query is
workplace-scoped until proven otherwise.

---

## 4. Persistence model — what lives where

| Store | Contents | Source of truth? | In the export? |
|---|---|---|---|
| SQLite (WatermelonDB) | All 15 registered models | **Yes** | 14 workplace tables + global `currencies` / `exchange_rates` via `workplaceDataTables.ts` |
| MMKV | UI preferences, processed-SMS ids, dashboard/wealth snapshot caches, rebuild queue + locks, integrity schema marker, onboarding draft | No (caches/prefs) | Preferences only |
| AsyncStorage | Legacy keys, read once by the MMKV migration | Deprecated | n/a |
| Filesystem | Export ZIP (`backup.json`) | Backup artifact | user-managed |

**Still not in the export:** other workplaces (export is scoped to the active
workplace), and most MMKV keys. Multi-workplace users need a backup strategy per
workplace or a future “export all” feature. See ADR-0006.

---

## 5. Business invariants

The rules that must never break. `Confidence` = how sure we are the rule actually
holds in production today.

| # | Invariant | Enforced at | Confidence | Risk |
|---|---|---|---|---|
| 1 | A journal's debits equal its credits (in functional currency) | `BalanceEffects.checkJournal` via `prepareJournalData.ts:52-63` | **High** on the UI write path | **Bypassed by import** (`ImportRepository.batchInsert`) |
| 2 | A journal has ≥2 lines and ≥2 distinct accounts | `journalSaveHelpers.ts:39-50`, `JournalValidation.ts:8-16` | High | Bypassed by import |
| 3 | A balance equals the signed sum of its transactions | *Definition*: `BalanceEffects.foldBalances`. *Served from* the `running_balance` cache | **Medium** — converges, but can be stale | Stale reads feed `adjustBalance` (ADR-0002) |
| 4 | `running_balance` is a cache, never truth | `schema.ts`, rebuild + integrity services | High | Read directly by `BalanceService.ts:372` |
| 5 | Only `POSTED`/`REVERSED` affect balances | `ACTIVE_JOURNAL_STATUSES` (`utils/journalStatus.ts:3`) | High | Import coerces unknown statuses to `POSTED` |
| 6 | Normal-balance sign rules (ASSET/EXPENSE debit-positive, etc.) | `BalanceEffects.signFor/effect` | High, but **duplicated in raw SQL** `CASE` strings and a binary multiplier | TS and SQL can drift silently |
| 7 | Soft-deleted rows are excluded everywhere | `deleted_at IS NULL` across queries | High | — |
| 8 | Money arithmetic is rounded at every boundary | `src/utils/money.ts` | Medium — **discipline-based, not enforced** | `Money.multiply` doesn't round; ADR-0003 |
| 9 | Cross-currency aggregates use a consistent rate | `convertAmount` (`currencyConversion.ts`) on read paths; write path still uses stored `exchange_rate` in `checkJournal` | **Medium** — parity improved; historical vs spot policy still matters | Mis-revaluation if spot used where historical rate is required (ADR-0005) |
| 10 | Every mutation is audit-logged | `ledgerWriteService`, `accountDomainService` | Medium | Import and integrity repairs are not logged |
| 11 | Referential integrity (no FKs in SQLite) | Null-`account_id` scan in integrity service | Medium | Deleting an account **orphans its transactions** |
| 12 | SMS ingestion is idempotent | fingerprint + `original_sms_id` + processed-id set | Medium | Sub-threshold duplicates can auto-post |

**The two invariants to fix first: #9 (silently wrong numbers) and #1's import
bypass (persisting unbalanced books).**

---

## 6. State ownership

| State | Owner |
|---|---|
| Ledger data | WatermelonDB, observed via `useObservable` / `usePaginatedObservable` |
| Balances | `BalanceService` (cache) + `IntegrityService` (reconciliation) |
| Safe-to-Spend | `SafeToSpendReadModel.forWorkplace(id).watch()/watchHeadline()/preWarm()` |
| Simulation | `CashFlowSimulationService` (accepts a `SimulationInput` DTO) |
| UI/ephemeral | `UIContext` — must stay free of ledger math |
| Active workplace | `WorkplaceContext` |
| Preferences | Domain-split preference modules over MMKV |

`NotificationService` no longer owns Safe-to-Spend; that façade was removed.

---

## 7. Conventions (as actually practised)

| Topic | Reality | Direction |
|---|---|---|
| File naming | **Three** conventions coexist: 370 PascalCase, 181 camelCase, 33 kebab-case; 18 directories mix ≥2 | PascalCase for classes/components, camelCase otherwise. Rename the 33 kebab files |
| Test location | 92 in `__tests__/`, 9 co-located | `__tests__/` wins |
| Feature folders | Shape is a **maximum**, not a minimum; only 2 of 14 use all four subfolders | Fine as-is; don't force empty folders |
| Money math | `src/utils/money.ts` only | Never raw `+`/`-`/`*` on amounts |
| Logging | `src/utils/logger.ts` | ~9 raw `console.*` calls remain |
| Business logic | `src/services/`, not in hooks | Several 400–600 LOC view-models still hold rules |

---

## 8. Developer workflow

```bash
bun install              # bun, not npm — bun.lock is committed and CI uses bun
cp .env.example .env.local   # optional; the app runs without any values
npx expo start

bun run typecheck        # tsc --noEmit  (~6s)
bun run test             # jest          (~10s)
bun run lint             # expo lint     (~25s)
bun run verify           # all three
```

**Two DX assets that are easy to miss:**

- **Demo data without credentials** — Settings → Data Management → "Setup Demo
  Workspace" seeds a realistic, isolated workspace via `MockDataSeederService`
  and leaves existing data untouched. This is the fastest way to see the app.
- **Component gallery** at the `_design-preview` route.

---

## 9. Technical debt register

Ordered by expected return, not severity alone. P0 = do now. **Resolved items** (2026-07-25): FX (`convertAmount`, `getRateSafe` removed), import validation + staged restore + pre-backup, privacy/analytics, export completeness, migration smoke test, account-delete guard, integrity repair audit log.

| P | Item | Evidence | Effort |
|---|---|---|---|
| ~~**P0**~~ | ~~Silent FX parity~~ — **fixed** | `currencyConversion.ts`, ADR-0005 | — |
| ~~**P0**~~ | ~~Restore wipes before insert~~ — **fixed** (staging + swap, ADR-0006) | `importStaging.ts`, `ImportService.ts` | — |
| ~~**P0**~~ | ~~Import bypasses `checkJournal`~~ — **fixed** | `validateImportedData` | — |
| ~~**P0**~~ | ~~Analytics amounts + session replay~~ — **fixed** | `analytics-service.ts`, `PRIVACY.MD` | — |
| ~~**P1**~~ | ~~Zero migration tests~~ — **smoke test** | `migrations.test.ts` + CI step | — |
| **P1** | Journal post/revert/recover is 0% covered | `ledgerWriteService.ts:244-420` | M |
| **P1** | `checkJournal` is mocked to always-valid in journal save tests | `JournalService.test.ts:44-49` | S |
| **P1** | Export is single-workplace only | `export-service.ts` + `workplaceDataTables.ts` | M — “export all workplaces” or documented workaround |
| **P1** | Secrets behind `EXPO_PUBLIC_` (bundled): `SENTRY_AUTH_TOKEN`, `HF_TOKEN` | `.env*` | S — rotate |
| **P1** | `metro.config.js` resolves 5 **undeclared** packages by absolute path; `rxjs` used in 56 files is a transitive | `metro.config.js:21-50` | S |
| **P1** | `reset-project` script can delete `app/` and `scripts/` | `package.json:7` | S — delete |
| **P1** | `eas.json` submit points at `google-services.json` (a Firebase config, not a Play service-account key) | `eas.json` | S |
| **P2** | Sign rules duplicated between TS and raw SQL `CASE` strings | `balanceSignParity.test.ts` guards drift; full codegen optional | M |
| **P2** | Two "is this journal balanced?" rules with different epsilons | `JournalCalculator.ts:73-78` vs `checkJournal` | S |
| ~~**P2**~~ | ~~Deleting an account orphans its transactions~~ — **blocked at service** | `accountDomainService.deleteAccount` | — |
| **P2** | Integrity repairs are invisible to the audit log | `integrity-service.ts:457-472` | S |
| **P2** | Swallowed errors on balance/report/FX read paths | `reactiveAggregatedBalances.ts:116-122` + list in the audit | M |
| **P2** | Beta React Compiler in production; stable 1.0.0 available | `package.json` | S |
| **P2** | `AppText` (142 files) vs design-system `Text` (10) — incompatible variant vocabularies | — | M |
| **P2** | Import is hand-written while export is schema-driven → ~8–12 touchpoints per new field | `ImportRepository` | L |
| **P3** | 9 orphan files, 19 dead exports, abandoned bun-test scaffolding | see Dead Code register | S |
| **P3** | Committed `android/`+`ios/` alongside 20 config plugins → plugins inert on EAS | `expo-doctor` CNG warning | M |

---

## 10. Dead code register

| Item | Evidence |
|---|---|
| 9 orphan files (~301 LOC) incl. `ReconciliationRepository.ts` (133 LOC, never wired to UI), `SmsImportSheet.tsx` (tombstone modal), `types/routes.ts`, `AccountingConstants.ts` | zero importers, verified by a full import-resolution graph |
| 19 dead exports (~120 LOC) | name appears nowhere outside its own file |
| 9 `dateUtils` functions alive only via their own tests | zero production callers |
| `bun-preload.ts` + `bunfig.toml` + empty `tests/` | abandoned bun-test scaffolding; jest is the runner |
| `src/utils/money.test.ts` (duplicate of `__tests__/money.test.ts`; both execute) | `jest --listTests` |
| `test-money.ts`, `screenshot.png`, `ivyWalletLink` (symlink to an absolute home path — breaks every other clone) | `git ls-files` |
| 10 unused packages | see §11 |
| Stale docs: `Phase3_Production_Readiness.md` (describes `llama.rn`, since replaced), `docs/SIMULATION_V2_NATIVE_MIGRATION.md` (its target symbol no longer exists) | greps return 0 |

**Not dead** (verified, do not delete): `src/mocks/NativeNitroModulesMock.ts` is
referenced by absolute path in `metro.config.js`; all `app/` routes; all
platform-suffixed files. `BalanceEffects` / `JournalCalculator` /
`accountingHelpers` are **not** duplicates — only `JournalCalculator.isBalanced`
and `calculateAccountPeriodFlows` overlap.

---

## 11. Dependency notes

**Remove (verified unused):** `nitrogen`, `expo-insights`, `expo-symbols`,
`@react-native/metro-config`, `react-native-bundle-visualizer`, `ts-jest`,
`jest-environment-jsdom`, `@babel/plugin-proposal-class-properties`,
`eslint-plugin-react-compiler`, `eslint-plugin-react-native`, and the
`zod-validation-error` override.

**Declare (imported but undeclared):** `rxjs` (56 files), `@expo/config-plugins`
(5 files), `@craftzdog/react-native-buffer`, `events`, `readable-stream`, `util`,
`tslib`, `source-map-explorer` (dev).

**Pin:** `@react-native-community/cli` is `"latest"` — a reproducibility hazard.

**Delete the root `postinstall`.** `react-native-litert-lm` already ships its own
guarded `postinstall`; ours calls the raw script directly and bypasses its macOS/
CI/skip guards, so it attempts a macOS-only download on Linux CI.

**Bus-factor risk:** `@lovesworking/watermelondb-expo-plugin-sdk-52-plus` is a
single-maintainer personal fork, named for SDK 52, on the config-plugin path for
the entire database layer, while the app is on SDK 57.

---

## 12. Feature-cost model

Measured by tracing eight realistic future features.

| Feature | Migration? | Effort | Regression risk |
|---|---|---|---|
| Split transactions | No | S (3–5d) | Low — the ledger already supports N-line journals |
| FX correctness fix | No | M (5–8d) | Medium — figures change (that's the fix) |
| Reporting additions | No | S–M | Low |
| Recurring improvements | Maybe | M–L | Medium — date/DST edges |
| Budget rollover | Yes | M–L | Medium–High — couples to Safe-to-Spend |
| Reconciliation (cleared flags) | Yes | M–L | Medium |
| Attachments | Yes | L | Medium–High — backup/restore size |
| Cloud sync | Likely | XL (6–12+ weeks) | High |

**Cost of adding one field to a transaction: ~8–12 touchpoints.** The tax is
concentrated in import (hand-written per entity, plus three plugins) and raw SQL
select lists. Export is schema-driven and mostly free.

**Cloud-sync readiness:** timestamps, soft deletes and UUID client IDs exist, but
there is no `synchronize()` usage, custom `deleted_at` tombstones diverge from
WatermelonDB's own deleted-record protocol, `currencies`/`exchange_rates` are not
workplace-scoped, and denormalised caches (`total_amount`, `running_balance`)
would need post-sync rebuilds. Sync is feasible but is a genuine project, not a
feature.

---

## 13. Known risks

1. **Multi-workplace backup gap** — export/import targets one workplace; disaster
   recovery for multiple workplaces is manual.
2. **Migration harness is smoke-only** — `migrations.test.ts` guards version 28 on
   Loki; there is no v1→v28 fixture suite yet. A bad migration is still hard to
   hotfix.
3. **WatermelonDB on New Architecture** — `expo-doctor` warns; pre-release WM
   version behind a personal-fork config plugin (SDK 52-named fork on SDK 57).
4. **Bus factor of one** on the database plugin fork and deep simulation domain.
5. **`bun run verify`** — typecheck, Jest with coverage thresholds, lint (must be green before merge).

---

## 14. Refactoring roadmap

**Now (days, low risk)** — mostly done in this pass
- ✅ Green test suite; CI gate on typecheck+test+lint; `.env.example`
- Validate journals on import; add missing export tables; rotate bundled tokens
- Remove the `reset-project` footgun and the redundant `postinstall`

**Next (weeks)**
- Migration fixture harness (v1 → v28) beyond the current smoke test
- Multi-workplace export strategy (product + engineering)

**Then (a quarter)**
- Generate the SQL sign rules from the TS sign table (parity test exists; codegen optional)
- Collapse `AppText` onto the design-system `Text`
- Deepen import schema-driven path (registry started in Phase 4)

**Deliberately not doing**
- Rewriting the simulation engine (well-tested, genuinely deep — protect it)
- Migrating money to integer minor units before a migration harness exists
- New architectural layers or ports without a second real adapter

---

## 15. What is genuinely good — protect this

- **Machine-enforced feature boundaries** in `eslint.config.js`, with 0 errors.
- **The simulation engine**: 12 test files, ~86–91% coverage, real invariant
  checks (`FlowInvariants.ts` at 100%). The best-tested subsystem.
- **Clean typecheck** in 6s with `strict` + `noUnusedLocals`.
- **Centralised money helpers** and a single ledger write path
  (`ledgerWriteService` + `prepareJournalData` + `BalanceEffects`).
- **Real seams** with genuine multiple adapters: `ImportPlugin`, `ShareProvider`,
  `PipelineStep`, `TransactionExtractor`.
- **Very low comment debt**: 4 TODOs, 0 FIXME/HACK across ~107k LOC.
- **`MockDataSeederService`** reachable from the UI — excellent onboarding tool.

> The pattern worth internalising: **this codebase obeys every rule that is
> machine-checked and drifts on every rule that is only written down.** The
> highest-leverage fix is almost always to convert a written rule into a checked
> one.
