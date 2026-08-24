# Architecture Audit and Refactor Ledger

Status: complete

This is the durable record for the repository-wide architecture audit completed on 2026-08-24 and the refactors that followed from it. The roadmap is closed; this file is the canonical summary. Historical work-package audits retain their original evidence and target snapshots.

## Baseline

- Application/source files accounted for: 1,194
- Production files: 934
- Test files: 260
- Blocked or unaccounted files: 0
- Architecture checks: passing
- Typecheck: passing
- Lint: passing
- Jest: 260 suites, 1,582 tests passing, 1 skipped

Generated artifacts, dependencies, worktrees, Expo caches, coverage, native build output, Pods, and `.cxx` output are excluded from the source inventory.

## Architecture discovered

```text
Expo Router routes
  -> feature public barrels
  -> feature screens and view-model hooks
  -> domain services
  -> repositories
  -> WatermelonDB / SQLite
```

The app is offline-first and workplace-scoped. Accounting is ledger-first: balances, reports, budgets, and Safe to Spend are derived from journal data and rebuildable projections.

## Refactor findings

### F-01 — P1 — Journal/Accounts feature cycle

The dependency graph contains a 31-file Journal <-> Accounts cycle through public barrels. Journal consumes account pickers and account hooks; Accounts consumes journal list hooks and modals.

Action: INVERT DEPENDENCY.

Target shape: neutral account-selection primitives and explicit journal-list contracts. Feature screens must not import each other's full public barrel.

Primary files:

- `src/features/journal/index.ts`
- `src/features/accounts/index.ts`
- `src/features/journal/entry/hooks/useJournalEntryShell.ts`
- `src/features/accounts/hooks/useAccountDetailsViewModel.ts`
- `src/features/accounts/components/AccountDetailsView.tsx`

### F-02 — P1 — Constants depend on UI implementation

`src/constants/defaults.ts` imports `IconMap` from `AppIcon`, which depends on theme hooks and UI context. Constants therefore depend upward into React presentation.

Action: INVERT DEPENDENCY.

Target shape: neutral icon definitions consumed by both defaults and `AppIcon`.

### F-03 — P2 — Universal domain type hub

`src/types/domain.ts` is a 284-line umbrella module with 473 production importers. It combines IDs, enums, DTOs, read models, journal types, account types, and SMS/import types.

Action: SPLIT.

Target shape: domain-specific type modules with narrow imports and no broad umbrella re-export dependency.

### F-04 — P2 — Fragmented reactive cache ownership

Reactive state is cached independently by `ReactiveDataService`, `reactiveAggregatedBalances`, and `reactiveWorkplaceObserves`, with separate eviction and invalidation APIs.

Action: MERGE.

Target shape: one reactive cache coordinator owning keyed streams, disposal, workplace eviction, and mutation invalidation.

### F-05 — P2 — Multi-table import repository

`src/data/repositories/ImportRepository.ts` is a 613-line repository mapping roughly ten tables while also owning chunking, progress, and import-specific raw-field conversion.

Action: SPLIT.

Target shape: import batch coordinator plus table-family writers under the same transaction boundary.

## Execution order

### Phase 1 — Integrity

1. Break the Journal/Accounts cycle.
2. Move icon definitions below both constants and UI.
3. Add a dependency-cycle guard to architecture checks.

### Phase 2 — Structural

1. Centralize reactive cache ownership.
2. Split the import repository by table family.
3. Partition `domain.ts` into domain-owned type modules.

### Phase 3 — Cleanup

1. Remove umbrella type imports incrementally.
2. Remove obsolete barrel exports.
3. Add lifecycle tests for cache eviction and invalidation.

## Change ledger

| Commit | Scope | Verification | Status |
|---|---|---|---|
| `2575e89` | Audit and refactor plan | Repository inventory and baseline checks recorded | complete |
| `6991e01c` | Break Journal/Accounts feature cycle with a narrow account-selection capability module | Feature-boundary check and typecheck pass | complete |
| `e83265fe` | Move icon definitions out of `AppIcon` and remove constants → UI coupling | Focused icon tests, lint, Prettier, architecture/typecheck pass | complete |
| `9d38da8c` | Centralize reactive cache ownership and lifecycle invalidation | Focused reactive tests, typecheck, lint, Prettier pass | complete |
| `37fe441c` | Partition the universal domain type hub into account, journal, and read-model modules | Architecture checks, typecheck, lint, Prettier pass | complete |
| `0e605431` | Isolate ImportRepository value-conversion policies | ImportRepository tests 3/3, typecheck, lint, Prettier pass | complete |
| `a4aafff4` | Extract incremental sync change application | Architecture checks, typecheck, lint, focused import tests pass | complete |
| `ba972001` | Extract core account, journal, and transaction writers | Architecture checks, typecheck, lint, focused import tests pass | complete |
| `0e2b84c7` | Make ImportRepository a thin batch/sync coordinator with auxiliary table-family writers | Full architecture checks, typecheck, lint, focused import tests, and full Jest pass | complete |
| `ff0f7a5d` | Remove production imports from the domain compatibility barrel | Zero production barrel imports; full Jest, typecheck, lint, and architecture checks pass | complete |
| `d08d244d` | Add dependency-cycle guard with a ratcheted baseline | `check:architecture` and full `verify` pass; 4 existing cycles baselined | complete |
| `2f49477e` | Remove the obsolete domain compatibility barrel and migrate all remaining consumers | No repository references to `src/types/domain`; full Jest, typecheck, lint, and architecture checks pass | complete |

## Current enforcement

- `bun run check:architecture` includes the dependency-cycle guard.
- The cycle guard ratchets four documented legacy cycles; new cycles fail the check.
- `bun run verify` is the canonical full verification command.

## Rules

- Do not push.
- Keep commits small and single-purpose.
- Do not combine independent actions in one finding or commit.
- Run targeted tests after each refactor and the full architecture/typecheck/lint/test suite before handoff.
